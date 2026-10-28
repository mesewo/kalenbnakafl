# kalenbnakafl

A community NGO website and content workspace for news, events, volunteering, and community resources.

## Quick start

1. Copy `.env.example` to `.env` and replace the database password, JWT secret (at least 32 bytes), and admin password (at least 12 characters).
2. Set `CORS_ORIGINS` to the public site origin exactly: scheme plus host, with no path or trailing slash. Cookie-authenticated write requests must send an `Origin` that matches this value.
3. Run `docker compose up --build` from the repository root.
4. Open `http://localhost:3000`.

See [ROADMAP.md](ROADMAP.md).

API reference: open [`docs/api.html`](docs/api.html) for the Redoc view of [`docs/openapi.yaml`](docs/openapi.yaml).

## Live demo

The repository includes an optional deployment setup for a portfolio/demo using Render, Neon, Vercel, and private Backblaze B2 storage. No live URL or public demo credentials are published here; configure the provider accounts and share any demo editor/volunteer credentials privately. See the [deployment guide](docs/DEPLOYMENT.md) for setup, limitations, backups, and rollback steps. The free-tier combination is not a production hosting recommendation.

## Troubleshooting

### Docker reports “Pool overlaps with other one”

The subnet configured for the Compose network overlaps with another Docker network. Change the subnet under `networks` in `docker-compose.yaml` to an unused range, then retry. You can also remove unused Docker networks with `docker network prune` and retry.
