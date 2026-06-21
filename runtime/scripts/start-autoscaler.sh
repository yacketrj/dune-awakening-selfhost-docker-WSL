#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source runtime/scripts/host-paths.sh

CONTAINER_NAME="dune-autoscaler"
IMAGE="dune-orchestrator:dev"
DOCKER_SOCKET_PATH="${DUNE_DOCKER_SOCKET_PATH:-/var/run/docker.sock}"

mkdir -p runtime/generated runtime/logs

docker_socket_gid() {
  [ -e "$DOCKER_SOCKET_PATH" ] || return 1
  stat -c '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || stat -f '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null
}

socket_group_args=()
docker_socket_gid_value=""
if docker_socket_gid_value="$(docker_socket_gid)" && [ -n "$docker_socket_gid_value" ]; then
  socket_group_args=(--group-add "$docker_socket_gid_value")
fi

autoscaler_docker_access_ok() {
  docker exec "$CONTAINER_NAME" sh -lc 'docker ps >/dev/null 2>&1' >/dev/null 2>&1
}

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  if autoscaler_docker_access_ok; then
    echo "Autoscaler already running: $CONTAINER_NAME"
    exit 0
  fi

  echo "Autoscaler container is running but cannot access Docker; recreating it with socket group access..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if ! docker ps --format '{{.Names}}' | grep -qx dune-director; then
  echo "Cannot start autoscaler: dune-director is not running."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx dune-postgres; then
  echo "Cannot start autoscaler: dune-postgres is not running."
  exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Cannot start autoscaler: Docker image not found: $IMAGE"
  echo "Start or build the orchestrator first:"
  echo "  docker compose up -d --build orchestrator"
  exit 1
fi

echo "Starting autoscaler container..."
if [ -n "$docker_socket_gid_value" ]; then
  echo "Docker socket group: $docker_socket_gid_value"
fi
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host \
  --restart unless-stopped \
  --entrypoint bash \
  "${socket_group_args[@]}" \
  -e "DUNE_CONTAINER_REPO_ROOT=${DUNE_CONTAINER_REPO_ROOT:-$PWD}" \
  -e "DUNE_HOST_REPO_ROOT=${DUNE_HOST_REPO_ROOT:-$PWD}" \
  -e "DOCKER_SOCKET_GID=${DOCKER_SOCKET_GID:-$docker_socket_gid_value}" \
  -v "$DOCKER_SOCKET_PATH:/var/run/docker.sock" \
  -v "$(host_path "$PWD"):$PWD" \
  -w "$PWD" \
  "$IMAGE" \
  runtime/scripts/autoscaler.sh >/dev/null

echo "Autoscaler started: $CONTAINER_NAME"
echo "Logs:"
echo "  dune autoscaler logs"
