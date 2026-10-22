package handlers

import (
	"database/sql"

	"kalenbnakafl/dbgen"
)

// API holds the database dependencies used by HTTP handlers.
type API struct {
	q  *dbgen.Queries
	db *sql.DB
}

func NewAPI(q *dbgen.Queries, db *sql.DB) *API {
	return &API{q: q, db: db}
}
