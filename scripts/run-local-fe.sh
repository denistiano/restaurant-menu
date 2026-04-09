#!/usr/bin/env bash
# Serve the static site locally (GitHub Pages parity).
# API URL: on localhost, JS defaults to http://127.0.0.1:8080 (Spring Boot). Override
# with meta menu-api-base, or menu_api_base in seo-config.json for production deploys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8888}"
cd "$ROOT"

if [[ "${SKIP_GENERATE:-}" == "1" ]]; then
  echo "SKIP_GENERATE=1 — not running generate-restaurant-pages.sh"
else
  echo "Generating /<id>/index.html, sitemap.xml, robots.txt from restaurants.json…"
  bash "$ROOT/scripts/generate-restaurant-pages.sh"
fi

echo "Serving $ROOT on http://127.0.0.1:${PORT}/"
echo "Backend default: http://127.0.0.1:8080 — override meta or __MENU_API_BASE__ if needed."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
