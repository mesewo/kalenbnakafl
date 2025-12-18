package handlers

import (
	"net/http"

	"kalenbenakafl-api/database"
	"kalenbenakafl-api/models"

	"github.com/gin-gonic/gin"
)

func GetEvents(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id, title, description, event_date FROM events`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
		return
	}
	defer rows.Close()

	var events []models.Event

	for rows.Next() {
		var e models.Event
		err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.EventDate)
		if err != nil {
			continue
		}
		events = append(events, e)
	}

	c.JSON(http.StatusOK, events)
}

func CreateEvent(c *gin.Context) {
	var event models.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	_, err := database.DB.Exec(
		`INSERT INTO events (title, description, event_date) VALUES ($1,$2,$3)`,
		event.Title, event.Description, event.EventDate,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Event created"})
}
