# ADR 0012 — Shared Web and Desktop Distribution

**Status:** Accepted

## Context
DocSys must remain easy to deploy from a browser while also providing managed desktop packages for Windows, macOS and Linux. Corporate desktop clients must be able to select an on-premise server without rebuilding the application.

## Decision
React and Vite remain the single frontend implementation. The browser build is served by the web container, while Tauri 2 packages the same build with the operating system webview. The desktop login screen accepts an optional API base URL and discovers the collaboration URL from the selected API. Desktop authentication uses a bearer token kept in session storage; the browser retains the HTTP-only cookie flow.

Desktop packages are generated per operating system. Tauri updater artifacts use a dedicated signing key and GitHub Releases provides the update manifest and binaries. Operating-system signing and notarization remain separate release credentials.

## Consequences
- Feature behavior stays aligned between web and desktop.
- The desktop shell remains small compared with bundling Chromium.
- Corporate deployments can point one binary at different DocSys servers.
- API CORS and CSP must support Tauri origins and the configured HTTP, HTTPS, WebSocket and secure WebSocket endpoints.
- Browser SSO callbacks are not exposed in the desktop shell until deep-link handling is designed; local username/password login remains available.

## Verification
Pull requests validate the shared web build and Rust desktop shell on Windows, macOS and Linux. Tagged desktop releases build updater artifacts and create a draft GitHub release.
