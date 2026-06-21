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

assert_contains runtime/scripts/repair-world-partitions.sh "CREATE OR REPLACE FUNCTION dune.get_active_servers_for_gateway"
assert_contains runtime/scripts/repair-world-partitions.sh "CREATE OR REPLACE FUNCTION dune.load_world_partition"
assert_contains runtime/scripts/repair-world-partitions.sh "partition-repair-sentinel: gateway-wp-map"
assert_contains runtime/scripts/repair-world-partitions.sh "partition-repair-sentinel: load-world-partition-overmap"
assert_contains runtime/scripts/repair-world-partitions.sh "in_desired_dimension_index bigint DEFAULT 0"
assert_contains runtime/scripts/repair-world-partitions.sh "in_desired_partition_id bigint DEFAULT NULL::bigint"
assert_contains runtime/scripts/repair-world-partitions.sh "wp.map = 'Overmap'"
assert_contains runtime/scripts/repair-world-partitions.sh "wp.partition_id < \${ALIAS_PARTITION_MIN_ID}"
assert_contains runtime/scripts/repair-world-partitions.sh "resolve_client_port_base"
assert_contains runtime/scripts/repair-world-partitions.sh 'SURVIVAL_PORT="${SURVIVAL_PORT:-$((CLIENT_PORT_BASE_VALUE + 1))}"'
assert_contains runtime/scripts/repair-world-partitions.sh 'OVERMAP_PORT="${OVERMAP_PORT:-$CLIENT_PORT_BASE_VALUE}"'
assert_contains runtime/scripts/repair-world-partitions.sh "PARTITION_PORT_MAP"

assert_contains runtime/scripts/autoscaler.sh "WORLD_PARTITION_HEAL_SECONDS"
assert_contains runtime/scripts/autoscaler.sh "repair_world_partitions_due"
assert_contains runtime/scripts/dune "dune repair [world-partitions|core-ready]"
assert_contains runtime/scripts/dune "runtime/scripts/repair-world-partitions.sh"

echo "PASS: world partition repair is wired into self-heal"
