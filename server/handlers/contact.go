package handlers

import (
	"net/http"

	"kalenbenakafl-api/database"

	"github.com/gin-gonic/gin"
)

type ContactMessage struct {
	Name    string `json:"name" binding:"required"`
	Email   string `json:"email" binding:"required,email"`
	Message string `json:"message" binding:"required"`
}

func CreateContact(c *gin.Context) {
	var contact ContactMessage
	if err := c.ShouldBindJSON(&contact); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	_, err := database.DB.Exec(
		`INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)`,
		contact.Name, contact.Email, contact.Message,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit contact message"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Your message has been received. We'll get back to you soon!"})
}
