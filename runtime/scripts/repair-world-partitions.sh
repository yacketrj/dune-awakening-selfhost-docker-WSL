#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source runtime/scripts/runtime-env.sh

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-dune-postgres}"
POSTGRES_DB="${POSTGRES_DB:-dune}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

CLIENT_PORT_BASE_VALUE="$(resolve_client_port_base)"
SURVIVAL_PORT="${SURVIVAL_PORT:-$((CLIENT_PORT_BASE_VALUE + 1))}"
OVERMAP_PORT="${OVERMAP_PORT:-$CLIENT_PORT_BASE_VALUE}"
SURVIVAL_PARTITION_ID="${SURVIVAL_PARTITION_ID:-${DUNE_SURVIVAL_PARTITION_ID:-1}}"
OVERMAP_PARTITION_ID="${OVERMAP_PARTITION_ID:-${DUNE_OVERMAP_PARTITION_ID:-2}}"

REPAIR_WATCH="${REPAIR_WATCH:-0}"
REPAIR_INTERVAL="${REPAIR_INTERVAL:-30}"
REPAIR_PATCH_DB_FUNCTIONS="${REPAIR_PATCH_DB_FUNCTIONS:-1}"
ALIAS_PARTITION_MIN_ID="${ALIAS_PARTITION_MIN_ID:-90}"

DEFAULT_PARTITION_DEF='{"box": {"max_x": 1, "max_y": 1, "min_x": 0, "min_y": 0}, "type": "box2d_array"}'

usage() {
  cat <<'EOF'
Usage:
  dune repair world-partitions [once|watch]
  runtime/scripts/repair-world-partitions.sh [once|watch]

Environment:
  PARTITION_PORT_MAP='{"7778":"Overmap","7779":"Survival_1"}'
  REPAIR_PATCH_DB_FUNCTIONS=0   Skip DB function patches
  ALIAS_PARTITION_MIN_ID=90     Preserve operator alias rows at/above this id
EOF
}

die() {
  echo "[partition-repair] ERROR: $*" >&2
  exit 1
}

log() {
  echo "[partition-repair] $*" >&2
}

require_uint() {
  local label="$1"
  local value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$label must be an unsigned integer: $value"
}

require_container() {
  docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
    || die "Postgres container '$POSTGRES_CONTAINER' is not running"
}

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

target_values_sql() {
  PARTITION_PORT_MAP="${PARTITION_PORT_MAP:-}" \
  SURVIVAL_PORT="$SURVIVAL_PORT" \
  SURVIVAL_PARTITION_ID="$SURVIVAL_PARTITION_ID" \
  OVERMAP_PORT="$OVERMAP_PORT" \
  OVERMAP_PARTITION_ID="$OVERMAP_PARTITION_ID" \
  python3 - <<'PY'
import json
import os
import sys

def sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"

raw = os.environ.get("PARTITION_PORT_MAP", "").strip()
if raw:
    try:
        port_map = {int(k): str(v) for k, v in json.loads(raw).items()}
    except Exception as exc:
        raise SystemExit(f"invalid PARTITION_PORT_MAP JSON: {exc}")
else:
    port_map = {
        int(os.environ["OVERMAP_PORT"]): "Overmap",
        int(os.environ["SURVIVAL_PORT"]): "Survival_1",
    }

preferred = {
    "Overmap": int(os.environ.get("OVERMAP_PARTITION_ID", "2")),
    "Survival_1": int(os.environ.get("SURVIVAL_PARTITION_ID", "1")),
}

rows = []
for port, map_name in sorted(port_map.items()):
    preferred_id = preferred.get(map_name)
    preferred_sql = str(preferred_id) if preferred_id else "NULL"
    rows.append(f"({port}, {preferred_sql}, {sql_text(map_name)}, 0)")

if not rows:
    raise SystemExit("no partition repair targets configured")

print(",\n  ".join(rows))
PY
}

patch_db_functions_sql() {
  cat <<'SQL'
\echo '[partition-repair] database function patch check'

DO $$
DECLARE
  body text;
BEGIN
  SELECT lower(p.prosrc)
  INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'dune'
    AND p.proname = 'get_active_servers_for_gateway'
  LIMIT 1;

  IF body IS NULL OR position('partition-repair-sentinel: gateway-wp-map' IN body) = 0 THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dune.get_active_servers_for_gateway()
      RETURNS TABLE(
        server_id text,
        map text,
        partition_id bigint,
        dimension_index integer,
        game_addr inet,
        game_port integer,
        revision integer
      )
      LANGUAGE plpgsql AS $body$
      BEGIN
        -- partition-repair-sentinel: gateway-wp-map
        RETURN QUERY
          SELECT
            fs.server_id,
            wp.map,
            wp.partition_id,
            coalesce(wp.dimension_index, 0),
            fs.game_addr,
            fs.game_port,
            fs.revision
          FROM dune.active_server_ids AS asi
          JOIN dune.world_partition AS wp ON asi.server_id = wp.server_id
          JOIN dune.farm_state AS fs ON fs.server_id = asi.server_id;
      END
      $body$;
    $fn$;
    RAISE NOTICE 'patched get_active_servers_for_gateway: report wp.map and ignore unpartitioned phantom servers';
  ELSE
    RAISE NOTICE 'get_active_servers_for_gateway already patched';
  END IF;
END
$$;

DO $$
DECLARE
  body text;
BEGIN
  SELECT lower(p.prosrc)
  INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'dune'
    AND p.proname = 'load_world_partition'
  LIMIT 1;

  IF body IS NULL OR position('partition-repair-sentinel: load-world-partition-overmap' IN body) = 0 THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION dune.load_world_partition(
        in_map_name text,
        in_server_id text,
        in_desired_dimension_index bigint DEFAULT 0,
        in_desired_partition_id bigint DEFAULT NULL::bigint
      )
      RETURNS TABLE(
        partition_id bigint,
        partition_definition jsonb,
        dimension_index integer,
        blocked boolean,
        label text
      )
      LANGUAGE plpgsql AS $body$
      DECLARE
        tmp_partition record;
      BEGIN
        -- partition-repair-sentinel: load-world-partition-overmap
        SELECT INTO tmp_partition
          wp.partition_id,
          wp.partition_definition,
          wp.dimension_index,
          wp.blocked,
          wp.label
        FROM dune.world_partition wp
        WHERE wp.server_id = in_server_id
          AND wp.dimension_index = in_desired_dimension_index;

        IF tmp_partition.partition_id IS NOT NULL THEN
          RETURN QUERY SELECT
            tmp_partition.partition_id,
            tmp_partition.partition_definition,
            tmp_partition.dimension_index,
            tmp_partition.blocked,
            tmp_partition.label;
          RETURN;
        END IF;

        SELECT INTO tmp_partition
          wp.partition_id,
          wp.partition_definition,
          wp.dimension_index,
          wp.blocked,
          wp.label
        FROM dune.world_partition wp
        WHERE (
          wp.server_id IS NULL
          OR wp.server_id NOT IN (SELECT server_id FROM dune.active_server_ids)
        )
          AND (wp.map = in_map_name OR wp.map = 'Overmap')
          AND wp.dimension_index = in_desired_dimension_index
        ORDER BY
          (wp.map = in_map_name) DESC,
          (wp.partition_id = in_desired_partition_id) DESC,
          wp.partition_definition->'type',
          wp.partition_definition->'index',
          wp.partition_definition->'box'->'min_x',
          wp.partition_definition->'box'->'min_y'
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF tmp_partition.partition_id IS NULL THEN
          RETURN;
        END IF;

        INSERT INTO dune.farm_state(
          server_id,
          farm_id,
          outgoing_s2s_connections,
          incoming_s2s_connections,
          connected_players,
          igw_addr,
          igw_port,
          game_addr,
          game_port,
          map,
          revision
        )
        VALUES (
          in_server_id,
          '0',
          0,
          0,
          0,
          '0.0.0.0',
          0,
          '0.0.0.0',
          0,
          '',
          0
        )
        ON CONFLICT DO NOTHING;

        UPDATE dune.world_partition
        SET server_id = in_server_id
        WHERE partition_id = tmp_partition.partition_id;

        NOTIFY world_partition_update;

        RETURN QUERY SELECT
          tmp_partition.partition_id,
          tmp_partition.partition_definition,
          tmp_partition.dimension_index,
          tmp_partition.blocked,
          tmp_partition.label;
      END
      $body$;
    $fn$;
    RAISE NOTICE 'patched load_world_partition: server-id primary lookup and Overmap fallback';
  ELSE
    RAISE NOTICE 'load_world_partition already patched';
  END IF;
END
$$;
SQL
}

run_once() {
  local targets

  require_uint SURVIVAL_PORT "$SURVIVAL_PORT"
  require_uint OVERMAP_PORT "$OVERMAP_PORT"
  require_uint SURVIVAL_PARTITION_ID "$SURVIVAL_PARTITION_ID"
  require_uint OVERMAP_PARTITION_ID "$OVERMAP_PARTITION_ID"
  require_uint ALIAS_PARTITION_MIN_ID "$ALIAS_PARTITION_MIN_ID"

  targets="$(target_values_sql)"
  require_container

  log "repair target: container=$POSTGRES_CONTAINER db=$POSTGRES_DB user=$POSTGRES_USER"
  log "alias rows preserved: partition_id >= $ALIAS_PARTITION_MIN_ID"

  {
    if [ "$REPAIR_PATCH_DB_FUNCTIONS" = "1" ]; then
      patch_db_functions_sql
    else
      echo "\\echo '[partition-repair] database function patch check skipped'"
    fi

    cat <<SQL
SET search_path TO dune, public;

\\echo '[partition-repair] farm_state alive rows'
SELECT server_id, alive, game_port, map, revision
FROM farm_state
WHERE alive = true
ORDER BY game_port, revision DESC NULLS LAST, server_id;

\\echo '[partition-repair] world_partition before repair'
SELECT partition_id, server_id, map, dimension_index, blocked, label
FROM world_partition
ORDER BY partition_id;

BEGIN;

CREATE TEMP TABLE _partition_targets (
  game_port integer NOT NULL,
  preferred_partition_id bigint,
  map_name text NOT NULL,
  dimension_index integer NOT NULL DEFAULT 0
) ON COMMIT DROP;

INSERT INTO _partition_targets(game_port, preferred_partition_id, map_name, dimension_index)
VALUES
  $targets;

CREATE TEMP TABLE _partition_candidates AS
SELECT DISTINCT ON (t.game_port)
  t.game_port,
  t.preferred_partition_id,
  t.map_name,
  t.dimension_index,
  fs.server_id,
  fs.revision,
  EXISTS (
    SELECT 1
    FROM active_server_ids asi
    WHERE asi.server_id = fs.server_id
  ) AS has_active_db_connection
FROM _partition_targets t
JOIN farm_state fs
  ON fs.game_port = t.game_port
 AND fs.alive = true
ORDER BY
  t.game_port,
  has_active_db_connection DESC,
  fs.revision DESC NULLS LAST,
  fs.server_id;

\\echo '[partition-repair] selected repair candidates'
SELECT *
FROM _partition_candidates
ORDER BY game_port;

DO \$\$
DECLARE
  r record;
  existing_partition_for_server bigint;
  wrong_partition_for_server bigint;
  wrong_partition_map text;
  reusable_partition_id bigint;
  existing_pid_server text;
  existing_pid_active boolean;
BEGIN
  FOR r IN
    SELECT *
    FROM _partition_candidates
    ORDER BY game_port
  LOOP
    SELECT wp.partition_id
    INTO existing_partition_for_server
    FROM world_partition wp
    WHERE wp.server_id = r.server_id
      AND wp.map = r.map_name
      AND wp.partition_id < ${ALIAS_PARTITION_MIN_ID}
    LIMIT 1;

    IF existing_partition_for_server IS NOT NULL THEN
      UPDATE world_partition
      SET
        partition_definition = '${DEFAULT_PARTITION_DEF}'::jsonb,
        dimension_index = r.dimension_index,
        blocked = false
      WHERE partition_id = existing_partition_for_server;

      RAISE NOTICE
        'server % already owns partition_id=% map=%; normalized',
        left(r.server_id, 8),
        existing_partition_for_server,
        r.map_name;

      CONTINUE;
    END IF;

    SELECT wp.partition_id, wp.map
    INTO wrong_partition_for_server, wrong_partition_map
    FROM world_partition wp
    WHERE wp.server_id = r.server_id
      AND wp.partition_id < ${ALIAS_PARTITION_MIN_ID}
      AND wp.map <> r.map_name
    LIMIT 1;

    IF wrong_partition_for_server IS NOT NULL THEN
      UPDATE world_partition
      SET server_id = NULL
      WHERE partition_id = wrong_partition_for_server;

      RAISE NOTICE
        'server % owned wrong partition_id=% map=%; cleared before reassignment to map=%',
        left(r.server_id, 8),
        wrong_partition_for_server,
        wrong_partition_map,
        r.map_name;
    END IF;

    IF r.preferred_partition_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM world_partition wp
      WHERE wp.partition_id = r.preferred_partition_id
    ) THEN
      SELECT
        wp.server_id,
        EXISTS (
          SELECT 1
          FROM active_server_ids asi
          WHERE asi.server_id = wp.server_id
        )
      INTO existing_pid_server, existing_pid_active
      FROM world_partition wp
      WHERE wp.partition_id = r.preferred_partition_id;

      IF existing_pid_server IS NULL OR existing_pid_active IS FALSE OR existing_pid_server = r.server_id THEN
        UPDATE world_partition
        SET
          server_id = r.server_id,
          map = r.map_name,
          partition_definition = '${DEFAULT_PARTITION_DEF}'::jsonb,
          dimension_index = r.dimension_index,
          blocked = false
        WHERE partition_id = r.preferred_partition_id;

        RAISE NOTICE
          'claimed preferred partition_id=% map=% for server %',
          r.preferred_partition_id,
          r.map_name,
          left(r.server_id, 8);
      ELSE
        RAISE WARNING
          'preferred partition_id=% is owned by active server %; not overwriting',
          r.preferred_partition_id,
          left(existing_pid_server, 8);
      END IF;

      CONTINUE;
    END IF;

    SELECT wp.partition_id
    INTO reusable_partition_id
    FROM world_partition wp
    WHERE wp.partition_id < ${ALIAS_PARTITION_MIN_ID}
      AND wp.map = r.map_name
      AND (
        wp.server_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM active_server_ids asi
          WHERE asi.server_id = wp.server_id
        )
      )
    ORDER BY
      (wp.server_id IS NULL) DESC,
      wp.partition_id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF reusable_partition_id IS NOT NULL THEN
      UPDATE world_partition
      SET
        server_id = r.server_id,
        partition_definition = '${DEFAULT_PARTITION_DEF}'::jsonb,
        dimension_index = r.dimension_index,
        blocked = false
      WHERE partition_id = reusable_partition_id;

      RAISE NOTICE
        'reused partition_id=% map=% for server %',
        reusable_partition_id,
        r.map_name,
        left(r.server_id, 8);

      CONTINUE;
    END IF;

    IF r.preferred_partition_id IS NOT NULL THEN
      INSERT INTO world_partition (
        partition_id,
        server_id,
        map,
        partition_definition,
        dimension_index,
        blocked
      )
      VALUES (
        r.preferred_partition_id,
        r.server_id,
        r.map_name,
        '${DEFAULT_PARTITION_DEF}'::jsonb,
        r.dimension_index,
        false
      );

      RAISE NOTICE
        'inserted preferred partition_id=% map=% for server %',
        r.preferred_partition_id,
        r.map_name,
        left(r.server_id, 8);
    ELSE
      INSERT INTO world_partition (
        server_id,
        map,
        partition_definition,
        dimension_index,
        blocked
      )
      VALUES (
        r.server_id,
        r.map_name,
        '${DEFAULT_PARTITION_DEF}'::jsonb,
        r.dimension_index,
        false
      );

      RAISE NOTICE
        'inserted new partition map=% for server %',
        r.map_name,
        left(r.server_id, 8);
    END IF;
  END LOOP;
END
\$\$;

UPDATE world_partition wp
SET server_id = NULL
WHERE wp.partition_id < ${ALIAS_PARTITION_MIN_ID}
  AND wp.server_id IS NOT NULL
  AND wp.map IN (SELECT map_name FROM _partition_targets)
  AND NOT EXISTS (
    SELECT 1
    FROM active_server_ids asi
    WHERE asi.server_id = wp.server_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM farm_state fs
    WHERE fs.server_id = wp.server_id
      AND fs.alive = true
  );

SELECT setval(
  'world_partition_partition_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(partition_id), 1) FROM world_partition),
    1
  ),
  true
);

DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'dune'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'dune'
      AND table_name = 'network_address_config'
  ) THEN
    GRANT USAGE ON SCHEMA dune TO dune;
    GRANT SELECT ON TABLE network_address_config TO dune;
  END IF;
END
\$\$;

\\echo '[partition-repair] load_world_partition validation'
SELECT
  c.map_name,
  c.server_id,
  c.dimension_index,
  c.preferred_partition_id AS requested_partition_id,
  COUNT(lp.*) AS returned_rows
FROM _partition_candidates c
LEFT JOIN LATERAL load_world_partition(
  c.map_name,
  c.server_id,
  c.dimension_index,
  c.preferred_partition_id
) lp ON true
GROUP BY
  c.map_name,
  c.server_id,
  c.dimension_index,
  c.preferred_partition_id
ORDER BY
  c.preferred_partition_id NULLS LAST,
  c.map_name;

COMMIT;

\\echo '[partition-repair] world_partition after repair'
SELECT partition_id, server_id, map, dimension_index, blocked, label
FROM world_partition
ORDER BY partition_id;
SQL
  } | psql_exec
}

case "${1:-once}" in
  once|"") ;;
  watch|--watch) REPAIR_WATCH=1 ;;
  help|--help|-h)
    usage
    exit 0
    ;;
  *)
    die "unknown command: $1"
    ;;
esac

if [[ "$REPAIR_WATCH" == "1" || "$REPAIR_WATCH" == "true" || "$REPAIR_WATCH" == "yes" ]]; then
  log "watch mode enabled, interval=${REPAIR_INTERVAL}s"
  while true; do
    run_once || true
    sleep "$REPAIR_INTERVAL"
  done
else
  run_once
fi
