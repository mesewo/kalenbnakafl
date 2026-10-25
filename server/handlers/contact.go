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
		httpx.Fail(c, http.StatusBadRequest, "contact.name_valid_email_and_a_message_are_required")
		return
	}
	err := a.q.CreateContact(c.Request.Context(), dbgen.CreateContactParams{
		Name: clean(contact.Name), Email: clean(contact.Email), Message: clean(contact.Message),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "contact.failed_to_submit_contact_message")
		return
	}
	httpx.Success(c, http.StatusCreated, "contact.your_message_has_been_received_we_ll_get_back_to_you_soon")
}

func (a *API) ListContactMessages(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "new" && status != "read" && status != "replied" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "contact.status_must_be_new_read_or_replied")
		return
	}
	page, limit, offset := pageArgs(c)
	statusArg := sql.NullString{String: status, Valid: status != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListContactMessages(ctx, dbgen.ListContactMessagesParams{
		Status: statusArg, RowOffset: offset, PageSize: int32(limit),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "contact.failed_to_fetch_contact_messages")
		return
	}
	total, err := a.q.CountContactMessages(ctx, statusArg)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "contact.failed_to_count_contact_messages")
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
	if int64(id) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusNotFound, "contact.not_found")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "contact.invalid_input")
		return
	}
	if input.Status != "read" && input.Status != "replied" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "contact.status_must_be_read_or_replied")
		return
	}
	userID, exists := c.Get("user_id")
	requesterID, valid := userID.(int)
	if !exists || !valid || requesterID < 1 {
		httpx.Fail(c, http.StatusUnauthorized, "contact.authentication_required")
		return
	}
	rows, err := a.q.UpdateContactMessageStatus(c.Request.Context(), dbgen.UpdateContactMessageStatusParams{
		Status: input.Status, HandledBy: sql.NullInt32{Int32: int32(requesterID), Valid: true}, ID: int32(id),
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "contact.could_not_update_contact_message")
		return
	}
	if rows == 0 {
		httpx.Fail(c, http.StatusNotFound, "contact.not_found")
		return
	}
	httpx.Success(c, http.StatusOK, "contact.updated")
}
