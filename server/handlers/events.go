package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/httpx"
	"kalenbnakafl/models"
)

func eventDTO(id int32, title, description string, eventDate time.Time, endsAt sql.NullTime, coverMediaID sql.NullInt32, location string, createdAt time.Time) models.Event {
	var end *time.Time
	if endsAt.Valid {
		end = &endsAt.Time
	}
	return models.Event{ID: int(id), Title: title, Description: description, EventDate: eventDate, EndsAt: end, CoverMediaID: nullableID(coverMediaID), Location: location, CreatedAt: createdAt}
}

func (a *API) GetEvents(c *gin.Context) {
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	page, limit, offset := pageArgs(c)
	upcoming := strings.EqualFold(c.Query("upcoming"), "true")
	ctx := c.Request.Context()
	args := dbgen.ListEventsParams{Upcoming: upcoming, RowOffset: offset, PageSize: int32(limit)}
	rows, err := a.q.ListEvents(ctx, args)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_fetch_events")
		return
	}
	total, err := a.q.CountEvents(ctx, upcoming)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_count_events")
		return
	}
	events := make([]models.Event, 0, len(rows))
	for _, row := range rows {
		translations, title, description, location, effective, fallback := eventTranslationValues(row.EnTitle, row.EnDescription, row.EnLocation, row.AmTitle, row.AmDescription, row.AmLocation, language)
		event := eventDTO(row.ID, title, description, row.EventDate, row.EndsAt, row.CoverMediaID, location, row.CreatedAt)
		event.Language, event.Fallback = effective, fallback
		if _, staff := c.Get("role"); staff {
			event.Translations = translations
		}
		events = append(events, event)
	}
	c.JSON(http.StatusOK, models.Page[models.Event]{Items: events, Page: page, Limit: limit, Total: total})
}

func (a *API) GetEventByID(c *gin.Context) {
	language, ok := contentLanguage(c)
	if !ok {
		return
	}
	id, ok := parseID(c)
	if !ok {
		return
	}
	row, err := a.q.GetEventByID(c.Request.Context(), int32(id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "events.not_found")
		return
	}
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_fetch_event")
		return
	}
	_, title, description, location, effective, fallback := eventTranslationValues(row.EnTitle, row.EnDescription, row.EnLocation, row.AmTitle, row.AmDescription, row.AmLocation, language)
	event := eventDTO(row.ID, title, description, row.EventDate, row.EndsAt, row.CoverMediaID, location, row.CreatedAt)
	event.Language, event.Fallback = effective, fallback
	c.JSON(http.StatusOK, event)
}

func validEvent(input models.EventInput) (time.Time, sql.NullTime, int) {
	start, ok := parseEventTime(input.EventDate)
	if !ok {
		return time.Time{}, sql.NullTime{}, http.StatusBadRequest
	}
	var end sql.NullTime
	if strings.TrimSpace(input.EndsAt) != "" {
		parsed, valid := parseEventTime(input.EndsAt)
		if !valid {
			return time.Time{}, sql.NullTime{}, http.StatusBadRequest
		}
		if !parsed.After(start) {
			return time.Time{}, sql.NullTime{}, http.StatusUnprocessableEntity
		}
		end = sql.NullTime{Time: parsed, Valid: true}
	}
	return start, end, http.StatusOK
}

func (a *API) CreateEvent(c *gin.Context) {
	var input models.EventInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "events.translations_and_valid_event_date_are_required")
		return
	}
	translations, valid := validEventTranslations(input.Translations, false)
	if !valid {
		httpx.Fail(c, http.StatusBadRequest, "events.translations_and_valid_event_date_are_required")
		return
	}
	if input.CoverMediaID != nil {
		isImage, err := validateImageMediaID(c.Request.Context(), a.db, *input.CoverMediaID)
		if err != nil {
			httpx.Internal(c, "Could not validate event cover image")
			return
		}
		if !isImage {
			httpx.Fail(c, http.StatusUnprocessableEntity, "events.cover_image_is_invalid")
			return
		}
	}
	start, end, status := validEvent(input)
	if status != http.StatusOK {
		if status == http.StatusUnprocessableEntity {
			httpx.Fail(c, status, "events.end_time_must_be_after_its_start_time")
		} else {
			httpx.Fail(c, status, "events.translations_and_valid_event_date_are_required")
		}
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_create_event")
		return
	}
	queries := a.q.WithTx(tx)
	eventID, err := queries.CreateEvent(c.Request.Context(), dbgen.CreateEventParams{EventDate: start, EndsAt: end, CoverMediaID: validateCoverID(input.CoverMediaID)})
	if err == nil {
		for locale, translation := range translations {
			if err = queries.UpsertEventTranslation(c.Request.Context(), dbgen.UpsertEventTranslationParams{EventID: eventID, Locale: locale, Title: translation.Title, Description: translation.Description, Location: translation.Location}); err != nil {
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
		if constraintStatus, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, constraintStatus, "events.failed_to_create_event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_create_event")
		return
	}
	httpx.Success(c, http.StatusCreated, "events.created")
	a.revalidate("events")
}

func (a *API) UpdateEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var input models.EventInput
	if !httpx.BindJSON(c, &input) {
		httpx.Fail(c, http.StatusBadRequest, "events.one_translation_change_and_valid_date_are_required")
		return
	}
	if len(input.Translations) != 1 {
		httpx.Fail(c, http.StatusBadRequest, "events.one_translation_change_and_valid_date_are_required")
		return
	}
	translations, valid := validEventTranslations(input.Translations, true)
	if !valid {
		httpx.Fail(c, http.StatusBadRequest, "events.translation_is_invalid")
		return
	}
	if input.CoverMediaID != nil {
		isImage, err := validateImageMediaID(c.Request.Context(), a.db, *input.CoverMediaID)
		if err != nil {
			httpx.Internal(c, "Could not validate event cover image")
			return
		}
		if !isImage {
			httpx.Fail(c, http.StatusUnprocessableEntity, "events.cover_image_is_invalid")
			return
		}
	}
	start, end, status := validEvent(input)
	if status != http.StatusOK {
		if status == http.StatusUnprocessableEntity {
			httpx.Fail(c, status, "events.end_time_must_be_after_its_start_time")
		} else {
			httpx.Fail(c, status, "events.one_translation_change_and_valid_date_are_required")
		}
		return
	}
	tx, err := a.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
		return
	}
	defer func() { _ = tx.Rollback() }()
	queries := a.q.WithTx(tx)
	if _, err = queries.LockEvent(c.Request.Context(), int32(id)); errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(c, http.StatusNotFound, "events.not_found")
		return
	} else if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
		return
	}
	for locale, translation := range translations {
		if translation == nil {
			count, countErr := queries.CountEventTranslations(c.Request.Context(), int32(id))
			if countErr != nil {
				httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
				return
			}
			if count <= 1 {
				httpx.Fail(c, http.StatusUnprocessableEntity, "events.at_least_one_translation_is_required")
				return
			}
			removed, removeErr := queries.DeleteEventTranslation(c.Request.Context(), dbgen.DeleteEventTranslationParams{EventID: int32(id), Locale: locale})
			if removeErr != nil {
				httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
				return
			}
			if removed == 0 {
				httpx.Fail(c, http.StatusNotFound, "events.translation_not_found")
				return
			}
		} else if err = queries.UpsertEventTranslation(c.Request.Context(), dbgen.UpsertEventTranslationParams{EventID: int32(id), Locale: locale, Title: translation.Title, Description: translation.Description, Location: translation.Location}); err != nil {
			httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
			return
		}
	}
	affected, err := queries.UpdateEventFields(c.Request.Context(), dbgen.UpdateEventFieldsParams{
		EventDate: start, EndsAt: end, CoverMediaID: validateCoverID(input.CoverMediaID),
		ClearCoverMedia: input.ClearCoverMedia, ID: int32(id),
	})
	if err != nil {
		if constraintStatus, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, constraintStatus, "events.failed_to_update_event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "events.not_found")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_update_event")
		return
	}
	httpx.Success(c, http.StatusOK, "events.updated")
	a.revalidate("events")
}

func (a *API) DeleteEvent(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	affected, err := a.q.DeleteEvent(c.Request.Context(), int32(id))
	if err != nil {
		if status, constraint := postEventConstraintStatus(err); constraint {
			httpx.Fail(c, status, "events.failed_to_delete_event")
			return
		}
		httpx.Fail(c, http.StatusInternalServerError, "events.failed_to_delete_event")
		return
	}
	if affected == 0 {
		httpx.Fail(c, http.StatusNotFound, "events.not_found")
		return
	}
	httpx.Success(c, http.StatusOK, "events.deleted")
	a.revalidate("events")
}
