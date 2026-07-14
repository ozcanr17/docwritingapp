# ADR 0008 — Audit and Soft-Delete Strategy

**Status:** Accepted

## Context
Enterprise requirements management demands recoverability (30-day trash), immutable history, legal hold, and provable purge.

## Decision
Per-table soft delete (`deletedAt/deletedById/deletionReason`) + append-only `audit_events` written in the same transaction as every mutation + scoped `legal_holds` + batched idempotent purge job. No separate `DeletedEntity` table: per-table columns plus audit events already index the trash, and a second table would be a drift-prone duplicate. Details: docs/architecture/soft-delete-audit.md.

## Alternatives considered
- DeletedEntity registry table: rejected (drift risk, redundant).
- DB triggers for audit: opaque, hard to attach actor/request context.
- Event sourcing: powerful but disproportionate complexity for the team size.
- Hard delete with backups: fails the 30-day self-service restore requirement.

## Consequences
Every mutation costs one extra insert; trash queries are per-entity-type; audit is queryable for history UI; purge respects holds and survives restarts.

## Risks
Audit table growth; forgotten `deletedAt IS NULL` filters leaking trash into views.

## Mitigations
Separate audit retention policy + time-based partitioning when volume demands; repository layer applies the not-deleted filter by default (opt-out only for trash/restore services).
