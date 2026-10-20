-- name: GetUserByEmail :one
SELECT id, name, email, password, role, created_at, updated_at
FROM users
WHERE lower(email) = lower(sqlc.arg(email))
LIMIT 1;

-- name: GetUserByID :one
SELECT id, name, email, password, role, created_at, updated_at
FROM users
WHERE id = sqlc.arg(id)
LIMIT 1;

-- name: ListUsers :many
SELECT id, name, email, role, created_at, updated_at
FROM users
ORDER BY created_at DESC;

-- name: CreateUser :one
INSERT INTO users (name, email, password, role, updated_at)
VALUES (sqlc.arg(name), sqlc.arg(email), sqlc.arg(password), sqlc.arg(role), CURRENT_TIMESTAMP)
RETURNING id, name, email, password, role, created_at, updated_at;

-- name: UpdateUser :one
UPDATE users
SET name = sqlc.arg(name), email = sqlc.arg(email), role = sqlc.arg(role), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING id, name, email, password, role, created_at, updated_at;

-- name: UpdateUserPassword :exec
UPDATE users
SET password = sqlc.arg(password), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: DeleteUser :exec
DELETE FROM users WHERE id = sqlc.arg(id);

-- name: GetRoleByUserID :one
SELECT role FROM users WHERE id = sqlc.arg(id) LIMIT 1;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin';

-- name: CreateAdminIfMissing :exec
INSERT INTO users (name, email, password, role, updated_at)
VALUES ('Administrator', sqlc.arg(email), sqlc.arg(password), 'admin', CURRENT_TIMESTAMP)
ON CONFLICT (lower(email)) DO NOTHING;
