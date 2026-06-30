#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

command_name="${1:-status}"
compose_file="docker-compose.metrics.yml"
prometheus_port="${METRICS_PROMETHEUS_PORT:-}"

if [ -z "$prometheus_port" ] && [ -f .env ]; then
  prometheus_port="$(awk -F= '/^METRICS_PROMETHEUS_PORT=/ {print $2; exit}' .env | tr -d '[:space:]"'\'' || true)"
fi
prometheus_port="${prometheus_port:-9090}"

compose() {
  COMPOSE_PROJECT_NAME="${DUNE_COMPOSE_PROJECT_NAME:-dune-awakening-selfhost-docker}" \
    docker compose -f "$compose_file" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not available."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not reachable from this shell."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required."
    exit 1
  fi
}

ensure_compose_file() {
  if [ ! -f "$compose_file" ]; then
    echo "Missing $compose_file."
    exit 1
  fi
}

ensure_network() {
  docker network create dune-net >/dev/null 2>&1 || true
}

print_url() {
  echo "Prometheus: http://127.0.0.1:${prometheus_port}"
}

curl_prometheus() {
  local path="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "http://127.0.0.1:${prometheus_port}${path}"
    return $?
  fi
  return 127
}

show_status() {
  require_docker
  ensure_compose_file

  echo "=== Metrics containers ==="
  docker ps -a \
    --filter "name=dune-prometheus" \
    --filter "name=dune-node-exporter" \
    --filter "name=dune-cadvisor" \
    --filter "name=dune-postgres-exporter" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true

  echo
  echo "=== Prometheus health ==="
  if curl_prometheus "/-/healthy" >/dev/null 2>&1; then
    echo "healthy"
    print_url
  else
    echo "not reachable on 127.0.0.1:${prometheus_port}"
  fi

  echo
  echo "=== Prometheus targets ==="
  if command -v curl >/dev/null 2>&1 && curl_prometheus "/api/v1/targets" >/tmp/dune-prometheus-targets.json 2>/dev/null; then
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<'PY'
import json
from pathlib import Path
payload = json.loads(Path('/tmp/dune-prometheus-targets.json').read_text())
for target in payload.get('data', {}).get('activeTargets', []):
    labels = target.get('labels', {})
    job = labels.get('job', '-')
    instance = labels.get('instance', '-')
    health = target.get('health', '-')
    last_error = target.get('lastError') or ''
    suffix = f" ({last_error})" if last_error else ''
    print(f"{job}\t{instance}\t{health}{suffix}")
PY
    else
      echo "Target API reachable. Install python3 for formatted target output."
    fi
    rm -f /tmp/dune-prometheus-targets.json
  else
    echo "target API unavailable"
  fi
}

case "$command_name" in
  start|up)
    require_docker
    ensure_compose_file
    ensure_network
    echo "Starting Dune metrics stack..."
    compose up -d
    echo
    show_status
    ;;

  stop|down)
    require_docker
    ensure_compose_file
    echo "Stopping Dune metrics stack..."
    compose down
    ;;

  restart)
    require_docker
    ensure_compose_file
    ensure_network
    echo "Restarting Dune metrics stack..."
    compose down
    compose up -d
    echo
    show_status
    ;;

  status|ps)
    show_status
    ;;

  logs)
    require_docker
    ensure_compose_file
    shift || true
    compose logs "$@"
    ;;

  config)
    require_docker
    ensure_compose_file
    compose config
    ;;

  pull)
    require_docker
    ensure_compose_file
    compose pull
    ;;

  help|--help|-h)
    cat <<'EOF'
Usage:
  dune metrics start
  dune metrics stop
  dune metrics restart
  dune metrics status
  dune metrics logs [service]
  dune metrics config
  dune metrics pull

The metrics stack is opt-in and independent from the game stack.
Prometheus binds to 127.0.0.1:9090 by default.
EOF
    ;;

  *)
    echo "Unknown metrics command: $command_name"
    echo "Run: dune metrics --help"
    exit 1
    ;;
esac
