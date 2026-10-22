package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
)

func TestHealthAndReadinessWhenDatabaseDown(t *testing.T) {
	db, err := sql.Open("postgres", "postgres://invalid:invalid@127.0.0.1:1/invalid?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppEnv: "test", UploadDir: t.TempDir(), JWTSecret: []byte("0123456789abcdef0123456789abcdef")}
	r, err := newRouter(cfg, db, dbgen.New(db))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path string
		want int
	}{{"/healthz", http.StatusOK}, {"/readyz", http.StatusServiceUnavailable}, {"/health", http.StatusServiceUnavailable}} {
		t.Run(tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
		})
	}
}
