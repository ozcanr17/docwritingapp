# HANDOFF — DocSys (repo: docwritingapp)

Written for a brand-new session with zero prior context. Read this top to bottom before touching anything.

## 1. What this project is

**DocSys** (in-code id `docsys`, package scope `@docsys/*`) is an enterprise-grade web and Tauri desktop Requirements / Test / Document Management System modeled on IBM DOORS, built for Rıdvan (ridvanozcan7@gmail.com, GitHub `ozcanr17`). It manages a folder/document tree of hierarchical rows (headings, requirements, test cases, test steps, notes) with configurable columns, real-time collaboration, traceability links, exports/imports, baselines, and coverage analysis.

- **Repo location on disk:** `~/Desktop/workspace/docsys` (renamed once from `reqtrack-v2`; git + pnpm survived the move).
- **GitHub:** `ozcanr17/docwritingapp`, private, branch `main`. This handoff describes the 2026-07-16 delivery, including the authoring, hierarchy, semantic-baseline, workspace-tab, modal-layer, presence and session-history work shipped to `origin/main` with this handoff.
- **A DIFFERENT, unrelated old prototype** named ReqTrack (Python FastAPI + Next.js) lives at `~/Desktop/workspace/reqtrack`. Never touch it and never reuse its `reqtrack` database. DocSys uses databases `docsys` (dev) and `docsys_test` (tests).

### Two absolute, non-negotiable rules
1. **ASCII-only source.** No Turkish characters (ö ç ş ı ğ ü and uppercase İ Ğ Ü Ş Ç Ö) anywhere in code, filenames, identifiers, DB names, routes, or string literals in `.ts/.tsx`. The ONLY allowed place for Turkish characters is the UI translation files `apps/web/src/locales/{tr,en}.json` and prose docs. Enforced by `bash infra/scripts/scan-forbidden-chars.sh` (excludes `locales/`). Run it before every commit. If you need UI text, add a key to both locale files and use `t("key")` — never hardcode a visible string.
2. **No code comments.** Rıdvan's standing rule — code must be self-explanatory; explanation goes in `docs/`.

## 2. Architecture (all delivered)

TypeScript modular monolith in a pnpm + Turborepo monorepo.

- `apps/api` — NestJS 11 + Fastify. In addition to auth, RBAC, tenancy, tree, rows, events, audit, baselines, storage and health, it now has a `lifecycle` module for saved views, workspace search, quality/dashboard, comments/mentions/notifications, attachments, test executions, reviews, change proposals, configurations, row ACLs, integrations and OIDC SSO. Exports support CSV, XLSX, PDF, DOCX templates and ReqIF.
- `apps/collaboration` — Hocuspocus server (port 3002). `onAuthenticate` verifies the JWT + document.read permission; snapshots persist to `collaboration_snapshots`. Logs auth rejections. Also serves HTTP 200 on `/` (Playwright health-checks it).
- `apps/worker` — BullMQ. Scheduled lifecycle jobs (30-day purge: batch, legal-hold-aware, idempotent, child-first hard deletes + snapshot compaction keep-last-5) AND the `docsys-exports` queue consumer (generates CSV/DOCX/XLSX/PDF/ReqIF from the outline, uploads to MinIO, updates job progress). Liveness HTTP endpoint on port 3003.
- `apps/web` — React 18 + Vite + TS strict. The virtual grid has multi-selection, bulk edit/move/copy/link/delete, drag reorder, dynamic row heights, saved personal/team views, sorting, frozen columns and configurable link projection. Workspace search, dashboard widgets, execution history, reviews, proposals, comments, mentions, attachments, notifications, configuration/integration/SSO settings and expanded import/export are exposed in the UI. Routes and heavy editor/dialog surfaces are lazy-loaded with explicit vendor chunks and a stale-deployment recovery boundary.
- `apps/desktop` — Tauri 2 shell for the same React/Vite build. It packages Windows, macOS and Linux targets, accepts an optional API server address at login, discovers the public collaboration URL from the API, stores desktop bearer auth per session and supports signed updater artifacts.
- `packages/database` — Prisma 6 schema + migrations + a re-export of the generated client (`export * from "@prisma/client"`). **Must be built** (`pnpm --filter @docsys/database build`) before apps typecheck.
- `packages/config` — zod env schema.
- PostgreSQL 16 (sole source of truth), Redis (ephemeral only — pub-sub, presence, queues, cache, idempotency; ADR 0005 forbids it as a store of record), MinIO/S3 for binaries.

## 3. What has been completed (Phases 1–5 + lifecycle capabilities)

- **Phase 1** — architecture, 12 ADRs (`docs/adr/0001–0012`), analysis docs, Prisma schema (~31 tables). Read `docs/adr/0007` (hierarchy), `0008` (audit/soft-delete) and `0012` (web/desktop distribution) before changing the related areas.
- **Phase 2** — full backend + realtime, all tests green; 50-client Yjs load test passes (`tests/performance/collab-load.mjs`).
- **Phase 3** — full frontend (menu bar, themes, i18n, tree, column-driven grid with custom columns + test fields, optimistic UI + 409 handling, presence, detail panel, split viewer, trash, resizable panels, Tiptap+Yjs editor, ESLint flat config wired into `pnpm lint` + CI).
- **Phase 4** — background CSV/DOCX exports via BullMQ + MinIO with progress + presigned download; CSV import rebuilding hierarchy; traceability link creation; object storage.
- **DOORS-parity features:** **Suspect links** (editing a linked row auto-flags its links suspect bidirectionally with reason/timestamp, in-tx + audit; `POST /links/:id/acknowledge`, `GET /documents/:id/suspect-links`; badge + Acknowledge in the detail panel). **Baselines** (`POST/GET /documents/:id/baselines` snapshots rows into a `DocumentRevision.summary` JSONB; `GET .../baselines/:n/diff` returns added/removed/modified). **Coverage report** (`GET /documents/:id/coverage`). **Traceability matrix** (`GET /documents/:id/traceability`). All three reports are in the Analysis menu → a modal dialog.
- **Lifecycle capabilities:** saved personal/team views; global search; frozen columns and linked-field projections; bulk operations and drag reorder; requirement quality and dashboards; comments, `@email` mentions, notifications and attachments; test execution history; reviews and change proposals; CSV/XLSX/ReqIF import; CSV/XLSX/PDF/DOCX/ReqIF export; OIDC SSO; row ACLs; product configurations; generic integration registry; deterministic engineering suggestions.
- **DOORS-style object model and authoring:** every row now receives an immutable, document-scoped integer object ID that is never changed by a hierarchy move and never reused after soft deletion. Outline numbering is rendered with heading/test-case content instead of inside the ID column. A heading or test case can set a positive `numberingStart`; that sibling and every following sibling continue from the chosen segment while descendants start their own level at 1. Clearing the value restores automatic numbering. Test documents support headings inside test cases and steps inside those headings, with a separate step number. The grid exposes `Add object` (`Insert`), `Add object below` (`Shift+Insert`), explicit top-level/child/same-level heading actions, indent/outdent (`Tab`/`Shift+Tab`), delete and keyboard navigation. Search, row-type filtering, sorting, saved views, compact link counts and the main navigation/explorer now follow the same workspace surface.
- **Safe hierarchy deletion:** deleting a row with children opens an in-app decision dialog. `delete_subtree` soft-deletes the complete subtree and every link connected to any deleted row. `promote_children` soft-deletes only the selected heading, reparents its direct children to the deleted heading's parent, removes one ancestor-path/depth segment from the whole surviving subtree and re-ranks the resulting sibling list under a per-document advisory lock. Both paths are audited and restore-compatible; restoring a promoted heading restores it empty because its former children intentionally remain promoted.
- **Profiles and remembered sessions:** login includes `Remember me`. Browser sessions use a session cookie by default or a 30-day HTTP-only SameSite-strict cookie when selected; desktop tokens remain session-scoped by default or use persistent local storage when selected. The sidebar profile name opens an editable profile (display name, email, first/last name, title, department, phone and bio), with a dedicated logout icon beside it. Presence avatars and comment authors open read-only colleague profiles. Profile visibility is restricted to users sharing an active organization and updates are audited per organization.
- **Multi-document workspace:** selecting a document in the explorer opens or activates a top workspace tab instead of replacing the only document. Tabs show document type, support independent close buttons, `Ctrl/Cmd+Tab` cycling and `Ctrl/Cmd+W` closing, and are intentionally session-scoped so one user's document IDs are never persisted into another user's login. Global-search results and traceability links use the same tab model; linked rows open their document tab and then the target detail, while `Quick preview` preserves the existing inline linked-row reader.
- **Split view and separate windows:** any second open tab can be selected in the split control. Both panes remain live/editable; clicking the secondary pane atomically swaps primary/secondary focus so menus, presence and detail state follow the focused document. The separate-window action opens a normal named browser window on web and a native Tauri `WebviewWindow` on desktop using `?document=<uuid>` bootstrapping. Desktop capability scope allows dynamic document-window labels and only the core create-webview-window command. Reopening an existing document window focuses it rather than duplicating it.
- **Heading-based test authoring and runs:** ordinary authoring no longer exposes `test_case` as a row concept. A test step can be placed at the document root or below any heading. `Add test scenario template` asks for a test name and atomically creates a heading plus localized `Preconditions`, `Test Inputs`, `Assumptions and Constraints`, and `Test Steps` child headings with one empty step. Legacy `test_case` rows remain readable/importable for compatibility. Test-heading detail can start, complete or stop a run; step result is directly selectable from the row context menu and synchronizes into the active execution. Analysis → Runs lists document-wide execution history and progress.
- **Direct numbering and view columns:** the test title column is now `Content`; editing a numbered heading exposes its hierarchy segment beside the content field so numbering and text can be committed together. Column-header clicks expose add-left, add-right and hide-from-view actions. Hiding preserves all field/link data, and the fixed Zustand subscription means menu/header column changes render immediately without reopening the document. Per-document custom ordering is persisted locally.
- **Object variants, selection and change cues:** `Add object` creates a same-level numbered heading and `Add object below` creates the next numbered child heading; each action also has an unnumbered blank-object variant. Standard test templates add localized `None.`/`Yoktur.` placeholder notes beneath Preconditions, Test Inputs and Assumptions/Constraints while retaining an empty test step. Every non-derived built-in/custom cell can be edited on every row type and empty values render blank. Row checkboxes were removed in favor of native click, Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A and Escape selection. A thin row-edge cue shows unchanged-baseline (green), unsaved local (yellow), saved remote (orange) and saved local but unbaselined (blue) states.
- **Focused workspace chrome:** saved-view/dashboard popovers close on outside click or Escape, context menus render through a body portal, and modal dialogs own the highest interaction layer so document bars cannot appear above them. Split-view, pin, separate-window and close actions live in a tab-local right-click menu; the ellipsis was removed. Tabs are wider by default, shrink/scroll under pressure, can be pinned and can be drag-reordered within their pinned or unpinned group. Editable cells expose a restrained hover affordance.
- **Stable inline editing and personal history:** clicking inside a heading's number/content editor no longer leaks into row selection or steals focus. Outside click, Enter and Tab commit; Escape cancels without a request; Shift+Enter preserves multiline input. Empty/editable cells use a 40 px target inside 56 px minimum rows, and subtle vertical hierarchy guides clarify indentation without competing with row separators. The top workspace bar exposes per-document undo/redo with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. It keeps at most 30 commands created by the signed-in user in this client, covers cell/number/status edits, creates/templates, subtree deletion and hierarchy moves, rejects unsafe replay after a conflicting remote value/structure change, serializes rapid replay to prevent request/version races, and clears on tab close, logout or auth loss. API integration coverage verifies that undoing and redoing a test-template root removes/restores its complete subtree atomically. This is session history, not yet a persistent multi-user command journal; bulk/schema/promote-children operations are intentionally outside its safe claim.
- **Test steps, presence and adaptive menus:** test-step numbers have a nullable persisted override while retaining derived defaults; every test-step context menu can add the next sibling step. All cells except immutable ID are actionable, with linked-requirement cells opening the link-management detail surface. Presence avatars use first/last initials in nested rings. The online label opens the editor list on hover and closes after leaving the label/panel; presence profiles are always read-only while the sidebar self-profile remains editable. Context menus measure their bounds, clamp horizontally and open upward or scroll when vertical space is insufficient. Hierarchy branches can be collapsed/expanded from the row chevron, context menu or Arrow Left/Right, while search still reveals descendants. A lightweight application-wide enhancer supplies native explanatory titles to otherwise unlabeled buttons, menu actions and selects.
- **Explorer operations:** the explorer supports in-app confirmed folder deletion, moving folders without cycles and moving documents between any folder or the workspace root. The backend validates workspace ownership, uses optimistic versions/advisory locking and audits each mutation. Every document tab also has its own menu for opening that document in split view, a separate browser/native window or closing it.
- **Official semantic baselines:** document baselines now have immutable semantic identifiers. The first snapshot is `1.0`, then `1.1`, `1.2`, and so on; a human label is optional. The Baselines report foregrounds the semantic version while preserving revision-number diff URLs and historical compatibility.
- **Reference-style Word export:** the default DOCX renderer uses localized, fixed-width repeating-header tables modeled on `docs_sample.pages`. Requirement exports include ID, requirement number and document content; test exports include ID, outline content, step number, action, expected result, linked requirement numbers, test result and description. Heading numbers live in the content cell, linked requirement numbers are line-separated and rows do not split across pages. CSV/XLSX and custom DOCX-template contexts also expose stable ID, outline number and step number.
- **Production delivery:** Vite manifest-driven bundle budgets enforce at most 180 KiB gzip for every JavaScript chunk and for the initial dependency graph. The measured initial graph is about 89.3 KiB gzip and the largest lazy chunk is about 72.1 KiB gzip. The Nginx web image serves immutable hashed assets, non-cacheable HTML, SPA fallback, gzip, CSP and defensive headers. Full Compose uses required secrets, health checks, restart policies, a one-shot migration gate and a pinned MinIO release.
- **Production validation:** Prometheus HTTP/Web-Vitals metrics, a repeatable 10,000-row benchmark, WCAG A/AA axe checks, semantic landmarks and basic workflow e2e tests are wired. GitHub Actions continuously validates web/API, browser e2e and the Tauri shell on macOS, Windows and Linux; a weekly performance job records benchmark artifacts, OSV scans report dependency findings to GitHub Security, and `desktop-v*` tags create signed updater artifacts in a draft release.
- **Authentication/security:** the browser retains HTTP-only SameSite=strict cookie auth and no longer receives a JWT in login/register JSON. Desktop login can leave the server address blank or select an on-prem API root, then uses a session-scoped bearer token. Its event WebSocket token travels in a redacted subprotocol header, never a URL. Local users can enter either `admin@docsys.local` or just `admin`. Cross-site cookie mutations are rejected, login/register are rate-limited, public production registration defaults off, production requires secure cookies plus 32-character JWT/metrics secrets, OIDC URLs require one credential-free HTTPS origin, and production Swagger is disabled with Helmet CSP enabled.

**Migrations (10):** `init`, `hierarchy_prefix_indexes`, `suspect_links`, `platform_capabilities`, `test_step_result`, `requirement_numbers`, `stable_object_numbers`, `profiles_and_numbering`, `semantic_baselines`, `test_step_number_override`.

**Test status (all green as of 2026-07-16):** api **50**, worker **12**, web **32**. `pnpm verify` passes database validation, TypeScript checking, lint, forbidden-character scan, all **94** unit/integration tests and the production build with bundle budgets. The initial graph is **96.8 KiB gzip** and the largest lazy chunk remains **72.1 KiB gzip**. New coverage verifies test-template placeholders, cross-row-type cell editing, persisted step-number overrides, cancel-safe inline editing, serialized 30-command history and close cleanup, modifier-key selection, adaptive portaled context menus, tab reordering/right-click actions, hierarchy collapse, row change cues and per-tab pin/split/window actions. A local in-app browser check confirmed the ellipsis is absent, the right-click menu opens beside the selected tab, opening a modal dismisses the menu and places the modal at the application layer, presence avatars open a read-only profile, and collapsing/restoring the root hides/restores its descendants. Earlier live validation also confirmed number/content focus, cancel, undo and redo. The temporary test document used by that earlier check was soft-deleted. The existing Playwright e2e suite has **7** flows (`smoke`, `editor`, `exports`, `columns`, `traceability`, `accessibility`, `desktop-auth`) but was not rerun for this delivery. The reference requirement/test DOCX samples were not regenerated because the export renderer did not change. Tauri Rust was not rechecked because `cargo` is not installed in the active shell; GitHub's desktop matrix is the authoritative native window/capability gate. The 10,000-row benchmark previously seeded in 768.2 ms and measured a 290.8 ms outline p95 with a 4.33 MiB response, below its 2,500 ms budget.

## 4. Where we are / production-hardening work

The requested capability set has working vertical slices. Remaining work is production depth rather than missing foundations:
- Add provider-specific Jira/Azure DevOps/GitHub adapters, webhook retries and secret-vault integration; the current integration registry does not dispatch outbound work.
- Expand ReqIF round-trip fidelity for every third-party datatype, nested specification and cross-document reference.
- Add SCIM, SAML, row-grant administration UI and enterprise identity-provider conformance tests; current SSO is OIDC/PKCE.
- Add configuration merge/rebase semantics and full variant effectivity; current configurations snapshot row versions and rules.
- Add template upload/selection management screens; template storage and worker rendering already exist.
- Add antivirus/CDR quarantine and a persistent upload-completion column for attachments. Current upload completion and every download verify declared size/MIME metadata; optional SHA-256 is streamed and verified, unsafe names are normalized, and Content-Disposition is encoded safely.
- **Ops/infra:** all four server application images build successfully. The complete isolated Compose stack has been runtime-smoke-tested through its migration gate with healthy PostgreSQL, Redis, MinIO, API, collaboration, worker and web services; the web image also passes cache/security-header checks. Six workflows are active in `.github/workflows`: web/API verification, browser e2e, cross-platform desktop verification, weekly performance, dependency security and tagged desktop release. Desktop releases require updater signing secrets; trusted macOS/Windows distribution requires platform signing credentials. OpenAPI schemas are shallow (zod is the source of truth). Cookie mutations use SameSite=strict plus Origin/Fetch Metadata CSRF protection; desktop Bearer requests are exempt. `collaboration_updates` table is unused (Hocuspocus stores debounced full snapshots, 2s window; ADR 0006).
- **Security scan status:** Gitleaks found no secret in git history or the working tree. OSV found no critical/high issue after overriding ExcelJS's vulnerable `uuid` 8 transitive dependency to 11.1.1. It still reports the current Tauri Linux WebKitGTK dependency chain: 16 unmaintained-crate advisories and `RUSTSEC-2024-0429` for `glib` 0.18.5. Tauri 2.11.5 currently pins WebKitGTK 2.0/GTK 0.18, so `glib` 0.20 cannot be selected without breaking the upstream graph. DocSys does not call `glib::VariantStrIter`; keep the advisory visible in weekly OSV results and update immediately when Tauri/WebKitGTK moves to the fixed binding line.

## 5. How to run and verify locally (this machine)

**Fastest path — one command launcher (tested, works):**
```
pnpm dev            # infra/scripts/dev-up.sh — starts infra + all 4 apps + seeds an admin, prints URLs+creds
pnpm dev:down       # stops the app processes (STOP_INFRA=1 also stops docker infra)
pnpm seed           # re-create the admin account only (while the app is running)
```
The launcher auto-detects local Postgres/Redis (uses them if reachable, else `docker compose up -d`), starts MinIO via Docker if needed, runs migrations, starts api/collab/worker/web, and seeds logins. **Admin credentials: `admin@docsys.local` / `Admin1234!`** (override with `ADMIN_EMAIL`/`ADMIN_PASSWORD` env). It also idempotently creates `editor@docsys.local`, `reviewer@docsys.local` and `viewer@docsys.local`, all with password `Test1234!` (override with `DEMO_PASSWORD`), corresponding organization roles and populated test profiles. Each local account can omit `@docsys.local` at login. Windows equivalents: `infra/scripts/dev-up.ps1` / `dev-down.ps1` (Docker-based; NOT tested on Windows from here). Full per-OS guide (Turkish): `docs/CALISTIRMA.md`. Seed logic is `infra/scripts/seed-admin.mjs`.

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
pnpm verify                                                            # sequential production gate, excluding e2e
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
Dev DB URL `postgresql://docsys:docsys@localhost:5432/docsys` (also in `packages/database/.env`, gitignored). Test DB `docsys_test`. Role `docsys`/`docsys` with CREATEDB. To run a live stack manually for screenshots: build api (`cd apps/api && npx tsc`), then start `node apps/api/dist/main.js`, `npx tsx apps/collaboration/src/main.ts`, `npx tsx apps/worker/src/main.ts`, `npx vite --port 5173` — each with the env vars the playwright config uses (DATABASE_URL, REDIS_URL, JWT_SECRET=dev-secret-at-least-16-chars, S3_* for the worker). Full Compose sets `NODE_ENV=production`; it will refuse short JWT secrets, `COOKIE_SECURE=false`, or an absent/short `METRICS_TOKEN`. `ALLOW_PUBLIC_REGISTRATION` defaults false there.

50-client load test: start the collab server against `docsys_test`, then `DATABASE_URL=...docsys_test node tests/performance/collab-load.mjs`.

Large-document benchmark: start the API against `docsys_test`, then run `DATABASE_URL=...docsys_test API_URL=http://127.0.0.1:3001 pnpm --filter @docsys/performance-tests large-document`. See `docs/PERFORMANCE-ACCESSIBILITY.md`.

Desktop checks: `pnpm desktop:typecheck`; for a full local package use `pnpm desktop:build`. See `docs/DESKTOP.md` for server selection, updater secrets and platform-signing prerequisites.

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
apps/desktop        Tauri 2 shell, desktop capabilities, icons and updater configuration
packages/database   Prisma schema, migrations, generated-client re-export
packages/config     zod env schema
infra/docker        dev/full Compose; Dockerfile.{api,collaboration,worker,web}; hardened Nginx config
infra/scripts       scan-forbidden-chars.sh; dev-up/dev-down (.sh + .ps1); seed-admin.mjs
.github/workflows   web/API, browser e2e, desktop matrix, performance, OSV security and desktop release automation
docs/adr, docs/architecture   decisions — read before changing architecture
docs/DURUM-RAPORU.md          Turkish status report (proper Turkish characters)
docs/CALISTIRMA.md            Turkish per-OS run/test guide (macOS/Linux/Windows) + admin creds
docs/DOORS-PARITY.md          official-source parity matrix, safe claims and prioritized gaps
docs/guide                    editable 35-chapter guide source and deterministic DOCX builder
output/docx, output/pdf       rendered 40-page architecture, operations, security and user guide
tests/e2e           Playwright (data-testid selectors, workers:1, self-starts all 4 apps)
tests/performance   50-client Yjs load test + 10,000-row API benchmark
```

## 9. Suggested next steps

1. Deepen enterprise interoperability: full ReqIF datatype/specification round trips, provider-specific ALM adapters, webhook delivery and secrets-vault integration.
2. Deepen enterprise governance: SCIM/SAML, row-grant administration, template management, attachment scanning and configuration merge/effectivity semantics.
3. Add production signing credentials, publish the first `desktop-v*` release, verify auto-update against that release and add Windows code-signing when a certificate is available.
4. Replace remembered desktop bearer-token local storage with an operating-system credential vault/Stronghold integration before distributing the desktop build beyond trusted test machines.
5. Consider optional user-scoped tab-session restore, adjustable split ratio and three-pane layouts only if real workflows justify the added density; drag reordering is already delivered.
Whatever you pick, keep the ASCII-only + no-comments rules, add `data-testid`s for any new interactive UI, extend the relevant test suite + an e2e, run the four checks in section 5, then commit with a Conventional-Commit message and push to `main`.
