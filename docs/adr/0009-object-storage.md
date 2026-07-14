# ADR 0009 — Object Storage Strategy

**Status:** Accepted

## Context
Attachments, DOCX export templates, generated exports, and large revision snapshots are binary payloads; storing them in PostgreSQL bloats the database and backups.

## Decision
S3-compatible object storage for all binaries — MinIO for local/on-prem, any S3 API in cloud. PostgreSQL keeps metadata rows (`storageKey`, contentType, size, checksum). Downloads use short-lived signed URLs; uploads validated server-side. DOCX templates are never stored as DB blobs.

## Alternatives considered
- bytea columns in PostgreSQL: simple but destroys backup/restore times and VACUUM behavior at scale.
- Filesystem volume: no signing, awkward multi-node scaling, weaker cloud parity.

## Consequences
One storage API across deployment targets; purge must coordinate DB rows and objects (orphan-list retry handles partial failures); backup docs cover the bucket separately.

## Risks
DB/object drift (metadata without object or vice versa); MinIO operations knowledge on-prem.

## Mitigations
Write object first, commit metadata second on upload; purge deletes metadata first, objects after commit with retry; periodic orphan sweep job; MinIO runs in the same compose file with a named volume.
