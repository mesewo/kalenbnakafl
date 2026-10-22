package handlers

import (
	"kalenbnakafl/internal/httpx"
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/models"
)

func (a *API) GetEvents(c *gin.Context) {
	rows, err := a.q.ListEvents(c.Request.Context())
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch events")
		return
	}
	events := make([]models.Event, 0, len(rows))
	for _, row := range rows {
		events = append(events, models.Event{ID: int(row.ID), Title: row.Title, Description: row.Description, EventDate: row.EventDate, CreatedAt: row.CreatedAt})
	}
	c.JSON(http.StatusOK, events)
}

func (a *API) CreateEvent(c *gin.Context) {
	var input models.EventInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Title, description, and a valid event date are required")
		return
	}
	eventDate, validDate := parseEventTime(input.EventDate)
	if !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !validDate {
		httpx.Fail(c, http.StatusBadRequest, "Title, description, and a valid event date are required")
		return
	}
	err := a.q.CreateEvent(c.Request.Context(), dbgen.CreateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: eventDate})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "Failed to create event")
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
	eventDate, validDate := parseEventTime(input.EventDate)
	if !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !validDate {
		httpx.Fail(c, http.StatusBadRequest, "Title, description, and a valid event date are required")
		return
	}
	affected, err := a.q.UpdateEvent(c.Request.Context(), dbgen.UpdateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: eventDate, ID: int32(id)})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "Failed to update event")
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
