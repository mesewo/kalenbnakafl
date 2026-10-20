# AUDIT.md — Kalenbnakafl codebase audit

**Audited:** 2026-10-10 · **Scope:** `server/` (~600 lines Go), `front-end/` (~1,800 lines TS/TSX), `docker-compose.yaml`, `init.sql`, repo hygiene
**Method:** full read of every source file. **Not verified:** nothing was compiled or run (the Go 1.25.4 toolchain and the npm registry were unreachable from the audit sandbox). Items marked *(verify)* are strong inferences that need one command to confirm.

> Historical snapshot: findings below describe the 2026-10-10 audit state. See the 2026-10-20 status section for code checks against the current workspace.

## Verdict

A real, working skeleton with the right stack for a senior full-stack story (Next.js + Go + Postgres + Docker). Today it is **not safe to deploy and not yet impressive to a recruiter**: secrets are hardcoded, the API has no update/delete, several UI buttons do nothing, there are zero tests, no CI, a one-line README, and the Docker setup only works by accident on a laptop. All of that is fixable, and none of it requires a rewrite.

## What is already good (keep it)

- Every SQL statement is parameterized (`$1, $2…`) — no SQL injection.
- `Register` forces `role = "user"` server-side; a client cannot self-promote (the UI's `role` field is ignored).
- bcrypt for passwords; generic "Invalid email or password" on login (no user enumeration).
- Role middleware is applied at the route-group level, so authorization lives on the server, not just in the UI.
- Clean folder layout (`cmd / handlers / middleware / models / routes / utils / database`), multi-stage Dockerfiles, Compose with a persistent volume.
- Contact endpoint validates with `binding:"required,email"`.

## Findings

Severity: **C** = fix before anything is public · **H** = fix before showing recruiters · **M** = polish that separates "student project" from "senior work".

### Security

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| S1 | C | JWT secret `"super-secret-key"` is hardcoded, **duplicated** in two files. Anyone who reads the repo can mint an admin token. | `server/utils/jwt.go:9`, `server/middleware/auth.go:11` | Read `JWT_SECRET` from env (min 32 bytes, fail on startup if missing), one shared config. Rotate. |
| S2 | C | DB credentials and host hardcoded (`postgres:postgres@db:5432`); Postgres port 5432 published to the host. | `server/database/db.go:13`, `docker-compose.yaml` | `DATABASE_URL` from env; `.env.example`; don't publish 5432 outside dev. |
| S3 | C | Four seed accounts (incl. **admin**) share one bcrypt hash committed in the repo. `update_passwords.sql` also ends with `SELECT email, password FROM users` (hash dump). | `init.sql`, `update_passwords.sql` | Delete seed admin and the script. Bootstrap the first admin from env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) on first start. Dev-only seed lives in a separate `seed.dev.sql`. |
| S4 | C | CORS: `Allow-Origin: *` together with `Allow-Credentials: true` (invalid combo, and wildcard is too open). | `server/cmd/main.go` | Allowlist from `CORS_ORIGINS`; echo the matching origin; use `gin-contrib/cors`. |
| S5 | H | Token stored in `localStorage` (readable by any XSS), 24 h, no refresh, no logout/revocation. Role is baked into the JWT and never re-checked against the DB, so a demoted admin keeps access up to 24 h. | `AuthContext.tsx`, `utils/jwt.go` | httpOnly+Secure+SameSite cookie; short access token + refresh; re-read role from DB (or short TTL). Pin `jwt.WithValidMethods([]string{"HS256"})`. |
| S6 | H | No rate limiting on `/login`, `/register`, `/contact` (brute force, spam rows). No request body size limit. | `routes.go` | Per-IP limiter middleware; `http.MaxBytesReader`; optional honeypot/captcha on contact. |
| S7 | H | `AuthMiddleware` type-asserts claims (`claims["user_id"].(float64)`) — a malformed-but-signed token panics instead of 401. | `middleware/auth.go:44-45` | Use typed claims struct + checked assertions. |
| S8 | M | No security headers (CSP, HSTS, X-Content-Type-Options); gin trusts all proxies (default). | `main.go`, `next.config.ts` | Add headers in Next config + Go middleware; `SetTrustedProxies`. |
| S9 | M | `User` model serializes a `password` field (`json:"password"`) and is returned by `GetUsers` (empty today, but one scan change from leaking hashes). | `models/users.go` | Separate DTOs; never put the hash on a JSON-tagged struct. |

### Backend correctness

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| B1 | H | Public `GET /api/posts` returns **all** posts including drafts: query has no `WHERE published`, and `CreatePost` never sets `published`. The flag is dead. | `handlers/posts.go` | Public list filters `published = true`; staff list sees all; create/update accept `published`. |
| B2 | H | **No update or delete** for posts, events, media, users. Media has no upload at all — the table is read-only. | `routes.go`, `handlers/*` | Full CRUD + file upload (see ROADMAP Phase 2). |
| B3 | H | Real bug: media JSON field is `file_url` (`models/media.go`) but the dashboard reads `item.file_path`, so "View File" links are `undefined`. | `models/media.go`, `dashboard/media/page.tsx` | Pick one name, generate shared types from OpenAPI. |
| B4 | H | No validation on posts/events (no `binding` tags): empty titles and garbage dates reach Postgres; `event_date` is a free `string`. Register has no email-format or password-length rule; **any** insert error is reported as "Email already exists". | `handlers/posts.go`, `events.go`, `auth.go` | Validate with tags/validator; use `time.Time`; map `pq` error code `23505` to 409, everything else 500 + log. |
| B5 | H | Errors are swallowed: scan errors `continue` silently; nothing is logged; no request IDs. | all handlers | `slog` structured logging, return/log every error, request-ID middleware. |
| B6 | M | List endpoints are unbounded (no pagination, no ordering, no `created_at` in the response). | `handlers/*` | `?page&limit`, `ORDER BY created_at DESC`, return metadata. |
| B7 | M | Duplicate route trees: `/admin/*` and `/editor/*` are copy-pasted, and `admin` cannot use `/editor/*`. Leftover stubs (`/content`, `/admin/dashboard`). | `routes.go` | One `/api/staff` (or `/api/admin`) group with `RequireRole("admin","editor")`; admin-only subgroup for users. Delete stubs. |
| B8 | M | Two password hashers: `utils.HashPassword` (cost 14, **unused**) and inline `bcrypt.DefaultCost` in `Register`. | `utils/password.go`, `auth.go` | Use one helper, cost 12 via config. |
| B9 | M | `main.go`: `gin.Default()` in debug mode, hardcoded `:8080`, no timeouts, no graceful shutdown, no `/healthz`. `database.Connect()` does a single ping then `log.Fatal` (works only because Compose `restart: always` crash-loops until Postgres is ready). | `main.go`, `db.go` | Config struct, `http.Server` with timeouts, signal-driven shutdown, retry/backoff connect, `/healthz` + `/readyz`, `GIN_MODE=release`. |
| B10 | M | `lib/pq` is in maintenance mode; `pgx/v5` is the recommended driver (pooling, better types). Connection pool is unconfigured. | `db.go` | Optional: move to `pgxpool`; at minimum set `SetMaxOpenConns/IdleConns/ConnMaxLifetime`. |

### Database

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| D1 | H | Schema lives only in `init.sql`, which Postgres runs **only on an empty volume**. Any schema change requires wiping data. No migration tool. | `golang-migrate` (or goose), versioned `migrations/`, run on startup or as a Compose job. |
| D2 | M | `INCOMPLETE_FEATURES.md` claims "proper constraints", but `role` is free `VARCHAR(50)` with no `CHECK`; timestamps are `TIMESTAMP` (no time zone); no indexes besides PKs and `users.email`. | `CHECK (role IN (...))`, `TIMESTAMPTZ`, indexes on `posts(published, created_at)`, `events(event_date)`. |
| D3 | M | Missing domain tables for the stated scope: volunteers, memberships, contact-message status, media metadata (mime/size), post slug/cover/category, event location. | Design in ARCHITECTURE.md → Phase 2. |
| D4 | M | Name inconsistency across layers (historical spellings differed between repository, Go module, database, seed email, and UI). This already caused a module-name compile error per your ChatGPT summary. | Pick one canonical name in Phase 0 and rename everywhere. |

### Frontend

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| F1 | H | *(verify)* **Tailwind v4 is installed but configured v3-style.** `globals.css` uses v3 `@tailwind base/components/utilities`; `tailwind.config.ts` is not loaded by v4 without an `@config` directive, and its `content` globs point at a non-existent `./src/`. So `bg-primary`, `bg-primaryDark`, `text-primaryDark` likely generate **no CSS** (hero banners unstyled), and `bg-opacity-50` (modals) was removed in v4. | `globals.css`, `tailwind.config.ts` | Move tokens into `@theme { --color-primary: … }`, delete the config file and v3 directives, replace `bg-black bg-opacity-50` with `bg-black/50`. Confirm by running `npm run build` and looking at the page. |
| F2 | H | Every data page is a client component fetching in `useEffect` — public blog/events have no server rendering, so no SEO despite "SEO optimization" being in scope, plus loading flicker. No post detail page / slugs. | `blog/page.tsx`, `events/page.tsx` | Server components with `fetch(..., { next: { revalidate } })`, `generateMetadata`, `/blog/[slug]`. |
| F3 | H | Dead UI: "Add Media", "Add Volunteer", "Register as Volunteer" do nothing; Users page is read-only; Register form offers a "Volunteer" role the server silently ignores. | `dashboard/media`, `volunteers`, `volunteer/page.tsx`, `register/page.tsx` | Implement or remove. A recruiter clicking a dead button is the fastest credibility loss. |
| F4 | H | Dockerized frontend is wrong: `NEXT_PUBLIC_*` is inlined at **build** time, but Compose sets it at **runtime** to `http://api:8080/api` — a hostname the *browser* can't resolve. It only works today because there is no `.dockerignore`, so your `.env.local` (`localhost:8080`) gets copied into the image and gets baked in. | `front-end/Dockerfile`, `docker-compose.yaml` | Build-arg for the public URL, `output: "standalone"`, `.dockerignore`, and a same-origin `/api` reverse proxy so the URL isn't environment-specific. |
| F5 | M | `apiFetch` calls `res.json()` on errors (crashes on non-JSON 502/HTML), has no timeout, and no 401 handling — an expired token leaves the UI "logged in" until a request fails. | `lib/api.ts` | Typed client, centralized 401 → logout, JSON-safe error parsing. |
| F6 | M | `any` everywhere, no shared types. | all pages | Types from OpenAPI (`openapi-typescript`) or zod schemas. |
| F7 | M | `app/layout.tsx` and `app/page.tsx` still contain ~50–70 lines each of commented-out create-next-app boilerplate. `public/*.svg` boilerplate and `kalenbnakafl-logo.jpg` is never referenced. | `layout.tsx`, `page.tsx`, `public/` | Delete; use the logo in the Navbar via `next/image`. Recruiters open `layout.tsx` first. |
| F8 | M | Claimed "mobile-first" but Navbar is one non-collapsing flex row with 8+ items (overflows on phones). Modals lack focus trap / `aria-*`; inputs lack `<label>`s; no skeleton/empty/error states beyond text. | `Navbar.tsx`, `*Modal.tsx` | Responsive nav, accessible dialog (`<dialog>` or Radix), labels, Lighthouse a11y ≥ 95. |
| F9 | M | Scope says multi-language; there is no i18n at all (`<html lang="en">` hardcoded). | `layout.tsx` | `next-intl`, `/[locale]` routing, message catalogs. |
| F10 | M | No `sitemap.xml`, `robots.txt`, Open Graph/Twitter metadata, favicon/brand, or `not-found`/`error` pages. Title is generic. | `app/` | Add via Next metadata API. |
| F11 | M | Dashboard route protection is client-side only (flash + redirect). The API enforces roles, so this isn't a hole, but it's the wrong layer for UX. | `dashboard/layout.tsx` | Next `middleware.ts`/proxy that checks the session cookie. |

### Docker / DevOps / repo hygiene

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| O1 | H | Two ~30 MB **Windows executables** (`server/app`, `server/cmd.exe`) are in the tree; `.gitignore` doesn't exclude them (and `.dockerignore` doesn't exist, so they're also sent to Docker as build context). If they're committed, repo history is bloated forever unless purged. | Delete; ignore `*.exe`, `server/app`; check `git ls-files`; purge with `git filter-repo` if committed. |
| O2 | H | No `.dockerignore` in either service (`node_modules`, `.next`, `.env.local`, binaries all get copied). | Add both. |
| O3 | H | README is one line. `INCOMPLETE_FEATURES.md` is partly stale (says the contact backend and post/event modals are missing — they exist). No LICENSE, no screenshots, no architecture doc, no API docs. | See ROADMAP Phase 8. |
| O4 | M | Compose: no healthchecks, no `depends_on: condition: service_healthy`, secrets inline, no `env_file`, no network separation, no dev/prod split. | Healthchecks on all three, `.env`-driven, `compose.yaml` + `compose.prod.yaml`. |
| O5 | M | Images: Go runtime is `alpine:latest` running as root; Next image reinstalls deps in the runtime stage and runs as root; `npm ci --only=production && npm ci --only=dev` is redundant (and `--only` is deprecated). | Distroless/alpine pinned tag, non-root `USER`, Next `standalone` output, `CGO_ENABLED=0 -ldflags="-s -w"`. |
| O6 | H | **Zero tests** (Go and TS), no CI, no linter config for Go, ESLint not gated. | ROADMAP Phase 5. |
| O7 | M | `.env.local` is present in the zip although `.gitignore` lists it — check it was never committed (`git log --all -- .env.local`). Nothing secret is in it today (just the API URL). | Provide `.env.example`; keep real `.env` out of git. |

## Top 10 fixes by recruiter impact per hour

1. Delete binaries, boilerplate comments, dead scripts; add `.gitignore`/`.dockerignore`; one project name. *(1 h)*
2. Env-driven config: `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`; remove seed admin. *(1–2 h)*
3. Fix Tailwind v4 setup and confirm the site actually looks designed. *(1 h)*
4. Real CRUD (update/delete) + `published` filter + validation + pagination. *(1 session)*
5. Migrations + health checks + graceful shutdown. *(½ session)*
6. Tests + GitHub Actions (lint, test, build, docker build). *(1 session)*
7. Server-rendered public pages with SEO metadata; a post detail page. *(1 session)*
8. Cookie-based auth, rate limiting. *(1 session)*
9. Compose that works from a clean clone with one command; non-root images. *(½ session)*
10. README with screenshots, architecture diagram, live demo URL. *(½ session)*

## Status 2026-10-20

Checked by reading the current handlers, middleware, routes, compose and Docker files, frontend auth context/pages, sqlc query source/generated files, and migration files. This is a source inspection, not a successful build or runtime verification.

### Confirmed fixed in the current source

- **S1, S2 (configuration):** JWT secret validation and database connection string use `JWT_SECRET` and `DATABASE_URL`; Compose injects required values from `.env`. The secret must be at least 32 characters. Compose startup itself was not verified because required `.env` values were absent.
- **S4 (CORS):** `server/cmd/main.go` reflects only origins present in `CORS_ORIGINS`; wildcard origin is not configured.
- **B1 (published posts):** public `GET /api/posts` adds `WHERE p.published=true`; staff routes use the staff/admin handler path.
- **B2 (media subset):** upload and delete handlers and routes exist for media. This does not establish the rest of the audit's CRUD finding as fixed.
- **B2 (user subset):** admin routes and handlers exist for user create, update, and delete.
- **Profile update:** `PUT /api/profile` is authenticated and updates name/email, with optional password change.
- **B4 (validation subset):** shared helpers and handlers validate email, required text, lengths, event times, and several request payloads. This does not prove every endpoint is fully validated or error mapping is complete.
- **S5 (refresh):** login issues access and refresh cookies; refresh tokens are stored hashed, rotated transactionally, and logout revokes them. Frontend auth calls `/me`, `/refresh`, and `/logout` using the API client.
- **S5 (role re-check):** auth middleware reads the account's current role from the database on authenticated requests.
- **B9 (health endpoint):** `/healthz` is registered and checks database connectivity.

### Still open or not fully verified

- **O6:** no Go or frontend tests/CI were found during the source and repository-file inspection; baseline commands did not complete.
- **F2:** public blog and home pages are client-rendered and load content in `useEffect`.
- **S5 (storage audit):** the current `AuthContext` uses cookie-backed requests and contains no token state or `localStorage` calls. A repository-wide search excluding installed dependencies and generated/build output is still needed before closing the historical localStorage finding globally.
- **S6:** rate limiting is partial: login/register/refresh share a 10-per-minute IP limiter and contact uses 30-per-minute; the roadmap's per-email and contact thresholds are not implemented. No request-body limit was confirmed.
- **O5:** Go and Next runtime images run without a non-root `USER`; Go uses `alpine:latest`.
- **sqlc/bootstrap:** `server/db/query/users.sql` defines `CreateAdminIfMissing`, but generated `server/dbgen` does not expose it. `server/database/db.go` calls that missing method at line 71, so the expected Go compile failure remains.
- **Goose/migrations:** goose is invoked by the container entrypoint and migrations include Goose Up directives, but startup/migration behavior could not be verified because Compose did not start and Go compilation is blocked by the generated-query mismatch.
- **O1/history:** tracked-file and history checks could not run because this supplied workspace has no `.git` directory.
