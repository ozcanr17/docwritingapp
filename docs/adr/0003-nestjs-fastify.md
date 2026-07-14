# ADR 0003 — NestJS with Fastify Adapter

**Status:** Accepted

## Context
The API needs modules, guards (RBAC + tenant checks on every route), validation pipes, WebSocket gateways, scheduled/queued jobs, OpenAPI, and interceptor-based audit — with long-term maintainability by a small team.

## Decision
NestJS on the Fastify adapter for the API process. REST for CRUD, Nest gateways for the domain event channel, standalone Hocuspocus for Yjs.

## Alternatives considered
- Raw Express/Fastify: rejected — guards, DI, and module structure would be reinvented ad hoc.
- Hono/tRPC: attractive DX but weaker fit for guard/interceptor-heavy enterprise middleware and OpenAPI-first contracts.

## Consequences
Fastify gives measurably higher throughput than Express under Nest; Nest DI enables service/repository boundaries and testable modules.

## Risks
Fastify-adapter ecosystem gaps for some Nest middleware; Nest abstraction overhead for trivial endpoints.

## Mitigations
Stick to Fastify-native plugins (helmet, rate-limit, multipart); keep controllers thin.
