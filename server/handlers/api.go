package handlers

import (
	"database/sql"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/storage"
)

type API struct {
	q       *dbgen.Queries
	db      *sql.DB
	cfg     config.Config
	storage storage.Storage
}

func NewAPI(q *dbgen.Queries, db *sql.DB, cfg config.Config) *API {
	return &API{q: q, db: db, cfg: cfg, storage: storage.NewLocal(cfg.UploadDir)}
}
