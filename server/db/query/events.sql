-- name: ListEvents :many
SELECT e.id,
       en.title AS en_title, en.description AS en_description, en.location AS en_location,
       am.title AS am_title, am.description AS am_description, am.location AS am_location,
       e.event_date, e.ends_at, e.created_at
FROM events e
LEFT JOIN event_translations en ON en.event_id = e.id AND en.locale = 'en'
LEFT JOIN event_translations am ON am.event_id = e.id AND am.locale = 'am'
WHERE (NOT sqlc.arg(upcoming)::boolean OR e.event_date >= CURRENT_TIMESTAMP)
ORDER BY CASE WHEN sqlc.arg(upcoming)::boolean THEN e.event_date END ASC,
         CASE WHEN NOT sqlc.arg(upcoming)::boolean THEN e.created_at END DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountEvents :one
SELECT count(*)::bigint FROM events
WHERE (NOT sqlc.arg(upcoming)::boolean OR event_date >= CURRENT_TIMESTAMP);

-- name: GetEventByID :one
SELECT e.id,
       en.title AS en_title, en.description AS en_description, en.location AS en_location,
       am.title AS am_title, am.description AS am_description, am.location AS am_location,
       e.event_date, e.ends_at, e.created_at
FROM events e
LEFT JOIN event_translations en ON en.event_id = e.id AND en.locale = 'en'
LEFT JOIN event_translations am ON am.event_id = e.id AND am.locale = 'am'
WHERE e.id = sqlc.arg(id);

-- name: CreateEvent :one
INSERT INTO events (event_date, ends_at)
VALUES (sqlc.arg(event_date), sqlc.narg(ends_at))
RETURNING id;

-- name: UpsertEventTranslation :exec
INSERT INTO event_translations(event_id, locale, title, description, location)
VALUES (sqlc.arg(event_id), sqlc.arg(locale), sqlc.arg(title), sqlc.arg(description), sqlc.arg(location))
ON CONFLICT (event_id, locale) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, location = EXCLUDED.location;

-- name: DeleteEventTranslation :execrows
DELETE FROM event_translations WHERE event_id = sqlc.arg(event_id) AND locale = sqlc.arg(locale);

-- name: CountEventTranslations :one
SELECT count(*)::bigint FROM event_translations WHERE event_id = sqlc.arg(event_id);

-- name: LockEvent :one
SELECT id FROM events WHERE id = sqlc.arg(id) FOR UPDATE;

-- name: UpdateEventFields :execrows
UPDATE events
SET event_date = sqlc.arg(event_date), ends_at = sqlc.narg(ends_at)
WHERE id = sqlc.arg(id);

-- name: DeleteEvent :execrows
DELETE FROM events WHERE id = sqlc.arg(id);
