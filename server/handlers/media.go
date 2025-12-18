package handlers

import (
	"net/http"

	"kalenbenakafl-api/database"
	"kalenbenakafl-api/models"

	"github.com/gin-gonic/gin"
)

func GetMedia(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id, title, file_url FROM media`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch media"})
		return
	}
	defer rows.Close()

	var media []models.Media

	for rows.Next() {
		var m models.Media
		err := rows.Scan(&m.ID, &m.Title, &m.FileURL)
		if err != nil {
			continue
		}
		media = append(media, m)
	}

	c.JSON(http.StatusOK, media)
}
