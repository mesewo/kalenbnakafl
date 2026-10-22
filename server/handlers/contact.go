package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
)

type ContactMessage struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
}

func (a *API) CreateContact(c *gin.Context) {
	var contact ContactMessage
	if err := c.ShouldBindJSON(&contact); err != nil || !validateText(contact.Name, 120) || !validEmail(contact.Email) || !validateText(contact.Message, 5000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name, valid email, and a message are required"})
		return
	}
	err := a.q.CreateContact(c.Request.Context(), dbgen.CreateContactParams{
		Name: clean(contact.Name), Email: clean(contact.Email), Message: clean(contact.Message),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit contact message"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Your message has been received. We'll get back to you soon!"})
}
