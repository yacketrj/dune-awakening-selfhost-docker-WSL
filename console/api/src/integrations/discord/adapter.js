import { audit } from "../../audit.js";
import { DISCORD_CAPABILITIES, normalizeDiscordActor, requireDiscordCapability } from "./policy.js";
import { discordAuditEvent, discordBlockedAuditEvent } from "./audit.js";
import { discordSafeError, sanitizeDiscordPublicStatus } from "./sanitize.js";

export const DISCORD_ADAPTER_ROUTES = Object.freeze({
  HEALTH: "/api/integrations/discord/health",
  STATUS: "/api/integrations/discord/status",
  READINESS: "/api/integrations/discord/readiness",
  SERVICES: "/api/integrations/discord/services",
  POPULATION: "/api/integrations/discord/population",
  LOGS: "/api/integrations/discord/logs",
  MAP_STATE: "/api/integrations/discord/map-state",
  BACKUPS_LIST: "/api/integrations/discord/backups/list"
});

export function discordAdapterEnabled(config) {
  return process.env.DUNE_DISCORD_ADAPTER_ENABLED === "true" || config?.discordAdapterEnabled === true;
}

export function discordWritesEnabled(_config) {
  // Experimental companion bot is intentionally read-only.
  return false;
}

export function discordRoleMappingFromEnv(env = process.env) {
  return {
    observerRoleIds: csv(env.DISCORD_OBSERVER_ROLE_IDS),
    moderatorRoleIds: csv(env.DISCORD_MODERATOR_ROLE_IDS),
    adminRoleIds: csv(env.DISCORD_ADMIN_ROLE_IDS),
    ownerRoleIds: csv(env.DISCORD_OWNER_ROLE_IDS)
  };
}

export async function discordAdapterHealth(config) {
  return {
    ok: true,
    service: "dune-console-discord-adapter",
    enabled: discordAdapterEnabled(config),
    experimental: true,
    readOnly: true,
    writesEnabled: false,
    routes: Object.values(DISCORD_ADAPTER_ROUTES)
  };
}

export async function discordAdapterStatus({ config, actorPayload, diagnostic = false, statusProvider }) {
  const actor = normalizeDiscordActor(actorPayload);
  const mapping = discordRoleMappingFromEnv();
  requireDiscordCapability(actor, mapping, DISCORD_CAPABILITIES.STATUS_READ);

  try {
    const rawStatus = typeof statusProvider === "function" ? await statusProvider({ diagnostic }) : {};
    if (diagnostic) {
      requireDiscordCapability(actor, mapping, DISCORD_CAPABILITIES.LOGS_READ);
    }
    const result = diagnostic ? rawStatus : sanitizeDiscordPublicStatus(rawStatus);
    audit(config, null, "discord.status", discordAuditEvent({
      actor,
      action: "discord.status",
      capability: diagnostic ? DISCORD_CAPABILITIES.LOGS_READ : DISCORD_CAPABILITIES.STATUS_READ,
      risk: diagnostic ? "medium" : "low",
      targetType: "server",
      result: "success"
    }));
    return { ok: true, result };
  } catch (error) {
    audit(config, null, "discord.status", discordBlockedAuditEvent({
      actor,
      action: "discord.status",
      capability: diagnostic ? DISCORD_CAPABILITIES.LOGS_READ : DISCORD_CAPABILITIES.STATUS_READ,
      reason: error.message || "status failed"
    }));
    throw error;
  }
}

export function discordAdapterErrorResponse(error) {
  const statusCode = Number(error?.statusCode || 500);
  return {
    statusCode: Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500,
    body: discordSafeError(error)
  };
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
