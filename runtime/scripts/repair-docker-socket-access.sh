#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${DUNE_DOCKER_SOCKET_SELF_HEAL_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT_DIR"

WEB_SERVICE="${DUNE_WEB_CONSOLE_SERVICE:-redblink-dune-docker-console}"
DOCKER_BIN="${DUNE_DOCKER_BIN:-docker}"
SOCKET_PATH="${DUNE_DOCKER_SOCKET_PATH:-/var/run/docker.sock}"
ENV_FILE="${DUNE_DOCKER_SOCKET_ENV_FILE:-.env}"
OVERRIDE_FILE="${DUNE_DOCKER_SOCKET_GROUP_COMPOSE:-runtime/generated/docker-compose.web.socket-gid.yml}"

log() {
  echo "[docker-socket-repair] $*"
}

env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
}

write_env_value() {
  local key="$1"
  local value="$2"
  local dir tmp

  dir="$(dirname "$ENV_FILE")"
  [ "$dir" = "." ] || mkdir -p "$dir"
  tmp="${ENV_FILE}.tmp.$$"

  if [ -f "$ENV_FILE" ]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { updated = 0 }
      $0 ~ "^" key "=" {
        print key "=" value
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) print key "=" value
      }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" > "$ENV_FILE"
  fi
}

docker_access_output() {
  "$DOCKER_BIN" exec "$WEB_SERVICE" sh -lc '
    if ! command -v docker >/dev/null 2>&1; then
      echo "DOCKER_CLI_MISSING"
      exit 127
    fi
    docker info
  ' 2>&1
}

classify_docker_access() {
  local rc="$1"
  local output="$2"

  if [ "$rc" -eq 0 ]; then
    echo "ok"
  elif printf '%s' "$output" | grep -q "DOCKER_CLI_MISSING"; then
    echo "docker_cli_missing"
  elif printf '%s' "$output" | grep -Eiq 'permission denied' \
    && printf '%s' "$output" | grep -q '/var/run/docker.sock'; then
    echo "socket_permission"
  elif printf '%s' "$output" | grep -Eiq 'Cannot connect to (the )?Docker daemon|docker daemon is not running'; then
    echo "daemon_unavailable"
  else
    echo "unknown_failure"
  fi
}

check_webui_docker_access() {
  local output rc state

  set +e
  output="$(docker_access_output)"
  rc=$?
  set -e

  state="$(classify_docker_access "$rc" "$output")"
  case "$state" in
    ok)
      log "OK: Web UI container can reach Docker."
      ;;
    docker_cli_missing)
      log "FAIL: Docker CLI is missing inside $WEB_SERVICE."
      ;;
    socket_permission)
      log "FAIL: Web UI container cannot read $SOCKET_PATH."
      ;;
    daemon_unavailable)
      log "FAIL: Docker daemon is unavailable from $WEB_SERVICE."
      ;;
    *)
      log "FAIL: Web UI Docker access failed for an unknown reason."
      ;;
  esac

  if [ -n "$output" ]; then
    printf '%s\n' "$output" | sed 's/^/[docker-socket-repair]   /'
  fi

  DOCKER_SOCKET_ACCESS_STATE="$state"
  if [ -n "${DUNE_DOCKER_SOCKET_STATE_FILE:-}" ]; then
    printf '%s' "$state" > "$DUNE_DOCKER_SOCKET_STATE_FILE"
  fi
}

socket_gid() {
  if [ ! -e "$SOCKET_PATH" ]; then
    log "FAIL: Docker socket not found at $SOCKET_PATH."
    return 1
  fi

  stat -c '%g' "$SOCKET_PATH" 2>/dev/null || stat -f '%g' "$SOCKET_PATH" 2>/dev/null
}

write_compose_override() {
  local gid="$1"
  local dir

  dir="$(dirname "$OVERRIDE_FILE")"
  [ "$dir" = "." ] || mkdir -p "$dir"
  cat > "$OVERRIDE_FILE" <<EOF
services:
  ${WEB_SERVICE}:
    group_add:
      - "\${DOCKER_SOCKET_GID:-${gid}}"
EOF
}

repair_socket_permission() {
  local restart=0 state gid enabled

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --restart)
        restart=1
        ;;
      *)
        echo "Usage: $0 repair [--restart]" >&2
        exit 2
        ;;
    esac
    shift
  done

  check_webui_docker_access
  state="$DOCKER_SOCKET_ACCESS_STATE"

  if [ "$state" = "ok" ]; then
    log "No socket repair is needed."
    return 0
  fi

  if [ "$state" != "socket_permission" ]; then
    log "No automatic socket-GID repair is available for state=$state."
    return 1
  fi

  gid="$(socket_gid)"
  [ -n "$gid" ] || {
    log "Could not determine Docker socket GID."
    return 1
  }

  write_env_value DOCKER_SOCKET_GID "$gid"
  log "Recorded DOCKER_SOCKET_GID=$gid in $ENV_FILE."

  enabled="${ENABLE_DOCKER_SOCKET_GROUP_FIX:-$(env_value ENABLE_DOCKER_SOCKET_GROUP_FIX 2>/dev/null || true)}"
  if [ "$enabled" != "1" ]; then
    log "Set ENABLE_DOCKER_SOCKET_GROUP_FIX=1 in $ENV_FILE, then run: dune console repair-docker-socket --restart"
    return 0
  fi

  write_compose_override "$gid"
  log "Wrote compose override: $OVERRIDE_FILE"

  if [ "$restart" -eq 1 ]; then
    runtime/scripts/console.sh restart
  else
    log "Run this to apply it: dune console restart"
  fi
}

cmd="${1:-check}"
shift || true
case "$cmd" in
  check|status)
    check_webui_docker_access
    ;;
  repair|heal)
    repair_socket_permission "$@"
    ;;
  help|--help|-h)
    cat <<'EOF'
Usage:
  repair-docker-socket-access.sh check
  repair-docker-socket-access.sh repair [--restart]
EOF
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    exit 2
    ;;
esac
