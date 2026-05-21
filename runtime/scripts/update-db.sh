#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

[ -f runtime/generated/image-tags.env ] && . runtime/generated/image-tags.env
WORLD_IMAGE_TAG="${DUNE_WORLD_IMAGE_TAG:-1960494-0-shipping}"

IMAGE="registry.funcom.com/funcom/self-hosting/seabass-server-db-utils:${WORLD_IMAGE_TAG}"
DUMP_DIR="$PWD/runtime/postgres/dumps"

echo "=== Running Dune DB update/migration ==="
echo "Image: $IMAGE"

mkdir -p "$DUMP_DIR"

docker run --rm \
  --network dune-net \
  -e DW_PSQL_DIR=/usr \
  -e PYTHONUNBUFFERED=1 \
  -v "$DUMP_DIR:/root/DuneSandbox/Saved/DatabaseDumps" \
  --entrypoint sh \
  "$IMAGE" \
  -lc '
set -e

python /root/PSQL/updatedb.py \
  --dbhost=dune-postgres:5432 \
  --dbname=dune \
  --user=dune \
  --password=dune \
  --connect_timeout=30 \
  --unattended \
  --verbose \
  --admin-user=postgres \
  --admin-password=postgres
'
