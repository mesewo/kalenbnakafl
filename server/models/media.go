package models

type Media struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	FileURL string `json:"file_url"`
}
