# ROADMAP.md — from working skeleton to portfolio-grade

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
- [ ] Delete `server/app`, `server/cmd.exe`, `update_passwords.sql`; add `.gitignore` (Go + Node + env + IDE + binaries) and `.dockerignore` in both services
- [ ] Rename to the canonical name everywhere (module path + all imports in one commit, DB name, seed emails, UI strings, package name)
- [ ] Remove commented boilerplate from `layout.tsx`/`page.tsx`, unused `public/*.svg`
- [ ] Add `.env.example`, `LICENSE`, stub README (replaced in Phase 8)
- [ ] Add AGENTS.md / ARCHITECTURE.md / ROADMAP.md / AUDIT.md to repo root; archive `INCOMPLETE_FEATURES.md` into `docs/history/`
- [ ] **Rotate**: any secret that ever lived in git is burned (JWT secret, DB password)
- [ ] Record baseline: does `docker compose up --build` work on a clean clone? Do `go build`, `npm run build` pass? Write results in *Verified commands* below.

**Exit:** clean repo, one name, nothing secret or binary tracked, baseline known.

## Phase 1 — Backend foundation (≈ 2 sessions)

- [x] `internal/config`: typed env config, fail-fast validation (`JWT_SECRET` ≥ 32 bytes, `DATABASE_URL`)
- [ ] DB: connect with retry/backoff, pool settings, `Ping` with context; optional pgx migration (ADR-003)
- [ ] Migrations with Goose: embedded `server/db/migrations/0001_init.sql` (current schema + `CHECK` on role, `TIMESTAMPTZ`, indexes), serialized by a Postgres session lock; run before serving when `MIGRATE_ON_START=true`
- [ ] Bootstrap admin from env; dev-only `server/db/seed/dev.sql` behind the `seed` Compose profile
- [x] `http.Server` with timeouts, graceful shutdown, Gin release mode in production, `/healthz` + `/readyz`
- [ ] Middleware: request ID, `slog` access log, panic recovery → 500 JSON, CORS allowlist, body size limit
- [ ] JWT: single source, typed claims, pinned `HS256`, checked assertions (no panics)
- [ ] Unified error model + validation (`binding` tags / validator) + `pq` unique-violation → 409
- [ ] Remove `/content`, `/admin/dashboard` stubs; collapse `/admin` + `/editor` into one staff group + admin-only subgroup

**Exit:** API refuses to start misconfigured, survives DB starting late, no secrets in code, health endpoints green, `go vet` + `golangci-lint` clean.

### Phase 1 migration/sqlc implementation status (2026-10-20)

- [x] Pin `sqlc` v1.29.0 and Goose v3.24.3 as Go tools; no global tool installation.
- [x] Move migrations into `server/db/migrations`, embed them, replace the three old migrations with a schema-only `0001_init.sql`, and move dev sample rows into the opt-in seed profile.
- [x] Configure sqlc named parameters, `GetUserByEmail(email)`, `UpdateUserPassword` as password-only `:exec`, and `media` → `Media`; regenerate and confirm `go tool sqlc diff` is clean.
- [x] Add Goose startup wiring behind `MIGRATE_ON_START`, Makefile workflows, API healthcheck, and backend CI workflow.
- [ ] Verify migration up/down/up and admin-bootstrap idempotence against PostgreSQL (`DATABASE_URL_TEST`); tests skip locally when the variable is unset.
- [ ] Verify the Compose stack end-to-end and GitHub Actions on a runner.

## Phase 2 — Complete the domain API (≈ 2–3 sessions)

- [ ] Posts: CRUD, slug, `published`/`published_at`, public list filtered to published, pagination + search
- [ ] Events: CRUD, `starts_at/ends_at/location`, `?upcoming=true`
- [ ] Media: multipart upload (size/type allowlist, content sniffing, random storage keys), list, delete; `Storage` interface (local volume now)
- [ ] Users (admin): list, change role, delete, password reset trigger
- [ ] Profile: `GET/PATCH /me` (name, password change with current password)
- [ ] Contact: inbox for staff, status workflow, optional email notification
- [ ] Volunteers: application → pending/approved; event sign-ups
- [ ] Membership: status + admin management
- [ ] OpenAPI spec `docs/openapi.yaml` kept in sync (Swagger UI at `/docs` in dev)

**Exit:** every UI button in the current dashboard has a real endpoint behind it; every endpoint documented in OpenAPI.

## Phase 3 — Auth hardening (≈ 1 session)

- [ ] httpOnly/Secure/SameSite cookies; short access token + rotating refresh token (hashed in DB); logout revokes
- [ ] Role re-validated from DB (short cache)
- [ ] Rate limits on login/register/contact; lockout/backoff on repeated failures
- [ ] Password policy (min length, common-password check), constant-time compare paths
- [ ] Origin check / CSRF defense for cookie-authenticated mutations
- [ ] Security headers (Go + Next), `SetTrustedProxies`
- [ ] Authorization tests: every protected route × every role (matrix test)

**Exit:** no token in `localStorage`; role-matrix test passes; `gosec` and `govulncheck` clean.

## Phase 4 — Front-end rebuild (≈ 3 sessions)

- [ ] **Fix Tailwind v4 setup** (`@theme` tokens, remove v3 directives and `tailwind.config.ts`, `bg-black/50`), confirm visually
- [ ] Design system: tokens (yellow brand + neutral scale), typography (self-hosted via `next/font`), `ui/` primitives (Button, Input, Dialog, Card, Badge, Table, Toast), light/dark
- [ ] Layout: responsive Navbar (mobile drawer), Footer with real content, logo via `next/image`
- [ ] Public pages as Server Components + ISR: Home (hero, upcoming events, latest news), Blog list + `/blog/[slug]`, Events, Media library (video/audio/docs), About, Volunteer (working form), Contact
- [ ] SEO: `generateMetadata`, Open Graph images, `sitemap.ts`, `robots.ts`, JSON-LD (`Organization`, `Event`, `Article`), `not-found`/`error` pages
- [ ] i18n with `next-intl` (`/[locale]`), language switcher, `lang`/`hreflang`
- [ ] Auth UI on cookie session: `/auth/me`, route protection in `middleware`/proxy, 401 handling
- [ ] Dashboard: TanStack Query + react-hook-form + zod; full CRUD tables for posts/events/media/users/volunteers/messages with optimistic updates, confirm dialogs, toasts, empty/loading/error states
- [ ] Generated API types from OpenAPI; zero `any`
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
| `docker compose up --build` (clean clone) | Failed before start: required `.env` values missing; Docker config access denied. | 2026-10-20 |
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
| `cd server && go tool goose -dir db/migrations validate` | Passed after moving the embed source outside the migration directory. | 2026-10-20 |
| `docker compose --env-file .env.example config --quiet` | Passed; Docker emitted warnings that its user config file was inaccessible. | 2026-10-20 |
| Prompt V Compose `down` / `up --build -d` / `/healthz` | `down` could not connect to the Docker Engine named pipe (daemon unavailable); `up` and health curl were not run. No volumes were removed. | 2026-10-20 |

### Phase 0 baseline run — 2026-10-20

| Command | Exact result |
|---------|--------------|
| `docker compose up --build` | **Failed before starting containers** during Compose interpolation: required `CORS_ORIGINS`, `POSTGRES_USER`, `JWT_SECRET`, `POSTGRES_DB`, and `POSTGRES_PASSWORD` are missing from `.env`. Docker also warned it could not read `C:\Users\User\.docker\config.json` (Access is denied). No containers started; nothing to stop. |
| `cd server && go build ./... && go vet ./...` | **Not completed.** Initial sandbox run could not write Go's build cache (Access is denied). Escalated retry began downloading dependencies but produced no further output; stopped after the downloads stalled. Compilation and vet did not run, so the expected `db.go:71` failure remains unconfirmed. |
| `cd front-end && npm ci && npm run lint && npm run build` | **Not completed.** Sandbox and escalated retries of `npm ci` stalled without output; stopped before install, lint, or build completed. |

## Parking lot (not in scope, don't let the agent wander here)

Payments/donations · live-streaming · push notifications · native mobile app · multi-tenant support · CMS rich-text editor beyond Markdown (revisit after Phase 4).
