package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/models"
	"kalenbnakafl/utils"
)

var allowedRoles = map[string]bool{"user": true, "volunteer": true, "editor": true, "admin": true}

const accessCookie = "access_token"
const refreshCookie = "refresh_token"

func secureCookies(appEnv string) bool { return !strings.EqualFold(appEnv, "development") }
func cookieSameSite(appEnv string) http.SameSite {
	if secureCookies(appEnv) {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}
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
	opts := &http.Cookie{Path: "/", HttpOnly: true, Secure: secureCookies(cfg.AppEnv), SameSite: cookieSameSite(cfg.AppEnv), MaxAge: 15 * 60}
	http.SetCookie(c.Writer, &http.Cookie{Name: accessCookie, Value: access, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: opts.MaxAge})
	http.SetCookie(c.Writer, &http.Cookie{Name: refreshCookie, Value: refresh, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: 7 * 24 * 60 * 60})
	return nil
}
func clearSessionCookies(c *gin.Context, cfg config.Config) {
	for _, name := range []string{accessCookie, refreshCookie} {
		http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: "", Path: "/", HttpOnly: true, Secure: secureCookies(cfg.AppEnv), SameSite: cookieSameSite(cfg.AppEnv), MaxAge: -1})
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
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Name, 120) || !validEmail(input.Email) || len(input.Password) < 12 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name, valid email, and password of at least 12 characters are required"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Password hashing failed"})
		return
	}
	err = a.q.RegisterUser(requestContext(c), dbgen.RegisterUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: string(hash)})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "An account with that email already exists"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not create account"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Account created successfully"})
}

func (a *API) Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}
	ctx := requestContext(c)
	row, err := a.q.GetUserByEmail(ctx, clean(input.Email))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && bcrypt.CompareHashAndPassword([]byte(row.Password), []byte(input.Password)) != nil) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not log in"})
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	qtx := a.q.WithTx(tx)
	err = qtx.CreateRefreshToken(ctx, dbgen.CreateRefreshTokenParams{UserID: row.ID, TokenHash: tokenHash(refresh), ExpiresAt: time.Now().Add(7 * 24 * time.Hour)})
	if err != nil {
		_ = tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	if err = tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	if err = setSessionCookies(c, int(row.ID), row.Role, refresh, a.cfg); err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) Refresh(c *gin.Context) {
	old, err := c.Cookie(refreshCookie)
	if err != nil || old == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh session missing"})
		return
	}
	ctx := requestContext(c)
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not refresh session"})
		return
	}
	defer tx.Rollback()
	qtx := a.q.WithTx(tx)
	userID, err := qtx.LockActiveRefreshToken(ctx, tokenHash(old))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			clearSessionCookies(c, a.cfg)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh session expired"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not refresh session"})
		return
	}
	if err = qtx.RevokeRefreshToken(ctx, tokenHash(old)); err != nil {
		c.JSON(500, gin.H{"error": "Could not rotate session"})
		return
	}
	row, err := qtx.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Account not found"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not refresh session"})
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	if err = qtx.CreateRefreshToken(ctx, dbgen.CreateRefreshTokenParams{UserID: row.ID, TokenHash: tokenHash(refresh), ExpiresAt: time.Now().Add(7 * 24 * time.Hour)}); err != nil {
		c.JSON(500, gin.H{"error": "Could not rotate session"})
		return
	}
	if err = tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "Could not rotate session"})
		return
	}
	if err = setSessionCookies(c, int(row.ID), row.Role, refresh, a.cfg); err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) Logout(c *gin.Context) {
	if refresh, err := c.Cookie(refreshCookie); err == nil && refresh != "" {
		if err := a.q.RevokeRefreshTokenByHash(requestContext(c), tokenHash(refresh)); err != nil {
			c.JSON(500, gin.H{"error": "Could not sign out"})
			return
		}
	}
	clearSessionCookies(c, a.cfg)
	c.JSON(http.StatusOK, gin.H{"message": "Signed out"})
}

func (a *API) Me(c *gin.Context) {
	id, ok := c.Get("user_id")
	if !ok {
		c.JSON(401, gin.H{"error": "Account not found"})
		return
	}
	row, err := a.q.GetUserByID(requestContext(c), int32(id.(int)))
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load account"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(userModel(row.ID, row.Name, row.Email, row.Role, row.CreatedAt))})
}

func (a *API) GetUsers(c *gin.Context) {
	rows, err := a.q.ListUsers(requestContext(c))
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch users"})
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
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Name, 120) || !validEmail(input.Email) || len(input.Password) < 12 || !allowedRoles[input.Role] {
		c.JSON(400, gin.H{"error": "Name, email, password, and a valid role are required"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(500, gin.H{"error": "Password hashing failed"})
		return
	}
	err = a.q.CreateUser(requestContext(c), dbgen.CreateUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Password: string(hash), Role: input.Role})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(409, gin.H{"error": "Could not create user; email may already exist"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not create user; email may already exist"})
		return
	}
	c.JSON(201, gin.H{"message": "User created"})
}

func (a *API) UpdateUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.UserUpdate
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Name, 120) || !validEmail(input.Email) || !allowedRoles[input.Role] {
		c.JSON(400, gin.H{"error": "Name, email, and a valid role are required"})
		return
	}
	requester, _ := c.Get("user_id")
	if requester == id && input.Role != "admin" {
		c.JSON(400, gin.H{"error": "You cannot remove your own admin access"})
		return
	}
	ctx := requestContext(c)
	target, err := a.q.GetUserByID(ctx, int32(id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "Could not update user"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not update user"})
		return
	}
	if target.Role == "admin" && input.Role != "admin" {
		count, e := a.q.CountAdmins(ctx)
		if e != nil {
			c.JSON(500, gin.H{"error": "Could not update user"})
			return
		}
		if count <= 1 {
			c.JSON(409, gin.H{"error": "You cannot remove the last admin"})
			return
		}
	}
	var password sql.NullString
	if strings.TrimSpace(input.Password) != "" {
		if len(input.Password) < 12 {
			c.JSON(400, gin.H{"error": "Password must be at least 12 characters"})
			return
		}
		hash, e := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if e != nil {
			c.JSON(500, gin.H{"error": "Password hashing failed"})
			return
		}
		password = sql.NullString{String: string(hash), Valid: true}
	}
	affected, err := a.q.UpdateManagedUser(ctx, dbgen.UpdateManagedUserParams{Name: clean(input.Name), Email: strings.ToLower(clean(input.Email)), Role: input.Role, Password: password, ID: int32(id)})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(409, gin.H{"error": "Could not update user"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not update user"})
		return
	}
	if affected == 0 {
		c.JSON(404, gin.H{"error": "Could not update user"})
		return
	}
	c.JSON(200, gin.H{"message": "User updated"})
}

func (a *API) DeleteUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	requester, _ := c.Get("user_id")
	if requester == id {
		c.JSON(400, gin.H{"error": "You cannot delete your own account"})
		return
	}
	ctx := requestContext(c)
	target, err := a.q.GetUserByID(ctx, int32(id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "Could not delete user"})
			return
		}
		c.JSON(500, gin.H{"error": "Could not delete user"})
		return
	}
	if target.Role == "admin" {
		count, e := a.q.CountAdmins(ctx)
		if e != nil {
			c.JSON(500, gin.H{"error": "Could not delete user"})
			return
		}
		if count <= 1 {
			c.JSON(409, gin.H{"error": "You cannot delete the last admin"})
			return
		}
	}
	n, err := a.q.DeleteUser(ctx, int32(id))
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not delete user"})
		return
	}
	if n == 0 {
		c.JSON(404, gin.H{"error": "Could not delete user"})
		return
	}
	c.JSON(200, gin.H{"message": "User deleted"})
}
