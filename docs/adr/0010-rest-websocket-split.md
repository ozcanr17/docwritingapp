# ADR 0010 — REST vs WebSocket Responsibility Split

**Status:** Accepted

## Context
Realtime collaboration could tempt an all-WebSocket API, but CRUD needs caching, idempotency, OpenAPI contracts, and simple authorization.

## Decision
Three channels with fixed responsibilities:
1. REST (OpenAPI): all CRUD, moves, configuration, jobs — the only channel that mutates structured data; carries versions and idempotency keys.
2. Yjs WebSocket (Hocuspocus): rich-text sync and awareness only.
3. Domain-event WebSocket (Nest gateway): server→client notifications (row created/moved/deleted, config changed, presence, job progress); clients react by patching or refetching TanStack Query caches. Never used to submit mutations.

## Alternatives considered
- Mutations over WebSocket: loses HTTP semantics (status codes, retries, idempotency middleware, OpenAPI).
- Polling instead of the event channel: fails the sub-second collaboration expectation at 50 users.
- One shared WebSocket for Yjs + events: couples unrelated lifecycles and authorization scopes.

## Consequences
Clear mental model (commands via REST, facts via events, text via CRDT); optimistic UI reconciles REST responses with event-driven invalidation; both WS channels authorize on join and re-authorize on reconnect.

## Risks
Event/REST race (event arrives before mutation response, or vice versa).

## Mitigations
Events carry entity `version`; clients ignore events older than local state and refetch on gaps.
