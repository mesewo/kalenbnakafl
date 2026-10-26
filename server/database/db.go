package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/auth"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/i18n"
)

func Connect(ctx context.Context, cfg config.Config) (*sql.DB, *dbgen.Queries, error) {
	var lastErr error
	for attempt := 1; attempt <= cfg.DBConnectRetries; attempt++ {
		db, err := sql.Open("postgres", cfg.DatabaseURL)
		if err == nil {
			db.SetMaxOpenConns(25)
			db.SetMaxIdleConns(5)
			db.SetConnMaxLifetime(30 * time.Minute)
			err = db.PingContext(ctx)
		}
		if err == nil {
			slog.Info("PostgreSQL connected")
			return db, dbgen.New(db), nil
		}
		lastErr = err
		if db != nil {
			_ = db.Close()
		}
		slog.Warn("database unavailable", "attempt", attempt, "attempts", cfg.DBConnectRetries, "error_type", fmt.Sprintf("%T", err))
		if attempt < cfg.DBConnectRetries {
			timer := time.NewTimer(time.Duration(attempt) * 2 * time.Second)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, nil, fmt.Errorf("database connection canceled: %w", ctx.Err())
			case <-timer.C:
			}
		}
	}
	return nil, nil, fmt.Errorf("database connection failed: %w", lastErr)
}

func Ping(ctx context.Context, db *sql.DB) error {
	return db.PingContext(ctx)
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
