-- name: ListPosts :many
SELECT p.id,
       p.title,
       p.content,
       COALESCE(p.author_id, 0) AS author_id,
       COALESCE(u.name, '') AS author_name,
       p.published,
       p.created_at,
       p.updated_at
FROM posts AS p
LEFT JOIN users AS u ON u.id = p.author_id
WHERE sqlc.arg(include_unpublished)::boolean OR p.published = true
ORDER BY p.created_at DESC;

-- name: CreatePost :exec
INSERT INTO posts (title, content, author_id, published, updated_at)
VALUES (sqlc.arg(title), sqlc.arg(content), sqlc.arg(author_id), false, CURRENT_TIMESTAMP);

-- name: UpdatePost :execrows
UPDATE posts
SET title = sqlc.arg(title), content = sqlc.arg(content), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: DeletePost :execrows
DELETE FROM posts WHERE id = sqlc.arg(id);

-- name: PublishPost :execrows
UPDATE posts
SET published = sqlc.arg(published), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);
