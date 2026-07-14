# Soft Delete, Audit, and Retention Strategy

## Deletion

- Business entities are never hard-deleted by user actions. Deletion sets `deletedAt`, `deletedBy`, optional `deletionReason`.
- Deleting a folder/row marks the entire subtree in one transaction, using the `ancestorPath` prefix; every affected row gets the same `deletedAt` timestamp and a shared `correlationId` in the audit event so the operation is restorable as a unit.
- Deleting a requirement soft-deletes its `requirement_links` (link rows get `deletedAt`); linked tests receive a `linked_test_impacted` domain event.
- Default reads always filter `deletedAt IS NULL`; trash views filter `deletedAt IS NOT NULL` per entity type (this replaces a separate `DeletedEntity` table — the audit event plus per-table `deletedAt` columns already provide the trash index, avoiding a second source of truth that could drift).

## Restore

- Restore clears `deletedAt/deletedBy` for the subtree selected by the original operation's `correlationId` (exact inverse), or by subtree prefix when restoring a branch.
- If the original parent was itself deleted and not restored, the entity re-parents to the nearest surviving ancestor (or workspace root) and the audit event records the relocation.
- Links are restored only when both endpoints are alive again; otherwise they stay deleted and are listed in the restore report.
- Restore emits `restore_completed` notification and its own audit event.

## Audit

- `audit_events` is append-only: the application has no update/delete code path; the production DB role gets only INSERT and SELECT on the table.
- Every mutating service call writes the event inside the same transaction: `action`, `entityType/entityId`, `previousData`/`nextData` JSONB diffs, `requestId`, `correlationId`, `ipAddress`, `userAgent`.
- Audit retention is configured separately from trash retention (proposed default 2 years); the audit purge only trims `previousData/nextData` payload age, never rows inside legal hold scope.

## Retention and purge

- Trash retention: 30 days minimum (configurable per organization in `organizations.settings`).
- A scheduled BullMQ job (daily) permanently purges rows where `deletedAt < now() - retention`:
  1. Select candidate batch (default 500 rows) ordered by `deletedAt`, skipping any entity covered by an active `legal_holds` row at any scope level (organization, workspace, project, document).
  2. In one transaction per batch: delete children-before-parents (FKs are `Restrict`, which guarantees ordering bugs fail loudly instead of cascading silently), write one purge audit event per entity (audit survives the purge — it is the durable record of what existed).
  3. Collect `storageKey`s of purged attachments/exports; delete the objects after the DB commit; object deletion failures are retried by a follow-up job keyed on an orphan list (object storage deletion is idempotent).
- The job is idempotent and restartable: re-running selects whatever still matches the predicate; partially purged batches simply shrink.
- Batching plus `SKIP LOCKED` on candidate selection avoids long locks on hot tables.

## Legal hold

- `legal_holds` rows scope to organization, workspace, project, or document. An active (unreleased) hold excludes every entity under that scope from purge — checked per batch, not cached.
- Releasing a hold (releasedAt/releasedById) re-exposes entities to the normal retention clock.

## What survives permanent purge

- Audit events (including the purge events themselves, with entity metadata but with large content payloads optionally trimmed by audit retention policy).
- Nothing else: rows, detail records, links, JSONB values, and object-storage binaries are gone.
