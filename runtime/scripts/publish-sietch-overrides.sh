#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

PID_FILE="runtime/generated/sietch-overrides.pid"
LOG_FILE="runtime/generated/sietch-overrides.log"
TEXT_ROUTER_LOG="runtime/text-router/director-current.log"
CONFIG_FILE="runtime/generated/sietch-config.json"

SOURCE_EXCHANGE="completions"
TARGET_MAPS=(Survival_1 Overmap)

queue_suffix_for_map() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_' '_'
}

source_routing_key_for_map() {
  echo "server_state.$1"
}

source_filter_queue_for_map() {
  echo "sietchOverrideSource$(queue_suffix_for_map "$1")"
}

sink_queue_for_map() {
  echo "serverStateSink_$1"
}

filter_exchange_for_map() {
  echo "sietchOverrideFilteredState_$(queue_suffix_for_map "$1")"
}

default_player_cap_for_map() {
  case "$1" in
    Survival_1|Overmap) echo 40 ;;
    *) echo -1 ;;
  esac
}

ensure_text_router_log() {
  local container_log
  mkdir -p runtime/text-router
  container_log="$(docker exec dune-text-router sh -lc 'find /Tools/Battlegroups/TextRouter/TextRouter/logs -maxdepth 1 -type f -name "director*.log" | sort | tail -n 1' 2>/dev/null | tr -d '\r')"
  [ -n "$container_log" ] || return 1
  docker cp "dune-text-router:${container_log}" "$TEXT_ROUTER_LOG" >/dev/null
}

load_rmq_admin_creds() {
  ensure_text_router_log

  python3 - <<'PY'
from pathlib import Path
import re
import sys

log_path = Path("runtime/text-router/director-current.log")
if not log_path.exists():
    sys.exit(1)

pattern = re.compile(r'(bgd\.[^/\s]+\.admin)/([A-Za-z0-9+/=]+) => allow administrator')
matches = pattern.findall(log_path.read_text(errors="ignore"))
if not matches:
    sys.exit(1)

username, password = matches[-1]
print(username)
print(password)
PY
}

rmq_admin() {
  local rmq_user rmq_password
  mapfile -t rmq_creds < <(load_rmq_admin_creds)
  [ "${#rmq_creds[@]}" -ge 2 ] || return 1
  rmq_user="${rmq_creds[0]}"
  rmq_password="${rmq_creds[1]}"
  docker exec dune-rmq-admin rabbitmqadmin -q -u "$rmq_user" -p "$rmq_password" "$@"
}

ensure_route() {
  local map_name="$1"
  local source_routing_key sink_queue filter_exchange source_filter_queue
  source_routing_key="$(source_routing_key_for_map "$map_name")"
  sink_queue="$(sink_queue_for_map "$map_name")"
  filter_exchange="$(filter_exchange_for_map "$map_name")"
  source_filter_queue="$(source_filter_queue_for_map "$map_name")"

  rmq_admin declare exchange name="$filter_exchange" type=direct durable=true >/dev/null
  rmq_admin declare queue name="$source_filter_queue" durable=true >/dev/null
  rmq_admin purge queue name="$source_filter_queue" >/dev/null || true
  rmq_admin declare binding \
    source="$SOURCE_EXCHANGE" \
    destination="$source_filter_queue" \
    destination_type=queue \
    routing_key="$source_routing_key" >/dev/null
  rmq_admin declare binding \
    source="$filter_exchange" \
    destination="$sink_queue" \
    destination_type=queue \
    routing_key="$source_routing_key" >/dev/null
  rmq_admin delete binding \
    source="$SOURCE_EXCHANGE" \
    destination_type=queue \
    destination="$sink_queue" \
    properties_key="$source_routing_key" >/dev/null 2>&1 || true
}

restore_route() {
  local map_name="$1"
  local source_routing_key sink_queue filter_exchange
  source_routing_key="$(source_routing_key_for_map "$map_name")"
  sink_queue="$(sink_queue_for_map "$map_name")"
  filter_exchange="$(filter_exchange_for_map "$map_name")"

  rmq_admin declare binding \
    source="$SOURCE_EXCHANGE" \
    destination="$sink_queue" \
    destination_type=queue \
    routing_key="$source_routing_key" >/dev/null || true
  rmq_admin delete binding \
    source="$filter_exchange" \
    destination_type=queue \
    destination="$sink_queue" \
    properties_key="$source_routing_key" >/dev/null 2>&1 || true
}

publish_payload() {
  local map_name="$1"
  local payload="$2"
  local filter_exchange source_routing_key
  filter_exchange="$(filter_exchange_for_map "$map_name")"
  source_routing_key="$(source_routing_key_for_map "$map_name")"

  rmq_admin publish \
    exchange="$filter_exchange" \
    routing_key="$source_routing_key" \
    properties='{"content_type":"Content","type":"server_state"}' \
    payload="$payload" >/dev/null
}

publish_snapshot_once() {
  local map_name="$1"
  local player_cap
  player_cap="$(default_player_cap_for_map "$map_name")"
  local rows
  rows="$(python3 - "$map_name" "$player_cap" <<'PY'
import json
import subprocess
import sys
import time
from pathlib import Path

target_map = sys.argv[1]
player_cap = int(sys.argv[2])
config_path = Path("runtime/generated/sietch-config.json")
config = json.loads(config_path.read_text()) if config_path.exists() else {"partitions": {}}
partitions = config.get("partitions", {})

query = """
select wp.partition_id,
       wp.map,
       coalesce(wp.server_id, ''),
       coalesce(fs.ready, false),
       case when lower(wp.map) = lower('Survival_1') then true else false end as is_starting_map,
       coalesce(wp.label, '')
from dune.world_partition wp
left join dune.farm_state fs on fs.server_id = wp.server_id
where coalesce(wp.server_id, '') <> ''
  and lower(wp.map) = lower(%s)
order by wp.partition_id;
""" % (repr(target_map))

result = subprocess.run(
    [
        "docker", "exec", "dune-postgres",
        "psql", "-U", "postgres", "-d", "dune",
        "-At", "-F", "\t", "-c", query,
    ],
    check=True,
    text=True,
    capture_output=True,
)

defaults = {
    "Difficulty": "Custom",
    "CoreSettings": {
        "serverDisplayName": "",
        "doubleDifficultyLoot": "False",
    },
    "SurvivalSettings": {
        "hydrationEnabled": "True",
        "sandstormEnabled": "0",
        "sandStormAutoSpawn": "True",
        "sandStormCoriolisAutoSpawnEnabled": "True",
        "sandStormTreasureEnabled": "1",
        "sandwormEnabled": "1",
        "sandwormSpawningType": "0",
        "sandwormDangerZonesEnabled": "True",
        "vehicleSandwormCollisionInteraction": "False",
        "vehicleSandwormInvulnerabilitySecondsOnExit": "900.0",
        "vehicleSandwormInvulnerabilitySecondsOnServerRestart": "7200.0",
    },
    "CombatSettings": {
        "securityZonesForceEnablePvp": "False",
        "areSecurityZonesEnabled": "True",
        "shouldForceEnablePvpOnAllPartitions": "",
        "itemDeteriorationUpdateRate": "1.0",
        "vehicleDurabilityDamageMultiplier": "1.0",
        "inventoryDecayedMaxDurabilityThreshold": "0.2",
    },
    "HarvestingSettings": {
        "miningOutputMultiplier": "1.0",
        "vehicleMiningOutputMultiplier": "1.0",
        "securityZonesPvpResourceMultiplier": "2.5",
    },
    "PersistenceSettings": {
        "buildingBlueprintMaxExtensions": "4",
        "baseBackupMaxExtensions": "8",
    },
}

for line in result.stdout.splitlines():
    if not line.strip():
        continue
    partition_id, map_name, server_id, ready, is_starting_map, label = line.split("\t")
    cfg = partitions.get(partition_id, {})
    display_name = cfg.get("display_name", "")
    if not display_name and label:
        display_name = f"Sietch {label}"
    password = cfg.get("password", "")
    payload = {
        "reportTimestamp": int(time.time()),
        "partitionId": int(partition_id),
        "serverId": server_id,
        "ready": ready.lower() in ("t", "true", "1"),
        "loginPassword": password if target_map.lower() == "survival_1" else "",
        "displayName": display_name if target_map.lower() == "survival_1" else "",
        "isStartingMap": is_starting_map.lower() in ("t", "true", "1"),
        "playerHardCapOverride": player_cap,
        "wauCapCurve": -1,
        "players": [],
        "serverGameplaySettings": json.loads(json.dumps(defaults)),
    }
    payload["serverGameplaySettings"]["CoreSettings"]["serverDisplayName"] = display_name if target_map.lower() == "survival_1" else ""
    print(json.dumps(payload, separators=(",", ":")))
PY
)"

  [ -n "$rows" ] || return 0
  while IFS= read -r payload; do
    [ -n "$payload" ] || continue
    publish_payload "$map_name" "$payload"
  done <<< "$rows"
}

forward_batch_once() {
  local map_name="$1"
  local player_cap
  player_cap="$(default_player_cap_for_map "$map_name")"
  local source_filter_queue
  source_filter_queue="$(source_filter_queue_for_map "$map_name")"
  local messages
  messages="$(rmq_admin --format=raw_json get queue="$source_filter_queue" count=20 ackmode=ack_requeue_false)"
  [ "$messages" != "[]" ] || return 1

  FILTER_MESSAGES="$messages" FILTER_CONFIG_PATH="$CONFIG_FILE" TARGET_MAP_NAME="$map_name" TARGET_PLAYER_CAP="$player_cap" python3 - <<'PY'
import json
import os
import subprocess
import time
from pathlib import Path

messages = json.loads(os.environ["FILTER_MESSAGES"])
config_path = Path(os.environ["FILTER_CONFIG_PATH"])
target_map = os.environ["TARGET_MAP_NAME"]
target_player_cap = int(os.environ["TARGET_PLAYER_CAP"])
config = json.loads(config_path.read_text()) if config_path.exists() else {"partitions": {}}
partition_cfg = config.get("partitions", {})
label_rows_raw = subprocess.check_output([
    "docker", "exec", "dune-postgres", "psql",
    "-U", "postgres", "-d", "dune", "-At", "-F", "\t",
    "-c", f"select partition_id, coalesce(label, '') from dune.world_partition where lower(map)=lower('{target_map}');"
], text=True)
label_by_partition = {}
for line in label_rows_raw.splitlines():
    if not line.strip():
        continue
    partition_id, label = line.split("\t", 1)
    label_by_partition[partition_id] = label

for message in messages:
    payload = json.loads(message["payload"])
    partition_id = str(payload.get("partitionId"))
    cfg = partition_cfg.get(partition_id, {})
    display_name = cfg.get("display_name", "")
    if target_map.lower() == "survival_1" and not display_name:
        label = label_by_partition.get(partition_id, "")
        if label:
            display_name = f"Sietch {label}"
    password = cfg.get("password", "") if target_map.lower() == "survival_1" else ""
    if target_map.lower() == "survival_1":
        payload["displayName"] = display_name
        payload["loginPassword"] = password
    gameplay = payload.setdefault("serverGameplaySettings", {})
    core = gameplay.setdefault("CoreSettings", {})
    if target_map.lower() == "survival_1":
        core["serverDisplayName"] = display_name
    current_cap = payload.get("playerHardCapOverride", -1)
    try:
        current_cap = int(current_cap)
    except Exception:
        current_cap = -1
    if current_cap <= 0 and target_player_cap > 0:
        payload["playerHardCapOverride"] = target_player_cap
    payload["reportTimestamp"] = max(int(time.time()), int(payload.get("reportTimestamp", 0)))
    print(json.dumps(payload, separators=(",", ":")))
PY
}

start_loop() {
  mkdir -p runtime/generated
  local route_refresh_at=0
  local map_name
  for map_name in "${TARGET_MAPS[@]}"; do
    ensure_route "$map_name" >>"$LOG_FILE" 2>&1 || true
  done
  publish_snapshot_once "Survival_1" >>"$LOG_FILE" 2>&1 || true
  publish_snapshot_once "Overmap" >>"$LOG_FILE" 2>&1 || true
  while true; do
    if [ "$(date +%s)" -ge "$route_refresh_at" ]; then
      for map_name in "${TARGET_MAPS[@]}"; do
        ensure_route "$map_name" >>"$LOG_FILE" 2>&1 || true
      done
      route_refresh_at=$(( $(date +%s) + 10 ))
    fi
    for map_name in "${TARGET_MAPS[@]}"; do
      if rows="$(forward_batch_once "$map_name")"; then
        while IFS= read -r payload; do
          [ -n "$payload" ] || continue
          publish_payload "$map_name" "$payload" >>"$LOG_FILE" 2>&1 || true
        done <<< "$rows"
      fi
    done
    sleep 1
  done
}

case "${1:-start}" in
  once)
    for map_name in "${TARGET_MAPS[@]}"; do
      ensure_route "$map_name"
      rows="$(forward_batch_once "$map_name" || true)"
      if [ -n "${rows:-}" ]; then
        while IFS= read -r payload; do
          [ -n "$payload" ] || continue
          publish_payload "$map_name" "$payload"
        done <<< "$rows"
      elif [ "$map_name" = "Survival_1" ] || [ "$map_name" = "Overmap" ]; then
        publish_snapshot_once "$map_name"
      fi
    done
    ;;
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      exit 0
    fi
    mkdir -p runtime/generated
    : >"$LOG_FILE"
    setsid "$0" loop >>"$LOG_FILE" 2>&1 </dev/null &
    echo $! >"$PID_FILE"
    ;;
  loop)
    start_loop
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null || true
      rm -f "$PID_FILE"
    fi
    for map_name in "${TARGET_MAPS[@]}"; do
      restore_route "$map_name" || true
    done
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  *)
    echo "Usage: $0 [once|start|stop|restart]"
    exit 2
    ;;
esac
