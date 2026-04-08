#!/usr/bin/env bash
# Menus live in the API SQLite DB. To copy once from JsonBin:
#   1) Start backend (restaurant_menu_be/mt-core): ./gradlew :mt-server:bootRun
#   2) export JSONBIN_MASTER_KEY=… MENU_API_USER=… MENU_API_PASSWORD=…
#   3) python3 scripts/migrate_jsonbin_once.py
# Then delete scripts/migrate_jsonbin_once.py if you want it gone.
echo "Use: python3 $(dirname "$0")/scripts/migrate_jsonbin_once.py (see comments in that file)." >&2
exit 1
