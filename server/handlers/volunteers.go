package handlers

import (
	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
	"net/http"
)

func GetVolunteers(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT u.id,u.name,u.email,u.role,u.created_at,COALESCE(SUM(vc.hours),0) FROM users u LEFT JOIN volunteer_contributions vc ON vc.volunteer_id=u.id WHERE u.role='volunteer' GROUP BY u.id ORDER BY u.name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch volunteers"})
		return
	}
	defer rows.Close()
	items := []models.Volunteer{}
	for rows.Next() {
		var v models.Volunteer
		if err := rows.Scan(&v.ID, &v.Name, &v.Email, &v.Role, &v.CreatedAt, &v.TotalHours); err == nil {
			items = append(items, v)
		}
	}
	c.JSON(200, items)
}
func AddContribution(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input struct {
		Hours            float64 `json:"hours"`
		Notes            string  `json:"notes"`
		ContributionDate string  `json:"contribution_date"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Hours <= 0 || input.Hours > 1000 {
		c.JSON(400, gin.H{"error": "Hours must be greater than zero"})
		return
	}
	createdBy, _ := c.Get("user_id")
	_, err := database.DB.Exec(`INSERT INTO volunteer_contributions(volunteer_id,hours,notes,contribution_date,created_by) SELECT $1,$2,$3,COALESCE(NULLIF($4,'')::date,CURRENT_DATE),$5 FROM users WHERE id=$1 AND role='volunteer'`, id, input.Hours, clean(input.Notes), input.ContributionDate, createdBy)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not record contribution"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Contribution recorded"})
}
