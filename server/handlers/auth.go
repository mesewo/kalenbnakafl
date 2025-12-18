package handlers

import (
	"net/http"

	"kalenbenakafl-api/database"
	"kalenbenakafl-api/models"
	"kalenbenakafl-api/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func Register(c *gin.Context) {
	var user models.User

	// Parse JSON body
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(user.Password),
		bcrypt.DefaultCost,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Password hashing failed"})
		return
	}

	// Insert user
	query := `
		INSERT INTO users (name, email, password, role)
		VALUES ($1, $2, $3, $4)
	`

	_, err = database.DB.Exec(
		query,
		user.Name,
		user.Email,
		string(hashedPassword),
		"user",
	)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "User registered successfully",
	})
}

func Login(c *gin.Context) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	var user models.User

	query := `
		SELECT id, name, email, password, role
		FROM users
		WHERE email = $1
	`

	err := database.DB.QueryRow(query, input.Email).
		Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.Role)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Compare password
	err = bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(input.Password),
	)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Generate JWT
	token, err := utils.GenerateToken(user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Token generation failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func GetUsers(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id, name, email, role FROM users`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}
	defer rows.Close()

	var users []models.User

	for rows.Next() {
		var u models.User
		err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role)
		if err != nil {
			continue
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, users)
}
