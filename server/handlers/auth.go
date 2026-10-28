package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"kalenbnakafl/internal/httpx"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/auth"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/models"
	"kalenbnakafl/utils"
)

var allowedRoles = map[string]bool{"user": true, "volunteer": true, "editor": true, "admin": true}

var dummyPasswordHash = newDummyPasswordHash()

type passwordComparer func(hashedPassword, password []byte) error

func newDummyPasswordHash() []byte {
	randomPassword := make([]byte, 32)
	if _, err := rand.Read(randomPassword); err != nil {
		panic(fmt.Errorf("initialize dummy login hash: %w", err))
	}
	hash, err := bcrypt.GenerateFromPassword(randomPassword, bcrypt.DefaultCost)
	if err != nil {
		panic(fmt.Errorf("initialize dummy login hash: %w", err))
	}
	return hash
}

func compareLoginPassword(storedHash, password []byte, userExists bool, compare passwordComparer) bool {
	if !userExists {
		storedHash = dummyPasswordHash
	}
	validLength := len(password) <= auth.PasswordMaxBytes
	if !validLength {
		password = []byte("invalid oversized login candidate")
	}
	return compare(storedHash, password) == nil && validLength
}

func passwordPolicyMessage(err error) string {
	switch {
	case errors.Is(err, auth.ErrPasswordTooShort):
		return "auth.password_too_short"
	case errors.Is(err, auth.ErrPasswordTooLong):
		return "auth.password_too_long"
	case errors.Is(err, auth.ErrPasswordCommon):
		return "auth.password_too_common"
	case errors.Is(err, auth.ErrPasswordIdentity):
		return "auth.password_contains_identity"
	default:
		return "auth.password_policy_invalid"
	}
}

const accessCookie = "access_token"
const refreshCookie = "refresh_token"

func secureCookies(appEnv string) bool { return !strings.EqualFold(appEnv, "development") }
func tokenHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func newRefreshToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
func setSessionCookies(c *gin.Context, userID int, role string, refresh string, cfg config.Config) error {
	access, err := utils.GenerateToken(cfg.JWTSecret, userID, role)
	if err != nil {
		return err
	}
	opts := &http.Cookie{Path: "/", HttpOnly: true, Secure: secureCookies(cfg.AppEnv), SameSite: http.SameSiteLaxMode, MaxAge: 15 * 60}
	http.SetCookie(c.Writer, &http.Cookie{Name: accessCookie, Value: access, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: opts.MaxAge})
	http.SetCookie(c.Writer, &http.Cookie{Name: refreshCookie, Value: refresh, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: 7 * 24 * 60 * 60})
	return nil
}
func clearSessionCookies(c *gin.Context, cfg config.Config) {
	for _, name := range []string{accessCookie, refreshCookie} {
		http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: "", Path: "/", HttpOnly: true, Secure: secureCookies(cfg.AppEnv), SameSite: http.SameSiteLaxMode, MaxAge: -1})
	}
}
func publicUser(user models.User) gin.H {
	return gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "role": user.Role}
}
func userModel(id int32, name, email, role string, created time.Time) models.User {
	return models.User{ID: int(id), Name: name, Email: email, Role: role, CreatedAt: created}
}
func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}
func requestContext(c *gin.Context) context.Context { return c.Request.Context() }

func (a *API) Register(c *gin.Context) {
	var input models.UserInput
	if !httpx.BindJSON(c, &input) || !validateText(input.Name, 120) || !validEmail(input.Email) {
		httpx.Fail(c, http.StatusBadRequest, "auth.name_valid_email_and_password_of_at_least_12_characters_are_required")
		return
	}
	if err := auth.ValidatePassword(input.Password, input.Email, input.Name); err != nil {
		httpx.Fail(c, http.StatusUnprocessableEntity, passwordPolicyMessage(err))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Fail(c, 500, "auth.password_hashing_failed")
		return
	}
	err = a.q.RegisterUser(requestContext(c), dbgen.RegisterUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: string(hash)})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Fail(c, http.StatusConflict, "auth.an_account_with_that_email_already_exists")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_create_account")
		return
	}
	httpx.Success(c, http.StatusCreated, "auth.account_created_successfully")
}

func (a *API) Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, 400, "auth.invalid_input")
		return
	}
	ctx := requestContext(c)
	row, err := a.q.GetUserByEmail(ctx, clean(input.Email))
	if errors.Is(err, sql.ErrNoRows) {
		compareLoginPassword(nil, []byte(input.Password), false, bcrypt.CompareHashAndPassword)
		httpx.Fail(c, http.StatusUnauthorized, "auth.invalid_email_or_password")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "auth.could_not_log_in")
		return
	}
	if !compareLoginPassword([]byte(row.Password), []byte(input.Password), true, bcrypt.CompareHashAndPassword) {
		httpx.Fail(c, http.StatusUnauthorized, "auth.invalid_email_or_password")
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	qtx := a.q.WithTx(tx)
	err = qtx.CreateRefreshToken(ctx, dbgen.CreateRefreshTokenParams{UserID: row.ID, TokenHash: tokenHash(refresh), ExpiresAt: time.Now().Add(7 * 24 * time.Hour)})
	if err != nil {
		_ = tx.Rollback()
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	if err = tx.Commit(); err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	if err = setSessionCookies(c, int(row.ID), row.Role, refresh, a.cfg); err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) Refresh(c *gin.Context) {
	old, err := c.Cookie(refreshCookie)
	if err != nil || old == "" {
		httpx.Fail(c, http.StatusUnauthorized, "auth.refresh_session_missing")
		return
	}
	ctx := requestContext(c)
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		httpx.Fail(c, 500, "auth.could_not_refresh_session")
		return
	}
	defer func() { _ = tx.Rollback() }()
	qtx := a.q.WithTx(tx)
	userID, err := qtx.LockActiveRefreshToken(ctx, tokenHash(old))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			clearSessionCookies(c, a.cfg)
			httpx.Fail(c, http.StatusUnauthorized, "auth.refresh_session_expired")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_refresh_session")
		return
	}
	if err = qtx.RevokeRefreshToken(ctx, tokenHash(old)); err != nil {
		httpx.Fail(c, 500, "auth.could_not_rotate_session")
		return
	}
	row, err := qtx.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusUnauthorized, "auth.account_not_found")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_refresh_session")
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	if err = qtx.CreateRefreshToken(ctx, dbgen.CreateRefreshTokenParams{UserID: row.ID, TokenHash: tokenHash(refresh), ExpiresAt: time.Now().Add(7 * 24 * time.Hour)}); err != nil {
		httpx.Fail(c, 500, "auth.could_not_rotate_session")
		return
	}
	if err = tx.Commit(); err != nil {
		httpx.Fail(c, 500, "auth.could_not_rotate_session")
		return
	}
	if err = setSessionCookies(c, int(row.ID), row.Role, refresh, a.cfg); err != nil {
		httpx.Fail(c, 500, "auth.could_not_create_session")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) Logout(c *gin.Context) {
	if refresh, err := c.Cookie(refreshCookie); err == nil && refresh != "" {
		if err := a.q.RevokeRefreshTokenByHash(requestContext(c), tokenHash(refresh)); err != nil {
			httpx.Fail(c, 500, "auth.could_not_sign_out")
			return
		}
	}
	clearSessionCookies(c, a.cfg)
	httpx.Success(c, http.StatusOK, "auth.signed_out")
}

func (a *API) Me(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, 401, "auth.account_not_found")
		return
	}
	row, err := a.q.GetUserByID(requestContext(c), int32(id.(int)))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusUnauthorized, "auth.account_not_found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "auth.could_not_load_account")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) GetUsers(c *gin.Context) {
	rows, err := a.q.ListUsers(requestContext(c))
	if err != nil {
		httpx.Fail(c, 500, "auth.failed_to_fetch_users")
		return
	}
	users := make([]models.User, 0, len(rows))
	for _, row := range rows {
		users = append(users, userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))
	}
	c.JSON(200, users)
}

func (a *API) CreateUser(c *gin.Context) {
	var input models.UserInput
	if !httpx.BindJSON(c, &input) || !validateText(input.Name, 120) || !validEmail(input.Email) || !allowedRoles[input.Role] {
		httpx.Fail(c, 400, "auth.name_email_password_and_a_valid_role_are_required")
		return
	}
	if err := auth.ValidatePassword(input.Password, input.Email, input.Name); err != nil {
		httpx.Fail(c, http.StatusUnprocessableEntity, passwordPolicyMessage(err))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.Fail(c, 500, "auth.password_hashing_failed")
		return
	}
	err = a.q.CreateUser(requestContext(c), dbgen.CreateUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: string(hash), Role: input.Role})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Fail(c, 409, "auth.could_not_create_user_email_may_already_exist")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_create_user_email_may_already_exist")
		return
	}
	httpx.Success(c, 201, "auth.created")
}

func (a *API) UpdateUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.UserUpdate
	if !httpx.BindJSON(c, &input) || !validateText(input.Name, 120) || !validEmail(input.Email) || !allowedRoles[input.Role] {
		httpx.Fail(c, 400, "auth.name_email_and_a_valid_role_are_required")
		return
	}
	requester, _ := c.Get("user_id")
	if requester == id && input.Role != "admin" {
		httpx.Fail(c, 400, "auth.you_cannot_remove_your_own_admin_access")
		return
	}
	ctx := requestContext(c)
	target, err := a.q.GetUserByID(ctx, int32(id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, 404, "auth.could_not_update_user")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_update_user")
		return
	}
	if target.Role == "admin" && input.Role != "admin" {
		count, e := a.q.CountAdmins(ctx)
		if e != nil {
			httpx.Fail(c, 500, "auth.could_not_update_user")
			return
		}
		if count <= 1 {
			httpx.Fail(c, 409, "auth.you_cannot_remove_the_last_admin")
			return
		}
	}
	var password sql.NullString
	if strings.TrimSpace(input.Password) != "" {
		if e := auth.ValidatePassword(input.Password, input.Email, input.Name); e != nil {
			httpx.Fail(c, http.StatusUnprocessableEntity, passwordPolicyMessage(e))
			return
		}
		hash, e := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if e != nil {
			httpx.Fail(c, 500, "auth.password_hashing_failed")
			return
		}
		password = sql.NullString{String: string(hash), Valid: true}
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "auth.could_not_update_user")
		return
	}
	defer func() { _ = tx.Rollback() }()
	qtx := a.q.WithTx(tx)
	affected, err := qtx.UpdateManagedUser(ctx, dbgen.UpdateManagedUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Role: input.Role, Password: password, ID: int32(id)})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Fail(c, 409, "auth.could_not_update_user")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_update_user")
		return
	}
	if affected == 0 {
		httpx.Fail(c, 404, "auth.could_not_update_user")
		return
	}
	if password.Valid || target.Role != input.Role {
		if err := qtx.RevokeUserRefreshTokens(ctx, int32(id)); err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "auth.could_not_update_user")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "auth.could_not_update_user")
		return
	}
	httpx.Success(c, 200, "auth.updated")
}

func (a *API) DeleteUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	requester, _ := c.Get("user_id")
	if requester == id {
		httpx.Fail(c, 400, "auth.you_cannot_delete_your_own_account")
		return
	}
	ctx := requestContext(c)
	target, err := a.q.GetUserByID(ctx, int32(id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, 404, "auth.could_not_delete_user")
			return
		}
		httpx.Fail(c, 500, "auth.could_not_delete_user")
		return
	}
	if target.Role == "admin" {
		count, e := a.q.CountAdmins(ctx)
		if e != nil {
			httpx.Fail(c, 500, "auth.could_not_delete_user")
			return
		}
		if count <= 1 {
			httpx.Fail(c, 409, "auth.you_cannot_delete_the_last_admin")
			return
		}
	}
	n, err := a.q.DeleteUser(ctx, int32(id))
	if err != nil {
		httpx.Fail(c, 500, "auth.could_not_delete_user")
		return
	}
	if n == 0 {
		httpx.Fail(c, 404, "auth.could_not_delete_user")
		return
	}
	httpx.Success(c, 200, "auth.deleted")
}
