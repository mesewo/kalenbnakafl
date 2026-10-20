package middleware

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/utils"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie("access_token")
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}
		userID, _, err := utils.ParseToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired session"})
			c.Abort()
			return
		}
		var role string
		if err := database.DB.QueryRow(`SELECT role FROM users WHERE id=$1`, userID).Scan(&role); err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Account not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not verify session"})
			}
			c.Abort()
			return
		}
		c.Set("user_id", userID)
		c.Set("role", role)
		c.Next()
	}
}
