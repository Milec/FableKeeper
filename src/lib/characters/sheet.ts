import type { AbilityScores, Character, CharacterDefenses } from "@/types/database";

/**
 * PF2E character-sheet derivation.
 *
 * Pathbuilder imports bring far more than the sheet used to show — proficiency
 * ranks, lores, equipment, spellcasting, languages — all sitting unused in the
 * character's `data` jsonb. This module turns that into the numbers a sheet
 * needs, following PF2E's maths:
 *
 *   modifier = level + proficiency rank + ability modifier (+ item bonus)
 *
 * where rank is 0 untrained / 2 trained / 4 expert / 6 master / 8 legendary.
 * Pure so it can be unit tested against known-good characters.
 */

export const PROFICIENCY_RANKS = [0, 2, 4, 6, 8] as const;
export type ProficiencyRank = 0 | 2 | 4 | 6 | 8;

export const RANK_LABELS: Record<ProficiencyRank, string> = {
  0: "Untrained",
  2: "Trained",
  4: "Expert",
  6: "Master",
  8: "Legendary",
};

export type AbilityKey = keyof AbilityScores;

/** The 16 PF2E skills and their key ability. */
export const SKILLS: { key: string; label: string; ability: AbilityKey }[] = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "crafting", label: "Crafting", ability: "int" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "diplomacy", label: "Diplomacy", ability: "cha" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "wis" },
  { key: "occultism", label: "Occultism", ability: "int" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "religion", label: "Religion", ability: "wis" },
  { key: "society", label: "Society", ability: "int" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
  { key: "thievery", label: "Thievery", ability: "dex" },
];

export const SAVES: { key: string; label: string; ability: AbilityKey }[] = [
  { key: "fortitude", label: "Fortitude", ability: "con" },
  { key: "reflex", label: "Reflex", ability: "dex" },
  { key: "will", label: "Will", ability: "wis" },
];

/** Ability modifier from a PF2E ability score. */
export function abilityModifier(score: number | undefined): number {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}

/** Format a modifier for display, e.g. 3 → "+3". */
export function formatModifier(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Shape of the extra data a Pathbuilder import (or manual edit) leaves behind. */
export interface CharacterData {
  notes?: string;
  keyAbility?: string;
  deity?: string;
  alignment?: string;
  languages?: unknown;
  feats?: unknown;
  lores?: unknown;
  proficiencies?: Record<string, unknown>;
  equipment?: unknown;
  spellCasters?: unknown;
  /** Coins, when tracked: {pp, gp, sp, cp}. */
  coins?: Record<string, unknown>;
  conditions?: unknown;
  /** XP toward the next level (0–1000). */
  xp?: unknown;
  /** Hero points, 0–3. */
  heroPoints?: unknown;
}

export function characterData(character: Pick<Character, "data">): CharacterData {
  return (character.data as CharacterData | null) ?? {};
}

function rankOf(proficiencies: Record<string, unknown> | undefined, key: string): ProficiencyRank {
  const raw = proficiencies?.[key];
  const n = typeof raw === "number" ? raw : 0;
  // Pathbuilder stores 0/2/4/6/8 directly; clamp anything unexpected.
  return (PROFICIENCY_RANKS.includes(n as ProficiencyRank) ? n : 0) as ProficiencyRank;
}

export interface DerivedStat {
  key: string;
  label: string;
  ability: AbilityKey;
  rank: ProficiencyRank;
  modifier: number;
}

/** Compute skill modifiers for a character. */
export function deriveSkills(
  level: number,
  abilities: AbilityScores,
  data: CharacterData,
): DerivedStat[] {
  const profs = data.proficiencies;
  return SKILLS.map(({ key, label, ability }) => {
    const rank = rankOf(profs, key);
    // Untrained skills get no level bonus in PF2E.
    const modifier =
      abilityModifier(abilities[ability]) + (rank > 0 ? level + rank : 0);
    return { key, label, ability, rank, modifier };
  });
}

/** Compute saving-throw modifiers. */
export function deriveSaves(
  level: number,
  abilities: AbilityScores,
  data: CharacterData,
): DerivedStat[] {
  const profs = data.proficiencies;
  return SAVES.map(({ key, label, ability }) => {
    const rank = rankOf(profs, key);
    return {
      key,
      label,
      ability,
      rank,
      modifier: abilityModifier(abilities[ability]) + level + rank,
    };
  });
}

/** Perception, using the Wisdom modifier and the perception proficiency. */
export function derivePerception(
  level: number,
  abilities: AbilityScores,
  data: CharacterData,
): DerivedStat {
  const rank = rankOf(data.proficiencies, "perception");
  return {
    key: "perception",
    label: "Perception",
    ability: "wis",
    rank,
    modifier: abilityModifier(abilities.wis) + level + rank,
  };
}

/** Class DC, using the class proficiency and the character's key ability. */
export function deriveClassDc(
  level: number,
  abilities: AbilityScores,
  data: CharacterData,
): number | null {
  const rank = rankOf(data.proficiencies, "classDC");
  const key = (data.keyAbility ?? "").toLowerCase() as AbilityKey;
  const abilityMod = key in abilities ? abilityModifier(abilities[key]) : 0;
  if (rank === 0 && !data.keyAbility) return null;
  return 10 + level + rank + abilityMod;
}

/** Lore skills, which Pathbuilder stores as [name, rank] tuples. */
export function deriveLores(
  level: number,
  abilities: AbilityScores,
  data: CharacterData,
): DerivedStat[] {
  const raw = Array.isArray(data.lores) ? data.lores : [];
  const out: DerivedStat[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0] : null;
    const rankRaw = typeof entry[1] === "number" ? entry[1] : 0;
    if (!name) continue;
    const rank = (PROFICIENCY_RANKS.includes(rankRaw as ProficiencyRank)
      ? rankRaw
      : 0) as ProficiencyRank;
    out.push({
      key: `lore-${name.toLowerCase()}`,
      label: `${name} Lore`,
      ability: "int",
      rank,
      modifier: abilityModifier(abilities.int) + (rank > 0 ? level + rank : 0),
    });
  }
  return out;
}

/** Normalise the equipment list, which Pathbuilder stores as [name, qty] tuples. */
export function deriveEquipment(data: CharacterData): { name: string; quantity: number }[] {
  const raw = Array.isArray(data.equipment) ? data.equipment : [];
  const out: { name: string; quantity: number }[] = [];
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const name = typeof entry[0] === "string" ? entry[0] : null;
      const qty = typeof entry[1] === "number" ? entry[1] : 1;
      if (name) out.push({ name, quantity: qty });
    } else if (typeof entry === "string") {
      out.push({ name: entry, quantity: 1 });
    }
  }
  return out;
}

export interface SpellcastingSummary {
  name: string;
  tradition?: string;
  ability?: string;
  /** Spell names grouped by rank, when available. */
  spellsByRank: { rank: string; spells: string[] }[];
}

/** Summarise Pathbuilder's spellCasters payload into something displayable. */
export function deriveSpellcasting(data: CharacterData): SpellcastingSummary[] {
  const raw = Array.isArray(data.spellCasters) ? data.spellCasters : [];
  const out: SpellcastingSummary[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name : "Spellcasting";
    const spellsByRank: SpellcastingSummary["spellsByRank"] = [];
    const groups = Array.isArray(c.spells) ? c.spells : [];
    for (const g of groups) {
      if (!g || typeof g !== "object") continue;
      const grp = g as Record<string, unknown>;
      const rank =
        typeof grp.spellLevel === "number"
          ? grp.spellLevel === 0
            ? "Cantrips"
            : `Rank ${grp.spellLevel}`
          : "Spells";
      const list = Array.isArray(grp.list)
        ? grp.list.filter((s): s is string => typeof s === "string")
        : [];
      if (list.length) spellsByRank.push({ rank, spells: list });
    }
    out.push({
      name,
      tradition: typeof c.magicTradition === "string" ? c.magicTradition : undefined,
      ability: typeof c.ability === "string" ? c.ability : undefined,
      spellsByRank,
    });
  }
  return out;
}

/** Feats, as a flat list of names. */
export function deriveFeats(data: CharacterData): string[] {
  const raw = Array.isArray(data.feats) ? data.feats : [];
  return raw
    .map((f) => (Array.isArray(f) ? f[0] : f))
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0);
}

/** Languages, as a flat list. */
export function deriveLanguages(data: CharacterData): string[] {
  const raw = Array.isArray(data.languages) ? data.languages : [];
  return raw.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
}

/** Coin purse, defaulting missing denominations to zero. */
export function deriveCoins(data: CharacterData): { pp: number; gp: number; sp: number; cp: number } {
  const c = data.coins ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { pp: num(c.pp), gp: num(c.gp), sp: num(c.sp), cp: num(c.cp) };
}

/** Active conditions, as a flat list. */
export function deriveConditions(data: CharacterData): string[] {
  const raw = Array.isArray(data.conditions) ? data.conditions : [];
  return raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** PF2E awards a level every 1,000 XP. */
export const XP_PER_LEVEL = 1000;

export interface Progression {
  /** XP earned toward the current level (0 … 999). */
  xp: number;
  xpPerLevel: number;
  /** Percentage toward the next level, 0–100. */
  percent: number;
}

export function deriveProgression(data: CharacterData): Progression {
  const raw = typeof data.xp === "number" && Number.isFinite(data.xp) ? data.xp : 0;
  const xp = Math.max(0, Math.min(XP_PER_LEVEL, Math.round(raw)));
  return {
    xp,
    xpPerLevel: XP_PER_LEVEL,
    percent: Math.round((xp / XP_PER_LEVEL) * 100),
  };
}

/** Hero points, capped at the usual 3. */
export function deriveHeroPoints(data: CharacterData): number {
  const raw = typeof data.heroPoints === "number" ? data.heroPoints : 0;
  return Math.max(0, Math.min(3, Math.round(raw)));
}

/** Every proficiency key the rank editor manages. */
export const PROFICIENCY_KEYS = [
  "perception",
  "fortitude",
  "reflex",
  "will",
  "classDC",
  ...SKILLS.map((s) => s.key),
] as const;

/** Read the stored proficiency map, clamped to valid ranks. */
export function deriveProficiencies(
  data: CharacterData,
): Record<string, ProficiencyRank> {
  const out: Record<string, ProficiencyRank> = {};
  for (const key of PROFICIENCY_KEYS) {
    out[key] = rankOf(data.proficiencies, key);
  }
  return out;
}

/** Lores as editable [name, rank] pairs (before modifiers are computed). */
export function deriveLorePairs(
  data: CharacterData,
): { name: string; rank: ProficiencyRank }[] {
  const raw = Array.isArray(data.lores) ? data.lores : [];
  const out: { name: string; rank: ProficiencyRank }[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0] : null;
    if (!name) continue;
    const r = typeof entry[1] === "number" ? entry[1] : 0;
    out.push({
      name,
      rank: (PROFICIENCY_RANKS.includes(r as ProficiencyRank) ? r : 0) as ProficiencyRank,
    });
  }
  return out;
}

export interface DerivedSheet {
  level: number;
  abilities: AbilityScores;
  defenses: CharacterDefenses;
  perception: DerivedStat;
  classDc: number | null;
  saves: DerivedStat[];
  skills: DerivedStat[];
  lores: DerivedStat[];
  feats: string[];
  languages: string[];
  equipment: { name: string; quantity: number }[];
  spellcasting: SpellcastingSummary[];
  coins: { pp: number; gp: number; sp: number; cp: number };
  conditions: string[];
  notes: string;
  deity: string | null;
  alignment: string | null;
  progression: Progression;
  heroPoints: number;
}

/** Everything a character sheet needs, derived in one pass. */
export function deriveSheet(character: Character): DerivedSheet {
  const level = character.level ?? 1;
  const abilities = (character.abilities as AbilityScores | null) ?? {};
  const defenses = (character.defenses as CharacterDefenses | null) ?? {};
  const data = characterData(character);

  return {
    level,
    abilities,
    defenses,
    perception: derivePerception(level, abilities, data),
    classDc: deriveClassDc(level, abilities, data),
    saves: deriveSaves(level, abilities, data),
    skills: deriveSkills(level, abilities, data),
    lores: deriveLores(level, abilities, data),
    feats: deriveFeats(data),
    languages: deriveLanguages(data),
    equipment: deriveEquipment(data),
    spellcasting: deriveSpellcasting(data),
    coins: deriveCoins(data),
    conditions: deriveConditions(data),
    notes: typeof data.notes === "string" ? data.notes : "",
    deity: typeof data.deity === "string" && data.deity.trim() ? data.deity : null,
    alignment:
      typeof data.alignment === "string" && data.alignment.trim() ? data.alignment : null,
    progression: deriveProgression(data),
    heroPoints: deriveHeroPoints(data),
  };
}
