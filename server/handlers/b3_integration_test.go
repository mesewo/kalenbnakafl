package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"kalenbnakafl/handlers"
	"kalenbnakafl/models"
)

func mediaUploadRequest(t *testing.T, r http.Handler, path string, cookie *http.Cookie, filename string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("title", "Test upload"); err != nil {
		t.Fatal(err)
	}
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
	header.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(part, "fake png bytes"); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	return response
}

func requestWithIP(r http.Handler, method, path, body, remote string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.RemoteAddr = remote
	request.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	return response
}

func TestContactSubmitStoresRowAndRateLimitStillApplies(t *testing.T) {
	db, _, r := authTestApp(t)
	body := `{"name":"Contact Sender","email":"sender@example.org","message":"Hello NGO"}`
	remote := "198.51.100.21:1234"
	for i := 0; i < 30; i++ {
		response := requestWithIP(r, http.MethodPost, "/api/contact", body, remote, nil)
		if response.Code != http.StatusCreated {
			t.Fatalf("contact request %d status=%d body=%s", i+1, response.Code, response.Body)
		}
	}
	limited := requestWithIP(r, http.MethodPost, "/api/contact", body, remote, nil)
	if limited.Code != http.StatusTooManyRequests {
		t.Fatalf("31st contact status=%d want=429 body=%s", limited.Code, limited.Body)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM contacts WHERE email = 'sender@example.org'`).Scan(&count); err != nil {
		t.Fatalf("count contact messages: %v", err)
	}
	if count != 30 {
		t.Fatalf("stored contact count=%d want=30", count)
	}
}

func TestMediaUploadDeleteAndInsertFailureCleanup(t *testing.T) {
	dir := t.TempDir()
	cfg := integrationConfig()
	cfg.UploadDir = dir
	db, q, r := authTestAppWithConfig(t, cfg)
	adminID := createAuthUser(t, q, "Media Admin", "media-admin@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")

	upload := mediaUploadRequest(t, r, "/api/staff/media", cookie, "photo.png")
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status=%d body=%s", upload.Code, upload.Body)
	}
	var uploaded struct {
		Message  string `json:"message"`
		FilePath string `json:"file_path"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if uploaded.Message != "Media uploaded" || !strings.HasPrefix(uploaded.FilePath, "/uploads/") {
		t.Fatalf("unexpected upload response: %+v", uploaded)
	}
	storedFile := filepath.Join(dir, filepath.Base(uploaded.FilePath))
	if _, err := os.Stat(storedFile); err != nil {
		t.Fatalf("uploaded file not on disk: %v", err)
	}
	var mediaID int32
	if err := db.QueryRow(`SELECT id FROM media WHERE file_path=$1`, uploaded.FilePath).Scan(&mediaID); err != nil {
		t.Fatalf("media row missing: %v", err)
	}
	list := authRequest(r, http.MethodGet, "/api/staff/media", "", cookie)
	var items []models.Media
	if list.Code != http.StatusOK || json.Unmarshal(list.Body.Bytes(), &items) != nil || len(items) != 1 || items[0].FilePath != uploaded.FilePath {
		t.Fatalf("media list status=%d body=%s items=%+v", list.Code, list.Body, items)
	}
	deleted := authRequest(r, http.MethodDelete, fmt.Sprintf("/api/staff/media/%d", mediaID), "", cookie)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body)
	}
	if _, err := os.Stat(storedFile); !os.IsNotExist(err) {
		t.Fatalf("file still exists after delete or stat failed: %v", err)
	}
	var exists bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM media WHERE id=$1)`, mediaID).Scan(&exists); err != nil || exists {
		t.Fatalf("media row remains after delete: exists=%v err=%v", exists, err)
	}

	api := handlers.NewAPI(q, db, cfg)
	gin.SetMode(gin.TestMode)
	failed := mediaUploadRequest(t, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = req
		ctx.Set("user_id", int(2147483000))
		api.UploadMedia(ctx)
		w.WriteHeader(ctx.Writer.Status())
	}), "/api/staff/media", nil, "orphan.png")
	if failed.Code != http.StatusInternalServerError {
		t.Fatalf("invalid uploader status=%d body=%s", failed.Code, failed.Body)
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read upload directory: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("failed insert left files on disk: %v", files)
	}
}

func TestVolunteerContributionHoursPreserved(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Volunteer Admin", "hours-admin@example.org", "a-long-test-password", "admin")
	volunteerID := createAuthUser(t, q, "Hours Volunteer", "hours-volunteer@example.org", "a-long-test-password", "volunteer")
	response := authRequest(r, http.MethodPost, fmt.Sprintf("/api/admin/volunteers/%d/contributions", volunteerID), `{"hours":1.25,"notes":"event support"}`, adminCookie(t, int(adminID), "admin"))
	if response.Code != http.StatusCreated {
		t.Fatalf("contribution status=%d body=%s", response.Code, response.Body)
	}
	var hours string
	if err := db.QueryRow("SELECT hours::text FROM volunteer_contributions WHERE volunteer_id=$1", volunteerID).Scan(&hours); err != nil {
		t.Fatalf("read stored hours: %v", err)
	}
	if hours != "1.25" {
		t.Fatalf("stored hours=%q want=1.25", hours)
	}
	list := authRequest(r, http.MethodGet, "/api/admin/volunteers", "", adminCookie(t, int(adminID), "admin"))
	var volunteers []models.Volunteer
	if list.Code != http.StatusOK {
		t.Fatalf("volunteer list status=%d body=%s", list.Code, list.Body)
	}
	if err := json.Unmarshal(list.Body.Bytes(), &volunteers); err != nil {
		t.Fatalf("decode volunteer list: %v", err)
	}
	for _, volunteer := range volunteers {
		if volunteer.ID == int(volunteerID) {
			if volunteer.TotalHours != 1.25 {
				t.Fatalf("total_hours=%v want=1.25", volunteer.TotalHours)
			}
			return
		}
	}
	t.Fatal("volunteer missing from contribution list")
}

func TestB3RoleRouteMatrix(t *testing.T) {
	dir := t.TempDir()
	cfg := integrationConfig()
	cfg.UploadDir = dir
	db, q, r := authTestAppWithConfig(t, cfg)
	ids := map[string]int32{}
	for _, role := range []string{"user", "volunteer", "editor", "admin"} {
		ids[role] = createAuthUser(t, q, role, role+"@b3-matrix.example.org", "a-long-test-password", role)
	}
	cookies := map[string]*http.Cookie{}
	for role, id := range ids {
		cookies[role] = adminCookie(t, int(id), role)
	}
	roles := []string{"guest", "user", "volunteer", "editor", "admin"}
	testRoute := func(name, prefix string, role string, method, endpoint string) {
		t.Helper()
		var cookie *http.Cookie
		if role != "guest" {
			cookie = cookies[role]
		}
		want := http.StatusUnauthorized
		if role == "user" || role == "volunteer" || false {
			want = http.StatusForbidden
		}
		if role == "admin" || (prefix == "/api/staff" && role == "editor") {
			want = http.StatusOK
			if method == http.MethodPost {
				want = http.StatusCreated
			}
		}
		path := prefix + endpoint
		var response *httptest.ResponseRecorder
		switch method {
		case http.MethodGet:
			response = authRequest(r, method, path, "", cookie)
		case http.MethodPost:
			if strings.Contains(endpoint, "/media") {
				response = mediaUploadRequest(t, r, path, cookie, "matrix.png")
			} else if strings.Contains(endpoint, "contributions") {
				response = authRequest(r, method, path, `{"hours":1.25}`, cookie)
			} else {
				response = authRequest(r, method, path, `{"name":"Role Contact","email":"role-"`+strings.ReplaceAll(role, "/", "")+`@example.org","message":"hello"}`, cookie)
			}
		case http.MethodDelete:
			var mediaID int32
			if role == "admin" || (prefix == "/api/staff" && role == "editor") {
				filename := fmt.Sprintf("/uploads/matrix-%s.png", name)
				file := filepath.Join(dir, filepath.Base(filename))
				if err := os.WriteFile(file, []byte("fixture"), 0600); err != nil {
					t.Fatal(err)
				}
				if err := db.QueryRow(`INSERT INTO media(title,file_path,uploaded_by) VALUES('matrix', $1, $2) RETURNING id`, filename, ids[role]).Scan(&mediaID); err != nil {
					t.Fatal(err)
				}
			}
			path = fmt.Sprintf("%s/media/%d", prefix, mediaID)
			response = authRequest(r, method, path, "", cookie)
		}
		if response.Code != want {
			t.Fatalf("%s %s as %s: status=%d want=%d body=%s", method, path, role, response.Code, want, response.Body)
		}
	}

	for _, role := range roles {
		for _, prefix := range []string{"/api/staff"} {
			for _, route := range []struct{ method, path string }{
				{http.MethodGet, "/media"},
				{http.MethodPost, "/media"},
				{http.MethodDelete, "/media/1"},
			} {
				testRoute("media", prefix, role, route.method, route.path)
			}
		}
		for _, route := range []struct{ method, path string }{
			{http.MethodGet, "/volunteers"},
			{http.MethodPost, fmt.Sprintf("/volunteers/%d/contributions", ids["volunteer"])},
		} {
			testRoute("volunteers", "/api/admin", role, route.method, route.path)
		}
		remote := fmt.Sprintf("198.51.100.%d:1234", len(role)+100)
		contact := requestWithIP(r, http.MethodPost, "/api/contact", `{"name":"Role Contact","email":"role@example.org","message":"hello"}`, remote, cookies[role])
		if role == "guest" {
			contact = requestWithIP(r, http.MethodPost, "/api/contact", `{"name":"Role Contact","email":"guest@example.org","message":"hello"}`, remote, nil)
		}
		if contact.Code != http.StatusCreated {
			t.Fatalf("contact as %s: status=%d body=%s", role, contact.Code, contact.Body)
		}
	}
}
