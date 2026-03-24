#!/usr/bin/env bash
# Generate one folder per restaurant id from resources/restaurants.json:
#   <repo-root>/<id>/index.html
# Run before local preview or rely on GitHub Actions before Pages deploy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JSON="$ROOT/resources/restaurants.json"

if [[ ! -f "$JSON" ]]; then
  echo "error: missing $JSON" >&2
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "error: python3 is required" >&2
  exit 1
fi

python3 "$SCRIPT_DIR/generate_pages.py" "$ROOT"
