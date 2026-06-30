# Summary

<!-- Briefly describe what this PR changes. Include the tracked issue number, milestone/release phase, and branch. -->

- Tracking issue:
- Release phase: <!-- R0/R1/R2/R3/R4/R5/R6/R7/R8/R9 -->
- Branch:

## Why

<!-- Explain the problem, user/admin impact, and why this implementation path was chosen. -->

## Scope

<!-- List the concrete files, components, API routes, scripts, docs, or configs changed. -->

### In scope

-

### Out of scope

-

## Architecture / Design Notes

<!-- Summarize architectural decisions and reference design docs when relevant. -->

- Design doc:
- Architecture doc:
- RFC:
- Roadmap:

## User-Facing Changes

<!-- Describe WebUI, CLI, docs, configuration, or operational behavior changes. -->

-

## Operational Impact

<!-- Required for metrics, Docker, Postgres, RabbitMQ, Grafana, or runtime stack changes. -->

- Metrics stack impact:
- Game stack impact:
- Postgres impact:
- RabbitMQ impact:
- Docker/container impact:
- Default enablement state:
- Rollback path:

## Gameplay Analytics / KPI Impact

<!-- Required for analytics/KPI changes. Mark N/A when not applicable. -->

- KPI categories affected:
- Source quality: <!-- Exact / Snapshot / Current / Unsupported / N/A -->
- Dune schema mutation: <!-- Must be No unless explicitly reviewed -->
- console_analytics mutation: <!-- Yes/No/N/A -->
- High-cardinality data handled safely: <!-- Yes/No/N/A -->

## Test Output

<!-- Paste exact command output or summarize with enough detail to reproduce. Do not leave blank. -->

### Unit tests

```text
# command:
# result:
```

### Integration tests

```text
# command:
# result:
```

### Regression tests

```text
# command:
# result:
```

### Manual smoke tests

```text
# command / steps:
# result:
```

## Security Output

<!-- Required for every PR. Paste scanner output or explain why a check is not applicable. -->

### Auth / authorization

- [ ] New admin routes require authentication or are intentionally public and documented.
- [ ] POST/mutation routes follow existing admin auth/session protections.
- [ ] Browser does not call internal Prometheus/exporter/Postgres endpoints directly.

### Secrets

- [ ] No DB, RabbitMQ, Grafana, Funcom/FLS, command auth, or session secrets are committed.
- [ ] Metrics output does not expose secrets.
- [ ] Logs/errors redact credentials and connection strings.

### SQL / database safety

- [ ] Analytics queries are parameterized.
- [ ] Identifier inputs are validated.
- [ ] Analytics does not mutate the game-owned `dune` schema.
- [ ] Rollup writes, if any, are limited to `console_analytics`.
- [ ] Query limits/timeouts are enforced where needed.

### Prometheus label policy

- [ ] No high-cardinality/sensitive labels are emitted.
- [ ] Route labels are normalized and do not contain raw IDs.
- [ ] No labels contain player IDs, character names, account IDs, item IDs, victim/killer IDs, coordinates, raw errors, file paths, command text, or raw SQL.

### Exporter / network exposure

- [ ] Prometheus is localhost/internal by default.
- [ ] Grafana is disabled or localhost/internal by default.
- [ ] node_exporter, cAdvisor, postgres_exporter, and RabbitMQ metrics are not public by default.
- [ ] Docker socket and host mounts are not expanded beyond the approved design.

### Security command output

```text
# npm audit / dependency scan:
# secret scan:
# shellcheck / static checks:
# container scan, if applicable:
# result:
```

## Documentation

- [ ] README or user docs updated where needed.
- [ ] Design/architecture/RFC docs updated where needed.
- [ ] Roadmap/checklist updated where needed.
- [ ] Upgrade/rollback notes updated where needed.

## Release Gate Checklist

- [ ] Code builds.
- [ ] Unit tests pass.
- [ ] Integration tests pass or documented as not applicable.
- [ ] Regression checks pass or documented as not applicable.
- [ ] Security checks pass or findings are documented.
- [ ] Rollback path documented.
- [ ] Known risks documented.

## Screenshots / Logs

<!-- Attach screenshots for WebUI changes and logs for CLI/runtime changes. -->

## Known Risks / Follow-ups

-
