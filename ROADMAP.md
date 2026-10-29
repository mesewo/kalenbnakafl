# ROADMAP.md — from working skeleton to portfolio-grade

### Current state / next step

- Admin-managed image uploads and bilingual site-content APIs now use migration 0008, protected usage tracking, localized public reads, and same-origin `/api/media/...` variant URLs; ADR-011 records the re-encoding policy.
- Post covers and safe `{{media:<id>}}` body tokens resolve through public media metadata; the dashboard surfaces usage and deletion conflicts, and all new routes are represented in OpenAPI/types and the role matrix.
- Backend build, vet, full unit suite, SQLC diff, Goose validation, and CGO-disabled image tests passed; frontend lint, TypeScript, i18n validation, and production build passed.
- Remaining verification: PostgreSQL-backed matrix/usage integration tests and Compose smoke could not run because `DATABASE_URL_TEST` is unset and Docker Engine is unavailable; repository-wide gofmt and Prettier checks also report pre-existing unrelated formatting issues.
- Next: run the database-backed tests and deployment smoke when PostgreSQL/Docker are available, and obtain native Amharic review for [docs/i18n-review.md](./docs/i18n-review.md).
**Goal:** a repo and a live demo that survive a 10-minute recruiter/hiring-manager review for a *senior full-stack* role: one-command startup, real security, real tests, CI, docs, and a polished, working UI.

**Rhythm:** each phase = 1–3 focused sessions (≈2–4 h each) with Gemini. Finish a phase's *Exit criteria* before starting the next. Total ≈ 3–4 weeks part-time.
**Minimum credible version** if time is short: Phases 0 → 1 → 2 (CRUD only) → 4 (public pages + fix styling) → 5 (CI + core tests) → 6 → 8. Phases 3 and 7 are what push it from "good" to "senior".

> Update checkboxes as you go. An item is done only when verified (see AGENTS.md → Definition of done).

## Decisions needed before Phase 0 ends

- [x] **Canonical name:** `kalenbnakafl`; display name `Kalen Benakafil`.
- [x] Organization description: community NGO.
- [ ] UI languages (English + Amharic? others?) and whether *content* (posts/events) must be translatable or only the UI.
- [ ] Deploy target and budget (VPS + Caddy, Fly.io, Render, Cloud Run + Cloud SQL).
- [ ] Real organization with real content, or a demo? (Affects privacy, what you may show publicly, and how you word the project note.)
- [ ] "Membership" meaning: just a status flag + directory, or dues/tiers later (payments are out of scope).

---

## Phase 0 — Repo hygiene & safety net (≈ ½ session)

- [ ] `git ls-files | grep -E '\.exe$|server/app$|\.env'` — find committed binaries/env. If any, **purge history** (`git filter-repo`) *before* making the repo public.
- [x] Confirm `server/app`, `server/cmd.exe`, and `update_passwords.sql` are absent from the working tree; add `.gitignore` (Go + Node + env + IDE + binaries) and `.dockerignore` in both services
- [x] Rename to the canonical name everywhere (module path + imports, DB name, seed emails, UI strings, package name)
- [x] Remove commented boilerplate from `layout.tsx`/`page.tsx` and unused `public/*.svg`
- [x] Add `.env.example`, `LICENSE`, and the README stub (to be expanded in Phase 8)
- [ ] Add AGENTS.md / ARCHITECTURE.md / ROADMAP.md / AUDIT.md to repo root; archive `INCOMPLETE_FEATURES.md` into `docs/history/`
- [ ] **Rotate**: any secret that ever lived in git is burned (JWT secret, DB password)
- [ ] Record baseline: does `docker compose up --build` work on a clean clone? Do `go build`, `npm run build` pass? Write results in *Verified commands* below.

**Exit:** clean repo, one name, nothing secret or binary tracked, baseline known.

## Phase 1 — Backend foundation (≈ 2 sessions)

- [x] `internal/config`: typed env config, fail-fast validation (`JWT_SECRET` ≥ 32 bytes, `DATABASE_URL`)
- [x] DB: connect with retry/backoff, pool settings, and `Ping` with context.
- [ ] Optional pgx migration (ADR-003).
- [x] Migrations with Goose: embedded numbered migrations under `server/db/migrations/`, serialized by a Postgres session lock; run before serving when `MIGRATE_ON_START=true`
- [x] Bootstrap admin from env; dev-only `server/db/seed/dev.sql` behind the `seed` Compose profile
- [x] `http.Server` with timeouts, graceful shutdown, Gin release mode in production, `/healthz` + `/readyz`
- [x] Middleware: request ID, `slog` access log, panic recovery → 500 JSON, CORS allowlist, body size limit
- [x] JWT: single source, typed claims, pinned `HS256`, checked assertions (no panics)
- [ ] Unified error model and request validation are implemented; audit all handler-specific validation and `pq` constraint mappings before marking this broader checklist item complete.
- [x] Remove `/content`, `/admin/dashboard` stubs; collapse `/admin` + `/editor` into one staff group + admin-only subgroup

**Exit:** API refuses to start misconfigured, survives DB starting late, no secrets in code, health endpoints green, `go vet` + `golangci-lint` clean.

### Phase 1 migration/sqlc implementation status (2026-10-20)

- [x] Pin `sqlc` v1.29.0 and Goose v3.24.3 as Go tools; no global tool installation.
- [x] Move migrations into `server/db/migrations`, embed them, replace the three old migrations with a schema-only `0001_init.sql`, and move dev sample rows into the opt-in seed profile.
- [x] Configure sqlc named parameters, `GetUserByEmail(email)`, `UpdateUserPassword` as password-only `:exec`, and `media` → `Media`; regenerate and confirm `go tool sqlc diff` is clean.
- [x] Add Goose startup wiring behind `MIGRATE_ON_START`, Makefile workflows, API healthcheck, and backend CI workflow.
- [x] Verify migration up/down/up and admin-bootstrap idempotence against PostgreSQL (`DATABASE_URL_TEST`); tests skip locally when the variable is unset.
- [ ] Verify the Compose stack end-to-end and GitHub Actions on a runner.

## Phase 2 — Complete the domain API (≈ 2–3 sessions)

- [x] Posts: CRUD, slug, `published`/`published_at`, public list filtered to published, pagination + search
- [x] Events: CRUD, `event_date`/`ends_at`/`location`, `?upcoming=true`
- [x] Media: JPEG/PNG/WebP content-sniffed uploads, byte/pixel limits, EXIF orientation/metadata stripping, pure-Go responsive variants, API-proxied file serving, usage-aware 409 deletion; local/S3 `Storage` interface
- [x] Admin-managed site content: bilingual slides, branding settings, plain-text page blocks, and about images; public localized reads and admin-only writes
- [x] Post/event cover media and public inline post-image token resolution; references protect published pages from broken image URLs
- [ ] Users (admin): list, change role, delete, password reset trigger
- [ ] Profile: `GET/PATCH /me` (name, password change with current password)
- [ ] Contact: inbox for staff, status workflow, optional email notification
- [ ] Volunteers: application → pending/approved; event sign-ups
- [ ] Membership: status + admin management
- [x] OpenAPI spec `docs/openapi.yaml` kept in sync; static Redoc viewer at `docs/api.html`
- [ ] Bilingual content: translation tables, fallback metadata, translated search, localized messages, and staff translation management (verify against PostgreSQL before completion)

**Exit:** every UI button in the current dashboard has a real endpoint behind it; every endpoint documented in OpenAPI.

## Phase 3 — Auth hardening (≈ 1 session)

- [x] httpOnly/Secure/SameSite cookies; short access token + rotating refresh token (hashed in DB); logout revokes
- [x] Role re-validated from DB on each authenticated request
- [x] Rate limits on login/register/contact; lockout/backoff on repeated failures
- [ ] Password policy (min length, common-password check), constant-time compare paths
- [x] Origin check / CSRF defense for cookie-authenticated mutations
- [ ] Security headers (Go + Next); trusted proxies are explicitly configurable and covered by tests
- [x] Authorization tests: every registered API route × every role (matrix test)

**Exit:** no token in `localStorage`; role-matrix test passes; `gosec` and `govulncheck` clean.

## Phase 4 — Front-end rebuild (≈ 3 sessions)

- [ ] **Fix Tailwind v4 setup** (`@theme` tokens, remove v3 directives and `tailwind.config.ts`, `bg-black/50`), confirm visually
- [ ] Design system: tokens (yellow brand + neutral scale), `ui/` primitives (Button, Input, Dialog, Card, Badge, Table, Toast), light/dark
- [x] Typography: DM Sans and Fraunces use `next/font` in `front-end/app/layout.tsx` (verified by production build).
- [ ] Layout: responsive Navbar (mobile drawer), Footer with real content, logo via `next/image`
- [ ] Public pages as Server Components + ISR: Home (hero, upcoming events, latest news), Blog list + `/blog/[slug]`, Events, Media library (video/audio/docs), About, Volunteer (working form), Contact
- [ ] SEO: `generateMetadata`, Open Graph images, `sitemap.ts`, `robots.ts`, JSON-LD (`Organization`, `Event`, `Article`), `not-found`/`error` pages
- [ ] i18n with `next-intl` (`/[locale]`), language switcher, `lang`/`hreflang`
- [ ] Auth UI on cookie session: `/auth/me`, route protection in `middleware`/proxy, 401 handling
- [ ] Dashboard: TanStack Query + react-hook-form + zod; full CRUD tables for posts/events/media/users/volunteers/messages with optimistic updates, confirm dialogs, toasts, empty/loading/error states
- [x] Generated API types from OpenAPI; zero `any`
- [ ] Accessibility pass: labels, focus management, keyboard, contrast; Lighthouse ≥ 95 (a11y, SEO, best practices), ≥ 90 performance on mobile

**Exit:** a stranger can use every visible control; Lighthouse targets met; no dead buttons.

## Phase 5 — Testing & CI (≈ 2 sessions)

- [ ] Go: unit tests (services, validators), HTTP tests with `httptest`, repository tests against real Postgres (Compose service in CI or `testcontainers-go`); race detector on
- [ ] Front end: Vitest + React Testing Library for key components/forms; MSW for API mocks
- [ ] E2E: Playwright — register → login → (admin) create post with image → appears on public page; contact form; role-guarded route redirect
- [ ] GitHub Actions: `lint` · `test-go` · `test-web` · `e2e` · `docker-build` · `trivy` image scan · `govulncheck` · `npm audit --omit=dev`; cache modules; required status on `main`
- [ ] Coverage report + badges in README (be honest: show the real number)
- [ ] Dependabot/Renovate config; pre-commit hooks (gofmt, eslint, gitleaks)

**Exit:** green CI on every PR; role matrix + core flows covered; badges live.

## Phase 6 — Docker & production readiness (≈ 1–2 sessions)

- [ ] Go image: multi-stage, `-trimpath -ldflags="-s -w"`, pinned base, **non-root**, `HEALTHCHECK`
- [ ] Next image: `output: "standalone"`, deps installed once, non-root, healthcheck
- [ ] `compose.yaml` (dev: hot reload, ports open) + `compose.prod.yaml` (no published DB port, secrets from env/Docker secrets, restart policies, resource limits, healthchecks with `depends_on: service_healthy`)
- [ ] Caddy reverse proxy: automatic TLS, `/` → web, `/api` → api, gzip/zstd, security headers
- [ ] Backups: `pg_dump` cron container + restore doc; named volumes for DB and media
- [ ] `make` targets (`make up`, `make test`, `make lint`, `make migrate`, `make seed`)
- [ ] **Clean-clone test:** fresh clone → `cp .env.example .env` → `make up` → site works. Time it; goal < 3 minutes.

**Exit:** one-command start documented and verified; images small, non-root, scanned clean.

## Phase 7 — Observability & deployment (≈ 1–2 sessions)

- [ ] Structured JSON logs with request IDs end-to-end; `/metrics` (Prometheus) bound to internal network
- [ ] Optional: Sentry (front + back), uptime check
- [ ] Deploy to the chosen target with CI-driven release (tag → build → push → deploy); HTTPS on a real domain/subdomain
- [ ] Public demo accounts with *read-only/demo* roles and a nightly data reset (never real credentials in the README)
- [ ] Runbook `docs/RUNBOOK.md`: deploy, rollback, restore, rotate secrets

**Exit:** live URL, HTTPS, tagged release, rollback documented.

## Phase 8 — Portfolio packaging (≈ 1 session)

- [ ] README: pitch, live demo link, screenshots/GIF (login → create post → public page), feature list, architecture diagram (from ARCHITECTURE.md), quick start, test/CI badges, tech-decision highlights, roadmap/known limitations
- [ ] `docs/adr/` with the ADRs from ARCHITECTURE.md (short, honest trade-offs)
- [ ] `docs/openapi.yaml` + link to hosted Swagger/Redoc
- [ ] Finalize `PROJECT_NOTE.md` with *real* numbers (coverage, Lighthouse, image sizes, endpoints, test counts)
- [ ] 2–3 min screen recording / Loom of the walkthrough
- [ ] Add the case-study card to the portfolio site (https://portfolio-green-pi-91.vercel.app) linking repo + live demo + project note
- [ ] Repo polish: topics, description, pinned on GitHub profile, issue/PR templates, `CONTRIBUTING.md`, `SECURITY.md`, tagged `v1.0.0`

**Exit:** a recruiter can understand the project in 60 seconds from the README and verify it in 5 minutes from the demo.

---

## Verified commands (fill in as confirmed)

| Command | Result | Date |
|---------|--------|------|
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test -count=1 ./... && go tool sqlc diff -f ../sqlc.yaml && go tool goose -dir db/migrations validate && CGO_ENABLED=0 go test ./internal/mediaimage` (admin-managed images/site content) | Build, vet, tests, SQLC diff, migration validation, and CGO-disabled image tests passed. `gofmt -l .` lists existing unrelated files; touched Go files are formatted. PostgreSQL integration tests were skipped because `DATABASE_URL_TEST` is unset. | 2026-10-29 |
| `cd front-end && npm run gen:api && npm run check:i18n && npm run test:unit && npm run lint && npx tsc --noEmit && npm run build` (admin-managed images/site content) | Passed; API types generated, 424 bilingual messages validated, all 6 unit tests passed, lint/TypeScript/build passed. Build logged expected API connection-refused warnings during static generation because no API was running. Touched files pass Prettier; repository-wide `format:check` reports 66 pre-existing style issues. | 2026-10-29 |
| `docker compose up --build -d --wait` (admin-managed images/site content smoke) | Not run: Docker Engine named pipe is unavailable; Compose and database-backed smoke tests could not run. | 2026-10-29 |
| `cd front-end && npm run gen:api && git diff --exit-code -- types/api.d.ts && npm run check:i18n && npm run test:unit && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (frontend CI follow-up) | Passed; API types were unchanged, 412 bilingual messages and all 6 unit tests passed, lint had no warnings, TypeScript and formatting passed, and production build completed. Build logged expected API connection-refused messages during prerender because no API was running. | 2026-10-28 |
| `cd front-end && npx playwright test e2e/frontend-hardening.spec.ts` (frontend CI follow-up) | Passed: security headers/CSP and slow-503 retry tests (2/2). | 2026-10-28 |
| `cd front-end && npx playwright test --list` (frontend CI follow-up) | Passed; discovered all 9 E2E tests. Full database-backed suite not run because no Compose services were active. | 2026-10-28 |
| `cd front-end && npm audit --omit=dev --audit-level=high` (frontend CI follow-up) | Passed; 0 production dependency vulnerabilities. | 2026-10-28 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (free-tier deployment) | Passed; formatting/build/vet/tests/sqlc diff clean. PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-26 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (free-tier deployment) | Passed; lint reported five existing hook-dependency warnings and no errors; TypeScript, formatting, and production build passed. | 2026-10-26 |
| `docker compose --env-file .env.example config --quiet` (free-tier deployment) | Passed; Compose config validated. | 2026-10-26 |
| `docker compose up --build` (free-tier deployment) | Not completed: API image dependency download failed because Docker could not resolve `proxy.golang.org`; services were not started. | 2026-10-26 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (pluggable S3 media storage) | Passed; formatting, build, vet, tests, and sqlc diff clean. PostgreSQL integration tests were skipped because `DATABASE_URL_TEST` was unset. | 2026-10-26 |
| `cd server && go test ./internal/storage -run '^TestS3StorageContract$' -count=1` (pinned MinIO binary) | Passed against local MinIO; exercised bucket readiness/creation, upload, metadata, range seek/read, delete, and size/empty checks. | 2026-10-26 |
| `docker compose --env-file .env.example -p kalenbnakafl-s3-check --profile s3 config --quiet` | Passed; Compose profile and environment interpolation validated. | 2026-10-26 |
| `docker compose --env-file .env.example -p kalenbnakafl-s3-check --profile s3 build minio` | Not completed; canceled after an extended source-dependency download. The S3 contract passed against the pinned MinIO binary; CI uses the Go module cache rather than rebuilding the MinIO image. | 2026-10-26 |
| `cd server && gofmt -l . && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (bilingual front-end part 2a) | Passed; gofmt listed no files, vet/tests passed all packages, and sqlc diff was clean. | 2026-10-25 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run check:i18n && npm run build` (bilingual front-end part 2a) | Passed; lint had 5 existing hook warnings and 0 errors; TypeScript, formatting, 247-message bilingual check, and production build passed. Next reported stale Baseline data. | 2026-10-25 |
| `cd front-end && npm run test:e2e` (bilingual front-end part 2a) | Not run: Docker Engine pipe access was denied, so the Compose app/API test environment was unavailable. | 2026-10-25 |
| `cd server && go build ./... && gofmt -l . && go vet ./... && go test -count=1 ./... && go tool sqlc diff -f ../sqlc.yaml` (single-review volunteer workflow) | Passed; `gofmt -l .` listed no files and sqlc diff was clean. PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-25 |
| `cd front-end && npm run gen:api && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (single-review volunteer workflow) | Passed; lint reported 7 pre-existing warnings and 0 errors; TypeScript, format check, and build passed. Next.js reported stale Baseline browser data. | 2026-10-25 |
| `docker compose up --build -d` (single-review volunteer workflow smoke) | Not run: Docker Engine named pipe was unavailable; Compose could not connect to the daemon. | 2026-10-25 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (backend security hardening) | Passed; gofmt listed no files, build/vet/tests passed, and sqlc diff was clean. PostgreSQL integration cases skipped because `DATABASE_URL_TEST` was unset. | 2026-10-26 |
| `cd front-end && npm run gen:api && npm run check:i18n && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (backend security hardening) | Passed; generation and 411-message catalog validation passed; lint had 5 existing hook warnings and 0 errors; TypeScript, formatting, and production build passed. Build required elevated permissions for the native SWC binding. | 2026-10-26 |
| `docker compose up --build` / disposable PostgreSQL integration tests (backend security hardening) | Not run: Docker Engine named pipe access was denied. | 2026-10-26 |
| `docker compose up --build` (clean clone) | Failed before start: required `.env` values missing; Docker config access denied. | 2026-10-20 |
| `cd server && gofmt -l . && go vet ./... && go test ./...` (exhaustive registered-route matrix) | Passed; PostgreSQL integration tests ran against the configured test database, including every registered API route × guest/user/volunteer/editor/admin and removed route checks. `gofmt -l .` listed no files. | 2026-10-24 |
| `golangci-lint run` (Prompt V, exhaustive route matrix) | Not run: `golangci-lint` is not installed in the local environment. | 2026-10-24 |
| `cd server && go build ./... && go vet ./... && go test ./...` | Phase 0 baseline: sqlc compile failure at `database/db.go:71:20`. Phase 1: build and vet passed; tests passed with PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-20 |
| `cd front-end && npm ci && npm run lint && npm run build` | `npm ci` stalled; Prompt V lint then failed: `'eslint' is not recognized`; tsc and build did not run. | 2026-10-20 |
| `cd server && go tool sqlc generate -f ../sqlc.yaml` | Passed; generated code updated in the workspace. | 2026-10-20 |
| `cd server && go tool sqlc diff -f ../sqlc.yaml` | Passed with no diff. | 2026-10-20 |
| `cd server && go tool sqlc diff -f ../sqlc.yaml` (B2) | Passed with no diff after adding post/event queries. | 2026-10-21 |
| `cd server && go build ./... && go vet ./... && go test ./...` (B2) | Passed; Postgres integration tests skipped locally because `DATABASE_URL_TEST` was unset. | 2026-10-21 |
| `cd server && go tool sqlc diff -f ../sqlc.yaml` (B3) | Passed with no diff after adding media, contact, and volunteer queries. | 2026-10-21 |
| `cd server && go build ./... && go vet ./... && go test ./...` (B3) | Passed; PostgreSQL integration tests skipped locally because `DATABASE_URL_TEST` was unset. | 2026-10-21 |
| `cd server && go build ./... && go vet ./... && go test ./...` (typed config/lifecycle) | Passed; config and health tests passed; PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-22 |
| `cd server && gofmt -l .` | Passed; no files listed. | 2026-10-22 |
| `git grep -n "os\\.Getenv" -- server` | Passed; matches only `server/internal/config/config.go`. | 2026-10-22 |
| `cd server && go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run` | Passed: 0 issues. | 2026-10-22 |
| `docker compose down && docker compose up --build -d`; `curl http://localhost:8080/readyz` | API and DB healthy; `/readyz` returned `{"status":"ok"}`. Frontend returned HTTP 200 but its existing Docker health probe timed out and marked it unhealthy. | 2026-10-22 |
| `cd server && go build ./... && go vet ./... && go test ./...` (logging/errors/JWT) | Passed; PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-22 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run build` | Lint passed with 5 existing hook-dependency warnings; TypeScript and production build passed. Next.js warned Baseline browser data is stale. | 2026-10-22 |
| `docker compose down && docker compose up --build -d`; `curl http://localhost:8080/readyz` | Build and startup passed; API and DB healthy; `/readyz` returned `{"status":"ok"}`. Frontend returned HTTP 200 but its existing healthcheck timed out after 3 seconds (container unhealthy). | 2026-10-22 |
| `cd server && go tool goose -dir db/migrations validate` | Passed after moving the embed source outside the migration directory. | 2026-10-20 |
| `docker compose --env-file .env.example config --quiet` | Passed; Docker emitted warnings that its user config file was inaccessible. | 2026-10-20 |
| Prompt V Compose `down` / `up --build -d` / `/healthz` | `down` could not connect to the Docker Engine named pipe (daemon unavailable); `up` and health curl were not run. No volumes were removed. | 2026-10-20 |

| `cd server && go build ./... && go vet ./... && go test ./...` (posts/events Phase 2) | Passed; ran the full integration suite against disposable PostgreSQL 15, including existing-row migration 0002, slug generation/collision/fallback/custom edit, first-publish timestamp, published-only detail, paging, English and Amharic FTS, upcoming/detail/end-time validation, and role matrix. | 2026-10-22 |
| `cd server && go tool sqlc diff -f ../sqlc.yaml` (posts/events Phase 2) | Passed with no generated-code diff. | 2026-10-22 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run build` (posts/events Phase 2) | Lint passed with 5 existing dashboard hook warnings; TypeScript and production build passed. Next warned that Baseline browser data is over two months old. | 2026-10-22 |
| `docker compose down && docker compose up --build -d` (posts/events Phase 2) | Passed without removing volumes; API, DB, and frontend became healthy. `/readyz` and `/healthz` returned `{"status":"ok"}`; `/api/posts?page=1&limit=2` and `/api/events?upcoming=true&page=1&limit=2` returned HTTP 200 pagination envelopes; Goose reports versions 0, 1, and 2 applied. | 2026-10-22 |

| `cd server && go tool sqlc diff -f ../sqlc.yaml` (media hardening) | Passed with no generated-code diff. | 2026-10-23 |
| `cd server && go build ./... && go vet ./... && go test ./...` (media hardening) | Passed; full suite also passed against Compose PostgreSQL 15, including migration 0003 backfill and media upload validation, path safety, kind listing, delete, and file-serving tests. | 2026-10-23 |
| `cd server && go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run --path-mode=abs` | Passed: 0 issues. | 2026-10-23 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run build` (media hardening) | Lint passed with 7 warnings and 0 errors; TypeScript and production build passed. Next.js warned that Baseline browser data is stale. | 2026-10-23 |
| `docker compose up --build -d` (media hardening) | Passed; API, DB, and frontend became healthy. Admin uploaded a PNG, opened the stored URL, verified nosniff/CSP/cache headers, byte-range response and no directory listing; smoke rows deleted. | 2026-10-23 |
| `docker compose down && docker compose up --build -d`; `curl.exe http://127.0.0.1:8080/healthz`; `curl.exe http://127.0.0.1:8080/readyz` (Prompt V, media hardening) | Passed without removing volumes; API, DB, and frontend healthy; both health endpoints returned `{"status":"ok"}`. | 2026-10-23 |

| `cd server && go tool sqlc diff -f ../sqlc.yaml` (Phase 3 auth/rate limits) | Passed with no diff. | 2026-10-24 |
| `cd server && go build ./... && go vet ./...` (Phase 3 auth/rate limits) | Passed. | 2026-10-24 |
| `cd server && go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 run --path-mode=abs` (Phase 3 auth/rate limits) | Passed: 0 issues. | 2026-10-24 |
| `cd server && gofmt -l . && go vet ./... && go test ./...` (Prompt V, Phase 3) | Passed; PostgreSQL-backed run passed all packages using Compose PostgreSQL, including middleware origin/proxy/rate-limit tests and auth cookie test. | 2026-10-24 |
| `docker compose down && docker compose up --build -d`; `/healthz`, `/readyz`; Next-proxy login and staff post create/delete | Passed; Compose required container/network recreation after subnet pinning; all services healthy, login 200, create 201, cleanup 200. | 2026-10-24 |
| `cd server && go build ./... && go vet ./... && go test ./...` (housekeeping) | Passed; PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-24 |
| `cd server && gofmt -l .` (Prompt V) | Passed; no files listed. `golangci-lint` was not installed. | 2026-10-24 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (housekeeping) | Passed; lint reported 7 existing warnings and 0 errors; TypeScript, format check, and build passed. Next.js warned that Baseline browser data is stale. | 2026-10-24 |

| `cd server && go tool sqlc generate -f ../sqlc.yaml` (contact inbox) | Passed; regenerated contact-message queries. | 2026-10-24 |
| `cd server && go tool sqlc diff -f ../sqlc.yaml` (contact inbox) | Passed with no generated-code diff. | 2026-10-24 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test ./...` (contact inbox) | Passed; no gofmt output. PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-24 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (contact inbox) | Passed; lint reported 7 warnings and 0 errors; TypeScript, format check, and build passed. Next.js reported stale Baseline browser data. | 2026-10-24 |
| `docker compose up --build -d` (contact inbox smoke) | Failed before startup: Docker Engine named pipe was unavailable. Contact submission/dashboard smoke was not run. | 2026-10-24 |

| `cd server && go tool sqlc diff -f ../sqlc.yaml && go tool goose -dir db/migrations validate && go build ./... && go vet ./... && go test ./...` (volunteer applications and event sign-ups) | Passed; PostgreSQL integration tests skipped because `DATABASE_URL_TEST` was unset. | 2026-10-24 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (volunteer applications and event sign-ups) | Passed; lint reported 7 warnings and 0 errors; TypeScript, format check, and build passed. Next.js warned that Baseline browser data is stale. | 2026-10-24 |
| `docker compose up --build -d` (volunteer applications and event sign-ups smoke) | Failed before startup: Docker Engine named pipe was unavailable. Register/apply/approve/sign-up smoke was not run. | 2026-10-24 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test -count=1 ./... && go tool sqlc diff -f ../sqlc.yaml && go tool goose -dir db/migrations validate` (bilingual content) | Passed with no gofmt output or sqlc diff; PostgreSQL-backed migration/content cases skipped because `DATABASE_URL_TEST` was unset. | 2026-10-25 |
| `cd front-end && npm run gen:api && npm run lint && npx tsc --noEmit && npm run format:check && npm run build` (bilingual content) | Passed; API generation was idempotent; lint reported 7 warnings and 0 errors; TypeScript, format check, and production build passed. Next warned Baseline browser data is stale. | 2026-10-25 |
| `docker compose up --build -d` (bilingual content smoke) | Failed before startup: Docker Engine named pipe was unavailable. | 2026-10-25 |
| `cd server && gofmt -l . && go build ./... && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (bilingual frontend) | Passed; gofmt listed no files and sqlc diff was clean. | 2026-10-25 |
| `cd front-end && npm run check:i18n && npm run lint && npx tsc --noEmit && npm run format:check && npm run build && npm run test:e2e -- --list` (bilingual frontend) | Passed; 202 catalog keys validated; lint had 5 existing dashboard warnings and no errors; TypeScript, formatting, production build, and Playwright test discovery passed. Build ran outside the sandbox to permit the SWC cache. | 2026-10-25 |
| `docker compose up --build -d` (bilingual frontend smoke) | Failed before startup: Docker Engine named pipe was unavailable; full Playwright flows were not run. | 2026-10-25 |
| `cd server && gofmt -l . && go vet ./... && go test ./... && go tool sqlc diff -f ../sqlc.yaml` (bilingual frontend part 2b) | Passed; gofmt listed no files, all packages passed (some cached), and sqlc diff was clean. | 2026-10-25 |
| `cd front-end && npm run check:i18n && npm run report:unused-messages && npm run lint && npx tsc --noEmit && npm run format:check && npm run build && npm run test:e2e -- --list` (bilingual frontend part 2b) | Passed; 411 bilingual messages validated, unused-key report ran, lint had 5 hook warnings and 0 errors, TypeScript/format/build passed, and 7 Playwright specs were discovered. Build required elevated permissions after the sandbox native-binding failure. | 2026-10-25 |
| `docker compose -f ../docker-compose.yaml up --build -d` (bilingual frontend part 2b) | Docker access succeeded with elevation, but the frontend image build stalled at `npm ci`; stopped before containers started, so Playwright browser flows were not executed. | 2026-10-25 |
| `cd front-end && npm run gen:api` (frontend CI fixes) | Passed; generated API types were unchanged on regeneration. | 2026-10-26 |
| `cd front-end && npm run lint && npx tsc --noEmit && npm run format:check && npm run check:i18n && npm run build` (frontend CI fixes) | Passed; lint had five pre-existing hook dependency warnings and no errors; TypeScript, format, 411-message catalog validation, and production build passed. | 2026-10-26 |
| `cd front-end && npm audit --audit-level=high && npm audit --omit=dev --audit-level=high` (frontend CI fixes) | Passed; both dependency trees reported zero vulnerabilities. | 2026-10-26 |
| `docker compose build` and isolated `docker compose -p kalenbnakafl-validation up -d --wait` | Passed; API, database, and frontend became healthy; isolated validation containers/network were removed after testing, volumes retained. | 2026-10-26 |
| `cd front-end && CI=true npm run test:e2e` (frontend CI fixes) | Passed; all 7 Playwright tests passed. | 2026-10-26 |
| `docker scout cves --only-severity critical,high` (API and frontend images) | Not run; Docker Scout requires Docker account sign-in. Trivy remains configured in CI; the prior local vulnerability-database download timed out. | 2026-10-26 |

### Phase 0 baseline run — 2026-10-20

| Command | Exact result |
|---------|--------------|
| `docker compose up --build` | **Failed before starting containers** during Compose interpolation: required `CORS_ORIGINS`, `POSTGRES_USER`, `JWT_SECRET`, `POSTGRES_DB`, and `POSTGRES_PASSWORD` are missing from `.env`. Docker also warned it could not read `C:\Users\User\.docker\config.json` (Access is denied). No containers started; nothing to stop. |
| `cd server && go build ./... && go vet ./...` | **Not completed.** Initial sandbox run could not write Go's build cache (Access is denied). Escalated retry began downloading dependencies but produced no further output; stopped after the downloads stalled. Compilation and vet did not run, so the expected `db.go:71` failure remains unconfirmed. |
| `cd front-end && npm ci && npm run lint && npm run build` | **Not completed.** Sandbox and escalated retries of `npm ci` stalled without output; stopped before install, lint, or build completed. |

## Parking lot (not in scope, don't let the agent wander here)

Payments/donations · live-streaming · push notifications · native mobile app · multi-tenant support · CMS rich-text editor beyond Markdown (revisit after Phase 4).
