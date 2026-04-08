#!/usr/bin/env bash
# Serve the static site locally (GitHub Pages parity).
# API URL: on localhost, JS defaults to http://127.0.0.1:8080 (Spring Boot). Override
# with meta menu-api-base, or menu_api_base in seo-config.json for production deploys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8888}"
cd "$ROOT"
echo "Serving $ROOT on http://127.0.0.1:${PORT}/"
echo "Backend default: http://127.0.0.1:8080 — override meta or __MENU_API_BASE__ if needed."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
