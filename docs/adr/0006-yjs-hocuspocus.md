# ADR 0006 — Yjs + Hocuspocus for Collaborative Text

**Status:** Accepted

## Context
Up to 50 concurrent editors per document; rich-text conflicts must merge without data loss; last-write-wins is explicitly forbidden.

## Decision
Yjs CRDT for rich-text content and text-cell collaboration, served by a Hocuspocus server process; Tiptap as the editor binding. Structured non-text fields stay on REST + optimistic versioning (ADR scope split in 0010).

## Alternatives considered
- Operational Transform (ShareDB): central-server OT is harder to scale and reason about offline merges.
- Automerge: heavier documents, smaller editor ecosystem.
- Row-level locking only: rejected as primary mechanism — poor UX for prose.

## Consequences
Offline edits merge automatically; awareness (cursors) comes free; persistence pipeline (update log + snapshots in PostgreSQL) defined in concurrency doc; hooks (`onAuthenticate`, `onStoreDocument`) give authorization and persistence points.

## Risks
Y.Doc memory growth on huge documents; update-log growth; a second server process to operate.

## Mitigations
Rich text is per-cell/per-section fragments, not one giant Y.Doc per document; scheduled snapshot compaction; collaboration process shares repo, images, and compose file.
