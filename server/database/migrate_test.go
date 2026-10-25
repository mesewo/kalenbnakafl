package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"kalenbnakafl/dbgen"
	"kalenbnakafl/internal/config"
)

func testDatabase(t *testing.T) *sql.DB {
	t.Helper()
	dsn := config.Environment("DATABASE_URL_TEST")
	if dsn == "" {
		t.Skip("DATABASE_URL_TEST is not set; skipping PostgreSQL integration test")
	}

	base, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := base.PingContext(ctx); err != nil {
		_ = base.Close()
		t.Fatalf("ping test database: %v", err)
	}

	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		_ = base.Close()
		t.Skip("DATABASE_URL_TEST must be a postgres:// or postgresql:// URL to isolate the test schema")
	}
	schema := fmt.Sprintf("phase1_test_%d", time.Now().UnixNano())
	if _, err := base.ExecContext(ctx, `CREATE SCHEMA "`+schema+`"`); err != nil {
		_ = base.Close()
		t.Fatalf("create isolated test schema: %v", err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("postgres", parsed.String())
	if err != nil {
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
		t.Fatalf("open schema-scoped test database: %v", err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
		t.Fatalf("ping schema-scoped test database: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		_, _ = base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`)
		_ = base.Close()
	})
	return db
}

func TestMigrationsRoundTrip(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	var usersTable, emailIndex sql.NullString
	if err := db.QueryRow(`SELECT to_regclass('users')::text, to_regclass('users_email_lower_key')::text`).Scan(&usersTable, &emailIndex); err != nil {
		t.Fatalf("check migrated schema: %v", err)
	}
	if !usersTable.Valid || !emailIndex.Valid {
		t.Fatalf("migration objects missing: users=%v email index=%v", usersTable, emailIndex)
	}
	if _, err := provider.DownTo(ctx, 0); err != nil {
		t.Fatalf("roll migrations down: %v", err)
	}
	if err := db.QueryRow(`SELECT to_regclass('users')::text`).Scan(&usersTable); err != nil {
		t.Fatalf("check rolled-back schema: %v", err)
	}
	if usersTable.Valid {
		t.Fatalf("users table remains after rollback: %s", usersTable.String)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("reapply migrations: %v", err)
	}
}

func TestBootstrapAdminIsIdempotent(t *testing.T) {
	db := testDatabase(t)
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	queries := dbgen.New(db)
	t.Setenv("ADMIN_EMAIL", "Admin@Example.org")
	t.Setenv("ADMIN_PASSWORD", "a-test-password-with-length")
	cfg := config.Config{AdminEmail: config.Environment("ADMIN_EMAIL"), AdminPassword: config.Environment("ADMIN_PASSWORD")}

	if err := BootstrapAdmin(context.Background(), queries, cfg); err != nil {
		t.Fatalf("bootstrap first admin: %v", err)
	}
	if err := BootstrapAdmin(context.Background(), queries, cfg); err != nil {
		t.Fatalf("bootstrap second admin: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&count); err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one admin after repeated bootstrap, got %d", count)
	}
	var email string
	if err := db.QueryRow(`SELECT email FROM users WHERE role = 'admin'`).Scan(&email); err != nil {
		t.Fatalf("read bootstrap email: %v", err)
	}
	if strings.ToLower(email) != "admin@example.org" {
		t.Fatalf("expected normalized bootstrap email, got %q", email)
	}
}

func TestMigration0002BackfillsRowsCreatedBy0001(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.UpTo(ctx, 1); err != nil {
		t.Fatalf("apply migration 0001: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO users(name,email,password,role) VALUES ('Migration Author','migration@example.org','hash','admin')`); err != nil {
		t.Fatalf("insert migration author: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO posts(title,content,author_id,published) VALUES ('Hello, World!','body',1,true),('Hello World','body',1,false),('አማርኛ','body',1,false)`); err != nil {
		t.Fatalf("insert pre-0002 posts: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply migration 0002 over existing rows: %v", err)
	}
	rows, err := db.Query(`SELECT title,slug,published_at FROM posts ORDER BY id`)
	if err != nil {
		t.Fatalf("read migrated posts: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close migrated posts rows: %v", err)
		}
	}()
	want := []string{"hello-world", "hello-world-2"}
	index := 0
	for rows.Next() {
		var title, slug string
		var publishedAt sql.NullTime
		if err := rows.Scan(&title, &slug, &publishedAt); err != nil {
			t.Fatalf("scan migrated post: %v", err)
		}
		if index < len(want) && slug != want[index] {
			t.Errorf("post %q slug=%q want=%q", title, slug, want[index])
		}
		if index == 0 && !publishedAt.Valid {
			t.Error("existing published post has null published_at")
		}
		if index == 2 && !strings.HasPrefix(slug, "post-") {
			t.Errorf("Amharic fallback slug=%q", slug)
		}
		index++
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate migrated posts: %v", err)
	}
	if index != 3 {
		t.Fatalf("read %d migrated posts, want 3", index)
	}
}

func TestMigration0003BackfillsMediaKinds(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.UpTo(ctx, 2); err != nil {
		t.Fatalf("apply migrations through 0002: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO users(name,email,password,role) VALUES ('Media Author','media-migration@example.org','hash','admin')`); err != nil {
		t.Fatalf("insert uploader: %v", err)
	}
	for _, mediaType := range []string{"image/png", "video/mp4", "audio/mpeg", "application/pdf", "application/vnd.legacy"} {
		if _, err := db.Exec(`INSERT INTO media(title,file_path,media_type,uploaded_by) VALUES ($1,$2,$3,1)`, mediaType, "/uploads/legacy", mediaType); err != nil {
			t.Fatalf("insert legacy media %q: %v", mediaType, err)
		}
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply media kind migration: %v", err)
	}
	rows, err := db.Query(`SELECT media_type,kind FROM media ORDER BY id`)
	if err != nil {
		t.Fatalf("read migrated media: %v", err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Errorf("close migrated media rows: %v", err)
		}
	}()
	want := map[string]string{"image/png": "image", "video/mp4": "video", "audio/mpeg": "audio", "application/pdf": "document", "application/vnd.legacy": "document"}
	for rows.Next() {
		var mediaType, kind string
		if err := rows.Scan(&mediaType, &kind); err != nil {
			t.Fatalf("scan migrated media: %v", err)
		}
		if kind != want[mediaType] {
			t.Errorf("kind for %s=%s want=%s", mediaType, kind, want[mediaType])
		}
		delete(want, mediaType)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate migrated media: %v", err)
	}
	if len(want) != 0 {
		t.Errorf("migration did not return rows for %v", want)
	}
}
func TestMigration0004PreservesExistingContactRows(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.UpTo(ctx, 3); err != nil {
		t.Fatalf("apply migrations through 0003: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO contacts(name,email,message) VALUES ('Legacy Contact','legacy-contact@example.org','Existing message')`); err != nil {
		t.Fatalf("insert legacy contact: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply contact inbox migration: %v", err)
	}
	var id int32
	var name, email, message, status string
	if err := db.QueryRowContext(ctx, `SELECT id,name,email,message,status FROM contact_messages WHERE email=$1`, "legacy-contact@example.org").Scan(&id, &name, &email, &message, &status); err != nil {
		t.Fatalf("read preserved contact: %v", err)
	}
	if id < 1 || name != "Legacy Contact" || message != "Existing message" || status != "new" {
		t.Fatalf("migrated contact id=%d name=%q email=%q message=%q status=%q", id, name, email, message, status)
	}
	var oldTable sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT to_regclass('contacts')::text`).Scan(&oldTable); err != nil {
		t.Fatalf("check old contacts table: %v", err)
	}
	if oldTable.Valid {
		t.Fatalf("old contacts table remains after rename: %s", oldTable.String)
	}
}

func TestMigration0005CreatesVolunteerWorkflowsWithExistingData(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.UpTo(ctx, 4); err != nil {
		t.Fatalf("apply migrations through 0004: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(name,email,password,role) VALUES ('Workflow User','workflow-migration@example.org','hash','user')`); err != nil {
		t.Fatalf("insert pre-migration user: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO events(title,description,event_date) VALUES ('Existing event','Existing data',CURRENT_TIMESTAMP + INTERVAL '3 days')`); err != nil {
		t.Fatalf("insert pre-migration event: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply migration 0005: %v", err)
	}
	var usersTable, signupsTable sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT to_regclass('volunteer_applications')::text, to_regclass('event_signups')::text`).Scan(&usersTable, &signupsTable); err != nil {
		t.Fatalf("check workflow tables: %v", err)
	}
	if !usersTable.Valid || !signupsTable.Valid {
		t.Fatalf("workflow tables missing: applications=%v signups=%v", usersTable, signupsTable)
	}
	var preserved int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM events WHERE title='Existing event'`).Scan(&preserved); err != nil || preserved != 1 {
		t.Fatalf("pre-existing event data not preserved: count=%d err=%v", preserved, err)
	}
}

func TestMigration0006BackfillsTranslationsAnd0007DropsLegacyText(t *testing.T) {
	db := testDatabase(t)
	ctx := context.Background()
	provider, err := newMigrationProvider(db)
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if _, err := provider.UpTo(ctx, 5); err != nil {
		t.Fatalf("apply migrations through 0005: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO users(name,email,password,role) VALUES('Bilingual','bilingual@example.org','hash','admin')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO posts(slug,title,content,author_id,published) VALUES('bilingual-post','Legacy English title','Legacy English body',1,true)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO events(title,description,location,event_date) VALUES('Legacy event','Legacy description','Legacy place',CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO media(title,file_path,kind) VALUES('Legacy media','/uploads/legacy.png','image')`); err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 6); err != nil {
		t.Fatalf("apply translation migration: %v", err)
	}
	var title, body, vector string
	if err := db.QueryRow(`SELECT t.title,t.content,ps.search_vector::text FROM post_translations t JOIN post_search ps ON ps.post_id=t.post_id WHERE t.locale='en'`).Scan(&title, &body, &vector); err != nil {
		t.Fatal(err)
	}
	if title != "Legacy English title" || body != "Legacy English body" || !strings.Contains(vector, "legacy") {
		t.Fatalf("backfill title=%q body=%q vector=%q", title, body, vector)
	}
	var locale, eventTitle, eventDesc, eventLocation, mediaTitle string
	if err := db.QueryRow(`SELECT locale,title,description,location FROM event_translations`).Scan(&locale, &eventTitle, &eventDesc, &eventLocation); err != nil {
		t.Fatal(err)
	}
	if locale != "en" || eventTitle != "Legacy event" || eventDesc != "Legacy description" || eventLocation != "Legacy place" {
		t.Fatalf("event translation %q %q %q %q", locale, eventTitle, eventDesc, eventLocation)
	}
	if err := db.QueryRow(`SELECT title FROM media_translations`).Scan(&mediaTitle); err != nil || mediaTitle != "Legacy media" {
		t.Fatalf("media title=%q err=%v", mediaTitle, err)
	}
	if _, err := provider.UpTo(ctx, 7); err != nil {
		t.Fatalf("drop legacy fields: %v", err)
	}
	var legacyColumn sql.NullString
	if err := db.QueryRow(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='posts' AND column_name='title'`).Scan(&legacyColumn); err != sql.ErrNoRows {
		t.Fatalf("posts.title still exists or lookup failed: %v", err)
	}
	if _, err := provider.DownTo(ctx, 6); err != nil {
		t.Fatalf("restore legacy fields: %v", err)
	}
	if _, err := provider.UpTo(ctx, 7); err != nil {
		t.Fatalf("reapply legacy-field removal: %v", err)
	}
}
