package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
	dbmigrations "kalenbnakafl/db"
)

// Migrate applies all pending embedded schema migrations while holding a
// PostgreSQL session advisory lock, so concurrent API instances serialize.
func Migrate(ctx context.Context, db *sql.DB) error {
	provider, err := newMigrationProvider(db)
	if err != nil {
		return fmt.Errorf("create migration provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply database migrations: %w", err)
	}
	return nil
}

func newMigrationProvider(db *sql.DB) (*goose.Provider, error) {
	migrationFS, err := fs.Sub(dbmigrations.FS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open embedded migrations: %w", err)
	}
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("create migration locker: %w", err)
	}
	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		migrationFS,
		goose.WithSessionLocker(locker),
	)
	if err != nil {
		return nil, fmt.Errorf("create migration provider: %w", err)
	}
	return provider, nil
}
