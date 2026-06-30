# Operational Metrics Specification

Branch: `feature/metrics`

## Decision

Add full industry-standard operational metrics for the Dune Docker Console stack using Prometheus-compatible exporters.

This is separate from gameplay KPI analytics. Operational metrics should answer whether the server, host, containers, RabbitMQ, Postgres, and console API are healthy. Gameplay KPIs should remain in the Postgres-backed Analytics module described in `docs/KPI-ANALYTICS-DECISION.md`.

## Target Metrics Stack

Recommended components:

```text
dune-prometheus          Prometheus server / time-series storage
dune-node-exporter       Linux host CPU, memory, disk, filesystem, network, load, kernel metrics
dune-cadvisor            Docker/container CPU, memory, network, filesystem, restart/start metrics
dune-postgres-exporter   PostgreSQL internal health and performance metrics
dune-rmq-admin           Existing RabbitMQ admin broker, scraped through rabbitmq_prometheus
dune-rmq-game            Existing RabbitMQ game broker, scraped through rabbitmq_prometheus
dune-console-exporter    Metrics emitted by the Dune Docker Console API/runtime scripts
dune-grafana             Optional advanced dashboard UI
```

Prometheus should be the metrics backend. The WebUI should expose a curated Metrics / Operations view. Grafana should remain optional for power users.

## Scrape Targets

### Host metrics

Exporter:

```text
dune-node-exporter:9100
```

Job:

```yaml
- job_name: dune-node
  static_configs:
    - targets: ["dune-node-exporter:9100"]
```

### Container metrics

Exporter:

```text
dune-cadvisor:8080
```

Job:

```yaml
- job_name: dune-cadvisor
  scrape_interval: 10s
  static_configs:
    - targets: ["dune-cadvisor:8080"]
```

### RabbitMQ metrics

RabbitMQ already enables `rabbitmq_prometheus` in `runtime/scripts/start-rabbitmq.sh`. The default Prometheus endpoint is:

```text
http://<rabbitmq-host>:15692/metrics
```

Jobs:

```yaml
- job_name: dune-rabbitmq-admin
  scrape_interval: 15s
  static_configs:
    - targets: ["dune-rmq-admin:15692"]

- job_name: dune-rabbitmq-game
  scrape_interval: 15s
  static_configs:
    - targets: ["dune-rmq-game:15692"]
```

Use RabbitMQ aggregated metrics by default. Do not enable per-object metrics by default because per-connection/per-queue metrics can create large scrape payloads and high cardinality.

### Postgres metrics

Exporter:

```text
dune-postgres-exporter:9187
```

Job:

```yaml
- job_name: dune-postgres
  scrape_interval: 15s
  static_configs:
    - targets: ["dune-postgres-exporter:9187"]
```

Credential handling:

- Use a dedicated `postgres_exporter` Postgres user if feasible.
- Prefer `DATA_SOURCE_URI`, `DATA_SOURCE_USER`, and `DATA_SOURCE_PASS_FILE` over embedding credentials in a single URL.
- Bind exporter access internally only.
- Do not expose Postgres exporter publicly.

### Dune console/runtime metrics

Exporter:

```text
127.0.0.1:9108/metrics
```

or authenticated console route:

```text
/api/metrics/prometheus
```

Job:

```yaml
- job_name: dune-console
  scrape_interval: 10s
  static_configs:
    - targets: ["host.docker.internal:9108"]
```

For Linux hosts where `host.docker.internal` is unavailable, use host networking, `127.0.0.1`, or a generated Prometheus target file.

## Host Metrics

Source: node exporter.

### CPU

Core metric names:

```text
node_cpu_seconds_total
node_load1
node_load5
node_load15
node_context_switches_total
node_intr_total
node_procs_running
node_procs_blocked
```

PromQL examples:

```promql
100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))
node_load1
node_load5
node_load15
node_procs_running
node_procs_blocked
```

Dashboard cards:

- CPU usage %
- 1/5/15 minute load average
- runnable processes
- blocked processes
- context switches/sec

Suggested alerts:

```text
HostHighCpu: CPU > 85% for 10m
HostSustainedHighLoad: load5 > CPU cores * 1.5 for 10m
HostBlockedProcesses: node_procs_blocked > 0 for 5m
```

### Memory

Core metric names:

```text
node_memory_MemTotal_bytes
node_memory_MemAvailable_bytes
node_memory_MemFree_bytes
node_memory_Buffers_bytes
node_memory_Cached_bytes
node_memory_SwapTotal_bytes
node_memory_SwapFree_bytes
node_vmstat_pswpin
node_vmstat_pswpout
node_pressure_memory_waiting_seconds_total
node_pressure_memory_stalled_seconds_total
```

PromQL examples:

```promql
100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
node_memory_MemAvailable_bytes
100 * (1 - node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes)
rate(node_vmstat_pswpin[5m])
rate(node_vmstat_pswpout[5m])
```

Dashboard cards:

- memory used %
- memory available bytes
- swap used %
- swap in/out rate
- memory pressure/stall if available

Suggested alerts:

```text
HostHighMemory: memory used > 90% for 10m
HostCriticalMemory: memory available < 2 GiB for 5m
HostSwapActive: swap in/out rate > 0 for 10m
```

### Disk and filesystem

Core metric names:

```text
node_filesystem_size_bytes
node_filesystem_avail_bytes
node_filesystem_free_bytes
node_filesystem_readonly
node_disk_read_bytes_total
node_disk_written_bytes_total
node_disk_reads_completed_total
node_disk_writes_completed_total
node_disk_io_time_seconds_total
node_disk_io_time_weighted_seconds_total
```

PromQL examples:

```promql
100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})
rate(node_disk_read_bytes_total[5m])
rate(node_disk_written_bytes_total[5m])
rate(node_disk_io_time_seconds_total[5m])
node_filesystem_readonly
```

Dashboard cards:

- root filesystem used %
- Docker data filesystem used %
- Dune runtime filesystem used %
- disk read/write throughput
- disk IO utilization
- readonly filesystem status

Suggested alerts:

```text
HostDiskHigh: filesystem used > 85% for 15m
HostDiskCritical: filesystem used > 95% for 5m
HostFilesystemReadonly: node_filesystem_readonly == 1
HostDiskHighIO: disk IO time > 80% for 10m
```

### Network

Core metric names:

```text
node_network_receive_bytes_total
node_network_transmit_bytes_total
node_network_receive_packets_total
node_network_transmit_packets_total
node_network_receive_errs_total
node_network_transmit_errs_total
node_network_receive_drop_total
node_network_transmit_drop_total
node_network_up
```

PromQL examples:

```promql
rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*|br.*"}[5m])
rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*|br.*"}[5m])
rate(node_network_receive_errs_total[5m])
rate(node_network_transmit_errs_total[5m])
```

Dashboard cards:

- network receive Mbps
- network transmit Mbps
- packet drops/sec
- packet errors/sec
- interface up/down

Suggested alerts:

```text
HostNetworkErrors: RX/TX errors > 0 for 10m
HostNetworkDrops: RX/TX drops > 0 for 10m
HostNetworkDown: primary interface up == 0
```

## Container Metrics

Source: cAdvisor.

Track all containers matching:

```text
dune-.*
redblink-dune-docker-console
```

Core metric names:

```text
container_cpu_usage_seconds_total
container_memory_usage_bytes
container_memory_working_set_bytes
container_memory_rss
container_memory_cache
container_memory_failcnt
container_network_receive_bytes_total
container_network_transmit_bytes_total
container_network_receive_errors_total
container_network_transmit_errors_total
container_fs_usage_bytes
container_fs_limit_bytes
container_start_time_seconds
container_last_seen
```

PromQL examples:

```promql
rate(container_cpu_usage_seconds_total{name=~"dune-.*|redblink-dune-docker-console"}[5m])
container_memory_working_set_bytes{name=~"dune-.*|redblink-dune-docker-console"}
rate(container_network_receive_bytes_total{name=~"dune-.*"}[5m])
rate(container_network_transmit_bytes_total{name=~"dune-.*"}[5m])
time() - container_start_time_seconds{name=~"dune-.*|redblink-dune-docker-console"}
```

Dashboard table columns:

```text
container
state/up
cpu %
memory working set
memory limit %
network rx/s
network tx/s
fs used
uptime
last seen
restart/start timestamp
```

Suggested alerts:

```text
ContainerMissing: container_last_seen stale or absent for expected service
ContainerHighCpu: CPU > expected threshold for 10m
ContainerHighMemory: memory working set > 90% of limit for 10m
ContainerOOMRisk: memory_failcnt increasing
ContainerNetworkErrors: network error counters increasing
```

## RabbitMQ Metrics

Source: RabbitMQ `rabbitmq_prometheus` plugin.

Use aggregated metrics by default.

Core health metrics:

```text
rabbitmq_up
rabbitmq_build_info
rabbitmq_identity_info
rabbitmq_node_running
rabbitmq_process_open_fds
rabbitmq_process_max_fds
rabbitmq_process_resident_memory_bytes
rabbitmq_resident_memory_limit_bytes
rabbitmq_detailed_erlang_vm_memory_bytes
rabbitmq_detailed_erlang_vm_process_limit
rabbitmq_detailed_erlang_vm_process_used
rabbitmq_detailed_erlang_vm_run_queue
```

Core connection/channel metrics:

```text
rabbitmq_connections
rabbitmq_channels
rabbitmq_consumers
rabbitmq_connection_channels
```

Core queue/message metrics:

```text
rabbitmq_queues
rabbitmq_queue_messages
rabbitmq_queue_messages_ready
rabbitmq_queue_messages_unacked
rabbitmq_queue_messages_persistent
rabbitmq_queue_messages_ram
rabbitmq_queue_consumer_capacity
rabbitmq_queue_consumers
```

Core rate metrics:

```text
rabbitmq_global_messages_acknowledged_total
rabbitmq_global_messages_confirmed_total
rabbitmq_global_messages_delivered_consume_manual_ack_total
rabbitmq_global_messages_delivered_consume_auto_ack_total
rabbitmq_global_messages_published_total
rabbitmq_global_messages_routed_total
rabbitmq_global_messages_unroutable_dropped_total
rabbitmq_global_messages_unroutable_returned_total
```

PromQL examples:

```promql
rabbitmq_up
rabbitmq_connections
rabbitmq_channels
rabbitmq_queue_messages_ready
rabbitmq_queue_messages_unacked
rate(rabbitmq_global_messages_published_total[5m])
rate(rabbitmq_global_messages_acknowledged_total[5m])
rabbitmq_process_open_fds / rabbitmq_process_max_fds * 100
rabbitmq_process_resident_memory_bytes / rabbitmq_resident_memory_limit_bytes * 100
```

Dashboard cards:

- RMQ up/down per broker
- connections
- channels
- consumers
- queued ready messages
- unacked messages
- publish rate
- ack/deliver rate
- unroutable dropped/returned rate
- memory usage %
- file descriptor usage %
- Erlang run queue

Suggested alerts:

```text
RabbitMQDown: rabbitmq_up == 0 for 1m
RabbitMQNoGameConnections: game broker connections unexpectedly low for 5m after server ready
RabbitMQQueueBacklog: queue ready messages above baseline for 10m
RabbitMQUnackedBacklog: unacked messages above baseline for 10m
RabbitMQHighMemory: resident memory > 80% limit for 10m
RabbitMQHighFDUsage: open FDs > 80% max for 10m
RabbitMQUnroutableMessages: unroutable dropped/returned increasing for 5m
RabbitMQRunQueueHigh: Erlang run queue high for 10m
```

## Postgres Metrics

Source: postgres_exporter.

Core availability/build metrics:

```text
pg_up
pg_exporter_last_scrape_error
pg_static
```

Core connection metrics:

```text
pg_stat_activity_count
pg_settings_max_connections
```

Core database metrics:

```text
pg_database_size_bytes
pg_stat_database_xact_commit
pg_stat_database_xact_rollback
pg_stat_database_blks_read
pg_stat_database_blks_hit
pg_stat_database_tup_returned
pg_stat_database_tup_fetched
pg_stat_database_tup_inserted
pg_stat_database_tup_updated
pg_stat_database_tup_deleted
pg_stat_database_conflicts
pg_stat_database_deadlocks
pg_stat_database_temp_files
pg_stat_database_temp_bytes
```

Core WAL/checkpoint/background writer metrics, if exposed by exporter/version:

```text
pg_stat_bgwriter_checkpoints_timed
pg_stat_bgwriter_checkpoints_req
pg_stat_bgwriter_buffers_checkpoint
pg_stat_bgwriter_buffers_clean
pg_stat_bgwriter_buffers_backend
pg_stat_bgwriter_maxwritten_clean
pg_stat_bgwriter_checkpoint_write_time
pg_stat_bgwriter_checkpoint_sync_time
pg_stat_wal_wal_records
pg_stat_wal_wal_fpi
pg_stat_wal_wal_bytes
```

Core lock metrics:

```text
pg_locks_count
```

PromQL examples:

```promql
pg_up
pg_exporter_last_scrape_error
pg_stat_activity_count / pg_settings_max_connections * 100
pg_database_size_bytes{datname="dune"}
rate(pg_stat_database_xact_commit{datname="dune"}[5m])
rate(pg_stat_database_xact_rollback{datname="dune"}[5m])
rate(pg_stat_database_deadlocks{datname="dune"}[5m])
rate(pg_stat_database_temp_bytes{datname="dune"}[5m])
pg_stat_database_blks_hit{datname="dune"} / (pg_stat_database_blks_hit{datname="dune"} + pg_stat_database_blks_read{datname="dune"}) * 100
```

Dashboard cards:

- Postgres up/down
- active connections
- max connections %
- DB size
- transactions/sec
- rollback rate
- cache hit ratio
- deadlocks
- temp file bytes/sec
- lock count
- checkpoint/write pressure if available

Suggested alerts:

```text
PostgresDown: pg_up == 0 for 1m
PostgresExporterScrapeError: pg_exporter_last_scrape_error == 1 for 5m
PostgresHighConnections: connections > 80% max for 10m
PostgresCriticalConnections: connections > 95% max for 2m
PostgresDeadlocks: deadlocks increasing over 5m
PostgresLowCacheHitRatio: cache hit ratio < 95% for 15m
PostgresRollbackSpike: rollback rate above baseline for 10m
PostgresTempFileSpike: temp bytes increasing rapidly for 10m
PostgresDatabaseGrowth: DB size growth above expected baseline
```

## Dune Console / Stack Metrics

Source: custom Dune console exporter.

The console should emit metrics that standard exporters cannot know:

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

Do not use high-cardinality labels. Valid labels:

```text
service
container
map
state
route
method
status
protocol
port
task
```

Avoid labels:

```text
player_id
character_name
account_id
funcom_id
item_id
resource_id
victim_id
killer_id
coordinates
raw_error
file_path
command_text
```

## WebUI Metrics Page

Add an **Operations** or **Metrics** tab separate from **Analytics**.

Recommended sections:

```text
Overview
Host
Containers
Postgres
RabbitMQ
Dune Services
Alerts
Targets
```

### Overview cards

```text
Stack state
Online players / capacity
Host CPU
Host memory
Host disk
Postgres health
RabbitMQ health
Container issues
Active alerts
```

### Host tab

```text
CPU usage, load, runnable/blocked processes
Memory usage, available memory, swap, memory pressure
Filesystem usage, Docker volume usage, disk I/O
Network throughput, drops, errors
```

### Containers tab

```text
Dune container status table
CPU/memory per container
Network per container
Filesystem per container
Uptime/start time
Restart/missing detection
```

### Postgres tab

```text
Up/down
connections/max connections
DB size
tps commit/rollback
cache hit ratio
deadlocks
locks
temp files/bytes
checkpoint/WAL pressure if exposed
```

### RabbitMQ tab

```text
Up/down per broker
connections/channels/consumers
queue ready/unacked messages
publish/deliver/ack rates
memory and FD usage
Erlang run queue
unroutable messages
```

### Targets tab

Show Prometheus target health:

```text
dune-node
dune-cadvisor
dune-postgres
dune-rabbitmq-admin
dune-rabbitmq-game
dune-console
```

## Alert Rule Groups

Suggested files:

```text
runtime/metrics/rules/host.yml
runtime/metrics/rules/containers.yml
runtime/metrics/rules/postgres.yml
runtime/metrics/rules/rabbitmq.yml
runtime/metrics/rules/dune-stack.yml
```

Alert severities:

```text
info      informative state change
warning   degraded, needs attention soon
critical  server impact likely or current outage
```

## Retention Defaults

Recommended defaults for small self-hosted / WSL installations:

```text
retention time: 7d
retention size: 2GB
scrape interval: 15s default
high-frequency container scrape: 10s
RabbitMQ scrape: 15s minimum
```

Make retention configurable from Settings later.

## Security Requirements

- Bind Prometheus to `127.0.0.1` by default.
- Bind Grafana to `127.0.0.1` by default if enabled.
- Do not expose exporters to the public internet.
- Do not put DB passwords in Git-tracked Prometheus files.
- Prefer Docker secrets or runtime secret files for Postgres exporter credentials.
- Keep cAdvisor read-only where possible.
- Never emit tokens, passwords, raw admin commands, player private identifiers, or raw SQL in metrics labels.

## Implementation Milestones

### Milestone 1: Ops metrics compose stack

- Add `docker-compose.metrics.yml`.
- Add Prometheus config.
- Add node exporter.
- Add cAdvisor.
- Add postgres_exporter.
- Scrape RabbitMQ `15692` endpoints.
- Add `dune metrics start|stop|status`.

### Milestone 2: Console exporter

- Add `/api/metrics/prometheus` or internal `9108` listener.
- Export stack/readiness/listener/container/service state.
- Add API request counters and duration histograms.
- Add task counters and task duration histograms.

### Milestone 3: WebUI Operations tab

- Add target health.
- Add host/container/Postgres/RabbitMQ panels.
- Add basic alert state display.
- Add link to Grafana when enabled.

### Milestone 4: Grafana optional

- Add Grafana service.
- Provision Prometheus datasource.
- Provision dashboards.
- Keep direct Grafana exposure disabled by default.

## Final Position

For industry-standard operational metrics, use Prometheus plus:

```text
node_exporter
cAdvisor
postgres_exporter
RabbitMQ rabbitmq_prometheus
custom Dune console exporter
optional Grafana
```

For gameplay KPIs, continue with the separate Postgres-backed Analytics module.
