# DocSys v2

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

## Portable Windows release

The Windows release contains two administrator-free executables. Keep `DocSys.exe` and `DocSys Server.exe` in the same directory and launch `DocSys.exe`; it starts the portable server automatically when needed. No Docker, Node.js, PostgreSQL, Redis, MinIO, runtime installer, Windows service, registry change, or PATH change is required on the target computer.

The embedded infrastructure is extracted silently to the current user's `%LOCALAPPDATA%\DocSys` runtime cache. Application data remains in `%LOCALAPPDATA%\DocSys\data`; database backups created from the server panel are written to `%LOCALAPPDATA%\DocSys\backups`.

See `docs/WINDOWS-PORTABLE.md` for usage, storage and incremental development details.

## Cross-platform desktop releases

The React/Vite product surface is shared by browser, Tauri and portable Windows builds. Tauri produces native macOS, Linux and Windows packages, while the portable Windows build additionally provides a self-contained local server for evaluation environments.

Use `pnpm release:version <semver>` to advance every package/runtime version and `pnpm release:check` to reject drift. Push a matching `v<semver>` tag to build the native packages and the portable Windows archive in one draft GitHub release. See `docs/DESKTOP.md` for signing and publishing requirements.
