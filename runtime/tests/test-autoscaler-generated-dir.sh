#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

stub_bin="$tmp_dir/bin"
generated_dir="$tmp_dir/generated"
override_dir="$tmp_dir/overrides"
mkdir -p "$stub_bin"

cat > "$stub_bin/docker" <<'EOF'
#!/usr/bin/env sh
if [ "$1" = "ps" ]; then
  exit 0
fi
echo "unexpected docker call: $*" >&2
exit 64
EOF
chmod +x "$stub_bin/docker"

assert_file() {
  if [ ! -f "$1" ]; then
    echo "missing expected file: $1" >&2
    exit 1
  fi
}

assert_absent() {
  if [ -e "$1" ]; then
    echo "unexpected file exists: $1" >&2
    exit 1
  fi
}

run_autoscaler_until_service_check() {
  local demand_override="${1:-}"
  set +e
  if [ -n "$demand_override" ]; then
    PATH="$stub_bin:$PATH" \
      DUNE_GENERATED_DIR="$generated_dir" \
      DUNE_AUTOSCALER_DEMAND_FILE="$demand_override" \
      "${BASH:-bash}" runtime/scripts/autoscaler.sh >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"
  else
    PATH="$stub_bin:$PATH" \
      DUNE_GENERATED_DIR="$generated_dir" \
      "${BASH:-bash}" runtime/scripts/autoscaler.sh >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"
  fi
  rc=$?
  set -e

  if [ "$rc" -ne 1 ]; then
    echo "expected autoscaler to stop at missing dune-director with rc=1, got rc=$rc" >&2
    cat "$tmp_dir/stdout" >&2
    cat "$tmp_dir/stderr" >&2
    exit 1
  fi
}

run_autoscaler_until_service_check

assert_file "$generated_dir/autoscaler-idle.tsv"
assert_file "$generated_dir/autoscaler-server-ids.tsv"
assert_file "$generated_dir/autoscaler-demand.tsv"
assert_file "$generated_dir/autoscaler-hub-travel.tsv"
assert_file "$generated_dir/autoscaler-deepdesert-travel.tsv"
assert_file "$generated_dir/autoscaler-director-heal.tsv"

grep -q "Generated directory: $generated_dir" "$tmp_dir/stdout"
grep -q "State file: $generated_dir/autoscaler-idle.tsv" "$tmp_dir/stdout"

run_autoscaler_until_service_check "$override_dir/custom-demand.tsv"

assert_file "$override_dir/custom-demand.tsv"
assert_absent "$generated_dir/custom-demand.tsv"

echo "autoscaler generated-dir tests passed"
