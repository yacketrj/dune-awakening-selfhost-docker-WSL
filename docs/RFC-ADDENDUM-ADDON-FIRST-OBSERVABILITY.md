# RFC Addendum: Addon-First Observability and KPI Analytics

Status: proposed addendum
Date: 2026-06-30
Related RFC: `docs/RFC-OBSERVABILITY-AND-KPI-ANALYTICS.md`
Related issue: #82

## Summary

This addendum refines the original observability and gameplay KPI analytics RFC after review of the Dune Docker Console addon model.

The revised recommendation is to move WebUI-heavy operations, observability, and gameplay analytics work into a separate addon repository wherever the current addon bridge can support the required data access. Core Console or upstream changes should be limited to small, security-reviewed bridge/API extensions that make addon delivery possible.

This changes the preferred delivery model from:

```text
large core PRs for metrics, UI, analytics, and dashboards
```

To:

```text
small core PRs for bridge/API capabilities
addon repository for UI, dashboards, read-only analytics, and release iteration
```

## Decision

Adopt an addon-first model for user-facing observability and KPI analytics.

The core Dune Docker Console repository should provide only the minimal backend and bridge capabilities that cannot be implemented safely inside an addon. The addon repository should own the dashboard UI, read-only gameplay analytics panels, player/activity views, and addon release workflow.

## Rationale

The addon template establishes a UI-oriented extension model. Addons run inside an iframe and communicate with Dune Docker Console through a permissioned bridge. Server owners review requested addon permissions at install time. This fits read-only dashboards and analytics better than repeatedly expanding the core console UI.

The current bridge exposes small, explicit actions such as:

```text
leadership.players.list
 database.query
 database.execute
```

The current permission model supports narrow permissions such as:

```text
players:read
 database:read
 database:write
```

This is a strong fit for:

- player summary dashboards;
- read-only database-backed KPI panels;
- addon-owned UI navigation;
- local mock-data development;
- independent addon versioning and release cadence.

It is a weaker fit for host/runtime infrastructure that must modify Docker Compose, Prometheus scrape configuration, exporter processes, or the Console API dispatcher itself.

## Revised Architecture

```text
Core Dune Docker Console / upstream
  minimal bridge actions
  minimal permissions
  optional metrics backend endpoints
  optional Prometheus scrape/exporter support
  security-reviewed API surfaces

Observability / KPI addon repository
  Operations dashboard UI
  player summary panels
  read-only KPI analytics panels
  schema support views
  mock-data local development
  addon release packaging
```

## Workstream Split

| Workstream | Preferred home | Notes |
| --- | --- | --- |
| Operations dashboard UI | Addon repository | iframe addon page using bridge actions |
| Player/activity panels | Addon repository | use `players:read` / `leadership.players.list` where sufficient |
| Read-only gameplay KPI analytics | Addon repository | use `database:read` / `database.query` |
| Schema support / capability matrix | Addon repository first | may require read-only SQL only |
| Addon packaging and releases | Addon repository | independent version tags and release zip |
| Community addon listing | addon index PR | small release/distribution PR when ready |
| Prometheus Compose stack | Core/fork or optional upstream PR | addon model does not manage Docker services |
| Prometheus scrape config | Core/fork or optional upstream PR | runtime config, not addon UI |
| Console API request metrics | Core/fork or optional upstream PR | requires API dispatcher instrumentation |
| `/api/metrics/prometheus` | Core/fork or optional upstream PR | scrape endpoint must live in API/backend |
| Prometheus query proxy | Core bridge/API extension | addon can consume it after bridge support exists |
| Alert/target state APIs | Core bridge/API extension | addon can render state after bridge support exists |

## Revised Milestones

### R2A: Addon shell

Create a dedicated addon repository using the Dune Docker addon template.

Initial addon metadata should use a stable addon id, for example:

```text
dune-ops-observability
```

Initial permissions should remain narrow:

```json
{
  "players": ["read"],
  "database": ["read"]
}
```

### R2B: Bridge health and diagnostics panel

Add a basic addon panel that verifies:

- addon iframe loading;
- bridge availability;
- permissioned request/response behavior;
- local mock-data fallback when opened outside Dune Docker Console.

### R2C: Player summary panel

Use existing bridge capabilities to display player summary data where available.

### R2D: Read-only KPI query panel

Use read-only database bridge access for safe KPI exploration.

Requirements:

- no write permissions;
- no raw SQL display in public UI by default;
- parameterized/query-template approach where possible;
- clear source-quality labels: `Exact`, `Snapshot`, `Current`, or `Unsupported`.

### R2E: Schema capability panel

Expose which KPI categories are supported by the current database schema.

Categories:

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

### R2F: Optional core bridge extensions

If addon work requires data that cannot be retrieved through existing bridge actions, open small upstream PRs for specific bridge actions and permissions.

Candidate future actions:

```text
server.status
metrics.state
metrics.targets
metrics.alerts
metrics.query
analytics.schemaScan
analytics.summary
```

Candidate future permissions:

```text
server:status
metrics:read
analytics:read
```

Each bridge extension should be independently reviewable and should avoid granting broad admin power.

## Security Position

The addon-first model does not weaken the security requirements from the original RFC.

Required constraints:

- request only the narrow permissions needed by the addon;
- keep initial addon mode read-only;
- do not request `database:write` for observability or KPI MVP work;
- do not expose player identifiers, Funcom IDs, raw SQL, raw command text, raw errors, tokens, passwords, or file paths in dashboards;
- keep labels and dashboard groupings low-cardinality;
- keep Prometheus/exporters internal or localhost-bound when core metrics are used;
- prefer bridge-mediated access over direct browser access to backend services.

## Effect on Existing R1/R2 Work

The existing R1 metrics stack remains valid as an opt-in operational metrics implementation.

The current R2 console exporter foundation remains useful, but server/API wiring should pause until the addon-first split is settled. If the addon can satisfy the UI and analytics requirements through bridge actions, core exporter work can be reduced to only the backend metrics primitives that are genuinely needed.

## Upstream PR Strategy

The addon-first approach reduces upstream PR pressure.

Instead of submitting large upstream PRs that combine runtime services, API changes, WebUI changes, and analytics features, future upstream work should be limited to:

1. minimal bridge actions;
2. minimal permission additions;
3. optional metrics backend endpoints;
4. optional Prometheus stack support if upstream wants it in core.

Most dashboard and analytics iteration should happen in the addon repository.

## Updated Acceptance Criteria

The original RFC acceptance criteria still apply to any core metrics implementation. This addendum adds addon-specific acceptance criteria:

- addon installs through the existing Dune Docker Console addon mechanism;
- addon requests only documented, narrow permissions;
- addon loads inside the Console iframe without requiring core WebUI modifications;
- addon supports local mock-data development outside the Console iframe;
- read-only KPI views work with `database:read` where possible;
- player summary views work with `players:read` where possible;
- unsupported KPI categories are shown as unsupported rather than inferred;
- any required core bridge extensions are submitted as small, isolated PRs.

## Updated Open Questions

1. Should the addon be named `Dune Ops Observability`, `Dune Operations Dashboard`, or `Dune Analytics Console`?
2. Should operations metrics and gameplay KPI analytics ship as one addon or two separate addons?
3. Should `metrics:read` be added as a first-class addon permission?
4. Should `analytics:read` be separate from `database:read` to avoid exposing arbitrary read-only SQL to addons?
5. Should Prometheus query access be exposed through a curated bridge action instead of a raw PromQL proxy?
6. Should the addon index accept observability addons that depend on optional core bridge extensions?

## Conclusion

The revised recommendation is to proceed addon-first for user-facing observability and analytics. Core work should continue only where the addon model cannot safely provide the required backend capability.

This keeps upstream risk low, preserves the original security posture, and allows the observability/KPI workstreams to continue in an independent repository with faster iteration and smaller upstream review surfaces.
