#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/runtime/scripts"
cp "$ROOT/runtime/scripts/db-passwords.sh" "$TMPDIR/runtime/scripts/db-passwords.sh"

cd "$TMPDIR"
. runtime/scripts/db-passwords.sh

generated="$(resolve_dune_db_password)"
[ -n "$generated" ]
[ "$generated" != "dune" ]
[ -s runtime/secrets/dune-db-password.txt ]

again="$(resolve_dune_db_password)"
[ "$again" = "$generated" ]

DUNE_DB_PASSWORD="operator-override"
override="$(resolve_dune_db_password)"
[ "$override" = "operator-override" ]
unset DUNE_DB_PASSWORD

rm -f runtime/secrets/dune-db-password.txt
DUNE_DB_SECRET_LEGACY_DEFAULTS=1
legacy="$(resolve_dune_db_password)"
[ "$legacy" = "dune" ]

echo "db password secret tests passed"
