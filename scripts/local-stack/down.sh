#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for svc in gateway postgrest auth; do
  f="$ROOT/.local-stack/$svc.pid"
  if [[ -f "$f" ]]; then kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; fi
done
echo "[local-stack] stopped"
