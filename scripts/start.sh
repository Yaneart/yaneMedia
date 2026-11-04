#!/bin/sh
set -eu

mode=${1:-}
case "$mode" in
  Home|Public) shift ;;
  *) echo 'Usage: sh scripts/start.sh Home|Public [--build] [--check]' >&2; exit 2 ;;
esac
build=false
check=false
for argument in "$@"; do
  case "$argument" in
    --build) build=true ;;
    --check) check=true ;;
    *) echo "Unknown argument: $argument" >&2; exit 2 ;;
  esac
done
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
set -- docker compose --project-directory "$project_root" -f "$project_root/compose.yaml"
if [ "$mode" = Public ]; then
  if [ -n "${COMPOSE_PROFILES:-}" ]; then
    echo 'Unset COMPOSE_PROFILES before starting Public mode.' >&2
    exit 2
  fi
  unset TORRSERVER_BASE_URL TORRSERVER_USERNAME_FILE TORRSERVER_PASSWORD_FILE
  unset TORRENT_IDEMPOTENCY_SECRET_FILE JACRED_BASE_URL JACRED_FALLBACK_URLS KNABEN_BASE_URL
  set -- "$@" -f "$project_root/compose.public.yaml"
fi
"$@" config --quiet
if "$check"; then
  echo "$mode configuration is valid. No services changed."
  exit 0
fi
if [ "$mode" = Public ]; then
  docker compose --project-directory "$project_root" -f "$project_root/compose.yaml" stop torrserver
fi
if "$build"; then "$@" up --build -d; else "$@" up -d; fi
echo "$mode mode started. Existing database, assets and Docker volumes were preserved."
