# Kalen Benakafil NGO Website Completion Plan

## Scope
Finish the existing Next.js + Go + PostgreSQL NGO website from `https://github.com/mesewo/kalenbnakafl.git`. The organization is a community-focused NGO, not a faith-based organization. The project will retain its existing public routes and backend intent while completing unfinished admin workflows, improving public storytelling, and making the application safe and coherent for Preview and production builds.

## Implementation approach
- Use the existing Next.js App Router frontend and Go/Gin API rather than replacing the stack.
- Import the repository into the managed Webdev project and keep the app listening on the configured Preview port.
- Build a shared yellow-led design system with warm paper surfaces, deep ink/navy text, charcoal/evergreen utility surfaces, and dark gold or navy action buttons for contrast.
- Make public content and dashboard behavior responsive and accessible first; use the existing logo asset and avoid unverified organization facts.
- Keep backend changes self-contained under `server/`, add durable SQL migration files, and keep frontend API calls same-origin friendly for browser deployment.
- Preserve server-side authorization as the security boundary and add client-side role guards for a clear user experience.

## Design direction
### Alternative styles
- **Warm civic editorial** — 0.06 probability: yellow paper, ink typography, structured NGO storytelling.
- **Bright neighborhood bulletin** — 0.05 probability: energetic yellow blocks, friendly cards, high-visibility calls to action.
- **Quiet documentary** — 0.04 probability: muted yellow, generous whitespace, photo-led impact stories.

### Chosen style: Warm civic editorial
- **Design Movement:** contemporary civic editorial with tactile print-inspired color blocking.
- **Core Principles:** welcoming, practical, transparent, community-led.
- **Color Philosophy:** yellow is the recognizable optimism and energy of the NGO; near-black ink and deep navy provide readable contrast; warm off-white reduces visual fatigue; muted green appears only as a supporting “impact” signal.
- **Layout Paradigm:** editorial sections with offset content blocks, asymmetric hero composition, and wide narrative bands rather than centered card grids everywhere.
- **Signature Elements:** yellow marker bars behind key words, small uppercase section labels, and rounded “field note” cards for events and impact metrics.
- **Interaction Philosophy:** direct, reassuring, low-friction actions; every form provides clear status feedback and every dashboard action makes its outcome obvious.
- **Animation:** short, subtle reveal and hover transitions only; respect `prefers-reduced-motion`; no decorative motion that competes with content.
- **Typography System:** a sturdy serif display face for major headings paired with a clean sans-serif UI/body face; strong hierarchy, readable line lengths, and visible focus states.
- **Brand Essence:** practical community action for people who want to help locally; grounded, hopeful, useful.
- **Brand Voice:** clear, human, action-oriented. Example lines: “Small actions. Stronger neighborhoods.” and “See what your support makes possible.”
- **Wordmark & Logo:** use the existing Kalen Benakafil logo image in the navbar/footer; pair it with a compact wordmark lockup instead of plain text alone.
- **Signature Brand Color:** sunflower yellow, used as the brand anchor while keeping text and controls dark enough for WCAG contrast.

## Product outcomes
1. **Reliable application foundation:** fix styling tokens, same-origin API behavior, typed API error handling, responsive navigation, role guards, and production-safe configuration defaults.
2. **Public NGO experience:** complete home, about, news, events, volunteer, and contact journeys with clear CTAs, published-only news, formatted dates, meaningful empty/error states, and accessible forms.
3. **Content management:** retain and improve post/event create flows; add edit/delete/publish controls with validation, confirmation, and refresh behavior.
4. **Media library:** add validated upload and delete flows with durable local/project storage metadata and a consistent `file_path` response contract.
5. **User and volunteer operations:** add admin user create/edit/delete/role controls, volunteer filtering/assignment, and a contribution/hours workflow backed by persistent tables.
6. **Profile and auth consistency:** add database-backed profile read/update, profile editing UI, registration through shared auth methods, volunteer registration behavior, expiry handling, and logout/session feedback.
7. **Backend hardening:** move secrets and connection settings to environment values, validate request DTOs, harden JWT parsing and CORS, add health/readiness behavior, and prevent public draft leakage.
8. **Release quality:** update the stale feature inventory, add route manifest, resolve frontend diagnostics/lint/build issues, verify Preview startup, and checkpoint the completed project without publishing it.

## Project structure
- `front-end/app/`: public App Router pages and dashboard routes.
- `front-end/components/`: shared navigation, forms, dialogs, tables/cards, and status UI.
- `front-end/context/`: authentication/session state.
- `front-end/lib/`: API client and typed frontend helpers.
- `front-end/public/`: existing logo and static assets.
- `server/handlers/`: HTTP handlers for public, auth, content, media, profile, users, and volunteers.
- `server/models/`: response and request models.
- `server/routes/` and `server/middleware/`: route registration and authorization.
- `server/database/` and `migrations/`: connection handling and versioned schema changes.
- `public/manus-routes.json`: managed route manifest for all page routes.
- `app.config.ts`: managed project logo metadata.

## Material constraints
No user-provided copy, images, credentials, external storage provider, or verified organization facts are available. Reuse the existing logo and existing content seed data. Do not add faith-specific claims or invented impact statistics. Media uploads use a project-local durable path abstraction for the current app, with metadata stored in PostgreSQL.

## Serving and build workflow
- Preview runs the frontend on port 3000.
- Frontend browser requests use relative `/api` paths; local development may use a configurable API base while production uses a same-origin rewrite/proxy strategy.
- The managed project remains configured without database/server capabilities unless implementation requires enabling them; backend code and Compose remain part of the repository deliverable and are validated statically where runtime dependencies are unavailable.
- Before checkpointing, run frontend install/build/lint/type checks, verify `/manus-routes.json`, start Preview, and inspect the final Git diff.
