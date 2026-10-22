package middleware

import (
	"database/sql"
	"errors"
	"kalenbnakafl/internal/httpx"
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/utils"
)

func AuthMiddleware(q *dbgen.Queries, jwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie("access_token")
		if err != nil || token == "" {
			httpx.Fail(c, http.StatusUnauthorized, "Authentication required")
			c.Abort()
			return
		}
		userID, _, err := utils.ParseToken(jwtSecret, token)
		if err != nil {
			httpx.Fail(c, http.StatusUnauthorized, "Invalid or expired session")
			c.Abort()
			return
		}
		role, err := q.GetRoleByUserID(c.Request.Context(), int32(userID))
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				httpx.Fail(c, http.StatusUnauthorized, "Account not found")
			} else {
				httpx.Fail(c, http.StatusInternalServerError, "Could not verify session")
			}
			c.Abort()
			return
		}
		c.Set("user_id", userID)
		c.Set("role", role)
		c.Next()
	}
}
