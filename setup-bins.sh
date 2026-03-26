#!/usr/bin/env bash
# ============================================================
# setup-bins.sh — Create a new restaurant menu bin on jsonbin.io
#
# Usage:
#   ./setup-bins.sh <restaurant-id>
#
# Examples:
#   ./setup-bins.sh retur
#   ./setup-bins.sh bella-italia
#   ./setup-bins.sh the-oak-tavern
#
# What it does:
#   1. Creates a public jsonbin.io bin with a starter template menu
#   2. Patches resources/restaurants.json with the new bin ID
#   3. If no entry exists for the restaurant, adds a new one
#
# Prerequisites:
#   - resources/api-key.txt: line 1 = jsonbin.io master key (other lines ignored)
#   - python3 available (standard on most systems)
# ============================================================

set -e

# ── Args & key ───────────────────────────────────────────────
RESTAURANT_ID="${1:-}"
if [ -z "$RESTAURANT_ID" ]; then
  echo ""
  echo "  Usage: ./setup-bins.sh <restaurant-id>"
  echo ""
  echo "  Example: ./setup-bins.sh my-restaurant"
  echo ""
  exit 1
fi

API_KEY_FILE="resources/api-key.txt"
if [ ! -f "$API_KEY_FILE" ]; then
  echo "ERROR: $API_KEY_FILE not found."
  echo "Create it and paste your jsonbin.io master key inside."
  exit 1
fi

# Only the first line is the JsonBin key; joining all lines breaks X-Master-Key.
API_KEY=$(head -n 1 "$API_KEY_FILE" | tr -d '[:space:]')
JSONBIN="https://api.jsonbin.io/v3/b"

echo ""
echo "  Restaurant : $RESTAURANT_ID"
echo "  API key    : ${API_KEY:0:20}..."
echo ""

# ── Build template menu JSON ─────────────────────────────────
# We use python3 to safely generate the JSON so special chars
# in the restaurant ID don't cause shell escaping issues.
TEMPLATE_JSON=$(python3 - "$RESTAURANT_ID" <<'PYEOF'
import json, sys

rid = sys.argv[1]
# Humanise the ID for the default display name
display = rid.replace("-", " ").replace("_", " ").title()

menu = {
  "restaurant": {
    "id": rid,
    "name": {
      "en": display,
      "bg": display
    },
    "description": {
      "en": "Welcome — edit this description in the admin panel.",
      "bg": "Добре дошли — редактирайте описанието от админ панела."
    },
    "logo": "",
    "image": "cover.jpg",
    "background_image": "cover.jpg",
    "default_language": "en",
    "menu": {
      "theme": "classic",
      "config": {
        "show_price": True,
        "show_description": True,
        "show_ingredients": False,
        "show_tags": True,
        "show_allergens": False,
        "currencies": {
          "base": "EUR",
          "display": ["EUR", "BGN"],
          "rates": {"BGN": 1.95583}
        }
      },
      "categories": [
        {
          "id": "starters",
          "name": {"en": "Starters", "bg": "Предястия"},
          "items": [
            {
              "name": {"en": "Example Starter 1", "bg": "Примерно предястие 1"},
              "description": {"en": "A light and fresh opening dish.", "bg": "Лека и свежа начална закуска."},
              "price": 4.50,
              "tags": [{"en": "vegetarian", "bg": "вегетарианско"}],
              "availability": True
            },
            {
              "name": {"en": "Example Starter 2", "bg": "Примерно предястие 2"},
              "description": {"en": "Another starter — edit or remove me.", "bg": "Още едно предястие — редактирайте или изтрийте."},
              "price": 5.00,
              "tags": [],
              "availability": True
            }
          ]
        },
        {
          "id": "mains",
          "name": {"en": "Main Dishes", "bg": "Основни ястия"},
          "items": [
            {
              "name": {"en": "Example Main 1", "bg": "Примерно основно 1"},
              "description": {"en": "A hearty main course — update the name, price and description.", "bg": "Сърдечно основно ястие — актуализирайте от админ панела."},
              "price": 9.90,
              "tags": [{"en": "homemade", "bg": "домашно"}],
              "availability": True
            },
            {
              "name": {"en": "Example Main 2", "bg": "Примерно основно 2"},
              "description": {"en": "", "bg": ""},
              "price": 11.50,
              "tags": [],
              "availability": True
            },
            {
              "name": {"en": "Example Main 3", "bg": "Примерно основно 3"},
              "description": {"en": "", "bg": ""},
              "price": 12.00,
              "tags": [{"en": "popular", "bg": "популярно"}],
              "availability": False
            }
          ]
        },
        {
          "id": "desserts",
          "name": {"en": "Desserts", "bg": "Десерти"},
          "items": [
            {
              "name": {"en": "Example Dessert", "bg": "Примерен десерт"},
              "description": {"en": "Sweet finish to the meal.", "bg": "Сладък финал на храненето."},
              "price": 3.50,
              "tags": [{"en": "vegetarian", "bg": "вегетарианско"}],
              "availability": True
            }
          ]
        },
        {
          "id": "drinks",
          "name": {"en": "Drinks", "bg": "Напитки"},
          "items": [
            {
              "name": {"en": "Still Water 500ml", "bg": "Негазирана вода 500мл"},
              "description": {"en": "", "bg": ""},
              "price": 1.50,
              "tags": [{"en": "non-alcoholic", "bg": "безалкохолно"}],
              "availability": True
            },
            {
              "name": {"en": "Sparkling Water 500ml", "bg": "Газирана вода 500мл"},
              "description": {"en": "", "bg": ""},
              "price": 1.80,
              "tags": [{"en": "non-alcoholic", "bg": "безалкохолно"}],
              "availability": True
            },
            {
              "name": {"en": "Example Soft Drink", "bg": "Примерна безалкохолна напитка"},
              "description": {"en": "", "bg": ""},
              "price": 2.50,
              "tags": [{"en": "non-alcoholic", "bg": "безалкохолно"}],
              "availability": True
            }
          ]
        }
      ]
    }
  }
}

print(json.dumps(menu, ensure_ascii=False))
PYEOF
)

# ── Create bin on jsonbin.io ─────────────────────────────────
BIN_NAME="${RESTAURANT_ID}-menu"
echo "Creating bin \"$BIN_NAME\"..."

RESPONSE=$(curl -s -X POST "$JSONBIN" \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: $API_KEY" \
  -H "X-Bin-Name: $BIN_NAME" \
  -H "X-Bin-Private: false" \
  -d "$TEMPLATE_JSON")

BIN_ID=$(echo "$RESPONSE" | python3 -c \
  "import sys,json; r=json.load(sys.stdin); print(r.get('metadata',{}).get('id',''))" 2>/dev/null)

ERROR_MSG=$(echo "$RESPONSE" | python3 -c \
  "import sys,json; r=json.load(sys.stdin); print(r.get('message',''))" 2>/dev/null)

if [ -z "$BIN_ID" ]; then
  echo ""
  echo "  ERROR: Failed to create bin."
  echo "  jsonbin response: $ERROR_MSG"
  echo ""
  echo "  Check your API key and try again."
  exit 1
fi

echo ""
echo "  ✓ Bin created!"
echo "  Bin ID : $BIN_ID"
echo "  URL    : https://api.jsonbin.io/v3/b/$BIN_ID/latest"
echo ""

# ── Patch restaurants.json ───────────────────────────────────
echo "Patching resources/restaurants.json..."

python3 - "$RESTAURANT_ID" "$BIN_ID" <<'PYEOF'
import json, sys

rid    = sys.argv[1]
bin_id = sys.argv[2]
path   = "resources/restaurants.json"

with open(path) as f:
    data = json.load(f)

# Find existing entry
entry = next((r for r in data if r["id"] == rid), None)

if entry:
    entry["menu_bin_id"] = bin_id
    print(f"  Updated existing entry for '{rid}'.")
else:
    # Add a new stub entry the user can fill in via the admin
    display = rid.replace("-", " ").replace("_", " ").title()
    data.append({
        "id": rid,
        "name": {"en": display, "bg": display},
        "description": {"en": "", "bg": ""},
        "image": "cover.jpg",
        "theme": "classic",
        "menu_bin_id": bin_id,
        "password_hash": ""
    })
    print(f"  Added new entry for '{rid}'.")
    print(f"  NOTE: Set a password hash in restaurants.json.")
    print(f"  Run:  node -e \"const c=require('crypto'); console.log(c.createHash('sha256').update('{rid}:YOURPASSWORD').digest('hex'));\"")

with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("  resources/restaurants.json saved.")
PYEOF

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  All done!                                       ║"
echo "  ║                                                  ║"
echo "  ║  1. Open /admin/ and log in                      ║"
echo "  ║  2. Replace the example items with real ones     ║"
echo "  ║  3. Hit Save — changes go live immediately       ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
