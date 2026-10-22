package handlers_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
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
	slug := fmt.Sprintf("fixture-%d-%d", authorID, time.Now().UnixNano())
	err := db.QueryRow(`INSERT INTO posts(slug, title, content, author_id, published, published_at) VALUES ($1, 'fixture', 'fixture', $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP END) RETURNING id`, slug, authorID, published).Scan(&id)
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
	var publicPosts models.Page[models.Post]
	if err := json.Unmarshal(publicResponse.Body.Bytes(), &publicPosts); err != nil {
		t.Fatalf("decode public posts: %v", err)
	}
	if len(publicPosts.Items) != 1 || publicPosts.Items[0].ID != int(publishedID) {
		t.Fatalf("public list = %#v; expected only published id %d (draft %d)", publicPosts, publishedID, draftID)
	}
	adminID := createAuthUser(t, q, "Staff", "post-admin@example.org", "a-long-test-password", "admin")
	staffResponse := authRequest(r, http.MethodGet, "/api/admin/posts", "", adminCookie(t, int(adminID), "admin"))
	var staffPosts models.Page[models.Post]
	if staffResponse.Code != http.StatusOK || json.Unmarshal(staffResponse.Body.Bytes(), &staffPosts) != nil || len(staffPosts.Items) != 2 {
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
			var payload struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if payload.Error.Code != "validation_failed" || payload.Error.Message != want {
				t.Fatalf("error=%#v want code=validation_failed message=%q", payload.Error, want)
			}
		})
	}
}

func TestCreatePostForeignKeyErrorMapsTo422(t *testing.T) {
	db, q, _ := authTestApp(t)
	api := handlers.NewAPI(q, db, integrationConfig())
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
	var result models.Page[struct {
		Title     string `json:"title"`
		EventDate string `json:"event_date"`
	}]
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode events: %v", err)
	}
	for _, row := range result.Items {
		if row.Title == "date-format" {
			if row.EventDate != date.Format(time.RFC3339Nano) {
				t.Fatalf("event_date=%q want=%q", row.EventDate, date.Format(time.RFC3339Nano))
			}
			return
		}
	}
	t.Fatal("event with date-format title is missing")
}

func TestPostSlugFallbackCollisionAndPublishedAtIsFirstPublish(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "slug-rules@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	create := func(title string) int32 {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"title": title, "content": "A searchable body"})
		response := authRequest(r, http.MethodPost, "/api/admin/posts", string(body), cookie)
		if response.Code != http.StatusCreated {
			t.Fatalf("create post status=%d body=%s", response.Code, response.Body)
		}
		var id int32
		if err := db.QueryRow(`SELECT id FROM posts WHERE title=$1 ORDER BY id DESC LIMIT 1`, title).Scan(&id); err != nil {
			t.Fatalf("find created post: %v", err)
		}
		return id
	}

	first := create("Duplicate Heading")
	second := create("Duplicate Heading")
	var firstSlug, secondSlug string
	if err := db.QueryRow(`SELECT slug FROM posts WHERE id=$1`, first).Scan(&firstSlug); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT slug FROM posts WHERE id=$1`, second).Scan(&secondSlug); err != nil {
		t.Fatal(err)
	}
	if firstSlug != "duplicate-heading" || secondSlug != "duplicate-heading-2" {
		t.Fatalf("generated slugs = %q, %q", firstSlug, secondSlug)
	}

	amharicID := create("አማርኛ")
	var amharicSlug string
	if err := db.QueryRow(`SELECT slug FROM posts WHERE id=$1`, amharicID).Scan(&amharicSlug); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^post-[a-z2-7]{8}$`).MatchString(amharicSlug) {
		t.Fatalf("Amharic fallback slug = %q", amharicSlug)
	}

	publish := func(published bool) {
		t.Helper()
		body := fmt.Sprintf(`{"published":%t}`, published)
		response := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/posts/%d/publish", first), body, cookie)
		if response.Code != http.StatusOK {
			t.Fatalf("publish status=%d body=%s", response.Code, response.Body)
		}
	}
	publish(true)
	var initial sql.NullTime
	if err := db.QueryRow(`SELECT published_at FROM posts WHERE id=$1`, first).Scan(&initial); err != nil || !initial.Valid {
		t.Fatalf("published_at after first publish: value=%v err=%v", initial, err)
	}
	publish(false)
	publish(true)
	var after sql.NullTime
	if err := db.QueryRow(`SELECT published_at FROM posts WHERE id=$1`, first).Scan(&after); err != nil || !after.Valid || !after.Time.Equal(initial.Time) {
		t.Fatalf("published_at changed after unpublish/republish: initial=%v after=%v err=%v", initial, after, err)
	}
}

func TestPostPaginationSearchAndDraftSlugVisibility(t *testing.T) {
	db, q, r := authTestApp(t)
	authorID := createAuthUser(t, q, "Author", "post-pages@example.org", "a-long-test-password", "admin")
	if _, err := db.Exec(`INSERT INTO posts (slug,title,content,author_id,published,published_at) SELECT 'page-'||n, CASE WHEN n=1 THEN 'TitleProbe unique' ELSE 'Batch story '||n END, 'batch body', $1, true, CURRENT_TIMESTAMP FROM generate_series(1,55) n`, authorID); err != nil {
		t.Fatalf("insert pagination posts: %v", err)
	}
	page := authRequest(r, http.MethodGet, "/api/posts?page=0&limit=500", "")
	var result models.Page[models.Post]
	if page.Code != http.StatusOK || json.Unmarshal(page.Body.Bytes(), &result) != nil {
		t.Fatalf("pagination status=%d body=%s", page.Code, page.Body)
	}
	if result.Page != 1 || result.Limit != 50 || len(result.Items) != 50 || result.Total != 55 {
		t.Fatalf("pagination response page=%d limit=%d items=%d total=%d", result.Page, result.Limit, len(result.Items), result.Total)
	}
	search := authRequest(r, http.MethodGet, "/api/posts?q=TitleProbe", "")
	if search.Code != http.StatusOK || json.Unmarshal(search.Body.Bytes(), &result) != nil || result.Total != 1 || result.Items[0].Slug != "page-1" {
		t.Fatalf("full-text search status=%d body=%s", search.Code, search.Body)
	}
	insertTestPost(t, db, authorID, false)
	if _, err := db.Exec(`UPDATE posts SET slug='draft-only-slug' WHERE title='fixture'`); err != nil {
		t.Fatal(err)
	}
	draft := authRequest(r, http.MethodGet, "/api/posts/draft-only-slug", "")
	if draft.Code != http.StatusNotFound {
		t.Fatalf("draft detail status=%d want=404 body=%s", draft.Code, draft.Body)
	}
}

func TestEventUpcomingDetailAndEndTimeValidation(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "event-features@example.org", "a-long-test-password", "admin")
	if _, err := db.Exec(`INSERT INTO events(title,description,event_date) VALUES ('past event','old',CURRENT_TIMESTAMP - INTERVAL '3 days')`); err != nil {
		t.Fatal(err)
	}
	futureID := insertTestEvent(t, db)
	upcoming := authRequest(r, http.MethodGet, "/api/events?upcoming=true&page=1&limit=50", "")
	var result models.Page[models.Event]
	if upcoming.Code != http.StatusOK || json.Unmarshal(upcoming.Body.Bytes(), &result) != nil {
		t.Fatalf("upcoming status=%d body=%s", upcoming.Code, upcoming.Body)
	}
	for _, event := range result.Items {
		if event.EventDate.Before(time.Now()) {
			t.Fatalf("upcoming list contains past event %q at %s", event.Title, event.EventDate)
		}
	}
	detail := authRequest(r, http.MethodGet, fmt.Sprintf("/api/events/%d", futureID), "")
	if detail.Code != http.StatusOK {
		t.Fatalf("event detail status=%d body=%s", detail.Code, detail.Body)
	}
	start := time.Now().Add(48 * time.Hour).UTC()
	body := fmt.Sprintf(`{"title":"bad range","description":"body","event_date":%q,"ends_at":%q}`, start.Format(time.RFC3339), start.Add(-time.Hour).Format(time.RFC3339))
	response := authRequest(r, http.MethodPost, "/api/admin/events", body, adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid event range status=%d want=422 body=%s", response.Code, response.Body)
	}
}

func TestStaffCanSetAndEditPostSlug(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "manual-slug@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	create := authRequest(r, http.MethodPost, "/api/admin/posts", `{"title":"Manual title","content":"body","slug":"manual-slug"}`, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create with slug status=%d body=%s", create.Code, create.Body)
	}
	var id int32
	if err := db.QueryRow(`SELECT id FROM posts WHERE slug='manual-slug'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	update := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/posts/%d", id), `{"title":"Manual title","content":"body","slug":"revised-slug"}`, cookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update slug status=%d body=%s", update.Code, update.Body)
	}
	invalid := authRequest(r, http.MethodPost, "/api/admin/posts", `{"title":"Invalid slug","content":"body","slug":"UPPER CASE"}`, cookie)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid slug status=%d want=400 body=%s", invalid.Code, invalid.Body)
	}
}

func TestPostFullTextSearchFindsAmharicTitle(t *testing.T) {
	db, _, r := authTestApp(t)
	if _, err := db.Exec(`INSERT INTO posts(slug,title,content,published,published_at) VALUES ('amharic-search','አማርኛ ፍለጋ','የማህበረሰብ ዜና',true,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("insert Amharic post: %v", err)
	}
	response := authRequest(r, http.MethodGet, "/api/posts?q="+url.QueryEscape("አማርኛ"), "")
	var result models.Page[models.Post]
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Total != 1 || result.Items[0].Slug != "amharic-search" {
		t.Fatalf("Amharic search status=%d body=%s", response.Code, response.Body)
	}
}
