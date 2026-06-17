# Dune Discord Control Bot - Development Standards

## Purpose

This document defines the engineering standards for the Discord Control Bot and its Dune Console API adapter. The goal is to deliver WebUI parity using industry-standard development practices while maintaining security, auditability, and SOC 2 readiness evidence.

## Core Engineering Standards

1. Use TypeScript with strict compiler settings.
2. Use small, typed modules with explicit boundaries.
3. Keep Discord client logic separate from Dune Console API adapter logic.
4. Do not duplicate privileged WebUI backend logic inside the bot.
5. Prefer allowlists over denylists for service names, command names, file paths, and action types.
6. Use structured logging with redaction.
7. Treat all Discord inputs as untrusted.
8. Test authorization and confirmation behavior before feature completeness.
9. Require PR review before merge.
10. Produce compliance evidence as part of normal CI.

## Architecture Standards

### Required Separation of Concerns

| Layer | Responsibility | Must Not Do |
| --- | --- | --- |
| Discord Bot Client | Discord connection, slash commands, interaction UX, formatting | Final authorization, direct Docker control, direct destructive DB writes |
| Dune Console Discord API Adapter | Bot auth, server-side authorization, confirmations, audit, safe routing | Expose broad unauthenticated WebUI APIs |
| Existing Console Backend | Reuse WebUI execution paths and safety behavior | Trust Discord client-only checks |
| Dune Stack | Existing Docker/Postgres/RabbitMQ/game services | Accept direct unreviewed bot mutations |

## TypeScript Standards

1. `strict` mode must remain enabled.
2. `noUncheckedIndexedAccess` must remain enabled.
3. `exactOptionalPropertyTypes` must remain enabled.
4. Public functions must use explicit types.
5. Use discriminated unions for command/action models.
6. Avoid `any`; require documented exception if used.
7. Validate runtime input at trust boundaries.
8. Keep transport DTOs separate from internal domain models.

## Secure Coding Standards

### Input Validation

All input from Discord, HTTP requests, environment variables, files, and database queries must be validated before use.

Required patterns:

- Validate command names against allowlists.
- Validate role IDs and channel IDs as strings, never as trusted authorization claims.
- Validate service names against known service allowlists.
- Validate SQL mode before execution.
- Validate file paths with safe relative path helpers.
- Validate numeric ranges for quantities, XP, coordinates, ports, and limits.

### Output Handling

1. Redact secrets before logging or sending responses.
2. Public Discord responses must not include internal IPs, SSH hosts, DB URLs, tokens, raw `.env` values, or stack traces.
3. Admin diagnostic output must require admin/owner capability.
4. Large responses must be paginated or summarized.
5. Errors must use safe messages.

### Command Execution

1. The bot must not use `child_process.exec`.
2. The bot must not spawn shell commands for admin actions.
3. Backend execution must use existing Console backend wrappers.
4. If process execution is required in backend code, use fixed command paths and argument arrays; avoid shell interpolation.

### Database Access

1. The bot must not connect directly to Postgres for write operations.
2. Read-only SQL must be validated as read-only.
3. Write SQL, if enabled, must be owner-only, typed-confirmed, audited, rate-limited, and backed up first where supported.
4. Do not concatenate user input into SQL statements.

### Secrets

1. Use file-based runtime secrets: `*_TOKEN_FILE`, `*_PASSWORD_FILE` where possible.
2. Do not commit `.env` files containing secrets.
3. Do not store Discord bot token in `addon.json`, static WebUI addon files, source files, tests, docs, logs, or container layers.
4. Do not echo secrets in Discord.
5. Do not log request bodies that may contain secrets.

## Branching and Pull Request Standards

### Branch Naming

Use descriptive branches:

```text
feature/discord-control-bot
feature/discord-api-adapter
security/discord-authz-gates
fix/discord-redaction-leak
```

### Pull Request Requirements

Every PR must include:

1. Purpose summary.
2. Risk classification.
3. Test evidence.
4. Security impact statement.
5. Rollback plan.
6. Screenshots/log snippets if user-facing behavior changes.
7. Updated docs if behavior or controls change.

Privileged feature PRs must also include:

1. Threat model update.
2. Authorization matrix update.
3. Confirmation matrix update.
4. Audit event mapping.
5. DAST test cases.

## Definition of Done

A feature is not done until all applicable items are complete:

```text
[ ] Code is typed and reviewed.
[ ] Unit tests pass.
[ ] Authorization tests pass.
[ ] Redaction tests pass.
[ ] Secret scan passes.
[ ] SCA gate passes.
[ ] SAST gate passes.
[ ] DCA gate passes if container files changed.
[ ] DAST test cases exist for runtime features.
[ ] Documentation is updated.
[ ] SOC 2 evidence mapping is updated where applicable.
[ ] Rollback path is documented.
```

## Testing Standards

### Required Test Layers

| Test Type | Required For |
| --- | --- |
| Unit tests | All modules |
| Authorization matrix tests | Every command and API route |
| Redaction tests | All logging and response formatting |
| Integration tests | API adapter and bot client interaction |
| DAST tests | Runtime API and destructive workflows |
| Container tests | Dockerfile and Compose changes |
| Regression tests | Every fixed security issue |

### Test Naming

Tests should describe policy intent:

```text
blocks moderator from backup restore
redacts postgres connection string in error output
rejects write SQL through read-only query route
requires owner confirmation for reset progression
blocks Docker socket mount in bot compose
```

## Logging Standards

Use structured logs. Required fields:

```json
{
  "service": "dune-discord-control-bot",
  "event": "command.received",
  "discordGuildId": "...",
  "discordChannelId": "...",
  "discordUserId": "...",
  "command": "/dune status",
  "result": "success|failed|blocked"
}
```

Forbidden in logs:

- Discord bot token.
- Dune bot API token.
- Admin password.
- Database password.
- Funcom token.
- Full database URL.
- Raw `.env` file content.
- Full request body for secret-bearing routes.

## Audit Standards

Every state-changing command must emit an audit event with:

1. Source: `discord`.
2. Discord actor context.
3. Command and normalized action.
4. Target object.
5. Risk level.
6. Confirmation status.
7. Authorization decision.
8. Result.
9. Error reason if blocked or failed.

## Release Standards

A release candidate requires:

1. Passing CI.
2. SBOM.
3. Image vulnerability scan.
4. Image signing.
5. Release notes.
6. Rollback instructions.
7. SOC 2 evidence index updated.
8. No open critical/high security findings unless exception is approved and time-bound.

## Exception Handling

Security exceptions must include:

1. Finding ID.
2. Affected component.
3. Risk rating.
4. Reason for exception.
5. Compensating controls.
6. Owner.
7. Expiration date.
8. Review cadence.

Permanent exceptions are not allowed for critical or high-risk findings.
