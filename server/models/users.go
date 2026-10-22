package models

import "time"

type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}
type UserInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}
type UserUpdate struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}
type Volunteer struct {
	User
	TotalHours    float64        `json:"total_hours"`
	Contributions []Contribution `json:"contributions,omitempty"`
}
type Contribution struct {
	ID               int       `json:"id"`
	VolunteerID      int       `json:"volunteer_id"`
	Hours            float64   `json:"hours"`
	Notes            string    `json:"notes"`
	ContributionDate time.Time `json:"contribution_date"`
	CreatedAt        time.Time `json:"created_at"`
}
