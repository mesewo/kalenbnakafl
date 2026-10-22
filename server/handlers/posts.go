package handlers

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/models"
)

func postEventConstraintStatus(err error) (int, bool) {
	var postgresErr *pq.Error
	if !errors.As(err, &postgresErr) {
		return 0, false
	}
	switch postgresErr.Code {
	case "23505":
		return http.StatusConflict, true
	case "23503":
		return http.StatusUnprocessableEntity, true
	default:
		return 0, false
	}
}

func (a *API) GetPosts(c *gin.Context) {
	_, includeUnpublished := c.Get("role")
	rows, err := a.q.ListPosts(c.Request.Context(), includeUnpublished)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}
	posts := make([]models.Post, 0, len(rows))
	for _, row := range rows {
		posts = append(posts, models.Post{
			ID: int(row.ID), Title: row.Title, Content: row.Content,
			AuthorID: int(row.AuthorID), AuthorName: row.AuthorName,
			Published: row.Published, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, posts)
}

func (a *API) CreatePost(c *gin.Context) {
	var input models.PostInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title and content are required"})
		return
	}
	userID, ok := c.Get("user_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}
	id, ok := userID.(int)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}
	err := a.q.CreatePost(c.Request.Context(), dbgen.CreatePostParams{Title: clean(input.Title), Content: clean(input.Content), AuthorID: sql.NullInt32{Int32: int32(id), Valid: true}})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to create post"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Post created"})
}

func (a *API) UpdatePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostInput
	if err := c.ShouldBindJSON(&input); err != nil || !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title and content are required"})
		return
	}
	affected, err := a.q.UpdatePost(c.Request.Context(), dbgen.UpdatePostParams{Title: clean(input.Title), Content: clean(input.Content), ID: int32(id)})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to update post"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Post updated"})
}

func (a *API) DeletePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	affected, err := a.q.DeletePost(c.Request.Context(), int32(id))
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to delete post"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Post deleted"})
}

func (a *API) PublishPost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostPublishInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid publication status"})
		return
	}
	affected, err := a.q.PublishPost(c.Request.Context(), dbgen.PublishPostParams{Published: input.Published, ID: int32(id)})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			c.JSON(status, gin.H{"error": "Failed to update publication status"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update publication status"})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Publication status updated"})
}
