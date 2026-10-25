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
		httpx.Fail(c, 404, "profile.profile_not_found")
		return
	}
	row, err := a.q.GetUserByID(c.Request.Context(), int32(id.(int)))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, 404, "profile.profile_not_found")
		return
	}
	if err != nil {
		httpx.Fail(c, 500, "profile.could_not_load_profile")
		return
	}
	c.JSON(200, userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))
}

func (a *API) UpdateProfile(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, 401, "profile.authentication_required")
		return
	}
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !httpx.BindJSON(c, &input) || !validateText(input.Name, 120) || !validEmail(input.Email) {
		httpx.Fail(c, 400, "profile.name_and_a_valid_email_are_required")
		return
	}
	var password sql.NullString
	if strings.TrimSpace(input.Password) != "" {
		if len(input.Password) < 8 {
			httpx.Fail(c, 400, "profile.password_must_be_at_least_8_characters")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			httpx.Fail(c, 500, "profile.password_hashing_failed")
			return
		}
		password = sql.NullString{String: string(hash), Valid: true}
	}
	affected, err := a.q.UpdateProfile(c.Request.Context(), dbgen.UpdateProfileParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: password, ID: int32(id.(int))})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Fail(c, http.StatusConflict, "profile.could_not_update_profile_email_may_already_exist")
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, 404, "profile.profile_not_found")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "profile.could_not_update_profile_email_may_already_exist")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "profile.profile_not_found")
		return
	}
	httpx.Success(c, 200, "profile.profile_updated")
}
