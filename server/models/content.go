package models

import "time"

type Post struct {
	ID           int                        `json:"id"`
	Slug         string                     `json:"slug"`
	Title        string                     `json:"title"`
	Content      string                     `json:"content"`
	AuthorID     int                        `json:"author_id,omitempty"`
	AuthorName   string                     `json:"author_name,omitempty"`
	Published    bool                       `json:"published"`
	PublishedAt  *time.Time                 `json:"published_at,omitempty"`
	CoverMediaID *int                       `json:"cover_media_id,omitempty"`
	CreatedAt    time.Time                  `json:"created_at,omitempty"`
	UpdatedAt    time.Time                  `json:"updated_at,omitempty"`
	Translations map[string]PostTranslation `json:"translations,omitempty"`
	Language     string                     `json:"language"`
	Fallback     bool                       `json:"fallback"`
}
type PostInput struct {
	Translations map[string]*PostTranslation `json:"translations"`
	Slug         string                      `json:"slug"`
	CoverMediaID *int                        `json:"cover_media_id"`
}
type PostTranslation struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}
type PostPublishInput struct {
	Published bool `json:"published"`
}
type Event struct {
	ID           int                         `json:"id"`
	Title        string                      `json:"title"`
	Description  string                      `json:"description"`
	EventDate    time.Time                   `json:"event_date"`
	EndsAt       *time.Time                  `json:"ends_at,omitempty"`
	Location     string                      `json:"location"`
	CreatedAt    time.Time                   `json:"created_at,omitempty"`
	Translations map[string]EventTranslation `json:"translations,omitempty"`
	Language     string                      `json:"language"`
	Fallback     bool                        `json:"fallback"`
}
type EventInput struct {
	Translations map[string]*EventTranslation `json:"translations"`
	EventDate    string                       `json:"event_date"`
	EndsAt       string                       `json:"ends_at"`
}
type EventTranslation struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Location    string `json:"location"`
}
type Page[T any] struct {
	Items []T   `json:"items"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
	Total int64 `json:"total"`
}
type Media struct {
	ID           int                         `json:"id"`
	Title        string                      `json:"title"`
	FilePath     string                      `json:"file_path"`
	MediaType    string                      `json:"media_type,omitempty"`
	OriginalName string                      `json:"original_name,omitempty"`
	SizeBytes    int64                       `json:"size_bytes,omitempty"`
	Kind         string                      `json:"kind"`
	CreatedAt    time.Time                   `json:"created_at,omitempty"`
	Translations map[string]MediaTranslation `json:"translations,omitempty"`
	Language     string                      `json:"language"`
	Fallback     bool                        `json:"fallback"`
}
type MediaTranslation struct {
	Title string `json:"title"`
}
