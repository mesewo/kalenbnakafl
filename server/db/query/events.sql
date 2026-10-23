-- name: ListEvents :many
SELECT id, title, description, event_date, ends_at, location, created_at
FROM events
WHERE (NOT sqlc.arg(upcoming)::boolean OR event_date >= CURRENT_TIMESTAMP)
ORDER BY CASE WHEN sqlc.arg(upcoming)::boolean THEN event_date END ASC,
         CASE WHEN NOT sqlc.arg(upcoming)::boolean THEN created_at END DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountEvents :one
SELECT count(*)::bigint
FROM events
WHERE (NOT sqlc.arg(upcoming)::boolean OR event_date >= CURRENT_TIMESTAMP);

-- name: GetEventByID :one
SELECT id, title, description, event_date, ends_at, location, created_at
FROM events WHERE id = sqlc.arg(id);

-- name: CreateEvent :exec
INSERT INTO events (title, description, event_date, ends_at, location)
VALUES (sqlc.arg(title), sqlc.arg(description), sqlc.arg(event_date), sqlc.narg(ends_at), sqlc.arg(location));

-- name: UpdateEvent :execrows
UPDATE events
SET title = sqlc.arg(title), description = sqlc.arg(description), event_date = sqlc.arg(event_date),
    ends_at = sqlc.narg(ends_at), location = sqlc.arg(location)
WHERE id = sqlc.arg(id);

-- name: DeleteEvent :execrows
DELETE FROM events WHERE id = sqlc.arg(id);