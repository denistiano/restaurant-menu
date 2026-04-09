#!/usr/bin/env bash
# Generate from resources/restaurants.json + resources/seo-config.json:
#   <repo-root>/<id>/index.html
#   sitemap.xml (homepage + one URL per restaurant id)
#   robots.txt (Sitemap: line)
# Run locally before commit, or rely on GitHub Actions (pages.yml) before Pages deploy.
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
