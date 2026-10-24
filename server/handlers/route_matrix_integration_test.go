package handlers_test

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

// This test is intentionally keyed by Gin's registered routes: every route
// must have a reviewed role expectation, and stale table entries fail too.
func TestRegisteredRouteRoleMatrix(t *testing.T) {
	db, q, r := authTestApp(t)
	ids, cookies := map[string]int32{}, map[string]*http.Cookie{}
	loginEmails := map[string]string{}
	for _, role := range []string{"user", "volunteer", "editor", "admin"} {
		ids[role] = createAuthUser(t, q, role, role+"@matrix-all.example.org", "a-long-test-password", role)
		cookies[role] = adminCookie(t, int(ids[role]), role)
		loginEmails[role] = role + "-login@matrix-all.example.org"
		createAuthUser(t, q, role+" login", loginEmails[role], "a-long-test-password", role)
	}
	const guest, denied, allow, created = http.StatusUnauthorized, http.StatusForbidden, http.StatusOK, http.StatusCreated
	// Status order: guest, user, volunteer, editor, admin.
	table := map[string][5]int{
		"POST /api/register": {created, created, created, created, created}, "POST /api/login": {allow, allow, allow, allow, allow},
		"POST /api/refresh": {guest, allow, allow, allow, allow}, "POST /api/logout": {allow, allow, allow, allow, allow},
		"POST /api/contact": {created, created, created, created, created}, "GET /api/staff/contact-messages": {guest, denied, denied, allow, allow}, "PATCH /api/staff/contact-messages/:id": {guest, denied, denied, allow, allow}, "GET /api/posts": {allow, allow, allow, allow, allow},
		"GET /api/posts/:slug": {allow, allow, allow, allow, allow}, "GET /api/events": {allow, allow, allow, allow, allow},
		"GET /api/events/:id": {allow, allow, allow, allow, allow}, "GET /api/media": {allow, allow, allow, allow, allow},
		"GET /api/staff/posts": {guest, denied, denied, allow, allow}, "POST /api/staff/posts": {guest, denied, denied, created, created},
		"PATCH /api/staff/posts/:id": {guest, denied, denied, allow, allow}, "DELETE /api/staff/posts/:id": {guest, denied, denied, allow, allow},
		"PATCH /api/staff/posts/:id/publish": {guest, denied, denied, allow, allow}, "GET /api/staff/events": {guest, denied, denied, allow, allow},
		"POST /api/staff/events": {guest, denied, denied, created, created}, "PATCH /api/staff/events/:id": {guest, denied, denied, allow, allow},
		"DELETE /api/staff/events/:id": {guest, denied, denied, allow, allow}, "GET /api/staff/media": {guest, denied, denied, allow, allow},
		"POST /api/staff/media": {guest, denied, denied, created, created}, "DELETE /api/staff/media/:id": {guest, denied, denied, allow, allow},
		"GET /api/admin/users": {guest, denied, denied, denied, allow}, "POST /api/admin/users": {guest, denied, denied, denied, created},
		"PATCH /api/admin/users/:id": {guest, denied, denied, denied, allow}, "DELETE /api/admin/users/:id": {guest, denied, denied, denied, allow},
		"GET /api/admin/volunteers": {guest, denied, denied, denied, allow}, "POST /api/admin/volunteers/:id/contributions": {guest, denied, denied, denied, created},
		"GET /api/me": {guest, allow, allow, allow, allow}, "GET /api/profile": {guest, allow, allow, allow, allow},
		"PUT /api/profile": {guest, allow, allow, allow, allow},
	}
	registered := map[string]bool{}
	for _, route := range r.Routes() {
		key := route.Method + " " + route.Path
		registered[key] = true
		if _, ok := table[key]; !ok {
			t.Errorf("registered route %q has no matrix entry", key)
		}
	}
	for key := range table {
		if !registered[key] {
			t.Errorf("matrix entry %q has no registered route", key)
		}
	}
	if t.Failed() {
		return
	}

	postAuthor := ids["admin"]
	postID := insertTestPost(t, db, postAuthor, true)
	eventID := insertTestEvent(t, db)
	mediaID := insertMatrixMedia(t, db, postAuthor)
	var contactID int32
	if err := db.QueryRowContext(t.Context(), `INSERT INTO contact_messages (name, email, message) VALUES ('Matrix', 'matrix@example.org', 'Inbox fixture') RETURNING id`).Scan(&contactID); err != nil {
		t.Fatalf("insert contact fixture: %v", err)
	}
	const detailSlug = "matrix-detail-post"
	if _, err := db.ExecContext(t.Context(), `INSERT INTO posts (slug, title, content, author_id, published, published_at) VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)`, detailSlug, "Detail", "Body", postAuthor); err != nil {
		t.Fatal(err)
	}
	date := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
	roles := []string{"guest", "user", "volunteer", "editor", "admin"}
	for ri, role := range roles {
		for key, wantByRole := range table {
			parts := strings.SplitN(key, " ", 2)
			method, path := parts[0], parts[1]
			path = strings.ReplaceAll(path, ":slug", detailSlug)
			path = strings.ReplaceAll(path, "/events/:id", "/events/"+fmt.Sprint(eventID))
			path = strings.ReplaceAll(path, "/posts/:id", "/posts/"+fmt.Sprint(postID))
			path = strings.ReplaceAll(path, "/media/:id", "/media/"+fmt.Sprint(mediaID))
			path = strings.ReplaceAll(path, "/contact-messages/:id", "/contact-messages/"+fmt.Sprint(contactID))
			path = strings.ReplaceAll(path, "/volunteers/:id", "/volunteers/"+fmt.Sprint(ids["volunteer"]))
			body := matrixRequestBody(key, role, ri, date)
			cookie := cookies[role]
			if role == "guest" {
				cookie = nil
			}
			if key == "POST /api/refresh" && role != "guest" {
				login := authRequest(r, http.MethodPost, "/api/login", fmt.Sprintf(`{"email":%q,"password":"a-long-test-password"}`, loginEmails[role]))
				if login.Code != allow {
					t.Fatalf("prepare refresh: %d %s", login.Code, login.Body)
				}
				cookie = login.Result().Cookies()[1]
			}
			if method == http.MethodPost && strings.HasSuffix(path, "/media") {
				got := mediaUploadRequest(t, r, path, cookie, "matrix.png").Code
				if got != wantByRole[ri] {
					t.Errorf("%s as %s: status=%d want=%d", key, role, got, wantByRole[ri])
				}
				continue
			}
			if wantByRole[ri] == allow && method == http.MethodDelete {
				switch {
				case strings.Contains(key, "/posts/"):
					path = fmt.Sprintf("/api/staff/posts/%d", insertTestPost(t, db, ids[role], false))
				case strings.Contains(key, "/events/"):
					path = fmt.Sprintf("/api/staff/events/%d", insertTestEvent(t, db))
				case strings.Contains(key, "/media/"):
					path = fmt.Sprintf("/api/staff/media/%d", insertMatrixMedia(t, db, ids[role]))
				case strings.Contains(key, "/users/"):
					target := createAuthUser(t, q, "Target", fmt.Sprintf("target-%s-%d@example.org", role, ri), "a-long-test-password", "user")
					path = fmt.Sprintf("/api/admin/users/%d", target)
				}
			}
			if strings.Contains(key, "PATCH /api/admin/users/") {
				target := createAuthUser(t, q, "Target", fmt.Sprintf("patch-%s-%d@example.org", role, ri), "a-long-test-password", "user")
				path = fmt.Sprintf("/api/admin/users/%d", target)
			}
			if strings.Contains(key, "PATCH /api/staff/posts/") && !strings.HasSuffix(path, "/publish") {
				body = fmt.Sprintf(`{"title":"updated %s","content":"body","slug":"updated-%s-post"}`, role, role)
			}
			got := authRequest(r, method, path, body, cookie).Code
			if got != wantByRole[ri] {
				t.Errorf("%s as %s: status=%d want=%d path=%s", key, role, got, wantByRole[ri], path)
			}
		}
	}
	for _, old := range []struct{ method, path string }{{http.MethodGet, "/api/admin/posts"}, {http.MethodPost, "/api/admin/posts"}, {http.MethodGet, "/api/editor/posts"}, {http.MethodPost, "/api/editor/posts"}, {http.MethodGet, "/api/admin/events"}, {http.MethodPost, "/api/editor/media"}} {
		if got := authRequest(r, old.method, old.path, `{}`, cookies["admin"]).Code; got != http.StatusNotFound {
			t.Errorf("removed route %s %s returned %d, want 404", old.method, old.path, got)
		}
	}
}

func matrixRequestBody(key, role string, index int, date string) string {
	switch key {
	case "POST /api/register":
		return fmt.Sprintf(`{"name":"New","email":"new-%s@example.org","password":"a-long-test-password"}`, role)
	case "POST /api/login":
		who := role
		if who == "guest" {
			who = "user"
		}
		return fmt.Sprintf(`{"email":%q,"password":"a-long-test-password"}`, who+"-login@matrix-all.example.org")
	case "PATCH /api/staff/contact-messages/:id":
		return `{"status":"replied"}`
	case "POST /api/contact":
		return fmt.Sprintf(`{"name":"Contact","email":"contact-%s@example.org","message":"Hello"}`, role)
	case "POST /api/staff/posts":
		return fmt.Sprintf(`{"title":"created %s","content":"body"}`, role)
	case "POST /api/staff/events", "PATCH /api/staff/events/:id":
		return fmt.Sprintf(`{"title":"event %s %d","description":"body","event_date":%q}`, role, index, date)
	case "PATCH /api/staff/posts/:id/publish":
		return `{"published":true}`
	case "PATCH /api/admin/users/:id":
		return fmt.Sprintf(`{"name":"Target","email":"patch-%s-%d@example.org","role":"user"}`, role, index)
	case "POST /api/admin/users":
		return fmt.Sprintf(`{"name":"New","email":"admin-new-%s@example.org","password":"a-long-test-password","role":"user"}`, role)
	case "POST /api/admin/volunteers/:id/contributions":
		return `{"hours":1.25,"contribution_date":"2026-10-24"}`
	case "PUT /api/profile":
		return fmt.Sprintf(`{"name":"Updated","email":"profile-%s@example.org"}`, role)
	default:
		return `{}`
	}
}

func insertMatrixMedia(t *testing.T, db *sql.DB, uploader int32) int32 {
	t.Helper()
	var id int32
	if err := db.QueryRow(`INSERT INTO media(title,file_path,uploaded_by) VALUES('matrix','/uploads/matrix-route.png',$1) RETURNING id`, uploader).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
