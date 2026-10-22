package handlers

import (
	"database/sql"

	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
)

// API holds the database and runtime configuration used by HTTP handlers.
type API struct {
	q   *dbgen.Queries
	db  *sql.DB
	cfg config.Config
}

func NewAPI(q *dbgen.Queries, db *sql.DB, cfg config.Config) *API {
	return &API{q: q, db: db, cfg: cfg}
}
