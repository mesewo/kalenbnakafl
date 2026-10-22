package httpx

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const requestIDKey = "httpx.request_id"

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)

type trackedBody struct {
	io.ReadCloser
	c *gin.Context
}

func (b *trackedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) {
		b.c.Set("httpx.request_too_large", true)
	}
	return n, err
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if !validRequestID.MatchString(id) {
			var raw [16]byte
			if _, err := rand.Read(raw[:]); err != nil {
				id = strconv.FormatInt(time.Now().UnixNano(), 36)
			} else {
				id = hex.EncodeToString(raw[:])
			}
		}
		c.Set(requestIDKey, id)
		c.Writer.Header().Set("X-Request-ID", id)
		c.Next()
	}
}

func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		attrs := []any{"method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(), "latency_ms", float64(time.Since(started).Microseconds()) / 1000}
		if id, ok := c.Get("user_id"); ok {
			attrs = append(attrs, "user_id", id)
		}
		Logger(c).Info("http request", attrs...)
	}
}

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recover() != nil {
				Logger(c).Error("http panic recovered")
				if !c.Writer.Written() {
					Write(c, http.StatusInternalServerError, "internal", "An unexpected error occurred.", nil)
				}
				c.Abort()
			}
		}()
		c.Next()
	}
}

func BodyLimit(defaultLimit, uploadLimit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := defaultLimit
		if c.Request.Method == http.MethodPost && (c.FullPath() == "/api/admin/media" || c.FullPath() == "/api/editor/media") {
			limit = uploadLimit
		}
		if c.Request.Body != nil {
			c.Request.Body = &trackedBody{ReadCloser: http.MaxBytesReader(c.Writer, c.Request.Body, limit), c: c}
		}
		c.Next()
	}
}

func RequestIDValue(c *gin.Context) string {
	if id, ok := c.Get(requestIDKey); ok {
		if value, ok := id.(string); ok {
			return value
		}
	}
	return ""
}

func Logger(c *gin.Context) *slog.Logger {
	return slog.Default().With("request_id", RequestIDValue(c))
}
