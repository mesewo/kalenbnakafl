package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type visitor struct {
	started time.Time
	count   int
}

var visitors = struct {
	sync.Mutex
	values map[string]visitor
}{values: make(map[string]visitor)}

func LimitRequests(limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		now := time.Now()
		visitors.Lock()
		current := visitors.values[key]
		if current.started.IsZero() || now.Sub(current.started) >= window {
			current = visitor{started: now}
		}
		current.count++
		visitors.values[key] = current
		allowed := current.count <= limit
		visitors.Unlock()
		if !allowed {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests. Please wait and try again."})
			c.Abort()
			return
		}
		c.Next()
	}
}
