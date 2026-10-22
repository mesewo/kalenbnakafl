-- name: ListPosts :many
SELECT p.id, p.slug, p.title, p.content,
       COALESCE(p.author_id, 0) AS author_id,
       COALESCE(u.name, '') AS author_name,
       p.published, p.published_at, p.cover_media_id,
       p.created_at, p.updated_at
FROM posts AS p
LEFT JOIN users AS u ON u.id = p.author_id
WHERE (sqlc.arg(include_unpublished)::boolean OR p.published = true)
  AND (sqlc.narg(search)::text IS NULL OR p.search_vector @@ plainto_tsquery('simple', sqlc.narg(search)::text))
ORDER BY COALESCE(p.published_at, p.created_at) DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountPosts :one
SELECT count(*)::bigint
FROM posts AS p
WHERE (sqlc.arg(include_unpublished)::boolean OR p.published = true)
  AND (sqlc.narg(search)::text IS NULL OR p.search_vector @@ plainto_tsquery('simple', sqlc.narg(search)::text));

-- name: GetPostBySlug :one
SELECT p.id, p.slug, p.title, p.content,
       COALESCE(p.author_id, 0) AS author_id,
       COALESCE(u.name, '') AS author_name,
       p.published, p.published_at, p.cover_media_id, p.created_at, p.updated_at
FROM posts AS p
LEFT JOIN users AS u ON u.id = p.author_id
WHERE p.slug = sqlc.arg(slug) AND p.published = true;

-- name: CreatePost :exec
INSERT INTO posts (slug, title, content, author_id, published, cover_media_id, updated_at)
VALUES (sqlc.arg(slug), sqlc.arg(title), sqlc.arg(content), sqlc.arg(author_id), false, sqlc.narg(cover_media_id), CURRENT_TIMESTAMP);

-- name: UpdatePost :execrows
UPDATE posts
SET slug = COALESCE(sqlc.narg(slug), slug),
    title = sqlc.arg(title), content = sqlc.arg(content),
    cover_media_id = COALESCE(sqlc.narg(cover_media_id), cover_media_id),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: DeletePost :execrows
DELETE FROM posts WHERE id = sqlc.arg(id);

-- name: PublishPost :execrows
UPDATE posts
SET published = sqlc.arg(published),
    published_at = CASE WHEN sqlc.arg(published)::boolean AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);