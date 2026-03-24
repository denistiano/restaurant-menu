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

python3 - "$ROOT" <<'PY'
import json, html, pathlib, sys

root = pathlib.Path(sys.argv[1])
path = root / "resources" / "restaurants.json"
data = json.loads(path.read_text(encoding="utf-8"))

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/style.css" />
</head>
<body class="restaurant-page">

  <div id="restaurant-root">
    <div class="loading-spinner fullscreen" id="loadingSpinner">
      <div class="spinner"></div>
    </div>
  </div>

  <script>
    window.RESTAURANT_ID = {id_js};
    window.RESOURCES_BASE = '../resources';
  </script>
  <script type="module" src="../js/analytics.js"></script>
  <script src="../js/restaurant.js"></script>
</body>
</html>
"""

for r in data:
    rid = r.get("id")
    if not rid or not isinstance(rid, str):
        print("skip: entry without string id", r, file=sys.stderr)
        continue
    title = html.escape((r.get("name") or {}).get("en") or rid)
    id_js = json.dumps(rid)
    out_dir = root / rid
    out_dir.mkdir(parents=True, exist_ok=True)
    html_out = TEMPLATE.format(title=title, id_js=id_js)
    (out_dir / "index.html").write_text(html_out, encoding="utf-8")
    print(f"generated {out_dir / 'index.html'}")
PY
