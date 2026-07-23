# DocSys v0.1.7 — Restricted Windows portable release

This release targets offline Windows computers where `%LOCALAPPDATA%`, `LocalLow`, temporary profile directories or administrative installation are unavailable.

## Improvements

- Automatically verifies candidate storage locations with real create, write, flush, rename and delete operations.
- Falls back to a `DocSysData` directory beside the EXE files when the user profile is unavailable or read-only.
- Redirects the embedded PostgreSQL, Redis, MinIO and Node profile and temporary directories into the selected DocSys data root.
- Adds stage-specific `DS-SRV-*` and `DS-CLI-*` error codes covering storage, extraction, ports, infrastructure, migrations, applications, seed data, local UI hosting and browser launch.
- Writes complete startup progress to `logs\launcher.log` and the current stage to `logs\startup-status.json`.
- Adds client diagnostics to `logs\client.log`.
- Shows the selected data path and a visible portable-folder warning in the server manager.
- Recognizes both `DocSys Server.exe` and GitHub's normalized `DocSys.Server.exe` filename.
- Fixes release-version checks on Windows CRLF worktrees.

## Usage

Extract the complete ZIP into a writable folder. Start `DocSys Server.exe`, wait for the manager to report healthy services, then start `DocSys.exe`. No installer, Docker, external runtime, terminal or administrator access is required.
