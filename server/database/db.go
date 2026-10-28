package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strings"
	"time"
	"unicode"

	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/auth"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/i18n"
)

func Connect(ctx context.Context, cfg config.Config) (*sql.DB, *dbgen.Queries, error) {
	connector, err := pq.NewConnector(cfg.DatabaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("configure PostgreSQL connector: %w", err)
	}
	db := sql.OpenDB(&retryConnector{
		base: connector, attempts: cfg.DBConnectRetries,
		initialBackoff: 250 * time.Millisecond, maxBackoff: 2 * time.Second,
	})
	db.SetMaxOpenConns(cfg.DBMaxOpenConns)
	db.SetMaxIdleConns(cfg.DBMaxIdleConns)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(time.Minute)
	if err := Ping(ctx, db); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			return nil, nil, fmt.Errorf("connect to PostgreSQL: %w (close: %v)", err, closeErr)
		}
		return nil, nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	slog.Info("PostgreSQL connected", "max_open_connections", cfg.DBMaxOpenConns, "max_idle_connections", cfg.DBMaxIdleConns)
	return db, dbgen.New(db), nil
}

func Ping(ctx context.Context, db *sql.DB) error {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if err := db.PingContext(ctx); err == nil {
			return nil
		} else {
			lastErr = err
			slog.Warn("PostgreSQL ping failed", "attempt", attempt, "attempts", 3, "error_type", fmt.Sprintf("%T", err))
		}
		if attempt < 3 {
			if err := waitContext(ctx, time.Duration(attempt)*150*time.Millisecond); err != nil {
				return fmt.Errorf("PostgreSQL ping canceled: %w", err)
			}
		}
	}
	return fmt.Errorf("PostgreSQL ping failed after retries: %w", lastErr)
}

type retryConnector struct {
	base           driver.Connector
	attempts       int
	initialBackoff time.Duration
	maxBackoff     time.Duration
}

func (c *retryConnector) Connect(ctx context.Context) (driver.Conn, error) {
	attempts := c.attempts
	if attempts < 1 {
		attempts = 1
	}
	backoff := c.initialBackoff
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		connection, err := c.base.Connect(ctx)
		if err == nil {
			return &retryConn{
				Conn: connection, connector: c,
			}, nil
		}
		lastErr = err
		if !retryableConnectError(err) || attempt == attempts {
			break
		}
		slog.Warn("PostgreSQL connection attempt failed", "attempt", attempt, "attempts", attempts, "error_type", fmt.Sprintf("%T", err))
		if err := waitContext(ctx, backoff); err != nil {
			return nil, fmt.Errorf("PostgreSQL connection canceled: %w", err)
		}
		backoff *= 2
		if backoff > c.maxBackoff {
			backoff = c.maxBackoff
		}
	}
	return nil, fmt.Errorf("PostgreSQL connection retries exhausted: %w", lastErr)
}

func (c *retryConnector) Driver() driver.Driver { return c.base.Driver() }

type retryConn struct {
	driver.Conn
	connector *retryConnector
	inTx      bool
}

func (c *retryConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	rows, err := c.query(ctx, func(connection driver.Conn) (driver.Rows, error) {
		queryer, ok := connection.(driver.QueryerContext)
		if !ok {
			return nil, driver.ErrSkip
		}
		return queryer.QueryContext(ctx, query, args)
	}, query)
	return rows, err
}

func (c *retryConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	result, err := c.exec(ctx, func(connection driver.Conn) (driver.Result, error) {
		execer, ok := connection.(driver.ExecerContext)
		if !ok {
			return nil, driver.ErrSkip
		}
		return execer.ExecContext(ctx, query, args)
	}, query)
	return result, err
}

func (c *retryConn) query(ctx context.Context, run func(driver.Conn) (driver.Rows, error), query string) (driver.Rows, error) {
	rows, err := run(c.Conn)
	if !shouldRetryRead(query, c.inTx, err) {
		return rows, err
	}
	return retryRead(ctx, c, err, func() (driver.Rows, error) {
		return run(c.Conn)
	})
}

func (c *retryConn) exec(ctx context.Context, run func(driver.Conn) (driver.Result, error), query string) (driver.Result, error) {
	result, err := run(c.Conn)
	if !shouldRetryRead(query, c.inTx, err) {
		return result, err
	}
	return retryRead(ctx, c, err, func() (driver.Result, error) {
		return run(c.Conn)
	})
}

func retryRead[T any](ctx context.Context, c *retryConn, previousErr error, run func() (T, error)) (T, error) {
	var zero T
	attempts := c.connector.attempts
	if attempts < 1 {
		attempts = 1
	}
	backoff := c.connector.initialBackoff
	lastErr := previousErr
	for attempt := 1; attempt < attempts; attempt++ {
		if err := waitContext(ctx, backoff); err != nil {
			return zero, fmt.Errorf("PostgreSQL read retry canceled: %w", err)
		}
		if err := c.reconnect(ctx, lastErr); err != nil {
			lastErr = err
			continue
		}
		value, err := run()
		if err == nil {
			return value, nil
		}
		lastErr = err
		if !retryableConnectError(err) {
			return zero, err
		}
		backoff *= 2
		if backoff > c.connector.maxBackoff {
			backoff = c.connector.maxBackoff
		}
	}
	return zero, fmt.Errorf("PostgreSQL idempotent read failed after retries: %w", lastErr)
}

func (c *retryConn) reconnect(ctx context.Context, previousErr error) error {
	if closeErr := c.Close(); closeErr != nil {
		slog.Warn("close failed PostgreSQL connection", "error_type", fmt.Sprintf("%T", closeErr))
	}
	connection, err := c.connector.Connect(ctx)
	if err != nil {
		return fmt.Errorf("reconnect PostgreSQL for idempotent read after %T: %w", previousErr, err)
	}
	c.Conn = connection.(*retryConn).Conn
	return nil
}

func (c *retryConn) BeginTx(ctx context.Context, options driver.TxOptions) (driver.Tx, error) {
	beginner, ok := c.Conn.(driver.ConnBeginTx)
	if !ok {
		return nil, driver.ErrSkip
	}
	tx, err := beginner.BeginTx(ctx, options)
	if err == nil {
		c.inTx = true
		return &retryTx{Tx: tx, onDone: func() { c.inTx = false }}, nil
	}
	return nil, err
}

type retryTx struct {
	driver.Tx
	onDone func()
}

func (tx *retryTx) Commit() error {
	err := tx.Tx.Commit()
	tx.onDone()
	return err
}

func (tx *retryTx) Rollback() error {
	err := tx.Tx.Rollback()
	tx.onDone()
	return err
}

func shouldRetryRead(query string, inTx bool, err error) bool {
	if err == nil || inTx {
		return false
	}
	if !isSimpleSelect(query) {
		return false
	}
	return retryableConnectError(err)
}

func isSimpleSelect(query string) bool {
	statement := strings.TrimSpace(query)
	if len(statement) < len("SELECT") || !strings.EqualFold(statement[:len("SELECT")], "SELECT") {
		return false
	}
	if len(statement) > len("SELECT") && !unicode.IsSpace(rune(statement[len("SELECT")])) {
		return false
	}
	if strings.ContainsAny(statement, ";()'\"`") ||
		strings.Contains(statement, "--") ||
		strings.Contains(statement, "/*") ||
		strings.Contains(statement, "*/") {
		return false
	}
	for _, token := range strings.FieldsFunc(statement, func(r rune) bool {
		return !unicode.IsLetter(r) && r != '_'
	}) {
		switch strings.ToUpper(token) {
		case "FOR", "INTO", "LOCK":
			return false
		}
	}
	return true
}

func retryableConnectError(err error) bool {
	if errors.Is(err, driver.ErrBadConn) || errors.Is(err, io.EOF) {
		return true
	}
	var networkErr net.Error
	if errors.As(err, &networkErr) {
		return true
	}
	var postgresErr *pq.Error
	if errors.As(err, &postgresErr) {
		return strings.HasPrefix(string(postgresErr.Code), "08") ||
			postgresErr.Code == "57P01" || postgresErr.Code == "57P02" || postgresErr.Code == "57P03"
	}
	return false
}

func waitContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func BootstrapAdmin(ctx context.Context, q *dbgen.Queries, cfg config.Config) error {
	email := strings.ToLower(strings.TrimSpace(cfg.AdminEmail))
	password := cfg.AdminPassword
	if email == "" && password == "" {
		return nil
	}
	if email == "" {
		return errors.New("ADMIN_EMAIL and ADMIN_PASSWORD are required together")
	}
	if err := auth.ValidatePassword(password, email, "Administrator"); err != nil {
		return fmt.Errorf("invalid ADMIN_PASSWORD: %s", i18n.Text("en", err.Error()))
	}
	count, err := q.CountAdmins(ctx)
	if err != nil {
		return fmt.Errorf("check admin user: %w", err)
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}
	if err := q.CreateAdminIfMissing(ctx, dbgen.CreateAdminIfMissingParams{
		Email: email, Password: string(hash),
	}); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	slog.Info("bootstrapped admin account", "email", email)
	return nil
}
