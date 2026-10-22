package handlers

import (
	"database/sql"
	"errors"
	"kalenbnakafl/internal/httpx"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
)

func (a *API) Profile(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, 404, "Profile not found")
		return
	}
	row, err := a.q.GetUserByID(c.Request.Context(), int32(id.(int)))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, 404, "Profile not found")
		return
	}
	if err != nil {
		httpx.Fail(c, 500, "Could not load profile")
		return
	}
	c.JSON(200, userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))
}

func (a *API) UpdateProfile(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, 401, "Authentication required")
		return
	}
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !httpx.BindJSON(c, &input) || !validateText(input.Name, 120) || !validEmail(input.Email) {
		httpx.Fail(c, 400, "Name and a valid email are required")
		return
	}
	var password sql.NullString
	if strings.TrimSpace(input.Password) != "" {
		if len(input.Password) < 8 {
			httpx.Fail(c, 400, "Password must be at least 8 characters")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			httpx.Fail(c, 500, "Password hashing failed")
			return
		}
		password = sql.NullString{String: string(hash), Valid: true}
	}
	affected, err := a.q.UpdateProfile(c.Request.Context(), dbgen.UpdateProfileParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: password, ID: int32(id.(int))})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Fail(c, http.StatusConflict, "Could not update profile; email may already exist")
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, 404, "Profile not found")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Could not update profile; email may already exist")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Profile not found")
		return
	}
	c.JSON(200, gin.H{"message": "Profile updated"})
}
