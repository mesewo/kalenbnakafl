package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
)

func (a *API) Profile(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		c.JSON(404, gin.H{"error": "Profile not found"})
		return
	}
	row, err := a.q.GetUserByID(c.Request.Context(), int32(id.(int)))
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(404, gin.H{"error": "Profile not found"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load profile"})
		return
	}
	c.JSON(200, userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))
}

func (a *API) UpdateProfile(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		c.JSON(401, gin.H{"error": "Authentication required"})
		return
	}
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Name, 120) || !validEmail(input.Email) {
		c.JSON(400, gin.H{"error": "Name and a valid email are required"})
		return
	}
	var password sql.NullString
	if strings.TrimSpace(input.Password) != "" {
		if len(input.Password) < 8 {
			c.JSON(400, gin.H{"error": "Password must be at least 8 characters"})
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(500, gin.H{"error": "Password hashing failed"})
			return
		}
		password = sql.NullString{String: string(hash), Valid: true}
	}
	affected, err := a.q.UpdateProfile(c.Request.Context(), dbgen.UpdateProfileParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: password, ID: int32(id.(int))})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "Could not update profile; email may already exist"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update profile; email may already exist"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
		return
	}
	c.JSON(200, gin.H{"message": "Profile updated"})
}
