# ADR 0011 — Browser-First Cross-Platform Strategy

**Status:** Accepted

## Context
Users are on Windows, Linux, and macOS; DOORS-class tools historically suffered from thick-client distribution pain. On-prem installs must be trivial.

## Decision
One responsive SPA (React + Vite) served over HTTPS is the product for all three OSes. The server stack ships as Docker Compose. No native clients. Frontend avoids browser-exclusive APIs so an optional Tauri wrapper stays possible later (not in Phases 1–4).

## Alternatives considered
- Electron/Tauri apps per OS now: triples release surface, no requirement demands local OS integration.
- PWA offline-first: full offline authoring is out of scope; Yjs already smooths short disconnects.

## Consequences
Single deploy artifact for UI; updates are instant for all users; browsers define the compatibility matrix (evergreen Chrome/Edge/Firefox/Safari).

## Risks
Corporate environments with outdated browsers; heavy grids straining low-end machines.

## Mitigations
Document minimum browser versions; virtualization keeps DOM small; compact density mode; read-only degradation below 1024 px.
