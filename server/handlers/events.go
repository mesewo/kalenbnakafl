package handlers

import (
	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
)

func GetEvents(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id,title,description,event_date,created_at FROM events WHERE event_date >= NOW() - INTERVAL '1 day' ORDER BY event_date ASC`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch events"})
		return
	}
	defer rows.Close()
	events := []models.Event{}
	for rows.Next() {
		var e models.Event
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.EventDate, &e.CreatedAt); err == nil {
			events = append(events, e)
		}
	}
	c.JSON(200, events)
}
func CreateEvent(c *gin.Context) {
	var input models.EventInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !parseEventTime(input.EventDate) {
		c.JSON(400, gin.H{"error": "Title, description, and a valid event date are required"})
		return
	}
	if _, err := database.DB.Exec(`INSERT INTO events(title,description,event_date) VALUES($1,$2,$3)`, clean(input.Title), clean(input.Description), input.EventDate); err != nil {
		c.JSON(500, gin.H{"error": "Failed to create event"})
		return
	}
	c.JSON(201, gin.H{"message": "Event created"})
}
func UpdateEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.EventInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Description, 20000) || !parseEventTime(input.EventDate) {
		c.JSON(400, gin.H{"error": "Title, description, and a valid event date are required"})
		return
	}
	if _, err := database.DB.Exec(`UPDATE events SET title=$1,description=$2,event_date=$3 WHERE id=$4`, clean(input.Title), clean(input.Description), input.EventDate, id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to update event"})
		return
	}
	c.JSON(200, gin.H{"message": "Event updated"})
}
func DeleteEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if _, err := database.DB.Exec(`DELETE FROM events WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete event"})
		return
	}
	c.JSON(200, gin.H{"message": "Event deleted"})
}
