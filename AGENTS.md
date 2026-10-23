# AGENTS.md — working agreement for AI coding agents

> Read this file first, then `ARCHITECTURE.md` and `ROADMAP.md`.
> Works with Gemini (Cloud Shell Editor / Gemini CLI), Claude Code, Cursor, Copilot. If your tool only reads `GEMINI.md` or `CLAUDE.md`, point it here (a one-line `GEMINI.md` containing `@AGENTS.md` works in Gemini CLI; otherwise paste this file into the tool's rules/context).

## Project

**Kalenbnakafl** — website for a community NGO: public site (news, events, media, volunteer sign-up, contact) plus a role-based admin dashboard.
Owner: Befekadu Amdehaymanot. This repo is also a **portfolio piece for a senior full-stack role** — quality, tests, docs and security are part of the deliverable, not extras.

Canonical project name: **kalenbnakafl**; display name: **Kalen Benakafil**. Keep the module, database, package and UI names consistent.

## Stack

| Layer | Tech |
|-------|------|
| Front end (`front-end/`) | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS **v4** (CSS-first config via `@theme`) |
| API (`server/`) | Go 1.25, Gin, `database/sql` + `lib/pq` (pgx/v5 migration optional, see ADR-003), JWT (HS256), bcrypt |
| Database | PostgreSQL 15 |
| Infra | Docker, Docker Compose, GitHub Actions |

Scope = "Option D": comprehensive site **without payments**. Roles: `admin`, `editor`, `user`, `volunteer`, plus anonymous guests.

## Repo layout

```
.
├── AGENTS.md  ARCHITECTURE.md  ROADMAP.md  README.md
├── docs/PROJECT_NOTE.md
├── docker-compose.yaml        # dev stack (db + api + frontend)
├── .env.example               # every env var documented; never commit .env
├── server/db/migrations/      # embedded Goose SQL; dev rows in server/db/seed/
├── server/
│   ├── cmd/                   # main.go — wiring only
│   ├── internal/…             # (target) config, http, service, repository
│   └── handlers/ middleware/ models/ routes/ utils/ database/   # (current layout)
├── front-end/
│   ├── app/                   # routes (server components by default)
│   ├── components/  lib/  context/  types/
└── docs/                      # ADRs, API docs, screenshots
```

## Commands

> Commands marked ⚠ are *expected* to work but have not been confirmed on this repo. First time you run one, record the result in `ROADMAP.md → Verified commands`. If a command fails, fix the cause; don't paper over it.

```bash
docker compose up --build            # ⚠ full stack; web :3000, api :8080
cd server && go build ./... && go vet ./... && go test ./...     # ⚠
cd front-end && npm ci && npm run lint && npm run build         # ⚠
curl -s localhost:8080/healthz                                     # ⚠ (endpoint added in Phase 1)
```

## How to work (rules for the agent)

1. **One roadmap phase at a time.** Work only on the phase/task the user names. Don't "also fix" unrelated things — list them as follow-ups instead.
2. **Small, reviewable changes.** One concern per commit, Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). Never force-push; never rewrite history unless the user explicitly asks (Phase 0 binary purge is such a case).
3. **Verify before claiming done.** After each change run the build, linter and tests for the part you touched, and paste the real output summary. "It should work" is not done. If you can't run something, say so.
4. **Read before you write.** Open the files you're about to change. Match existing style unless the task is to change it.
5. **Ask when the choice is the user's** (naming, schema changes that drop data, new third-party services, anything costing money). Otherwise pick the conventional option, state it in one line, and proceed.
6. **Update docs in the same change** — API/route change → `ARCHITECTURE.md` API table + OpenAPI; env var → `.env.example`; finished roadmap item → tick it; significant decision → new ADR in `docs/adr/`.

## Hard guardrails

- **No secrets in git, logs, or prompts.** No hardcoded JWT secret, DB password, API key, or hash. Config comes from env (`server/internal/config`), documented in `.env.example`. If you find one, flag it and move it.
- **Never commit** binaries (`*.exe`, `server/app`), `node_modules`, `.next`, `.env*` (except `.env.example`), IDE folders.
- **Never put role, user id or `published` trust in client input** where the server owns it (role assignment, author id come from the session/token).
- **SQL is always parameterized.** No string-built queries. Schema changes only through a new numbered migration; never edit an applied migration.
- **Don't run destructive commands** (`docker compose down -v`, `DROP`, `rm -rf` outside build dirs, `git clean`, `git reset --hard`) without asking.
- **Don't weaken security to make a test pass** (no `*` CORS, no skipping auth, no `--no-verify`).
- **Don't add dependencies casually.** Prefer stdlib/existing deps; justify each new one in the commit message.

## Code conventions

**Go**
- `cmd/main.go` only wires things. Handlers parse/validate → call service/repository → write response. No SQL in handlers (target state; move it incrementally).
- Every error is checked; return wrapped errors (`fmt.Errorf("get post: %w", err)`); log with `log/slog` at the edge; client gets a stable `{ "error": { "code": "...", "message": "..." } }`.
- Pass `context.Context` into every DB call (`QueryContext`, `ExecContext`).
- JSON DTOs are separate from DB rows; a password hash never appears on a struct with `json` tags.
- `gofmt`, `go vet`, and `golangci-lint` clean. Table-driven tests; HTTP tests with `httptest`.

**TypeScript / Next.js**
- Server Components by default; add `"use client"` only for interactivity. Public pages fetch on the server (`revalidate`) and export `generateMetadata`.
- No `any`. API types come from one source (OpenAPI-generated or zod). Forms: react-hook-form + zod. Dashboard data: TanStack Query.
- Tailwind v4: design tokens in `@theme` inside `globals.css`; no `tailwind.config.ts`, no `@tailwind` directives, no `bg-opacity-*` (use `bg-black/50`).
- Accessibility is a requirement: labels on inputs, keyboard-operable dialogs, visible focus, contrast AA.

## Definition of done (every task)

- [ ] Builds and lints clean (Go + front end, whichever you touched)
- [ ] Tests added/updated and passing; new endpoints have at least a happy-path and an auth-failure test
- [ ] No new secrets, binaries or `any`
- [ ] `docker compose up --build` still works from a clean clone *(for infra-affecting changes)*
- [ ] Docs updated (ARCHITECTURE / `.env.example` / ROADMAP checkbox / ADR)
- [ ] Final message lists: what changed, how you verified it, what you did **not** do

## Known traps in this repo

- The Next.js rewrite destination uses `API_INTERNAL_URL`, and `NEXT_PUBLIC_*` values are baked in at **build** time. Changing either at container runtime does not change the built rewrite/client bundle; pass the rewrite destination as a Docker build argument.
- Database schema is managed by embedded Goose migrations in `server/db/migrations/`; dev sample data is opt-in through the `seed` Compose profile.
- Tailwind v4 ignores `tailwind.config.ts` unless `@config` is used; custom colors must live in `@theme`.
- When the API is behind a proxy, set `TRUSTED_PROXIES` to the actual proxy address/CIDR. The binary trusts no proxies by default; do not trust arbitrary forwarded headers.
- `init.sql` was removed; schema changes belong in numbered embedded Goose migrations under `server/db/migrations/`. Dev sample rows live separately in `server/db/seed/dev.sql`.
