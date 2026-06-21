#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "compose" ] && [ "${2:-}" = "exec" ]; then
  case "${DUNE_TEST_UPDATE_RESULT:-}" in
    no-update)
      cat <<'OUT'
Steam app id: 4754530
Install dir:  /srv/dune/server
Local build:  23654991
Remote build: 23654991
No update available.
OUT
      exit 1
      ;;
    available)
      cat <<'OUT'
Steam app id: 4754530
Install dir:  /srv/dune/server
Local build:  23654991
Remote build: 23699999
Update available.
OUT
      exit 1
      ;;
  esac
fi

echo "unexpected docker command: $*" >&2
exit 99
EOF
chmod +x "$tmp/docker"

PATH="$tmp:$PATH" \
  DUNE_TEST_UPDATE_RESULT=no-update \
  runtime/scripts/update.sh check > "$tmp/no-update.out"

grep -Fq "No update available." "$tmp/no-update.out" || fail "no-update output missing terminal line"

set +e
PATH="$tmp:$PATH" \
  DUNE_TEST_UPDATE_RESULT=available \
  runtime/scripts/update.sh check > "$tmp/available.out"
available_rc=$?
set -e

[ "$available_rc" -eq 100 ] || fail "expected update-available rc 100, got $available_rc"
grep -Fq "Update available." "$tmp/available.out" || fail "available output missing terminal line"

echo "PASS: update check terminal output controls exit classification"
