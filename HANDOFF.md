# HANDOFF — DocSys (repo: docwritingapp)

Written for a brand-new session with zero prior context. Read this top to bottom before touching anything.

## 1. What this project is

**DocSys** (in-code id `docsys`, package scope `@docsys/*`) is an enterprise-grade, browser-based Requirements / Test / Document Management System modeled on IBM DOORS, built for Rıdvan (ridvanozcan7@gmail.com, GitHub `ozcanr17`). It manages a folder/document tree of hierarchical rows (headings, requirements, test cases, test steps, notes) with configurable columns, real-time collaboration, traceability links, exports/imports, baselines, and coverage analysis.

- **Repo location on disk:** `~/Desktop/workspace/docsys` (renamed once from `reqtrack-v2`; git + pnpm survived the move).
- **GitHub:** `ozcanr17/docwritingapp`, private, branch `main`. Everything described below is committed and pushed unless stated otherwise.
- **A DIFFERENT, unrelated old prototype** named ReqTrack (Python FastAPI + Next.js) lives at `~/Desktop/workspace/reqtrack`. Never touch it and never reuse its `reqtrack` database. DocSys uses databases `docsys` (dev) and `docsys_test` (tests).

### Two absolute, non-negotiable rules
1. **ASCII-only source.** No Turkish characters (ö ç ş ı ğ ü and uppercase İ Ğ Ü Ş Ç Ö) anywhere in code, filenames, identifiers, DB names, routes, or string literals in `.ts/.tsx`. The ONLY allowed place for Turkish characters is the UI translation files `apps/web/src/locales/{tr,en}.json` and prose docs. Enforced by `bash infra/scripts/scan-forbidden-chars.sh` (excludes `locales/`). Run it before every commit. If you need UI text, add a key to both locale files and use `t("key")` — never hardcode a visible string.
2. **No code comments.** Rıdvan's standing rule — code must be self-explanatory; explanation goes in `docs/`.

## 2. Architecture (all delivered)

TypeScript modular monolith in a pnpm + Turborepo monorepo.

- `apps/api` — NestJS 11 + Fastify. Modules: `auth` (register/login/me, JWT in `docsys_session` HTTP-only cookie, bcryptjs, plus `GET /auth/collab-token` issuing a short-lived JWT the browser CAN read for the collab server), `access` (RBAC — 7 system roles seeded on boot by `AccessService.onModuleInit`; org/workspace/project scopes), `tenancy`, `tree` (folders/documents, moves with cycle prevention, soft delete/restore, trash), `rows` (CRUD, subtree move under `pg_advisory_xact_lock`, LexoRank ordering, derived display numbers via `/documents/:id/outline`, requirement links + **suspect links**, row-projects, custom field definitions + JSONB validation, **coverage** + **traceability** endpoints), `events` (Redis pub-sub → WS gateway `/ws/events`, presence in Redis TTL keys), `audit` (append-only, same-transaction), `exports` (BullMQ enqueue + presigned download + CSV import), `baselines` (freeze + diff), `storage` (MinIO client), `health`. Swagger at `/api/docs`.
- `apps/collaboration` — Hocuspocus server (port 3002). `onAuthenticate` verifies the JWT + document.read permission; snapshots persist to `collaboration_snapshots`. Logs auth rejections. Also serves HTTP 200 on `/` (Playwright health-checks it).
- `apps/worker` — BullMQ. Scheduled lifecycle jobs (30-day purge: batch, legal-hold-aware, idempotent, child-first hard deletes + snapshot compaction keep-last-5) AND the `docsys-exports` queue consumer (generates CSV/DOCX from the outline, uploads to MinIO, updates job progress). Liveness HTTP endpoint on port 3003.
- `apps/web` — React 18 + Vite + TS strict. Top **menu bar** (Dosya/Düzen/Görünüm/Ekle/Sütunlar/Analiz/Yardım = File/Edit/View/Insert/Columns/Analysis/Help). Column-driven virtualized grid (TanStack Virtual) with built-in test columns (Status, Test Step/action, Expected Result) + user-added typed custom columns, all inline-editable; lazy folder/document tree; row detail panel with link creation + suspect badges; split-screen linked-requirement viewer; trash/restore; resizable+persisted panels; light/dark/system themes via CSS-var design tokens; TR(default)+EN i18n; Tiptap+Yjs rich-text editor for `general_document` docs; Analysis dialog (baselines + coverage + traceability matrix).
- `packages/database` — Prisma 6 schema + migrations + a re-export of the generated client (`export * from "@prisma/client"`). **Must be built** (`pnpm --filter @docsys/database build`) before apps typecheck.
- `packages/config` — zod env schema.
- PostgreSQL 16 (sole source of truth), Redis (ephemeral only — pub-sub, presence, queues, cache, idempotency; ADR 0005 forbids it as a store of record), MinIO/S3 for binaries.

## 3. What has been completed (Phases 1–4 + DOORS parity)

- **Phase 1** — architecture, 11 ADRs (`docs/adr/0001–0011`), analysis docs, Prisma schema (~31 tables). Read `docs/adr/0007` (hierarchy) and `0008` (audit/soft-delete) before changing rows.
- **Phase 2** — full backend + realtime, all tests green; 50-client Yjs load test passes (`tests/performance/collab-load.mjs`).
- **Phase 3** — full frontend (menu bar, themes, i18n, tree, column-driven grid with custom columns + test fields, optimistic UI + 409 handling, presence, detail panel, split viewer, trash, resizable panels, Tiptap+Yjs editor, ESLint flat config wired into `pnpm lint` + CI).
- **Phase 4** — background CSV/DOCX exports via BullMQ + MinIO with progress + presigned download; CSV import rebuilding hierarchy; traceability link creation; object storage.
- **DOORS-parity features:** **Suspect links** (editing a linked row auto-flags its links suspect bidirectionally with reason/timestamp, in-tx + audit; `POST /links/:id/acknowledge`, `GET /documents/:id/suspect-links`; badge + Acknowledge in the detail panel). **Baselines** (`POST/GET /documents/:id/baselines` snapshots rows into a `DocumentRevision.summary` JSONB; `GET .../baselines/:n/diff` returns added/removed/modified). **Coverage report** (`GET /documents/:id/coverage`). **Traceability matrix** (`GET /documents/:id/traceability`). All three reports are in the Analysis menu → a modal dialog.

**Migrations (3):** `init`, `hierarchy_prefix_indexes` (adds `text_pattern_ops` indexes by hand-written SQL), `suspect_links` (adds `suspect`/`suspectSince`/`suspectReason` to requirement_links + indexes).

**Test status (all green as of session end):** api **32**, worker **9**, web **4**, Playwright e2e **5** (`smoke`, `editor`, `exports`, `columns`, `traceability`). Lint clean, char scan clean.

## 4. Where we are / what is NOT done (nothing is blocking)

There is no open bug or half-finished feature. The last session ended cleanly with everything committed and pushed (latest commit `7a140e0`, traceability matrix). During that session the Bash command-approval classifier had a ~15-minute outage where only trivial commands ran — it self-resolved; if you hit `"claude-opus-4-8 is temporarily unavailable"` on Bash, just wait and retry, it is transient infra, not your command.

Remaining work, roughly by value (pick from here for "next"):
- **DOORS features not yet built:** ReqIF import/export (XML interop — high value), change-proposal approval workflow (propose→approve before edit), column/row-level ACL (finer than the current org/workspace/project RBAC), a full requirement×test matrix export, rich-text tables/images (Tiptap extensions). **DXL scripting was deliberately NOT built** and should stay out — adding an arbitrary scripting language is a security/scope hazard.
- **Phase 4 nice-to-haves:** XLSX import/export, DOCX template management (docxtemplater — spec's original intent; current DOCX is generated from scratch with the `docx` lib), attachment upload UI (schema + storage exist), PDF export.
- **Phase 3 leftovers:** dnd-kit drag-drop row reordering (currently reorder is via Indent/Outdent + context menu / move API), deeper keyboard-tree a11y.
- **Ops/infra:** Docker images (`infra/docker/Dockerfile.*` + `docker-compose.full.yml`) are written but **never built** — build/verify them when asked. CI is parked at `infra/github-ci.yml` because the local `gh` token lacks the `workflow` scope; after `gh auth refresh -h github.com -s workflow`, move it to `.github/workflows/ci.yml`. OpenAPI schemas are shallow (zod is the source of truth). CSRF token pattern not implemented (cookie is SameSite=strict). `collaboration_updates` table is unused (Hocuspocus stores debounced full snapshots, 2s window; ADR 0006).

## 5. How to run and verify locally (this machine)

**Fastest path — one command launcher (tested, works):**
```
pnpm dev            # infra/scripts/dev-up.sh — starts infra + all 4 apps + seeds an admin, prints URLs+creds
pnpm dev:down       # stops the app processes (STOP_INFRA=1 also stops docker infra)
pnpm seed           # re-create the admin account only (while the app is running)
```
The launcher auto-detects local Postgres/Redis (uses them if reachable, else `docker compose up -d`), starts MinIO via Docker if needed, runs migrations, starts api/collab/worker/web, and seeds a login. **Admin credentials: `admin@docsys.local` / `Admin1234!`** (override with `ADMIN_EMAIL`/`ADMIN_PASSWORD` env). Windows equivalents: `infra/scripts/dev-up.ps1` / `dev-down.ps1` (Docker-based; NOT tested on Windows from here). Full per-OS guide (Turkish): `docs/CALISTIRMA.md`. Seed logic is `infra/scripts/seed-admin.mjs` (registers-or-logs-in over HTTP, then creates a demo org/workspace/document — idempotent).

The manual path below still works if you want to run pieces individually. Dev uses **Homebrew** Postgres + Redis (no Docker needed for those); **MinIO runs via Colima/Docker** only when you touch exports.

```
export LC_ALL=C                                   # MANDATORY before ANY postgres command (see pitfall 1)
brew services start postgresql@16 redis
cd ~/Desktop/workspace/docsys
pnpm install
pnpm --filter @docsys/database generate && pnpm --filter @docsys/database build
```

Per-area checks:
```
cd apps/api && npx tsc -p tsconfig.json --noEmit && npx vitest run     # needs DB docsys_test (exists)
cd apps/worker && npx vitest run
cd apps/web && npx tsc -p tsconfig.json --noEmit && npx vitest run
npx eslint apps packages                                                # from repo root; pnpm lint also works
bash infra/scripts/scan-forbidden-chars.sh
```

**e2e (Playwright)** — self-starts api, collaboration, worker, and web via `webServer` (serialized, `workers:1`). Needs MinIO up for the exports test:
```
docker compose -f infra/docker/docker-compose.dev.yml up -d minio      # port 9000/9001, no clash with Homebrew
cd tests/e2e && npx playwright test
```
Dev DB URL `postgresql://docsys:docsys@localhost:5432/docsys` (also in `packages/database/.env`, gitignored). Test DB `docsys_test`. Role `docsys`/`docsys` with CREATEDB. To run a live stack manually for screenshots: build api (`cd apps/api && npx tsc`), then start `node apps/api/dist/main.js`, `npx tsx apps/collaboration/src/main.ts`, `npx tsx apps/worker/src/main.ts`, `npx vite --port 5173` — each with the env vars the playwright config uses (DATABASE_URL, REDIS_URL, JWT_SECRET=dev-secret-at-least-16-chars, S3_* for the worker).

50-client load test: start the collab server against `docsys_test`, then `DATABASE_URL=...docsys_test node tests/performance/collab-load.mjs`.

## 6. Pitfalls we actually hit (do not rediscover these)

1. **Turkish system locale crashes Homebrew PostgreSQL** — every `psql`/`createdb`/`brew services start postgresql@16` must run with `LC_ALL=C` or the postmaster dies ("became multithreaded during startup").
2. **Prisma `$queryRaw` binds JS numbers as bigint** — `substring(col from $1)` fails ("function pg_catalog.substring(text, bigint) does not exist"). Cast every numeric param: `${n}::int`. Used in the subtree-move raw SQL in rows + tree services.
3. **`@prisma/client` auto-loads `packages/database/.env` at import time** (ESM hoists the import above your `process.env.DATABASE_URL = ...`). Standalone scripts silently hit the DEV db. Always pass `DATABASE_URL` in the process environment, never set it inside the script.
4. **Bodyless POST + `Content-Type: application/json` → Fastify 400** ("body cannot be empty"). The web `api()` helper now only sets the header/body when a body is present. Any new bodyless POST (acknowledge, restore, logout) relies on this — do not re-add an unconditional Content-Type.
5. **Grid rows have one `<button>` per cell** — Playwright `getByRole("button")` inside a row is ambiguous. Target cells by `data-testid="cell-value-<key>"` / `cell-input-<key>`. Inline edit via **click-then-Enter** (double-click races the row-selection click and drops the edit).
6. **Detail panel served stale data** — it uses `staleTime: 0, refetchOnMount: "always"` so suspect/link state is current when you reopen a row. Keep that.
7. **NestJS WS gateway auth race** — `handleConnection` is async and does NOT block incoming messages; a `join` right after `open` saw no auth. Fix: store the auth promise synchronously in `handleConnection`, await it in handlers (`resolveState`).
8. **Hocuspocus provider + React StrictMode** — a `useMemo`-created provider is destroyed on the simulated unmount and never reconnects. Create it in a `useEffect` and mount the editor only once it exists (see `RichTextEditor.tsx`).
9. **Vitest + NestJS decorators** — esbuild strips decorator metadata → DI breaks. Use `unplugin-swc` in `vitest.config.ts`; do NOT set `module: { type: "commonjs" }` there (Vitest can't be require()d).
10. **ESM/CJS split** — Nest apps are CommonJS; `packages/database` and `packages/config` must NOT have `"type": "module"`. Apps set `"declaration": false` to avoid TS2742 "type cannot be named" on Prisma return types.
11. **Swagger + Fastify needs `@fastify/static`** or `SwaggerModule.setup` calls `process.exit(1)` (shows up as a weird vitest crash).
12. **BullMQ vs ioredis type clash** — pass `{ host, port, maxRetriesPerRequest: null }` as `connection`, not an ioredis instance.
13. **LexoRank trailing-zero invariant** — `rankBetween` (apps/api/src/common/rank.ts) never emits ranks ending in `0`; seeds must use `initialRank()` (returns "i"), never hand-write ranks ending in 0 (breaks midpoint generation). Tested in `rank.spec.ts`.
14. **Worker/purge tests truncate the shared test DB** (including seeded roles); the load test self-seeds its role, API tests reseed on boot. Order-sensitive if you add cross-suite state.
15. **i18n reads localStorage at module load** — `storedLanguage()` guards `typeof window.localStorage?.getItem !== "function"` or component tests crash in jsdom.
16. **e2e must not assert on visible UI text** (bilingual) — select by `data-testid`. For `window.prompt` chains (add-column asks name then type), register ONE `page.on("dialog")` handler that shifts an answers array; multiple `page.once("dialog")` all fire on the first dialog and double-accept → crash.
17. **Ports** — Homebrew Postgres/Redis on 5432/6379 clash with the full Compose stack; api 3001, collab 3002, worker health 3003, web 5173, MinIO 9000/9001.
18. **A blanket `sed` rename** (the ReqTrack→DocSys migration) also rewrites legitimate mentions of the OLD prototype path/db; those were hand-fixed in this file. If you ever mass-rename again, re-check references to `workspace/reqtrack`.

## 7. Hard rules — do not violate

- **No Turkish characters in source; no code comments.** (See section 1.) Run the char scan before committing.
- **Never claim a command/test passed without running it.** If you couldn't run it, say "not executed".
- **PostgreSQL is authoritative; Redis is ephemeral only** (ADR 0005).
- **No last-write-wins:** rich text = Yjs CRDT; structured fields = `version` + HTTP 409 returning current state; structural moves = per-document advisory lock + cycle check. Don't "simplify" these away.
- **Soft delete only in user paths;** hard deletes happen exclusively in the worker purge job (legal-hold-aware, batched, audit-writing). Business FKs are `onDelete: Restrict` on purpose — never switch to Cascade.
- **Audit in the same transaction as the mutation** — every mutating service call does `AuditService.record(tx, …)` inside its `$transaction`.
- **Never trust client-sent org/workspace/project/row IDs** — resolve the entity server-side and call `AccessService.assertPermission` with the entity's own tenant IDs.
- **Every collaboration-room join is authorized by the backend** (`onAuthenticate`).
- **Do not touch `workspace/reqtrack`** or its `reqtrack` DB. Secrets never in git (`.env` gitignored; only `.env.example` committed).

## 8. Repo map

```
apps/api            NestJS API (src/{auth,access,tenancy,tree,rows,events,audit,exports,baselines,storage,health,prisma,common})
apps/collaboration  Hocuspocus server (Yjs)
apps/worker         BullMQ purge/compaction + export processor (+ liveness :3003)
apps/web            React/Vite SPA (src/{pages,components,hooks,stores,lib,locales,test})
packages/database   Prisma schema, migrations, generated-client re-export
packages/config     zod env schema
infra/docker        docker-compose.dev.yml (pg/redis/minio), docker-compose.full.yml, Dockerfile.{api,collaboration,worker}
infra/scripts       scan-forbidden-chars.sh; dev-up/dev-down (.sh + .ps1); seed-admin.mjs
infra/github-ci.yml parked CI (move to .github/workflows/ci.yml after `gh auth refresh -s workflow`)
docs/adr, docs/architecture   decisions — read before changing architecture
docs/DURUM-RAPORU.md          Turkish status report (proper Turkish characters)
docs/CALISTIRMA.md            Turkish per-OS run/test guide (macOS/Linux/Windows) + admin creds
tests/e2e           Playwright (data-testid selectors, workers:1, self-starts all 4 apps)
tests/performance   collab-load.mjs (50-client Yjs test)
```

## 9. Suggested next steps

1. Pick a remaining DOORS feature — **ReqIF export** is the highest interop value and fits the existing export pipeline; **attachment upload UI** unlocks an already-modeled capability; **change-proposal workflow** is the next big DOORS differentiator.
2. Or harden ops: build and smoke-test the Docker images, activate CI.
Whatever you pick, keep the ASCII-only + no-comments rules, add `data-testid`s for any new interactive UI, extend the relevant test suite + an e2e, run the four checks in section 5, then commit with a Conventional-Commit message and push to `main`.
