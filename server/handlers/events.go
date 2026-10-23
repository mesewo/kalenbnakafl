package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/models"
)

func eventDTO(id int32, title, description string, eventDate time.Time, endsAt sql.NullTime, location string, createdAt time.Time) models.Event {
	var end *time.Time
	if endsAt.Valid {
		end = &endsAt.Time
	}
	return models.Event{ID: int(id), Title: title, Description: description, EventDate: eventDate, EndsAt: end, Location: location, CreatedAt: createdAt}
}

func (a *API) GetEvents(c *gin.Context) {
	page, limit, offset := pageArgs(c)
	upcoming := strings.EqualFold(c.Query("upcoming"), "true")
	ctx := c.Request.Context()
	args := dbgen.ListEventsParams{Upcoming: upcoming, RowOffset: offset, PageSize: int32(limit)}
	rows, err := a.q.ListEvents(ctx, args)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch events")
		return
	}
	total, err := a.q.CountEvents(ctx, upcoming)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to count events")
		return
	}
	events := make([]models.Event, 0, len(rows))
	for _, row := range rows {
		events = append(events, eventDTO(row.ID, row.Title, row.Description, row.EventDate, row.EndsAt, row.Location, row.CreatedAt))
	}
	c.JSON(http.StatusOK, models.Page[models.Event]{Items: events, Page: page, Limit: limit, Total: total})
}

func (a *API) GetEventByID(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	row, err := a.q.GetEventByID(c.Request.Context(), int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch event")
		return
	}
	c.JSON(http.StatusOK, eventDTO(row.ID, row.Title, row.Description, row.EventDate, row.EndsAt, row.Location, row.CreatedAt))
}

func validEvent(input models.EventInput) (time.Time, sql.NullTime, int) {
	start, ok := parseEventTime(input.EventDate)
	if !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !ok {
		return time.Time{}, sql.NullTime{}, http.StatusBadRequest
	}
	var end sql.NullTime
	if strings.TrimSpace(input.EndsAt) != "" {
		parsed, valid := parseEventTime(input.EndsAt)
		if !valid {
			return time.Time{}, sql.NullTime{}, http.StatusBadRequest
		}
		if !parsed.After(start) {
			return time.Time{}, sql.NullTime{}, http.StatusUnprocessableEntity
		}
		end = sql.NullTime{Time: parsed, Valid: true}
	}
	return start, end, http.StatusOK
}

func (a *API) CreateEvent(c *gin.Context) {
	var input models.EventInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Title, description, and a valid event date are required")
		return
	}
	start, end, status := validEvent(input)
	if status != http.StatusOK {
		if status == http.StatusUnprocessableEntity {
			httpx.Fail(c, status, "Event end time must be after its start time")
		} else {
			httpx.Fail(c, status, "Title, description, and a valid event date are required")
		}
		return
	}
	err := a.q.CreateEvent(c.Request.Context(), dbgen.CreateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: start, EndsAt: end, Location: clean(input.Location)})
	if err != nil {
		if constraintStatus, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, constraintStatus, "Failed to create event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Failed to create event")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Event created"})
}

func (a *API) UpdateEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.EventInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Title, description, and a valid event date are required")
		return
	}
	start, end, status := validEvent(input)
	if status != http.StatusOK {
		if status == http.StatusUnprocessableEntity {
			httpx.Fail(c, status, "Event end time must be after its start time")
		} else {
			httpx.Fail(c, status, "Title, description, and a valid event date are required")
		}
		return
	}
	affected, err := a.q.UpdateEvent(c.Request.Context(), dbgen.UpdateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: start, EndsAt: end, Location: clean(input.Location), ID: int32(id)})
	if err != nil {
		if constraintStatus, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, constraintStatus, "Failed to update event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Failed to update event")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Event updated"})
}

func (a *API) DeleteEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	affected, err := a.q.DeleteEvent(c.Request.Context(), int32(id))
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "Failed to delete event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Failed to delete event")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Event not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Event deleted"})
}
