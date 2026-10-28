package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log/slog"
	"net/mail"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"kalenbnakafl/database"
	"kalenbnakafl/internal/auth"
	"kalenbnakafl/internal/config"
	"kalenbnakafl/internal/storage"
)

type demoAccount struct {
	name     string
	email    string
	password string
	role     string
}

type demoPost struct {
	slug    string
	cover   string
	enTitle string
	enBody  string
	amTitle string
	amBody  string
}

type demoEvent struct {
	enTitle       string
	enDescription string
	enLocation    string
	amTitle       string
	amDescription string
	amLocation    string
}

type demoMedia struct {
	name       string
	enTitle    string
	amTitle    string
	background color.RGBA
	accent     color.RGBA
}

var demoMediaItems = []demoMedia{
	{
		name: "demo-community-garden.png", enTitle: "Community garden",
		amTitle:    "የማህበረሰብ አትክልት ስፍራ",
		background: color.RGBA{R: 18, G: 72, B: 59, A: 255},
		accent:     color.RGBA{R: 232, G: 183, B: 83, A: 255},
	},
	{
		name: "demo-learning-workshop.png", enTitle: "Learning together",
		amTitle:    "አብረን መማር",
		background: color.RGBA{R: 33, G: 66, B: 112, A: 255},
		accent:     color.RGBA{R: 238, G: 191, B: 101, A: 255},
	},
}

var demoPosts = []demoPost{
	{
		slug: "demo-community-garden", cover: "demo-community-garden.png",
		enTitle: "Growing a stronger community garden",
		enBody:  "Neighbors are working together to grow fresh food, share skills, and make a welcoming green space for everyone.",
		amTitle: "ጠንካራ የማህበረሰብ አትክልት ማሳደግ",
		amBody:  "ጎረቤቶች ትኩስ ምግብ ለማብቀል፣ ክህሎት ለመጋራት እና ለሁሉም የሚቀበል አረንጓዴ ቦታ ለመፍጠር በጋራ እየሰሩ ነው።",
	},
	{
		slug: "demo-youth-learning", cover: "demo-learning-workshop.png",
		enTitle: "Young people learning together",
		enBody:  "Our volunteer-led workshops give young people a friendly place to explore ideas, build confidence, and support one another.",
		amTitle: "ወጣቶች በጋራ ይማራሉ",
		amBody:  "በበጎ ፈቃደኞች የሚመሩት ወርክሾፖች ወጣቶች ሀሳቦችን የሚመረምሩበት፣ በራስ መተማመን የሚገነቡበት እና እርስ በርስ የሚደጋገፉበት ተስማሚ ቦታ ይሰጣሉ።",
	},
}

var demoEvents = []demoEvent{
	{
		enTitle:       "Demo: Community garden day",
		enDescription: "Join neighbors for a hands-on morning of planting, conversation, and shared lunch.",
		enLocation:    "Community garden",
		amTitle:       "ማሳያ፦ የማህበረሰብ አትክልት ቀን",
		amDescription: "ከጎረቤቶች ጋር ተክሎችን ለመትከል፣ ለመወያየት እና ምሳ ለመጋራት ይቀላቀሉን።",
		amLocation:    "የማህበረሰብ አትክልት ስፍራ",
	},
	{
		enTitle:       "Demo: Youth learning workshop",
		enDescription: "A welcoming, volunteer-led workshop for young people to learn and create together.",
		enLocation:    "Community learning room",
		amTitle:       "ማሳያ፦ የወጣቶች የትምህርት ወርክሾፕ",
		amDescription: "ወጣቶች በጋራ ለመማርና ለመፍጠር በበጎ ፈቃደኞች የሚመራ ክፍት ወርክሾፕ።",
		amLocation:    "የማህበረሰብ የትምህርት ክፍል",
	},
}

func main() {
	if err := run(); err != nil {
		slog.Error("demo seed failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	accounts, err := demoAccountsFromEnvironment(config.Environment)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	var mediaStorage storage.Storage
	switch cfg.StorageDriver {
	case "local":
		if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
			return fmt.Errorf("create local media directory: %w", err)
		}
		mediaStorage = storage.NewLocal(cfg.UploadDir)
	case "s3":
		mediaStorage, err = storage.NewS3(ctx, storage.S3Config{
			Endpoint: cfg.S3Endpoint, Region: cfg.S3Region, Bucket: cfg.S3Bucket,
			AccessKeyID: cfg.S3AccessKeyID, SecretAccessKey: cfg.S3SecretAccessKey,
			PathStyle: cfg.S3PathStyle,
		})
		if err != nil {
			return fmt.Errorf("configure media storage: %w", err)
		}
	default:
		return fmt.Errorf("unsupported storage driver %q", cfg.StorageDriver)
	}
	if err := mediaStorage.Check(ctx); err != nil {
		return fmt.Errorf("check media storage: %w", err)
	}
	db, _, err := database.Connect(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("close database pool", "error_type", fmt.Sprintf("%T", err))
		}
	}()
	if err := seed(ctx, db, mediaStorage, accounts); err != nil {
		return err
	}
	slog.Info("demo content and accounts are ready")
	return nil
}

func demoAccountsFromEnvironment(getenv func(string) string) ([2]demoAccount, error) {
	accounts := [2]demoAccount{
		{name: "Demo Editor", email: strings.TrimSpace(getenv("DEMO_EDITOR_EMAIL")), password: getenv("DEMO_EDITOR_PASSWORD"), role: "editor"},
		{name: "Demo Volunteer", email: strings.TrimSpace(getenv("DEMO_VOLUNTEER_EMAIL")), password: getenv("DEMO_VOLUNTEER_PASSWORD"), role: "volunteer"},
	}
	for i := range accounts {
		parsed, err := mail.ParseAddress(accounts[i].email)
		if err != nil || parsed.Address != accounts[i].email || accounts[i].password == "" {
			return [2]demoAccount{}, fmt.Errorf("DEMO_%s_EMAIL and DEMO_%s_PASSWORD must be valid and non-empty", strings.ToUpper(accounts[i].role), strings.ToUpper(accounts[i].role))
		}
		if err := auth.ValidatePassword(accounts[i].password, accounts[i].email, accounts[i].name); err != nil {
			return [2]demoAccount{}, fmt.Errorf("invalid DEMO_%s_PASSWORD: %s", strings.ToUpper(accounts[i].role), err.Error())
		}
		accounts[i].email = strings.ToLower(accounts[i].email)
	}
	if accounts[0].email == accounts[1].email {
		return [2]demoAccount{}, errors.New("demo editor and volunteer emails must be different")
	}
	return accounts, nil
}

func seed(ctx context.Context, db *sql.DB, mediaStorage storage.Storage, accounts [2]demoAccount) (resultErr error) {
	passwordHashes := [2]string{}
	for i, account := range accounts {
		hash, err := bcrypt.GenerateFromPassword([]byte(account.password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash demo %s password: %w", account.role, err)
		}
		passwordHashes[i] = string(hash)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin demo seed transaction: %w", err)
	}
	committed := false
	var createdObjects []string
	defer func() {
		if committed {
			return
		}
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			resultErr = errors.Join(resultErr, fmt.Errorf("roll back demo seed: %w", rollbackErr))
		}
		for _, objectName := range createdObjects {
			if deleteErr := mediaStorage.Delete(ctx, objectName); deleteErr != nil {
				resultErr = errors.Join(resultErr, fmt.Errorf("remove unreferenced demo media %q: %w", objectName, deleteErr))
			}
		}
	}()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(741920641)); err != nil {
		return fmt.Errorf("lock demo seed: %w", err)
	}
	var editorID int32
	for i, account := range accounts {
		var userID int32
		err := tx.QueryRowContext(ctx, `
			INSERT INTO users (name, email, password, role)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (lower(email)) DO UPDATE
			SET name = EXCLUDED.name, password = EXCLUDED.password,
			    role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP
			WHERE users.role <> 'admin'
			RETURNING id
		`, account.name, account.email, passwordHashes[i], account.role).Scan(&userID)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("demo %s email belongs to an admin; refusing to alter that account", account.role)
		}
		if err != nil {
			return fmt.Errorf("upsert demo %s account: %w", account.role, err)
		}
		if account.role == "editor" {
			editorID = userID
		}
	}

	mediaIDs := make(map[string]int32, len(demoMediaItems))
	for _, item := range demoMediaItems {
		mediaID, createdObject, err := ensureMedia(ctx, tx, mediaStorage, item, editorID)
		if err != nil {
			return err
		}
		if createdObject != "" {
			createdObjects = append(createdObjects, createdObject)
		}
		mediaIDs[item.name] = mediaID
	}

	for _, post := range demoPosts {
		var postID int32
		err := tx.QueryRowContext(ctx, `
			INSERT INTO posts (slug, author_id, published, published_at, cover_media_id, updated_at)
			VALUES ($1, $2, true, CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP)
			ON CONFLICT (slug) DO UPDATE
			SET author_id = EXCLUDED.author_id, published = true,
			    published_at = CURRENT_TIMESTAMP, cover_media_id = EXCLUDED.cover_media_id,
			    updated_at = CURRENT_TIMESTAMP
			RETURNING id
		`, post.slug, editorID, mediaIDs[post.cover]).Scan(&postID)
		if err != nil {
			return fmt.Errorf("upsert demo post %q: %w", post.slug, err)
		}
		for _, translation := range []struct{ locale, title, body string }{
			{"en", post.enTitle, post.enBody}, {"am", post.amTitle, post.amBody},
		} {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO post_translations (post_id, locale, title, content)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (post_id, locale) DO UPDATE
				SET title = EXCLUDED.title, content = EXCLUDED.content
			`, postID, translation.locale, translation.title, translation.body); err != nil {
				return fmt.Errorf("upsert %s translation for demo post %q: %w", translation.locale, post.slug, err)
			}
		}
	}

	now := time.Now().UTC()
	for i, event := range demoEvents {
		start := now.Add(time.Duration(14+i*21) * 24 * time.Hour)
		end := start.Add(2 * time.Hour)
		var eventID int32
		err := tx.QueryRowContext(ctx, `
			SELECT event_id FROM event_translations
			WHERE locale = 'en' AND title = $1
			FOR UPDATE
		`, event.enTitle).Scan(&eventID)
		if errors.Is(err, sql.ErrNoRows) {
			err = tx.QueryRowContext(ctx, `
				INSERT INTO events (event_date, ends_at) VALUES ($1, $2) RETURNING id
			`, start, end).Scan(&eventID)
		} else if err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE events SET event_date = $1, ends_at = $2 WHERE id = $3`, start, end, eventID)
		}
		if err != nil {
			return fmt.Errorf("upsert demo event %q: %w", event.enTitle, err)
		}
		for _, translation := range []struct {
			locale, title, description, location string
		}{
			{"en", event.enTitle, event.enDescription, event.enLocation},
			{"am", event.amTitle, event.amDescription, event.amLocation},
		} {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO event_translations (event_id, locale, title, description, location)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (event_id, locale) DO UPDATE
				SET title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location
			`, eventID, translation.locale, translation.title, translation.description, translation.location); err != nil {
				return fmt.Errorf("upsert %s translation for demo event %q: %w", translation.locale, event.enTitle, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit demo seed: %w", err)
	}
	committed = true
	return nil
}

func ensureMedia(ctx context.Context, tx *sql.Tx, mediaStorage storage.Storage, item demoMedia, editorID int32) (mediaID int32, createdObject string, resultErr error) {
	var filePath string
	err := tx.QueryRowContext(ctx, `
		SELECT id, file_path FROM media WHERE original_name = $1
		ORDER BY id LIMIT 1 FOR UPDATE
	`, item.name).Scan(&mediaID, &filePath)
	defer func() {
		if resultErr != nil && createdObject != "" {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if cleanupErr := mediaStorage.Delete(cleanupCtx, createdObject); cleanupErr != nil {
				resultErr = errors.Join(resultErr, fmt.Errorf("remove unreferenced demo media %q: %w", createdObject, cleanupErr))
			}
		}
	}()
	if errors.Is(err, sql.ErrNoRows) {
		var objectName string
		var size int64
		var imageBytes []byte
		imageBytes, err = demoImage(item)
		if err != nil {
			return 0, "", fmt.Errorf("generate demo media %q: %w", item.name, err)
		}
		objectName, size, err = mediaStorage.Save(ctx, bytes.NewReader(imageBytes), ".png", 2*1024*1024)
		if err != nil {
			return 0, "", fmt.Errorf("save demo media %q: %w", item.name, err)
		}
		createdObject = objectName
		err = tx.QueryRowContext(ctx, `
			INSERT INTO media (file_path, media_type, original_name, size_bytes, kind, uploaded_by)
			VALUES ($1, 'image/png', $2, $3, 'image', $4)
			RETURNING id
		`, "/uploads/"+objectName, item.name, size, editorID).Scan(&mediaID)
	} else if err == nil && !strings.HasPrefix(filePath, "/uploads/") {
		objectName := strings.TrimPrefix(strings.TrimPrefix(filePath, "/"), "uploads/")
		if _, err := tx.ExecContext(ctx, `UPDATE media SET file_path = $1 WHERE id = $2`, "/uploads/"+objectName, mediaID); err != nil {
			return 0, "", fmt.Errorf("normalize demo media path %q: %w", item.name, err)
		}
	}
	if err != nil {
		return 0, createdObject, fmt.Errorf("find or create demo media %q: %w", item.name, err)
	}
	for _, translation := range []struct{ locale, title string }{
		{"en", item.enTitle}, {"am", item.amTitle},
	} {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO media_translations (media_id, locale, title) VALUES ($1, $2, $3)
			ON CONFLICT (media_id, locale) DO UPDATE SET title = EXCLUDED.title
		`, mediaID, translation.locale, translation.title); err != nil {
			return 0, createdObject, fmt.Errorf("upsert %s translation for demo media %q: %w", translation.locale, item.name, err)
		}
	}
	return mediaID, createdObject, nil
}

func demoImage(item demoMedia) ([]byte, error) {
	const width, height = 1200, 630
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		factor := uint8(y * 28 / height)
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{
				R: item.background.R + factor/3,
				G: item.background.G + factor,
				B: item.background.B + factor/2,
				A: 255,
			})
		}
	}
	centerX, centerY, radius := width*3/4, height/2, height/3
	for y := centerY - radius; y < centerY+radius; y++ {
		for x := centerX - radius; x < centerX+radius; x++ {
			dx, dy := x-centerX, y-centerY
			if dx*dx+dy*dy <= radius*radius {
				img.SetRGBA(x, y, item.accent)
			}
		}
	}
	for y := height * 3 / 4; y < height*3/4+18; y++ {
		for x := width / 12; x < width/2; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 255, G: 255, B: 255, A: 220})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		return nil, fmt.Errorf("encode PNG: %w", err)
	}
	return encoded.Bytes(), nil
}
