#!/usr/bin/env bash
# Starts Fiximperfect so phones on the same network can open the QR codes.
# Every QR code, tracking link and e-mail link then points at this Mac's
# network address instead of localhost.
# Usage: npm run start:lan            (uses the current build)
#        npm run start:lan -- --build (rebuilds first)
set -euo pipefail
cd "$(dirname "$0")/.."

IP=""
for IF in en0 en1 en2 bridge100; do
  IP="$(ipconfig getifaddr "$IF" 2>/dev/null || true)"
  [[ -n "$IP" ]] && break
done
if [[ -z "$IP" ]]; then
  echo "Could not find a network address. Connect to Wi-Fi (or your phone's hotspot) and try again." >&2
  exit 1
fi
PORT="${PORT:-3000}"
URL="http://$IP:$PORT"

# If the corporate proxy isn't reachable on this network (e.g. on a phone
# hotspot), drop it so outbound e-mail and AI calls go direct.
if [[ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]]; then
  PROXY_HOSTPORT="$(echo "${HTTPS_PROXY:-$https_proxy}" | sed -E 's#^[a-z]+://##; s#/.*$##')"
  if ! nc -z -G 2 "${PROXY_HOSTPORT%:*}" "${PROXY_HOSTPORT##*:}" >/dev/null 2>&1; then
    echo "Proxy $PROXY_HOSTPORT not reachable here; connecting directly."
    unset HTTPS_PROXY https_proxy HTTP_PROXY http_proxy
  fi
fi

# Stop anything already serving the port.
if PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null)"; then
  kill $PIDS 2>/dev/null || true
  sleep 1
fi

if [[ "${1:-}" == "--build" ]]; then
  NEXT_TELEMETRY_DISABLED=1 npx next build
fi

echo ""
echo "  Fiximperfect is reachable at:  $URL"
echo "  QR codes:                      $URL/#qr  (or Settings → QR codes)"
echo "  Your phone must be on the same network as this Mac."
echo ""
export NEXT_PUBLIC_APP_URL="$URL"
export NODE_USE_ENV_PROXY=1
export NEXT_TELEMETRY_DISABLED=1
exec npx next start -H 0.0.0.0 -p "$PORT"
