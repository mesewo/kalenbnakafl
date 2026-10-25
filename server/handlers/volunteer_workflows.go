package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/models"
)

type VolunteerApplicationDTO struct {
	ID           int32      `json:"id"`
	Skills       string     `json:"skills"`
	Availability string     `json:"availability"`
	Message      string     `json:"message"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
}

type VolunteerApplicationReviewDTO struct {
	ID           int32      `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Skills       string     `json:"skills"`
	Availability string     `json:"availability"`
	Message      string     `json:"message"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
	ReviewerName string     `json:"reviewer_name,omitempty"`
}

type EventAttendeeDTO struct {
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

func authenticatedUserID(c *gin.Context) (int32, bool) {
	value, exists := c.Get("user_id")
	id, ok := value.(int)
	if !exists || !ok || id < 1 || int64(id) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusUnauthorized, "Authentication required")
		return 0, false
	}
	return int32(id), true
}

func applicationDTO(row dbgen.VolunteerApplication) VolunteerApplicationDTO {
	var reviewedAt *time.Time
	if row.ReviewedAt.Valid {
		value := row.ReviewedAt.Time
		reviewedAt = &value
	}
	return VolunteerApplicationDTO{ID: row.ID, Skills: row.Skills, Availability: row.Availability, Message: row.Message, Status: row.Status, CreatedAt: row.CreatedAt, ReviewedAt: reviewedAt}
}

func (a *API) CreateVolunteerApplication(c *gin.Context) {
	userID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	user, err := a.q.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not verify account")
		return
	}
	if user.Role != "user" {
		httpx.Fail(c, http.StatusConflict, "Only regular members can apply to volunteer")
		return
	}
	var input struct {
		Skills       string `json:"skills"`
		Availability string `json:"availability"`
		Message      string `json:"message"`
	}
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Skills and availability are required")
		return
	}
	input.Skills = clean(input.Skills)
	input.Availability = clean(input.Availability)
	input.Message = clean(input.Message)
	if !validateText(input.Skills, 2000) || !validateText(input.Availability, 1000) || len(input.Message) > 5000 {
		httpx.Fail(c, http.StatusBadRequest, "Skills and availability are required and must be within the length limits")
		return
	}
	err = a.q.CreateVolunteerApplication(c.Request.Context(), dbgen.CreateVolunteerApplicationParams{
		UserID: userID, Skills: input.Skills, Availability: input.Availability, Message: input.Message,
	})
	if err != nil {
		var postgresErr *pq.Error
		if errors.As(err, &postgresErr) && postgresErr.Code == "23505" {
			httpx.Fail(c, http.StatusConflict, "A volunteer application already exists")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Could not submit volunteer application")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Volunteer application submitted"})
}

func (a *API) GetMyVolunteerApplication(c *gin.Context) {
	userID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	row, err := a.q.GetMyVolunteerApplication(c.Request.Context(), userID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Volunteer application not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not fetch volunteer application")
		return
	}
	c.JSON(http.StatusOK, applicationDTO(row))
}

func (a *API) ListVolunteerApplications(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "pending" && status != "approved" && status != "declined" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "Status must be pending, approved, or declined")
		return
	}
	page, limit, offset := pageArgs(c)
	statusArg := sql.NullString{String: status, Valid: status != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListVolunteerApplications(ctx, dbgen.ListVolunteerApplicationsParams{Status: statusArg, RowOffset: offset, PageSize: int32(limit)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not fetch volunteer applications")
		return
	}
	total, err := a.q.CountVolunteerApplications(ctx, statusArg)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not count volunteer applications")
		return
	}
	items := make([]VolunteerApplicationReviewDTO, 0, len(rows))
	for _, row := range rows {
		var reviewedAt *time.Time
		if row.ReviewedAt.Valid {
			value := row.ReviewedAt.Time
			reviewedAt = &value
		}
		items = append(items, VolunteerApplicationReviewDTO{ID: row.ID, Name: row.Name, Email: row.Email, Skills: row.Skills, Availability: row.Availability, Message: row.Message, Status: row.Status, CreatedAt: row.CreatedAt, ReviewedAt: reviewedAt, ReviewerName: row.ReviewerName})
	}
	c.JSON(http.StatusOK, models.Page[VolunteerApplicationReviewDTO]{Items: items, Page: page, Limit: limit, Total: total})
}

func (a *API) ReviewVolunteerApplication(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if int64(id) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusNotFound, "Volunteer application not found")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Invalid application status")
		return
	}
	if input.Status != "approved" && input.Status != "declined" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "Status must be approved or declined")
		return
	}
	reviewerID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not review volunteer application")
		return
	}
	defer func() { _ = tx.Rollback() }()
	queries := a.q.WithTx(tx)
	application, err := queries.LockVolunteerApplication(ctx, int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Volunteer application not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not review volunteer application")
		return
	}
	if application.Status != "pending" {
		httpx.Fail(c, http.StatusConflict, "Volunteer application has already been reviewed")
		return
	}
	_, err = queries.ReviewVolunteerApplication(ctx, dbgen.ReviewVolunteerApplicationParams{Status: input.Status, ReviewedBy: sql.NullInt32{Int32: reviewerID, Valid: true}, ID: int32(id)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not review volunteer application")
		return
	}
	if input.Status == "approved" {
		if _, err := queries.PromoteApplicantIfUser(ctx, application.UserID); err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "Could not approve volunteer application")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not review volunteer application")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Volunteer application reviewed"})
}

func (a *API) SignupForEvent(c *gin.Context) {
	eventID, ok := parseID(c)
	if !ok {
		return
	}
	if int64(eventID) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	userID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	event, err := a.q.GetEventByID(ctx, int32(eventID))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not check event")
		return
	}
	if event.EventDate.Before(time.Now()) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "Sign-up is closed for past events")
		return
	}
	rows, err := a.q.CreateEventSignup(ctx, dbgen.CreateEventSignupParams{EventID: int32(eventID), UserID: userID})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not sign up for event")
		return
	}
	if rows == 0 {
		currentDate, err := a.q.GetEventDate(ctx, int32(eventID))
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, "Event not found")
			return
		}
		if err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "Could not check event")
			return
		}
		if currentDate.Before(time.Now()) {
			httpx.Fail(c, http.StatusUnprocessableEntity, "Sign-up is closed for past events")
			return
		}
		httpx.Fail(c, http.StatusConflict, "You are already signed up for this event")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Event sign-up saved"})
}

func (a *API) CancelEventSignup(c *gin.Context) {
	eventID, ok := parseID(c)
	if !ok {
		return
	}
	if int64(eventID) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	userID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	if _, err := a.q.GetEventByID(c.Request.Context(), int32(eventID)); errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	} else if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not check event")
		return
	}
	if _, err := a.q.DeleteEventSignup(c.Request.Context(), dbgen.DeleteEventSignupParams{EventID: int32(eventID), UserID: userID}); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not cancel event sign-up")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Event sign-up cancelled"})
}

func (a *API) ListMyEventSignups(c *gin.Context) {
	userID, ok := authenticatedUserID(c)
	if !ok {
		return
	}
	page, limit, offset := pageArgs(c)
	ctx := c.Request.Context()
	rows, err := a.q.ListMyEventSignups(ctx, dbgen.ListMyEventSignupsParams{UserID: userID, RowOffset: offset, PageSize: int32(limit)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not fetch event sign-ups")
		return
	}
	total, err := a.q.CountMyEventSignups(ctx, userID)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not count event sign-ups")
		return
	}
	items := make([]models.Event, 0, len(rows))
	for _, row := range rows {
		items = append(items, eventDTO(row.ID, row.Title, row.Description, row.EventDate, row.EndsAt, row.Location, row.CreatedAt))
	}
	c.JSON(http.StatusOK, models.Page[models.Event]{Items: items, Page: page, Limit: limit, Total: total})
}

func (a *API) ListEventAttendees(c *gin.Context) {
	eventID, ok := parseID(c)
	if !ok {
		return
	}
	if int64(eventID) > int64(1<<31-1) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	ctx := c.Request.Context()
	if _, err := a.q.GetEventByID(ctx, int32(eventID)); errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	} else if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not check event")
		return
	}
	page, limit, offset := pageArgs(c)
	rows, err := a.q.ListEventAttendees(ctx, dbgen.ListEventAttendeesParams{EventID: int32(eventID), RowOffset: offset, PageSize: int32(limit)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not fetch event attendees")
		return
	}
	total, err := a.q.CountEventAttendees(ctx, int32(eventID))
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not count event attendees")
		return
	}
	items := make([]EventAttendeeDTO, 0, len(rows))
	for _, row := range rows {
		items = append(items, EventAttendeeDTO{Name: row.Name, Email: row.Email, CreatedAt: row.CreatedAt})
	}
	c.JSON(http.StatusOK, models.Page[EventAttendeeDTO]{Items: items, Page: page, Limit: limit, Total: total})
}
