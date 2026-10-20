# PROMPTS.md — prompts for Gemini (Cloud Shell Editor / Gemini CLI)

## How to use

1. Put these files in the repo root: `AGENTS.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `AUDIT.md`, `PROJECT_NOTE.md`, `GEMINI.md` (and keep `PROMPTS.md` there or in `docs/`).
2. **Start every new chat with Prompt 0.** Agents forget between sessions; the files don't.
3. Run **one prompt per chat**, in order. When Gemini says it's done, run the **Verify prompt (V)** in the same chat, then commit.
4. Never paste real secrets into a prompt. If Gemini asks for one, give it a placeholder and put the real value in `.env`.
5. If Gemini goes off-plan: *"Stop. Re-read AGENTS.md rules 1–3 and list what you changed that is outside this task. Revert those parts."*
6. After each phase, tick the boxes in `ROADMAP.md` and record verified commands.

Prompts assume the canonical name decision from ROADMAP Phase 0 — replace `⟨NAME⟩` with it.

---

## Prompt 0 — load context (start of every session)

```
Read AGENTS.md, ARCHITECTURE.md, ROADMAP.md and AUDIT.md in full before doing anything.
Then reply with: (1) the project in two sentences, (2) the current roadmap phase and the first unchecked item,
(3) the hard guardrails you will follow, (4) any contradiction you notice between these docs and the code.
Do not change any files yet.
```

## Prompt V — verify (end of every task)

```
Verify your work. Run, and show me the real output summary of:
- backend: cd server && gofmt -l . && go vet ./... && go test ./... (and golangci-lint run if installed)
- frontend: cd front-end && npm run lint && npx tsc --noEmit && npm run build   (whichever apply to what you changed)
- if infra changed: docker compose down && docker compose up --build -d, wait for healthy, then curl the health endpoint
Then list: files changed, anything you could not run and why, anything outside the task you noticed but did NOT change.
Tick the completed items in ROADMAP.md and add the commands you confirmed to "Verified commands". Do not claim anything is done that you did not run.
```

---

## Phase 0 — Repo hygiene

### P0.1 Baseline and cleanup

```
Task: ROADMAP Phase 0, first two bullets + cleanup.
1. Without changing code, run the baseline: `docker compose up --build` (then stop it), `cd server && go build ./...`, `cd front-end && npm ci && npm run build`. Record exact results in ROADMAP "Verified commands". If something fails, show the error and stop — don't fix yet.
2. Run `git ls-files | grep -E '\.exe$|server/app$|\.env'` and `git count-objects -vH` and tell me whether binaries or env files were ever committed (`git log --all --oneline -- server/app server/cmd.exe .env.local`). Do NOT rewrite history; just report and propose the exact `git filter-repo` commands.
3. Delete server/app, server/cmd.exe, update_passwords.sql. Create a proper root .gitignore (Go, Node/Next, .env*, !.env.example, IDE, OS, *.exe, build output) and a .dockerignore in server/ and front-end/.
4. Remove the commented-out create-next-app boilerplate from front-end/app/layout.tsx and page.tsx and the unused public/*.svg files.
Commit as separate Conventional Commits. Then run Prompt V.
```

### P0.2 Rename to the canonical name

```
Task: rename the project consistently to "⟨NAME⟩" (display name "⟨Display Name⟩").
Currently: repo kalenbnakafl, Go module kalenbenakafl-api, DB kalenbenakafil, seed emails @kalenbenakafil.org, UI "Kalen Benakafil".
Do it in ONE commit: go.mod module path + every import, docker-compose service/db names, init.sql, front-end package.json name, UI strings (Navbar, Footer, metadata, about page). Then `go build ./...` and `npm run build` must pass. Show me a grep proving no old spelling remains (excluding git history and AUDIT.md).
```

### P0.3 Env scaffolding

```
Create .env.example at repo root documenting every variable in ARCHITECTURE.md §3 with safe placeholder values and one-line comments. Change docker-compose.yaml to read from .env (env_file / ${VAR}) instead of inline credentials. Do not change Go code yet. Make sure .env is git-ignored. Add LICENSE (MIT, my name Befekadu Amdehaymanot) and a stub README with project name and "see ROADMAP.md".
```

---

## Phase 1 — Backend foundation

### P1.1 Config, DB connection, graceful server

```
Task: ROADMAP Phase 1 — config, DB, server lifecycle.
- Add server/internal/config: load typed Config from env (PORT, APP_ENV, DATABASE_URL, JWT_SECRET, CORS_ORIGINS, token TTLs). Fail fast with a clear error when JWT_SECRET is shorter than 32 bytes or DATABASE_URL is missing. No defaults for secrets.
- Replace database.Connect() with a function taking config: sql.Open, pool limits (MaxOpen 25, MaxIdle 5, ConnMaxLifetime 30m), and retry with exponential backoff (up to ~60s) using PingContext. Return errors instead of log.Fatal.
- main.go: build an http.Server with ReadHeaderTimeout/ReadTimeout/WriteTimeout/IdleTimeout, graceful shutdown on SIGINT/SIGTERM (context + Shutdown with 10s), gin release mode when APP_ENV=production, slog JSON logger.
- Add GET /healthz (always 200) and GET /readyz (200 only if DB ping succeeds).
- Remove the hardcoded connection string and the duplicated "super-secret-key" in utils/jwt.go and middleware/auth.go; both must use the one Config value.
Add table-driven tests for config validation. Update .env.example/ARCHITECTURE if anything differs. Then Prompt V.
```

### P1.2 Migrations and admin bootstrap

```
Task: ROADMAP Phase 1 — migrations.
- Add golang-migrate. Create migrations/0001_init.up.sql/.down.sql reproducing the current schema, improved: role CHECK (admin,editor,user,volunteer); TIMESTAMPTZ everywhere; indexes on posts(published, created_at DESC) and events(event_date); contacts renamed to contact_messages with a status column (new|read|replied).
- Run migrations on API startup when MIGRATE_ON_START=true (default true in dev compose). Remove the init.sql volume mount and delete init.sql.
- First-admin bootstrap: on startup, if no user with role admin exists and ADMIN_EMAIL + ADMIN_PASSWORD are set, create it (bcrypt). Never log the password.
- Provide seed.dev.sql with sample posts/events and non-admin demo users, loaded only by `docker compose --profile seed up` (document in README stub). Demo user passwords come from env, not literals in SQL (generate hashes in a small Go command: server/cmd/seed).
Prove it: `docker compose down -v && docker compose up --build`, then login as the bootstrap admin via curl. Then Prompt V.
```

### P1.3 Errors, validation, middleware, auth cleanup

```
Task: ROADMAP Phase 1 — errors, validation, middleware, JWT.
- Introduce a single error response shape {"error":{"code","message","details"}} and helpers; map pq unique-violation (23505) to 409, validation to 422, everything else to 500 with the real error logged via slog (never returned to the client).
- Add validation (binding tags/validator) for register (email format, password 12–72 chars, name 1–100), posts (title 1–200, content required), events (title, description, starts at is a real time).
- Middleware: request ID (header X-Request-ID), slog access log, panic recovery returning the JSON error, body-size limit 1 MB (larger for upload route later), CORS allowlist from CORS_ORIGINS (use gin-contrib/cors; no wildcard with credentials).
- JWT: typed claims struct, jwt.WithValidMethods(["HS256"]), checked type assertions so a bad token yields 401 not a panic. Use ONE bcrypt helper (cost 12 from config) in utils/password.go and remove the duplicate inline call.
- Routes: delete /content and /admin/dashboard stubs; replace /admin/* and /editor/* with /api/staff/* guarded by RequireRole("admin","editor") and /api/admin/users guarded by admin only. Keep the old paths working ONLY if the frontend still needs them — otherwise update the frontend calls in the same commit.
- Stop scanning errors being ignored in list handlers: log and return 500.
Write tests: validation cases, 409 on duplicate email, 401 on malformed/expired/wrong-alg token, 403 role checks. Then Prompt V.
```

---

## Phase 2 — Domain API

### P2.1 Posts and events: full CRUD

```
Task: ROADMAP Phase 2 — posts and events.
Implement per ARCHITECTURE.md (target API + data model). Add a new migration (never edit 0001): posts get slug (unique, generated from title, collision-safe), published_at, cover_media_id (nullable); events get location, starts_at/ends_at replacing event_date (migrate data).
Endpoints: public GET /api/posts (published only, ?page&limit&q, newest first, returns {items,page,limit,total}), GET /api/posts/{slug}; staff POST/PATCH/DELETE /api/staff/posts; same for events with ?upcoming=true. Author id always comes from the token, never the body. Drafts are never visible publicly.
Use feature folders internal/posts and internal/events with handler → service → repository (interface). Tests: repository tests against the real Postgres (compose service), handler tests with a fake repo, and an auth matrix test (guest/user/volunteer/editor/admin × each route). Update docs/openapi.yaml (create it if missing) and the ARCHITECTURE API table. Then Prompt V.
```

### P2.2 Media upload

```
Task: ROADMAP Phase 2 — media.
Add a Storage interface (Save, Open, Delete) with a local-disk implementation rooted at MEDIA_DIR. Endpoint POST /api/staff/media (multipart): enforce MEDIA_MAX_MB, allowlist of types (mp4/webm, mp3/ogg, pdf, png/jpg/webp), detect type by content sniffing not by extension, store under a random key, never use the client filename in a path. GET /api/media?kind= (public list), GET /media/{id}/file (stream with correct Content-Type, Content-Disposition, nosniff), DELETE /api/staff/media/{id} (removes DB row and file). Migration adds mime_type, size_bytes, kind, storage_key (replace file_path) — fix the file_url/file_path naming mismatch by using ONE field name in the API and OpenAPI. Tests: oversize, disallowed type, spoofed extension, path traversal attempt, delete cleans disk. Then Prompt V.
```

### P2.3 Users, profile, contact inbox

```
Task: ROADMAP Phase 2 — users, profile, contact.
Admin: GET /api/admin/users (paginated, search), PATCH /api/admin/users/{id}/role (cannot demote the last admin or yourself), DELETE /api/admin/users/{id} (same guard). Member: GET/PATCH /api/me (name; password change requires current password). Staff: GET /api/staff/contact-messages, PATCH status (new|read|replied). Contact submissions: keep public POST /api/contact but add a honeypot field and per-IP rate limit (3/hour); optional SMTP notification behind SMTP_* env (skip silently if unset). Remove the password field from every JSON-tagged struct (use separate DTOs). Tests for the guards (last admin, self-demotion) and the role matrix. Then Prompt V.
```

### P2.4 Volunteers, sign-ups, membership

```
Task: ROADMAP Phase 2 — volunteers and membership.
Add migrations/tables per ARCHITECTURE.md: volunteer_profiles, event_signups, memberships. Endpoints: POST /api/me/volunteer-application (skills, availability → status pending), admin approve/deactivate (approval sets users.role to volunteer in a single transaction), POST/DELETE /api/events/{id}/signup (no duplicates, 409), admin lists volunteers/members with filters, admin sets membership status. Role changes happen ONLY server-side via approval — never from the register payload. Tests incl. transaction rollback. Update OpenAPI and ARCHITECTURE. Then Prompt V.
```

---

## Phase 3 — Auth hardening

### P3.1 Cookie sessions

```
Task: ROADMAP Phase 3 — replace localStorage tokens with cookie sessions (see ARCHITECTURE "Auth design"; write ADR-004 first, ≤1 page).
Backend: /api/auth/login sets access JWT (15m) and an opaque random refresh token (7d, stored hashed in refresh_tokens) as httpOnly, Secure (when APP_ENV=production), SameSite=Lax cookies; /auth/refresh rotates and detects reuse (revoke the whole family); /auth/logout revokes; /auth/me returns the user. Middleware reads the cookie, validates HS256, and loads the CURRENT role from the DB (60s in-memory cache). Add an Origin/Referer check on non-GET requests.
Frontend: remove all localStorage use; AuthContext initializes from /auth/me; apiFetch uses credentials:"include", handles 401 by one refresh attempt then logout; add Next middleware that redirects unauthenticated users away from /dashboard server-side.
Tests: login/refresh/logout flow, refresh reuse detection, expired access token, demoted-user loses access within cache TTL. Then Prompt V and show me a grep proving no token touches localStorage.
```

### P3.2 Abuse protection and headers

```
Task: ROADMAP Phase 3 — rate limiting, password policy, headers.
Add an in-memory token-bucket limiter middleware (interface so Redis can replace it later): login 5/min per IP+email, register 5/hour per IP, contact 3/hour per IP; 429 with Retry-After. Password policy: min 12 chars, reject the top-1000 common passwords (embedded list). Security headers: Go middleware (X-Content-Type-Options, Referrer-Policy, Permissions-Policy) and Next headers() with a CSP that works with Next (nonce-based), HSTS in production. gin SetTrustedProxies from env. Run `govulncheck ./...` and `gosec ./...` and fix or justify every finding in docs/SECURITY-NOTES.md. Add the full route×role authorization matrix test as one table-driven test file. Then Prompt V.
```

---

## Phase 4 — Front end

### P4.1 Fix Tailwind v4 + design system

```
Task: ROADMAP Phase 4 — styling foundation. First, prove the current problem: run `npm run build && npm start`, and tell me whether bg-primary / bg-primaryDark classes produce CSS (inspect built CSS in .next). Then fix it the Tailwind v4 way: tokens in an @theme block in globals.css (brand yellow scale, neutrals, radius, font), delete tailwind.config.ts and the v3 @tailwind directives, replace bg-opacity-* with slash syntax. Load fonts with next/font. Create components/ui (Button, Input, Label, Textarea, Select, Card, Badge, Dialog [accessible: focus trap, Esc, aria], Toast, Table, Skeleton) with variants via class-variance-authority. Add a /styleguide route (dev only) showing them. Keep the yellow brand identity; aim for a calm, trustworthy, modern look (generous spacing, strong type hierarchy), AA contrast, light + dark. Screenshots of /styleguide in light/dark go to docs/screenshots/. Then Prompt V.
```

### P4.2 Layout, home, public pages (SSR/ISR)

```
Task: ROADMAP Phase 4 — public site. Convert public pages to Server Components fetching from API_INTERNAL_URL with revalidate: 60. Build: responsive Navbar (mobile drawer, active link, logo via next/image, auth-aware), Footer with real columns, Home (hero, upcoming events, latest news, volunteer CTA), Blog list with search/pagination, /blog/[slug] article page, Events list/detail, Media library (filter by kind; video/audio players, document download), About, Contact (react-hook-form + zod, success/error states), Volunteer (real application form → API). Each page exports generateMetadata; add app/sitemap.ts, app/robots.ts, not-found.tsx, error.tsx, JSON-LD for Article/Event/Organization. No "use client" unless interactivity needs it. Show Lighthouse (mobile) scores before/after for Home and Blog. Then Prompt V.
```

### P4.3 i18n

```
Task: ROADMAP Phase 4 — i18n with next-intl (write ADR-007). Locales: ⟨en, am⟩ (default en). /[locale] routing, language switcher, localized metadata and hreflang, locale-aware date formatting, messages in messages/*.json. Extract ALL hard-coded UI strings from public pages and dashboard. Fonts must cover Ethiopic script (e.g. Noto Sans Ethiopic via next/font). I will review the Amharic strings — mark machine-translated ones with a TODO key list in docs/i18n-review.md. Content translation (posts/events) is NOT in this task. Then Prompt V.
```

### P4.4 Dashboard CRUD

```
Task: ROADMAP Phase 4 — dashboard. Generate API types from docs/openapi.yaml (openapi-typescript) into types/api.ts and build a typed client in lib/api. Use TanStack Query + react-hook-form + zod. Implement tables with create/edit/delete for Posts (Markdown editor with preview, publish toggle, cover image picker from media), Events, Media (drag-and-drop upload with progress, delete), Users (role change, delete with guards), Volunteers (approve/deactivate), Memberships, Contact inbox (status). Confirm dialogs, toasts, optimistic updates, empty/loading/error states, keyboard-accessible, role-aware sidebar. Zero `any`; `tsc --noEmit` clean. Remove every dead button. Then Prompt V.
```

---

## Phase 5 — Testing & CI

### P5.1 Front-end and e2e tests

```
Task: ROADMAP Phase 5 — front-end tests. Add Vitest + React Testing Library (+ MSW): tests for ContactForm, login form, PostForm validation, role-aware sidebar, apiFetch 401-refresh behavior. Add Playwright with a docker-compose test profile: scenarios (1) register → login → logout, (2) admin creates a published post with an image and it appears on /blog and in the sitemap, (3) editor cannot reach /dashboard/users (redirect/403), (4) contact form submit shows success and appears in the staff inbox, (5) language switch keeps the route. Tests must be deterministic (seeded DB, no sleeps). Then Prompt V.
```

### P5.2 CI pipeline

```
Task: ROADMAP Phase 5 — GitHub Actions. Create .github/workflows/ci.yml with jobs: go (gofmt check, vet, golangci-lint, test -race -cover with a postgres service, govulncheck), web (npm ci, lint, tsc, vitest --coverage, build, npm audit --omit=dev as non-blocking warning), e2e (compose up, wait healthy, playwright, upload traces on failure), docker (build both images with buildx cache, run Trivy and fail on HIGH/CRITICAL with fixed versions), and a release.yml that on tag v*.*.* builds and pushes images to GHCR. Add dependabot.yml, a PR template, and a gitleaks pre-commit config. Use pinned action versions (full version tags). Add status + coverage badges to README stub. Explain every job in 1 line in docs/CI.md. Then Prompt V (you can't run Actions locally — validate with `act` if available or `actionlint` and say clearly what is unverified).
```

---

## Phase 6 — Docker & production readiness

### P6.1 Images and compose

```
Task: ROADMAP Phase 6 — images and compose.
Go image: multi-stage, `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`, run on a pinned minimal base as non-root (create user), HEALTHCHECK against /healthz, copies migrations. Next image: next.config output "standalone", install deps once, copy standalone + static + public, non-root, healthcheck. Pin base image tags (no :latest). Replace the NEXT_PUBLIC_API_URL runtime-env hack: browser uses same-origin /api; server-side code uses API_INTERNAL_URL. compose.yaml (dev) + compose.prod.yaml (no published DB port, healthchecks with depends_on service_healthy, restart policies, mem limits, volumes for DB and media, secrets from .env). Report image sizes before/after and `docker run --rm <image> id` proving non-root. Then Prompt V.
```

### P6.2 Reverse proxy, backups, Makefile, clean-clone test

```
Task: ROADMAP Phase 6 — proxy and operations. Add Caddy to compose.prod.yaml: automatic TLS via DOMAIN env (local dev uses http://localhost), `/api/*` → api, everything else → web, compression, security headers, request size limit for uploads. Add a pg_dump backup service (daily, 7-day retention, to a volume) and docs/RUNBOOK.md sections: backup, restore (tested!), rotate JWT secret, rotate DB password, rollback an image tag. Add a Makefile: up, down, logs, test, lint, migrate, seed, backup, restore. Final proof: in a fresh temp directory `git clone` this repo, `cp .env.example .env`, fill only the required values, `make up`, and show the site and /healthz working. Report the elapsed time. Then Prompt V.
```

---

## Phase 7 — Observability & deploy

### P7.1 Logging, metrics, error tracking

```
Task: ROADMAP Phase 7 — observability. Ensure every log line is JSON with request_id, method, path, status, latency_ms, user_id (if any); propagate X-Request-ID from Caddy → Next → API. Add Prometheus metrics at /metrics (http_requests_total, duration histogram, db pool stats) reachable only on the internal network. Optional Sentry for both services behind SENTRY_DSN (no-op when unset). Never log passwords, tokens, cookies, or request bodies. Add a short docs/OBSERVABILITY.md. Then Prompt V.
```

### P7.2 Deploy

```
Task: ROADMAP Phase 7 — deployment to ⟨TARGET: VPS+Caddy | Fly.io | Render | Cloud Run⟩. First write docs/DEPLOY.md with the exact steps and cost estimate and WAIT for my approval before executing anything that creates paid resources or touches DNS. Then: CI-driven release on tag (build → push GHCR → deploy), HTTPS on ⟨domain⟩, production .env documented (values stored in the platform's secret store, not in git), demo accounts (read-only/demo roles) with a nightly data reset job, smoke-test script `scripts/smoke.sh` run after deploy, and rollback instructions. Then Prompt V against the live URL.
```

---

## Phase 8 — Portfolio packaging

### P8.1 README, docs, polish

```
Task: ROADMAP Phase 8. Write a recruiter-grade README.md: one-sentence pitch, live demo link, 3–4 real screenshots + one GIF (login → create post → visible on public page; produce them with Playwright and save to docs/screenshots), feature list, architecture diagram (mermaid from ARCHITECTURE.md), tech stack table, quick start (3 commands), testing/CI section with real badges, security highlights, project structure, "decisions & trade-offs" linking docs/adr, known limitations, roadmap. Then: write the ADRs listed in ARCHITECTURE.md §4 (short, honest), add CONTRIBUTING.md, SECURITY.md, issue/PR templates, repository topics list. Fill PROJECT_NOTE.md §7 with REAL measured numbers (run the commands, don't estimate) and update §8 to the true status. Do not invent metrics: if something wasn't measured, leave the placeholder and tell me.
```

### P8.2 Independent review (run in a fresh chat)

```
Act as a skeptical senior engineer reviewing this repo as a hiring manager would for a senior full-stack role. Read README.md first, then spend your time on server/, front-end/, compose files, CI. Do not trust the docs — verify claims against the code (e.g. "no tokens in localStorage", "all queries parameterized", "tests cover the role matrix"). Output: (1) first impression in 3 sentences, (2) claims in README/PROJECT_NOTE that the code does not support, (3) top 10 issues ranked by how much they would hurt the candidate, with file:line, (4) what is genuinely impressive. Be blunt; do not modify files.
```

---

## Emergency prompts

**Gemini changed too much**
```
Stop. List every file you modified in this session with a one-line reason each. Identify changes not required by the task. Propose `git restore`/revert commands for those and wait for my confirmation.
```

**Tests fail and the agent wants to weaken them**
```
Do not edit tests or relax security checks to make them pass. Explain the root cause of each failure, show the minimal production-code fix, and only change a test if you can show the test itself is wrong, with evidence.
```

**Secret leaked into a file or commit**
```
Treat the secret as compromised. Remove it from the working tree, tell me which commits contain it, give me the exact steps to rotate it and (if needed) purge history with git filter-repo. Do not push anything.
```
