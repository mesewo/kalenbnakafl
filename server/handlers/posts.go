package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/models"
)

var validSlug = regexp.MustCompile(`^[a-z0-9-]{3,100}$`)
var generatedSlugChars = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

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

func pageArgs(c *gin.Context) (page, limit int, offset int32) {
	page = 1
	if parsed, err := strconv.Atoi(c.Query("page")); err == nil && parsed > 1 {
		page = parsed
	}
	limit = 10
	if parsed, err := strconv.Atoi(c.Query("limit")); err == nil {
		if parsed > 0 {
			limit = parsed
		}
	}
	if limit > 50 {
		limit = 50
	}
	maxPage := int((int64(1<<31-1) / int64(limit)) + 1)
	if page > maxPage {
		page = maxPage
	}
	return page, limit, int32((page - 1) * limit)
}

func nullableTime(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

func nullableID(value sql.NullInt32) *int {
	if !value.Valid {
		return nil
	}
	id := int(value.Int32)
	return &id
}

func (a *API) GetPosts(c *gin.Context) {
	page, limit, offset := pageArgs(c)
	_, includeUnpublished := c.Get("role")
	search := strings.TrimSpace(c.Query("q"))
	searchArg := sql.NullString{String: search, Valid: search != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListPosts(ctx, dbgen.ListPostsParams{IncludeUnpublished: includeUnpublished, Search: searchArg, RowOffset: offset, PageSize: int32(limit)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch posts")
		return
	}
	total, err := a.q.CountPosts(ctx, dbgen.CountPostsParams{IncludeUnpublished: includeUnpublished, Search: searchArg})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to count posts")
		return
	}
	posts := make([]models.Post, 0, len(rows))
	for _, row := range rows {
		posts = append(posts, models.Post{ID: int(row.ID), Slug: row.Slug, Title: row.Title, Content: row.Content, AuthorID: int(row.AuthorID), AuthorName: row.AuthorName, Published: row.Published, PublishedAt: nullableTime(row.PublishedAt), CoverMediaID: nullableID(row.CoverMediaID), CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt})
	}
	c.JSON(http.StatusOK, models.Page[models.Post]{Items: posts, Page: page, Limit: limit, Total: total})
}

func (a *API) GetPostBySlug(c *gin.Context) {
	row, err := a.q.GetPostBySlug(c.Request.Context(), c.Param("slug"))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Post not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch post")
		return
	}
	c.JSON(http.StatusOK, models.Post{ID: int(row.ID), Slug: row.Slug, Title: row.Title, Content: row.Content, AuthorID: int(row.AuthorID), AuthorName: row.AuthorName, Published: row.Published, PublishedAt: nullableTime(row.PublishedAt), CoverMediaID: nullableID(row.CoverMediaID), CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt})
}

func slugify(title string) (string, error) {
	var out strings.Builder
	separator := false
	for _, char := range strings.ToLower(title) {
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' {
			if separator && out.Len() > 0 {
				out.WriteByte('-')
			}
			out.WriteRune(char)
			separator = false
		} else {
			separator = true
		}
	}
	base := strings.Trim(out.String(), "-")
	if len(base) > 90 {
		base = strings.TrimRight(base[:90], "-")
	}
	if base != "" {
		return base, nil
	}
	var random [5]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	return "post-" + strings.ToLower(generatedSlugChars.EncodeToString(random[:])), nil
}

func validateCoverID(id *int) sql.NullInt32 {
	if id == nil || *id < 1 {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(*id), Valid: true}
}

func (a *API) CreatePost(c *gin.Context) {
	var input models.PostInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Title and content are required")
		return
	}
	if !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		httpx.Fail(c, http.StatusBadRequest, "Title and content are required")
		return
	}
	userID, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	id, ok := userID.(int)
	if !ok {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to create post")
		return
	}
	provided := strings.TrimSpace(input.Slug) != ""
	base := strings.TrimSpace(input.Slug)
	if provided {
		if !validSlug.MatchString(base) {
			httpx.Fail(c, http.StatusBadRequest, "Slug must contain 3 to 100 lowercase letters, numbers, or hyphens")
			return
		}
	} else {
		var err error
		base, err = slugify(input.Title)
		if err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "Failed to create post")
			return
		}
	}
	for attempt := 1; attempt <= 100; attempt++ {
		candidate := base
		if attempt > 1 {
			suffix := "-" + strconv.Itoa(attempt)
			candidate = strings.TrimRight(base[:min(len(base), 100-len(suffix))], "-") + suffix
		}
		err := a.q.CreatePost(c.Request.Context(), dbgen.CreatePostParams{Slug: candidate, Title: clean(input.Title), Content: clean(input.Content), AuthorID: sql.NullInt32{Int32: int32(id), Valid: true}, CoverMediaID: validateCoverID(input.CoverMediaID)})
		if err == nil {
			c.JSON(http.StatusCreated, gin.H{"message": "Post created"})
			return
		}
		if status, constraint := postEventConstraintStatus(err); constraint {
			if status == http.StatusConflict && !provided {
				continue
			}
			httpx.Fail(c, status, "Failed to create post")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Failed to create post")
		return
	}
	httpx.Fail(c, http.StatusConflict, "Could not generate a unique post slug")
}

func (a *API) UpdatePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostInput
	if !httpx.BindJSON(c, &input) || !validateText(input.Title, 180) || !validateText(input.Content, 20000) {
		httpx.Fail(c, http.StatusBadRequest, "Title and content are required")
		return
	}
	slug := sql.NullString{}
	if strings.TrimSpace(input.Slug) != "" {
		if !validSlug.MatchString(input.Slug) {
			httpx.Fail(c, http.StatusBadRequest, "Slug must contain 3 to 100 lowercase letters, numbers, or hyphens")
			return
		}
		slug = sql.NullString{String: input.Slug, Valid: true}
	}
	var coverID sql.NullInt32
	if input.CoverMediaID != nil && *input.CoverMediaID > 0 {
		coverID = validateCoverID(input.CoverMediaID)
	}
	affected, err := a.q.UpdatePost(c.Request.Context(), dbgen.UpdatePostParams{Slug: slug, Title: clean(input.Title), Content: clean(input.Content), CoverMediaID: coverID, ID: int32(id)})
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "Failed to update post")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "Failed to update post")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Post not found")
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
		httpx.Fail(c, http.StatusInternalServerError, "Failed to delete post")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Post not found")
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
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "Invalid publication status")
		return
	}
	affected, err := a.q.PublishPost(c.Request.Context(), dbgen.PublishPostParams{Published: input.Published, ID: int32(id)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to update publication status")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "Post not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Publication status updated"})
}
