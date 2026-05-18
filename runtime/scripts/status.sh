#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
[ -f .env ] && . ./.env
[ -f runtime/generated/battlegroup.env ] && . runtime/generated/battlegroup.env
set +a

is_running() {
  local name="$1"
  docker ps --format '{{.Names}}' | grep -qx "$name"
}

is_private_ipv4() {
  local ip="$1"
  printf '%s' "$ip" | grep -Eq '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.)'
}

container_status() {
  local name="$1"
  if is_running "$name"; then
    docker ps --filter "name=^${name}$" --format '{{.Status}}'
  elif docker inspect "$name" >/dev/null 2>&1; then
    docker inspect "$name" --format '{{.State.Status}}'
  else
    echo "missing"
  fi
}

check_tcp() {
  local port="$1"
  if ss -lntp | grep -q ":$port "; then
    echo "OK"
  else
    echo "MISSING"
  fi
}

check_udp() {
  local port="$1"
  if ss -lnup | grep -q ":$port "; then
    echo "OK"
  else
    echo "MISSING"
  fi
}

map_state() {
  local container="$1"
  local pattern="$2"

  if ! is_running "$container"; then
    echo "NOT RUNNING"
    return
  fi

  local logs
  logs="$(docker logs "$container" 2>&1 || true)"

  if grep -Eq "$pattern" <<< "$logs"; then
    echo "READY"
  elif grep -Eiq 'fatal error|segmentation fault|sigsegv|assertion failed|unhandled exception|core dumped|panic:' <<< "$logs"; then
    echo "ERROR"
  else
    echo "WARMING"
  fi
}

count_rmq_prefix() {
  local prefix="$1"

  docker exec dune-rmq-game rabbitmqctl list_connections user state 2>/dev/null \
    | awk -v prefix="$prefix" '$1 != "user" && index($1, prefix) == 1 && $2 == "running" { n++ } END { print n + 0 }'
}

count_external_rmq_connections() {
  docker exec dune-rmq-game rabbitmqctl list_connections user state 2>/dev/null \
    | awk '$1 != "user" && index($1, "sg.") != 1 && index($1, "bgd.") != 1 && index($1, "tr.") != 1 && $2 == "running" { n++ } END { print n + 0 }'
}

recent_director_logs() {
  docker logs --since 15m dune-director 2>&1 || true
}

latest_number_from_director_logs() {
  local key="$1"
  recent_director_logs \
    | grep -o "\"$key\":[0-9.]*" \
    | tail -n1 \
    | awk -F: '{ print $2 }'
}

display_mode="${SERVER_IP_MODE:-}"

if [ -z "$display_mode" ] || [ "$display_mode" = "unknown" ]; then
  if [ -n "${SERVER_IP:-}" ]; then
    if is_private_ipv4 "$SERVER_IP"; then
      display_mode="local"
    else
      display_mode="public"
    fi
  else
    display_mode="unknown"
  fi
fi

echo "=== Dune status ==="
echo "Title:       ${SERVER_TITLE:-unknown}"
echo "Region:      ${SERVER_REGION:-unknown}"
echo "Mode:        $display_mode"
echo "Server IP:   ${SERVER_IP:-unknown}"
echo "Battlegroup: ${BATTLEGROUP_ID:-unknown}"

echo
echo "=== Containers ==="
printf "%-26s %s\n" "SERVICE" "STATUS"
for c in \
  dune-postgres \
  dune-rmq-admin \
  dune-rmq-game \
  dune-text-router \
  dune-director \
  dune-server-gateway \
  dune-server-survival-1 \
  dune-server-overmap \
  dune-orchestrator
do
  printf "%-26s %s\n" "$c" "$(container_status "$c")"
done

echo
echo "=== Listeners ==="
printf "%-24s %-8s %s\n" "CHECK" "PORT" "STATUS"
printf "%-24s %-8s %s\n" "Postgres localhost" "15432/tcp" "$(check_tcp 15432)"
printf "%-24s %-8s %s\n" "RabbitMQ admin" "32573/tcp" "$(check_tcp 32573)"
printf "%-24s %-8s %s\n" "RabbitMQ game" "31982/tcp" "$(check_tcp 31982)"
printf "%-24s %-8s %s\n" "TextRouter" "5059/tcp" "$(check_tcp 5059)"
printf "%-24s %-8s %s\n" "Director" "11717/tcp" "$(check_tcp 11717)"
printf "%-24s %-8s %s\n" "Overmap clients" "7777/udp" "$(check_udp 7777)"
printf "%-24s %-8s %s\n" "Survival_1 clients" "7778/udp" "$(check_udp 7778)"
printf "%-24s %-8s %s\n" "Survival_1 S2S" "7888/udp" "$(check_udp 7888)"
printf "%-24s %-8s %s\n" "Overmap S2S" "7889/udp" "$(check_udp 7889)"

echo
echo "=== Database ==="
if is_running dune-postgres; then
  partition_count="$(docker exec dune-postgres psql -U dune -d dune -Atc "select count(*) from world_partition;" 2>/dev/null | tr -d '[:space:]' || true)"
  echo "World partitions: ${partition_count:-unknown}"
else
  echo "World partitions: unavailable because Postgres is not running"
fi

echo
echo "=== Game servers ==="
printf "%-12s %-10s %s\n" "MAP" "STATE" "UPTIME"
printf "%-12s %-10s %s\n" "Survival_1" "$(map_state dune-server-survival-1 'Server farm is READY .*partition 1')" "$(container_status dune-server-survival-1)"
printf "%-12s %-10s %s\n" "Overmap" "$(map_state dune-server-overmap 'Server farm is READY .*partition 2')" "$(container_status dune-server-overmap)"

echo
echo "=== RabbitMQ game connections ==="
if is_running dune-rmq-game; then
  echo "Director connections:    $(count_rmq_prefix 'bgd.')"
  echo "Game server connections: $(count_rmq_prefix 'sg.')"
  echo "TextRouter connections:  $(count_rmq_prefix 'tr.')"
  echo "External/client entries: $(count_external_rmq_connections)"
else
  echo "RabbitMQ game is not running"
fi

echo
echo "=== Funcom/FLS status ==="
director_logs="$(recent_director_logs)"

if grep -q 'Battlegroups_SendBattlegroupHeartbeat.*Request successful' <<< "$director_logs"; then
  echo "Director heartbeat: OK"
else
  echo "Director heartbeat: WAIT"
fi

if grep -q 'Battlegroups_DeclarePopulationAndActivity.*Request successful' <<< "$director_logs"; then
  active="$(latest_number_from_director_logs 'BattlegroupCurrentActive' || true)"
  capacity="$(latest_number_from_director_logs 'BattlegroupMaxPlayerCapacity' || true)"
  echo "Population declaration: OK"
  echo "Last declared population: ${active:-unknown}/${capacity:-unknown}"
else
  echo "Population declaration: WAIT"
fi

if grep -q 'Battlegroups_DeclareMaxPlayerCapacities.*Request successful' <<< "$director_logs"; then
  echo "Max capacity declaration: OK"
else
  echo "Max capacity declaration: WAIT"
fi

if docker logs --tail 5000 dune-server-gateway 2>&1 | grep -q 'Monitoring for servers going up or down'; then
  echo "Gateway DB monitoring: OK"
else
  echo "Gateway DB monitoring: WAIT"
fi

echo
echo "Tip: use 'dune ready' for pass/wait/fail readiness checks."
echo "Tip: use 'dune logs <service>' when you need detailed logs."
