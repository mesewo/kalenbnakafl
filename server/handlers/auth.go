package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
	"kalenbnakafl/utils"
)

var allowedRoles = map[string]bool{"user": true, "volunteer": true, "editor": true, "admin": true}

const accessCookie = "access_token"
const refreshCookie = "refresh_token"

func secureCookies() bool { return !strings.EqualFold(os.Getenv("APP_ENV"), "development") }
func cookieSameSite() http.SameSite {
	if secureCookies() {
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
func setSessionCookies(c *gin.Context, userID int, role string, refresh string) error {
	access, err := utils.GenerateToken(userID, role)
	if err != nil {
		return err
	}
	opts := &http.Cookie{Path: "/", HttpOnly: true, Secure: secureCookies(), SameSite: cookieSameSite(), MaxAge: 15 * 60}
	http.SetCookie(c.Writer, &http.Cookie{Name: accessCookie, Value: access, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: opts.MaxAge})
	http.SetCookie(c.Writer, &http.Cookie{Name: refreshCookie, Value: refresh, Path: opts.Path, HttpOnly: opts.HttpOnly, Secure: opts.Secure, SameSite: opts.SameSite, MaxAge: 7 * 24 * 60 * 60})
	return nil
}
func clearSessionCookies(c *gin.Context) {
	for _, name := range []string{accessCookie, refreshCookie} {
		http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: "", Path: "/", HttpOnly: true, Secure: secureCookies(), SameSite: cookieSameSite(), MaxAge: -1})
	}
}
func publicUser(user models.User) gin.H {
	return gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "role": user.Role}
}

func Register(c *gin.Context) {
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
	if _, err = database.DB.Exec(`INSERT INTO users(name,email,password,role,updated_at) VALUES($1,$2,$3,'user',NOW())`, clean(input.Name), strings.ToLower(clean(input.Email)), hash); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "An account with that email already exists"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Account created successfully"})
}

func Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}
	var user models.User
	err := database.DB.QueryRow(`SELECT id,name,email,password,role FROM users WHERE lower(email)=lower($1)`, clean(input.Email)).Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.Role)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	if _, err = database.DB.Exec(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, user.ID, tokenHash(refresh), time.Now().Add(7*24*time.Hour)); err != nil || setSessionCookies(c, user.ID, user.Role, refresh) != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(user)})
}

func Refresh(c *gin.Context) {
	old, err := c.Cookie(refreshCookie)
	if err != nil || old == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh session missing"})
		return
	}
	tx, err := database.DB.Begin()
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not refresh session"})
		return
	}
	var userID int
	if err = tx.QueryRow(`SELECT user_id FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()`, tokenHash(old)).Scan(&userID); err != nil {
		_ = tx.Rollback()
		clearSessionCookies(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh session expired"})
		return
	}
	if _, err = tx.Exec(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, tokenHash(old)); err != nil {
		_ = tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not rotate session"})
		return
	}
	var user models.User
	if err = tx.QueryRow(`SELECT id,name,email,role FROM users WHERE id=$1`, userID).Scan(&user.ID, &user.Name, &user.Email, &user.Role); err != nil {
		_ = tx.Rollback()
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Account not found"})
		return
	}
	refresh, err := newRefreshToken()
	if err != nil {
		_ = tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	if _, err = tx.Exec(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, user.ID, tokenHash(refresh), time.Now().Add(7*24*time.Hour)); err != nil || tx.Commit() != nil {
		_ = tx.Rollback()
		c.JSON(500, gin.H{"error": "Could not rotate session"})
		return
	}
	if err = setSessionCookies(c, user.ID, user.Role, refresh); err != nil {
		c.JSON(500, gin.H{"error": "Could not create session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(user)})
}

func Logout(c *gin.Context) {
	if refresh, err := c.Cookie(refreshCookie); err == nil && refresh != "" {
		_, _ = database.DB.Exec(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, tokenHash(refresh))
	}
	clearSessionCookies(c)
	c.JSON(http.StatusOK, gin.H{"message": "Signed out"})
}
func Me(c *gin.Context) {
	id, _ := c.Get("user_id")
	var user models.User
	if err := database.DB.QueryRow(`SELECT id,name,email,role,created_at FROM users WHERE id=$1`, id).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Account not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": publicUser(user)})
}

func GetUsers(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch users"})
		return
	}
	defer rows.Close()
	users := []models.User{}
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.CreatedAt); err != nil {
			c.JSON(500, gin.H{"error": "Failed to read users"})
			return
		}
		users = append(users, u)
	}
	c.JSON(200, users)
}
func CreateUser(c *gin.Context) {
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
	if _, err = database.DB.Exec(`INSERT INTO users(name,email,password,role,updated_at) VALUES($1,$2,$3,$4,NOW())`, clean(input.Name), strings.ToLower(clean(input.Email)), hash, input.Role); err != nil {
		c.JSON(400, gin.H{"error": "Could not create user; email may already exist"})
		return
	}
	c.JSON(201, gin.H{"message": "User created"})
}
func UpdateUser(c *gin.Context) {
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
	var err error
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
		_, err = database.DB.Exec(`UPDATE users SET name=$1,email=$2,role=$3,password=$4,updated_at=NOW() WHERE id=$5`, clean(input.Name), strings.ToLower(clean(input.Email)), input.Role, hash, id)
	} else {
		_, err = database.DB.Exec(`UPDATE users SET name=$1,email=$2,role=$3,updated_at=NOW() WHERE id=$4`, clean(input.Name), strings.ToLower(clean(input.Email)), input.Role, id)
	}
	if err != nil {
		c.JSON(400, gin.H{"error": "Could not update user"})
		return
	}
	c.JSON(200, gin.H{"message": "User updated"})
}
func DeleteUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	requester, _ := c.Get("user_id")
	if requester == id {
		c.JSON(400, gin.H{"error": "You cannot delete your own account"})
		return
	}
	if _, err := database.DB.Exec(`DELETE FROM users WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Could not delete user"})
		return
	}
	c.JSON(200, gin.H{"message": "User deleted"})
}
