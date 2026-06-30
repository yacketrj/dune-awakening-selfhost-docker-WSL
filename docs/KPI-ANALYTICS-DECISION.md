# KPI Analytics Architecture Decision

Branch: `feature/metrics`

## Decision

Use a hybrid observability and analytics design:

1. **Keep Prometheus for operational metrics**: host health, container health, process/service uptime, listener health, RabbitMQ, API request latency, task failures, restart counts, and alertable service states.
2. **Keep Grafana optional**: useful for advanced dashboards, but not required for the main WebUI and not ideal as the primary embedded experience.
3. **Build a Dune KPI analytics layer on Postgres**: player kills, NPC kills, resources farmed, item movement, progression, economy, guild/sietch activity, travel, and map activity should be derived from the Dune database and exposed through the WebUI as analytics views.

Prometheus is relevant to this stack, but it is not sufficient for the detailed gameplay KPI request.

## Why Prometheus Is Relevant

Prometheus is a good fit for time-series operational telemetry. It scrapes HTTP metrics endpoints, stores timestamped metric samples, and supports label-based querying. That maps cleanly to infrastructure questions like:

- Is the stack up?
- Are containers restarting?
- Are ports/listeners available?
- Is memory/CPU/disk trending badly?
- Is RabbitMQ healthy?
- Are API requests failing?
- Did autoscaler stop?
- How long does startup/restart take?

This repo already has the right starting points:

- `console/api/src/services/performance.js` samples CPU, memory, disk, and uptime.
- `console/web/src/features/server/ServerPanels.tsx` polls those values and renders Home dashboard performance cards.
- `runtime/scripts/status.sh` and `runtime/scripts/ready.sh` already compute stack, listener, and game-server readiness states.
- `runtime/scripts/start-rabbitmq.sh` already enables the `rabbitmq_prometheus` plugin.

## Why Prometheus Is Not Enough For Gameplay KPIs

Prometheus is not a good primary store for high-detail gameplay analytics.

The requested KPIs are event/entity analytics, not simple service gauges:

- NPCs killed
- players killed
- deaths by cause
- resources farmed by type/player/map/hour
- items crafted, looted, granted, destroyed, traded, moved, or stored
- spice harvested
- Solari earned/spent
- XP gained
- travel and map activity
- guild/sietch activity
- leaderboard-style rankings

Those require relational joins, historical snapshots, deduplication, identity resolution, and sometimes event reconstruction. Prometheus label cardinality would become unsafe if labels include player IDs, item IDs, resource IDs, kill victims, killer names, coordinates, or raw error/event text. Those belong in Postgres analytics tables, not Prometheus metric labels.

## Grafana Assessment

Grafana is relevant only as an optional dashboard surface.

Use Grafana for:

- advanced operator dashboards;
- imported/exported dashboards;
- Prometheus charts;
- long-running infrastructure trends;
- optional power-user views.

Do not make Grafana the required WebUI for Dune gameplay KPIs because:

- it adds a second auth/session model;
- iframe embedding requires weakening Grafana's default anti-clickjacking protection;
- Grafana panels are less natural for row-level player/item drilldowns;
- gameplay analytics needs custom UI flows: leaderboards, filters, player profile analytics, item/resource breakdowns, and drill-through views.

## Recommended Solution

### Primary user-facing solution

Build a native **Analytics / KPIs** section in the Dune Docker Console.

Suggested navigation:

```text
Home
Server Control
Services
Players
Live Map
Maps
Admin Tools
Care Package
Analytics
Database
Storage
Backups
Logs
Updates
Settings
```

### Backend model

Add a new API service:

```text
console/api/src/services/kpiAnalytics.js
```

Add routes:

```text
GET /api/analytics/schema-scan
GET /api/analytics/summary
GET /api/analytics/players
GET /api/analytics/kills
GET /api/analytics/resources
GET /api/analytics/items
GET /api/analytics/economy
GET /api/analytics/progression
GET /api/analytics/activity
GET /api/analytics/leaderboards
```

Add frontend files:

```text
console/web/src/api/analytics.ts
console/web/src/features/analytics/AnalyticsPanel.tsx
```

### Storage model

Start read-only. Do not mutate the Dune game schema for analytics.

Use a separate schema owned by the console if persistent KPI rollups are needed:

```sql
create schema if not exists console_analytics;
```

Recommended rollup tables:

```text
console_analytics.schema_inventory
console_analytics.kpi_snapshot_runs
console_analytics.player_daily_snapshots
console_analytics.player_resource_daily
console_analytics.player_kill_daily
console_analytics.item_daily
console_analytics.map_activity_daily
console_analytics.guild_daily
```

This avoids writing into the vendor/game-owned `dune` schema and lets the console rebuild or drop analytics without damaging the server database.

## KPI Data Discovery Strategy

The live Dune schema can change across Funcom updates. Do not hard-code assumptions without capability checks.

Use schema discovery first:

```sql
select table_schema,
       table_name,
       column_name,
       data_type
from information_schema.columns
where table_schema = 'dune'
  and (
    column_name ilike any (array[
      '%kill%', '%killer%', '%victim%', '%death%', '%dead%', '%damage%',
      '%resource%', '%harvest%', '%gather%', '%spice%', '%item%', '%inventory%',
      '%xp%', '%experience%', '%currency%', '%solari%', '%quest%', '%journey%',
      '%guild%', '%sietch%', '%faction%', '%map%', '%partition%', '%time%', '%created%', '%updated%'
    ])
    or table_name ilike any (array[
      '%kill%', '%death%', '%combat%', '%resource%', '%harvest%', '%gather%', '%spice%',
      '%item%', '%inventory%', '%currency%', '%quest%', '%journey%', '%guild%', '%sietch%',
      '%faction%', '%history%', '%event%', '%log%'
    ])
  )
order by table_name, ordinal_position;
```

The WebUI should show which KPI groups are supported by the current database version:

```text
Kills: supported / partial / unsupported
Resources: supported / partial / unsupported
Items: supported / partial / unsupported
Economy: supported / partial / unsupported
Progression: supported / partial / unsupported
Activity: supported / partial / unsupported
Guild/Sietch: supported / partial / unsupported
```

## Known Database Anchors In Current Code

Current repo code already references these useful Dune tables or concepts:

```text
dune.accounts
dune.actors
dune.actor_fgl_entities
dune.fgl_entities
dune.player_state
dune.world_partition
dune.farm_state
dune.items
dune.inventories
dune.player_virtual_currency_balances
dune.specialization_tracks
dune.player_faction
dune.player_faction_reputation
dune.guild_members
dune.guilds
dune.player_tags
dune.journey_story_node
dune.spicefield_types
dune.vehicles
dune.placeables
dune.buildings
```

These support a solid first-pass analytics module even before kill/resource event tables are confirmed.

## KPI Categories And Likely Sources

### 1. Population and activity

Likely source tables:

```text
dune.player_state
dune.accounts
dune.actors
dune.world_partition
dune.farm_state
```

Track:

- online players now;
- unique players seen today/7d/30d;
- last seen by player;
- active players by map/partition;
- capacity utilization;
- reconnect grace counts;
- heatmap-ish activity by map/partition.

### 2. Kills and deaths

Potential source tables must be discovered. Search for:

```text
kill, killer, victim, death, dead, damage, combat, npc, creature, hostile
```

Track if available:

- NPC kills total;
- NPC kills by creature/faction/type;
- player kills total;
- deaths by cause;
- PvP kills by player/guild/faction;
- kill/death ratio;
- kills by map/partition/hour;
- top killers;
- top NPC hunters.

Fallback if no event tables exist:

- mark unsupported;
- optionally mine recent logs for coarse crash/combat signals only;
- avoid pretending exact kill counts exist when they do not.

### 3. Resources farmed

Potential source tables must be discovered. Search for:

```text
resource, harvest, gather, spice, inventory, item, stack, quantity, template_id
```

Track if available:

- resources farmed by type;
- spice harvested by player/map/hour;
- rare resource counts;
- top farmers;
- resource trends over time;
- resource source: harvested / looted / crafted / admin-granted if distinguishable.

Fallback if only inventory state exists:

- use snapshot deltas, not event claims;
- label the metric as `inventory_delta`, not `farmed`;
- reduce false positives from transfers, crafting, decay, admin grants, and container moves.

### 4. Items and inventory

Likely source tables:

```text
dune.items
dune.inventories
runtime/data/admin-items.json
```

Track:

- total items by template/category;
- item stack totals;
- rare item counts;
- crafted or granted items only if event source exists;
- inventory growth/decline by snapshot delta;
- items in player inventory vs storage/placeables if ownership can be resolved.

### 5. Economy

Likely source tables:

```text
dune.player_virtual_currency_balances
```

Track:

- total Solari/currency in economy;
- currency by player;
- daily delta by snapshot;
- top balances;
- sink/source rate only if transaction events exist.

### 6. Progression

Likely source tables:

```text
dune.specialization_tracks
dune.actor_fgl_entities
dune.fgl_entities
dune.player_tags
dune.journey_story_node
```

Track:

- level distribution;
- XP totals;
- specialization progress;
- journey completion counts;
- tutorial/onboarding progress;
- faction progression.

### 7. Guild, faction, and Sietch

Likely source tables:

```text
dune.guild_members
dune.guilds
dune.player_faction
dune.player_faction_reputation
```

Track:

- guild membership counts;
- active members per guild;
- faction distribution;
- faction reputation distribution;
- sietch/map occupancy if resolvable.

## Event Tables vs Snapshot Deltas

Use direct event tables when available. Use snapshot deltas only when event history is not available.

### Direct event tables

Best for:

- kills;
- deaths;
- harvesting;
- item looting;
- crafting;
- economy transactions;
- travel events.

Pros:

- accurate counts;
- exact timestamp;
- exact actor/cause/source.

Cons:

- may not exist;
- may change with Funcom updates;
- may require retention management.

### Snapshot deltas

Best for:

- inventory totals;
- currency balance changes;
- XP increases;
- resource holdings;
- active player counts.

Pros:

- works even without event logs;
- can be built from current state tables;
- safer first implementation.

Cons:

- cannot always distinguish farming from trading/admin grants/crafting/storage moves;
- requires periodic snapshots;
- needs careful labeling to avoid false claims.

## Analytics Pipeline Design

### Phase 1: Read-only live analytics

- Add schema scanner.
- Add capability matrix.
- Add direct summary queries for known tables.
- Add WebUI Analytics tab.
- No persistent rollups yet.

### Phase 2: Snapshot collector

- Add `console_analytics` schema.
- Periodically snapshot player state, inventory totals, currency balances, progression, map activity, and guild membership.
- Compute deltas between snapshots.
- Show `observed change` metrics.

### Phase 3: Event analytics if tables exist

- Detect event/history tables.
- Add exact kill/death/farm/craft/trade KPIs only when reliable source tables exist.
- Maintain table-version compatibility checks.

### Phase 4: Optional Prometheus export

Export only low-cardinality aggregate KPI summaries to Prometheus, such as:

```text
dune_kpi_online_players
dune_kpi_unique_players_24h
dune_kpi_npc_kills_total
dune_kpi_player_kills_total
dune_kpi_resources_farmed_total{resource_category="spice"}
dune_kpi_currency_total{currency="solari"}
dune_kpi_active_guilds
```

Do not export per-player, per-item, per-victim, per-coordinate, or per-raw-resource labels to Prometheus.

## WebUI UX Recommendation

Add an **Analytics** tab with these panels:

```text
Overview
Players
Kills & Deaths
Resources
Items
Economy
Progression
Guilds / Factions / Sietches
Schema Support
```

Each KPI card should indicate source quality:

```text
Exact        derived from event/history table
Snapshot     derived from periodic state snapshots
Current      current state only, no history
Unsupported  no reliable source found
```

This is critical so admins trust the numbers.

## Minimum Useful KPI MVP

The first useful build should include:

1. Schema scanner and KPI capability report.
2. Online/current players and unique seen counts.
3. Active players by map/partition.
4. Current item/resource totals from inventory/item tables.
5. Currency balances and total economy size.
6. Progression distribution.
7. Guild/faction membership counts.
8. Unsupported/partial detection for kills/resources until exact source tables are confirmed.

## Final Recommendation

Use **Prometheus + optional Grafana** for system/server observability.

Use **native WebUI analytics backed by Postgres queries and console-owned rollup tables** for gameplay KPIs.

For the user's stated goal — tracking as much detail as possible from database tables, including NPC kills, players killed, and resources farmed — the best solution is a Dune-specific analytics module, not Grafana-first and not Prometheus-only.
