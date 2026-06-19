#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local pattern="$2"

  grep -Fq -- "$pattern" "$file" || fail "$file missing: $pattern"
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"

  ! grep -Fq -- "$pattern" "$file" || fail "$file must not contain: $pattern"
}

# start-rabbitmq.sh must preserve upstream defaults while allowing overrides.
assert_contains runtime/scripts/start-rabbitmq.sh '127.0.0.1:${RMQ_ADMIN_HOST_PORT:-32573}:5672'
assert_contains runtime/scripts/start-rabbitmq.sh '${RMQ_GAME_HOST_PORT:-31982}:5672/tcp'
assert_contains runtime/scripts/start-rabbitmq.sh '${RMQ_GAME_HTTP_HOST_PORT:-31983}:15672/tcp'

# Server command lines must advertise configurable RMQ ports with upstream defaults.
assert_contains runtime/scripts/spawn-server.sh '--RMQAdminPort=${RMQ_ADMIN_HOST_PORT:-32573}'
assert_contains runtime/scripts/spawn-server.sh '--RMQGamePort=${RMQ_GAME_HOST_PORT:-31982}'

assert_contains runtime/scripts/start-server-overmap.sh '--RMQAdminPort=${RMQ_ADMIN_HOST_PORT:-32573}'
assert_contains runtime/scripts/start-server-survival-1.sh '--RMQAdminPort=${RMQ_ADMIN_HOST_PORT:-32573}'

# WSL local ports must not be baked into upstreamable scripts.
for file in runtime/scripts/*.sh runtime/scripts/dune; do
  [ -f "$file" ] || continue
  assert_not_contains "$file" '${RMQ_ADMIN_HOST_PORT:-32673}'
  assert_not_contains "$file" '${RMQ_GAME_HOST_PORT:-31992}'
done

echo "PASS: RMQ host-port config is default-preserving and override-ready"
