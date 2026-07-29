/**
 * Role & permission model for FableKeeper.
 *
 * Roles are assigned per-campaign (a user can be an Owner in one campaign and a
 * Player in another). This module is the single source of truth for what each
 * role may do; it is mirrored by the Row Level Security policies in
 * `supabase/migrations`. Keeping the matrix here (pure, dependency-free) lets
 * both the UI and server code make consistent authorization decisions and makes
 * the rules trivial to unit test.
 */

export const CAMPAIGN_ROLES = [
  "owner",
  "game_master",
  "assistant_gm",
  "player",
  "viewer",
] as const;

export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export const ROLE_LABELS: Record<CampaignRole, string> = {
  owner: "Owner",
  game_master: "Game Master",
  assistant_gm: "Assistant GM",
  player: "Player",
  viewer: "Viewer",
};

/**
 * Ordered from most to least privileged. Used for hierarchy checks such as
 * "can this user manage members with a lower rank than themselves".
 */
export const ROLE_RANK: Record<CampaignRole, number> = {
  owner: 100,
  game_master: 80,
  assistant_gm: 60,
  player: 40,
  viewer: 20,
};

/**
 * Every discrete capability the app authorizes. Grouped loosely by module so
 * new modules can add their own permissions without disturbing existing ones.
 */
export const PERMISSIONS = [
  // Campaign administration
  "campaign:manage", // rename, delete, settings
  "campaign:manage_members", // invite/remove/change roles
  // World Builder & wiki
  "world:view",
  "world:edit",
  "world:view_secrets", // GM-only hidden lore / secret notes
  // Maps
  "map:view",
  "map:edit",
  "map:reveal", // toggle fog of war / discoverable locations for players
  // Campaign management
  "session:view",
  "session:edit",
  "gm_notes:view", // private GM notes
  "quest:view",
  "quest:edit",
  // Characters
  "character:view_own",
  "character:view_all",
  "character:edit_own",
  // Tools (generators, encounters, tables)
  "tool:use",
  "table:edit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The capability matrix. Higher roles inherit nothing implicitly — each role
 * lists its full set explicitly so the rules are auditable at a glance.
 */
const ROLE_PERMISSIONS: Record<CampaignRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS), // Owners can do everything.
  game_master: new Set<Permission>([
    "campaign:manage",
    "campaign:manage_members",
    "world:view",
    "world:edit",
    "world:view_secrets",
    "map:view",
    "map:edit",
    "map:reveal",
    "session:view",
    "session:edit",
    "gm_notes:view",
    "quest:view",
    "quest:edit",
    "character:view_own",
    "character:view_all",
    "character:edit_own",
    "tool:use",
    "table:edit",
  ]),
  assistant_gm: new Set<Permission>([
    "world:view",
    "world:edit",
    "world:view_secrets",
    "map:view",
    "map:edit",
    "map:reveal",
    "session:view",
    "session:edit",
    "gm_notes:view",
    "quest:view",
    "quest:edit",
    "character:view_own",
    "character:view_all",
    "character:edit_own",
    "tool:use",
    "table:edit",
  ]),
  player: new Set<Permission>([
    "world:view",
    "map:view",
    "session:view",
    "quest:view",
    "character:view_own",
    "character:edit_own",
    "tool:use",
  ]),
  viewer: new Set<Permission>([
    "world:view",
    "map:view",
    "session:view",
    "quest:view",
  ]),
};

/** Does the given role hold the given permission? */
export function can(role: CampaignRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Is roleA strictly higher-ranked than roleB? */
export function outranks(roleA: CampaignRole, roleB: CampaignRole): boolean {
  return ROLE_RANK[roleA] > ROLE_RANK[roleB];
}

/** All permissions a role holds, as an array (useful for UI/debugging). */
export function permissionsFor(role: CampaignRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
