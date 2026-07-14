# Concurrency Strategy

## Data authority map

| Data | Authority | Notes |
|---|---|---|
| Business metadata, rows, links, custom fields | PostgreSQL | Optimistic concurrency via `version` |
| Rich-text content | Yjs CRDT | Persisted as updates + snapshots in PostgreSQL |
| Presence, cursors, awareness | Redis (ephemeral) | Never persisted |
| Queues (exports, purge) | Redis via BullMQ | Jobs re-enqueueable; results in PostgreSQL/S3 |
| Short-lived caches (tree fragments, permissions) | Redis | TTL-bound, invalidated on domain events |
| Binary files | Object storage | Metadata in PostgreSQL |

## Rich text (Yjs)

- Tiptap binds to a Y.Doc per document (rich-text cells map to subdocuments/fragments keyed by `richTextRef`).
- Hocuspocus server authorizes the join (`onAuthenticate` → session + document permission), then merges updates conflict-free. No last-write-wins.
- Persistence: every incoming update is appended to `collaboration_updates` with a monotonic per-document `sequence` (allocated by PostgreSQL). Debounced store batches writes.
- Snapshotting: after N updates (default 500) or T minutes (default 10), the worker writes the encoded Y.Doc state to `collaboration_snapshots` and deletes updates with `sequence <= snapshot.sequence`.
- Load procedure: latest snapshot + all later updates, applied in sequence order.
- Crash recovery: identical to load — the update log guarantees no acknowledged edit is lost; at most the debounce window (default <= 2s) of unacknowledged edits is at risk, which clients still hold locally and re-send on reconnect.
- Reconnect/offline: y-protocols sync exchanges state vectors; offline edits merge via CRDT semantics on reconnect.
- Retention: updates older than the latest snapshot are compacted; snapshots keep the last K (default 5) for point-in-time recovery.

## Structured fields

- Every mutable row/document/config entity carries `version Int`.
- Update commands send `expectedVersion`; the UPDATE includes `WHERE version = expectedVersion`; zero rows affected → HTTP 409 with the current server state so the client can merge or prompt.
- The client never silently overwrites: on 409, TanStack Query rolls back the optimistic patch and surfaces a conflict resolution.

## Row ordering and moves

- Serialized per document with `pg_advisory_xact_lock(hash(documentId))` inside the transaction (see hierarchy doc). Rank strings make reorders single-row writes, so the lock is held briefly.
- Concurrent moves on different documents never contend.

## Document-level configuration

- Column config, template binding, numbering style live on `documents` with the same `version` mechanism; changes are broadcast on the domain event channel so open clients refetch.

## Transactions and isolation

- Default isolation: READ COMMITTED; correctness comes from explicit `FOR UPDATE` row locks, the version predicate, and advisory locks — not from serializable isolation (avoids retry storms).
- Multi-entity mutations (row + detail + audit event) always share one transaction. Audit insert is inside the same transaction as the change it records.

## Idempotency and retries

- Create/move/duplicate commands carry a client-generated `Idempotency-Key`; the API stores key → result (Redis with 24h TTL, plus unique `idempotencyKey` on export_jobs) and replays the stored response on retry.
- Clients auto-retry only idempotent or keyed commands; plain field updates retry only after refetching the current version.

## Failure modes

- WebSocket reconnect: exponential backoff, resubscribe to rooms, Yjs re-syncs via state vectors, domain-event channel replays missed events by refetching affected queries (event payloads carry entity versions).
- Redis outage: API keeps serving CRUD (PostgreSQL untouched); collaboration degrades — presence disappears, cross-node fan-out pauses, BullMQ jobs queue up on recovery. Single-node deployments keep in-process Yjs sync working. No business data is lost by design.
- Collaboration server crash: clients reconnect to a fresh instance which reloads snapshot + update log.
