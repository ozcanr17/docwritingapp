# Hierarchy Storage Strategy

Applies to both `folders` and `document_rows`.

## Comparison

| Strategy | Subtree read | Children read | Move | Reorder | Integrity | Notes |
|---|---|---|---|---|---|---|
| Adjacency list | Recursive CTE (slower on deep trees) | Excellent | Excellent (1 row) | Needs order column | FK-enforced | Simple, safe |
| Closure table | Excellent | Excellent | Expensive (rewrite paths) | Separate concern | Extra table to maintain | High write cost on move |
| Materialized path | Excellent (prefix scan) | Good | Update subtree paths | Separate concern | Not FK-enforced | Path column must be maintained |
| PostgreSQL ltree | Excellent (GiST) | Good | Update subtree paths | Separate concern | Extension dependency; Prisma has no native ltree type | Label length limits, ASCII labels |

## Decision

Hybrid: **adjacency list (authoritative) + materialized path (derived, for subtree queries) + lexicographic rank strings (sibling order) + derived display numbers**.

- `parentId` — authoritative parent pointer, FK-enforced, cycle-checked.
- `ancestorPath` — text column: `/`-joined ancestor UUIDs (e.g. `a1.../b2.../`), maintained in the same transaction as any move. Indexed with `text_pattern_ops` for `LIKE 'prefix%'` subtree scans. ltree was rejected because Prisma cannot model it natively and UUID labels exceed comfortable ltree label ergonomics; the column can be migrated to ltree later without changing the API.
- `rank` — LexoRank-style base-36 string. Inserting between siblings computes a midpoint string; no neighbor rows are rewritten. Occasional rebalancing of one sibling group runs when midpoints exhaust precision.
- `depth` — maintained integer, used for indent/outdent validation and display.
- `displayNumber` (1.2.3) — never stored; derived per request from sibling rank order via a recursive CTE (or computed client-side for loaded branches). Reordering therefore never rewrites numbers.

## Operations

Subtree read:

```sql
SELECT * FROM document_rows
WHERE document_id = $1
  AND deleted_at IS NULL
  AND (id = $2 OR ancestor_path LIKE $3 || '%')
ORDER BY depth, rank;
```

Direct children (lazy tree loading):

```sql
SELECT * FROM document_rows
WHERE document_id = $1 AND parent_id = $2 AND deleted_at IS NULL
ORDER BY rank
LIMIT $3 OFFSET $4;
```

Insert between siblings: `rank = midpoint(prevSibling.rank, nextSibling.rank)`; single INSERT, no sibling updates.

Move (transactional pseudocode):

```
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(document_id::text, 0));
row      = SELECT ... FROM document_rows WHERE id = $rowId FOR UPDATE;
IF row.version != $expectedVersion THEN ROLLBACK; RETURN 409;
newParent = SELECT ... WHERE id = $newParentId FOR UPDATE;
IF newParent.id = row.id
   OR newParent.ancestor_path LIKE row_subtree_prefix || '%'
THEN ROLLBACK; RETURN 422 (cycle);
newRank  = midpoint(rank of requested neighbors under newParent);
UPDATE document_rows SET parent_id, rank = newRank,
  ancestor_path = newParent.ancestor_path || newParent.id || '/',
  depth = newParent.depth + 1,
  version = version + 1, updated_at = now(), updated_by = $actor
WHERE id = row.id;
UPDATE document_rows SET
  ancestor_path = replace_prefix(ancestor_path, oldPrefix, newPrefix),
  depth = depth + $depthDelta
WHERE document_id = $doc AND ancestor_path LIKE oldPrefix || '%';
INSERT INTO audit_events (...);
COMMIT;
```

Only the moved subtree's rows are touched; siblings and the rest of the document are untouched, so display numbers for unaffected branches never churn. The per-document advisory lock serializes concurrent structural mutations (move/indent/outdent/reorder) on the same document — acceptable because structural ops are rare relative to edits, and the lock is transaction-scoped.

Reorder within same parent: same lock, single-row UPDATE of `rank` + version bump.

Cycle prevention: the target-parent ancestor check above, executed under the document lock, makes cycles impossible; a periodic integrity job can additionally verify `ancestor_path` consistency.

Delete and restore: see soft-delete doc; the subtree is selected by the same `ancestor_path LIKE` prefix.

## Indexes

- `(document_id, parent_id, deleted_at, rank)` — children listing in display order.
- `(document_id, ancestor_path)` — subtree scans (migration adds `text_pattern_ops` via raw SQL).
- Folders mirror the same pair on `workspace_id`.

## Large-document behavior

- Children are paginated; the grid loads branches incrementally and virtualizes rendering.
- Display numbers for the visible window are computed from loaded sibling ranks; a full-document numbering pass (exports) uses one recursive CTE ordered by rank.
- Rank strings keep reorders O(1); a background rebalance normalizes a sibling group when a midpoint would exceed 64 chars.
