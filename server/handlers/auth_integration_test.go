package handlers_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/database"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/handlers"
	"kalenbnakafl/routes"
	"kalenbnakafl/utils"
)

func authTestApp(t *testing.T) (*sql.DB, *dbgen.Queries, *gin.Engine) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		t.Skip("DATABASE_URL_TEST is not set; skipping PostgreSQL auth integration test")
	}
	base, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := base.PingContext(ctx); err != nil {
		base.Close()
		t.Fatalf("ping test database: %v", err)
	}
	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		base.Close()
		t.Skip("DATABASE_URL_TEST must be a postgres URL")
	}
	schema := fmt.Sprintf("auth_test_%d", time.Now().UnixNano())
	if _, err := base.ExecContext(ctx, `CREATE SCHEMA "`+schema+`"`); err != nil {
		base.Close()
		t.Fatalf("create test schema: %v", err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("postgres", parsed.String())
	if err != nil {
		base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		base.Close()
		t.Fatalf("open test schema: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		base.Close()
		t.Fatalf("ping test schema: %v", err)
	}
	t.Cleanup(func() { db.Close(); base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`); base.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate test schema: %v", err)
	}
	t.Setenv("APP_ENV", "development")
	t.Setenv("JWT_SECRET", "integration-test-secret-with-at-least-32-bytes")
	gin.SetMode(gin.TestMode)
	q := dbgen.New(db)
	r := gin.New()
	routes.SetupRoutes(r, q, db)
	return db, q, r
}

func authRequest(r http.Handler, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		if cookie != nil {
			request.AddCookie(cookie)
		}
	}
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	return response
}

func adminCookie(t *testing.T, id int, role string) *http.Cookie {
	t.Helper()
	token, err := utils.GenerateToken(id, role)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: "access_token", Value: token}
}

func createAuthUser(t *testing.T, q *dbgen.Queries, name, email, password, role string) int32 {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if role == "admin" {
		err = q.CreateAdminIfMissing(context.Background(), dbgen.CreateAdminIfMissingParams{Email: email, Password: string(hash)})
	} else {
		err = q.CreateUser(context.Background(), dbgen.CreateUserParams{Name: name, Email: email, Password: string(hash), Role: role})
	}
	if err != nil {
		t.Fatalf("create %s: %v", role, err)
	}
	row, err := q.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("read user: %v", err)
	}
	return row.ID
}

func TestRegisterDuplicateEmailAndLogin(t *testing.T) {
	_, _, r := authTestApp(t)
	password := "a-long-test-password"
	body := `{"name":"Test User","email":"Case@Example.org","password":"` + password + `"}`
	if got := authRequest(r, http.MethodPost, "/api/register", body).Code; got != http.StatusCreated {
		t.Fatalf("first register status = %d", got)
	}
	duplicate := `{"name":"Other User","email":"case@example.org","password":"` + password + `"}`
	if got := authRequest(r, http.MethodPost, "/api/register", duplicate).Code; got != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, want 409", got)
	}
	login := `{"email":"CASE@example.org","password":"` + password + `"}`
	response := authRequest(r, http.MethodPost, "/api/login", login)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d, body=%s", response.Code, response.Body)
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	user := payload["user"].(map[string]any)
	if _, leaks := user["password"]; leaks {
		t.Fatal("login response contains password")
	}
	if cookie := response.Result().Cookies(); len(cookie) != 2 {
		t.Fatalf("login set %d cookies, want 2", len(cookie))
	}
	bad := authRequest(r, http.MethodPost, "/api/login", `{"email":"case@example.org","password":"wrong-password"}`)
	if bad.Code != http.StatusUnauthorized {
		t.Fatalf("bad password status = %d, want 401", bad.Code)
	}
}

func TestRefreshRotationAndConcurrentSingleUse(t *testing.T) {
	t.Run("rotation and reuse", func(t *testing.T) {
		_, q, r := authTestApp(t)
		createAuthUser(t, q, "Refresh User", "refresh@example.org", "a-long-test-password", "user")
		login := authRequest(r, http.MethodPost, "/api/login", `{"email":"refresh@example.org","password":"a-long-test-password"}`)
		if login.Code != 200 {
			t.Fatalf("login status=%d body=%s", login.Code, login.Body)
		}
		old := login.Result().Cookies()[1]
		rotated := authRequest(r, http.MethodPost, "/api/refresh", "", old)
		if rotated.Code != 200 {
			t.Fatalf("refresh status=%d body=%s", rotated.Code, rotated.Body)
		}
		if len(rotated.Result().Cookies()) != 2 {
			t.Fatalf("refresh set %d cookies", len(rotated.Result().Cookies()))
		}
		reused := authRequest(r, http.MethodPost, "/api/refresh", "", old)
		if reused.Code != 401 {
			t.Fatalf("reuse status=%d, want 401", reused.Code)
		}
	})
	t.Run("concurrent", func(t *testing.T) {
		_, q, r := authTestApp(t)
		createAuthUser(t, q, "Concurrent User", "concurrent@example.org", "a-long-test-password", "user")
		login := authRequest(r, http.MethodPost, "/api/login", `{"email":"concurrent@example.org","password":"a-long-test-password"}`)
		if login.Code != 200 {
			t.Fatalf("login status=%d", login.Code)
		}
		old := login.Result().Cookies()[1]
		var wg sync.WaitGroup
		statuses := make(chan int, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); statuses <- authRequest(r, http.MethodPost, "/api/refresh", "", old).Code }()
		}
		wg.Wait()
		close(statuses)
		successes, failures := 0, 0
		for status := range statuses {
			if status == 200 {
				successes++
			} else if status == 401 {
				failures++
			} else {
				t.Errorf("unexpected concurrent refresh status %d", status)
			}
		}
		if successes != 1 || failures != 1 {
			t.Fatalf("concurrent refresh outcomes: success=%d unauthorized=%d", successes, failures)
		}
	})
}

func TestAdminGuardsAndRoleRecheck(t *testing.T) {
	db, q, r := authTestApp(t)
	admin1 := createAuthUser(t, q, "Admin One", "admin1@example.org", "a-long-test-password", "admin")
	admin2 := createAuthUser(t, q, "Admin Two", "admin2@example.org", "a-long-test-password", "admin")
	self := authRequest(r, http.MethodDelete, fmt.Sprintf("/api/admin/users/%d", admin1), "", adminCookie(t, int(admin1), "admin"))
	if self.Code != http.StatusBadRequest {
		t.Fatalf("self-delete status=%d, want 400", self.Code)
	}
	if got := authRequest(r, http.MethodDelete, fmt.Sprintf("/api/admin/users/%d", admin2), "", adminCookie(t, int(admin1), "admin")).Code; got != http.StatusOK {
		t.Fatalf("delete second admin status=%d", got)
	}
	api := handlers.NewAPI(q, db)
	for _, tc := range []struct {
		name, method, body string
		invoke             func(*gin.Context)
	}{
		{name: "last-admin demotion", method: http.MethodPatch, body: `{"name":"Admin One","email":"admin1@example.org","role":"editor"}`, invoke: api.UpdateUser},
		{name: "last-admin deletion", method: http.MethodDelete, invoke: api.DeleteUser},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(tc.method, "/", strings.NewReader(tc.body))
			c.Request.Header.Set("Content-Type", "application/json")
			c.Params = gin.Params{{Key: "id", Value: fmt.Sprint(admin1)}}
			c.Set("user_id", int(999))
			tc.invoke(c)
			if w.Code != http.StatusConflict {
				t.Fatalf("status=%d, want 409, body=%s", w.Code, w.Body)
			}
		})
	}
}
func TestMiddlewareRechecksDemotedRole(t *testing.T) {
	_, q, r := authTestApp(t)
	admin1 := createAuthUser(t, q, "Admin One", "demote1@example.org", "a-long-test-password", "admin")
	admin2 := createAuthUser(t, q, "Admin Two", "demote2@example.org", "a-long-test-password", "admin")
	if got := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/users/%d", admin1), `{"name":"Admin One","email":"demote1@example.org","role":"editor"}`, adminCookie(t, int(admin2), "admin")).Code; got != http.StatusOK {
		t.Fatalf("demote status=%d", got)
	}
	response := authRequest(r, http.MethodGet, "/api/admin/users", "", adminCookie(t, int(admin1), "admin"))
	if response.Code != http.StatusForbidden {
		t.Fatalf("demoted token admin endpoint status=%d, want 403", response.Code)
	}
}

func TestMiddlewareRejectsMissingAccount(t *testing.T) {
	_, _, r := authTestApp(t)
	response := authRequest(r, http.MethodGet, "/api/me", "", adminCookie(t, 2147483000, "admin"))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("missing-account middleware status=%d, want 401", response.Code)
	}
}
