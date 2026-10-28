package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/internal/storage"
	"kalenbnakafl/routes"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error_type", fmt.Sprintf("%T", err))
		os.Exit(1)
	}
}

func corsMiddleware(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		for _, value := range origins {
			if strings.TrimSpace(value) == origin && origin != "" {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Vary", "Origin")
				break
			}
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func newRouter(cfg config.Config, db *sql.DB, q *dbgen.Queries, mediaStorage storage.Storage) (*gin.Engine, error) {

	if strings.EqualFold(cfg.AppEnv, "production") {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(httpx.RequestID(), httpx.TrustedForwardedClientIP(cfg.ForwardedHeadersSecret), httpx.AccessLog(), httpx.Recovery(), httpx.BodyLimit(1<<20, cfg.MediaMaxMB*1024*1024+(1<<20)))
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		return nil, fmt.Errorf("configure trusted proxies: %w", err)
	}
	r.Use(corsMiddleware(cfg.CORSOrigins))
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	ready := func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := database.Ping(ctx, db); err != nil {
			httpx.Logger(c).Error("readiness check failed", "operation", "database")
			httpx.Write(c, http.StatusServiceUnavailable, "internal", "Service unavailable.", nil)
			return
		}
		if err := mediaStorage.Check(ctx); err != nil {
			httpx.Logger(c).Error("readiness check failed", "operation", "storage", "error_type", fmt.Sprintf("%T", err))
			httpx.Write(c, http.StatusServiceUnavailable, "internal", "Service unavailable.", nil)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/readyz", ready)
	r.GET("/health", ready)
	r.NoRoute(func(c *gin.Context) { httpx.Fail(c, http.StatusNotFound, "Not found") })
	if cfg.StorageDriver == "local" {
		if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
			return nil, fmt.Errorf("create upload directory: %w", err)
		}
	}
	r.GET("/uploads/*filepath", uploadFileHandler(mediaStorage))
	r.HEAD("/uploads/*filepath", uploadFileHandler(mediaStorage))
	routes.SetupRoutes(r, q, db, cfg, mediaStorage)
	return r, nil
}

func uploadFileHandler(store storage.Storage) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
		c.Header("Cache-Control", "public, max-age=86400, immutable")
		name := strings.TrimPrefix(c.Param("filepath"), "/")
		file, metadata, err := store.Open(c.Request.Context(), name)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.NotFound(c.Writer, c.Request)
				return
			}
			httpx.Logger(c).Error("open served media object", "error_type", fmt.Sprintf("%T", err))
			httpx.Internal(c, "Could not read media")
			return
		}
		defer func() {
			if err := file.Close(); err != nil {
				httpx.Logger(c).Error("close served media file", "error_type", fmt.Sprintf("%T", err))
			}
		}()
		if metadata.ContentType != "" {
			c.Header("Content-Type", metadata.ContentType)
		}
		http.ServeContent(c.Writer, c.Request, name, metadata.ModTime, file)
	}
}
func configureLogger(appEnv string) {
	if strings.EqualFold(appEnv, "production") {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
		return
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))
}
func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	configureLogger(cfg.AppEnv)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	mediaStorage, err := storageForConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("configure media storage: %w", err)
	}
	db, q, err := database.Connect(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("close database pool", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	if cfg.MigrateOnStart {
		if err := database.Migrate(ctx, db); err != nil {
			return fmt.Errorf("migrate database: %w", err)
		}
	}
	if err := database.BootstrapAdmin(ctx, q, cfg); err != nil {
		return err
	}
	go database.RunRefreshTokenCleanup(ctx, q, time.Hour)
	r, err := newRouter(cfg, db, q, mediaStorage)
	if err != nil {
		return err
	}
	server := &http.Server{
		Addr: ":" + cfg.Port, Handler: r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       120 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			serveErr <- nil
			return
		}
		serveErr <- err
	}()
	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("graceful shutdown: %w", err)
		}
		return <-serveErr
	}
}

func storageForConfig(ctx context.Context, cfg config.Config) (storage.Storage, error) {
	switch cfg.StorageDriver {
	case "local":
		return storage.NewLocal(cfg.UploadDir), nil
	case "s3":
		return storage.NewS3(ctx, storage.S3Config{
			Endpoint: cfg.S3Endpoint, Region: cfg.S3Region, Bucket: cfg.S3Bucket,
			AccessKeyID: cfg.S3AccessKeyID, SecretAccessKey: cfg.S3SecretAccessKey,
			PathStyle: cfg.S3PathStyle,
		})
	default:
		return nil, fmt.Errorf("unsupported storage driver %q", cfg.StorageDriver)
	}
}
