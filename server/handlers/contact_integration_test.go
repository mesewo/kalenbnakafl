package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"kalenbnakafl/models"
)

func TestContactInboxStatusPaginationAndTokenOwnership(t *testing.T) {
	db, q, r := authTestApp(t)
	editorID := createAuthUser(t, q, "Inbox Editor", "inbox-editor@example.org", "a-long-test-password", "editor")
	adminID := createAuthUser(t, q, "Inbox Admin", "inbox-admin@example.org", "a-long-test-password", "admin")
	editorCookie := adminCookie(t, int(editorID), "editor")
	adminCookieValue := adminCookie(t, int(adminID), "admin")

	submitted := authRequest(r, http.MethodPost, "/api/contact", `{"name":"Visitor","email":"visitor@example.org","message":"Please help"}`)
	if submitted.Code != http.StatusCreated {
		t.Fatalf("public submit status=%d body=%s", submitted.Code, submitted.Body)
	}
	var messageID int32
	var status string
	if err := db.QueryRow(`SELECT id,status FROM contact_messages WHERE email='visitor@example.org'`).Scan(&messageID, &status); err != nil {
		t.Fatalf("read submitted message: %v", err)
	}
	if status != "new" {
		t.Fatalf("submitted status=%q want=new", status)
	}

	list := authRequest(r, http.MethodGet, "/api/staff/contact-messages", "", editorCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", list.Code, list.Body)
	}
	var page models.Page[struct {
		ID            int32      `json:"id"`
		Status        string     `json:"status"`
		HandledByName string     `json:"handled_by_name"`
		HandledAt     *time.Time `json:"handled_at"`
	}]
	if err := json.Unmarshal(list.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode inbox list: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != messageID || page.Items[0].Status != "new" {
		t.Fatalf("inbox page=%#v", page)
	}
	var raw struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if _, leaked := raw.Items[0]["handled_by"]; leaked {
		t.Fatal("inbox response exposed handled_by user ID")
	}

	path := fmt.Sprintf("/api/staff/contact-messages/%d", messageID)
	read := authRequest(r, http.MethodPatch, path, fmt.Sprintf(`{"status":"read","handled_by":%d}`, adminID), editorCookie)
	if read.Code != http.StatusOK {
		t.Fatalf("mark read status=%d body=%s", read.Code, read.Body)
	}
	var handledBy int32
	var handledAt time.Time
	if err := db.QueryRow(`SELECT status,handled_by,handled_at FROM contact_messages WHERE id=$1`, messageID).Scan(&status, &handledBy, &handledAt); err != nil {
		t.Fatalf("read handled message: %v", err)
	}
	if status != "read" || handledBy != editorID || handledAt.IsZero() {
		t.Fatalf("read transition status=%q handled_by=%d handled_at=%v", status, handledBy, handledAt)
	}

	replied := authRequest(r, http.MethodPatch, path, fmt.Sprintf(`{"status":"replied","handled_by":%d}`, editorID), adminCookieValue)
	if replied.Code != http.StatusOK {
		t.Fatalf("mark replied status=%d body=%s", replied.Code, replied.Body)
	}
	if err := db.QueryRow(`SELECT status,handled_by FROM contact_messages WHERE id=$1`, messageID).Scan(&status, &handledBy); err != nil {
		t.Fatalf("read replied message: %v", err)
	}
	if status != "replied" || handledBy != adminID {
		t.Fatalf("replied transition status=%q handled_by=%d", status, handledBy)
	}
	handledList := authRequest(r, http.MethodGet, "/api/staff/contact-messages?status=replied", "", adminCookieValue)
	var handledPayload struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(handledList.Body.Bytes(), &handledPayload); err != nil {
		t.Fatalf("decode handled inbox list: %v", err)
	}
	if len(handledPayload.Items) != 1 {
		t.Fatalf("handled list has %d items, want 1", len(handledPayload.Items))
	}
	if _, leaked := handledPayload.Items[0]["handled_by"]; leaked {
		t.Fatal("handled inbox response exposed another user's ID")
	}
	var handledByName string
	if err := json.Unmarshal(handledPayload.Items[0]["handled_by_name"], &handledByName); err != nil {
		t.Fatalf("decode handled_by_name: %v", err)
	}
	if handledByName != "Inbox Admin" {
		t.Fatalf("handled_by_name=%q want Inbox Admin", handledByName)
	}

	invalidFilter := authRequest(r, http.MethodGet, "/api/staff/contact-messages?status=archived", "", editorCookie)
	if invalidFilter.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid filter status=%d want=422 body=%s", invalidFilter.Code, invalidFilter.Body)
	}
	invalidTransition := authRequest(r, http.MethodPatch, path, `{"status":"new"}`, editorCookie)
	if invalidTransition.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid transition status=%d want=422 body=%s", invalidTransition.Code, invalidTransition.Body)
	}
	missing := authRequest(r, http.MethodPatch, "/api/staff/contact-messages/2147483000", `{"status":"read"}`, editorCookie)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing message status=%d want=404 body=%s", missing.Code, missing.Body)
	}
	overflow := authRequest(r, http.MethodPatch, "/api/staff/contact-messages/4294967297", "{\"status\":\"read\"}", editorCookie)
	if overflow.Code != http.StatusNotFound {
		t.Fatalf("overflow message ID status=%d want=404 body=%s", overflow.Code, overflow.Body)
	}
	if err := db.QueryRow(`SELECT status,handled_by FROM contact_messages WHERE id=$1`, messageID).Scan(&status, &handledBy); err != nil {
		t.Fatalf("confirm overflow did not modify a row: %v", err)
	}
	if status != "replied" || handledBy != adminID {
		t.Fatalf("overflow ID changed another message: status=%q handled_by=%d", status, handledBy)
	}

	clamped := authRequest(r, http.MethodGet, "/api/staff/contact-messages?status=replied&page=0&limit=500", "", editorCookie)
	if clamped.Code != http.StatusOK {
		t.Fatalf("clamped list status=%d body=%s", clamped.Code, clamped.Body)
	}
	var clampedPage models.Page[struct {
		ID int32 `json:"id"`
	}]
	if err := json.Unmarshal(clamped.Body.Bytes(), &clampedPage); err != nil {
		t.Fatalf("decode clamped page: %v", err)
	}
	if clampedPage.Page != 1 || clampedPage.Limit != 50 || clampedPage.Total != 1 {
		t.Fatalf("clamped page=%#v want page=1 limit=50 total=1", clampedPage)
	}
}
