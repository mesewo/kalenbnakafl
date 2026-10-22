package handlers

import (
	"kalenbnakafl/internal/httpx"
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
	if !httpx.BindJSON(c, &contact) || !validateText(contact.Name, 120) || !validEmail(contact.Email) || !validateText(contact.Message, 5000) {
		httpx.Fail(c, http.StatusBadRequest, "Name, valid email, and a message are required")
		return
	}
	err := a.q.CreateContact(c.Request.Context(), dbgen.CreateContactParams{
		Name: clean(contact.Name), Email: clean(contact.Email), Message: clean(contact.Message),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to submit contact message")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Your message has been received. We'll get back to you soon!"})
}
