# Observability and Analytics Design

Branch: `feature/metrics`

## Purpose

This document defines the proposed design for adding two related but separate capabilities to Dune Docker Console:

1. **Operational observability** for host, container, RabbitMQ, Postgres, WebUI/API, and Dune service health.
2. **Gameplay KPI analytics** for Dune-specific database-derived insights such as player activity, kills, resources, inventory, economy, progression, guilds, factions, and sietches.

The design intentionally separates infrastructure metrics from gameplay analytics.

## Summary Decision

Use a hybrid model:

```text
Prometheus + exporters + optional Grafana  -> operational observability
Postgres read-only queries + console rollups -> gameplay KPI analytics
Dune Docker Console WebUI                  -> primary admin experience
```

Prometheus is the correct primary backend for operational metrics. It is not the correct primary backend for per-player/per-item gameplay analytics because those data sets require relational joins, long-cardinality identifiers, history reconstruction, and drill-through UI.

## Existing Codebase Fit

The current repo already provides several building blocks:

- `console/api/src/services/performance.js` collects host CPU, memory, disk, and uptime.
- `console/web/src/features/server/ServerPanels.tsx` renders Home dashboard performance cards and polls every few seconds.
- `runtime/scripts/status.sh` computes stack state, container state, listeners, population/capacity, map readiness, and Funcom/FLS declaration state.
- `runtime/scripts/ready.sh` computes pass/wait/fail readiness details.
- `runtime/scripts/start-rabbitmq.sh` enables `rabbitmq_prometheus` for both RabbitMQ containers.
- `console/api/src/duneDb.js` already has defensive schema capability checks and read-only-ish data access patterns for players, inventory, progression, factions, guilds, live map, and spicefield data.
- `console/api/src/db.js` already centralizes Postgres connection configuration, timeouts, and query execution.

The design should extend those patterns instead of introducing a disconnected parallel control plane.

## Goals

### Operational metrics goals

- Provide standard Prometheus-compatible metrics for host health.
- Provide Docker/container metrics.
- Provide RabbitMQ broker metrics.
- Provide Postgres internal metrics.
- Provide Dune-specific readiness/service/listener metrics.
- Provide WebUI/API request metrics.
- Provide alert rules for common degradation/outage conditions.
- Expose a native WebUI Operations/Metrics section for admins.
- Allow optional Grafana dashboards for advanced operators.

### Gameplay KPI goals

- Add a native WebUI Analytics section.
- Detect which Dune database tables and columns are available.
- Distinguish exact event-backed KPIs from current-state and snapshot-derived KPIs.
- Avoid writing into the game-owned `dune` schema.
- Support console-owned rollups in a separate schema if historical analytics are enabled.
- Avoid high-cardinality Prometheus labels for gameplay data.
- Provide trustworthy source-quality labels: `Exact`, `Snapshot`, `Current`, `Unsupported`.

## Non-Goals

- Do not expose Prometheus, Grafana, exporters, or Postgres exporter endpoints publicly by default.
- Do not make Grafana required for the main WebUI.
- Do not store raw player identifiers, item identifiers, coordinates, or raw SQL as Prometheus labels.
- Do not mutate Funcom/vendor-owned game tables for analytics.
- Do not claim exact kill/resource/crafting metrics unless direct event/history tables are found.
- Do not build a full SIEM/log analytics platform in the first implementation.

## User Personas

### Server owner

Wants quick health visibility, uptime confidence, and simple troubleshooting signals.

Needs:

- Is the server up?
- Why is it slow?
- Is Postgres or RabbitMQ failing?
- Are game services ready or warming?
- Is disk/memory pressure approaching a crash?

### Admin / community manager

Wants gameplay activity and KPI visibility.

Needs:

- Who is active?
- How many players are online, daily active, weekly active?
- What maps are active?
- What resources are being accumulated?
- How much currency exists?
- Which guilds/factions are active?
- Can we track kills, deaths, and farming?

### Upstream maintainer

Needs the proposal to be modular, secure by default, and maintainable.

Needs:

- Minimal impact on existing startup path.
- Opt-in metrics stack.
- Clear fallback behavior.
- Low risk to game database integrity.
- Avoid high-cardinality monitoring anti-patterns.

## Functional Requirements

### FR-1: Metrics stack management

Add CLI and WebUI controls to install/start/stop/restart/check the metrics stack.

Suggested CLI:

```text
dune metrics status
dune metrics start
dune metrics stop
dune metrics restart
dune metrics logs
dune metrics config
```

Suggested scripts:

```text
runtime/scripts/metrics-stack.sh
runtime/scripts/metrics-config.sh
```

Suggested compose file:

```text
docker-compose.metrics.yml
```

### FR-2: Prometheus configuration

Add generated or static Prometheus config:

```text
runtime/metrics/prometheus.yml
runtime/metrics/rules/host.yml
runtime/metrics/rules/containers.yml
runtime/metrics/rules/postgres.yml
runtime/metrics/rules/rabbitmq.yml
runtime/metrics/rules/dune-stack.yml
```

The Prometheus config should scrape:

```text
dune-node-exporter:9100
dune-cadvisor:8080
dune-postgres-exporter:9187
dune-rmq-admin:15692
dune-rmq-game:15692
dune-console-exporter:9108 or console route
```

### FR-3: Exporter coverage

Add standard exporters:

- `node_exporter` for host OS/hardware metrics.
- `cAdvisor` for container metrics.
- `postgres_exporter` for PostgreSQL metrics.
- RabbitMQ built-in `rabbitmq_prometheus` plugin for RabbitMQ metrics.
- Custom Dune console exporter for stack/service/domain health.

### FR-4: Console exporter

Add a console exporter that emits Dune-specific operational metrics not known to generic exporters.

Recommended implementation options:

1. Internal HTTP listener on `127.0.0.1:9108/metrics`.
2. Authenticated `/api/metrics/prometheus` route plus Prometheus-specific local allowlist.
3. Textfile collector output for simple gauges, if node exporter textfile collector is adopted.

Recommended first pass: internal listener or route that returns Prometheus text exposition.

Metrics:

```text
dune_console_up
dune_console_build_info{version="..."}
dune_console_api_requests_total{method,route,status}
dune_console_api_request_duration_seconds_bucket{method,route,le}
dune_console_background_task_failures_total{task}
dune_console_active_tasks{type,status}
dune_stack_state{state="ready|warming|issue|stopped"}
dune_container_expected{container}
dune_container_running{container}
dune_listener_up{name,protocol,port}
dune_game_server_state{map,state="ready|warming|error|not_running"}
dune_population_active
dune_population_capacity
dune_world_partitions_total
dune_autoscaler_running
dune_funcom_heartbeat_ok
dune_population_declaration_ok
dune_capacity_declaration_ok
dune_gateway_db_monitoring_ok
```

### FR-5: Native Operations/Metrics WebUI

Add a WebUI section separate from gameplay Analytics:

```text
Operations
  Overview
  Host
  Containers
  Postgres
  RabbitMQ
  Dune Services
  Alerts
  Targets
```

The page should query Prometheus through the console API, not expose Prometheus directly to the browser.

API routes:

```text
GET /api/metrics/state
GET /api/metrics/targets
GET /api/metrics/alerts
GET /api/metrics/query?query=<promql>
GET /api/metrics/range?query=<promql>&start=<unix>&end=<unix>&step=<duration>
POST /api/metrics/start
POST /api/metrics/stop
POST /api/metrics/restart
```

### FR-6: Analytics schema discovery

Add a Dune database schema scanner for gameplay KPIs.

API route:

```text
GET /api/analytics/schema-scan
```

The scanner should detect and report support for:

```text
population/activity
kills/deaths
resources/farming
items/inventory
economy/currency
progression/xp/journey
guild/faction/sietch
travel/map activity
```

Each capability should report:

```text
supported: true|false|partial
sourceQuality: Exact|Snapshot|Current|Unsupported
tables: []
columns: []
notes: string[]
```

### FR-7: Native Analytics WebUI

Add a gameplay analytics section:

```text
Analytics
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

API routes:

```text
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

### FR-8: Optional analytics rollups

If historical analytics are enabled, use a separate schema:

```sql
create schema if not exists console_analytics;
```

Suggested rollup tables:

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

Rollups should be rebuildable and disposable.

## Operational Metrics Detail

### Host metrics

Use node exporter.

Track:

- CPU usage percent.
- Load average.
- Runnable and blocked processes.
- Memory total/available/used.
- Swap usage and swap in/out.
- Disk filesystem usage.
- Disk read/write throughput.
- Disk IO time/utilization.
- Network RX/TX throughput.
- Network errors and drops.

### Container metrics

Use cAdvisor.

Track containers matching:

```text
dune-.*
redblink-dune-docker-console
```

Track:

- CPU by container.
- Memory usage/working set by container.
- Memory fail count.
- Network RX/TX by container.
- Container filesystem usage.
- Container start time.
- Container last seen.

### RabbitMQ metrics

Use RabbitMQ built-in `rabbitmq_prometheus` plugin.

Track:

- Broker up/down.
- Connections.
- Channels.
- Consumers.
- Queues.
- Ready messages.
- Unacked messages.
- Publish/deliver/ack rates.
- Unroutable dropped/returned messages.
- Memory usage.
- File descriptor usage.
- Erlang run queue.

Default to aggregated metrics. Do not enable per-object metrics by default.

### Postgres metrics

Use `postgres_exporter`.

Track:

- `pg_up`.
- exporter scrape errors.
- active connections.
- max connections percent.
- database size.
- transaction commit/rollback rate.
- cache hit ratio.
- deadlocks.
- conflicts.
- temp files and temp bytes.
- lock count.
- checkpoint/WAL pressure when exposed.

### Dune service metrics

Use custom console exporter and runtime script parsing.

Track:

- Stack state.
- Expected containers present/running.
- Required TCP/UDP listener state.
- Survival_1 state.
- Overmap state.
- Autoscaler running.
- Population and capacity.
- World partition count.
- Funcom heartbeat state.
- Population declaration state.
- Capacity declaration state.
- Gateway DB monitoring state.

## Gameplay KPI Detail

### Population/activity

Likely source tables:

```text
dune.player_state
dune.accounts
dune.actors
dune.world_partition
dune.farm_state
```

Metrics:

- online players now;
- unique players seen today/7d/30d;
- last seen;
- active by map/partition;
- player capacity utilization;
- reconnect grace counts.

### Kills/deaths

Potential sources must be schema-scanned.

Search terms:

```text
kill, killer, victim, death, dead, damage, combat, npc, creature, hostile
```

Metrics if exact event source exists:

- NPC kills total;
- NPC kills by type/faction/map/hour;
- player kills total;
- deaths by cause;
- PvP kills by player/guild/faction;
- kill/death ratio;
- top killers and top NPC hunters.

Fallback:

- mark unsupported or partial;
- do not infer exact kill counts from non-event state tables.

### Resources/farming

Potential sources must be schema-scanned.

Search terms:

```text
resource, harvest, gather, spice, inventory, item, stack, quantity, template_id
```

Metrics if exact event source exists:

- resources farmed by type;
- spice harvested by player/map/hour;
- resource source classification;
- top farmers;
- resource trends.

Fallback:

- use inventory snapshot deltas;
- label as `inventory_delta`, not `farmed`;
- note that transfers/admin grants/crafting/storage can affect deltas.

### Items/inventory

Likely sources:

```text
dune.items
dune.inventories
runtime/data/admin-items.json
```

Metrics:

- total items by template/category;
- item stack totals;
- rare item counts;
- inventory growth/decline;
- inventory vs storage/placeables if ownership can be resolved.

### Economy

Likely source:

```text
dune.player_virtual_currency_balances
```

Metrics:

- total currency in economy;
- currency by player;
- daily balance delta;
- top balances;
- sinks/sources only if transaction events exist.

### Progression

Likely sources:

```text
dune.specialization_tracks
dune.actor_fgl_entities
dune.fgl_entities
dune.player_tags
dune.journey_story_node
```

Metrics:

- level distribution;
- XP totals;
- specialization progress;
- journey completion;
- tutorial/onboarding progress;
- faction progression.

### Guild/faction/sietch

Likely sources:

```text
dune.guild_members
dune.guilds
dune.player_faction
dune.player_faction_reputation
```

Metrics:

- guild membership counts;
- active members per guild;
- faction distribution;
- faction reputation distribution;
- sietch/map occupancy when resolvable.

## Data Quality Model

Every KPI should expose one of these quality labels:

```text
Exact        direct event/history table
Snapshot     console snapshot delta
Current      current database state only
Unsupported  no reliable source found
```

The WebUI should display this label next to each KPI family and in tooltip/help text.

## API Design

### Metrics API

```ts
type MetricsState = {
  installed: boolean;
  running: boolean;
  prometheusReachable: boolean;
  grafanaEnabled: boolean;
  retention: { time: string; size: string };
};

type PrometheusTarget = {
  job: string;
  instance: string;
  health: "up" | "down" | "unknown";
  lastScrape: string;
  lastError?: string;
};
```

### Analytics API

```ts
type AnalyticsCapability = {
  key: string;
  label: string;
  supported: boolean;
  level: "supported" | "partial" | "unsupported";
  sourceQuality: "Exact" | "Snapshot" | "Current" | "Unsupported";
  tables: string[];
  columns: string[];
  notes: string[];
};

type AnalyticsSummary = {
  generatedAt: string;
  capabilities: AnalyticsCapability[];
  population: Record<string, unknown>;
  items: Record<string, unknown>;
  economy: Record<string, unknown>;
  progression: Record<string, unknown>;
  guilds: Record<string, unknown>;
};
```

## Security Design

### Metrics security

- Prometheus binds to localhost/internal network by default.
- Grafana binds to localhost/internal network by default.
- Exporters are not public.
- Console proxies read-only Prometheus queries for browser use.
- Postgres exporter credentials are not stored in Git-tracked files.
- Prefer password file/secrets for Postgres exporter.
- cAdvisor mounts should be read-only where practical.

### Analytics security

- Analytics starts read-only.
- Rollups write only to `console_analytics`, never game-owned `dune` tables.
- No raw tokens, passwords, SQL text, admin commands, player private IDs, or raw identifiers in Prometheus labels.
- Player-level analytics are visible only to authenticated admins.

## Configuration

Suggested environment variables:

```text
METRICS_ENABLED=0
METRICS_PROMETHEUS_PORT=9090
METRICS_GRAFANA_ENABLED=0
METRICS_GRAFANA_PORT=3000
METRICS_CONSOLE_EXPORTER_PORT=9108
METRICS_RETENTION_TIME=7d
METRICS_RETENTION_SIZE=2GB
METRICS_SCRAPE_INTERVAL=15s
METRICS_CONTAINER_SCRAPE_INTERVAL=10s
ANALYTICS_ENABLED=1
ANALYTICS_SNAPSHOT_ENABLED=0
ANALYTICS_SNAPSHOT_INTERVAL_SECONDS=900
ANALYTICS_RETENTION_DAYS=30
```

## Rollout Plan

### Phase 1: Documentation and scaffolding

- Add design, architecture, and RFC docs.
- Add metrics specification.
- Add KPI analytics decision document.

### Phase 2: Ops metrics MVP

- Add metrics compose stack.
- Add Prometheus config.
- Add node exporter.
- Add cAdvisor.
- Add postgres exporter.
- Scrape RabbitMQ endpoints.
- Add `dune metrics status|start|stop|restart`.

### Phase 3: Console exporter

- Add Prometheus text helper.
- Add Dune stack/service metrics route or listener.
- Add API request counters and duration histograms.
- Add task metrics.

### Phase 4: Operations WebUI

- Add Metrics/Operations tab.
- Add target health.
- Add host/container/Postgres/RabbitMQ panels.
- Add alert display.

### Phase 5: Analytics MVP

- Add schema scanner.
- Add capability matrix.
- Add read-only summaries from known tables.
- Add Analytics WebUI.

### Phase 6: Analytics snapshots and exact events

- Add optional `console_analytics` schema.
- Add snapshot collector.
- Add exact kill/resource KPIs when schema scanner identifies reliable event tables.

### Phase 7: Optional Grafana

- Add Grafana service.
- Provision datasource.
- Provision dashboards.
- Add WebUI link-out, not public exposure.

## Testing Plan

### Unit tests

- Prometheus text escaping.
- Metrics route auth/allowlist behavior.
- Prometheus query proxy validation.
- Analytics schema scanner with mocked schema results.
- KPI source-quality classification.

### Integration tests

- Metrics stack starts and Prometheus targets are up.
- RabbitMQ metrics endpoints are reachable.
- Postgres exporter authenticates successfully.
- Console exporter emits valid text exposition.
- WebUI can query metrics through API.
- Analytics endpoints degrade gracefully on missing tables.

### Manual validation

- Fresh install with metrics disabled.
- Enable metrics from CLI.
- Enable metrics from WebUI.
- Stop Postgres and confirm alerts/health state.
- Stop RabbitMQ and confirm alerts/health state.
- Fill disk threshold mock or low threshold config.
- Validate Prometheus retention on small WSL install.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Exporters exposed publicly | High | Bind internal/localhost by default; WebUI proxy only |
| High cardinality metrics | High | Aggregate RabbitMQ; prohibit player/item labels in Prometheus |
| Postgres credential leakage | High | Use secrets/password files; never Git-track credentials |
| Grafana auth complexity | Medium | Optional link-out only first; no required iframe |
| Dune schema changes | Medium | Capability scanner and source-quality labels |
| Snapshot deltas misread as exact farming | Medium | Label as Snapshot/observed delta, not exact farming |
| Small WSL disk usage | Medium | 7d/2GB default retention and configurable settings |

## References

- Prometheus node_exporter: host OS/hardware metrics exporter.
- cAdvisor Prometheus metrics: container/hardware metrics exposed at `/metrics`.
- prometheus-community/postgres_exporter: PostgreSQL server metrics exporter.
- RabbitMQ Prometheus guide: built-in `rabbitmq_prometheus`, default port `15692`, aggregated vs per-object guidance.
