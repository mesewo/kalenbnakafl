-- name: CreateContact :exec
INSERT INTO contact_messages (name, email, message)
VALUES (sqlc.arg(name), sqlc.arg(email), sqlc.arg(message));

-- name: ListContactMessages :many
SELECT cm.id, cm.name, cm.email, cm.message, cm.status, cm.created_at,
       cm.handled_at, COALESCE(u.name, '') AS handled_by_name
FROM contact_messages AS cm
LEFT JOIN users AS u ON u.id = cm.handled_by
WHERE (sqlc.narg(status)::text IS NULL OR cm.status = sqlc.narg(status)::text)
ORDER BY cm.created_at DESC, cm.id DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountContactMessages :one
SELECT count(*)::bigint
FROM contact_messages AS cm
WHERE (sqlc.narg(status)::text IS NULL OR cm.status = sqlc.narg(status)::text);

-- name: UpdateContactMessageStatus :execrows
UPDATE contact_messages
SET status = sqlc.arg(status),
    handled_by = sqlc.arg(handled_by),
    handled_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);