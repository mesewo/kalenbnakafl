-- name: ListMedia :many
SELECT m.id, m.file_path, COALESCE(m.media_type, '') AS media_type,
       COALESCE(m.original_name, '') AS original_name,
       COALESCE(m.size_bytes, 0) AS size_bytes, m.kind, m.created_at,
       en.title AS en_title, am.title AS am_title
FROM media m
LEFT JOIN media_translations en ON en.media_id = m.id AND en.locale = 'en'
LEFT JOIN media_translations am ON am.media_id = m.id AND am.locale = 'am'
WHERE (sqlc.narg(kind)::text IS NULL OR m.kind = sqlc.narg(kind)::text)
ORDER BY m.created_at DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountMedia :one
SELECT count(*)::bigint FROM media
WHERE sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind)::text;

-- name: CreateMedia :one
INSERT INTO media (file_path, media_type, original_name, size_bytes, kind, uploaded_by)
VALUES (sqlc.arg(file_path), sqlc.narg(media_type),
        sqlc.narg(original_name), sqlc.arg(size_bytes), sqlc.arg(kind), sqlc.narg(uploaded_by))
RETURNING id;

-- name: UpsertMediaTranslation :exec
INSERT INTO media_translations(media_id, locale, title)
VALUES (sqlc.arg(media_id), sqlc.arg(locale), sqlc.arg(title))
ON CONFLICT (media_id, locale) DO UPDATE SET title = EXCLUDED.title;

-- name: GetMediaFilePath :one
SELECT file_path FROM media WHERE id = sqlc.arg(id);

-- name: DeleteMedia :execrows
DELETE FROM media WHERE id = sqlc.arg(id);
