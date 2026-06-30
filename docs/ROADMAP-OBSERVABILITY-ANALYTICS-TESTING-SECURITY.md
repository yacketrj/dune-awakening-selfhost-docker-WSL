# Roadmap: Observability, Analytics, Testing, Regression, and Security

Branch: `feature/metrics`

## Purpose

This roadmap converts the observability and KPI analytics proposal into a staged delivery plan suitable for upstream discussion and later implementation.

It covers:

- release cadence;
- release train milestones;
- implementation sequencing;
- unit testing;
- integration testing;
- regression testing;
- performance testing;
- security audits;
- release gates;
- upstream acceptance criteria.

## Roadmap Decision

Use a staged release train with two-week implementation milestones, one hard stabilization gate before beta, and one hard security gate before GA.

Recommended path:

```text
R0  Documentation / RFC baseline
R1  Metrics stack MVP
R2  Console exporter
R3  Operations WebUI
R4  Analytics schema scanner
R5  Analytics MVP
R6  Snapshot rollups
R7  Security hardening and beta
R8  Grafana optional profile
R9  GA readiness
```

## Release Cadence

### Default cadence

Use a two-week cadence for feature milestones.

```text
Week 0      RFC and architecture review
Weeks 1-2   R1
Weeks 3-4   R2
Weeks 5-6   R3
Weeks 7-8   R4
Weeks 9-10  R5
Weeks 11-12 R6
Weeks 13-14 R7 beta hardening
Weeks 15-16 R8 optional Grafana
Weeks 17-18 R9 GA readiness
```

### Calendar example

If work begins the week of 2026-06-29, the target cadence would be:

| Release | Target Window | Release Type | Primary Outcome |
|---|---:|---|---|
| R0 | 2026-06-29 to 2026-07-05 | RFC / docs | Upstream issue proposal and docs baseline |
| R1 | 2026-07-06 to 2026-07-19 | Alpha 1 | Metrics compose stack and Prometheus config |
| R2 | 2026-07-20 to 2026-08-02 | Alpha 2 | Console exporter and Dune service metrics |
| R3 | 2026-08-03 to 2026-08-16 | Alpha 3 | Operations WebUI and Prometheus proxy |
| R4 | 2026-08-17 to 2026-08-30 | Alpha 4 | Analytics schema scanner and capability matrix |
| R5 | 2026-08-31 to 2026-09-13 | Beta 1 | Analytics MVP and WebUI KPI panels |
| R6 | 2026-09-14 to 2026-09-27 | Beta 2 | Optional snapshot rollups and retention controls |
| R7 | 2026-09-28 to 2026-10-11 | RC 1 | Security hardening, audit fixes, regression freeze |
| R8 | 2026-10-12 to 2026-10-25 | RC 2 | Optional Grafana profile and dashboards |
| R9 | 2026-10-26 to 2026-11-08 | GA | Final validation, docs, and upstream release readiness |

Dates are planning targets, not contractual release dates. Upstream maintainer feedback should override schedule pressure.

### Release policy

Each milestone must end with one of these outcomes:

```text
accepted       feature complete, tests pass, docs updated
carried        partially complete, explicitly moved to next release
rejected       approach abandoned or replaced
blocked        dependency or upstream decision required
```

No milestone should silently drift. Work either lands, moves, is rejected, or is blocked.

## Release Scope by Milestone

## R0: Documentation / RFC Baseline

### Goal

Establish consensus before implementation.

### Deliverables

```text
docs/METRICS-ROADMAP.md
docs/KPI-ANALYTICS-DECISION.md
docs/OPS-METRICS-SPEC.md
docs/OBSERVABILITY-AND-ANALYTICS-DESIGN.md
docs/OBSERVABILITY-AND-ANALYTICS-ARCHITECTURE.md
docs/RFC-OBSERVABILITY-AND-KPI-ANALYTICS.md
docs/ROADMAP-OBSERVABILITY-ANALYTICS-TESTING-SECURITY.md
```

### Acceptance gates

- RFC can be pasted into upstream issue.
- Architecture clearly separates operations metrics from gameplay analytics.
- Security defaults are explicit.
- Release cadence and testing plan are documented.

## R1: Metrics Stack MVP

### Goal

Create an opt-in Prometheus stack with standard exporters.

### Deliverables

```text
docker-compose.metrics.yml
runtime/metrics/prometheus.yml
runtime/metrics/rules/host.yml
runtime/metrics/rules/containers.yml
runtime/metrics/rules/postgres.yml
runtime/metrics/rules/rabbitmq.yml
runtime/scripts/metrics-stack.sh
runtime/scripts/metrics-status.sh
```

### Features

- `dune metrics start`.
- `dune metrics stop`.
- `dune metrics restart`.
- `dune metrics status`.
- Prometheus retention defaults.
- node_exporter target.
- cAdvisor target.
- postgres_exporter target.
- RabbitMQ admin/game targets.

### Release gates

- Metrics stack is opt-in.
- Game stack can start without metrics stack.
- Metrics stack can start without breaking game stack.
- Prometheus target page shows node/cAdvisor/Postgres/RabbitMQ targets.
- Exporters are not publicly exposed by default.
- No secrets are committed.

### Tests

Unit:

- shell argument parsing for `metrics-stack.sh`;
- generated Prometheus config path validation;
- environment default resolution.

Integration:

- compose config validation;
- metrics stack start/stop;
- Prometheus health endpoint;
- target discovery;
- exporter endpoint reachability.

Regression:

- existing `dune start` behavior unchanged;
- existing WebUI starts on port `8088`;
- Postgres starts on `127.0.0.1:15432`;
- RabbitMQ start script remains compatible.

## R2: Console Exporter

### Goal

Expose Dune-specific operational metrics that standard exporters cannot know.

### Deliverables

```text
console/api/src/services/prometheusText.js
console/api/src/services/metrics.js
console/api/src/services/requestMetrics.js
console/api/src/routes/metrics.js or server.js route additions
runtime/metrics/rules/dune-stack.yml
```

### Features

- Prometheus text exposition helper.
- `/api/metrics/prometheus` or internal `127.0.0.1:9108/metrics` endpoint.
- API request counters.
- API request duration histograms.
- task failure counters.
- stack readiness gauges.
- required listener gauges.
- container expected/running gauges.
- population/capacity gauges.

### Release gates

- Metrics endpoint emits valid Prometheus exposition format.
- Metrics endpoint does not leak tokens/passwords/raw commands/raw SQL.
- Labels are low-cardinality only.
- Metrics can be scraped by Prometheus.
- Existing API routes remain compatible.

### Tests

Unit:

- Prometheus string escaping;
- label key validation;
- label value escaping;
- histogram bucket formatting;
- route normalization;
- secret redaction;
- metric registry reset behavior.

Integration:

- scrape endpoint returns 200;
- Prometheus accepts scrape;
- stack metrics reflect stopped/running service states;
- listener metrics reflect known ports;
- request counters increment after API calls.

Regression:

- authentication behavior unchanged for normal API routes;
- public health endpoints remain public only where intended;
- no new unauthenticated admin routes.

## R3: Operations WebUI

### Goal

Add a native Operations/Metrics section backed by Prometheus query APIs proxied through the Console API.

### Deliverables

```text
console/web/src/api/metrics.ts
console/web/src/features/metrics/MetricsPanel.tsx
console/api/src/services/prometheusClient.js
console/api/src/services/metricsQueries.js
```

### Features

Tabs:

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

API routes:

```text
GET /api/metrics/state
GET /api/metrics/targets
GET /api/metrics/alerts
GET /api/metrics/query
GET /api/metrics/range
POST /api/metrics/start
POST /api/metrics/stop
POST /api/metrics/restart
```

### Release gates

- Browser does not call Prometheus directly.
- Console API validates/safely proxies PromQL requests.
- Overview displays useful state when Prometheus is running.
- Overview degrades gracefully when Prometheus is not running.
- Operations UI is separate from gameplay Analytics.

### Tests

Unit frontend:

- metrics API client parsing;
- card value formatting;
- byte/percentage/rate formatting;
- down/unavailable state rendering;
- tab routing/rendering.

Unit backend:

- Prometheus query allowlist or validation;
- query parameter validation;
- timeout handling;
- error normalization.

Integration:

- browser/API route returns target health;
- alert state renders;
- Postgres down state shown when exporter reports down;
- RabbitMQ down state shown when target is down.

Regression:

- Home dashboard performance cards still work;
- Server Control/Services/Logs tabs still work;
- auth/session behavior unchanged.

## R4: Analytics Schema Scanner

### Goal

Discover what gameplay KPI data is available in the live Dune database without hard-coding unsafe schema assumptions.

### Deliverables

```text
console/api/src/services/kpiAnalytics.js
console/api/src/services/kpiSchemaScanner.js
console/web/src/api/analytics.ts
console/web/src/features/analytics/SchemaSupportPanel.tsx
```

### Features

- `GET /api/analytics/schema-scan`.
- capability matrix.
- source-quality classification.
- table/column discovery for kill/resource/item/economy/progression/guild/activity categories.

Source quality:

```text
Exact        direct event/history table
Snapshot     console snapshot delta
Current      current state only
Unsupported  no reliable source found
```

### Release gates

- Scanner is read-only.
- Scanner handles missing tables.
- Scanner handles schema drift.
- Scanner does not expose credentials.
- Scanner output is clear enough for admins and maintainers.

### Tests

Unit:

- candidate table matching;
- candidate column matching;
- source-quality classification;
- unsupported/partial/supported states;
- identifier validation.

Integration:

- scanner runs against real or seeded Postgres;
- scanner works when `dune.items` exists;
- scanner works when kill tables are missing;
- scanner works when optional tables are absent.

Regression:

- existing Database tab table listing still works;
- existing player list/profile queries still work;
- live map queries still work.

## R5: Analytics MVP

### Goal

Deliver the first useful native gameplay KPI dashboard using read-only current-state queries and exact event queries only where available.

### Deliverables

```text
console/web/src/features/analytics/AnalyticsPanel.tsx
console/web/src/features/analytics/PlayersAnalytics.tsx
console/web/src/features/analytics/ItemsAnalytics.tsx
console/web/src/features/analytics/EconomyAnalytics.tsx
console/web/src/features/analytics/ProgressionAnalytics.tsx
console/web/src/features/analytics/GuildFactionAnalytics.tsx
```

### Features

- Online/current players.
- Unique seen counts if timestamp columns exist.
- Active players by map/partition.
- Item/resource current totals from inventory/items.
- Currency total economy size.
- Top currency balances.
- Progression distribution.
- Guild/faction membership counts.
- Kills/resources panels show exact, partial, or unsupported state.

### Release gates

- No mutation of `dune` schema.
- KPI source quality shown in UI.
- Exact labels are used only for direct event/history data.
- Snapshot/current labels are visibly distinct from exact event metrics.
- Queries have limits and timeouts.

### Tests

Unit:

- KPI summary query builders;
- read-only SQL guard;
- row normalization;
- source quality UI rendering;
- empty-state rendering.

Integration:

- analytics summary endpoint works with known tables;
- missing optional tables return partial/unsupported;
- item totals work with seeded data;
- currency totals work with seeded data.

Regression:

- admin item catalog still resolves items;
- player admin tools still work;
- database editing behavior unchanged.

## R6: Snapshot Rollups

### Goal

Add optional historical KPI snapshots without touching game-owned tables.

### Deliverables

```text
runtime/sql/console_analytics_schema.sql
console/api/src/services/analyticsSnapshots.js
console/api/src/services/analyticsRetention.js
runtime/scripts/analytics-snapshot.sh
```

### Features

- Optional `console_analytics` schema.
- Snapshot run table.
- player daily snapshots.
- item/resource daily summaries.
- currency balance deltas.
- map activity summaries.
- guild/faction snapshots.
- retention cleanup.

### Release gates

- Snapshots disabled by default.
- Writes only to `console_analytics`.
- Snapshot runs are idempotent or safely deduplicated.
- Retention is configurable.
- Snapshot delta metrics are labeled `Snapshot`, not `Exact`.

### Tests

Unit:

- rollup SQL generation;
- retention cutoff calculation;
- duplicate snapshot handling;
- delta calculation;
- source-quality propagation.

Integration:

- schema creation succeeds;
- snapshot run inserts expected rows;
- retention cleanup deletes only old console analytics rows;
- analytics API reads rollups when enabled.

Regression:

- disabling snapshots leaves Analytics current-state views functional;
- dropping `console_analytics` does not affect Dune schema;
- game startup unaffected.

## R7: Security Hardening and Beta

### Goal

Freeze feature scope, perform comprehensive security hardening, and produce beta-ready release.

### Deliverables

```text
docs/SECURITY-AUDIT-OBSERVABILITY-ANALYTICS.md
docs/THREAT-MODEL-OBSERVABILITY-ANALYTICS.md
docs/SECURITY-CHECKLIST-OBSERVABILITY-ANALYTICS.md
```

### Features

- threat model;
- security checklist;
- dependency review;
- secret handling review;
- authz/authn review;
- exporter exposure review;
- Prometheus label cardinality audit;
- analytics query safety review;
- container mount/capability audit;
- Grafana hardening plan.

### Release gates

- No critical/high security findings open.
- Medium findings have mitigation plan or explicit acceptance.
- Public exposure defaults reviewed.
- Secrets not logged, emitted, rendered, or committed.
- Prometheus label policy enforced.
- SQL query safety reviewed.
- Rollup writes limited to `console_analytics`.

### Tests

Security tests:

- unauthenticated metrics control route attempts fail;
- Prometheus proxy rejects unsafe/unexpected query parameters;
- metrics labels reject disallowed dimensions;
- analytics SQL rejects writes;
- secret redaction tests;
- path traversal tests for generated config/log routes;
- CSRF/session checks for POST routes;
- brute-force/rate-limit review for auth-sensitive endpoints.

Regression:

- full smoke suite from R1-R6;
- migration/upgrade from metrics disabled to enabled;
- rollback from enabled to disabled;
- fresh install behavior.

## R8: Optional Grafana Profile

### Goal

Add optional Grafana service and dashboards without making Grafana required.

### Deliverables

```text
runtime/metrics/grafana/provisioning/datasources/prometheus.yml
runtime/metrics/grafana/provisioning/dashboards/dashboards.yml
runtime/metrics/grafana/dashboards/dune-operations.json
```

### Features

- Grafana compose profile disabled by default.
- Prometheus datasource provisioning.
- Operations dashboard.
- WebUI link-out when enabled.
- No iframe embedding by default.

### Release gates

- Grafana disabled by default.
- Grafana binds localhost/internal by default.
- Default admin credentials are not committed.
- Datasource points to internal Prometheus.
- WebUI works without Grafana.

### Tests

Unit:

- generated provisioning file validation;
- Settings/UI state if Grafana disabled/enabled.

Integration:

- Grafana starts with profile;
- Prometheus datasource is available;
- dashboard loads;
- Grafana disabled path has no broken WebUI state.

Security:

- no anonymous public dashboard exposure by default;
- no iframe embedding unless explicitly configured;
- admin credential handling validated.

## R9: GA Readiness

### Goal

Stabilize for upstream merge/release.

### Deliverables

```text
docs/OPERATIONS-METRICS-USER-GUIDE.md
docs/ANALYTICS-USER-GUIDE.md
docs/UPGRADE-NOTES-OBSERVABILITY-ANALYTICS.md
docs/TROUBLESHOOTING-METRICS-ANALYTICS.md
```

### Release gates

- Full test suite passes.
- Full regression suite passes.
- Security audit complete.
- Docs complete.
- Upgrade and rollback tested.
- Metrics disabled default path verified.
- Metrics enabled path verified.
- Analytics read-only path verified.
- Snapshot opt-in path verified.
- Grafana disabled default path verified.
- Grafana optional path verified.

## Testing Strategy

## Test Pyramid

```text
Unit tests             widest coverage; fast; required for every PR
Integration tests      service/API/DB/Prometheus/exporter coverage
Regression tests       prevent breaking existing console behavior
Security tests         auth, secrets, exposure, SQL, labels, containers
Performance tests      scrape cost, query latency, UI responsiveness
Manual smoke tests     install/upgrade/rollback/admin workflows
```

## Unit Testing Plan

### Backend unit tests

Target areas:

```text
console/api/src/services/prometheusText.js
console/api/src/services/metrics.js
console/api/src/services/prometheusClient.js
console/api/src/services/kpiSchemaScanner.js
console/api/src/services/kpiAnalytics.js
console/api/src/services/analyticsSnapshots.js
console/api/src/db.js helper usage
```

Required coverage:

- Prometheus exposition formatting.
- Label escaping.
- Metric name validation.
- Disallowed label rejection.
- Secret redaction.
- Prometheus query parameter validation.
- Prometheus timeout/error handling.
- analytics schema matching.
- source-quality classification.
- read-only SQL enforcement.
- identifier validation.
- snapshot delta calculations.
- retention cutoff calculations.

Minimum gate:

```text
80% line coverage for new backend files
90% coverage for security-sensitive helpers
100% branch coverage for secret redaction and label policy helpers
```

### Frontend unit tests

Target areas:

```text
console/web/src/api/metrics.ts
console/web/src/api/analytics.ts
console/web/src/features/metrics/*
console/web/src/features/analytics/*
```

Required coverage:

- API response parsing.
- error-state rendering.
- disabled metrics state rendering.
- unavailable Prometheus state rendering.
- target health rendering.
- alert severity rendering.
- KPI source-quality badges.
- empty/unsupported/partial/exact states.
- byte/rate/percentage/time formatting.

Minimum gate:

```text
75% line coverage for new frontend files
all critical empty/error state components covered
```

### Script unit tests

Target areas:

```text
runtime/scripts/metrics-stack.sh
runtime/scripts/metrics-status.sh
runtime/scripts/analytics-snapshot.sh
```

Required coverage:

- command parsing;
- env var resolution;
- compose file selection;
- unsupported command handling;
- safe failure behavior;
- generated config path validation.

Preferred tools:

```text
shellcheck
bats-core or equivalent shell test harness
```

## Integration Testing Plan

### Metrics stack integration

Scenarios:

1. Fresh install, metrics disabled.
2. Start metrics stack.
3. Verify Prometheus health.
4. Verify node exporter target.
5. Verify cAdvisor target.
6. Verify postgres exporter target.
7. Verify RabbitMQ admin target.
8. Verify RabbitMQ game target.
9. Stop metrics stack.
10. Verify game stack unaffected.

### Console exporter integration

Scenarios:

- endpoint returns valid Prometheus text;
- Prometheus scrapes endpoint;
- request counters increment;
- stack gauges change after service stop/start;
- listener gauges reflect open/closed ports;
- no disallowed labels appear in exposition output.

### Operations WebUI integration

Scenarios:

- Metrics tab loads with Prometheus up;
- Metrics tab loads gracefully with Prometheus down;
- target list displays up/down state;
- alerts display severity/status;
- host, container, RMQ, and Postgres cards render;
- start/stop/restart controls execute authorized task flow.

### Analytics integration

Scenarios:

- schema scanner against seeded schema;
- schema scanner against real Dune schema;
- missing kill table returns unsupported;
- item/inventory tables return current totals;
- currency balances return totals;
- progression queries return distributions;
- guild/faction queries return counts;
- analytics UI shows source-quality badges.

### Snapshot integration

Scenarios:

- create `console_analytics` schema;
- run initial snapshot;
- run second snapshot;
- compute deltas;
- retention cleanup;
- disable snapshots;
- drop console analytics schema without damaging `dune` schema.

## Regression Testing Plan

## Existing behavior that must not break

### Install/startup regression

- `install.sh` still completes.
- WebUI starts on expected port.
- Game stack starts without metrics enabled.
- Existing `.env` behavior remains compatible.
- Existing Docker compose files still work.

### Server control regression

- start server;
- stop server;
- restart server;
- status;
- readiness;
- logs;
- updates;
- backups.

### Database regression

- DB status;
- schema listing;
- table listing;
- table counts;
- table preview;
- read-only SQL;
- guarded destructive SQL flow;
- table editing behavior where already supported.

### Player/admin regression

- player list;
- player profile;
- inventory view;
- currency editing flow;
- specialization flow;
- care package flow;
- live map player/vehicle/placeable markers.

### Services regression

- Postgres start/status;
- RabbitMQ admin/game start/status;
- text router;
- director;
- gateway;
- survival server;
- overmap;
- autoscaler;
- orchestrator.

## Regression test frequency

| Test suite | PR | Nightly | Release Candidate | GA |
|---|---:|---:|---:|---:|
| Unit | required | required | required | required |
| Lint/typecheck | required | required | required | required |
| Compose config validation | required | required | required | required |
| Backend API smoke | required | required | required | required |
| Frontend smoke | required | required | required | required |
| Metrics stack integration | optional on PR, required if touched | required | required | required |
| DB analytics integration | optional on PR, required if touched | required | required | required |
| Security tests | required if touched | required | required | required |
| Full manual install smoke | not required | weekly | required | required |

## Performance Testing Plan

## Metrics performance

Measure:

- Prometheus scrape duration.
- Prometheus target scrape size.
- Prometheus memory and disk usage.
- cAdvisor overhead.
- node exporter overhead.
- postgres exporter query overhead.
- RabbitMQ scrape payload size.
- Console exporter latency.

Budgets:

```text
Console exporter response time: p95 < 500ms
Prometheus scrape interval default: 15s
Container scrape interval: 10s
Prometheus retention: 7d / 2GB default
Operations API query response: p95 < 1s for instant queries
Operations API range response: p95 < 2s for dashboard windows
```

## Analytics performance

Measure:

- schema scan latency;
- analytics summary query latency;
- item totals query latency;
- player activity query latency;
- snapshot duration;
- rollup table size growth.

Budgets:

```text
Schema scan: p95 < 2s
Analytics summary: p95 < 2s
Dashboard panel query: p95 < 2s
Snapshot run: < 60s for normal small/medium self-hosted DB
Analytics API default limit: enforced
Long-running query timeout: enforced
```

## Security Audit Strategy

## Security standards baseline

Use these as review guides:

- OWASP ASVS for application-level security verification.
- OWASP Web Security Testing Guide for web application and web service testing methodology.
- Prometheus instrumentation guidance for label cardinality and avoiding unbounded labels.
- Grafana security hardening guidance for optional Grafana deployment.

## Threat model scope

### Assets

```text
Admin session cookie/token
DUNE_COMMAND_AUTH_TOKEN
Postgres credentials
RabbitMQ credentials/cookies
Funcom/FLS identifiers/tokens if present
Prometheus metrics store
Grafana admin credentials if enabled
Dune game database
console_analytics schema
Docker socket
host filesystem mounts
admin logs and generated config
```

### Trust boundaries

```text
Browser -> Console API
Console API -> Docker socket
Console API -> Postgres
Console API -> Prometheus
Prometheus -> exporters
postgres_exporter -> Postgres
Grafana -> Prometheus
Analytics service -> Dune DB
Snapshot service -> console_analytics
```

### Primary threats

```text
unauthenticated metrics control
unauthorized Prometheus query proxy use
secret leakage through metrics labels
high-cardinality metric DoS
SQL injection through analytics filters
write access to dune schema through analytics
public exporter exposure
Grafana anonymous access or weak default credentials
Docker socket abuse
path traversal in generated config/log endpoints
CSRF against start/stop/restart metrics controls
stored XSS through rendered labels, table names, route names, error messages
sensitive player identifiers exposed in unaudited UI paths
```

## Security audit checklist

### Authentication and authorization

- All metrics control routes require admin auth.
- Prometheus query proxy requires admin auth.
- Analytics endpoints require admin auth.
- Public health/auth routes remain intentionally limited.
- POST routes have same auth/session protections as existing admin actions.
- No new unauthenticated administrative route is introduced.

### Secrets

- No DB password in Git-tracked config.
- No Grafana admin password in Git-tracked config.
- No RabbitMQ secrets in metrics output.
- No Funcom/FLS tokens in metrics output.
- No command auth token in metrics output.
- Logs redact credentials.
- API errors redact connection strings.
- Prometheus labels never contain secrets.

### Metrics label policy

Allowed labels:

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
job
instance
```

Disallowed labels:

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
raw_sql
```

Audit tasks:

- inspect every metric definition;
- test label validation helper;
- test rendered metrics for disallowed labels;
- ensure route labels are normalized, not raw paths with IDs.

### SQL and database safety

- Analytics uses parameterized SQL.
- Schema/table identifiers pass existing identifier validation helpers.
- Analytics uses read-only queries unless explicitly writing to `console_analytics`.
- Snapshot writes only to `console_analytics`.
- No analytics query mutates `dune` schema.
- Long-running analytics queries have timeouts.
- Results are limited/paginated.

### Exporter and network exposure

- Prometheus binds localhost/internal by default.
- Grafana binds localhost/internal by default.
- node exporter not public.
- cAdvisor not public.
- postgres exporter not public.
- RabbitMQ metrics not public.
- Docker socket remains mounted only where already necessary.
- cAdvisor mounts are read-only where practical.

### Web security

- React renders data safely.
- Table names, route names, label values, and error text are not injected as raw HTML.
- API errors do not reveal secrets.
- CSRF posture matches existing admin mutation routes.
- Prometheus query proxy blocks dangerous or unexpected parameters.
- Metrics start/stop/restart cannot be triggered cross-origin without valid auth.

### Grafana hardening

- Grafana disabled by default.
- No anonymous access by default.
- No public exposure by default.
- No default admin password committed.
- No iframe embedding by default.
- Datasource points only to internal Prometheus.
- Provisioning files contain no secrets.

### Supply chain

- Pin exporter image versions before GA.
- Document image update cadence.
- Run dependency audit for Node packages.
- Run container image vulnerability scan where available.
- Track CVEs for Prometheus, Grafana, node_exporter, cAdvisor, postgres_exporter, and RabbitMQ base images.

## Security audit cadence

| Audit Type | Cadence | Required For |
|---|---:|---|
| Lightweight security review | every PR touching metrics/API/auth/DB | PR merge |
| Dependency audit | weekly during active development | beta and GA |
| Container image scan | every release candidate | RC and GA |
| Secret scan | every PR and every release | PR, RC, GA |
| Label cardinality audit | every metrics change | PR merge |
| SQL safety audit | every analytics change | PR merge |
| Full threat model review | R7 and before GA | beta, GA |
| Manual web security test pass | R7 and R9 | beta, GA |

## CI / Quality Gates

## Required PR gates

```text
npm install / npm ci succeeds
frontend build succeeds
backend import/start smoke succeeds
unit tests pass
lint/typecheck pass if available
shellcheck passes for changed shell scripts
compose config validates
secret scan passes
no disallowed Prometheus labels
no raw credentials in generated docs/config
```

## Required release-candidate gates

```text
all PR gates pass
integration test suite passes
regression test suite passes
metrics stack start/stop tested
analytics schema scanner tested
security audit completed
threat model updated
docs updated
upgrade/rollback tested
```

## Required GA gates

```text
no critical/high vulnerabilities open
medium vulnerabilities triaged
all release-candidate gates pass
manual fresh install passes
manual upgrade passes
manual rollback passes
metrics disabled default verified
metrics enabled path verified
Grafana disabled default verified
Grafana optional path verified
snapshot disabled default verified
snapshot enabled path verified
upstream RFC accepted or scoped follow-up issue created
```

## Definition of Done

A milestone is done only when:

- code is merged or intentionally deferred;
- tests relevant to the milestone pass;
- docs are updated;
- security checklist items are complete;
- regressions are checked;
- open issues are documented;
- upstream-facing summary is ready.

## Upstream Issue Checklist

When opening or updating the upstream issue, include:

```text
[x] Problem statement
[x] Proposed architecture
[x] Release roadmap
[x] Testing strategy
[x] Regression strategy
[x] Security audit strategy
[x] Acceptance criteria
[x] Open questions
[x] Out-of-scope items
[x] Rollback plan
```

## Rollback Plan

### Metrics stack rollback

```text
dune metrics stop
docker compose -f docker-compose.metrics.yml down
remove metrics volumes only if intentionally deleting historical metrics
leave game stack untouched
```

### Console exporter rollback

- Remove Prometheus scrape target.
- Disable metrics route/listener.
- Keep existing WebUI and API routes unchanged.

### Analytics rollback

- Disable Analytics tab if needed.
- Disable snapshots.
- Drop `console_analytics` only if user intentionally wants to delete rollups.
- Never drop or mutate `dune` schema as part of rollback.

### Grafana rollback

```text
docker compose -f docker-compose.metrics.yml --profile grafana down dune-grafana
```

WebUI should degrade to link-hidden state when Grafana is unavailable.

## Final Recommendation

Proceed in this order:

1. Land docs/RFC upstream.
2. Implement R1 metrics stack MVP.
3. Implement R2 console exporter.
4. Implement R3 Operations WebUI.
5. Implement R4 schema scanner.
6. Implement R5 Analytics MVP.
7. Implement R6 snapshot rollups only after R5 is stable.
8. Perform R7 security hardening before beta.
9. Add R8 Grafana only after WebUI-native operations are stable.
10. Cut R9 GA after full regression and security gates pass.

This path gives operators industry-standard ops metrics while keeping detailed gameplay KPIs in the correct data plane.
