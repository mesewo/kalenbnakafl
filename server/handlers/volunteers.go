package handlers

import (
	"database/sql"
	"kalenbnakafl/internal/httpx"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/models"
)

func (a *API) GetVolunteers(c *gin.Context) {
	rows, err := a.q.ListVolunteers(c.Request.Context())
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "volunteers.failed_to_fetch_volunteers")
		return
	}
	items := make([]models.Volunteer, 0, len(rows))
	for _, row := range rows {
		hours, err := strconv.ParseFloat(row.TotalHours, 64)
		if err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "volunteers.failed_to_fetch_volunteers")
			return
		}
		items = append(items, models.Volunteer{
			User:       models.User{ID: int(row.ID), Name: row.Name, Email: row.Email, Role: row.Role, CreatedAt: row.CreatedAt},
			TotalHours: hours,
		})
	}
	c.JSON(http.StatusOK, items)
}

func (a *API) AddContribution(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input struct {
		Hours            float64 `json:"hours"`
		Notes            string  `json:"notes"`
		ContributionDate string  `json:"contribution_date"`
	}
	if !httpx.BindJSON(c, &input) || input.Hours <= 0 || input.Hours > 1000 {
		httpx.Fail(c, http.StatusBadRequest, "volunteers.hours_must_be_greater_than_zero")
		return
	}
	createdBy, _ := c.Get("user_id")
	createdByID := sql.NullInt32{}
	if userID, ok := createdBy.(int); ok {
		createdByID = sql.NullInt32{Int32: int32(userID), Valid: true}
	}
	err := a.q.AddVolunteerContribution(c.Request.Context(), dbgen.AddVolunteerContributionParams{
		VolunteerID: int32(id), Hours: strconv.FormatFloat(input.Hours, 'f', -1, 64),
		Notes: clean(input.Notes), ContributionDate: input.ContributionDate, CreatedBy: createdByID,
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "volunteers.could_not_record_contribution")
		return
	}
	httpx.Success(c, http.StatusCreated, "volunteers.contribution_recorded")
}
