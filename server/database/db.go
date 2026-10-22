package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
)

func Connect() (*sql.DB, *dbgen.Queries, error) {
	connStr := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(connStr) == "" {
		return nil, nil, errors.New("DATABASE_URL is required")
	}
	retries := 8
	if value, err := strconv.Atoi(os.Getenv("DB_CONNECT_RETRIES")); err == nil && value > 0 {
		retries = value
	}
	var lastErr error
	for attempt := 1; attempt <= retries; attempt++ {
		db, err := sql.Open("postgres", connStr)
		if err == nil {
			db.SetMaxOpenConns(25)
			db.SetMaxIdleConns(5)
			db.SetConnMaxLifetime(30 * time.Minute)
			err = db.Ping()
		}
		if err == nil {
			log.Println("PostgreSQL connected")
			return db, dbgen.New(db), nil
		}
		lastErr = err
		if db != nil {
			_ = db.Close()
		}
		log.Printf("database unavailable (attempt %d/%d): %v", attempt, retries, err)
		if attempt < retries {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
	}
	return nil, nil, fmt.Errorf("database connection failed: %w", lastErr)
}

func Ping(ctx context.Context, db *sql.DB) error {
	return db.PingContext(ctx)
}

func BootstrapAdmin(ctx context.Context, q *dbgen.Queries) error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	password := os.Getenv("ADMIN_PASSWORD")
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
