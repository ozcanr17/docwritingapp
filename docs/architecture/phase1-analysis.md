# Phase 1 — Requirements Analysis

## Bounded contexts

| Context | Responsibility | Owns data |
|---|---|---|
| Identity and Access | Users, org/workspace/project membership, roles, permissions, OIDC boundary | users, *_members, roles, permissions, member_roles |
| Tenancy and Structure | Organizations, workspaces, projects, folder tree | organizations, workspaces, projects, folders |
| Document Authoring | Documents, templates, structured rows, detail tables, custom fields, hierarchy, numbering | documents, document_templates, document_rows, requirement/test details, custom_field_definitions |
| Traceability | Requirement-to-test links, row-to-project assignment, impact analysis | requirement_links, row_projects |
| Collaboration | Yjs persistence, presence, domain events, awareness | collaboration_snapshots, collaboration_updates; presence lives only in Redis |
| Lifecycle and Compliance | Soft delete, restore, audit, retention, legal hold, purge | audit_events, legal_holds, deletedAt columns everywhere |
| Import/Export | DOCX/CSV/XLSX/JSON/PDF jobs, export templates, attachments | export_templates, export_jobs, attachments (files in object storage) |
| Notifications | Domain-event fan-out, in-app notifications | notifications |

Each context becomes a NestJS module in Phase 2. No context reaches into another context's tables directly; access goes through that context's service layer.

## Data ownership boundaries

- PostgreSQL is authoritative for all business metadata and structured content.
- Redis holds only ephemeral state: presence, pub-sub fan-out, locks, queues, short-lived cache. Loss of Redis loses no business data.
- Object storage (MinIO/S3) holds binary payloads: DOCX templates, attachments, generated exports, large revision snapshots. PostgreSQL keeps the metadata and the `storageKey` pointer.
- Yjs document state is authoritative in the CRDT update log (collaboration_updates + collaboration_snapshots in PostgreSQL); in-memory Hocuspocus state is a cache of it.

## Critical concurrency risks

1. Two users move/reorder the same row or overlapping subtrees — mitigated by per-document advisory locks plus rank-based ordering (see hierarchy doc).
2. Stale structured-field update overwriting newer state — mitigated by `version` optimistic concurrency, HTTP 409 on mismatch.
3. Move creating a cycle (A under B while B is moved under A) — mitigated by ancestor check inside the same transaction that holds the document lock.
4. Yjs snapshot compaction racing live updates — mitigated by sequence-numbered updates; compaction only removes updates with sequence <= snapshot sequence.
5. Purge job racing a restore — purge re-checks `deletedAt` and legal holds row-by-row inside its batch transaction.
6. Duplicate create/move on network retry — idempotency keys on commands.

## Major security risks

- Cross-tenant data leakage: every tenant table carries `organizationId`; every query filters by it; authorization resolves membership server-side, never trusting client-sent tenant IDs.
- Unauthorized Yjs room join: Hocuspocus `onAuthenticate` validates the session token and document-level permission before sync starts.
- DOCX template injection (docxtemplater executes template expressions): templates are admin-only uploads, rendered with a restricted parser, in the worker process.
- Upload abuse: content-type and size validation, signed URLs, virus-scan extension point.
- Audit tampering: audit_events has no update/delete path in application code; DB user for the app gets INSERT/SELECT only on that table in production.

## Scaling assumptions

- Up to ~50 concurrent collaborators per document; hundreds of concurrent users per deployment.
- Documents up to ~50,000 rows; tree branches lazy-loaded; grid virtualized.
- Single-node Docker Compose covers initial on-prem installs; the API, collaboration server, and worker are separate processes from day one so they can scale horizontally later (Redis pub-sub already decouples them).
- PostgreSQL full-text search is adequate for the initial corpus sizes.

## Explicit assumptions

- Product name for the codebase: `docsys` (v2 rewrite; the previous Python/Next.js prototype in `workspace/docsys` remains untouched as reference).
- One PostgreSQL database per deployment (schema-level multi-tenancy via organizationId columns, not database-per-tenant).
- Initial deployments are intranet-hosted; internet-facing hardening (WAF, etc.) is the operator's responsibility beyond the documented headers/rate limits.
- `gen_random_uuid()` (built into PostgreSQL 13+) generates UUIDs at the database.
- Custom field values live in `document_rows.customFields` JSONB validated against `custom_field_definitions` (see ADR and schema notes) instead of a CustomFieldValue EAV table.
- Node.js 22 LTS is the deployment target; the dev machine runs Node 25, which is compatible.

## Unresolved questions (non-blocking)

1. Which OIDC provider will enterprises use (Keycloak, Azure AD, other)? Architecture is provider-agnostic; local dev provider ships first.
2. Are per-row baselines/versioned document snapshots (DOORS "baseline" feature) required beyond DocumentRevision? Current model supports adding it.
3. Exact retention period for audit events (schema supports any policy; default proposal: 2 years).
4. Whether requirement numbering must ever be frozen (DOORS-style absolute numbers) in addition to derived display numbers. `displayNumber` is derived now; a frozen `absoluteNumber` sequence per document can be added without migration pain.
5. Expected total organization count per deployment (affects whether org rail UI is needed early).
