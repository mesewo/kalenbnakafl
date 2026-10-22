package middleware

import (
	"github.com/gin-gonic/gin"
	"kalenbnakafl/internal/httpx"
	"net/http"
)

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		value, exists := c.Get("role")
		role, ok := value.(string)
		if !exists || !ok {
			httpx.Fail(c, http.StatusForbidden, "Access denied")
			c.Abort()
			return
		}
		for _, allowed := range roles {
			if role == allowed {
				c.Next()
				return
			}
		}
		httpx.Fail(c, http.StatusForbidden, "Insufficient permissions")
		c.Abort()
	}
}
