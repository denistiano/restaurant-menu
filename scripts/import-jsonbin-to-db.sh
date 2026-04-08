#!/usr/bin/env bash
# Thin wrapper — real logic is migrate_jsonbin_once.py (delete that file after a successful migration).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/migrate_jsonbin_once.py" "$@"
