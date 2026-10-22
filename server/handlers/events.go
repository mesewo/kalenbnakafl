package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/models"
)

func (a *API) GetEvents(c *gin.Context) {
	rows, err := a.q.ListEvents(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
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
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !parseEventTime(input.EventDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title, description, and a valid event date are required"})
		return
	}
	err := a.q.CreateEvent(c.Request.Context(), dbgen.CreateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: input.EventDate})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to create event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
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
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !parseEventTime(input.EventDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title, description, and a valid event date are required"})
		return
	}
	affected, err := a.q.UpdateEvent(c.Request.Context(), dbgen.UpdateEventParams{Title: clean(input.Title), Description: clean(input.Description), EventDate: input.EventDate, ID: int32(id)})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to update event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
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
			c.JSON(status, gin.H{"error": "Failed to delete event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Event deleted"})
}
