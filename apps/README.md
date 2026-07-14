# apps

Deployable processes (all share the modular-monolith codebase; see ADR 0001):

- `web` — React SPA (Vite). Phase 3.
- `api` — NestJS + Fastify REST API and domain-event WebSocket gateway. Phase 2.
- `collaboration` — Hocuspocus/Yjs sync server. Phase 2.
- `worker` — BullMQ consumers: exports, purge, snapshot compaction. Phase 2.

Directories are intentionally empty in Phase 1; no feature code is generated before its phase.
