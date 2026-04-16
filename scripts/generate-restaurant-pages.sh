#!/usr/bin/env bash
# Generate from resources/restaurants.json + resources/seo-config.json:
#   <repo-root>/<id>/index.html
#   sitemap.xml (homepage + one URL per restaurant id)
#   robots.txt (Sitemap: line)
#   Patches root index.html between GENERATED_RESTAURANT_INDEX markers (static /slug/ links for crawlers)
# Run locally before commit, or rely on GitHub Actions (pages.yml) before Pages deploy.
# Keep <!--LOCALE_HREFLANG--> in index.html in git; this pipeline expands it to hreflang on build.
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
python3 "$SCRIPT_DIR/generate_landing_locales.py" "$ROOT"
