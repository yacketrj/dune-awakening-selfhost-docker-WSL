#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_line() {
  local file="$1"
  local expected="$2"

  grep -Fxq -- "$expected" "$file" || fail "$file missing line: $expected"
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

socket_path="$tmp/docker.sock"
touch "$socket_path"
socket_gid="$(stat -c '%g' "$socket_path")"
docker_log="$tmp/docker-run.args"

cat > "$tmp/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$cmd" in
  ps)
    if [ "${1:-}" = "-a" ]; then
      exit 0
    fi
    printf '%s\n' dune-director dune-postgres
    ;;
  image)
    [ "${1:-}" = "inspect" ] || exit 99
    exit 0
    ;;
  run)
    : "${DUNE_TEST_DOCKER_LOG:?}"
    printf '%s\n' "$@" > "$DUNE_TEST_DOCKER_LOG"
    ;;
  rm)
    exit 0
    ;;
  exec)
    exit 1
    ;;
  *)
    echo "unexpected docker command: $cmd $*" >&2
    exit 99
    ;;
esac
EOF
chmod +x "$tmp/docker"

PATH="$tmp:$PATH" \
  DUNE_TEST_DOCKER_LOG="$docker_log" \
  DUNE_DOCKER_SOCKET_PATH="$socket_path" \
  runtime/scripts/start-autoscaler.sh > "$tmp/output"

assert_line "$docker_log" "--group-add"
assert_line "$docker_log" "$socket_gid"
assert_line "$docker_log" "DOCKER_SOCKET_GID=$socket_gid"
assert_line "$docker_log" "$socket_path:/var/run/docker.sock"

echo "PASS: autoscaler launch includes Docker socket group access"
