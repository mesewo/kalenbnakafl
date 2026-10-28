# Kalenbnakafl frontend

The public website and staff dashboard use Next.js App Router, React, TypeScript, and
next-intl. Public pages use static rendering and 60-second incremental revalidation;
interactive forms and the dashboard use the same-origin `/api` client.

## Local development

Run `npm ci` and `npm run dev` from this directory, or start the full application with
`docker compose up --build` from the repository root after configuring `.env`.

## API target and deployment

Set `API_INTERNAL_URL` to the API origin, without an `/api` path. Docker Compose passes
it as a build argument for static generation and as a runtime environment variable for
the server-side proxy. The runtime proxy reads it for each request, so the value can be
changed at deployment without rebuilding the image. Both HTTP internal addresses and
HTTPS origins (for example a Render API URL) are supported. Browser code continues to
call the same-origin `/api` path.

Configure the frontend build with a reachable API when you want public content
pre-rendered. If that API is asleep or unreachable, the build emits empty public content
and lets ISR populate it later; failed revalidation keeps the last successful page.

The production Docker image uses Next.js standalone output and runs as an unprivileged
user. CSP is shipped in report-only mode; review real deployment reports before
considering enforcement. HSTS is sent by the app and should be validated through the
production HTTPS ingress before enabling browser preload or subdomain-wide policies.

## Verification

Run `npm run test:unit`, `npm run check:i18n`, `npm run lint`, `npx tsc --noEmit`,
`npm run format:check`, `npm run build`, and `npm run test:e2e`.
