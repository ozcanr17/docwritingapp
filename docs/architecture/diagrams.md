# System Diagrams

## 1. System context

```mermaid
flowchart LR
  user[Engineer or Reviewer\nBrowser on Win Linux macOS]
  oidc[Enterprise OIDC Provider]
  sys[ReqTrack System]
  user -->|HTTPS + WSS| sys
  sys -->|OIDC auth code flow| oidc
```

## 2. Container architecture

```mermaid
flowchart TB
  browser[React SPA\nVite build served via proxy]
  proxy[Traefik or Nginx\nTLS termination]
  api[API Server\nNestJS + Fastify\nREST + domain WebSocket]
  collab[Collaboration Server\nHocuspocus + Yjs]
  worker[Worker\nBullMQ consumers]
  pg[(PostgreSQL 16)]
  redis[(Redis 7)]
  s3[(MinIO or S3)]

  browser --> proxy
  proxy -->|/api| api
  proxy -->|/collab ws| collab
  api --> pg
  api --> redis
  api --> s3
  collab --> pg
  collab --> redis
  worker --> pg
  worker --> redis
  worker --> s3
```

## 3. Main backend modules

```mermaid
flowchart TB
  subgraph apiApp[NestJS Modular Monolith]
    authMod[AuthModule\nOIDC + local dev provider]
    accessMod[AccessControlModule\nRBAC guards]
    tenancyMod[TenancyModule\norgs workspaces projects]
    treeMod[TreeModule\nfolders documents]
    rowMod[DocumentRowModule\nrows details custom fields]
    linkMod[TraceabilityModule\nrequirement links row projects]
    collabMod[CollaborationGatewayModule\npresence domain events]
    auditMod[AuditModule\ntransactional audit writer]
    trashMod[LifecycleModule\nsoft delete restore purge]
    exportMod[ExportModule\njobs templates]
    notifMod[NotificationModule]
    searchMod[SearchModule\npg full text]
  end
  authMod --> accessMod
  accessMod --> tenancyMod
  treeMod --> auditMod
  rowMod --> auditMod
  trashMod --> auditMod
  rowMod --> linkMod
  exportMod --> notifMod
  rowMod --> searchMod
```

## 4. Realtime collaboration flow

```mermaid
sequenceDiagram
  participant clientA as Client A
  participant clientB as Client B
  participant collab as Hocuspocus Server
  participant apiSrv as API Server
  participant redisBus as Redis PubSub
  participant pgDb as PostgreSQL

  clientA->>collab: WS connect + token + docId
  collab->>apiSrv: verify session and doc permission
  apiSrv-->>collab: allow
  collab->>pgDb: load snapshot + updates
  collab-->>clientA: initial sync (state vector exchange)
  clientA->>collab: Yjs update (rich text)
  collab->>pgDb: append collaboration_update (debounced)
  collab-->>clientB: broadcast update
  clientA->>apiSrv: REST mutation (row move)
  apiSrv->>pgDb: transactional move + audit
  apiSrv->>redisBus: publish domain event
  redisBus-->>collab: fan out
  collab-->>clientB: row.moved event
```

## 5. Document edit sequence (structured field)

```mermaid
sequenceDiagram
  participant ui as Grid UI
  participant query as TanStack Query
  participant apiSrv as API
  participant pgDb as PostgreSQL

  ui->>query: edit cell (optimistic patch)
  query->>apiSrv: PATCH row {value, expectedVersion, idempotencyKey}
  apiSrv->>pgDb: UPDATE ... WHERE id=$1 AND version=$2
  alt version matched
    pgDb-->>apiSrv: 1 row + audit insert (same tx)
    apiSrv-->>query: 200 {row, version+1}
    query-->>ui: reconcile
  else stale version
    pgDb-->>apiSrv: 0 rows
    apiSrv-->>query: 409 {currentRow}
    query-->>ui: rollback + conflict prompt
  end
```

## 6. Soft delete and purge flow

```mermaid
flowchart TB
  del[User deletes subtree] --> mark[Tx: set deletedAt on subtree\n+ audit event with correlationId]
  mark --> trash[Visible in Trash for 30d]
  trash -->|restore| restore[Tx: clear deletedAt\nreparent if needed + audit]
  trash -->|retention expired| purgeJob[Daily purge job BullMQ]
  purgeJob --> holdCheck{Legal hold active?}
  holdCheck -->|yes| skip[Skip entity]
  holdCheck -->|no| batch[Batched tx: hard delete\nchildren first + purge audit]
  batch --> objDel[Delete object storage files\nretryable orphan list]
```

## 7. Deployment topology (single node on-prem)

```mermaid
flowchart TB
  subgraph host[Docker Host]
    rp[Traefik]
    webC[web static]
    apiC[api]
    collabC[collaboration]
    workerC[worker]
    pgC[(postgres volume)]
    redisC[(redis volume)]
    minioC[(minio volume)]
  end
  lan[Company LAN] --> rp
  rp --> webC
  rp --> apiC
  rp --> collabC
  apiC --> pgC
  apiC --> redisC
  apiC --> minioC
  collabC --> pgC
  collabC --> redisC
  workerC --> pgC
  workerC --> redisC
  workerC --> minioC
```
