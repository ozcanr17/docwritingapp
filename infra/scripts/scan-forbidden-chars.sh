#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=en_US.UTF-8

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET_DIRS=("apps" "packages" "infra" "tests")
PATTERN=$(printf '[\xc3\xb6\xc3\xa7\xc5\x9f\xc4\xb1\xc4\x9f\xc3\xbc\xc3\x96\xc3\x87\xc5\x9e\xc4\xb0\xc4\x9e\xc3\x9c]')
FOUND=0

for dir in "${TARGET_DIRS[@]}"; do
  if [ -d "$ROOT_DIR/$dir" ]; then
    if grep -rnE "$PATTERN" "$ROOT_DIR/$dir" \
      --exclude-dir=node_modules \
      --exclude-dir=dist \
      --exclude-dir=.turbo \
      --exclude-dir=locales \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' \
      --include='*.prisma' --include='*.sql' --include='*.yml' --include='*.yaml' \
      --include='*.sh' --include='*.env*'; then
      FOUND=1
    fi
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "FAIL: forbidden Turkish characters found in source files."
  exit 1
fi

echo "PASS: no forbidden Turkish characters in source files."
