# Dune Discord Companion Bot

Experimental read-only Discord companion for Dune Docker Console.

## Current Status

This workspace now includes a dependency-free read-only command layer that calls the protected Console Discord adapter routes. The network Discord client is still deferred until the adapter contract is stable.

Live command behavior can be exercised with `scripts/command-smoke.mjs` before connecting to Discord.

## Implemented Command Surface

| Discord command | Console route | Minimum role | Visibility | Writes |
|---|---|---:|---|---:|
| `/dune health` | `GET /api/integrations/discord/health` | Public | Public or ephemeral by caller | No |
| `/dune status` | `POST /api/integrations/discord/status` | Public | Public | No |
| `/dune status detail` | `POST /api/integrations/discord/status` with diagnostic mode | Admin | Ephemeral | No |
| `/dune readiness` | `POST /api/integrations/discord/readiness` | Observer | Ephemeral-safe | No |
| `/dune services` | `POST /api/integrations/discord/services` | Observer | Ephemeral-safe | No |

## Role Model

| Tier | Capabilities |
|---|---|
| Public | `status:read` |
| Observer | `status:read`, `readiness:read`, `services:read` |
| Moderator | Observer capabilities plus `population:read`, `maps:read`, `backups:read` |
| Admin | Moderator capabilities plus `logs:read` |
| Owner | Same read-only capability set as Admin |

The bot-side authorization model intentionally contains no write, destructive, broadcast, database-write, player-admin, map-write, addon-admin, or settings-admin capabilities.

## Design Constraints

1. The bot is a Discord client, not the authority.
2. Dune Docker Console remains responsible for final authorization, safety checks, redaction, audit logging, and execution.
3. The bot must call a protected Console API.
4. The bot must not mount `/var/run/docker.sock`.
5. The bot must not write directly to Postgres.
6. The bot must not directly access Postgres for destructive actions.
7. The bot must not store secrets in addon files, static files, source control, logs, or container layers.
8. The bot must not execute destructive actions.
9. Discord write/admin actions remain disabled and out of scope for the experimental release.

## Required Runtime Secrets

Use file-based secrets rather than raw token environment variables.

```env
DISCORD_BOT_TOKEN_FILE=/run/secrets/discord-bot-token.txt
DUNE_BOT_API_TOKEN_FILE=/run/secrets/dune-bot-api-token.txt
DUNE_CONSOLE_API_URL=http://127.0.0.1:8088
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_OWNER_ROLE_IDS=
DISCORD_ADMIN_ROLE_IDS=
DISCORD_MODERATOR_ROLE_IDS=
DISCORD_OBSERVER_ROLE_IDS=
DISCORD_PUBLIC_STATUS_CHANNEL_ID=
DISCORD_ADMIN_ALERT_CHANNEL_ID=
DUNE_DISCORD_WRITES_ENABLED=false
```

`DUNE_DISCORD_WRITES_ENABLED` is ignored by the bot and remains forced off in code.

## Clean Local Setup Path

From `console/api`, start the Console with the adapter wrapper:

```bash
DUNE_DOCKER_DIR="$HOME/dune-awakening-selfhost-docker-WSL" \
DUNE_BOT_API_TOKEN_FILE="$HOME/.config/dune-console/dune-bot-api-token.txt" \
npm run start:discord-adapter
```

The wrapper enables the adapter and applies the small server hook automatically. You do not need to hand-edit `src/server.js`.

## Local Bot Route Smoke Tests

From `discord-bot`:

```bash
export DUNE_CONSOLE_API_URL=http://127.0.0.1:8088
export DUNE_BOT_API_TOKEN_FILE="$HOME/.config/dune-console/dune-bot-api-token.txt"
export DISCORD_GUILD_ID=local-guild
export DISCORD_OBSERVER_ROLE_IDS=role-observer
export DISCORD_ADMIN_ROLE_IDS=role-admin
export DISCORD_OWNER_ROLE_IDS=role-owner

npm run smoke:health
npm run smoke:status
npm run smoke:readiness
npm run smoke:services
npm run smoke:status-detail
```

Expected behavior:

- `smoke:status` returns a public redacted status summary.
- `smoke:status-detail` returns a more detailed redacted diagnostic payload and requires the admin role.
- `smoke:readiness` and `smoke:services` require the observer role.
- No smoke command performs a write action.

## Local Checks

```bash
cd discord-bot
npm ci --ignore-scripts
npm test
npm run security:secrets
npm run build
```

## Security Gates

See:

- `docs/discord-control-bot/security-gates.md`
- `docs/discord-control-bot/api-adapter-contract.md`
- `.github/workflows/discord-bot-security-gates.yml`
