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

var DB *sql.DB
var Queries *dbgen.Queries

func Connect() {
	connStr := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(connStr) == "" {
		log.Fatal("DATABASE_URL is required")
	}
	retries := 8
	if value, err := strconv.Atoi(os.Getenv("DB_CONNECT_RETRIES")); err == nil && value > 0 {
		retries = value
	}
	var err error
	for attempt := 1; attempt <= retries; attempt++ {
		DB, err = sql.Open("postgres", connStr)
		if err == nil {
			DB.SetMaxOpenConns(25)
			DB.SetMaxIdleConns(5)
			DB.SetConnMaxLifetime(30 * time.Minute)
			err = DB.Ping()
		}
		if err == nil {
			Queries = dbgen.New(DB)
			log.Println("PostgreSQL connected")
			return
		}
		log.Printf("database unavailable (attempt %d/%d): %v", attempt, retries, err)
		time.Sleep(time.Duration(attempt) * 2 * time.Second)
	}
	log.Fatal("database connection failed: ", err)
}

func BootstrapAdmin() error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" && password == "" {
		return nil
	}
	if email == "" || len(password) < 12 {
		return errors.New("ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required together")
	}
	count, err := Queries.CountAdmins(context.Background())
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
	if err := Queries.CreateAdminIfMissing(context.Background(), dbgen.CreateAdminIfMissingParams{
		Email:    email,
		Password: string(hash),
	}); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	log.Printf("bootstrapped admin account %s", email)
	return nil
}
