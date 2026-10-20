package db

import "embed"

// FS contains the goose SQL migrations shipped with the API.
//
//go:embed migrations/*.sql
var FS embed.FS
