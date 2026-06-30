# R1 Metrics Stack MVP Implementation Notes

Tracking issue: #82
Branch: `feature/metrics`

## Summary

R1 adds the first opt-in operational metrics stack for Dune Docker Console.

Implemented components:

- `docker-compose.metrics.yml`
- `runtime/metrics/prometheus.yml`
- `runtime/metrics/rules/host.yml`
- `runtime/metrics/rules/containers.yml`
- `runtime/metrics/rules/postgres.yml`
- `runtime/metrics/rules/rabbitmq.yml`
- `runtime/metrics/rules/dune-stack.yml`
- `runtime/scripts/metrics-stack.sh`
- `runtime/scripts/metrics-status.sh`
- `dune metrics ...` CLI dispatch in `runtime/scripts/dune`

## Why

The project needs industry-standard operational metrics for host, container, RabbitMQ, and Postgres health without forcing gameplay KPI analytics into Prometheus.

This first release phase creates the independent metrics control plane while keeping the Dune game stack unchanged.

## Operational Design

The metrics stack is opt-in and starts separately from the game stack:

```text
dune metrics start
dune metrics stop
dune metrics restart
dune metrics status
dune metrics logs [service]
dune metrics config
dune metrics pull
```

Prometheus binds to localhost only by default:

```text
127.0.0.1:9090
```

Exporters are attached to the existing internal `dune-net` network and are not published publicly by default.

## Metrics Stack Components

```text
dune-prometheus
dune-node-exporter
dune-cadvisor
dune-postgres-exporter
```

Prometheus also scrapes existing RabbitMQ containers when they are running:

```text
dune-rmq-admin:15692
dune-rmq-game:15692
```

## Prometheus Jobs

```text
dune-prometheus
dune-node
dune-cadvisor
dune-postgres
dune-rabbitmq-admin
dune-rabbitmq-game
```

## Alert Rule Groups

```text
dune-host
dune-containers
dune-postgres
dune-rabbitmq
dune-stack
```

The `dune-stack` rule file is currently a valid empty rule group. It is reserved for R2 console-exporter metrics.

## Security Notes

Security posture for R1:

- Metrics stack remains opt-in.
- Prometheus binds to `127.0.0.1` by default.
- node_exporter is not public.
- cAdvisor is not public.
- postgres_exporter is not public.
- RabbitMQ metrics are scraped on the internal Docker network.
- No passwords or tokens are committed.
- postgres_exporter uses environment-derived credentials, not Git-tracked literal secrets.
- No player identifiers or gameplay labels are emitted in R1.

## Known Validation Gap

This commit was made through the GitHub connector. Runtime validation still needs to be executed on a host with Docker available.

Required local validation commands:

```bash
docker compose -f docker-compose.metrics.yml config
bash runtime/scripts/metrics-stack.sh config
bash runtime/scripts/metrics-stack.sh start
bash runtime/scripts/metrics-stack.sh status
bash runtime/scripts/metrics-stack.sh stop
bash runtime/scripts/dune metrics status
```

Recommended Prometheus validation after start:

```bash
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9090/api/v1/targets
curl -fsS http://127.0.0.1:9090/api/v1/rules
```

## Regression Expectations

R1 should not alter normal game startup behavior.

Regression checks:

```bash
bash runtime/scripts/dune --help
bash runtime/scripts/dune status
bash runtime/scripts/dune ready
bash runtime/scripts/dune ps
```

Full game-stack runtime validation remains required before marking R1 complete.

## Remaining R1 Work

- Run Docker Compose validation locally.
- Run start/status/stop on a real host.
- Confirm RabbitMQ `15692` endpoints are reachable from Prometheus on `dune-net`.
- Confirm postgres_exporter connects to `dune-postgres` with the active `.env` credentials.
- Confirm cAdvisor works under WSL/Docker Desktop host constraints.
- Confirm alert rules load cleanly in Prometheus.
