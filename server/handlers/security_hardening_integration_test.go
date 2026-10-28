package handlers_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/i18n"
)

func addRefreshFixtures(t *testing.T, q *dbgen.Queries, userID int32) {
	t.Helper()
	for _, token := range []string{"security-session-one", "security-session-two"} {
		if err := q.CreateRefreshToken(context.Background(), dbgen.CreateRefreshTokenParams{
			UserID: userID, TokenHash: token, ExpiresAt: time.Now().Add(24 * time.Hour),
		}); err != nil {
			t.Fatalf("insert refresh token fixture: %v", err)
		}
	}
}

func assertNoActiveRefreshTokens(t *testing.T, db *sql.DB, userID int32) {
	t.Helper()
	var active int
	if err := db.QueryRowContext(context.Background(), `SELECT count(*) FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL`, userID).Scan(&active); err != nil {
		t.Fatalf("count active refresh tokens: %v", err)
	}
	if active != 0 {
		t.Fatalf("user %d retained %d active refresh tokens", userID, active)
	}
}

func TestPasswordPolicyIsSharedAndLocalizedAcrossAccountFlows(t *testing.T) {
	_, q, r := authTestApp(t)
	admin := createAuthUser(t, q, "Policy Admin", "policy-admin@example.org", "existing-admin-password", "admin")
	profile := createAuthUser(t, q, "Profile Person", "profile-person@example.org", "existing-profile-password", "user")
	tests := []struct {
		name, method, path, body string
		cookie                   *http.Cookie
		want                     string
	}{
		{
			name: "register common password", method: http.MethodPost, path: "/api/register",
			body: `{"name":"New Person","email":"new-policy@example.org","password":"Password1234"}`,
			want: "auth.password_too_common",
		},
		{
			name: "admin create common password", method: http.MethodPost, path: "/api/admin/users",
			body:   `{"name":"New Person","email":"new-managed@example.org","password":"Password1234","role":"user"}`,
			cookie: adminCookie(t, int(admin), "admin"), want: "auth.password_too_common",
		},
		{
			name: "admin reset identity password", method: http.MethodPatch, path: fmt.Sprintf("/api/admin/users/%d", profile),
			body:   `{"name":"Profile Person","email":"profile-person@example.org","role":"user","password":"profile-person-strong-pass"}`,
			cookie: adminCookie(t, int(admin), "admin"), want: "auth.password_contains_identity",
		},
		{
			name: "profile change too short", method: http.MethodPut, path: "/api/profile",
			body:   `{"name":"Profile Person","email":"profile-person@example.org","password":"short"}`,
			cookie: adminCookie(t, int(profile), "user"), want: "auth.password_too_short",
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(testCase.method, testCase.path, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", "http://localhost:3000")
			request.Header.Set("Accept-Language", "am")
			if testCase.cookie != nil {
				request.AddCookie(testCase.cookie)
			}
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status=%d body=%s; want 422", response.Code, response.Body)
			}
			var envelope struct {
				Error struct {
					Code, Message string
				} `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.Error.Code != "validation_failed" || envelope.Error.Message != i18n.Text("am", testCase.want) {
				t.Fatalf("error envelope=%+v; want localized key %q", envelope.Error, testCase.want)
			}
		})
	}
}

func TestPasswordAndRoleChangesRevokeEveryActiveRefreshToken(t *testing.T) {
	tests := []struct {
		name, method, path, body, targetName, targetEmail string
		role                                              string
		actingRole                                        string
	}{
		{name: "profile password change", method: http.MethodPut, path: "/api/profile", body: `{"name":"Profile Target","email":"profile-target@example.org","password":"new-unique-password-482!"}`, targetName: "Profile Target", targetEmail: "profile-target@example.org", role: "user", actingRole: "user"},
		{name: "managed password reset", method: http.MethodPatch, body: `{"name":"Managed Target","email":"managed-target@example.org","role":"user","password":"new-unique-password-482!"}`, targetName: "Managed Target", targetEmail: "managed-target@example.org", role: "user", actingRole: "admin"},
		{name: "managed role change", method: http.MethodPatch, body: `{"name":"Role Target","email":"role-target@example.org","role":"volunteer"}`, targetName: "Role Target", targetEmail: "role-target@example.org", role: "user", actingRole: "admin"},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			db, q, r := authTestApp(t)
			userID := createAuthUser(t, q, testCase.targetName, testCase.targetEmail, "existing-account-password", testCase.role)
			addRefreshFixtures(t, q, userID)
			var actorID int32
			if testCase.actingRole == "admin" {
				actorID = createAuthUser(t, q, "Session Admin", "session-admin@example.org", "existing-admin-password", "admin")
				testCase.path = fmt.Sprintf("/api/admin/users/%d", userID)
			} else {
				actorID = userID
			}
			response := authRequest(r, testCase.method, testCase.path, testCase.body, adminCookie(t, int(actorID), testCase.actingRole))
			if response.Code != http.StatusOK {
				t.Fatalf("update status=%d body=%s", response.Code, response.Body)
			}
			assertNoActiveRefreshTokens(t, db, userID)
		})
	}
}

func TestExpiredRefreshTokensAreDeleted(t *testing.T) {
	db, q, _ := authTestApp(t)
	userID := createAuthUser(t, q, "Cleanup User", "cleanup@example.org", "cleanup-user-password", "user")
	for _, fixture := range []struct {
		hash    string
		expires time.Time
	}{{"expired-fixture", time.Now().Add(-time.Hour)}, {"active-fixture", time.Now().Add(time.Hour)}} {
		if err := q.CreateRefreshToken(context.Background(), dbgen.CreateRefreshTokenParams{UserID: userID, TokenHash: fixture.hash, ExpiresAt: fixture.expires}); err != nil {
			t.Fatal(err)
		}
	}
	deleted, err := q.DeleteExpiredRefreshTokens(context.Background())
	if err != nil || deleted != 1 {
		t.Fatalf("DeleteExpiredRefreshTokens() = %d, %v; want one deletion", deleted, err)
	}
	var remaining int
	if err := db.QueryRowContext(context.Background(), `SELECT count(*) FROM refresh_tokens WHERE user_id=$1`, userID).Scan(&remaining); err != nil || remaining != 1 {
		t.Fatalf("remaining refresh tokens=%d err=%v; want active row retained", remaining, err)
	}
}
