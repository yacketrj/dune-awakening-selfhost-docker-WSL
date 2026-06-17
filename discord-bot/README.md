# Dune Discord Companion Bot

Experimental read-only Discord companion for Dune Docker Console.

## Current Status

This workspace is intentionally in P0 security-foundation mode. It does not connect to Discord yet and does not execute WebUI actions yet.

The first implementation target is a read-only companion bot for:

- Server status.
- Readiness.
- Services.
- Population.
- Logs.
- Map state.
- Backup list/latest metadata.

The bot is not a full WebUI replacement in the experimental phase.

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

## Next Implementation Step

Wire the protected Console API adapter behind an explicit disabled-by-default flag, then expose only read-only endpoints for health/status/readiness/services/population/logs/map-state/backups.
