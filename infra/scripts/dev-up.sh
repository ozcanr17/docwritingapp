#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export LC_ALL=C

export DATABASE_URL="${DATABASE_URL:-postgresql://docsys:docsys@localhost:5432/docsys}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-at-least-16-chars}"
export APP_BASE_URL="${APP_BASE_URL:-http://localhost:5173}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:5173}"
export S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"
export S3_REGION="${S3_REGION:-us-east-1}"
export S3_BUCKET="${S3_BUCKET:-docsys}"
export S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
export S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
export COLLAB_PORT="${COLLAB_PORT:-3002}"
export WORKER_HEALTH_PORT="${WORKER_HEALTH_PORT:-3003}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"

LOG_DIR="$ROOT/.dev-logs"
PID_FILE="$ROOT/.dev-pids"
mkdir -p "$LOG_DIR"
: > "$PID_FILE"

COMPOSE_FILE="$ROOT/infra/docker/docker-compose.dev.yml"

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && exec 3>&- 2>/dev/null
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

start_service() {
  local name="$1"
  local dir="$2"
  shift 2
  ( cd "$ROOT/$dir" && nohup "$@" >"$LOG_DIR/$name.log" 2>&1 & echo $! >>"$PID_FILE" )
  echo "  started $name (logs: .dev-logs/$name.log)"
}

wait_for_url() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "  WARNING: $label did not respond at $url"
  return 1
}

echo "==> DocSys dev launcher"

echo "==> Checking infrastructure (PostgreSQL, Redis, MinIO)"
DOCKER_SERVICES=""
port_open 5432 || DOCKER_SERVICES="$DOCKER_SERVICES postgres"
port_open 6379 || DOCKER_SERVICES="$DOCKER_SERVICES redis"
curl -sf "$S3_ENDPOINT/minio/health/live" >/dev/null 2>&1 || DOCKER_SERVICES="$DOCKER_SERVICES minio"

if [ -n "$DOCKER_SERVICES" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "  ERROR: these services are not running and Docker is unavailable:$DOCKER_SERVICES"
    echo "  Start Docker (or Colima), or start PostgreSQL/Redis/MinIO yourself, then re-run."
    exit 1
  fi
  echo "  starting via docker compose:$DOCKER_SERVICES"
  compose -f "$COMPOSE_FILE" up -d $DOCKER_SERVICES
else
  echo "  using existing local PostgreSQL, Redis and MinIO"
fi

echo "==> Waiting for PostgreSQL"
for _ in $(seq 1 60); do
  port_open 5432 && break
  sleep 1
done

echo "==> Preparing database (role, database, migrations)"
if command -v psql >/dev/null 2>&1; then
  psql -d postgres -v ON_ERROR_STOP=0 -c \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='docsys') THEN CREATE ROLE docsys LOGIN PASSWORD 'docsys' CREATEDB; END IF; END \$\$;" \
    >/dev/null 2>&1 || true
  createdb -O docsys docsys >/dev/null 2>&1 || true
fi

echo "==> Installing dependencies and building shared packages"
pnpm install >"$LOG_DIR/install.log" 2>&1
pnpm --filter @docsys/database generate >"$LOG_DIR/prisma.log" 2>&1
pnpm --filter @docsys/database build >>"$LOG_DIR/prisma.log" 2>&1
( cd packages/database && npx prisma migrate deploy >>"$LOG_DIR/prisma.log" 2>&1 )
( cd apps/api && npx tsc -p tsconfig.json >"$LOG_DIR/api-build.log" 2>&1 )

echo "==> Starting application services"
start_service api apps/api node dist/main.js
start_service collaboration apps/collaboration npx tsx src/main.ts
start_service worker apps/worker npx tsx src/main.ts
start_service web apps/web npx vite --port 5173 --host

wait_for_url "http://localhost:3001/health/live" "API"
wait_for_url "http://localhost:5173" "Web"

echo "==> Seeding admin account"
node "$ROOT/infra/scripts/seed-admin.mjs" || echo "  WARNING: admin seed failed (see output above)"

echo ""
echo "DocSys is running:"
echo "  Web UI:        $APP_BASE_URL"
echo "  API / Swagger: http://localhost:3001/api/docs"
echo "  Login:         admin@docsys.local / Admin1234!"
echo ""
echo "Stop everything with:  bash infra/scripts/dev-down.sh"
