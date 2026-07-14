# HANDOFF — ReqTrack v2 (repo: docwritingapp)

Written for a fresh session with zero context. Read this top to bottom before touching anything.

## 1. What this project is

An enterprise-grade, browser-based Requirements / Test / Document Management System inspired by IBM DOORS, built for Rıdvan (ridvanozcan7@gmail.com, GitHub `ozcanr17`). Turkish is the first product language (UI translations only); **all source-level identifiers must be ASCII English — Turkish characters (ö ç ş ı ğ ü and uppercase forms) are forbidden in code, filenames, DB names, routes, everything**. A scanner enforces this: `bash infra/scripts/scan-forbidden-chars.sh`.

The full product specification lives in the original prompt and is summarized across `docs/architecture/*.md` and `docs/adr/*.md`. Architecture: TypeScript modular monolith, pnpm + Turborepo monorepo, NestJS 11 + Fastify API, Prisma 6 + PostgreSQL 16, Redis (ephemeral only), Yjs + Hocuspocus collaboration, BullMQ worker, React/Vite frontend (not built yet), MinIO/S3 for binaries, Docker Compose deployment.

**Development is strictly phased. Do not start a phase without Rıdvan's explicit approval.**

- Phase 1 — Architecture + database: **DONE and approved.**
- Phase 2 — Backend, authorization, realtime: **DONE (this session), awaiting approval.**
- Phase 3 — Frontend core (React shell, themes, tree, virtualized grid, Tiptap editor, optimistic UI): **NOT STARTED. This is next, only after approval.**
- Phase 4 — Traceability, DOCX/CSV/XLSX import-export, attachments: NOT STARTED.

An older, unrelated prototype (Python FastAPI + Next.js) exists at `workspace/reqtrack` — treat it as read-only reference; never modify it. This repo is the v2 rewrite from scratch.

## 2. What has been completed

### Phase 1 (docs + schema)
- `docs/architecture/phase1-analysis.md` — bounded contexts, risks, assumptions.
- `docs/adr/0001–0011` — all major decisions with alternatives (read 0007 hierarchy and 0008 audit/soft-delete before touching rows).
- `docs/architecture/{hierarchy,concurrency,soft-delete-audit,diagrams,database-design}.md`.
- `packages/database/prisma/schema.prisma` — 31 tables, validated; 2 migrations applied (`init`, `hierarchy_prefix_indexes` with `text_pattern_ops` indexes written by hand).
- `infra/docker/docker-compose.dev.yml` (postgres/redis/minio) — **verified healthy via Colima on this machine**.

### Phase 2 (backend, all tests green)
- `apps/api` — NestJS + Fastify. Modules: auth (register/login/me, JWT in `reqtrack_session` HTTP-only cookie, bcryptjs), access (RBAC: system roles seeded idempotently on boot by `AccessService.onModuleInit`), tenancy (orgs/workspaces/projects/members), tree (folders/documents, move with cycle prevention, soft delete/restore, trash), rows (CRUD, subtree move under `pg_advisory_xact_lock`, LexoRank sibling ordering, derived display numbers via `/documents/:id/outline`, requirement links, row-projects, custom field definitions + JSONB value validation), events (Redis pub-sub → WS gateway at `/ws/events` with presence in Redis TTL keys), audit (same-transaction append-only events), health (`/health/live`, `/health/ready`), Swagger at `/api/docs`.
- `apps/collaboration` — Hocuspocus server (port 3002), JWT auth + document.read permission check on join, snapshot persistence to `collaboration_snapshots`.
- `apps/worker` — BullMQ scheduled jobs: 30-day purge (batch, legal-hold aware, idempotent, child-first hard deletes, purge audit events) + snapshot compaction (keep last 5).
- Tests: `apps/api/test/*.spec.ts` — 24 passing (auth, tenant isolation, RBAC, 409 optimistic conflicts, cycle rejection, subtree move path updates, idempotency replay, soft delete/restore, link lifecycle, custom field validation, audit, concurrent move, WS auth + event delivery). `apps/worker/test/purge.spec.ts` — 5 passing. `tests/performance/collab-load.mjs` — **50-client Yjs load test PASSED** (sync 76 ms, convergence 105 ms, snapshot persisted).
- `infra/docker/Dockerfile.{api,collaboration,worker}` + `docker-compose.full.yml` (written, **images never built** — do that or fix findings when asked).
- `.github/workflows/ci.yml` — install → prisma validate → typecheck → char scan → api + worker tests (never executed yet; first push will run it).

## 3. How to run everything locally (this machine)

No Docker needed for dev; Homebrew services are used:
```
export LC_ALL=C                      # MANDATORY before any postgres command, see pitfalls
brew services start postgresql@16 redis
cd <repo root>
pnpm install
pnpm --filter @reqtrack/database generate && pnpm --filter @reqtrack/database build
pnpm --filter @reqtrack/api test     # needs DB reqtrack_v2_test (exists)
pnpm --filter @reqtrack/worker test
```
Dev DB: `postgresql://reqtrack:reqtrack@localhost:5432/reqtrack_v2` (URL also in `packages/database/.env`, gitignored). Test DB: same host, `reqtrack_v2_test`. Docker via **Colima** (`colima start`), compose plugin symlinked to `~/.docker/cli-plugins/docker-compose`.

Load test: start collab server with test-DB env (`DATABASE_URL=...reqtrack_v2_test JWT_SECRET=test-secret-at-least-16-chars npx tsx apps/collaboration/src/main.ts`), then `DATABASE_URL=...reqtrack_v2_test node tests/performance/collab-load.mjs`.

## 4. Where we are right now / what is unfinished

- **Phase 2 report was not yet delivered to Rıdvan and approval for Phase 3 not requested/granted.** The immediate next action of a new session: summarize Phase 2 (files, tests, limitations below), ask for approval, and STOP until approved.
- ESLint is configured nowhere yet (deliberately deferred to save budget; disclose it). Add flat-config typescript-eslint at root in Phase 3.
- Docker images (`Dockerfile.*`) and `docker-compose.full.yml` are unbuilt/untested.
- OpenAPI docs are shallow (no per-DTO schemas — zod is the source of truth; consider zod-to-openapi later).
- Known small gaps (disclosed limitations, not bugs): CSRF token pattern not implemented (cookie is SameSite=strict; add CSRF before cookie-auth cross-site scenarios), Yjs incremental update log (`collaboration_updates` table) unused — Hocuspocus Database extension stores debounced full snapshots instead (2 s debounce window documented in ADR 0006 / concurrency doc), presence `presence.left` event publishes empty organizationId, MemberRole NULL-scope partial unique indexes still pending (service-level upsert guards it), rate limits/helmet are on but CSP is disabled pending frontend.
- Session usage was near limits; work may resume in a compacted-context session — this file is the source of truth.

## 5. Next plan (after Phase 2 approval)

Phase 3 frontend core, per spec: Vite + React + TS strict in `apps/web`; TanStack Query/Table/Virtual; Zustand; Tailwind + shadcn/Radix; design tokens for light/dark/system themes (see spec section 5.3 token list); app shell (sidebar + tree + editor + properties panels, resizable, sizes persisted per user); virtualized hierarchical grid with context menu, drag-drop (dnd-kit), keyboard a11y; Tiptap + Yjs rich text against the collaboration server; optimistic mutations wired to the 409/version protocol and `/ws/events` invalidation; i18next with Turkish as default locale; Vitest + RTL + Playwright. Keep identifiers English.

## 6. Pitfalls we actually hit (and their fixes)

1. **Turkish locale breaks Homebrew PostgreSQL**: every `psql`/`createdb`/`brew services start postgresql@16` must run with `LC_ALL=C` or the postmaster crashes / commands misbehave.
2. **Prisma raw SQL binds JS numbers as bigint**: `substring(col from $1)` fails with `function pg_catalog.substring(text, bigint) does not exist`. Cast every numeric param: `${n}::int`. Applied in the two subtree-move `$executeRaw` statements (rows + folders services).
3. **`@prisma/client` auto-loads `packages/database/.env` at import time** (ESM imports hoist above your `process.env.DATABASE_URL = ...` line). Standalone scripts silently hit the DEV database. Always pass `DATABASE_URL` in the process environment, never set it inside the script.
4. **NestJS WS gateway auth race**: `handleConnection` is async and does NOT block incoming messages; a `join` sent immediately after `open` saw no auth state. Fix in `events.gateway.ts`: store the auth promise synchronously in `handleConnection`, `await` it in handlers (`resolveState`).
5. **Vitest + NestJS decorators**: esbuild strips decorator metadata → DI breaks. Must use `unplugin-swc` in `vitest.config.ts` — and do NOT set `module: { type: "commonjs" }` there (Vitest cannot be require()d; leave swc emitting ESM).
6. **ESM/CJS split in the monorepo**: Nest apps are CommonJS; `packages/database` and `packages/config` must NOT have `"type": "module"` (removed). `@reqtrack/database` re-exports `* from "@prisma/client"` and must be **built** (`pnpm --filter @reqtrack/database build`) before app typechecks.
7. **TS2742 "type cannot be named"** on controllers returning Prisma types: caused by declaration emit in apps. Apps set `"declaration": false`. Don't re-enable.
8. **Swagger + Fastify needs `@fastify/static`** or `SwaggerModule.setup` calls `process.exit(1)` (surfaces as a bizarre vitest crash).
9. **BullMQ vs root ioredis type clash** (two ioredis versions + `exactOptionalPropertyTypes`): pass `{ host, port, maxRetriesPerRequest: null }` object as `connection`, not an ioredis instance.
10. **LexoRank trailing-zero invariant**: `rankBetween` (apps/api/src/common/rank.ts) never emits ranks ending in `0`; seeds must use `initialRank()` (returns "i"), never hand-write "a0"-style ranks that end in 0 — a next-rank ending in `0` breaks midpoint generation. Tested in `rank.spec.ts`.
11. **Worker tests truncate the shared test DB** (including seeded roles); anything run after them must reseed (the load test now self-seeds its role). API tests reseed roles automatically on app boot.
12. **Ports 5432/6379 clash** between Homebrew services and the Compose dev stack — stop one before starting the other.

## 7. Things we must absolutely NOT do again / hard rules

- **Never generate the whole app in one pass; never start the next phase without explicit user approval.** End each phase with: decisions, files, commands, tests, limitations, approval request — then stop.
- **No Turkish characters in any identifier/file/route/DB name.** Run `pnpm scan:chars` before claiming a phase complete. (The scanner builds its own regex from `\x` escapes so it doesn't self-match — keep it that way.)
- **No code comments** — Rıdvan's standing rule. Code must be self-explanatory; docs go in `docs/`.
- **Never claim a command/test succeeded without running it**; label anything unexecuted as "not executed".
- **Redis must never hold the only copy of business data** (ADR 0005). PostgreSQL is authoritative; presence/queues/cache only.
- **No last-write-wins anywhere**: rich text = Yjs; structured fields = `version` + HTTP 409 with current state; structural moves = per-document advisory lock + cycle check. Don't "simplify" these away.
- **Soft delete only** in user paths; hard deletes happen exclusively in the worker purge job (legal-hold aware, batch, audit-writing). `onDelete: Restrict` on business FKs is intentional — do not switch to Cascade.
- **Audit events are written in the same transaction as the mutation.** Any new mutation endpoint must call `AuditService.record(tx, ...)` inside its `$transaction`.
- **Never trust client-sent org/workspace/project IDs** — resolve the entity server-side and call `AccessService.assertPermission` with the entity's own tenant IDs.
- **Don't touch `workspace/reqtrack`** (the old prototype) and don't reuse its DB (`reqtrack`); this repo uses `reqtrack_v2` / `reqtrack_v2_test`.
- Don't put secrets in git — `.env` files are gitignored; only `.env.example` is committed.

## 8. Repo map (quick)

```
apps/api            NestJS API (src/{auth,access,tenancy,tree,rows,events,audit,health,prisma,common})
apps/collaboration  Hocuspocus server
apps/worker         BullMQ purge/compaction
apps/web            EMPTY until Phase 3
packages/database   Prisma schema, migrations, generated client re-export
packages/config     zod env schema (canonical full-stack env validation)
infra/docker        compose files + Dockerfiles
infra/scripts       scan-forbidden-chars.sh
docs/adr, docs/architecture   all decisions — read before changing architecture
tests/performance   collab-load.mjs (50-client Yjs test)
.github/workflows   ci.yml
```

> Note: CI workflow is parked at infra/github-ci.yml because the local gh token lacks the workflow scope. After running `gh auth refresh -h github.com -s workflow`, move it back to .github/workflows/ci.yml and push.
