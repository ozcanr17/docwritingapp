# ADR 0007 — Hierarchy Storage Strategy

**Status:** Accepted

## Context
Folders and document rows form unlimited-depth trees; documents may hold tens of thousands of rows; moves/reorders must not rewrite whole documents; display numbers (1.1.2) derive from structure.

## Decision
Adjacency list (`parentId`, FK-enforced) as the authoritative structure, plus a maintained materialized path (`ancestorPath` of UUIDs), `depth`, and LexoRank-style `rank` strings for sibling order. Display numbers are always derived, never stored. Full rationale, SQL, and locking protocol: docs/architecture/hierarchy.md.

## Alternatives considered
- Closure table: best subtree reads but expensive moves and a second table to keep consistent.
- ltree: excellent queries but no native Prisma type, extension dependency, awkward UUID labels.
- Pure adjacency + recursive CTEs everywhere: acceptable but slower subtree scans on 20k+ row documents.
- Integer positions: rejected — insert-between rewrites siblings and thrashes optimistic versions.

## Consequences
Insert/reorder are O(1) writes; moves touch only the moved subtree; subtree queries are index-backed prefix scans; cycle prevention is a cheap ancestor check under a per-document advisory lock.

## Risks
`ancestorPath` drift from `parentId` (dual-write invariant); rank precision exhaustion.

## Mitigations
Both columns updated in one transaction under the document lock; integrity verification job; sibling-group rebalance when midpoints grow past 64 chars.
