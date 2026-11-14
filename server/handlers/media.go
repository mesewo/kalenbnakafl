package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/internal/mediaimage"
	"kalenbnakafl/internal/storage"
	"kalenbnakafl/models"
)

func (a *API) GetMedia(c *gin.Context) {
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	page, limit, offset := pageArgs(c)
	kind := strings.TrimSpace(c.Query("kind"))
	if kind != "" && kind != "image" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.kind_is_invalid")
		return
	}
	kindArg := sql.NullString{String: kind, Valid: kind != ""}
	_, staff := c.Get("role")
	ctx := c.Request.Context()
	rows, err := a.q.ListMedia(ctx, dbgen.ListMediaParams{Kind: kindArg, Staff: staff, PageSize: int32(limit), RowOffset: offset})
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	total, err := a.q.CountMedia(ctx, dbgen.CountMediaParams{Kind: kindArg, Staff: staff})
	if err != nil {
		httpx.Internal(c, "Could not count media")
		return
	}
	items := make([]models.Media, 0, len(rows))
	for _, row := range rows {
		translations, title, altText, effective, fallback := mediaTranslationValues(row.EnTitle, row.EnAltText, row.AmTitle, row.AmAltText, language)
		item := models.Media{
			ID: int(row.ID), Title: title, AltText: altText,
			FilePath:  fmt.Sprintf("/api/media/%d/file", row.ID),
			MediaType: row.MediaType, OriginalName: row.OriginalName, SizeBytes: row.SizeBytes,
			Width: int(row.Width), Height: int(row.Height), Decorative: row.Decorative,
			Kind: row.Kind, CreatedAt: row.CreatedAt, Language: effective, Fallback: fallback,
		}
		if _, staff := c.Get("role"); staff {
			item.Translations = translations
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, models.Page[models.Media]{Items: items, Page: page, Limit: limit, Total: total})
}

func (a *API) GetPublicMediaInfo(c *gin.Context) {
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	id, ok := parseID(c)
	if !ok {
		return
	}
	var enTitle, enAlt, amTitle, amAlt sql.NullString
	var width, height int
	var decorative bool
	err := a.db.QueryRowContext(c.Request.Context(), `
SELECT en.title,en.alt_text,am.title,am.alt_text,COALESCE(m.width,0),COALESCE(m.height,0),m.decorative
FROM media m
LEFT JOIN media_translations en ON en.media_id=m.id AND en.locale='en'
LEFT JOIN media_translations am ON am.media_id=m.id AND am.locale='am'
WHERE m.id=$1 AND m.kind='image' AND (
    EXISTS (SELECT 1 FROM posts p WHERE p.cover_media_id=m.id AND p.published) OR
    EXISTS (SELECT 1 FROM post_media_references pmr JOIN posts p ON p.id=pmr.post_id WHERE p.published AND pmr.media_id=m.id) OR
    EXISTS (SELECT 1 FROM events e WHERE e.cover_media_id=m.id) OR
    EXISTS (SELECT 1 FROM home_slides hs WHERE hs.media_id=m.id AND hs.active) OR
    EXISTS (SELECT 1 FROM about_images ai WHERE ai.media_id=m.id) OR
    EXISTS (SELECT 1 FROM site_settings s WHERE s.logo_media_id=m.id OR s.favicon_media_id=m.id OR s.social_image_media_id=m.id)
)`, int32(id)).Scan(&enTitle, &enAlt, &amTitle, &amAlt, &width, &height, &decorative)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	_, title, altText, effective, fallback := mediaTranslationValues(enTitle, enAlt, amTitle, amAlt, language)
	c.JSON(http.StatusOK, models.Media{
		ID: id, Title: title, AltText: altText, FilePath: fmt.Sprintf("/api/media/%d/file", id),
		Width: width, Height: height, Decorative: decorative, Kind: "image",
		Language: effective, Fallback: fallback,
	})
}

func (a *API) UploadMedia(c *gin.Context) {
	decorative, err := strconv.ParseBool(c.PostForm("decorative"))
	if err != nil && c.PostForm("decorative") != "" {
		httpx.Fail(c, http.StatusBadRequest, "media.decorative_flag_is_invalid")
		return
	}
	var translations map[string]*models.MediaTranslation
	if json.Unmarshal([]byte(c.PostForm("translations")), &translations) != nil {
		httpx.Fail(c, http.StatusBadRequest, "media.translations_are_required_and_must_be_valid")
		return
	}
	translations, valid := validMediaTranslations(translations, decorative)
	if !valid {
		httpx.Fail(c, http.StatusBadRequest, "media.translations_are_required_and_must_be_valid")
		return
	}
	header, err := c.FormFile("file")
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "media.choose_a_supported_file")
		return
	}
	maxBytes := a.cfg.MediaMaxMB * 1024 * 1024
	if header.Size > maxBytes {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "media.uploaded_file_exceeds_the_size_limit")
		return
	}
	file, err := header.Open()
	if err != nil {
		httpx.Internal(c, "Could not read uploaded image")
		return
	}
	defer func() {
		if err := file.Close(); err != nil {
			httpx.Logger(c).Error("close uploaded image", "error_type", err.Error())
		}
	}()
	processed, err := mediaimage.Process(file, maxBytes)
	if errors.Is(err, mediaimage.ErrTooLarge) {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "media.uploaded_file_exceeds_the_size_limit")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.this_file_type_is_not_supported")
		return
	}

	stored := make(map[int]string, 3)
	variantPaths := map[int]sql.NullString{}
	for _, target := range []int{480, 960, 1600} {
		variant := processed.Variants[target]
		if name, ok := stored[variant.Width]; ok {
			variantPaths[target] = sql.NullString{String: name, Valid: true}
			continue
		}
		name, _, saveErr := a.storage.Save(c.Request.Context(), bytes.NewReader(variant.Data), variant.Extension, maxBytes)
		if saveErr != nil {
			removeStoredObjects(c, a.storage, stored)
			if errors.Is(saveErr, storage.ErrTooLarge) {
				httpx.Fail(c, http.StatusRequestEntityTooLarge, "media.uploaded_file_exceeds_the_size_limit")
			} else {
				httpx.Internal(c, "Could not save processed image")
			}
			return
		}
		stored[variant.Width] = name
		variantPaths[target] = sql.NullString{String: name, Valid: true}
	}

	userID, _ := c.Get("user_id")
	uploadedBy := sql.NullInt32{}
	if id, ok := userID.(int); ok {
		uploadedBy = sql.NullInt32{Int32: int32(id), Valid: true}
	}
	originalName := cleanOriginalName(header.Filename)
	mediaType := processed.Variants[1600].MediaType
	var storedBytes int64
	countedWidths := make(map[int]bool, len(processed.Variants))
	for _, variant := range processed.Variants {
		if countedWidths[variant.Width] {
			continue
		}
		countedWidths[variant.Width] = true
		storedBytes += int64(len(variant.Data))
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		removeStoredObjects(c, a.storage, stored)
		httpx.Internal(c, "Could not save image metadata")
		return
	}
	queries := a.q.WithTx(tx)
	mediaID, err := queries.CreateImageMedia(c.Request.Context(), dbgen.CreateImageMediaParams{
		FilePath: variantPaths[1600].String, MediaType: sql.NullString{String: mediaType, Valid: true},
		OriginalName: sql.NullString{String: originalName, Valid: originalName != ""},
		SizeBytes:    storedBytes, UploadedBy: uploadedBy,
		Width:          sql.NullInt32{Int32: int32(processed.Width), Valid: true},
		Height:         sql.NullInt32{Int32: int32(processed.Height), Valid: true},
		Decorative:     decorative,
		Variant480Path: variantPaths[480], Variant960Path: variantPaths[960], Variant1600Path: variantPaths[1600],
	})
	if err == nil {
		for locale, translation := range translations {
			if err = queries.UpsertMediaTranslation(c.Request.Context(), dbgen.UpsertMediaTranslationParams{
				MediaID: mediaID, Locale: locale, Title: translation.Title, AltText: translation.AltText,
			}); err != nil {
				break
			}
		}
	}
	if err == nil {
		err = tx.Commit()
	} else {
		_ = tx.Rollback()
	}
	if err != nil {
		_ = tx.Rollback()
		removeStoredObjects(c, a.storage, stored)
		httpx.Internal(c, "Could not save image metadata")
		return
	}
	httpx.Success(c, http.StatusCreated, "media.uploaded", gin.H{
		"id": mediaID, "file_path": fmt.Sprintf("/api/media/%d/file", mediaID),
		"width": processed.Width, "height": processed.Height,
	})
	a.revalidate("media")
}

func removeStoredObjects(c *gin.Context, store storage.Storage, objects map[int]string) {
	for _, name := range objects {
		if err := store.Delete(context.Background(), name); err != nil && !errors.Is(err, os.ErrNotExist) {
			httpx.Logger(c).Error("remove image after upload failure", "error_type", err.Error())
		}
	}
}

func (a *API) GetMediaUsages(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	_, err := a.q.GetMediaFilePath(c.Request.Context(), int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	usages, err := a.q.ListMediaUsages(c.Request.Context(), sql.NullInt32{Int32: int32(id), Valid: true})
	if err != nil {
		httpx.Internal(c, "Could not fetch media usage")
		return
	}
	c.JSON(http.StatusOK, gin.H{"usages": usages})
}

func (a *API) DeleteMedia(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not delete media")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var filePath string
	var variant480, variant960, variant1600 sql.NullString
	err = tx.QueryRowContext(c.Request.Context(),
		`SELECT file_path, variant_480_path, variant_960_path, variant_1600_path FROM media WHERE id = $1 FOR UPDATE`,
		int32(id),
	).Scan(&filePath, &variant480, &variant960, &variant1600)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	queries := a.q.WithTx(tx)
	usages, err := queries.ListMediaUsages(c.Request.Context(), sql.NullInt32{Int32: int32(id), Valid: true})
	if err != nil {
		httpx.Internal(c, "Could not fetch media usage")
		return
	}
	if len(usages) > 0 {
		httpx.Write(c, http.StatusConflict, "conflict", "Media is in use.", gin.H{"usages": usages})
		return
	}
	removed, err := queries.DeleteMedia(c.Request.Context(), int32(id))
	if err != nil {
		httpx.Internal(c, "Could not delete media")
		return
	}
	if removed == 0 {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not delete media")
		return
	}
	storedObjects := map[int]string{0: storageKey(filePath)}
	for index, path := range []sql.NullString{variant480, variant960, variant1600} {
		if path.Valid {
			storedObjects[index+1] = storageKey(path.String)
		}
	}
	uniqueObjects := make(map[int]string, len(storedObjects))
	seen := map[string]bool{}
	for _, name := range storedObjects {
		if name != "" && !seen[name] {
			seen[name] = true
			uniqueObjects[len(uniqueObjects)] = name
		}
	}
	for _, name := range uniqueObjects {
		if err := a.storage.Delete(c.Request.Context(), name); err != nil && !errors.Is(err, os.ErrNotExist) {
			httpx.Logger(c).Error("remove media object after metadata deletion", "media_id", id, "error_type", err.Error())
		}
	}
	httpx.Success(c, http.StatusOK, "media.deleted")
	a.revalidate("media")
}

func (a *API) GetMediaFile(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	width := 1600
	if value := c.Query("w"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || (parsed != 480 && parsed != 960 && parsed != 1600) {
			httpx.Fail(c, http.StatusBadRequest, "media.variant_width_is_invalid")
			return
		}
		width = parsed
	}
	_, staff := c.Get("role")
	result, err := a.q.GetMediaVariant(c.Request.Context(), dbgen.GetMediaVariantParams{ID: int32(id), Width: int32(width), Staff: staff})
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	if !result.IsPublic.Valid || !result.IsPublic.Bool {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	name := storageKey(result.StoragePath)
	if name == "" {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	etag := fmt.Sprintf(`"%x"`, sha256.Sum256([]byte(name)))
	c.Header("ETag", etag)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	if staff {
		c.Header("Cache-Control", "private, no-store")
	} else {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	}
	if ifNoneMatch(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return
	}
	file, metadata, err := a.storage.Open(c.Request.Context(), name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.NotFound(c.Writer, c.Request)
			return
		}
		httpx.Logger(c).Error("open served media object", "error_type", fmt.Sprintf("%T", err))
		httpx.Internal(c, "Could not read media")
		return
	}
	defer func() {
		if err := file.Close(); err != nil {
			httpx.Logger(c).Error("close served media file", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	if result.MediaType != "" {
		c.Header("Content-Type", result.MediaType)
	} else if metadata.ContentType != "" {
		c.Header("Content-Type", metadata.ContentType)
	}
	http.ServeContent(c.Writer, c.Request, name, metadata.ModTime, file)
}

func storageKey(path string) string {
	return strings.TrimPrefix(path, "/uploads/")
}

func ifNoneMatch(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

func cleanOriginalName(value string) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	runes := []rune(value)
	if len(runes) > 255 {
		value = string(runes[:255])
	}
	return strings.TrimSpace(value)
}
