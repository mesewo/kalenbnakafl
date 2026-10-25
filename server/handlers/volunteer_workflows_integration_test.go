package handlers_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"kalenbnakafl/models"
)

func TestVolunteerApplicationSubmitReviewAndRollback(t *testing.T) {
	db, q, r := authTestApp(t)
	userID := createAuthUser(t, q, "Applicant", "workflow-applicant@example.org", "a-long-test-password", "user")
	cookie := adminCookie(t, int(userID), "user")
	response := authRequest(r, http.MethodPost, "/api/me/volunteer-application", `{"skills":"First aid, facilitation","availability":"Weekends","message":"I can help"}`, cookie)
	if response.Code != http.StatusCreated {
		t.Fatalf("apply status=%d body=%s", response.Code, response.Body)
	}
	if duplicate := authRequest(r, http.MethodPost, "/api/me/volunteer-application", `{"skills":"More","availability":"Weekdays"}`, cookie); duplicate.Code != http.StatusConflict {
		t.Fatalf("duplicate application status=%d want=409 body=%s", duplicate.Code, duplicate.Body)
	}
	own := authRequest(r, http.MethodGet, "/api/me/volunteer-application", "", cookie)
	var application struct {
		ID     int32  `json:"id"`
		Status string `json:"status"`
	}
	if own.Code != http.StatusOK || json.Unmarshal(own.Body.Bytes(), &application) != nil || application.Status != "pending" {
		t.Fatalf("get application status=%d body=%s", own.Code, own.Body)
	}
	adminID := createAuthUser(t, q, "Workflow Admin", "workflow-admin@example.org", "a-long-test-password", "admin")
	admin := adminCookie(t, int(adminID), "admin")
	if invalid := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/volunteer-applications/%d", application.ID), `{"status":"pending"}`, admin); invalid.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid status=%d want=422 body=%s", invalid.Code, invalid.Body)
	}
	// Force the promotion statement to fail; the application review must roll back too.
	if _, err := db.Exec(`CREATE FUNCTION reject_volunteer_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='volunteer' THEN RAISE EXCEPTION 'simulated role update failure'; END IF; RETURN NEW; END $$`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER reject_volunteer_promotion BEFORE UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION reject_volunteer_promotion()`); err != nil {
		t.Fatal(err)
	}
	failed := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/volunteer-applications/%d", application.ID), `{"status":"approved"}`, admin)
	if failed.Code != http.StatusInternalServerError {
		t.Fatalf("forced approval failure status=%d body=%s", failed.Code, failed.Body)
	}
	var status, role string
	var reviewedBy sql.NullInt32
	if err := db.QueryRow(`SELECT va.status,va.reviewed_by,u.role FROM volunteer_applications va JOIN users u ON u.id=va.user_id WHERE va.id=$1`, application.ID).Scan(&status, &reviewedBy, &role); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || reviewedBy.Valid || role != "user" {
		t.Fatalf("failed approval was not rolled back: status=%s reviewer=%v role=%s", status, reviewedBy, role)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_volunteer_promotion ON users`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DROP FUNCTION reject_volunteer_promotion()`); err != nil {
		t.Fatal(err)
	}
	approved := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/volunteer-applications/%d", application.ID), fmt.Sprintf(`{"status":"approved","reviewed_by":%d}`, userID), admin)
	if approved.Code != http.StatusOK {
		t.Fatalf("approve status=%d body=%s", approved.Code, approved.Body)
	}
	var reviewedAt sql.NullTime
	if err := db.QueryRow(`SELECT va.status,va.reviewed_by,va.reviewed_at,u.role FROM volunteer_applications va JOIN users u ON u.id=va.user_id WHERE va.id=$1`, application.ID).Scan(&status, &reviewedBy, &reviewedAt, &role); err != nil {
		t.Fatal(err)
	}
	if status != "approved" || !reviewedBy.Valid || reviewedBy.Int32 != adminID || !reviewedAt.Valid || role != "volunteer" {
		t.Fatalf("approval state status=%s reviewer=%v reviewed=%v role=%s", status, reviewedBy, reviewedAt, role)
	}
}

func TestVolunteerApplicationRoleConflictsDeclineAndNoDowngrade(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Workflow Admin", "role-admin@example.org", "a-long-test-password", "admin")
	admin := adminCookie(t, int(adminID), "admin")
	for _, role := range []string{"volunteer", "editor", "admin"} {
		id := createAuthUser(t, q, "Applicant "+role, role+"-applicant@example.org", "a-long-test-password", role)
		resp := authRequest(r, http.MethodPost, "/api/me/volunteer-application", `{"skills":"help","availability":"weekends"}`, adminCookie(t, int(id), role))
		if resp.Code != http.StatusConflict {
			t.Errorf("%s application status=%d want=409 body=%s", role, resp.Code, resp.Body)
		}
	}
	for _, role := range []string{"editor", "admin"} {
		id := createAuthUser(t, q, "Elevated Applicant "+role, "elevated-"+role+"@example.org", "a-long-test-password", role)
		var appID int32
		if err := db.QueryRow(`INSERT INTO volunteer_applications(user_id,skills,availability) VALUES($1,'skills','time') RETURNING id`, id).Scan(&appID); err != nil {
			t.Fatal(err)
		}
		resp := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/volunteer-applications/%d", appID), `{"status":"approved"}`, admin)
		if resp.Code != http.StatusOK {
			t.Fatalf("approve elevated %s status=%d body=%s", role, resp.Code, resp.Body)
		}
		var got string
		if err := db.QueryRow(`SELECT role FROM users WHERE id=$1`, id).Scan(&got); err != nil || got != role {
			t.Fatalf("elevated role changed from %s to %s: %v", role, got, err)
		}
	}
	declinedID := createAuthUser(t, q, "Declined Applicant", "declined-applicant@example.org", "a-long-test-password", "user")
	var appID int32
	if err := db.QueryRow(`INSERT INTO volunteer_applications(user_id,skills,availability) VALUES($1,'skills','time') RETURNING id`, declinedID).Scan(&appID); err != nil {
		t.Fatal(err)
	}
	response := authRequest(r, http.MethodPatch, fmt.Sprintf("/api/admin/volunteer-applications/%d", appID), `{"status":"declined"}`, admin)
	if response.Code != http.StatusOK {
		t.Fatalf("decline status=%d body=%s", response.Code, response.Body)
	}
	var role, status string
	if err := db.QueryRow(`SELECT u.role,va.status FROM users u JOIN volunteer_applications va ON va.user_id=u.id WHERE va.id=$1`, appID).Scan(&role, &status); err != nil {
		t.Fatal(err)
	}
	if role != "user" || status != "declined" {
		t.Fatalf("decline state role=%s status=%s", role, status)
	}
	if retry := authRequest(r, http.MethodPost, "/api/me/volunteer-application", `{"skills":"new","availability":"weekdays"}`, adminCookie(t, int(declinedID), "user")); retry.Code != http.StatusConflict {
		t.Fatalf("declined reapplication status=%d want=409", retry.Code)
	}
	invalidFilter := authRequest(r, http.MethodGet, "/api/admin/volunteer-applications?status=unknown", "", admin)
	if invalidFilter.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid filter=%d want=422", invalidFilter.Code)
	}
	list := authRequest(r, http.MethodGet, "/api/admin/volunteer-applications?page=0&limit=500", "", admin)
	var page models.Page[struct {
		ID int32 `json:"id"`
	}]
	if list.Code != http.StatusOK || json.Unmarshal(list.Body.Bytes(), &page) != nil || page.Page != 1 || page.Limit != 50 {
		t.Fatalf("application paging status=%d page=%#v body=%s", list.Code, page, list.Body)
	}
}

func TestVolunteerApplicationCannotBeReviewedTwice(t *testing.T) {
	db, q, r := authTestApp(t)
	adminID := createAuthUser(t, q, "Review Admin", "review-repeat-admin@example.org", "a-long-test-password", "admin")
	admin := adminCookie(t, int(adminID), "admin")
	cases := []struct {
		name         string
		first, again string
		initialRole  string
		finalRole    string
	}{
		{name: "approve twice", first: "approved", again: "approved", initialRole: "user", finalRole: "volunteer"},
		{name: "decline then approve", first: "declined", again: "approved", initialRole: "user", finalRole: "user"},
		{name: "approve then decline", first: "approved", again: "declined", initialRole: "user", finalRole: "volunteer"},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID := createAuthUser(t, q, "Applicant", fmt.Sprintf("repeat-applicant-%d@example.org", i), "a-long-test-password", tc.initialRole)
			var applicationID int32
			if err := db.QueryRow(`INSERT INTO volunteer_applications(user_id,skills,availability) VALUES($1,'skills','weekends') RETURNING id`, userID).Scan(&applicationID); err != nil {
				t.Fatal(err)
			}
			path := fmt.Sprintf("/api/admin/volunteer-applications/%d", applicationID)
			first := authRequest(r, http.MethodPatch, path, fmt.Sprintf(`{"status":%q}`, tc.first), admin)
			if first.Code != http.StatusOK {
				t.Fatalf("first review status=%d body=%s", first.Code, first.Body)
			}
			again := authRequest(r, http.MethodPatch, path, fmt.Sprintf(`{"status":%q}`, tc.again), admin)
			var envelope struct {
				Error struct {
					Code    string         `json:"code"`
					Message string         `json:"message"`
					Details map[string]any `json:"details"`
				} `json:"error"`
			}
			if again.Code != http.StatusConflict || json.Unmarshal(again.Body.Bytes(), &envelope) != nil || envelope.Error.Code != "conflict" || envelope.Error.Message == "" || envelope.Error.Details == nil {
				t.Fatalf("repeat review status=%d envelope=%+v body=%s", again.Code, envelope, again.Body)
			}
			var status, role string
			if err := db.QueryRow(`SELECT va.status,u.role FROM volunteer_applications va JOIN users u ON u.id=va.user_id WHERE va.id=$1`, applicationID).Scan(&status, &role); err != nil {
				t.Fatal(err)
			}
			if status != tc.first || role != tc.finalRole {
				t.Fatalf("repeat review changed state: status=%s role=%s want status=%s role=%s", status, role, tc.first, tc.finalRole)
			}
		})
	}
}

func TestEventSignupsAndAttendees(t *testing.T) {
	db, q, r := authTestApp(t)
	userID := createAuthUser(t, q, "Signup User", "signup-user@example.org", "a-long-test-password", "user")
	cookie := adminCookie(t, int(userID), "user")
	eventID := insertTestEvent(t, db)
	path := fmt.Sprintf("/api/events/%d/signup", eventID)
	if response := authRequest(r, http.MethodPost, path, `{}`, cookie); response.Code != http.StatusCreated {
		t.Fatalf("signup status=%d body=%s", response.Code, response.Body)
	}
	if response := authRequest(r, http.MethodPost, path, `{}`, cookie); response.Code != http.StatusConflict {
		t.Fatalf("duplicate signup status=%d want=409 body=%s", response.Code, response.Body)
	}
	pastID := insertPastEvent(t, db)
	if response := authRequest(r, http.MethodPost, fmt.Sprintf("/api/events/%d/signup", pastID), `{}`, cookie); response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("past signup status=%d want=422 body=%s", response.Code, response.Body)
	}
	if response := authRequest(r, http.MethodPost, "/api/events/2147483000/signup", `{}`, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("unknown event signup=%d want=404", response.Code)
	}
	pageResponse := authRequest(r, http.MethodGet, "/api/me/signups?page=0&limit=500", "", cookie)
	var signups models.Page[struct {
		ID int32 `json:"id"`
	}]
	if pageResponse.Code != http.StatusOK || json.Unmarshal(pageResponse.Body.Bytes(), &signups) != nil || signups.Page != 1 || signups.Limit != 50 || signups.Total != 1 {
		t.Fatalf("my signups status=%d page=%#v body=%s", pageResponse.Code, signups, pageResponse.Body)
	}
	adminID := createAuthUser(t, q, "Signup Admin", "signup-admin@example.org", "a-long-test-password", "admin")
	attendees := authRequest(r, http.MethodGet, fmt.Sprintf("/api/admin/events/%d/signups?page=1&limit=1", eventID), "", adminCookie(t, int(adminID), "admin"))
	var attendeePage models.Page[struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}]
	if attendees.Code != http.StatusOK || json.Unmarshal(attendees.Body.Bytes(), &attendeePage) != nil || attendeePage.Total != 1 || len(attendeePage.Items) != 1 || attendeePage.Items[0].Email != "signup-user@example.org" {
		t.Fatalf("attendees status=%d page=%#v body=%s", attendees.Code, attendeePage, attendees.Body)
	}
	if cancel := authRequest(r, http.MethodDelete, path, `{}`, cookie); cancel.Code != http.StatusOK {
		t.Fatalf("cancel signup status=%d body=%s", cancel.Code, cancel.Body)
	}
	var signupCount int
	if err := db.QueryRow(`SELECT count(*) FROM event_signups WHERE event_id=$1`, eventID).Scan(&signupCount); err != nil || signupCount != 0 {
		t.Fatalf("cancel did not delete signup, count=%d err=%v", signupCount, err)
	}
	newSignup := authRequest(r, http.MethodPost, path, `{}`, cookie)
	if newSignup.Code != http.StatusCreated {
		t.Fatalf("resignup status=%d body=%s", newSignup.Code, newSignup.Body)
	}
	if _, err := db.Exec(`DELETE FROM events WHERE id=$1`, eventID); err != nil {
		t.Fatalf("delete event for cascade test: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM event_signups WHERE event_id=$1`, eventID).Scan(&signupCount); err != nil || signupCount != 0 {
		t.Fatalf("event deletion did not cascade to signups, count=%d err=%v", signupCount, err)
	}
}

func insertPastEvent(t *testing.T, db *sql.DB) int32 {
	t.Helper()
	var id int32
	if err := db.QueryRow(`INSERT INTO events(title,description,event_date) VALUES('Past signup event','Past event',CURRENT_TIMESTAMP - INTERVAL '1 day') RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
