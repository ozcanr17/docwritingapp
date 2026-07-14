# ADR 0002 — pnpm + Turborepo Monorepo

**Status:** Accepted

## Context
Frontend, backend, collaboration server, worker, and shared contracts must evolve together; type drift between API and SPA is the main integration risk.

## Decision
Single TypeScript monorepo using pnpm workspaces and Turborepo, with shared packages: database, contracts, validation, config, domain, ui, auth, observability, testing.

## Alternatives considered
- Separate repos: rejected — contract drift, painful atomic changes.
- Nx: viable, heavier; Turborepo's task graph is sufficient.
- npm/yarn workspaces without a task runner: slower CI, no caching.

## Consequences
Zod schemas and API types are shared end-to-end; one lockfile; cached task pipeline.

## Risks
Workspace dependency tangles; slow cold installs on CI.

## Mitigations
Explicit package boundaries (no `packages/utils` dumping ground); Turborepo remote cache optional later.
