package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"kalenbnakafl/internal/httpx"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/models"
)

func (a *API) GetMedia(c *gin.Context) {
	rows, err := a.q.ListMedia(c.Request.Context())
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Failed to fetch media")
		return
	}
	items := make([]models.Media, 0, len(rows))
	for _, row := range rows {
		items = append(items, models.Media{
			ID: int(row.ID), Title: row.Title, FilePath: row.FilePath,
			MediaType: row.MediaType, OriginalName: row.OriginalName,
			SizeBytes: row.SizeBytes, CreatedAt: row.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, items)
}

func (a *API) UploadMedia(c *gin.Context) {
	title := clean(c.PostForm("title"))
	if !validateText(title, 180) {
		httpx.Fail(c, http.StatusBadRequest, "A media title is required")
		return
	}
	header, err := c.FormFile("file")
	if err != nil || header.Size > a.cfg.MaxUploadBytes {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "Choose a file smaller than 10MB")
		return
	}
	allowed := map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true, "video/mp4": true, "application/pdf": true}
	contentType := header.Header.Get("Content-Type")
	if !allowed[contentType] {
		httpx.Fail(c, http.StatusBadRequest, "This file type is not supported")
		return
	}
	dir := a.cfg.UploadDir
	if err := os.MkdirAll(dir, 0755); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Storage is not available")
		return
	}
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not save file")
		return
	}
	name := hex.EncodeToString(random) + "-" + filepath.Base(header.Filename)
	fullPath := filepath.Join(dir, name)
	if err := c.SaveUploadedFile(header, fullPath); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not save file")
		return
	}
	path := "/uploads/" + name
	userID, _ := c.Get("user_id")
	uploadedBy := sql.NullInt32{}
	if id, ok := userID.(int); ok {
		uploadedBy = sql.NullInt32{Int32: int32(id), Valid: true}
	}
	err = a.q.CreateMedia(c.Request.Context(), dbgen.CreateMediaParams{
		Title: title, FilePath: path,
		MediaType:    sql.NullString{String: contentType, Valid: true},
		OriginalName: sql.NullString{String: filepath.Base(header.Filename), Valid: true},
		SizeBytes:    header.Size, UploadedBy: uploadedBy,
	})
	if err != nil {
		if cleanupErr := os.Remove(fullPath); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
			httpx.Logger(c).Error("remove uploaded file after media insert failure")
		}
		httpx.Fail(c, http.StatusInternalServerError, "Could not save media metadata")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Media uploaded", "file_path": path})
}

func (a *API) DeleteMedia(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	path, err := a.q.GetMediaFilePath(c.Request.Context(), int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "Media not found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not fetch media")
		return
	}
	removed, err := a.q.DeleteMedia(c.Request.Context(), int32(id))
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not delete media")
		return
	}
	if removed == 0 {
		httpx.Fail(c, http.StatusNotFound, "Media not found")
		return
	}
	filename := filepath.Base(strings.TrimPrefix(path, "/uploads/"))
	if err := os.Remove(filepath.Join(a.cfg.UploadDir, filename)); err != nil && !errors.Is(err, os.ErrNotExist) {
		httpx.Logger(c).Error("remove media file after deleting metadata", "media_id", id)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Media deleted"})
}
