#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT/.dev-pids"
COMPOSE_FILE="$ROOT/infra/docker/docker-compose.dev.yml"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "==> Stopping DocSys application services"
if [ -f "$PID_FILE" ]; then
  while read -r pid; do
    [ -n "$pid" ] && kill "$pid" >/dev/null 2>&1 || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi
pkill -f "dist/main.js" >/dev/null 2>&1 || true
pkill -f "src/main.ts" >/dev/null 2>&1 || true
pkill -f "vite --port 5173" >/dev/null 2>&1 || true
pkill -f "vite --port" >/dev/null 2>&1 || true

if [ "${STOP_INFRA:-0}" = "1" ]; then
  echo "==> Stopping docker infrastructure (postgres, redis, minio)"
  compose -f "$COMPOSE_FILE" stop >/dev/null 2>&1 || true
fi

echo "==> Done. (Local Homebrew PostgreSQL/Redis were left running.)"
echo "    To also stop docker infra next time:  STOP_INFRA=1 bash infra/scripts/dev-down.sh"
