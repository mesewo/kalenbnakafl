package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
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
	if kind != "" && kind != "image" && kind != "video" && kind != "audio" && kind != "document" {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.kind_is_invalid")
		return
	}
	kindArg := sql.NullString{String: kind, Valid: kind != ""}
	ctx := c.Request.Context()
	rows, err := a.q.ListMedia(ctx, dbgen.ListMediaParams{Kind: kindArg, PageSize: int32(limit), RowOffset: offset})
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	total, err := a.q.CountMedia(ctx, kindArg)
	if err != nil {
		httpx.Internal(c, "Could not count media")
		return
	}
	items := make([]models.Media, 0, len(rows))
	for _, row := range rows {
		translations, title, effective, fallback := mediaTranslationValues(row.EnTitle, row.AmTitle, language)
		item := models.Media{ID: int(row.ID), Title: title, FilePath: row.FilePath, MediaType: row.MediaType, OriginalName: row.OriginalName, SizeBytes: row.SizeBytes, Kind: row.Kind, CreatedAt: row.CreatedAt, Language: effective, Fallback: fallback}
		if _, staff := c.Get("role"); staff {
			item.Translations = translations
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, models.Page[models.Media]{Items: items, Page: page, Limit: limit, Total: total})
}

func (a *API) UploadMedia(c *gin.Context) {
	var raw map[string]*models.MediaTranslation
	if json.Unmarshal([]byte(c.PostForm("translations")), &raw) != nil {
		httpx.Fail(c, http.StatusBadRequest, "media.translations_are_required_and_must_be_valid")
		return
	}
	translations, valid := validMediaTranslations(raw)
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
	if header.Size == 0 {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.empty_files_are_not_supported")
		return
	}
	file, err := header.Open()
	if err != nil {
		httpx.Internal(c, "Could not read uploaded file")
		return
	}
	defer func() {
		if err := file.Close(); err != nil {
			httpx.Logger(c).Error("close uploaded file", "error_type", err.Error())
		}
	}()
	sample := make([]byte, 512)
	n, readErr := io.ReadFull(file, sample)
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		httpx.Internal(c, "Could not inspect uploaded file")
		return
	}
	sample = sample[:n]
	mediaType, extension, kind, ok := detectMediaType(sample)
	if !ok {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.this_file_type_is_not_supported")
		return
	}
	declaredExtension := strings.ToLower(filepath.Ext(header.Filename))
	if !extensionMatches(mediaType, declaredExtension) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "media.file_extension_does_not_match_its_content")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		httpx.Internal(c, "Could not read uploaded file")
		return
	}
	storedName, size, err := a.storage.Save(c.Request.Context(), file, extension, maxBytes)
	if errors.Is(err, storage.ErrTooLarge) {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "media.uploaded_file_exceeds_the_size_limit")
		return
	}
	if err != nil {
		if errors.Is(err, storage.ErrEmpty) {
			httpx.Fail(c, http.StatusUnprocessableEntity, "media.empty_files_are_not_supported")
			return
		}
		httpx.Internal(c, "Could not save uploaded file")
		return
	}
	path := "/uploads/" + storedName
	userID, _ := c.Get("user_id")
	uploadedBy := sql.NullInt32{}
	if id, ok := userID.(int); ok {
		uploadedBy = sql.NullInt32{Int32: int32(id), Valid: true}
	}
	originalName := cleanOriginalName(header.Filename)
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		_ = a.storage.Delete(context.Background(), storedName)
		httpx.Internal(c, "Could not save media metadata")
		return
	}
	queries := a.q.WithTx(tx)
	mediaID, err := queries.CreateMedia(c.Request.Context(), dbgen.CreateMediaParams{
		FilePath:     path,
		MediaType:    sql.NullString{String: mediaType, Valid: true},
		OriginalName: sql.NullString{String: originalName, Valid: originalName != ""},
		SizeBytes:    size, Kind: kind, UploadedBy: uploadedBy,
	})
	if err == nil {
		for locale, translation := range translations {
			if err = queries.UpsertMediaTranslation(c.Request.Context(), dbgen.UpsertMediaTranslationParams{MediaID: mediaID, Locale: locale, Title: translation.Title}); err != nil {
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
		if cleanupErr := a.storage.Delete(context.Background(), storedName); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
			httpx.Logger(c).Error("remove upload after metadata insert failure", "error_type", cleanupErr.Error())
		}
		httpx.Internal(c, "Could not save media metadata")
		return
	}
	httpx.Success(c, http.StatusCreated, "media.uploaded", gin.H{"file_path": path})
}

func (a *API) DeleteMedia(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	path, err := a.q.GetMediaFilePath(c.Request.Context(), int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	if err != nil {
		httpx.Internal(c, "Could not fetch media")
		return
	}
	removed, err := a.q.DeleteMedia(c.Request.Context(), int32(id))
	if err != nil {
		httpx.Internal(c, "Could not delete media")
		return
	}
	if removed == 0 {
		httpx.Fail(c, http.StatusNotFound, "media.not_found")
		return
	}
	storedName := strings.TrimPrefix(path, "/uploads/")
	if storedName != path {
		if err := a.storage.Delete(c.Request.Context(), storedName); err != nil && !errors.Is(err, os.ErrNotExist) {
			httpx.Logger(c).Error("remove media after deleting metadata", "media_id", id, "error_type", err.Error())
		}
	}
	httpx.Success(c, http.StatusOK, "media.deleted")
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

func detectMediaType(sample []byte) (mime, extension, kind string, ok bool) {
	if len(sample) == 0 {
		return "", "", "", false
	}
	detected := http.DetectContentType(sample)
	switch {
	case len(sample) >= 8 && string(sample[:8]) == "\x89PNG\r\n\x1a\n" && detected == "image/png":
		return "image/png", ".png", "image", true
	case len(sample) >= 3 && sample[0] == 0xff && sample[1] == 0xd8 && sample[2] == 0xff && detected == "image/jpeg":
		return "image/jpeg", ".jpg", "image", true
	case len(sample) >= 12 && string(sample[:4]) == "RIFF" && string(sample[8:12]) == "WEBP" && (detected == "image/webp" || detected == "application/octet-stream"):
		return "image/webp", ".webp", "image", true
	case len(sample) >= 5 && string(sample[:5]) == "%PDF-" && detected == "application/pdf":
		return "application/pdf", ".pdf", "document", true
	case len(sample) >= 8 && string(sample[4:8]) == "ftyp" && (detected == "video/mp4" || detected == "application/octet-stream"):
		return "video/mp4", ".mp4", "video", true
	case len(sample) >= 4 && string(sample[:4]) == "\x1a\x45\xdf\xa3" && strings.Contains(string(sample), "webm") && (detected == "video/webm" || detected == "application/octet-stream"):
		return "video/webm", ".webm", "video", true
	case (len(sample) >= 3 && string(sample[:3]) == "ID3" || len(sample) >= 2 && sample[0] == 0xff && sample[1]&0xe0 == 0xe0) && detected == "audio/mpeg":
		return "audio/mpeg", ".mp3", "audio", true
	case len(sample) >= 4 && string(sample[:4]) == "OggS" && (detected == "application/ogg" || detected == "audio/ogg"):
		return "audio/ogg", ".ogg", "audio", true
	default:
		return "", "", "", false
	}
}

func extensionMatches(mediaType, extension string) bool {
	switch mediaType {
	case "image/jpeg":
		return extension == ".jpg" || extension == ".jpeg"
	case "image/png":
		return extension == ".png"
	case "image/webp":
		return extension == ".webp"
	case "application/pdf":
		return extension == ".pdf"
	case "video/mp4":
		return extension == ".mp4"
	case "video/webm":
		return extension == ".webm"
	case "audio/mpeg":
		return extension == ".mp3"
	case "audio/ogg":
		return extension == ".ogg"
	default:
		return false
	}
}
