-- name: ListPosts :many
SELECT p.id, p.slug,
       en.title AS en_title, en.content AS en_content,
       am.title AS am_title, am.content AS am_content,
       COALESCE(p.author_id, 0) AS author_id,
       COALESCE(u.name, '') AS author_name,
       p.published, p.published_at, p.cover_media_id,
       p.created_at, p.updated_at
FROM posts AS p
LEFT JOIN post_translations AS en ON en.post_id = p.id AND en.locale = 'en'
LEFT JOIN post_translations AS am ON am.post_id = p.id AND am.locale = 'am'
LEFT JOIN users AS u ON u.id = p.author_id
JOIN post_search AS ps ON ps.post_id = p.id
WHERE (sqlc.arg(include_unpublished)::boolean OR p.published = true)
  AND (sqlc.narg(search)::text IS NULL OR ps.search_vector @@ plainto_tsquery('simple', sqlc.narg(search)::text))
ORDER BY COALESCE(p.published_at, p.created_at) DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountPosts :one
SELECT count(*)::bigint
FROM posts AS p
JOIN post_search AS ps ON ps.post_id = p.id
WHERE (sqlc.arg(include_unpublished)::boolean OR p.published = true)
  AND (sqlc.narg(search)::text IS NULL OR ps.search_vector @@ plainto_tsquery('simple', sqlc.narg(search)::text));

-- name: GetPostBySlug :one
SELECT p.id, p.slug,
       en.title AS en_title, en.content AS en_content,
       am.title AS am_title, am.content AS am_content,
       COALESCE(p.author_id, 0) AS author_id,
       COALESCE(u.name, '') AS author_name,
       p.published, p.published_at, p.cover_media_id, p.created_at, p.updated_at
FROM posts AS p
LEFT JOIN post_translations AS en ON en.post_id = p.id AND en.locale = 'en'
LEFT JOIN post_translations AS am ON am.post_id = p.id AND am.locale = 'am'
LEFT JOIN users AS u ON u.id = p.author_id
WHERE p.slug = sqlc.arg(slug) AND p.published = true;

-- name: CreatePost :one
INSERT INTO posts (slug, author_id, published, cover_media_id, updated_at)
VALUES (sqlc.arg(slug), sqlc.arg(author_id), false, sqlc.narg(cover_media_id), CURRENT_TIMESTAMP)
RETURNING id;

-- name: UpsertPostTranslation :exec
INSERT INTO post_translations(post_id, locale, title, content)
VALUES (sqlc.arg(post_id), sqlc.arg(locale), sqlc.arg(title), sqlc.arg(content))
ON CONFLICT (post_id, locale) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;

-- name: DeletePostTranslation :execrows
DELETE FROM post_translations WHERE post_id = sqlc.arg(post_id) AND locale = sqlc.arg(locale);

-- name: CountPostTranslations :one
SELECT count(*)::bigint FROM post_translations WHERE post_id = sqlc.arg(post_id);

-- name: LockPost :one
SELECT id FROM posts WHERE id = sqlc.arg(id) FOR UPDATE;

-- name: UpdatePostFields :execrows
UPDATE posts
SET slug = COALESCE(sqlc.narg(slug), slug),
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
