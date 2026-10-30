package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestSiteBlocksFallbackSanitizationAndEditorAttribution(t *testing.T) {
	_, q, router := authTestApp(t)
	adminID := createAuthUser(t, q, "Page Editor", "page-editor@example.org", "a-long-test-password", "admin")
	cookie := adminCookie(t, int(adminID), "admin")

	for _, invalid := range []struct {
		path string
		body string
	}{
		{
			path: "/api/admin/site-blocks/home/hero_title",
			body: `{"translations":{"en":{"text":"<script>alert(1)</script>"},"am":{"text":"ርዕስ"}}}`,
		},
		{
			path: "/api/admin/site-blocks/contact/email_address",
			body: `{"translations":{"en":{"text":"not-an-email"},"am":{"text":"not-an-email"}}}`,
		},
		{
			path: "/api/admin/site-blocks/contact/phone",
			body: `{"translations":{"en":{"text":"call me"},"am":{"text":"call me"}}}`,
		},
	} {
		response := authRequest(router, http.MethodPut, invalid.path, invalid.body, cookie)
		if response.Code != http.StatusUnprocessableEntity {
			t.Errorf("PUT %s status=%d body=%s; want 422", invalid.path, response.Code, response.Body)
		}
	}

	saved := authRequest(
		router,
		http.MethodPut,
		"/api/admin/site-blocks/contact/email_address",
		`{"translations":{"en":{"text":""},"am":{"text":"contact@example.org"}}}`,
		cookie,
	)
	if saved.Code != http.StatusOK {
		t.Fatalf("save fallback block status=%d body=%s", saved.Code, saved.Body)
	}

	public := authRequest(router, http.MethodGet, "/api/site/blocks?page=contact&lang=en", "")
	if public.Code != http.StatusOK {
		t.Fatalf("public blocks status=%d body=%s", public.Code, public.Body)
	}
	var localized struct {
		Items []struct {
			Key      string `json:"key"`
			Text     string `json:"text"`
			Language string `json:"language"`
			Fallback bool   `json:"fallback"`
		} `json:"items"`
	}
	if err := json.Unmarshal(public.Body.Bytes(), &localized); err != nil {
		t.Fatalf("decode localized block response: %v", err)
	}
	if len(localized.Items) != 1 || localized.Items[0].Key != "email_address" ||
		localized.Items[0].Text != "contact@example.org" || localized.Items[0].Language != "am" ||
		!localized.Items[0].Fallback {
		t.Fatalf("localized fallback = %#v; want Amharic text with fallback metadata", localized.Items)
	}

	admin := authRequest(router, http.MethodGet, "/api/admin/site-blocks?page=contact", "", cookie)
	if admin.Code != http.StatusOK {
		t.Fatalf("admin blocks status=%d body=%s", admin.Code, admin.Body)
	}
	var editable struct {
		Items []struct {
			UpdatedByName string `json:"updated_by_name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(admin.Body.Bytes(), &editable); err != nil {
		t.Fatalf("decode admin blocks: %v", err)
	}
	if len(editable.Items) != 1 || editable.Items[0].UpdatedByName != "Page Editor" {
		t.Fatalf("editor attribution = %#v; expected Page Editor", editable.Items)
	}
}

func TestSiteBlocksRequireAdmin(t *testing.T) {
	_, q, router := authTestApp(t)
	editorID := createAuthUser(t, q, "Content Editor", "content-editor@example.org", "a-long-test-password", "editor")
	response := authRequest(
		router,
		http.MethodPut,
		"/api/admin/site-blocks/home/hero_title",
		`{"translations":{"en":{"text":"English"},"am":{"text":"አማርኛ"}}}`,
		adminCookie(t, int(editorID), "editor"),
	)
	if response.Code != http.StatusForbidden {
		t.Fatalf("editor block update status=%d body=%s; want 403", response.Code, response.Body)
	}
}
