# Database Design Notes

Companion to `packages/database/prisma/schema.prisma`. Records deviations from the suggested model list and non-obvious decisions.

## Deviations from the suggested models (and why)

- **CustomFieldValue → JSONB on `document_rows.customFields`.** A value table would be an EAV store: every grid read would join/pivot thousands of value rows. Instead, values live in one JSONB object per row, keyed by `fieldKey`, validated at write time against `custom_field_definitions` (types, allowedValues, isRequired). Definitions remain fully relational, so admin UX, ordering, and search configuration are structured. GIN indexes on `customFields` are added per-deployment only when searchable fields justify them (documented, not premature).
- **DeletedEntity → omitted.** Per-table `deletedAt/deletedById/deletionReason` plus append-only `audit_events` already provide trash listing and restore metadata; a registry table would duplicate state and drift. See ADR 0008.
- **Role → single table with `scopeType` on MemberRole.** Roles are rows (seedable system roles: system_admin, organization_admin, workspace_admin, project_manager, editor, reviewer, viewer) rather than an enum, so custom org-level roles arrive later without migration. `MemberRole.scopeType` + nullable `workspaceId/projectId` express the assignment scope. Caveat: PostgreSQL treats NULLs as distinct in unique constraints, so the composite unique on member_roles does not deduplicate rows with NULL scope columns by itself; Phase 2 adds partial unique indexes (`WHERE workspace_id IS NULL AND project_id IS NULL`, etc.) in migration SQL, and the service layer enforces upsert semantics meanwhile.
- **DocumentRow detail tables.** `requirement_details`, `test_case_details`, `test_step_details` are 1:1 extensions keyed by `rowId` instead of nullable columns on the row table — keeps the hot row table narrow for grid scans while giving typed homes to type-specific fields. `RequirementLink` and `RowProject` are explicit relational tables per the requirement (never JSON).
- **DocumentRevision stores `snapshotKey`** (object storage pointer) rather than inline JSON — large document snapshots don't belong in row storage (ADR 0009).
- **`displayNumber` is not a column.** Derived from rank order (hierarchy doc); storing it would force subtree-wide writes on reorder.

## Conventions applied throughout

- UUID PKs via `gen_random_uuid()` (PostgreSQL 13+ built-in, no extension needed).
- `Timestamptz(6)` everywhere; UTC internally.
- `onDelete: Restrict` on business-critical FKs — hard deletes are only performed by the purge job in explicit child-first order; nothing cascades silently. `SetNull` only for advisory pointers (template's export template, test assignee). `Cascade` only on pure join rows of non-business config (role_permissions).
- `version Int` on every entity mutated through optimistic concurrency (rows, documents, folders, templates, field definitions).
- Tenant boundary: `organizationId` on every tenant-owned table (including child tables like rows and links, so tenant-scoped queries and purge never need joins to establish ownership); `workspaceId` where the entity lives in a workspace.
- Audit fields: `createdById/updatedById` where actor attribution matters; `deletedAt/deletedById` (+ `deletionReason` on user-facing deletions).

## Index strategy (initial)

- Children-in-order: `(documentId, parentId, deletedAt, rank)` and folder equivalent.
- Subtree scans: `(documentId, ancestorPath)` — migration SQL upgrades this to `text_pattern_ops`.
- Audit lookups: `(organizationId, createdAt)`, `(entityType, entityId, createdAt)`, `(documentId, createdAt)`, `(correlationId)`.
- Trash/purge scans ride the `deletedAt`-bearing composite indexes.
- Full-text search: Phase 2 migration adds generated `tsvector` columns + GIN on documents and document_rows (Prisma cannot declare these; raw SQL in migrations).
- JSONB GIN on `customFields`: deferred until a deployment enables searchable custom fields.
