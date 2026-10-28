package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/storage"
)

func TestHealthAndReadinessWhenDatabaseDown(t *testing.T) {
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	db, err := sql.Open("postgres", "postgres://invalid:invalid@127.0.0.1:1/invalid?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppEnv: "test", UploadDir: t.TempDir(), JWTSecret: []byte("0123456789abcdef0123456789abcdef")}
	r, err := newRouter(cfg, db, dbgen.New(db), storage.NewLocal(cfg.UploadDir))
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

func TestUploadedFileHeadersRangeAndNoDirectoryListing(t *testing.T) {
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	dir := t.TempDir()
	storedName := strings.Repeat("a", 32) + ".mp4"
	content := []byte("0123456789abcdef")
	if err := os.WriteFile(filepath.Join(dir, storedName), content, 0600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("postgres", "postgres://invalid:invalid@127.0.0.1:1/invalid?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppEnv: "test", UploadDir: dir, JWTSecret: []byte("0123456789abcdef0123456789abcdef")}
	r, err := newRouter(cfg, db, dbgen.New(db), storage.NewLocal(cfg.UploadDir))
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+storedName, nil)
	req.Header.Set("Range", "bytes=2-5")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusPartialContent || w.Body.String() != "2345" {
		t.Fatalf("range status=%d body=%q", w.Code, w.Body.String())
	}
	for key, want := range map[string]string{"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "public, max-age=86400, immutable"} {
		if got := w.Header().Get(key); got != want {
			t.Errorf("%s=%q want %q", key, got, want)
		}
	}
	head := httptest.NewRecorder()
	r.ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/uploads/"+storedName, nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD status=%d body=%q", head.Code, head.Body.String())
	}
	if head.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("HEAD missing security headers: %v", head.Header())
	}
	listing := httptest.NewRecorder()
	r.ServeHTTP(listing, httptest.NewRequest(http.MethodGet, "/uploads/", nil))
	if listing.Code != http.StatusNotFound || strings.Contains(listing.Body.String(), storedName) {
		t.Fatalf("directory URL exposed a listing: status=%d body=%s", listing.Code, listing.Body)
	}
}
