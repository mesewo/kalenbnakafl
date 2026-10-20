# PROJECT_NOTE.md — Kalenbnakafl (portfolio case study)

> Living document. **Rule: only write a claim here after it is true and verified.** Placeholders in `〈angle brackets〉` get replaced with real numbers in Phase 8. Anything unchecked in the status table must not appear in your résumé, LinkedIn or interviews as done.

## 1. One-line pitch

A full-stack website and role-based admin platform for a community NGO — public news, events and media library, volunteer and membership management, multilingual, built with Next.js, Go and PostgreSQL and shipped as a containerized system.

## 2. Problem

Community organizations usually run on social-media pages and spreadsheets: announcements get buried, volunteers and members are tracked by hand, sermons and documents are scattered, and there is no single place for the public to find what's happening. Kalenbnakafl gives the organization one site it can update itself — without a developer — and gives visitors a fast, searchable, mobile-friendly place to follow events, news and media in their language.

*(Languages and real-client vs demo status remain to be confirmed in ROADMAP.)*

## 3. What I built (scope)

- **Public site:** home, about, news/blog with article pages, events calendar, media library (video/audio/documents), volunteer sign-up, contact form
- **Accounts & roles:** guest, registered user, volunteer, editor, admin — enforced on the server
- **Admin dashboard:** CRUD for posts, events, media; user and role management; volunteer and membership workflows; contact inbox
- **Cross-cutting:** multi-language UI, SEO, accessibility, rate limiting, audit-friendly logging
- **Out of scope by design:** online payments/donations

## 4. Architecture at a glance

Browser → Caddy (TLS, same-origin) → **Next.js** (SSR/ISR public pages, client dashboard) and **Go/Gin API** → **PostgreSQL**; media on a volume behind a storage interface; GitHub Actions builds, tests and scans container images. Full diagrams and data model: `ARCHITECTURE.md`.

## 5. Key engineering decisions (and trade-offs)

| Decision | Why | Trade-off |
|----------|-----|-----------|
| Go API separate from Next.js | Clear API boundary, small fast binary, easy to test and scale independently | Two services to run; solved with Compose and a reverse proxy |
| Same-origin reverse proxy | No CORS in prod, cookie auth just works, one public URL | Extra component to configure |
| httpOnly cookie sessions (short JWT + rotating refresh) | Removes token theft via XSS; enables revocation | More moving parts than `localStorage` |
| Versioned SQL migrations | Reproducible schema, safe upgrades, CI can build DB from zero | Slightly more ceremony than one `init.sql` |
| Server-rendered public pages with ISR | SEO and speed for content that rarely changes | Needs revalidation on publish |
| Repository/service layers in Go | Handlers testable without a DB | More files than handler-only code |
| `Storage` interface for media | Local volume now, S3-compatible later without touching handlers | Small abstraction cost up front |

## 6. Security posture

Parameterized SQL everywhere · bcrypt password hashing · server-assigned roles (clients can't self-promote) · short-lived tokens in httpOnly cookies · rate limiting and body-size limits · CORS allowlist / same-origin · security headers · secrets only via environment · dependency and image scanning in CI (`govulncheck`, `npm audit`, Trivy) · non-root containers. *(Tick each only after it is implemented — see ROADMAP Phases 1, 3, 5, 6.)*

## 7. Quality & delivery evidence *(fill with real numbers)*

| Metric | Value |
|--------|-------|
| Go test coverage | 〈xx %〉 |
| Front-end test coverage | 〈xx %〉 |
| E2E scenarios (Playwright) | 〈n〉 |
| Lighthouse mobile (perf / a11y / SEO / best-practices) | 〈…〉 |
| API endpoints / OpenAPI documented | 〈n〉 / 〈yes〉 |
| Docker image sizes (api / web) | 〈… MB〉 / 〈… MB〉 |
| Cold start from clean clone | 〈m:ss〉 |
| CI pipeline duration | 〈m:ss〉 |
| Live demo | 〈URL〉 |

## 8. Honest status (as of 2026-10-10, from AUDIT.md)

| Area | State |
|------|-------|
| Auth (register/login/JWT/role middleware) | ✅ works in principle · ⚠ secrets hardcoded, token in localStorage |
| Posts / events API | ⚠ create + list only, drafts leak publicly, no validation |
| Media | ⚠ list only, no upload |
| Contact form | ✅ stores messages · ⚠ no inbox, no notification |
| Volunteers / membership | ❌ not implemented (UI shell only) |
| Multi-language | ❌ not implemented |
| SEO | ❌ client-rendered pages, no metadata/sitemap |
| Tests / CI | ❌ none |
| Docker | ⚠ compose runs; frontend image only works by accident; root containers |
| Docs | ❌ one-line README |

Update this table as phases complete; the end state should be all ✅.

## 9. Challenges and lessons *(write these from real experience as you hit them)*

Seed prompts — replace with what actually happened:
1. *Build-time vs runtime config in Next.js:* why `NEXT_PUBLIC_*` broke containerized API calls and how a same-origin proxy removed the problem.
2. *Auth hardening:* moving from `localStorage` JWT to rotating refresh cookies; what attacks it mitigates and what it doesn't.
3. *Schema evolution:* replacing `init.sql` with migrations after realizing it only runs on an empty volume.
4. *Working with an AI coding agent:* the context files (AGENTS/ARCHITECTURE/ROADMAP) and the rule "verify before done" — what went wrong without them.

## 10. Interview talking points

- **"Walk me through the architecture."** → §4 diagram; why Go + Next; where state lives; how a request flows.
- **"How is auth secured?"** → cookie sessions, refresh rotation, server-assigned roles, role re-check, rate limits; the role-matrix test.
- **"What would you do differently / next?"** → S3 storage + CDN, background jobs for email, audit log table, feature flags, load testing.
- **"How do you know it works?"** → CI gates, role-matrix tests, Playwright happy path, health checks, clean-clone timing.
- **"What did you use AI for?"** → Be straightforward: used Gemini/Claude as a pair programmer under written conventions; every change verified by tests/CI; I can explain every file. (Only say this if it's true and you can back it up by explaining any file in the repo.)

## 11. Résumé bullets (use only when true)

- Built and deployed a full-stack community platform (Next.js 16, Go/Gin, PostgreSQL, Docker) with role-based access, bilingual UI and an admin CMS; 〈n〉 REST endpoints documented in OpenAPI.
- Hardened authentication with httpOnly cookie sessions, rotating refresh tokens, rate limiting and a route×role authorization test matrix.
- Established CI/CD (GitHub Actions: lint, unit, e2e, image scan, deploy) with 〈xx %〉 test coverage and one-command local setup (< 〈n〉 min).
- Delivered SEO-optimized, accessible pages (Lighthouse 〈…〉) using server components and ISR.
