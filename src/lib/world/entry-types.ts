import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Boxes,
  Crown,
  FileText,
  Landmark,
  Languages,
  Mountain,
  Package,
  ScrollText,
  Skull,
  Sparkles,
  Swords,
  User,
  Users,
} from "lucide-react";
import type { WorldEntryType } from "@/types/database";

/**
 * Presentation metadata for every World Builder entry type. This is the single
 * source of truth the World Builder UI reads from — labels, icons, and the
 * category groupings used to organise the entry browser sidebar.
 */
export interface EntryTypeMeta {
  type: WorldEntryType;
  label: string;
  plural: string;
  category: EntryCategory;
  icon: LucideIcon;
}

export type EntryCategory =
  | "Geography"
  | "Organizations"
  | "Culture & History"
  | "Characters & Creatures"
  | "Things"
  | "Notes";

export const ENTRY_CATEGORIES: readonly EntryCategory[] = [
  "Geography",
  "Organizations",
  "Culture & History",
  "Characters & Creatures",
  "Things",
  "Notes",
] as const;

export const ENTRY_TYPES: Record<WorldEntryType, EntryTypeMeta> = {
  world: { type: "world", label: "World", plural: "Worlds", category: "Geography", icon: Mountain },
  continent: { type: "continent", label: "Continent", plural: "Continents", category: "Geography", icon: Mountain },
  region: { type: "region", label: "Region", plural: "Regions", category: "Geography", icon: Mountain },
  nation: { type: "nation", label: "Nation", plural: "Nations", category: "Geography", icon: Landmark },
  kingdom: { type: "kingdom", label: "Kingdom", plural: "Kingdoms", category: "Geography", icon: Crown },
  province: { type: "province", label: "Province", plural: "Provinces", category: "Geography", icon: Landmark },
  city: { type: "city", label: "City", plural: "Cities", category: "Geography", icon: Landmark },
  town: { type: "town", label: "Town", plural: "Towns", category: "Geography", icon: Landmark },
  village: { type: "village", label: "Village", plural: "Villages", category: "Geography", icon: Landmark },
  landmark: { type: "landmark", label: "Landmark", plural: "Landmarks", category: "Geography", icon: Mountain },
  dungeon: { type: "dungeon", label: "Dungeon", plural: "Dungeons", category: "Geography", icon: Skull },
  ruin: { type: "ruin", label: "Ruin", plural: "Ruins", category: "Geography", icon: Mountain },
  organization: { type: "organization", label: "Organization", plural: "Organizations", category: "Organizations", icon: Users },
  noble_house: { type: "noble_house", label: "Noble House", plural: "Noble Houses", category: "Organizations", icon: Crown },
  guild: { type: "guild", label: "Guild", plural: "Guilds", category: "Organizations", icon: Users },
  religion: { type: "religion", label: "Religion", plural: "Religions", category: "Organizations", icon: Sparkles },
  pantheon: { type: "pantheon", label: "Pantheon", plural: "Pantheons", category: "Organizations", icon: Sparkles },
  culture: { type: "culture", label: "Culture", plural: "Cultures", category: "Culture & History", icon: Boxes },
  language: { type: "language", label: "Language", plural: "Languages", category: "Culture & History", icon: Languages },
  historical_event: { type: "historical_event", label: "Historical Event", plural: "Historical Events", category: "Culture & History", icon: ScrollText },
  npc: { type: "npc", label: "NPC", plural: "NPCs", category: "Characters & Creatures", icon: User },
  monster: { type: "monster", label: "Monster", plural: "Monsters", category: "Characters & Creatures", icon: Swords },
  item: { type: "item", label: "Item", plural: "Items", category: "Things", icon: Package },
  book: { type: "book", label: "Book", plural: "Books", category: "Things", icon: BookMarked },
  note: { type: "note", label: "Note", plural: "Notes", category: "Notes", icon: FileText },
  article: { type: "article", label: "Article", plural: "Articles", category: "Notes", icon: FileText },
};

export const ALL_ENTRY_TYPES: readonly WorldEntryType[] = Object.keys(
  ENTRY_TYPES,
) as WorldEntryType[];

/** Entry types grouped by category, preserving category order. */
export function entryTypesByCategory(): Record<EntryCategory, EntryTypeMeta[]> {
  const grouped = Object.fromEntries(
    ENTRY_CATEGORIES.map((c) => [c, [] as EntryTypeMeta[]]),
  ) as Record<EntryCategory, EntryTypeMeta[]>;
  for (const meta of Object.values(ENTRY_TYPES)) {
    grouped[meta.category].push(meta);
  }
  return grouped;
}

export function entryTypeMeta(type: WorldEntryType): EntryTypeMeta {
  return ENTRY_TYPES[type];
}
