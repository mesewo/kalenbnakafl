# ADR-010: Proposed free-tier hosting for a portfolio demo

## Status

Accepted for a non-commercial portfolio/demo deployment only. Not approved as a production hosting recommendation.

## Context

The project needs a reachable demo without committing credentials or requiring a continuously running self-managed server. The requested stack is a Render Go API, Neon PostgreSQL, Vercel Next.js frontend, and Backblaze B2 private object storage, with GitHub Actions for deployment, keepalive, demo reset, and database backups.

The free plans have material limits: Render Free web services sleep after inactivity and have no production availability guarantee; Vercel Hobby is restricted to personal, non-commercial use. Neon can suspend compute, and migrations depend on direct PostgreSQL session semantics. Scheduled GitHub workflows are best-effort and cannot promise uptime.

## Decision

- Use Render’s Docker web service in Frankfurt, Neon’s direct TLS connection URL, Vercel with the frontend root directory, and private B2 buckets for demo media and backups.
- Keep browser API traffic same-origin through the Next.js `/api` proxy. Configure the exact Vercel origin on the API and use Secure cookies in production.
- Trust the client IP only when the Next proxy forwards Vercel’s platform-provided IP with a shared high-entropy secret; never trust arbitrary `X-Forwarded-For`.
- Gate Render deployment on reusable backend/frontend CI, then smoke-test API and localized site routes.
- Treat keepalive as opportunistic, retain eight weekly database dumps, and test restores into a separate database.
- Seed bilingual demo data and one editor plus one volunteer from runtime secrets; do not create a demo admin or commit demo passwords.

## Consequences

- The arrangement is suitable only for a personal portfolio/demo that complies with each provider’s current plan terms. A real NGO service should select paid plans with explicit availability, support, capacity, and commercial-use rights.
- Cold starts, scheduled-workflow delays, quotas, provider changes, and free-plan availability can interrupt the demo. No uptime SLA is implied.
- API media is streamed from private B2 objects, so API availability and egress limits affect media delivery.
- The deploy and backup workflows require user-owned accounts, secret setup, and an actual restore drill before the stack can be considered operational.
- Moving to a VPS later keeps the application topology and private B2 storage, while adding operator responsibility for patching, monitoring, firewalling, TLS, and restore operations.
