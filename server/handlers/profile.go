package handlers

import (
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
	"net/http"
	"strings"
)

func Profile(c *gin.Context) {
	id, _ := c.Get("user_id")
	var user models.User
	if err := database.DB.QueryRow(`SELECT id,name,email,role,created_at FROM users WHERE id=$1`, id).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt); err != nil {
		c.JSON(404, gin.H{"error": "Profile not found"})
		return
	}
	c.JSON(200, user)
}
func UpdateProfile(c *gin.Context) {
	id, _ := c.Get("user_id")
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Name, 120) || !validEmail(input.Email) {
		c.JSON(400, gin.H{"error": "Name and a valid email are required"})
		return
	}
	var err error
	if strings.TrimSpace(input.Password) != "" {
		if len(input.Password) < 8 {
			c.JSON(400, gin.H{"error": "Password must be at least 8 characters"})
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		_, err = database.DB.Exec(`UPDATE users SET name=$1,email=$2,password=$3,updated_at=NOW() WHERE id=$4`, clean(input.Name), strings.ToLower(clean(input.Email)), hash, id)
	} else {
		_, err = database.DB.Exec(`UPDATE users SET name=$1,email=$2,updated_at=NOW() WHERE id=$3`, clean(input.Name), strings.ToLower(clean(input.Email)), id)
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not update profile; email may already exist"})
		return
	}
	c.JSON(200, gin.H{"message": "Profile updated"})
}
