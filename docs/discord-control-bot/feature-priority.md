# Dune Discord Companion Bot - Feature Priority Plan

## Product Goal

Build an experimental Discord companion bot for Dune Docker Console that starts read-only and provides safe operational visibility for server operators.

The initial bot is **not** a full WebUI replacement. It is a companion interface for status, readiness, services, population, logs, map state, and backup visibility. Dune Docker Console remains the authority for backend authorization, safety checks, redaction, audit logging, and execution.

The bot must not mount the Docker socket, write directly to Postgres, store secrets in addon/static files, or execute destructive actions.

## Initial Scope

| Domain | Initial Commands / Functions | Risk |
| --- | --- | --- |
| Status | `/dune status`, `/dune health`, `/dune version` | Low |
| Readiness | `/dune readiness` | Low |
| Services | `/dune services`, `/dune service status` | Low/Medium |
| Population | `/dune population`, `/dune players online` | Medium due player visibility |
| Logs | `/dune logs service:<service>` with capped, redacted output | Medium due sensitive output risk |
| Map State | `/dune map status`, `/dune sietches status`, `/dune deepdesert status` | Low/Medium |
| Backups | `/dune backups list`, `/dune backups latest` | Medium due operational metadata |

## Out of Scope for the Experimental Bot

The following are explicitly out of scope until the read-only bot is stable, reviewed, and separately approved:

1. Docker socket mounting.
2. Direct Postgres writes.
3. Direct Postgres access from the bot process.
4. Backup create, restore, delete, or delete-all.
5. Player grants, teleport, kick, refill, reset progression, or inventory mutation.
6. Database write SQL.
7. Broadcasts and shutdown broadcasts.
8. Map, sietch, or deep desert mutation.
9. Addon install, enable, disable, or remove.
10. Credential, token, password, or secret-setting workflows.
11. Any destructive action.

## Priority Model

| Priority | Meaning |
| --- | --- |
| P0 | Foundational security, coding standards, SOC 2 readiness evidence, and protected Console API contract. |
| P1 | Experimental read-only companion bot: status, readiness, services, population, logs, map state, backups. |
| P2 | Operational hardening: pagination, redaction tuning, rate limits, audit review, role mapping UI, alerting. |
| P3 | Separately approved non-destructive admin conveniences, if any, after a security review. |
| P4 | Future platform evolution. Full WebUI parity remains a long-term option, not the current delivery target. |

## P0 - Security Foundation and Delivery Gates

These must be implemented before connecting the bot to Discord or exposing adapter routes.

1. Dedicated branch and isolated bot workspace.
2. Security gates for SCA, SAST, DCA, DAST, secret scanning, and container hardening checks.
3. Secure configuration contract for Discord bot token and Dune bot API token.
4. Redaction library for tokens, passwords, connection strings, host paths, and sensitive headers.
5. Discord actor context model: guild ID, channel ID, user ID, username, roles, command, interaction ID.
6. Role-to-capability authorization model.
7. Read-only capability enforcement for experimental routes.
8. Audit event schema for all Discord-originated requests.
9. Rate-limit and idempotency design for slash commands.
10. Architecture documentation that prohibits Docker socket access and direct database writes from the bot.

## P1 - Experimental Read-Only Bot

The first working bot release should expose only read-only commands.

| Domain | Commands / Functions | Required Control |
| --- | --- | --- |
| Health | `/dune status`, `/dune health`, `/dune version` | Public-safe sanitized output |
| Readiness | `/dune readiness` | Public/admin response split |
| Services | `/dune services`, `/dune service status` | Service allowlist, no raw Docker access |
| Population | `/dune population`, `/dune players online` | Role-gated if player details are shown |
| Logs | `/dune logs service:<service>` | Admin/moderator only, capped lines, redacted output |
| Map State | `/dune map status`, `/dune sietches status`, `/dune deepdesert status` | Read-only only |
| Backups | `/dune backups list`, `/dune backups latest` | Read-only metadata only, no restore/delete |

## P2 - Operational Hardening

1. Public/admin channel classification.
2. Response pagination and message-size enforcement.
3. Per-command rate limits.
4. Audit review command or export.
5. Bot heartbeat and health dashboard.
6. Role/channel mapping management in WebUI.
7. Alerting for status changes, backup failures, and readiness degradation.
8. Emergency disable flag for all Discord-originated calls.

## P3 - Separately Approved Non-Destructive Enhancements

These require explicit approval and updated threat modeling:

1. Scheduled status posts.
2. Backup-create request that only queues an existing safe backend workflow.
3. Maintenance notice posts to Discord only, not in-game broadcast.
4. Owner-only diagnostic bundles with strict redaction.

## Non-Negotiable Security Requirements

1. The bot container must not mount `/var/run/docker.sock`.
2. The bot must not execute destructive actions.
3. The bot must not directly write to Postgres.
4. The bot must not store secrets in addon files, browser-delivered files, source control, logs, or container layers.
5. Backend authorization must be enforced server-side, not only in the Discord client.
6. The Console API must remain responsible for final authorization and safety checks.
7. Public Discord responses must not expose internal IPs, SSH targets, tokens, database URLs, raw `.env`, stack traces, or host paths.
8. Logs must be capped, redacted, and role-gated.
