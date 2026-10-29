package handlers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/internal/httpx"
)

type slideTranslation struct {
	Caption string `json:"caption"`
}

type slideInput struct {
	MediaID      int                          `json:"media_id"`
	Link         string                       `json:"link"`
	SortOrder    int                          `json:"sort_order"`
	Active       bool                         `json:"active"`
	Translations map[string]*slideTranslation `json:"translations"`
}

type settingTranslation struct {
	SiteName string `json:"site_name"`
	Tagline  string `json:"tagline"`
}

type siteSettingsInput struct {
	LogoMediaID        *int                           `json:"logo_media_id"`
	FaviconMediaID     *int                           `json:"favicon_media_id"`
	SocialImageMediaID *int                           `json:"social_image_media_id"`
	Translations       map[string]*settingTranslation `json:"translations"`
}

type blockTranslation struct {
	Text string `json:"text"`
}

type siteBlockInput struct {
	Translations map[string]*blockTranslation `json:"translations"`
}

type aboutImageTranslation struct {
	Caption string `json:"caption"`
}

type aboutImageInput struct {
	MediaID      int                               `json:"media_id"`
	SortOrder    int                               `json:"sort_order"`
	Translations map[string]*aboutImageTranslation `json:"translations"`
}

var siteKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

func siteText(value string, maxLength int) (string, bool) {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	value = strings.TrimSpace(value)
	if len([]rune(value)) > maxLength || strings.ContainsAny(value, "<>") {
		return "", false
	}
	for _, char := range value {
		if unicode.IsControl(char) && char != '\n' && char != '\t' {
			return "", false
		}
	}
	return value, true
}

func bothLocales[T any](translations map[string]*T) bool {
	if len(translations) != 2 || translations["en"] == nil || translations["am"] == nil {
		return false
	}
	for locale := range translations {
		if locale != "en" && locale != "am" {
			return false
		}
	}
	return true
}

func validateImageMediaID(ctx context.Context, db *sql.DB, id int) (bool, error) {
	if id < 1 || int64(id) > int64(1<<31-1) {
		return false, nil
	}
	var kind string
	err := db.QueryRowContext(ctx, `SELECT kind FROM media WHERE id = $1`, id).Scan(&kind)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return kind == "image", nil
}

func nullableSiteMediaID(id *int) sql.NullInt32 {
	if id == nil || *id < 1 {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(*id), Valid: true}
}

func siteMediaURL(id sql.NullInt32) string {
	if !id.Valid {
		return ""
	}
	return fmt.Sprintf("/api/media/%d/file", id.Int32)
}

func chooseSiteLocale(language, english, amharic string) (string, string, bool) {
	if language == "am" && amharic != "" {
		return amharic, "am", false
	}
	if language == "en" && english != "" {
		return english, "en", false
	}
	if english != "" {
		return english, "en", language != "en"
	}
	return amharic, "am", language != "am"
}

func (a *API) GetHomeSlides(c *gin.Context) {
	a.getHomeSlides(c, false)
}

func (a *API) GetAdminHomeSlides(c *gin.Context) {
	a.getHomeSlides(c, true)
}

func (a *API) getHomeSlides(c *gin.Context, admin bool) {
	language := "en"
	if !admin {
		var ok bool
		language, ok = contentLanguage(c)
		if !ok {
			return
		}
	}
	query := `
SELECT hs.id, hs.media_id, hs.link, hs.sort_order, hs.active,
       en.caption, am.caption
FROM home_slides hs
LEFT JOIN home_slide_translations en ON en.slide_id = hs.id AND en.locale = 'en'
LEFT JOIN home_slide_translations am ON am.slide_id = hs.id AND am.locale = 'am'
WHERE ($1::boolean OR hs.active)
ORDER BY hs.sort_order, hs.id`
	rows, err := a.db.QueryContext(c.Request.Context(), query, admin)
	if err != nil {
		httpx.Internal(c, "Could not fetch home slides")
		return
	}
	defer func() {
		if err := rows.Close(); err != nil {
			slog.Error("close home slide rows", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	slides := make([]gin.H, 0)
	for rows.Next() {
		var id, mediaID, order int
		var link string
		var active bool
		var en, am sql.NullString
		if err := rows.Scan(&id, &mediaID, &link, &order, &active, &en, &am); err != nil {
			httpx.Internal(c, "Could not read home slides")
			return
		}
		selected, effective, fallback := chooseSiteLocale(language, en.String, am.String)
		slide := gin.H{
			"id": id, "media_id": mediaID, "image_url": fmt.Sprintf("/api/media/%d/file", mediaID),
			"caption": selected, "link": link, "sort_order": order, "active": active,
			"language": effective, "fallback": fallback,
		}
		if admin {
			slide["translations"] = gin.H{"en": gin.H{"caption": en.String}, "am": gin.H{"caption": am.String}}
		}
		slides = append(slides, slide)
	}
	if err := rows.Err(); err != nil {
		httpx.Internal(c, "Could not read home slides")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": slides, "language": language})
}

func (a *API) CreateHomeSlide(c *gin.Context) {
	var input slideInput
	if !httpx.BindJSON(c, &input) || !validSlideInput(&input) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_home_slide")
		return
	}
	isImage, err := validateImageMediaID(c.Request.Context(), a.db, input.MediaID)
	if err != nil {
		httpx.Internal(c, "Could not validate slide image")
		return
	}
	if !isImage {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_home_slide")
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not create home slide")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var id int
	err = tx.QueryRowContext(c.Request.Context(),
		`INSERT INTO home_slides (media_id, link, sort_order, active) VALUES ($1,$2,$3,$4) RETURNING id`,
		input.MediaID, input.Link, input.SortOrder, input.Active).Scan(&id)
	if err == nil {
		err = writeSlideTranslations(c, tx, id, input.Translations)
	}
	if err != nil {
		httpx.Internal(c, "Could not create home slide")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not create home slide")
		return
	}
	httpx.Success(c, http.StatusCreated, "site.home_slide_created", gin.H{"id": id})
}

func (a *API) UpdateHomeSlide(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input slideInput
	if !httpx.BindJSON(c, &input) || !validSlideInput(&input) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_home_slide")
		return
	}
	isImage, err := validateImageMediaID(c.Request.Context(), a.db, input.MediaID)
	if err != nil {
		httpx.Internal(c, "Could not validate slide image")
		return
	}
	if !isImage {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_home_slide")
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not update home slide")
		return
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(c.Request.Context(),
		`UPDATE home_slides SET media_id=$1, link=$2, sort_order=$3, active=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5`,
		input.MediaID, input.Link, input.SortOrder, input.Active, id)
	if err != nil {
		httpx.Internal(c, "Could not update home slide")
		return
	}
	changed, err := result.RowsAffected()
	if err != nil {
		httpx.Internal(c, "Could not update home slide")
		return
	}
	if changed == 0 {
		httpx.Fail(c, http.StatusNotFound, "site.home_slide_not_found")
		return
	}
	if err := writeSlideTranslations(c, tx, id, input.Translations); err != nil {
		httpx.Internal(c, "Could not update home slide")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not update home slide")
		return
	}
	httpx.Success(c, http.StatusOK, "site.home_slide_updated")
}

func (a *API) DeleteHomeSlide(c *gin.Context) {
	deleteSiteRow(c, a.db, `DELETE FROM home_slides WHERE id=$1`, "site.home_slide_not_found", "site.home_slide_deleted")
}

func validSlideInput(input *slideInput) bool {
	if input.SortOrder < 0 || input.SortOrder > 1000000 || !bothLocales(input.Translations) ||
		input.MediaID < 1 {
		return false
	}
	if input.Link != "" && (len(input.Link) > 1000 || !strings.HasPrefix(input.Link, "/") ||
		strings.HasPrefix(input.Link, "//") || strings.ContainsAny(input.Link, "\\\r\n")) {
		return false
	}
	for _, translation := range input.Translations {
		if _, ok := siteText(translation.Caption, 2000); !ok {
			return false
		}
	}
	return true
}

func writeSlideTranslations(c *gin.Context, tx *sql.Tx, id int, translations map[string]*slideTranslation) error {
	for locale, translation := range translations {
		caption, _ := siteText(translation.Caption, 2000)
		if _, err := tx.ExecContext(c.Request.Context(), `INSERT INTO home_slide_translations (slide_id,locale,caption) VALUES ($1,$2,$3) ON CONFLICT (slide_id,locale) DO UPDATE SET caption=EXCLUDED.caption`, id, locale, caption); err != nil {
			return err
		}
	}
	return nil
}

func (a *API) GetSiteSettings(c *gin.Context) {
	a.getSiteSettings(c, false)
}

func (a *API) GetAdminSiteSettings(c *gin.Context) {
	a.getSiteSettings(c, true)
}

func (a *API) getSiteSettings(c *gin.Context, admin bool) {
	language := "en"
	if !admin {
		var ok bool
		language, ok = contentLanguage(c)
		if !ok {
			return
		}
	}
	var logoID, faviconID, socialID sql.NullInt32
	var enName, enTagline, amName, amTagline sql.NullString
	err := a.db.QueryRowContext(c.Request.Context(), `
SELECT s.logo_media_id, s.favicon_media_id, s.social_image_media_id,
       en.site_name, en.tagline, am.site_name, am.tagline
FROM site_settings s
LEFT JOIN site_setting_translations en ON en.settings_id=s.id AND en.locale='en'
LEFT JOIN site_setting_translations am ON am.settings_id=s.id AND am.locale='am'
WHERE s.id=1`).Scan(&logoID, &faviconID, &socialID, &enName, &enTagline, &amName, &amTagline)
	if err != nil {
		httpx.Internal(c, "Could not fetch site settings")
		return
	}
	name, effective, nameFallback := chooseSiteLocale(language, enName.String, amName.String)
	tagline, _, taglineFallback := chooseSiteLocale(language, enTagline.String, amTagline.String)
	result := gin.H{
		"logo_media_id": nullableID(logoID), "logo_url": siteMediaURL(logoID),
		"favicon_media_id": nullableID(faviconID), "favicon_url": siteMediaURL(faviconID),
		"social_image_media_id": nullableID(socialID), "social_image_url": siteMediaURL(socialID),
		"site_name": name, "tagline": tagline, "language": effective,
		"fallback": nameFallback || taglineFallback,
	}
	if admin {
		result["translations"] = gin.H{
			"en": gin.H{"site_name": enName.String, "tagline": enTagline.String},
			"am": gin.H{"site_name": amName.String, "tagline": amTagline.String},
		}
	}
	c.JSON(http.StatusOK, result)
}

func (a *API) UpdateSiteSettings(c *gin.Context) {
	var input siteSettingsInput
	if !httpx.BindJSON(c, &input) || !bothLocales(input.Translations) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_settings")
		return
	}
	for _, mediaID := range []*int{input.LogoMediaID, input.FaviconMediaID, input.SocialImageMediaID} {
		if mediaID != nil {
			if *mediaID < 0 {
				httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_settings")
				return
			}
			if *mediaID > 0 {
				isImage, err := validateImageMediaID(c.Request.Context(), a.db, *mediaID)
				if err != nil {
					httpx.Internal(c, "Could not validate site image")
					return
				}
				if !isImage {
					httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_settings")
					return
				}
			}
		}
	}
	for _, translation := range input.Translations {
		if _, ok := siteText(translation.SiteName, 180); !ok {
			httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_settings")
			return
		}
		if _, ok := siteText(translation.Tagline, 1000); !ok {
			httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_settings")
			return
		}
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not update site settings")
		return
	}
	defer func() { _ = tx.Rollback() }()
	_, err = tx.ExecContext(c.Request.Context(), `UPDATE site_settings SET logo_media_id=$1, favicon_media_id=$2, social_image_media_id=$3, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
		nullableSiteMediaID(input.LogoMediaID), nullableSiteMediaID(input.FaviconMediaID), nullableSiteMediaID(input.SocialImageMediaID))
	for locale, translation := range input.Translations {
		name, _ := siteText(translation.SiteName, 180)
		tagline, _ := siteText(translation.Tagline, 1000)
		if err == nil {
			_, err = tx.ExecContext(c.Request.Context(), `INSERT INTO site_setting_translations (settings_id,locale,site_name,tagline) VALUES (1,$1,$2,$3) ON CONFLICT (settings_id,locale) DO UPDATE SET site_name=EXCLUDED.site_name, tagline=EXCLUDED.tagline`,
				locale, name, tagline)
		}
	}
	if err != nil {
		httpx.Internal(c, "Could not update site settings")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not update site settings")
		return
	}
	httpx.Success(c, http.StatusOK, "site.settings_updated")
}

func (a *API) GetSiteBlocks(c *gin.Context) {
	a.getSiteBlocks(c, false)
}

func (a *API) GetAdminSiteBlocks(c *gin.Context) {
	a.getSiteBlocks(c, true)
}

func (a *API) getSiteBlocks(c *gin.Context, admin bool) {
	language := "en"
	if !admin {
		var ok bool
		language, ok = contentLanguage(c)
		if !ok {
			return
		}
	}
	page := strings.TrimSpace(c.Query("page"))
	if page != "" && !siteKeyPattern.MatchString(page) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_block_key")
		return
	}
	rows, err := a.db.QueryContext(c.Request.Context(), `
SELECT b.page,b.block_key,en.text,am.text,b.updated_at
FROM site_blocks b
LEFT JOIN site_block_translations en ON en.block_id=b.id AND en.locale='en'
LEFT JOIN site_block_translations am ON am.block_id=b.id AND am.locale='am'
WHERE $1='' OR b.page=$1
ORDER BY b.page,b.block_key`, page)
	if err != nil {
		httpx.Internal(c, "Could not fetch site blocks")
		return
	}
	defer func() {
		if err := rows.Close(); err != nil {
			slog.Error("close site block rows", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	items := make([]gin.H, 0)
	for rows.Next() {
		var blockPage, key string
		var en, am sql.NullString
		var updatedAt time.Time
		if err := rows.Scan(&blockPage, &key, &en, &am, &updatedAt); err != nil {
			httpx.Internal(c, "Could not read site blocks")
			return
		}
		text, effective, fallback := chooseSiteLocale(language, en.String, am.String)
		block := gin.H{
			"page": blockPage, "key": key, "text": text,
			"language": effective, "fallback": fallback, "updated_at": updatedAt,
		}
		if admin {
			block["translations"] = gin.H{"en": gin.H{"text": en.String}, "am": gin.H{"text": am.String}}
		}
		items = append(items, block)
	}
	if err := rows.Err(); err != nil {
		httpx.Internal(c, "Could not read site blocks")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "language": language})
}

func (a *API) UpsertSiteBlock(c *gin.Context) {
	page, key := c.Param("page"), c.Param("key")
	if !siteKeyPattern.MatchString(page) || !siteKeyPattern.MatchString(key) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_block_key")
		return
	}
	var input siteBlockInput
	if !httpx.BindJSON(c, &input) || !bothLocales(input.Translations) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_block")
		return
	}
	for _, translation := range input.Translations {
		if _, ok := siteText(translation.Text, 20000); !ok {
			httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_site_block")
			return
		}
	}
	userID, ok := c.Get("user_id")
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "auth.authentication_required")
		return
	}
	authorID, ok := userID.(int)
	if !ok {
		httpx.Internal(c, "Could not save site block")
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not save site block")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var id int
	err = tx.QueryRowContext(c.Request.Context(), `
INSERT INTO site_blocks (page,block_key,updated_by,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
ON CONFLICT (page,block_key) DO UPDATE SET updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP
RETURNING id`, page, key, authorID).Scan(&id)
	for locale, translation := range input.Translations {
		text, _ := siteText(translation.Text, 20000)
		if err == nil {
			_, err = tx.ExecContext(c.Request.Context(), `INSERT INTO site_block_translations (block_id,locale,text) VALUES ($1,$2,$3) ON CONFLICT (block_id,locale) DO UPDATE SET text=EXCLUDED.text`, id, locale, text)
		}
	}
	if err != nil {
		httpx.Internal(c, "Could not save site block")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not save site block")
		return
	}
	httpx.Success(c, http.StatusOK, "site.block_saved")
}

func (a *API) GetAboutImages(c *gin.Context) {
	a.getAboutImages(c, false)
}

func (a *API) GetAdminAboutImages(c *gin.Context) {
	a.getAboutImages(c, true)
}

func (a *API) getAboutImages(c *gin.Context, admin bool) {
	language := "en"
	if !admin {
		var ok bool
		language, ok = contentLanguage(c)
		if !ok {
			return
		}
	}
	rows, err := a.db.QueryContext(c.Request.Context(), `
SELECT ai.id,ai.media_id,ai.sort_order,en.caption,am.caption
FROM about_images ai
LEFT JOIN about_image_translations en ON en.image_id=ai.id AND en.locale='en'
LEFT JOIN about_image_translations am ON am.image_id=ai.id AND am.locale='am'
ORDER BY ai.sort_order,ai.id`)
	if err != nil {
		httpx.Internal(c, "Could not fetch about images")
		return
	}
	defer func() {
		if err := rows.Close(); err != nil {
			slog.Error("close about image rows", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	items := make([]gin.H, 0)
	for rows.Next() {
		var id, mediaID, order int
		var en, am sql.NullString
		if err := rows.Scan(&id, &mediaID, &order, &en, &am); err != nil {
			httpx.Internal(c, "Could not read about images")
			return
		}
		caption, effective, fallback := chooseSiteLocale(language, en.String, am.String)
		item := gin.H{
			"id": id, "media_id": mediaID, "image_url": fmt.Sprintf("/api/media/%d/file", mediaID),
			"caption": caption, "sort_order": order, "language": effective, "fallback": fallback,
		}
		if admin {
			item["translations"] = gin.H{"en": gin.H{"caption": en.String}, "am": gin.H{"caption": am.String}}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		httpx.Internal(c, "Could not read about images")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "language": language})
}

func (a *API) CreateAboutImage(c *gin.Context) {
	var input aboutImageInput
	if !httpx.BindJSON(c, &input) || !validAboutImageInput(&input) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_about_image")
		return
	}
	isImage, err := validateImageMediaID(c.Request.Context(), a.db, input.MediaID)
	if err != nil {
		httpx.Internal(c, "Could not validate about image")
		return
	}
	if !isImage {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_about_image")
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not create about image")
		return
	}
	defer func() { _ = tx.Rollback() }()
	var id int
	err = tx.QueryRowContext(c.Request.Context(), `INSERT INTO about_images (media_id,sort_order) VALUES ($1,$2) RETURNING id`, input.MediaID, input.SortOrder).Scan(&id)
	if err == nil {
		err = writeAboutImageTranslations(c, tx, id, input.Translations)
	}
	if err != nil {
		httpx.Internal(c, "Could not create about image")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not create about image")
		return
	}
	httpx.Success(c, http.StatusCreated, "site.about_image_created", gin.H{"id": id})
}

func (a *API) UpdateAboutImage(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input aboutImageInput
	if !httpx.BindJSON(c, &input) || !validAboutImageInput(&input) {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_about_image")
		return
	}
	isImage, err := validateImageMediaID(c.Request.Context(), a.db, input.MediaID)
	if err != nil {
		httpx.Internal(c, "Could not validate about image")
		return
	}
	if !isImage {
		httpx.Fail(c, http.StatusUnprocessableEntity, "site.invalid_about_image")
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Internal(c, "Could not update about image")
		return
	}
	defer func() { _ = tx.Rollback() }()
	result, err := tx.ExecContext(c.Request.Context(), `UPDATE about_images SET media_id=$1,sort_order=$2 WHERE id=$3`, input.MediaID, input.SortOrder, id)
	if err != nil {
		httpx.Internal(c, "Could not update about image")
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		httpx.Internal(c, "Could not update about image")
		return
	}
	if count == 0 {
		httpx.Fail(c, http.StatusNotFound, "site.about_image_not_found")
		return
	}
	if err := writeAboutImageTranslations(c, tx, id, input.Translations); err != nil {
		httpx.Internal(c, "Could not update about image")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, "Could not update about image")
		return
	}
	httpx.Success(c, http.StatusOK, "site.about_image_updated")
}

func (a *API) DeleteAboutImage(c *gin.Context) {
	deleteSiteRow(c, a.db, `DELETE FROM about_images WHERE id=$1`, "site.about_image_not_found", "site.about_image_deleted")
}

func validAboutImageInput(input *aboutImageInput) bool {
	if input.SortOrder < 0 || input.SortOrder > 1000000 || !bothLocales(input.Translations) || input.MediaID < 1 {
		return false
	}
	for _, translation := range input.Translations {
		if _, ok := siteText(translation.Caption, 2000); !ok {
			return false
		}
	}
	return true
}

func writeAboutImageTranslations(c *gin.Context, tx *sql.Tx, id int, translations map[string]*aboutImageTranslation) error {
	for locale, translation := range translations {
		caption, _ := siteText(translation.Caption, 2000)
		if _, err := tx.ExecContext(c.Request.Context(), `INSERT INTO about_image_translations (image_id,locale,caption) VALUES ($1,$2,$3) ON CONFLICT (image_id,locale) DO UPDATE SET caption=EXCLUDED.caption`, id, locale, caption); err != nil {
			return err
		}
	}
	return nil
}

func deleteSiteRow(c *gin.Context, db *sql.DB, query, notFoundCode, successCode string) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	result, err := db.ExecContext(c.Request.Context(), query, id)
	if err != nil {
		httpx.Internal(c, "Could not delete site content")
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		httpx.Internal(c, "Could not delete site content")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, notFoundCode)
		return
	}
	httpx.Success(c, http.StatusOK, successCode)
}
