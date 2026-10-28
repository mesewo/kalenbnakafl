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

-- name: CreateUser :exec
INSERT INTO users (name, email, password, role, updated_at)
VALUES (sqlc.arg(name), sqlc.arg(email), sqlc.arg(password), sqlc.arg(role), CURRENT_TIMESTAMP)
;

-- name: UpdateUser :one
UPDATE users
SET name = sqlc.arg(name), email = sqlc.arg(email), role = sqlc.arg(role), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING id, name, email, password, role, created_at, updated_at;

-- name: UpdateUserPassword :exec
UPDATE users
SET password = sqlc.arg(password), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: DeleteUser :execrows
DELETE FROM users WHERE id = sqlc.arg(id);

-- name: GetRoleByUserID :one
SELECT role FROM users WHERE id = sqlc.arg(id) LIMIT 1;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 'admin';

-- name: CreateAdminIfMissing :exec
INSERT INTO users (name, email, password, role, updated_at)
VALUES ('Administrator', sqlc.arg(email), sqlc.arg(password), 'admin', CURRENT_TIMESTAMP)
ON CONFLICT (lower(email)) DO NOTHING;

-- name: RegisterUser :exec
INSERT INTO users (name, email, password, role, updated_at)
VALUES (sqlc.arg(name), sqlc.arg(email), sqlc.arg(password), 'user', CURRENT_TIMESTAMP);

-- name: UpdateManagedUser :execrows
UPDATE users
SET name = sqlc.arg(name), email = sqlc.arg(email), role = sqlc.arg(role),
    password = COALESCE(sqlc.narg(password), password), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: UpdateProfile :execrows
UPDATE users
SET name = sqlc.arg(name), email = sqlc.arg(email),
    password = COALESCE(sqlc.narg(password), password), updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
VALUES (sqlc.arg(user_id), sqlc.arg(token_hash), sqlc.arg(expires_at));

-- name: LockActiveRefreshToken :one
SELECT user_id
FROM refresh_tokens
WHERE token_hash = sqlc.arg(token_hash)
  AND revoked_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
FOR UPDATE;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE token_hash = sqlc.arg(token_hash) AND revoked_at IS NULL;

-- name: RevokeRefreshTokenByHash :exec
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE token_hash = sqlc.arg(token_hash);

-- name: RevokeUserRefreshTokens :exec
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = sqlc.arg(user_id) AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :execrows
DELETE FROM refresh_tokens
WHERE expires_at <= CURRENT_TIMESTAMP;
