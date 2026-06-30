# Metrics Integration Roadmap

Branch: `feature/metrics`

This document maps the current Dune Docker Console codebase and proposes a practical path for adding Prometheus-backed metrics and optional Grafana dashboards to the WebUI.

## Current Code Review Findings

### Web console runtime

- `docker-compose.web.yml` runs a single `redblink-dune-docker-console` service built from `console/api/Dockerfile`.
- The console container uses `network_mode: host` so the Node API can reach host-local services like Postgres on `127.0.0.1:15432`.
- The console mounts the repo at `/repo` and the Docker socket at `/var/run/docker.sock`, which means it can inspect and control the Dune stack.
- The WebUI listens on `ADMIN_BIND_HOST` / `ADMIN_BIND_PORT`, defaulting to `0.0.0.0:8088`.

### API architecture

- `console/api/src/server.js` is a single Node HTTP server.
- It serves `/api/*` routes and falls back to static React assets for all other paths.
- Auth is enforced after public routes such as `/api/health`, `/api/auth/state`, and `/api/auth/login`.
- Existing relevant API routes include:
  - `/api/server/status`
  - `/api/server/performance`
  - `/api/server/readiness`
  - `/api/server/services`
  - `/api/server/doctor`

### Existing performance sampling

- `console/api/src/services/performance.js` already provides a host performance snapshot:
  - CPU usage percentage from `/proc/stat`
  - memory usage from `/proc/meminfo`
  - disk usage from `statfsSync(repoRoot)`
  - host uptime from `/proc/uptime`
- `console/web/src/api/server.ts` already defines `PerformanceSnapshot` and calls `/api/server/performance`.
- `console/web/src/features/server/ServerPanels.tsx` polls `serverApi.performance()` every 3 seconds and renders CPU, memory, disk, and uptime cards on the Home dashboard.

### Runtime stack and observable services

The stack is script-driven rather than a single static Compose app. `runtime/scripts/start-all.sh` launches the core services in sequence:

- Postgres
- RabbitMQ admin/game
- TextRouter
- Director
- Survival_1
- Overmap
- ServerGateway
- Autoscaler

Important containers and listeners are already enumerated in `runtime/scripts/status.sh` and `runtime/scripts/ready.sh`, including:

- `dune-postgres`
- `dune-rmq-admin`
- `dune-rmq-game`
- `dune-text-router`
- `dune-director`
- `dune-server-gateway`
- `dune-server-survival-1`
- `dune-server-overmap`
- `dune-orchestrator`

### RabbitMQ metrics readiness

`runtime/scripts/start-rabbitmq.sh` already enables the RabbitMQ Prometheus plugin in both RabbitMQ containers:

```text
rabbitmq_prometheus
```

The missing work is making Prometheus able to scrape that endpoint safely. The RabbitMQ Prometheus plugin normally exposes metrics on RabbitMQ's Prometheus listener, commonly port `15692`, but this repo currently maps only the AMQP and management ports. A metrics container on `dune-net` can scrape by container DNS if the listener is active internally, or the script can explicitly expose/bind the metrics port to localhost.

## Recommended Architecture

Use Prometheus as the metrics backend and make Grafana optional.

Prometheus should be the first integration because it gives us:

- a consistent time-series store;
- an industry-standard `/metrics` scrape model;
- low-cost alert rules later;
- a clean path for WebUI-native charts without forcing Grafana on every server owner.

Grafana should be an optional advanced dashboard layer because embedding it safely requires extra auth/proxy work and broader UI/security decisions.

## Proposed Runtime Layout

Add a dedicated metrics compose file instead of expanding the main installer path immediately:

```text
docker-compose.metrics.yml
runtime/metrics/prometheus.yml
runtime/metrics/rules/dune-alerts.yml
runtime/metrics/grafana/provisioning/datasources/prometheus.yml
runtime/metrics/grafana/provisioning/dashboards/dune.yml
runtime/metrics/grafana/dashboards/dune-overview.json
```

Proposed services:

```text
dune-prometheus      prom/prometheus
dune-cadvisor        gcr.io/cadvisor/cadvisor or equivalent maintained cAdvisor image
dune-node-exporter   prom/node-exporter, optional
dune-grafana         grafana/grafana, optional
dune-postgres-exporter optional, disabled by default until credentials are handled cleanly
```

### Network model

Recommended default:

- bind Prometheus and Grafana to `127.0.0.1` only;
- expose them through the authenticated console, not directly to the internet;
- join the metrics services to `dune-net` where useful for container-to-container scrapes;
- keep Docker socket and host filesystem mounts limited to cAdvisor and the console, never Grafana.

## WebUI Integration Options

### Option A: WebUI-native metrics panel

Add a new `Metrics` tab to the existing React navigation.

API additions:

```text
GET /api/metrics
GET /api/metrics/state
GET /api/metrics/query?query=<promql>
GET /api/metrics/range?query=<promql>&start=<unix>&end=<unix>&step=<duration>
POST /api/metrics/start
POST /api/metrics/stop
POST /api/metrics/restart
```

Implementation outline:

- Add `console/api/src/services/metrics.js`.
- Add an internal Prometheus query helper that calls `http://127.0.0.1:${PROMETHEUS_BIND_PORT || 9090}/api/v1/query` and `/api/v1/query_range`.
- Add `console/web/src/api/metrics.ts`.
- Add `console/web/src/features/metrics/MetricsPanel.tsx`.
- Use simple WebUI-native cards and sparklines first; avoid a heavy chart dependency unless needed.

Pros:

- keeps the existing admin auth model;
- no iframe auth complexity;
- works even without Grafana;
- gives a curated Dune-specific dashboard instead of a generic observability UI.

Cons:

- custom charting work;
- less flexible than full Grafana for power users.

### Option B: Grafana sidecar with embedded dashboards

Add an optional `Metrics / Grafana` tab that embeds Grafana panels or dashboards.

Implementation outline:

- Add `dune-grafana` service to `docker-compose.metrics.yml`.
- Provision Prometheus as a datasource.
- Provision a Dune dashboard JSON.
- Configure Grafana for iframe embedding only when the admin explicitly enables it.
- Prefer proxying Grafana through the console under `/grafana/` so server owners do not expose `3000` directly.

Pros:

- mature dashboards;
- easy long-term expansion;
- can import/export dashboards.

Cons:

- iframe embedding requires Grafana security settings;
- auth/session boundaries get complicated;
- reverse-proxy/subpath configuration must be tested carefully;
- exposing Grafana directly would duplicate the admin surface.

### Recommendation

Implement in this order:

1. Prometheus + cAdvisor + console `/api/metrics` endpoint.
2. WebUI-native `Metrics` tab with curated Dune server health cards.
3. Optional Grafana sidecar and embedded/link-out dashboard after Prometheus is stable.

## Prometheus Scrape Targets

### 1. Dune Console API exporter

Add a Prometheus text endpoint exposed by the Node API:

```text
GET /api/metrics/prometheus
```

This endpoint should be admin-authenticated for browser access, but Prometheus also needs a non-browser scrape path. Recommended options:

- bind an internal metrics listener on `127.0.0.1:${ADMIN_METRICS_PORT:-9108}`; or
- allow unauthenticated access to `/api/metrics/prometheus` only from `127.0.0.1` and `dune-prometheus`.

Suggested metrics:

```text
dune_console_up
dune_console_build_info{version="..."}
dune_console_api_requests_total{method,path,status}
dune_console_api_request_duration_seconds_bucket{method,path,le}
dune_console_background_task_failures_total{task}
dune_console_active_tasks{status,type}
dune_host_cpu_usage_percent
dune_host_memory_used_bytes
dune_host_memory_total_bytes
dune_host_disk_used_bytes
dune_host_disk_total_bytes
dune_host_uptime_seconds
```

### 2. Stack status exporter

Convert key facts already produced by `runtime/scripts/status.sh` and `runtime/scripts/ready.sh` into machine-readable gauges.

Suggested metrics:

```text
dune_stack_overall_state{state="ready|warming|issue|stopped"} 1
dune_container_running{container="dune-director"} 1
dune_listener_up{name="director",protocol="tcp",port="11717"} 1
dune_game_server_state{map="Survival_1",state="ready|warming|error|not_running"} 1
dune_world_partitions_total
dune_population_active
dune_population_capacity
dune_funcom_heartbeat_ok
dune_population_declaration_ok
dune_capacity_declaration_ok
dune_gateway_db_monitoring_ok
dune_autoscaler_running
```

Implementation choices:

- Preferred: create a new `runtime/scripts/metrics.sh` that emits Prometheus text directly.
- Alternate: update `status.sh` / `ready.sh` to support `--json`, then have the Node API transform JSON into Prometheus text.

### 3. Container metrics through cAdvisor

Use cAdvisor for Docker/container-level telemetry:

```text
rate(container_cpu_usage_seconds_total{name=~"dune-.*|redblink-dune-docker-console"}[1m])
container_memory_usage_bytes{name=~"dune-.*|redblink-dune-docker-console"}
rate(container_network_receive_bytes_total{name=~"dune-.*"}[1m])
rate(container_network_transmit_bytes_total{name=~"dune-.*"}[1m])
container_fs_usage_bytes{name=~"dune-.*"}
container_start_time_seconds{name=~"dune-.*"}
```

### 4. RabbitMQ Prometheus metrics

Since `rabbitmq_prometheus` is already enabled, scrape both RabbitMQ containers if reachable:

```text
job_name: dune-rabbitmq-admin
job_name: dune-rabbitmq-game
```

High-value RabbitMQ metrics:

```text
rabbitmq_up
rabbitmq_connections
rabbitmq_channels
rabbitmq_queue_messages_ready
rabbitmq_queue_messages_unacked
rabbitmq_queue_process_reductions_total
```

### 5. Postgres metrics

Keep DB exporter optional until credential handling is explicit.

Track later:

```text
pg_up
pg_stat_database_numbackends
pg_database_size_bytes
pg_stat_database_xact_commit
pg_stat_database_xact_rollback
pg_stat_database_blks_hit
pg_stat_database_blks_read
```

For Dune-specific DB metrics, prefer direct console-owned SQL queries over exposing broad DB credentials to an exporter.

### 6. Log-derived game metrics

Use sparingly. Log scraping is expensive and brittle, but useful for events not present in the database.

Candidates:

```text
dune_log_fatal_errors_total{container}
dune_log_crashes_total{container}
dune_map_ready_observed_timestamp_seconds{map}
dune_funcom_auth_mismatch_total
```

## What To Track In The WebUI

### Home dashboard additions

Keep the existing CPU/memory/disk/uptime cards. Add:

- stack state: Ready / Warming / Issue / Stopped;
- online players vs capacity;
- Survival_1 state;
- Overmap state;
- autoscaler running/stopped;
- RabbitMQ connections;
- DB availability;
- recent fatal/crash count.

### Metrics tab sections

#### Overview

- Stack state timeline
- Active players
- Capacity utilization
- Server uptime
- Restart/start events

#### Host and containers

- Host CPU, memory, disk
- Per-container CPU
- Per-container memory
- Per-container restart count/start time
- Network RX/TX for game-facing containers

#### Game services

- Survival_1 ready/warming/error state
- Overmap ready/warming/error state
- Dynamic map count if/when autoscaler exposes it
- Listener status by TCP/UDP port
- ServerGateway and Director health

#### Players and capacity

- Online players
- Capacity
- Utilization percentage
- Per-map player distribution when available
- Login queue or travel queue metrics if stable data sources exist

#### RabbitMQ

- Connection count
- Channel count
- Queue ready/unacked counts
- Publish/deliver rates if available

#### Database

- DB up/down
- DB size
- active connections
- slow/failed query counters only if available safely
- backup age and last backup status from existing backup tooling

#### Operations

- start/stop/restart task count
- task duration
- task failure count
- update status
- last successful self-update / stack update
- admin mutation counters grouped by action, not by player identity

## Security Notes

- Do not expose Prometheus or Grafana publicly by default.
- Keep metrics endpoints read-only.
- Never emit Funcom tokens, DB passwords, session cookies, player private identifiers, or raw admin command payloads as labels.
- Use low-cardinality labels only: service, container, map, state, port, protocol, action.
- Avoid labels containing player names, account IDs, character IDs, file paths, or raw error messages.
- Keep Grafana optional because enabling iframe embedding weakens Grafana's default anti-clickjacking posture.

## First Implementation Pass

### Backend

1. Add `console/api/src/services/prometheusText.js` with helpers:
   - `gauge(name, help, labels, value)`
   - `counter(name, help, labels, value)`
   - label escaping
   - content type: `text/plain; version=0.0.4; charset=utf-8`
2. Add `console/api/src/services/metrics.js`:
   - reuse `performanceSnapshot()`;
   - call Docker for container running states;
   - call small SQL queries only when Postgres is up;
   - optionally call `runtime/scripts/metrics.sh` when present.
3. Add route:
   - `/api/metrics/prometheus`
4. Add route:
   - `/api/metrics/summary`

### Runtime

1. Add `docker-compose.metrics.yml` with Prometheus and cAdvisor.
2. Add `runtime/metrics/prometheus.yml`.
3. Add `runtime/scripts/metrics-stack.sh` commands:
   - `start`
   - `stop`
   - `restart`
   - `status`
4. Add `dune metrics ...` commands to `runtime/scripts/dune`.

### Frontend

1. Add `Metrics` to `Tab` and sidebar navigation.
2. Add `console/web/src/api/metrics.ts`.
3. Add `console/web/src/features/metrics/MetricsPanel.tsx`.
4. Reuse existing card styles from the Home dashboard.
5. Show setup state:
   - Not installed
   - Installed but stopped
   - Running
   - Prometheus unreachable
   - Collecting data

## Example Prometheus Config Sketch

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: dune-console
    static_configs:
      - targets: ["127.0.0.1:9108"]

  - job_name: dune-cadvisor
    static_configs:
      - targets: ["dune-cadvisor:8080"]

  - job_name: dune-rabbitmq-admin
    static_configs:
      - targets: ["dune-rmq-admin:15692"]

  - job_name: dune-rabbitmq-game
    static_configs:
      - targets: ["dune-rmq-game:15692"]
```

## Open Questions Before Coding Grafana

- Should Grafana be embedded in the console or opened as a separate local-only service?
- Should the console proxy `/grafana/`, or should Grafana stay on `127.0.0.1:3000` with a link-out button?
- Should metrics be opt-in during setup, or enabled later from Settings?
- What retention default is acceptable for small WSL installs: 2 days, 7 days, or configurable?
- Should alerting be WebUI-only at first, or should Alertmanager be planned from the start?

## Initial Milestones

### Milestone 1: Prometheus MVP

- Metrics branch has docs and code scaffolding.
- Prometheus scrapes console and cAdvisor.
- WebUI shows metrics stack state.
- No Grafana yet.

### Milestone 2: Dune-specific metrics

- Add stack state, map state, population, capacity, listener, and task metrics.
- Add WebUI Metrics tab.
- Add basic alert states in the WebUI.

### Milestone 3: Optional Grafana

- Add Grafana service.
- Provision datasource and Dune overview dashboard.
- Add Settings toggle and authenticated link/embed strategy.

## Suggested Default Decision

Proceed with Prometheus-first integration and WebUI-native metrics. Treat Grafana as an optional advanced view after the metrics data model is stable.
