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
	"kalenbnakafl/internal/i18n"
	"kalenbnakafl/internal/storage"
	"kalenbnakafl/models"
)

func insertTestPost(t *testing.T, db *sql.DB, authorID int32, published bool) int32 {
	t.Helper()
	var id int32
	slug := fmt.Sprintf("fixture-%d-%d", authorID, time.Now().UnixNano())
	err := db.QueryRow(`INSERT INTO posts(slug, author_id, published, published_at) VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP END) RETURNING id`, slug, authorID, published).Scan(&id)
	if err != nil {
		t.Fatalf("insert post fixture: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO post_translations(post_id,locale,title,content) VALUES($1,'en','fixture','fixture')`, id); err != nil {
		t.Fatal(err)
	}
	return id
}

func insertTestEvent(t *testing.T, db *sql.DB) int32 {
	t.Helper()
	var id int32
	err := db.QueryRow(`INSERT INTO events(event_date) VALUES ($1) RETURNING id`, time.Now().Add(48*time.Hour)).Scan(&id)
	if err != nil {
		t.Fatalf("insert event fixture: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO event_translations(event_id,locale,title,description,location) VALUES($1,'en','fixture','fixture','fixture')`, id); err != nil {
		t.Fatal(err)
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
	staffResponse := authRequest(r, http.MethodGet, "/api/staff/posts", "", adminCookie(t, int(adminID), "admin"))
	var staffPosts models.Page[models.Post]
	if staffResponse.Code != http.StatusOK || json.Unmarshal(staffResponse.Body.Bytes(), &staffPosts) != nil || len(staffPosts.Items) != 2 {
		t.Fatalf("staff posts status=%d body=%s", staffResponse.Code, staffResponse.Body)
	}
}

func TestPostCreateUsesAuthenticatedAuthor(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "author-check@example.org", "a-long-test-password", "admin")
	response := authRequest(r, http.MethodPost, "/api/staff/posts", `{"translations":{"en":{"title":"forged author","content":"body"}},"author_id":2147483000}`, adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusCreated {
		t.Fatalf("create post status=%d body=%s", response.Code, response.Body)
	}
	var authorID int32
	if err := db.QueryRow(`SELECT p.author_id FROM posts p JOIN post_translations t ON t.post_id=p.id WHERE t.title = 'forged author'`).Scan(&authorID); err != nil {
		t.Fatalf("read post author: %v", err)
	}
	if authorID != adminID {
		t.Fatalf("author_id=%d; want authenticated user %d", authorID, adminID)
	}
}

func TestPostCoverCanBePreservedAndCleared(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Cover Staff", "post-cover@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	postID := insertTestPost(t, db, adminID, false)
	mediaID := insertMatrixMedia(t, db, adminID)
	path := fmt.Sprintf("/api/staff/posts/%d", postID)
	translation := `{"translations":{"en":{"title":"Cover story","content":"Body"}}`

	set := authRequest(r, http.MethodPatch, path, translation+fmt.Sprintf(`,"cover_media_id":%d}`, mediaID), cookie)
	if set.Code != http.StatusOK {
		t.Fatalf("set cover status=%d body=%s", set.Code, set.Body)
	}
	var actual sql.NullInt32
	if err := db.QueryRow(`SELECT cover_media_id FROM posts WHERE id=$1`, postID).Scan(&actual); err != nil {
		t.Fatalf("read set cover: %v", err)
	}
	if !actual.Valid || actual.Int32 != mediaID {
		t.Fatalf("cover after set = %v; want %d", actual, mediaID)
	}

	preserve := authRequest(r, http.MethodPatch, path, translation+"}", cookie)
	if preserve.Code != http.StatusOK {
		t.Fatalf("preserve cover status=%d body=%s", preserve.Code, preserve.Body)
	}
	if err := db.QueryRow(`SELECT cover_media_id FROM posts WHERE id=$1`, postID).Scan(&actual); err != nil {
		t.Fatalf("read preserved cover: %v", err)
	}
	if !actual.Valid || actual.Int32 != mediaID {
		t.Fatalf("cover after update = %v; want preserved id %d", actual, mediaID)
	}

	clear := authRequest(r, http.MethodPatch, path, translation+`,"clear_cover_media":true}`, cookie)
	if clear.Code != http.StatusOK {
		t.Fatalf("clear cover status=%d body=%s", clear.Code, clear.Body)
	}
	if err := db.QueryRow(`SELECT cover_media_id FROM posts WHERE id=$1`, postID).Scan(&actual); err != nil {
		t.Fatalf("read cleared cover: %v", err)
	}
	if actual.Valid {
		t.Fatalf("cover after clear = %v; want NULL", actual)
	}
}

func TestPostLocaleFallbackAndLaterAmharicTranslation(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Bilingual Staff", "bilingual-staff@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	created := authRequest(r, http.MethodPost, "/api/staff/posts", `{"translations":{"en":{"title":"Bilingual story","content":"English body"}}}`, cookie)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body)
	}
	var id int32
	if err := db.QueryRow(`SELECT id FROM posts WHERE slug='bilingual-story'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	published := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/staff/posts/%d/publish", id), `{"published":true}`, cookie)
	if published.Code != http.StatusOK {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body)
	}
	detail := authRequest(r, http.MethodGet, "/api/posts/bilingual-story?lang=am", "")
	var post models.Post
	if detail.Code != http.StatusOK || json.Unmarshal(detail.Body.Bytes(), &post) != nil || post.Title != "Bilingual story" || post.Language != "en" || !post.Fallback {
		t.Fatalf("fallback response status=%d post=%#v body=%s", detail.Code, post, detail.Body)
	}
	updated := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/staff/posts/%d", id), `{"translations":{"am":{"title":"አማርኛ ታሪክ","content":"የአማርኛ ይዘት"}}}`, cookie)
	if updated.Code != http.StatusOK {
		t.Fatalf("add Amharic status=%d body=%s", updated.Code, updated.Body)
	}
	detail = authRequest(r, http.MethodGet, "/api/posts/bilingual-story?lang=am", "")
	if detail.Code != http.StatusOK || json.Unmarshal(detail.Body.Bytes(), &post) != nil || post.Language != "am" || post.Fallback || post.Title != "አማርኛ ታሪክ" {
		t.Fatalf("Amharic response status=%d post=%#v body=%s", detail.Code, post, detail.Body)
	}
	staff := authRequest(r, http.MethodGet, "/api/staff/posts?lang=am", "", cookie)
	var staffPage models.Page[models.Post]
	if staff.Code != http.StatusOK || json.Unmarshal(staff.Body.Bytes(), &staffPage) != nil || len(staffPage.Items) != 1 || len(staffPage.Items[0].Translations) != 2 {
		t.Fatalf("staff translations status=%d body=%s", staff.Code, staff.Body)
	}
	removed := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/staff/posts/%d", id), `{"translations":{"am":null}}`, cookie)
	if removed.Code != http.StatusOK {
		t.Fatalf("remove translation status=%d body=%s", removed.Code, removed.Body)
	}
	detail = authRequest(r, http.MethodGet, "/api/posts/bilingual-story?lang=am", "")
	if detail.Code != http.StatusOK || json.Unmarshal(detail.Body.Bytes(), &post) != nil || post.Language != "en" || !post.Fallback {
		t.Fatalf("post-removal fallback status=%d post=%#v body=%s", detail.Code, post, detail.Body)
	}
}

func TestEventAndMediaLocaleFallback(t *testing.T) {
	db, q, r := authTestApp(t)
	eventID := insertTestEvent(t, db)
	adminID := createAuthUser(t, q, "Media Staff", "media-locale@example.org", "a-long-test-password", "admin")
	mediaID := insertMatrixMedia(t, db, adminID)
	if _, err := db.Exec(`UPDATE events SET cover_media_id=$1 WHERE id=$2`, mediaID, eventID); err != nil {
		t.Fatalf("attach public event cover media: %v", err)
	}
	for _, tc := range []struct {
		path  string
		check func(*testing.T, *httptest.ResponseRecorder)
	}{
		{path: "/api/events?lang=am", check: func(t *testing.T, w *httptest.ResponseRecorder) {
			var result models.Page[models.Event]
			if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil {
				t.Fatalf("events status=%d body=%s", w.Code, w.Body)
			}
			for _, v := range result.Items {
				if v.ID == int(eventID) {
					if v.Language != "en" || !v.Fallback {
						t.Fatalf("event locale=%s fallback=%v", v.Language, v.Fallback)
					}
					return
				}
			}
			t.Fatalf("event %d missing", eventID)
		}},
		{path: "/api/media?lang=am", check: func(t *testing.T, w *httptest.ResponseRecorder) {
			var result models.Page[models.Media]
			if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil {
				t.Fatalf("media status=%d body=%s", w.Code, w.Body)
			}
			for _, v := range result.Items {
				if v.ID == int(mediaID) {
					if v.Language != "en" || !v.Fallback {
						t.Fatalf("media locale=%s fallback=%v", v.Language, v.Fallback)
					}
					return
				}
			}
			t.Fatalf("media %d missing", mediaID)
		}},
	} {
		tc.check(t, authRequest(r, http.MethodGet, tc.path, ""))
	}
}

func TestLocaleValidationAndLocalizedContactMessages(t *testing.T) {
	_, _, r := authTestApp(t)
	invalid := authRequest(r, http.MethodGet, "/api/posts?lang=fr", "")
	if invalid.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid locale status=%d body=%s", invalid.Code, invalid.Body)
	}
	for _, tc := range []struct{ lang, want string }{{"en", "Name, valid email, and a message are required"}, {"am", i18n.Text("am", "contact.name_valid_email_and_a_message_are_required")}} {
		response := authRequest(r, http.MethodPost, "/api/contact?lang="+tc.lang, `{"name":"","email":"bad","message":""}`)
		var payload struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if response.Code != http.StatusBadRequest || json.Unmarshal(response.Body.Bytes(), &payload) != nil || payload.Error.Message != tc.want {
			t.Errorf("lang=%s status=%d error=%q body=%s", tc.lang, response.Code, payload.Error.Message, response.Body)
		}
	}
}

func TestInvalidLocaleAndTranslationValidationUseRequestedErrorLocale(t *testing.T) {
	_, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Locale Admin", "locale-admin@example.org", "a-long-test-password", "admin")
	request := httptest.NewRequest(http.MethodGet, "/api/posts?lang=fr", nil)
	request.Header.Set("Accept-Language", "am")
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if response.Code != http.StatusUnprocessableEntity || json.Unmarshal(response.Body.Bytes(), &payload) != nil || payload.Error.Message != i18n.Text("am", "common.locale_invalid") {
		t.Fatalf("invalid locale status=%d message=%q body=%s", response.Code, payload.Error.Message, response.Body)
	}
	for _, tc := range []struct{ locale, want string }{{"en", "At least one valid post translation is required"}, {"am", i18n.Text("am", "posts.translations_are_required_and_must_be_valid")}} {
		request := httptest.NewRequest(http.MethodPost, "/api/staff/posts?lang="+tc.locale, strings.NewReader(`{"translations":{}}`))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Origin", "http://localhost:3000")
		request.AddCookie(adminCookie(t, int(adminID), "admin"))
		response := httptest.NewRecorder()
		r.ServeHTTP(response, request)
		payload = struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}{}
		if response.Code != http.StatusBadRequest || json.Unmarshal(response.Body.Bytes(), &payload) != nil || payload.Error.Message != tc.want {
			t.Errorf("lang=%s status=%d message=%q body=%s", tc.locale, response.Code, payload.Error.Message, response.Body)
		}
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
	eventBody := fmt.Sprintf(`{"translations":{"en":{"title":"matrix event","description":"body","location":"here"}},"event_date":%q}`, time.Now().Add(48*time.Hour).UTC().Format(time.RFC3339))
	validPostBody := `{"translations":{"en":{"title":"matrix post","content":"body"}},"author_id":2147483000}`
	postBody := `{"translations":{"en":{"title":"matrix post","content":"body"}}}`
	prefixes := []string{"/api/staff"}
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
					if role == "admin" || role == "editor" {
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
					if role == "user" || role == "volunteer" {
						want = http.StatusForbidden
					}
					if role == "admin" || role == "editor" {
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
		{http.MethodPatch, "/api/staff/posts/2147483000", `{"translations":{"en":{"title":"title","content":"body"}}}`},
		{http.MethodDelete, "/api/staff/posts/2147483000", ""},
		{http.MethodPatch, "/api/staff/posts/2147483000/publish", `{"published":true}`},
		{http.MethodPatch, "/api/staff/events/2147483000", fmt.Sprintf(`{"translations":{"en":{"title":"title","description":"body","location":"here"}},"event_date":%q}`, date)},
		{http.MethodDelete, "/api/staff/events/2147483000", ""},
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
		{name: "invalid event time", method: http.MethodPost, path: "/api/staff/events", body: `{"translations":{"en":{"title":"title","description":"body","location":""}},"event_date":"not-a-date"}`},
		{name: "empty event title", method: http.MethodPost, path: "/api/staff/events", body: fmt.Sprintf(`{"translations":{"en":{"title":"  ","description":"body","location":""}},"event_date":%q}`, time.Now().Add(48*time.Hour).UTC().Format(time.RFC3339))},
	}
	const want = "At least one valid translation and a valid event date are required"
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
	api := handlers.NewAPI(q, db, integrationConfig(), storage.NewLocal(t.TempDir()))
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/staff/posts", strings.NewReader(`{"translations":{"en":{"title":"title","content":"body"}}}`))
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
	var dateID int32
	if err := db.QueryRow(`INSERT INTO events(event_date) VALUES($1) RETURNING id`, date).Scan(&dateID); err != nil {
		t.Fatalf("insert event: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO event_translations(event_id,locale,title,description,location) VALUES($1,'en','date-format','body','')`, dateID); err != nil {
		t.Fatal(err)
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
		body, _ := json.Marshal(map[string]any{"translations": map[string]any{"en": map[string]string{"title": title, "content": "A searchable body"}}})
		response := authRequest(r, http.MethodPost, "/api/staff/posts", string(body), cookie)
		if response.Code != http.StatusCreated {
			t.Fatalf("create post status=%d body=%s", response.Code, response.Body)
		}
		var id int32
		if err := db.QueryRow(`SELECT p.id FROM posts p JOIN post_translations t ON t.post_id=p.id WHERE t.title=$1 ORDER BY p.id DESC LIMIT 1`, title).Scan(&id); err != nil {
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

	amharicID := create("áŠ áˆ›áˆ\u00adáŠ›")
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
		response := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/staff/posts/%d/publish", first), body, cookie)
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
	if _, err := db.Exec(`WITH inserted AS (INSERT INTO posts(slug,author_id,published,published_at) SELECT 'page-'||n,$1,true,CURRENT_TIMESTAMP FROM generate_series(1,55) n RETURNING id,slug) INSERT INTO post_translations(post_id,locale,title,content) SELECT id,'en',CASE WHEN slug='page-1' THEN 'TitleProbe unique' ELSE 'Batch story '||right(slug,length(slug)-5) END,'batch body' FROM inserted`, authorID); err != nil {
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
	if _, err := db.Exec(`UPDATE posts SET slug='draft-only-slug' WHERE id=(SELECT post_id FROM post_translations WHERE title='fixture' LIMIT 1)`); err != nil {
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
	var pastID int32
	if err := db.QueryRow(`INSERT INTO events(event_date) VALUES(CURRENT_TIMESTAMP - INTERVAL '3 days') RETURNING id`).Scan(&pastID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO event_translations(event_id,locale,title,description,location) VALUES($1,'en','past event','old','')`, pastID); err != nil {
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
	body := fmt.Sprintf(`{"translations":{"en":{"title":"bad range","description":"body","location":""}},"event_date":%q,"ends_at":%q}`, start.Format(time.RFC3339), start.Add(-time.Hour).Format(time.RFC3339))
	response := authRequest(r, http.MethodPost, "/api/staff/events", body, adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid event range status=%d want=422 body=%s", response.Code, response.Body)
	}
}

func TestStaffCanSetAndEditPostSlug(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Staff", "manual-slug@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")
	create := authRequest(r, http.MethodPost, "/api/staff/posts", `{"translations":{"en":{"title":"Manual title","content":"body"}},"slug":"manual-slug"}`, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create with slug status=%d body=%s", create.Code, create.Body)
	}
	var id int32
	if err := db.QueryRow(`SELECT id FROM posts WHERE slug='manual-slug'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	update := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/staff/posts/%d", id), `{"translations":{"en":{"title":"Manual title","content":"body"}},"slug":"revised-slug"}`, cookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update slug status=%d body=%s", update.Code, update.Body)
	}
	invalid := authRequest(r, http.MethodPost, "/api/staff/posts", `{"translations":{"en":{"title":"Invalid slug","content":"body"}},"slug":"UPPER CASE"}`, cookie)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid slug status=%d want=400 body=%s", invalid.Code, invalid.Body)
	}
}

func TestPostFullTextSearchFindsAmharicAndEnglishTranslations(t *testing.T) {
	db, _, r := authTestApp(t)
	amTitle := "\u12a0\u121b\u122d\u129b \u12dc\u1293"
	amContent := "\u12e8\u121b\u1205\u1260\u1228\u1230\u1265 \u12dc\u1293"
	if _, err := db.Exec(`WITH post AS (INSERT INTO posts(slug,published,published_at) VALUES('amharic-search',true,CURRENT_TIMESTAMP) RETURNING id) INSERT INTO post_translations(post_id,locale,title,content) SELECT id,'am',$1,$2 FROM post`, amTitle, amContent); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO post_translations(post_id,locale,title,content) SELECT id,'en','Community story','English phrase' FROM posts WHERE slug='amharic-search'`); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"\u12a0\u121b\u122d\u129b", "English phrase"} {
		response := authRequest(r, http.MethodGet, "/api/posts?q="+url.QueryEscape(query), "")
		var result models.Page[models.Post]
		if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Total != 1 || result.Items[0].Slug != "amharic-search" {
			t.Fatalf("search %q status=%d body=%s", query, response.Code, response.Body)
		}
	}
}
func TestRemovedContentRouteTreesReturn404(t *testing.T) {
	_, _, r := authTestApp(t)
	for _, path := range []string{
		"/api/admin/posts", "/api/admin/posts/1", "/api/admin/posts/1/publish",
		"/api/admin/events", "/api/admin/events/1",
		"/api/admin/media", "/api/admin/media/1",
		"/api/editor/posts", "/api/editor/posts/1", "/api/editor/posts/1/publish",
		"/api/editor/events", "/api/editor/events/1",
		"/api/editor/media", "/api/editor/media/1",
	} {
		response := authRequest(r, http.MethodGet, path, "", nil)
		if response.Code != http.StatusNotFound {
			t.Errorf("GET %s status=%d want=404", path, response.Code)
		}
	}
}
