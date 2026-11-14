package handlers

import (
	"database/sql"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/revalidation"
	"kalenbnakafl/internal/storage"
	"log/slog"
)

type API struct {
	q           *dbgen.Queries
	db          *sql.DB
	cfg         config.Config
	storage     storage.Storage
	revalidator *revalidation.Client
}

func NewAPI(q *dbgen.Queries, db *sql.DB, cfg config.Config, mediaStorage storage.Storage) *API {
	return &API{
		q: q, db: db, cfg: cfg, storage: mediaStorage,
		revalidator: revalidation.New(cfg.FrontendRevalidateURL, cfg.RevalidateSecret, slog.Default()),
	}
}

func (a *API) revalidate(tags ...string) {
	a.revalidator.Notify(tags...)
}
