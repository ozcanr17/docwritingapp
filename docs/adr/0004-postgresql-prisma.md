# ADR 0004 — PostgreSQL + Prisma

**Status:** Accepted

## Context
Hierarchical documents, JSONB custom fields, full-text search, transactional audit, and on-prem operability all point to a single relational store.

## Decision
PostgreSQL 16 as the sole authoritative store; Prisma ORM for schema, migrations, and typed data access; raw SQL escape hatch (`$queryRaw`) for recursive CTEs, advisory locks, `text_pattern_ops` indexes, and FTS.

## Alternatives considered
- MySQL: weaker JSONB/FTS/CTE ergonomics, no advisory xact locks equivalent.
- Drizzle/Kysely: closer to SQL but weaker migration story for a schema this size; team velocity favors Prisma.
- TypeORM: maintenance and type-safety concerns.

## Consequences
Typed client shared via `@reqtrack/database`; migrations versioned in-repo; Postgres-specific features are embraced (gen_random_uuid, GIN, tsvector, advisory locks).

## Risks
Prisma cannot express some Postgres features (partial indexes, text_pattern_ops, ltree, tsvector columns) declaratively.

## Mitigations
Customized migration SQL committed alongside Prisma migrations; features documented in docs/architecture.
