# ADR 0001 — Modular Monolith

**Status:** Accepted

## Context
Small-to-medium team building a DOORS-class system: many cohesive domains (tenancy, authoring, traceability, collaboration, lifecycle) with heavy cross-domain transactions (row + detail + audit in one commit).

## Decision
One NestJS application composed of strictly bounded modules. Three deployable processes share the codebase: api, collaboration, worker. They are processes, not independently owned services.

## Alternatives considered
- Microservices per domain: rejected — no scaling evidence, would force distributed transactions for audit/soft-delete invariants, triples ops burden for on-prem customers.
- Single monolithic process (API + Yjs + jobs in one): rejected — collaboration and export workloads have different lifecycles and memory profiles.

## Consequences
Single database transaction scope keeps audit/versioning invariants simple; one deploy artifact per process; module boundaries enforced by NestJS DI and lint rules prepare a later extraction if ever needed.

## Risks
Boundary erosion (modules importing each other's repositories).

## Mitigations
Modules expose services only; repositories are module-private; dependency-cruiser rule added in Phase 2 CI.
