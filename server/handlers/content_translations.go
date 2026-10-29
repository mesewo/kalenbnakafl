package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/internal/i18n"
	"kalenbnakafl/models"
)

func contentLanguage(c *gin.Context) (string, bool) {
	language, invalid := i18n.RequestLocale(c.Request, false)
	if invalid {
		httpx.Fail(c, http.StatusUnprocessableEntity, "common.locale_invalid")
		return "", false
	}
	return language, true
}

func validPostTranslations(input map[string]*models.PostTranslation, allowRemoval bool) (map[string]*models.PostTranslation, bool) {
	if len(input) == 0 || len(input) > 2 {
		return nil, false
	}
	result := make(map[string]*models.PostTranslation, len(input))
	for locale, translation := range input {
		if !i18n.Supported(locale) {
			return nil, false
		}
		if translation == nil {
			if !allowRemoval {
				return nil, false
			}
			result[locale] = nil
			continue
		}
		translation.Title = clean(translation.Title)
		translation.Content = clean(translation.Content)
		if !validateText(translation.Title, 180) || !validateText(translation.Content, 20000) {
			return nil, false
		}
		result[locale] = translation
	}
	return result, true
}

func validEventTranslations(input map[string]*models.EventTranslation, allowRemoval bool) (map[string]*models.EventTranslation, bool) {
	if len(input) == 0 || len(input) > 2 {
		return nil, false
	}
	result := make(map[string]*models.EventTranslation, len(input))
	for locale, translation := range input {
		if !i18n.Supported(locale) {
			return nil, false
		}
		if translation == nil {
			if !allowRemoval {
				return nil, false
			}
			result[locale] = nil
			continue
		}
		translation.Title = clean(translation.Title)
		translation.Description = clean(translation.Description)
		translation.Location = clean(translation.Location)
		if !validateText(translation.Title, 180) || !validateText(translation.Description, 20000) || len(translation.Location) > 500 {
			return nil, false
		}
		result[locale] = translation
	}
	return result, true
}

func validMediaTranslations(input map[string]*models.MediaTranslation, decorative bool) (map[string]*models.MediaTranslation, bool) {
	if len(input) == 0 || len(input) > 2 {
		if len(input) != 0 || !decorative {
			return nil, false
		}
	}
	result := make(map[string]*models.MediaTranslation, len(input))
	for locale, translation := range input {
		if !i18n.Supported(locale) || translation == nil {
			return nil, false
		}
		translation.Title = clean(translation.Title)
		translation.AltText = clean(translation.AltText)
		if (translation.Title != "" && !validateText(translation.Title, 180)) ||
			(translation.AltText != "" && !validateText(translation.AltText, 500)) ||
			(!decorative && translation.AltText == "") {
			return nil, false
		}
		result[locale] = translation
	}
	if !decorative && (result["en"] == nil || result["am"] == nil) {
		return nil, false
	}
	return result, true
}

func postTranslationValues(enTitle, enContent, amTitle, amContent sql.NullString, language string) (map[string]models.PostTranslation, string, string, string, bool) {
	translations := map[string]models.PostTranslation{}
	if enTitle.Valid && enContent.Valid {
		translations["en"] = models.PostTranslation{Title: enTitle.String, Content: enContent.String}
	}
	if amTitle.Valid && amContent.Valid {
		translations["am"] = models.PostTranslation{Title: amTitle.String, Content: amContent.String}
	}
	selected, found := translations[language]
	fallback := false
	effective := language
	if !found {
		other := "en"
		if language == "en" {
			other = "am"
		}
		selected = translations[other]
		effective = other
		fallback = true
	}
	return translations, selected.Title, selected.Content, effective, fallback
}

func eventTranslationValues(enTitle, enDescription, enLocation, amTitle, amDescription, amLocation sql.NullString, language string) (map[string]models.EventTranslation, string, string, string, string, bool) {
	translations := map[string]models.EventTranslation{}
	if enTitle.Valid && enDescription.Valid && enLocation.Valid {
		translations["en"] = models.EventTranslation{Title: enTitle.String, Description: enDescription.String, Location: enLocation.String}
	}
	if amTitle.Valid && amDescription.Valid && amLocation.Valid {
		translations["am"] = models.EventTranslation{Title: amTitle.String, Description: amDescription.String, Location: amLocation.String}
	}
	selected, found := translations[language]
	fallback := false
	effective := language
	if !found {
		other := "en"
		if language == "en" {
			other = "am"
		}
		selected = translations[other]
		effective = other
		fallback = true
	}
	return translations, selected.Title, selected.Description, selected.Location, effective, fallback
}

func mediaTranslationValues(enTitle, enAltText, amTitle, amAltText sql.NullString, language string) (map[string]models.MediaTranslation, string, string, string, bool) {
	translations := map[string]models.MediaTranslation{}
	if enTitle.Valid {
		translations["en"] = models.MediaTranslation{Title: enTitle.String, AltText: enAltText.String}
	}
	if amTitle.Valid {
		translations["am"] = models.MediaTranslation{Title: amTitle.String, AltText: amAltText.String}
	}
	selected, found := translations[language]
	fallback := false
	effective := language
	if !found {
		other := "en"
		if language == "en" {
			other = "am"
		}
		selected = translations[other]
		effective = other
		fallback = true
	}
	title := selected.Title
	if title == "" {
		title = selected.AltText
	}
	return translations, title, selected.AltText, effective, fallback
}
