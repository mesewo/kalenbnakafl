package handlers

import (
	"github.com/gin-gonic/gin"
	"kalenbnakafl/database"
	"kalenbnakafl/models"
	"net/http"
)

func GetPosts(c *gin.Context) {
	query := `SELECT p.id,p.title,p.content,COALESCE(p.author_id,0),COALESCE(u.name,''),p.published,p.created_at,p.updated_at FROM posts p LEFT JOIN users u ON u.id=p.author_id`
	if _, managed := c.Get("role"); !managed {
		query += ` WHERE p.published=true`
	}
	query += ` ORDER BY p.created_at DESC`
	rows, err := database.DB.Query(query)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch posts"})
		return
	}
	defer rows.Close()
	posts := []models.Post{}
	for rows.Next() {
		var p models.Post
		if err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.AuthorID, &p.AuthorName, &p.Published, &p.CreatedAt, &p.UpdatedAt); err == nil {
			posts = append(posts, p)
		}
	}
	c.JSON(200, posts)
}
func CreatePost(c *gin.Context) {
	var input models.PostInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		c.JSON(400, gin.H{"error": "Title and content are required"})
		return
	}
	userID, _ := c.Get("user_id")
	if _, err := database.DB.Exec(`INSERT INTO posts(title,content,author_id,published,updated_at) VALUES($1,$2,$3,false,NOW())`, clean(input.Title), clean(input.Content), userID); err != nil {
		c.JSON(500, gin.H{"error": "Failed to create post"})
		return
	}
	c.JSON(201, gin.H{"message": "Post created"})
}
func UpdatePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		c.JSON(400, gin.H{"error": "Title and content are required"})
		return
	}
	if _, err := database.DB.Exec(`UPDATE posts SET title=$1,content=$2,updated_at=NOW() WHERE id=$3`, clean(input.Title), clean(input.Content), id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to update post"})
		return
	}
	c.JSON(200, gin.H{"message": "Post updated"})
}
func DeletePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if _, err := database.DB.Exec(`DELETE FROM posts WHERE id=$1`, id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to delete post"})
		return
	}
	c.JSON(200, gin.H{"message": "Post deleted"})
}
func PublishPost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostPublishInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "Invalid publication status"})
		return
	}
	if _, err := database.DB.Exec(`UPDATE posts SET published=$1,updated_at=NOW() WHERE id=$2`, input.Published, id); err != nil {
		c.JSON(500, gin.H{"error": "Failed to update publication status"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Publication status updated"})
}
