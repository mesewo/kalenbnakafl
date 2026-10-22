package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
)

func testDatabase(t *testing.T) *sql.DB {
	t.Helper()
	dsn := config.Environment("DATABASE_URL_TEST")
	if dsn == "" {
		t.Skip("DATABASE_URL_TEST is not set; skipping PostgreSQL integration test")
	}

	base, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := base.PingContext(ctx); err != nil {
		_ = base.Close()
		t.Fatalf("ping test database: %v", err)
	}

	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		_ = base.Close()
		t.Skip("DATABASE_URL_TEST must be a postgres:// or postgresql:// URL to isolate the test schema")
	}
	schema := fmt.Sprintf("phase1_test_%d", time.Now().UnixNano())
	if _, err := base.ExecContext(ctx, `CREATE SCHEMA "`+schema+`"`); err != nil {
		_ = base.Close()
		t.Fatalf("create isolated test schema: %v", err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("postgres", parsed.String())
	if err != nil {
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
		t.Fatalf("open schema-scoped test database: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
		t.Fatalf("ping schema-scoped test database: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
	})
	return db
}

func TestMigrationsRoundTrip(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	var usersTable, emailIndex sql.NullString
	if err := db.QueryRow(`SELECT to_regclass('users')::text, to_regclass('users_email_lower_key')::text`).Scan(&usersTable, &emailIndex); err != nil {
		t.Fatalf("check migrated schema: %v", err)
	}
	if !usersTable.Valid || !emailIndex.Valid {
		t.Fatalf("migration objects missing: users=%v email index=%v", usersTable, emailIndex)
	}
	if _, err := provider.DownTo(ctx, 0); err != nil {
		t.Fatalf("roll migrations down: %v", err)
	}
	if err := db.QueryRow(`SELECT to_regclass('users')::text`).Scan(&usersTable); err != nil {
		t.Fatalf("check rolled-back schema: %v", err)
	}
	if usersTable.Valid {
		t.Fatalf("users table remains after rollback: %s", usersTable.String)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("reapply migrations: %v", err)
	}
}

func TestBootstrapAdminIsIdempotent(t *testing.T) {
	db := testDatabase(t)
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	queries := dbgen.New(db)
	t.Setenv("ADMIN_EMAIL", "Admin@Example.org")
	t.Setenv("ADMIN_PASSWORD", "a-test-password-with-length")
	cfg := config.Config{AdminEmail: config.Environment("ADMIN_EMAIL"), AdminPassword: config.Environment("ADMIN_PASSWORD")}

	if err := BootstrapAdmin(context.Background(), queries, cfg); err != nil {
		t.Fatalf("bootstrap first admin: %v", err)
	}
	if err := BootstrapAdmin(context.Background(), queries, cfg); err != nil {
		t.Fatalf("bootstrap second admin: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&count); err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one admin after repeated bootstrap, got %d", count)
	}
	var email string
	if err := db.QueryRow(`SELECT email FROM users WHERE role = 'admin'`).Scan(&email); err != nil {
		t.Fatalf("read bootstrap email: %v", err)
	}
	if strings.ToLower(email) != "admin@example.org" {
		t.Fatalf("expected normalized bootstrap email, got %q", email)
	}
}
