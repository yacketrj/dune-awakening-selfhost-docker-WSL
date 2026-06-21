#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

root="$tmp_dir/root"
stub_bin="$tmp_dir/bin"
mkdir -p "$root/runtime/generated" "$stub_bin"
touch "$tmp_dir/docker.sock"

cat > "$stub_bin/docker" <<'EOF'
#!/usr/bin/env sh
case "$DUNE_TEST_DOCKER_MODE" in
  ok)
    echo "Docker daemon is reachable"
    exit 0
    ;;
  permission)
    echo "permission denied while trying to connect to /var/run/docker.sock" >&2
    exit 1
    ;;
  missing-cli)
    echo "DOCKER_CLI_MISSING"
    exit 127
    ;;
  *)
    echo "unknown test mode" >&2
    exit 64
    ;;
esac
EOF
chmod +x "$stub_bin/docker"

run_repair() {
  PATH="$stub_bin:$PATH" \
    DUNE_TEST_DOCKER_MODE="$1" \
    DUNE_DOCKER_SOCKET_SELF_HEAL_ROOT="$root" \
    DUNE_DOCKER_SOCKET_PATH="$tmp_dir/docker.sock" \
    DUNE_DOCKER_SOCKET_ENV_FILE="$root/.env" \
    DUNE_DOCKER_SOCKET_GROUP_COMPOSE="$root/runtime/generated/docker-compose.web.socket-gid.yml" \
    "${BASH:-bash}" runtime/scripts/repair-docker-socket-access.sh repair >"$tmp_dir/stdout" 2>"$tmp_dir/stderr"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -Eq "$pattern" "$file"; then
    echo "expected $file to contain pattern: $pattern" >&2
    cat "$file" >&2
    exit 1
  fi
}

run_repair permission
assert_contains "$root/.env" '^DOCKER_SOCKET_GID=[0-9]+$'
if [ -e "$root/runtime/generated/docker-compose.web.socket-gid.yml" ]; then
  echo "override should not be written until ENABLE_DOCKER_SOCKET_GROUP_FIX=1" >&2
  exit 1
fi
assert_contains "$tmp_dir/stdout" 'ENABLE_DOCKER_SOCKET_GROUP_FIX=1'

printf 'ENABLE_DOCKER_SOCKET_GROUP_FIX=1\n' > "$root/.env"
run_repair permission
assert_contains "$root/.env" '^DOCKER_SOCKET_GID=[0-9]+$'
assert_contains "$root/runtime/generated/docker-compose.web.socket-gid.yml" 'group_add:'
assert_contains "$root/runtime/generated/docker-compose.web.socket-gid.yml" 'DOCKER_SOCKET_GID'

run_repair ok
assert_contains "$tmp_dir/stdout" 'No socket repair is needed'

echo "docker socket access tests passed"
