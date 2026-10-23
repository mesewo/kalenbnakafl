-- name: ListMedia :many
SELECT id, title, file_path, COALESCE(media_type, '') AS media_type,
       COALESCE(original_name, '') AS original_name,
       COALESCE(size_bytes, 0) AS size_bytes, kind, created_at
FROM media
WHERE (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind)::text)
ORDER BY created_at DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountMedia :one
SELECT count(*)::bigint FROM media
WHERE sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind)::text;
-- name: CreateMedia :exec
INSERT INTO media (title, file_path, media_type, original_name, size_bytes, kind, uploaded_by)
VALUES (sqlc.arg(title), sqlc.arg(file_path), sqlc.arg(media_type),
        sqlc.arg(original_name), sqlc.arg(size_bytes), sqlc.arg(kind), sqlc.arg(uploaded_by));

-- name: GetMediaFilePath :one
SELECT file_path FROM media WHERE id = sqlc.arg(id);

-- name: DeleteMedia :execrows
DELETE FROM media WHERE id = sqlc.arg(id);
