# Dune Discord Control Bot - Feature Priority Plan

## Product Goal

Build a Discord-native operator interface that reaches functional parity with the official Dune Docker Console WebUI while preserving the WebUI safety model: authentication, authorization, confirmations, redaction, audit logging, backup-before-destructive-action behavior, and release-blocking security gates.

The Discord bot must be a client over a server-side Dune Console API adapter. It must not directly control Docker, Postgres, RabbitMQ, or host files except through narrowly scoped backend APIs.

## Priority Model

| Priority | Meaning |
| --- | --- |
| P0 | Foundational security and platform controls required before privileged bot work. |
| P1 | Read-only WebUI parity features and low-risk operational visibility. |
| P2 | Admin actions that change state but are reversible or low/moderate risk. |
| P3 | High-risk destructive, credential, database write, backup restore/delete, and service lifecycle actions. |
| P4 | Platform maturity, self-service install, first-class service addon support, and advanced governance. |

## P0 - Security Foundation and Delivery Gates

These must be implemented before connecting the bot to privileged WebUI actions.

1. Dedicated branch and isolated bot workspace.
2. Security gates for SCA, SAST, DCA, DAST, secret scanning, and container hardening checks.
3. Secure configuration contract for Discord bot token and Dune bot API token.
4. Redaction library for tokens, passwords, connection strings, and sensitive headers.
5. Discord actor context model: guild ID, channel ID, user ID, username, roles, command, interaction ID.
6. Role-to-capability authorization model.
7. Confirmation model for destructive commands.
8. Audit event schema for all Discord-originated actions.
9. Rate-limit and idempotency design for slash commands, buttons, and modals.
10. Architecture documentation that prohibits direct Docker socket and direct destructive DB access from the bot.

## P1 - Read-Only WebUI Parity

Initial bot functionality should be read-only unless a command is explicitly part of security validation.

| Domain | Commands / Functions |
| --- | --- |
| Health | `/dune status`, `/dune health`, `/dune version` |
| Server | `/dune server status`, `/dune server performance`, `/dune services` |
| Players | `/dune players list`, `/dune players online`, `/dune players search`, `/dune player profile` |
| Catalog | `/dune item search`, `/dune vehicle search`, `/dune skill-modules search` |
| Backups | `/dune backup list`, `/dune backup latest`, `/dune backup auto status` |
| Database | `/dune db status`, `/dune db schemas`, `/dune db tables`, `/dune db preview`, `/dune db query` for read-only SQL only |
| Maps | `/dune maps status`, `/dune sietches list`, `/dune deepdesert status` |
| Addons | `/dune addons community`, `/dune addons installed`, `/dune addon info` |
| Settings | `/dune settings show` sanitized summary only |

## P2 - Controlled Admin Actions

These commands change state and require Discord Admin or Owner authorization, confirmation, audit logging, and rate limiting.

| Domain | Commands / Functions | Minimum Role |
| --- | --- | --- |
| Broadcast | `/dune broadcast`, `/dune shutdown-broadcast` | Admin / Owner |
| Backups | `/dune backup create` | Admin |
| Players | `/dune player kick`, `/dune player teleport`, `/dune player refill-water` | Admin |
| Player grants | `/dune player give-item`, `/dune player give-items`, `/dune player add-xp`, `/dune player set-skill-points` | Admin |
| Maintenance | `/dune maintenance notice`, `/dune restart info` | Admin |

## P3 - High-Risk WebUI Parity

These must remain disabled until P0/P1/P2 are proven and reviewed.

| Domain | Commands / Functions | Required Control |
| --- | --- | --- |
| Database writes | `/dune db execute` | Owner-only, typed confirmation, backup first, audit |
| Backups | restore, delete, delete-all | Owner-only, typed confirmation, audit |
| Player destructive | clean inventory, reset progression, kick all | Owner-only, typed confirmation, audit |
| Maps/Sietches/Deep Desert | mutation workflows | Owner-only, typed confirmation, audit |
| Addons | install, enable, disable, remove | Owner-only, permission preview, audit |
| Settings/secrets | admin password, DB password, Funcom token | WebUI-first or ephemeral modal with strict redaction |

## P4 - Platform Maturity

1. WebUI management page for Discord role/channel mapping.
2. Bot health and last-heartbeat dashboard.
3. Per-command enable/disable toggles.
4. Emergency kill switch for all Discord-originated write actions.
5. Multi-admin approval for critical commands.
6. Signed releases, SBOM publication, and image provenance.
7. First-class service addon manifest support if upstream accepts service-type addons.

## Non-Negotiable Security Requirements

1. The bot container must not mount `/var/run/docker.sock`.
2. The bot must not directly execute shell commands for admin actions.
3. The bot must not directly perform destructive database writes.
4. Backend authorization must be enforced server-side, not only in the Discord client.
5. Every destructive command must require confirmation and audit logging.
6. No secrets may be stored in static addon files, browser-delivered files, source control, logs, or container layers.
7. Public Discord responses must not expose internal IPs, SSH targets, tokens, database URLs, or raw environment data.
