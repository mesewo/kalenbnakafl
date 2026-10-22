-- name: ListEvents :many
SELECT id, title, description, event_date, created_at
FROM events
WHERE event_date >= CURRENT_TIMESTAMP - INTERVAL '1 day'
ORDER BY event_date ASC;

-- name: CreateEvent :exec
INSERT INTO events (title, description, event_date)
VALUES (sqlc.arg(title), sqlc.arg(description), sqlc.arg(event_date));

-- name: UpdateEvent :execrows
UPDATE events
SET title = sqlc.arg(title), description = sqlc.arg(description), event_date = sqlc.arg(event_date)
WHERE id = sqlc.arg(id);

-- name: DeleteEvent :execrows
DELETE FROM events WHERE id = sqlc.arg(id);
