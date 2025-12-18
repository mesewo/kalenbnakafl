package handlers

import (
	"net/http"

	"kalenbenakafl-api/database"
	"kalenbenakafl-api/models"

	"github.com/gin-gonic/gin"
)

func GetPosts(c *gin.Context) {
	rows, err := database.DB.Query(`SELECT id, title, content FROM posts`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}
	defer rows.Close()

	var posts []models.Post

	for rows.Next() {
		var p models.Post
		err := rows.Scan(&p.ID, &p.Title, &p.Content)
		if err != nil {
			continue
		}
		posts = append(posts, p)
	}

	c.JSON(http.StatusOK, posts)
}

func CreatePost(c *gin.Context) {
	var post models.Post
	if err := c.ShouldBindJSON(&post); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found"})
		return
	}

	_, err := database.DB.Exec(
		`INSERT INTO posts (title, content, author_id) VALUES ($1,$2,$3)`,
		post.Title, post.Content, userID,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Post created"})
}
