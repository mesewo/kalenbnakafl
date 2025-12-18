package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Profile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
		"role":    role,
	})
}
