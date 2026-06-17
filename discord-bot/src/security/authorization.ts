export type DiscordRoleTier = "public" | "observer" | "moderator" | "admin" | "owner";

export type BotCapability =
  | "status:read"
  | "players:read"
  | "logs:read"
  | "backups:read"
  | "backups:write"
  | "database:read"
  | "database:write"
  | "broadcast:send"
  | "players:admin"
  | "players:destructive"
  | "maps:write"
  | "addons:admin"
  | "settings:admin";

export type DiscordActorContext = {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  roleIds: string[];
  interactionId?: string;
  commandName?: string;
};

export type RoleMapping = {
  observerRoleIds: string[];
  moderatorRoleIds: string[];
  adminRoleIds: string[];
  ownerRoleIds: string[];
};

const CAPABILITIES_BY_TIER: Record<DiscordRoleTier, ReadonlySet<BotCapability>> = {
  public: new Set(["status:read"]),
  observer: new Set(["status:read"]),
  moderator: new Set(["status:read", "players:read", "backups:read"]),
  admin: new Set([
    "status:read",
    "players:read",
    "logs:read",
    "backups:read",
    "backups:write",
    "database:read",
    "broadcast:send",
    "players:admin"
  ]),
  owner: new Set([
    "status:read",
    "players:read",
    "logs:read",
    "backups:read",
    "backups:write",
    "database:read",
    "database:write",
    "broadcast:send",
    "players:admin",
    "players:destructive",
    "maps:write",
    "addons:admin",
    "settings:admin"
  ])
};

export function actorTier(actor: DiscordActorContext, mapping: RoleMapping): DiscordRoleTier {
  const roles = new Set(actor.roleIds);
  if (mapping.ownerRoleIds.some((roleId) => roles.has(roleId))) return "owner";
  if (mapping.adminRoleIds.some((roleId) => roles.has(roleId))) return "admin";
  if (mapping.moderatorRoleIds.some((roleId) => roles.has(roleId))) return "moderator";
  if (mapping.observerRoleIds.some((roleId) => roles.has(roleId))) return "observer";
  return "public";
}

export function actorCan(actor: DiscordActorContext, mapping: RoleMapping, capability: BotCapability): boolean {
  return CAPABILITIES_BY_TIER[actorTier(actor, mapping)].has(capability);
}

export function requireCapability(actor: DiscordActorContext, mapping: RoleMapping, capability: BotCapability): void {
  if (!actorCan(actor, mapping, capability)) {
    const error = new Error(`Discord actor ${actor.userId} is not authorized for ${capability}.`);
    error.name = "AuthorizationError";
    throw error;
  }
}
