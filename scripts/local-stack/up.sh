#!/usr/bin/env bash
# Starts a local Supabase-compatible stack without Docker:
#   Homebrew Postgres + Supabase Auth (GoTrue) + PostgREST + a Node gateway.
# Usage: scripts/local-stack/up.sh [--reset]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS="${FIXIMPERFECT_TOOLS:-$HOME/.local/fiximperfect-tools}"
STATE="$ROOT/.local-stack"
DB="${LOCAL_DB_NAME:-fiximperfect}"
PGHOST_DIR="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5432}"
JWT_SECRET="${LOCAL_JWT_SECRET:-fiximperfect-local-dev-jwt-secret-at-least-32-chars}"
export DYLD_LIBRARY_PATH="${DYLD_LIBRARY_PATH:-/opt/homebrew/lib/postgresql@17}"

mkdir -p "$STATE/storage" "$STATE/logs"
"$ROOT/scripts/local-stack/down.sh" >/dev/null 2>&1 || true

psql_admin() { psql -h "$PGHOST_DIR" -p "$PGPORT" -v ON_ERROR_STOP=1 -q "$@"; }

if [[ "${1:-}" == "--reset" ]]; then
  echo "[local-stack] dropping database $DB"
  psql_admin -d postgres -c "drop database if exists $DB with (force)"
  rm -rf "$STATE/storage"/*
fi

if ! psql_admin -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  psql_admin -d postgres -c "create database $DB"
fi
psql_admin -d "$DB" -f "$ROOT/scripts/local-stack/bootstrap.sql"

echo "[local-stack] starting Supabase Auth (runs its own migrations)"
(
  cd "$TOOLS"
  GOTRUE_DB_DRIVER=postgres \
  DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PGPORT/$DB?search_path=auth&sslmode=disable" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_SITE_URL="http://localhost:3000" API_EXTERNAL_URL="http://localhost:54321/auth/v1" \
  GOTRUE_API_HOST=127.0.0.1 PORT=54331 GOTRUE_DISABLE_SIGNUP=true GOTRUE_MAILER_AUTOCONFIRM=true \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_LOG_LEVEL=warn \
  nohup ./auth > "$STATE/logs/auth.log" 2>&1 &
  echo $! > "$STATE/auth.pid"
)
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:54331/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:54331/health >/dev/null || { echo "auth failed to start"; tail -20 "$STATE/logs/auth.log"; exit 1; }

echo "[local-stack] applying migrations"
psql_admin -d "$DB" -c "create table if not exists public._local_migrations (name text primary key, applied_at timestamptz default now())"
psql_admin -d "$DB" -c "revoke all on public._local_migrations from anon, authenticated"
for f in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if ! psql_admin -d "$DB" -tAc "select 1 from public._local_migrations where name='$name'" | grep -q 1; then
    echo "  -> $name"
    psql_admin -d "$DB" -1 -f "$f"
    psql_admin -d "$DB" -c "insert into public._local_migrations(name) values ('$name')"
  fi
done

echo "[local-stack] starting PostgREST"
PGRST_DB_URI="postgres://authenticator:local-authenticator@127.0.0.1:$PGPORT/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=54330 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_MAX_ROWS=1000 \
  nohup "$TOOLS/postgrest" > "$STATE/logs/postgrest.log" 2>&1 &
echo $! > "$STATE/postgrest.pid"

echo "[local-stack] starting gateway on :54321"
JWT_SECRET="$JWT_SECRET" STORAGE_DIR="$STATE/storage" \
  nohup "$ROOT/node_modules/.bin/tsx" "$ROOT/scripts/local-stack/gateway.ts" > "$STATE/logs/gateway.log" 2>&1 &
echo $! > "$STATE/gateway.pid"

for _ in $(seq 1 60); do curl -sf http://127.0.0.1:54330/ >/dev/null && curl -s http://127.0.0.1:54321/ >/dev/null && break; sleep 0.5; done

KEYS="$(JWT_SECRET="$JWT_SECRET" node "$ROOT/scripts/local-stack/keys.mjs")"
echo "$KEYS" > "$STATE/keys.env"
echo "[local-stack] ready. Keys written to .local-stack/keys.env"
echo "$KEYS" | sed -E 's/(KEY=.{16}).*/\1.../'

