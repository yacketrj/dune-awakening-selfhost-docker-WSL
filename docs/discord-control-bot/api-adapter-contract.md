# Dune Console Discord API Adapter Contract

## Purpose

The Discord API Adapter is the server-side boundary between the Discord bot client and Dune Docker Console. It exists to provide Discord-native WebUI parity without allowing the bot to bypass backend authorization, confirmation, redaction, audit logging, or existing WebUI execution paths.

The Discord bot must not call broad WebUI routes directly for privileged actions. It must call adapter routes that understand Discord actor context and enforce capability policy server-side.

## Design Requirements

1. The bot authenticates with a dedicated Dune bot API token, not the WebUI admin password.
2. Every request includes Discord actor context.
3. Every route enforces server-side capability authorization.
4. Public-safe responses must not expose internal IPs, SSH hosts, DB URLs, tokens, raw `.env`, stack traces, or host paths.
5. Destructive routes require confirmation and audit events.
6. Write/admin routes are disabled unless Discord-originated writes are explicitly enabled.
7. The adapter reuses existing Dune Console backend functions rather than duplicating privileged logic inside the bot.

## Authentication

### Header

```http
Authorization: Bearer <dune-bot-api-token>
```

The token must be loaded by the bot from `DUNE_BOT_API_TOKEN_FILE` and validated server-side by the adapter.

### Rejected Patterns

- WebUI admin password as bot token.
- Discord bot token as Dune API token.
- Browser session cookie as bot auth.
- Query-string token.

## Required Actor Context

Every bot request must include a Discord actor context object.

```json
{
  "actor": {
    "guildId": "123456789",
    "channelId": "234567890",
    "userId": "345678901",
    "username": "admin-user",
    "roleIds": ["456789012"],
    "interactionId": "567890123",
    "commandName": "/dune status"
  }
}
```

## Role Tiers

| Tier | Intended Use |
| --- | --- |
| public | Basic non-sensitive status only. |
| observer | Low-risk status visibility. |
| moderator | Player and operational read-only visibility. |
| admin | Controlled write/admin operations. |
| owner | Destructive, credential-adjacent, database write, backup restore/delete, addon admin, map/sietch/deep desert mutation. |

## Capability Model

| Capability | Description | Minimum Tier |
| --- | --- | --- |
| `status:read` | Basic health/status visibility | public |
| `players:read` | Player list/search/profile | moderator |
| `logs:read` | Service logs and diagnostics | admin |
| `backups:read` | Backup list/latest/status | moderator |
| `backups:write` | Backup create | admin |
| `backups:destructive` | Backup restore/delete/delete-all | owner |
| `database:read` | DB status/schema/table/read-only SQL | admin |
| `database:write` | DB write SQL | owner |
| `broadcast:send` | Broadcast and shutdown broadcast | admin/owner |
| `players:admin` | Kick, teleport, grant, refill, moderate-risk player actions | admin |
| `players:destructive` | Clean inventory, reset progression, kick all | owner |
| `maps:read` | Map/sietch/deep desert read-only status | moderator |
| `maps:write` | Map/sietch/deep desert mutations | owner |
| `addons:read` | Addon list/info | moderator |
| `addons:admin` | Install/enable/disable/remove addon | owner |
| `settings:read` | Sanitized settings summary | admin |
| `settings:admin` | Password/token/settings mutation workflows | owner |

## Response Classification

| Class | Description | Allowed Fields |
| --- | --- | --- |
| public | Safe in public Discord channels. | High-level status, no internal topology. |
| admin | Safe only in admin channels or ephemeral admin responses. | Diagnostics, service names, summarized errors. |
| owner | Owner-only diagnostics or high-risk previews. | Sensitive operational metadata, never raw secrets. |

## Initial Adapter Routes

### `GET /api/integrations/discord/health`

Purpose: bot connectivity check.

Capability: `status:read`.

Response:

```json
{
  "ok": true,
  "service": "dune-console-discord-adapter",
  "writesEnabled": false
}
```

### `POST /api/integrations/discord/status`

Purpose: sanitized stack status for Discord.

Capability: `status:read`.

Request:

```json
{
  "actor": { "guildId": "...", "channelId": "...", "userId": "...", "username": "...", "roleIds": [] },
  "diagnostic": false
}
```

Public response must not include internal SSH host, Docker network IPs, DB URL, environment paths, or secrets.

### `POST /api/integrations/discord/players/search`

Purpose: player lookup.

Capability: `players:read`.

### `POST /api/integrations/discord/backups/list`

Purpose: backup visibility.

Capability: `backups:read`.

### `POST /api/integrations/discord/database/query`

Purpose: read-only SQL through Discord.

Capability: `database:read`.

Requirement: reject write SQL.

### `POST /api/integrations/discord/actions/preview`

Purpose: create a preview and confirmation challenge for state-changing commands.

Capability: depends on requested action.

### `POST /api/integrations/discord/actions/confirm`

Purpose: execute a previously previewed action if confirmation, idempotency, authorization, and write-enable policy all pass.

Capability: depends on requested action.

## Audit Event Requirements

Every adapter request should be auditable. Every state-changing request must be audited.

Required fields:

```json
{
  "source": "discord",
  "discordGuildId": "...",
  "discordChannelId": "...",
  "discordUserId": "...",
  "discordUsername": "...",
  "command": "/dune player give-item",
  "action": "players.give-item",
  "capability": "players:admin",
  "risk": "medium|high|critical",
  "targetType": "player|backup|database|service|addon|map|settings",
  "targetId": "...",
  "confirmationRequired": true,
  "confirmationPassed": true,
  "result": "success|failed|blocked"
}
```

## Confirmation Requirements

| Risk | Confirmation |
| --- | --- |
| low | None. |
| medium | Button confirmation with short expiry. |
| high | Typed confirmation phrase or exact target confirmation. |
| critical | Typed phrase, owner role, idempotency key, and optional multi-admin approval in future. |

## Error Contract

Errors must be redacted and safe to display.

```json
{
  "ok": false,
  "error": "Not authorized for backups:destructive.",
  "code": "not_authorized"
}
```

Forbidden in errors:

- Raw stack traces.
- Raw SQL errors containing secrets.
- Raw environment variables.
- Discord or Dune tokens.
- Internal DB URLs.
- Funcom token values.

## DAST Requirements

The adapter must have runtime tests for:

1. Missing token rejected.
2. Invalid token rejected.
3. Missing actor rejected.
4. Unauthorized role rejected.
5. Public status sanitizes internal topology.
6. Diagnostic status requires admin/owner.
7. Write action blocked when writes disabled.
8. Destructive action blocked without confirmation.
9. Read-only SQL blocks write statements.
10. Secret-like values redacted from errors and audit details.
