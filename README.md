# ReqTrack v2

Enterprise requirements, test, and document management system (DOORS-class), browser-based, self-hostable.

Monorepo layout:

- `apps/` — deployable processes: web (React SPA), api (NestJS), collaboration (Hocuspocus), worker (BullMQ). Implemented from Phase 2 onward.
- `packages/` — shared code: database (Prisma schema + client), config (env validation). Further packages (contracts, validation, domain, ui, auth, observability, testing) are added when their first consumer lands.
- `infra/` — Docker Compose, reverse proxy config, operational scripts.
- `docs/` — architecture analysis, ADRs, diagrams, deployment and security docs.
- `tests/` — cross-app e2e and performance suites (Phase 2+).

## Phase 1 quick start

```
pnpm install
docker compose -f infra/docker/docker-compose.dev.yml up -d
cp .env.example .env
pnpm db:validate
pnpm db:migrate
pnpm scan:chars
```

Without Docker, point `DATABASE_URL` at any PostgreSQL 16 instance.

Architecture entry points: `docs/architecture/phase1-analysis.md`, `docs/adr/`.
