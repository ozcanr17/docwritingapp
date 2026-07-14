# ADR 0005 — Redis Responsibilities

**Status:** Accepted

## Context
Realtime fan-out, presence, background jobs, and caching need a fast shared substrate, but on-prem operators must never lose business data if Redis dies.

## Decision
Redis handles exactly: pub-sub fan-out of domain events across processes, ephemeral presence/awareness state, BullMQ queues, idempotency-key replay cache, short-TTL read caches, and (rarely) distributed locks. Redis is never the only copy of permanent business data.

## Alternatives considered
- Postgres LISTEN/NOTIFY for fan-out: viable fallback, but payload limits and no queue semantics.
- Kafka/NATS: operational overkill for target scale.
- In-process event bus only: blocks horizontal scaling of api/collab processes.

## Consequences
Redis outage degrades realtime UX and pauses jobs but loses nothing; single-node deployments run one Redis container with AOF enabled for queue durability.

## Risks
Accidental use of Redis as a store of record; queue loss on crash without persistence.

## Mitigations
Code-review rule + this ADR; AOF persistence on; purge/export jobs are idempotent and re-enqueueable from PostgreSQL state.
