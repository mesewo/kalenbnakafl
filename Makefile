.PHONY: sqlc sqlc-check migrate-up migrate-down migrate-status migrate-create test

sqlc:
	cd server && go tool sqlc generate -f ../sqlc.yaml

sqlc-check:
	cd server && go tool sqlc diff -f ../sqlc.yaml

migrate-up:
	cd server && go tool goose -dir db/migrations postgres "$${DATABASE_URL}" up

migrate-down:
	cd server && go tool goose -dir db/migrations postgres "$${DATABASE_URL}" down

migrate-status:
	cd server && go tool goose -dir db/migrations postgres "$${DATABASE_URL}" status

migrate-create:
	@test -n "$(NAME)" || (echo "usage: make migrate-create NAME=description" && exit 1)
	cd server && go tool goose -dir db/migrations create "$(NAME)" sql

test:
	cd server && go test ./...
