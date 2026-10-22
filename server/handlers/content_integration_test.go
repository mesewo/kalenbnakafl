package handlers_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/handlers"
	"kalenbnakafl/models"
)

func insertTestPost(t *testing.T, db *sql.DB, authorID int32, published bool) int32 {
	t.Helper()
	var id int32
	err := db.QueryRow(`INSERT INTO posts(title, content, author_id, published) VALUES ('fixture', 'fixture', $1, $2) RETURNING id`, authorID, published).Scan(&id)
	if err != nil {
		t.Fatalf("insert post fixture: %v", err)
	}
	return id
}

func insertTestEvent(t *testing.T, db *sql.DB) int32 {
	t.Helper()
	var id int32
	err := db.QueryRow(`INSERT INTO events(title, description, event_date) VALUES ('fixture', 'fixture', $1) RETURNING id`, time.Now().Add(48*time.Hour)).Scan(&id)
	if err != nil {
		t.Fatalf("insert event fixture: %v", err)
	}
	return id
}

func TestPublicPostListExcludesDrafts(t *testing.T) {
	db, q, r := authTestApp(t)
	authorID := createAuthUser(t, q, "Post Author", "post-author@example.org", "a-long-test-password", "user")
	draftID := insertTestPost(t, db, authorID, false)
	publishedID := insertTestPost(t, db, authorID, true)
	publicResponse := authRequest(r, http.MethodGet, "/api/posts", "")
	if publicResponse.Code != http.StatusOK {
		t.Fatalf("public posts status=%d body=%s", publicResponse.Code, publicResponse.Body)
	}
	var publicPosts []models.Post
	if err := json.Unmarshal(publicResponse.Body.Bytes(), &publicPosts); err != nil {
		t.Fatalf("decode public posts: %v", err)
	}
	if len(publicPosts) != 1 || publicPosts[0].ID != int(publishedID) {
		t.Fatalf("public list = %#v; expected only published id %d (draft %d)", publicPosts, publishedID, draftID)
	}
	adminID := createAuthUser(t, q, "Staff", "post-admin@example.org", "a-long-test-password", "admin")
	staffResponse := authRequest(r, http.MethodGet, "/api/admin/posts", "", adminCookie(t, int(adminID), "admin"))
	var staffPosts []models.Post
	if staffResponse.Code != http.StatusOK || json.Unmarshal(staffResponse.Body.Bytes(), &staffPosts) != nil || len(staffPosts) != 2 {
		t.Fatalf("staff posts status=%d body=%s", staffResponse.Code, staffResponse.Body)
	}
}

func TestPostCreateUsesAuthenticatedAuthor(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "author-check@example.org", "a-long-test-password", "admin")
	response := authRequest(r, http.MethodPost, "/api/admin/posts", `{"title":"forged author","content":"body","author_id":2147483000}`, adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusCreated {
		t.Fatalf("create post status=%d body=%s", response.Code, response.Body)
	}
	var authorID int32
	if err := db.QueryRow(`SELECT author_id FROM posts WHERE title = 'forged author'`).Scan(&authorID); err != nil {
		t.Fatalf("read post author: %v", err)
	}
	if authorID != adminID {
		t.Fatalf("author_id=%d; want authenticated user %d", authorID, adminID)
	}
}

func TestPostEventWriteRoleMatrix(t *testing.T) {
	db, q, r := authTestApp(t)
	ids := map[string]int32{}
	for _, role := range []string{"user", "volunteer", "editor", "admin"} {
		ids[role] = createAuthUser(t, q, role, role+"@matrix.example.org", "a-long-test-password", role)
	}
	cookies := map[string]*http.Cookie{
		"user":      adminCookie(t, int(ids["user"]), "user"),
		"volunteer": adminCookie(t, int(ids["volunteer"]), "volunteer"),
		"editor":    adminCookie(t, int(ids["editor"]), "editor"),
		"admin":     adminCookie(t, int(ids["admin"]), "admin"),
	}
	eventBody := fmt.Sprintf(`{"title":"matrix event","description":"body","event_date":%q}`, time.Now().Add(48*time.Hour).UTC().Format(time.RFC3339))
	validPostBody := `{"title":"matrix post","content":"body","author_id":2147483000}`
	postBody := `{"title":"matrix post","content":"body"}`
	prefixes := []string{"/api/admin", "/api/editor"}
	type mutation struct {
		name, method, path, body string
		success                  int
		fixture                  string
	}
	mutations := []mutation{
		{name: "create post", method: http.MethodPost, path: "/posts", body: validPostBody, success: http.StatusCreated},
		{name: "update post", method: http.MethodPatch, path: "/posts/%d", body: postBody, success: http.StatusOK, fixture: "post"},
		{name: "delete post", method: http.MethodDelete, path: "/posts/%d", success: http.StatusOK, fixture: "post"},
		{name: "publish post", method: http.MethodPatch, path: "/posts/%d/publish", body: `{"published":true}`, success: http.StatusOK, fixture: "post"},
		{name: "create event", method: http.MethodPost, path: "/events", body: eventBody, success: http.StatusCreated},
		{name: "update event", method: http.MethodPatch, path: "/events/%d", body: eventBody, success: http.StatusOK, fixture: "event"},
		{name: "delete event", method: http.MethodDelete, path: "/events/%d", success: http.StatusOK, fixture: "event"},
	}
	for _, prefix := range prefixes {
		for _, mutation := range mutations {
			for _, role := range []string{"guest", "user", "volunteer", "editor", "admin"} {
				name := prefix + mutation.path + "/" + role
				t.Run(mutation.name+"/"+name, func(t *testing.T) {
					path := prefix + mutation.path
					if role == "admin" || (role == "editor" && prefix == "/api/editor") {
						if mutation.fixture == "post" {
							path = fmt.Sprintf(path, insertTestPost(t, db, ids[role], false))
						}
						if mutation.fixture == "event" {
							path = fmt.Sprintf(path, insertTestEvent(t, db))
						}
					} else if mutation.fixture != "" {
						path = fmt.Sprintf(path, 2147483000)
					}
					var cookie *http.Cookie
					if role != "guest" {
						cookie = cookies[role]
					}
					response := authRequest(r, mutation.method, path, mutation.body, cookie)
					want := http.StatusUnauthorized
					if role == "user" || role == "volunteer" || (prefix == "/api/admin" && role == "editor") {
						want = http.StatusForbidden
					}
					if role == "admin" || (prefix == "/api/editor" && role == "editor") {
						want = mutation.success
					}
					if response.Code != want {
						t.Fatalf("%s %s as %s: status=%d want=%d body=%s", mutation.method, path, role, response.Code, want, response.Body)
					}
				})
			}
		}
	}
}

func TestMissingPostEventMutationIDsReturn404(t *testing.T) {
	_, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "missing-target@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	date := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	cases := []struct{ method, path, body string }{
		{http.MethodPatch, "/api/admin/posts/2147483000", `{"title":"title","content":"body"}`},
		{http.MethodDelete, "/api/admin/posts/2147483000", ""},
		{http.MethodPatch, "/api/admin/posts/2147483000/publish", `{"published":true}`},
		{http.MethodPatch, "/api/admin/events/2147483000", fmt.Sprintf(`{"title":"title","description":"body","event_date":%q}`, date)},
		{http.MethodDelete, "/api/admin/events/2147483000", ""},
	}
	for _, tc := range cases {
		response := authRequest(r, tc.method, tc.path, tc.body, cookie)
		if response.Code != http.StatusNotFound {
			t.Errorf("%s %s: status=%d want=404 body=%s", tc.method, tc.path, response.Code, response.Body)
		}
	}
}

func TestEventValidationMessagesUnchanged(t *testing.T) {
	_, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "event-validation@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	cases := []struct{ name, method, path, body string }{
		{name: "invalid event time", method: http.MethodPost, path: "/api/admin/events", body: `{"title":"title","description":"body","event_date":"not-a-date"}`},
		{name: "empty event title", method: http.MethodPost, path: "/api/admin/events", body: fmt.Sprintf(`{"title":"  ","description":"body","event_date":%q}`, time.Now().Add(48*time.Hour).UTC().Format(time.RFC3339))},
	}
	const want = "Title, description, and a valid event date are required"
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := authRequest(r, tc.method, tc.path, tc.body, cookie)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status=%d want=400 body=%s", response.Code, response.Body)
			}
			var payload map[string]string
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if payload["error"] != want {
				t.Fatalf("error=%q want=%q", payload["error"], want)
			}
		})
	}
}

func TestCreatePostForeignKeyErrorMapsTo422(t *testing.T) {
	db, q, _ := authTestApp(t)
	api := handlers.NewAPI(q, db)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/posts", strings.NewReader(`{"title":"title","content":"body"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", int(2147483000))
	api.CreatePost(c)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("foreign-key status=%d want=422 body=%s", w.Code, w.Body)
	}
}

func TestEventDateJSONFormatRemainsRFC3339Nano(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "event-date@example.org", "a-long-test-password", "admin")
	date := time.Date(2099, time.March, 4, 5, 6, 7, 123456000, time.UTC)
	if _, err := db.Exec(`INSERT INTO events(title, description, event_date) VALUES ('date-format', 'body', $1)`, date); err != nil {
		t.Fatalf("insert event: %v", err)
	}
	response := authRequest(r, http.MethodGet, "/api/events", "", adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusOK {
		t.Fatalf("events status=%d body=%s", response.Code, response.Body)
	}
	var rows []struct {
		Title     string `json:"title"`
		EventDate string `json:"event_date"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode events: %v", err)
	}
	for _, row := range rows {
		if row.Title == "date-format" {
			if row.EventDate != date.Format(time.RFC3339Nano) {
				t.Fatalf("event_date=%q want=%q", row.EventDate, date.Format(time.RFC3339Nano))
			}
			return
		}
	}
	t.Fatal("event with date-format title is missing")
}
