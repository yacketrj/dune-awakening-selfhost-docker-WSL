# Dune Discord Control Bot

Discord-native operator interface for Dune Docker Console.

## Current Status

This workspace is intentionally in P0 security-foundation mode. It does not connect to Discord yet and does not execute WebUI actions yet.

The first implementation priority is to establish security gates, config patterns, redaction, authorization modeling, and container hardening before privileged bot behavior is added.

## Design Constraints

1. The bot is a Discord client, not the authority.
2. Dune Docker Console remains the authority for backend authorization, confirmations, audit logging, and execution.
3. The bot must not mount `/var/run/docker.sock`.
4. The bot must not directly perform destructive database writes.
5. The bot must not store secrets in static addon files, source control, logs, or container layers.
6. Discord write/admin actions remain disabled by default.

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
- `.github/workflows/discord-bot-security-gates.yml`

## Next Implementation Step

Add the Dune Console Discord API adapter contract before wiring up Discord slash commands. Backend authorization must be server-side, not only in the bot process.
