package handlers

import (
	"context"
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
var inlineMediaToken = regexp.MustCompile(`\{\{media:([1-9][0-9]*)\}\}`)
var markdownImage = regexp.MustCompile(`!\[[^\]]*\]\([^)]+\)`)

func (a *API) validInlineMediaReferences(ctx context.Context, translations map[string]*models.PostTranslation) (bool, error) {
	for _, translation := range translations {
		if translation == nil {
			continue
		}
		if markdownImage.MatchString(translation.Content) {
			return false, nil
		}
		matches := inlineMediaToken.FindAllStringSubmatch(translation.Content, -1)
		withoutTokens := inlineMediaToken.ReplaceAllString(translation.Content, "")
		if strings.Contains(withoutTokens, "{{media:") {
			return false, nil
		}
		for _, match := range matches {
			id, err := strconv.ParseInt(match[1], 10, 32)
			if err != nil {
				return false, nil
			}
			var exists bool
			if err := a.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM media WHERE id=$1 AND kind='image')`, id).Scan(&exists); err != nil {
				return false, err
			}
			if !exists {
				return false, nil
			}
		}
	}
	return true, nil
}

func syncPostMediaReferences(ctx context.Context, tx *sql.Tx, postID int32, locale, content string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM post_media_references WHERE post_id=$1 AND locale=$2`, postID, locale); err != nil {
		return err
	}
	for _, match := range inlineMediaToken.FindAllStringSubmatch(content, -1) {
		id, err := strconv.ParseInt(match[1], 10, 32)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO post_media_references (post_id,locale,media_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, postID, locale, id); err != nil {
			return err
		}
	}
	return nil
}

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
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	page, limit, offset := pageArgs(c)
	_, includeUnpublished := c.Get("role")
	search := strings.TrimSpace(c.Query("q"))
	searchArg := sql.NullString{String: search, Valid: search != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListPosts(ctx, dbgen.ListPostsParams{IncludeUnpublished: includeUnpublished, Search: searchArg, RowOffset: offset, PageSize: int32(limit)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_fetch_posts")
		return
	}
	total, err := a.q.CountPosts(ctx, dbgen.CountPostsParams{IncludeUnpublished: includeUnpublished, Search: searchArg})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_count_posts")
		return
	}
	posts := make([]models.Post, 0, len(rows))
	for _, row := range rows {
		translations, title, content, effective, fallback := postTranslationValues(row.EnTitle, row.EnContent, row.AmTitle, row.AmContent, language)
		post := models.Post{ID: int(row.ID), Slug: row.Slug, Title: title, Content: content, AuthorID: int(row.AuthorID), AuthorName: row.AuthorName, Published: row.Published, PublishedAt: nullableTime(row.PublishedAt), CoverMediaID: nullableID(row.CoverMediaID), CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Language: effective, Fallback: fallback}
		if _, staff := c.Get("role"); staff {
			post.Translations = translations
		}
		posts = append(posts, post)
	}
	c.JSON(http.StatusOK, models.Page[models.Post]{Items: posts, Page: page, Limit: limit, Total: total})
}

func (a *API) GetPostBySlug(c *gin.Context) {
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	row, err := a.q.GetPostBySlug(c.Request.Context(), c.Param("slug"))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "posts.not_found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_fetch_post")
		return
	}
	_, title, content, effective, fallback := postTranslationValues(row.EnTitle, row.EnContent, row.AmTitle, row.AmContent, language)
	c.JSON(http.StatusOK, models.Post{ID: int(row.ID), Slug: row.Slug, Title: title, Content: content, AuthorID: int(row.AuthorID), AuthorName: row.AuthorName, Published: row.Published, PublishedAt: nullableTime(row.PublishedAt), CoverMediaID: nullableID(row.CoverMediaID), CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Language: effective, Fallback: fallback})
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
		httpx.Fail(c, http.StatusBadRequest, "posts.translations_are_required_and_must_be_valid")
		return
	}
	translations, valid := validPostTranslations(input.Translations, false)
	if !valid {
		httpx.Fail(c, http.StatusBadRequest, "posts.translations_are_required_and_must_be_valid")
		return
	}
	validReferences, err := a.validInlineMediaReferences(c.Request.Context(), translations)
	if err != nil {
		httpx.Internal(c, "Could not validate inline post images")
		return
	}
	if !validReferences {
		httpx.Fail(c, http.StatusUnprocessableEntity, "posts.inline_media_reference_is_invalid")
		return
	}
	if input.CoverMediaID != nil {
		isImage, err := validateImageMediaID(c.Request.Context(), a.db, *input.CoverMediaID)
		if err != nil {
			httpx.Internal(c, "Could not validate post cover image")
			return
		}
		if !isImage {
			httpx.Fail(c, http.StatusUnprocessableEntity, "posts.cover_image_is_invalid")
			return
		}
	}
	userID, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "posts.authentication_required")
		return
	}
	id, ok := userID.(int)
	if !ok {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_create_post")
		return
	}
	provided := strings.TrimSpace(input.Slug) != ""
	base := strings.TrimSpace(input.Slug)
	if provided {
		if !validSlug.MatchString(base) {
			httpx.Fail(c, http.StatusBadRequest, "posts.slug_must_contain_3_to_100_lowercase_letters_numbers_or_hyphens")
			return
		}
	} else {
		var err error
		title := ""
		if english, exists := translations["en"]; exists {
			title = english.Title
		} else {
			title = translations["am"].Title
		}
		base, err = slugify(title)
		if err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_create_post")
			return
		}
	}
	for attempt := 1; attempt <= 100; attempt++ {
		candidate := base
		if attempt > 1 {
			suffix := "-" + strconv.Itoa(attempt)
			candidate = strings.TrimRight(base[:min(len(base), 100-len(suffix))], "-") + suffix
		}
		tx, err := a.db.BeginTx(c.Request.Context(), nil)
		if err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_create_post")
			return
		}
		queries := a.q.WithTx(tx)
		postID, err := queries.CreatePost(c.Request.Context(), dbgen.CreatePostParams{Slug: candidate, AuthorID: sql.NullInt32{Int32: int32(id), Valid: true}, CoverMediaID: validateCoverID(input.CoverMediaID)})
		if err == nil {
			for locale, translation := range translations {
				if err = queries.UpsertPostTranslation(c.Request.Context(), dbgen.UpsertPostTranslationParams{PostID: postID, Locale: locale, Title: translation.Title, Content: translation.Content}); err != nil {
					break
				}
				if err = syncPostMediaReferences(c.Request.Context(), tx, postID, locale, translation.Content); err != nil {
					break
				}
			}
		}
		if err == nil {
			err = tx.Commit()
		} else {
			_ = tx.Rollback()
		}
		if err == nil {
			httpx.Success(c, http.StatusCreated, "posts.created")
			a.revalidate("posts")
			return
		}
		if status, constraint := postEventConstraintStatus(err); constraint {
			_ = tx.Rollback()
			if status == http.StatusConflict && !provided {
				continue
			}
			httpx.Fail(c, status, "posts.failed_to_create_post")
			return
		}
		_ = tx.Rollback()
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_create_post")
		return
	}
	httpx.Fail(c, http.StatusConflict, "posts.could_not_generate_a_unique_post_slug")
}

func (a *API) UpdatePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostInput
	if !httpx.BindJSON(c, &input) || len(input.Translations) != 1 {
		httpx.Fail(c, http.StatusBadRequest, "posts.one_translation_change_is_required")
		return
	}
	translations, valid := validPostTranslations(input.Translations, true)
	if !valid {
		httpx.Fail(c, http.StatusBadRequest, "posts.translation_is_invalid")
		return
	}
	validReferences, err := a.validInlineMediaReferences(c.Request.Context(), translations)
	if err != nil {
		httpx.Internal(c, "Could not validate inline post images")
		return
	}
	if !validReferences {
		httpx.Fail(c, http.StatusUnprocessableEntity, "posts.inline_media_reference_is_invalid")
		return
	}
	if input.ClearCoverMedia && input.CoverMediaID != nil {
		httpx.Fail(c, http.StatusBadRequest, "posts.cover_image_is_invalid")
		return
	}
	if input.CoverMediaID != nil {
		isImage, err := validateImageMediaID(c.Request.Context(), a.db, *input.CoverMediaID)
		if err != nil {
			httpx.Internal(c, "Could not validate post cover image")
			return
		}
		if !isImage {
			httpx.Fail(c, http.StatusUnprocessableEntity, "posts.cover_image_is_invalid")
			return
		}
	}
	slug := sql.NullString{}
	if strings.TrimSpace(input.Slug) != "" {
		if !validSlug.MatchString(strings.TrimSpace(input.Slug)) {
			httpx.Fail(c, http.StatusBadRequest, "posts.slug_must_contain_3_to_100_lowercase_letters_numbers_or_hyphens")
			return
		}
		slug = sql.NullString{String: strings.TrimSpace(input.Slug), Valid: true}
	}
	var coverID sql.NullInt32
	if input.CoverMediaID != nil && *input.CoverMediaID > 0 {
		coverID = validateCoverID(input.CoverMediaID)
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
		return
	}
	defer func() { _ = tx.Rollback() }()
	queries := a.q.WithTx(tx)
	if _, err := queries.LockPost(c.Request.Context(), int32(id)); errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "posts.not_found")
		return
	} else if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
		return
	}
	for locale, translation := range translations {
		if translation == nil {
			count, countErr := queries.CountPostTranslations(c.Request.Context(), int32(id))
			if countErr != nil {
				httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
				return
			}
			if count <= 1 {
				httpx.Fail(c, http.StatusUnprocessableEntity, "posts.at_least_one_translation_is_required")
				return
			}
			removed, removeErr := queries.DeletePostTranslation(c.Request.Context(), dbgen.DeletePostTranslationParams{PostID: int32(id), Locale: locale})
			if removeErr != nil {
				httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
				return
			}
			if removed == 0 {
				httpx.Fail(c, http.StatusNotFound, "posts.translation_not_found")
				return
			}
		} else {
			err := queries.UpsertPostTranslation(c.Request.Context(), dbgen.UpsertPostTranslationParams{PostID: int32(id), Locale: locale, Title: translation.Title, Content: translation.Content})
			if err == nil {
				err = syncPostMediaReferences(c.Request.Context(), tx, int32(id), locale, translation.Content)
			}
			if err != nil {
				httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
				return
			}
		}
	}
	if _, err := queries.UpdatePostFields(c.Request.Context(), dbgen.UpdatePostFieldsParams{
		Slug: slug, CoverMediaID: coverID, ClearCoverMedia: input.ClearCoverMedia, ID: int32(id),
	}); err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "posts.failed_to_update_post")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
		return
	}
	if err := tx.Commit(); err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "posts.failed_to_update_post")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_post")
		return
	}
	httpx.Success(c, http.StatusOK, "posts.updated")
	a.revalidate("posts")
}

func (a *API) DeletePost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	affected, err := a.q.DeletePost(c.Request.Context(), int32(id))
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_delete_post")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "posts.not_found")
		return
	}
	httpx.Success(c, http.StatusOK, "posts.deleted")
	a.revalidate("posts")
}

func (a *API) PublishPost(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.PostPublishInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "posts.invalid_publication_status")
		return
	}
	affected, err := a.q.PublishPost(c.Request.Context(), dbgen.PublishPostParams{Published: input.Published, ID: int32(id)})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "posts.failed_to_update_publication_status")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "posts.not_found")
		return
	}
	httpx.Success(c, http.StatusOK, "posts.publication_status_updated")
	a.revalidate("posts")
}
