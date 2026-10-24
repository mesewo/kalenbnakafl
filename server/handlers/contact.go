package handlers

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/models"
)

type ContactMessage struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
}

type ContactMessageDTO struct {
	ID            int32      `json:"id"`
	Name          string     `json:"name"`
	Email         string     `json:"email"`
	Message       string     `json:"message"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	HandledByName string     `json:"handled_by_name"`
	HandledAt     *time.Time `json:"handled_at,omitempty"`
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

func (a *API) ListContactMessages(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "new" && status != "read" && status != "replied" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "Status must be new, read, or replied")
		return
	}
	page, limit, offset := pageArgs(c)
	statusArg := sql.NullString{String: status, Valid: status != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListContactMessages(ctx, dbgen.ListContactMessagesParams{
		Status: statusArg, RowOffset: offset, PageSize: int32(limit),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch contact messages")
		return
	}
	total, err := a.q.CountContactMessages(ctx, statusArg)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to count contact messages")
		return
	}
	items := make([]ContactMessageDTO, 0, len(rows))
	for _, row := range rows {
		var handledAt *time.Time
		if row.HandledAt.Valid {
			value := row.HandledAt.Time
			handledAt = &value
		}
		items = append(items, ContactMessageDTO{
			ID: row.ID, Name: row.Name, Email: row.Email, Message: row.Message,
			Status: row.Status, CreatedAt: row.CreatedAt,
			HandledByName: row.HandledByName, HandledAt: handledAt,
		})
	}
	c.JSON(http.StatusOK, models.Page[ContactMessageDTO]{Items: items, Page: page, Limit: limit, Total: total})
}

func (a *API) UpdateContactMessageStatus(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Invalid input")
		return
	}
	if input.Status != "read" && input.Status != "replied" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "Status must be read or replied")
		return
	}
	userID, exists := c.Get("user_id")
	requesterID, valid := userID.(int)
	if !exists || !valid || requesterID < 1 {
		httpx.Fail(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	rows, err := a.q.UpdateContactMessageStatus(c.Request.Context(), dbgen.UpdateContactMessageStatusParams{
		Status: input.Status, HandledBy: sql.NullInt32{Int32: int32(requesterID), Valid: true}, ID: int32(id),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not update contact message")
		return
	}
	if rows == 0 {
		httpx.Fail(c, http.StatusNotFound, "Contact message not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contact message updated"})
}
