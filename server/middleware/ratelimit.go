package middleware

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"kalenbnakafl/internal/httpx"

	"github.com/gin-gonic/gin"
)

type Limiter interface {
	Allow(key string, limit int, window time.Duration) (bool, time.Duration)
}

type bucket struct {
	started time.Time
	count   int
}

type MemoryLimiter struct {
	mu       sync.Mutex
	entries  map[string]bucket
	capacity int
	now      func() time.Time
}

func NewMemoryLimiter(capacity int) *MemoryLimiter {
	if capacity < 1 {
		capacity = 1
	}
	return &MemoryLimiter{entries: make(map[string]bucket), capacity: capacity, now: time.Now}
}

func (l *MemoryLimiter) Allow(key string, limit int, window time.Duration) (bool, time.Duration) {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for existingKey, value := range l.entries {
		if now.Sub(value.started) >= window {
			delete(l.entries, existingKey)
		}
	}
	current, exists := l.entries[key]
	if !exists || now.Sub(current.started) >= window {
		if !exists && len(l.entries) >= l.capacity {
			return false, window
		}
		current = bucket{started: now}
	}
	current.count++
	l.entries[key] = current
	if current.count > limit {
		remaining := window - now.Sub(current.started)
		if remaining < time.Second {
			remaining = time.Second
		}
		return false, remaining
	}
	return true, 0
}

var defaultLimiter Limiter = NewMemoryLimiter(10000)

func LimitRequests(limit int, window time.Duration) gin.HandlerFunc {
	return LimitRequestsWithLimiter(defaultLimiter, limit, window, func(c *gin.Context) string { return c.FullPath() + "\x00" + c.ClientIP() })
}

// LimitLoginRequests keys attempts by trusted client IP and normalized email.
// It restores the request body for the handler and never logs it.
func LimitLoginRequests(limiter Limiter, limit int, window time.Duration) gin.HandlerFunc {
	return LimitRequestsWithLimiter(limiter, limit, window, func(c *gin.Context) string {
		body, err := io.ReadAll(c.Request.Body)
		c.Request.Body = io.NopCloser(strings.NewReader(string(body)))
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.Set("httpx.request_too_large", true)
		}
		var input struct {
			Email string `json:"email"`
		}
		_ = json.Unmarshal(body, &input)
		return c.ClientIP() + "\x00" + strings.ToLower(strings.TrimSpace(input.Email))
	})
}

func LimitRequestsWithLimiter(limiter Limiter, limit int, window time.Duration, key func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		keyValue := key(c)
		if tooLarge, exists := c.Get("httpx.request_too_large"); exists && tooLarge == true {
			httpx.Fail(c, http.StatusBadRequest, "Request body is too large")
			c.Abort()
			return
		}
		allowed, retryAfter := limiter.Allow(keyValue, limit, window)
		if !allowed {
			seconds := int(math.Ceil(retryAfter.Seconds()))
			if seconds < 1 {
				seconds = 1
			}
			c.Header("Retry-After", strconv.Itoa(seconds))
			httpx.Fail(c, http.StatusTooManyRequests, "Too many requests. Please wait and try again.")
			c.Abort()
			return
		}
		c.Next()
	}
}
