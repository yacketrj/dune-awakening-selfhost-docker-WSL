#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

mkdir -p runtime/secrets runtime/generated

prompt_default() {
  local prompt="$1"
  local default="$2"
  local value
  read -r -p "$prompt [$default]: " value
  if [ -z "$value" ]; then
    value="$default"
  fi
  printf '%s' "$value"
}

confirm_overwrite() {
  if [ -f .env ] || [ -f runtime/generated/battlegroup.env ] || [ -f runtime/secrets/funcom-token.txt ]; then
    echo "Existing local configuration was found:"
    [ -f .env ] && echo "  .env"
    [ -f runtime/generated/battlegroup.env ] && echo "  runtime/generated/battlegroup.env"
    [ -f runtime/secrets/funcom-token.txt ] && echo "  runtime/secrets/funcom-token.txt"
    echo
    read -r -p "Overwrite local init config? [y/N]: " answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *) echo "Init cancelled."; exit 1 ;;
    esac
  fi
}

derive_battlegroup_id() {
  TOKEN="$1" python3 - <<'PY'
import base64
import json
import os
import random
import string
import sys

token = os.environ["TOKEN"].strip()
parts = token.split(".")
if len(parts) < 2:
    print("Token does not look like a JWT.", file=sys.stderr)
    sys.exit(1)

payload = parts[1] + "=" * (-len(parts[1]) % 4)

try:
    data = json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
except Exception as exc:
    print(f"Could not decode token payload: {exc}", file=sys.stderr)
    sys.exit(1)

host_id = data.get("HostId") or data.get("hostId") or data.get("host_id")
if not host_id:
    print("Token payload does not contain HostId.", file=sys.stderr)
    sys.exit(1)

host_id = str(host_id).lower()
suffix = "".join(random.choice(string.ascii_lowercase) for _ in range(6))

print(f"sh-{host_id}-{suffix}")
PY
}

echo "=== Dune Awakening Docker first-time init ==="
echo
echo "This will create local config, save your Funcom token locally, generate a battlegroup ID,"
echo "download/load server assets, run DB setup/update, and start the Docker stack."
echo

confirm_overwrite

SERVER_TITLE="$(prompt_default "Server title" "My Dune Server")"

echo
echo "Select server region:"
echo "  1) Europe Test"
echo "  2) North America Test"

SERVER_REGION=""
while [ -z "$SERVER_REGION" ]; do
  read -r -p "Choice [1/2]: " region_choice
  case "$region_choice" in
    1) SERVER_REGION="Europe Test" ;;
    2) SERVER_REGION="North America Test" ;;
    *) echo "Invalid choice. Pick 1 or 2." ;;
  esac
done

echo
SERVER_IP="$(prompt_default "Server/player-facing IP, or auto" "auto")"
STEAM_APP_ID="$(prompt_default "Steam app id" "3104830")"

echo
echo "Paste your Funcom self-host service token."
echo "Input is hidden. Press Enter after pasting."
read -r -s -p "Funcom token: " FUNCOM_TOKEN
echo

if [ -z "$FUNCOM_TOKEN" ]; then
  echo "Token cannot be empty."
  exit 1
fi

echo
echo "Generating battlegroup ID using Funcom's world name format..."
BATTLEGROUP_ID="$(derive_battlegroup_id "$FUNCOM_TOKEN")"

cat > .env <<EOF
SERVER_IP=$SERVER_IP
SERVER_TITLE="$SERVER_TITLE"
SERVER_REGION="$SERVER_REGION"
STEAM_APP_ID=$STEAM_APP_ID
EOF

cat > runtime/generated/battlegroup.env <<EOF
BATTLEGROUP_ID=$BATTLEGROUP_ID
EOF

printf '%s' "$FUNCOM_TOKEN" > runtime/secrets/funcom-token.txt

chmod 600 .env
chmod 600 runtime/generated/battlegroup.env
chmod 600 runtime/secrets/funcom-token.txt

export SERVER_IP SERVER_TITLE SERVER_REGION STEAM_APP_ID BATTLEGROUP_ID

echo
echo "Wrote local config:"
echo "  .env"
echo "  runtime/generated/battlegroup.env"
echo "  runtime/secrets/funcom-token.txt"
echo
echo "Generated battlegroup ID:"
echo "  $BATTLEGROUP_ID"

echo
echo "Starting orchestrator container..."
docker compose up -d --build orchestrator

echo
echo "Downloading/loading assets and running database update..."
runtime/scripts/update.sh

echo
echo "Starting Dune stack..."
runtime/scripts/start-all.sh

echo
echo "Init complete."
echo "Survival_1 can take several minutes to become READY."
echo
runtime/scripts/ready.sh || true

cat <<EOF

Next commands:
  dune status
  dune ready
  dune logs survival
  dune logs overmap
EOF
