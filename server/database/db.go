package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
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
			log.Println("PostgreSQL connected")
			return db, dbgen.New(db), nil
		}
		lastErr = err
		if db != nil {
			_ = db.Close()
		}
		log.Printf("database unavailable (attempt %d/%d): %v", attempt, cfg.DBConnectRetries, err)
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
	if email == "" || len(password) < 12 {
		return errors.New("ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required together")
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
	log.Printf("bootstrapped admin account %s", email)
	return nil
}
