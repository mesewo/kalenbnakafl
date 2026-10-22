-- name: CreateContact :exec
INSERT INTO contacts (name, email, message)
VALUES (sqlc.arg(name), sqlc.arg(email), sqlc.arg(message));
