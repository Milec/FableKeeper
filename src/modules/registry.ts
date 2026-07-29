import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Dices,
  Map as MapIcon,
  ScrollText,
  Sparkles,
  Store,
  Swords,
  Users,
  Wand2,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

/**
 * Module registry.
 *
 * The request calls for a modular architecture where "every major feature is
 * implemented as its own module so future tools can be added without
 * significant refactoring". This registry is the seam that makes that true:
 * navigation, dashboards, search scopes, and command palette entries are all
 * derived from it. Adding a new module is a matter of appending an entry here
 * and dropping a route under `src/app/(app)/<campaign>/<module>`.
 */
export interface ModuleDefinition {
  /** Stable identifier, also used as the URL segment. */
  id: string;
  /** Human-readable name shown in navigation. */
  name: string;
  /** One-line description for dashboards and tooltips. */
  description: string;
  icon: LucideIcon;
  /** Development phase this module is introduced in (see README roadmap). */
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  /** Whether the module is available yet or shown as "coming soon". */
  status: "available" | "planned";
  /**
   * "global" modules are standalone tools at `/tools/<id>`; "campaign" modules
   * live inside a campaign and are reached at `/campaigns/<id><campaignPath>`.
   */
  scope: "global" | "campaign";
  /** Path suffix under a campaign for `scope: "campaign"` modules. */
  campaignPath?: string;
  /** Permission required to see/use the module, if any. */
  requiredPermission?: Permission;
}

export const MODULES: readonly ModuleDefinition[] = [
  // --- Campaign modules (live inside a campaign) --------------------------
  {
    id: "world",
    name: "World Builder",
    description:
      "Worlds, regions, nations, NPCs, and lore with backlinks and version history.",
    icon: BookOpen,
    phase: 2,
    status: "available",
    scope: "campaign",
    campaignPath: "",
    requiredPermission: "world:view",
  },
  {
    id: "characters",
    name: "Characters",
    description: "PF2E character sheets with Pathbuilder import and export.",
    icon: Users,
    phase: 3,
    status: "available",
    scope: "campaign",
    campaignPath: "/characters",
    requiredPermission: "character:view_own",
  },
  {
    id: "campaign",
    name: "Campaign Manager",
    description:
      "Sessions, quests, journals, timelines, and player handouts in one place.",
    icon: ScrollText,
    phase: 3,
    status: "available",
    scope: "campaign",
    campaignPath: "/sessions",
    requiredPermission: "session:view",
  },
  {
    id: "encounters",
    name: "Encounter Builder",
    description: "Build balanced PF2E encounters with XP budgeting and hazards.",
    icon: Swords,
    phase: 5,
    status: "available",
    scope: "campaign",
    campaignPath: "/encounters",
    requiredPermission: "tool:use",
  },
  {
    id: "tables",
    name: "Rollable Tables",
    description: "Foundry-style weighted tables with import/export.",
    icon: Dices,
    phase: 5,
    status: "available",
    scope: "campaign",
    campaignPath: "/tables",
    requiredPermission: "tool:use",
  },
  {
    id: "maps",
    name: "Interactive Maps",
    description:
      "Zoomable player maps with fog of war and GM-controlled reveals.",
    icon: MapIcon,
    phase: 6,
    status: "planned",
    scope: "campaign",
    campaignPath: "/maps",
    requiredPermission: "map:view",
  },
  // --- Global tools (work without a campaign) -----------------------------
  {
    id: "dice",
    name: "Dice Roller",
    description: "A complete dice engine with animated rolls and history.",
    icon: Dices,
    phase: 5,
    status: "available",
    scope: "global",
    requiredPermission: "tool:use",
  },
  {
    id: "generators",
    name: "Generators",
    description: "NPCs, shops, names, and backstories generated to PF2E rules.",
    icon: Wand2,
    phase: 4,
    status: "available",
    scope: "global",
    requiredPermission: "tool:use",
  },
  {
    id: "shops",
    name: "Shop Generator",
    description: "Settlement-appropriate shops, inventory, and shopkeepers.",
    icon: Store,
    phase: 4,
    status: "available",
    scope: "global",
    requiredPermission: "tool:use",
  },
  {
    id: "ai",
    name: "AI Assist",
    description: "AI-assisted generation of lore, NPCs, and adventures.",
    icon: Sparkles,
    phase: 6,
    status: "planned",
    scope: "global",
    requiredPermission: "tool:use",
  },
] as const;

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}

export function availableModules(): ModuleDefinition[] {
  return MODULES.filter((m) => m.status === "available");
}
