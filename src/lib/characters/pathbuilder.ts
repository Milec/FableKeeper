import type { AbilityScores, CharacterDefenses } from "@/types/database";

/**
 * Pathbuilder 2e import.
 *
 * Pathbuilder exports a character as JSON (via its "Export to JSON" / `json.php`
 * endpoint) shaped as `{ success: true, build: { … } }`. This module maps that
 * payload onto FableKeeper's character shape. It is intentionally tolerant —
 * Pathbuilder's format drifts over time and many fields are optional — and pure
 * so it can be unit tested against fixtures.
 */

export class PathbuilderParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathbuilderParseError";
  }
}

export interface ParsedCharacter {
  name: string;
  ancestry?: string;
  heritage?: string;
  background?: string;
  class?: string;
  level: number;
  keyAbility?: string;
  abilities: AbilityScores;
  defenses: CharacterDefenses;
  /** Extra PF2E detail kept in the character's `data` jsonb column. */
  data: Record<string, unknown>;
}

function abilityMod(score: number | undefined): number {
  if (typeof score !== "number") return 0;
  return Math.floor((score - 10) / 2);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Parse a Pathbuilder JSON string (or already-parsed object). */
export function parsePathbuilder(input: string | unknown): ParsedCharacter {
  let root: unknown = input;
  if (typeof input === "string") {
    try {
      root = JSON.parse(input);
    } catch {
      throw new PathbuilderParseError("That doesn't look like valid JSON.");
    }
  }

  if (!root || typeof root !== "object") {
    throw new PathbuilderParseError("Expected a Pathbuilder JSON object.");
  }

  // Accept either the wrapped `{ build: {…} }` or a bare build object.
  const record = root as Record<string, unknown>;
  const build = (record.build ?? record) as Record<string, unknown>;

  const name = asString(build.name);
  if (!name) {
    throw new PathbuilderParseError(
      "No character name found — is this a Pathbuilder export?",
    );
  }

  const level = asNumber(build.level) ?? 1;
  const rawAbilities = (build.abilities ?? {}) as Record<string, unknown>;
  const abilities: AbilityScores = {
    str: asNumber(rawAbilities.str),
    dex: asNumber(rawAbilities.dex),
    con: asNumber(rawAbilities.con),
    int: asNumber(rawAbilities.int),
    wis: asNumber(rawAbilities.wis),
    cha: asNumber(rawAbilities.cha),
  };

  const attrs = (build.attributes ?? {}) as Record<string, unknown>;
  const ancestryHp = asNumber(attrs.ancestryhp) ?? 0;
  const classHp = asNumber(attrs.classhp) ?? 0;
  const bonusHp = asNumber(attrs.bonushp) ?? 0;
  const bonusHpPerLevel = asNumber(attrs.bonushpPerLevel) ?? 0;
  const conMod = abilityMod(abilities.con);
  // PF2E max HP: ancestry HP + (class HP + Con mod + per-level bonus) × level.
  const hpMax =
    ancestryHp + bonusHp + (classHp + conMod + bonusHpPerLevel) * level;

  const speed =
    (asNumber(attrs.speed) ?? 0) + (asNumber(attrs.speedBonus) ?? 0);
  const acTotal = build.acTotal as Record<string, unknown> | undefined;
  const ac = asNumber(acTotal?.acTotal);

  const defenses: CharacterDefenses = {
    ...(ac !== undefined ? { ac } : {}),
    ...(hpMax > 0 ? { hp_max: hpMax, hp_current: hpMax } : {}),
    ...(speed > 0 ? { speed } : {}),
  };

  // Feats come as tuples like ["Feat Name", "", "Ancestry Feat", 1].
  const feats = Array.isArray(build.feats)
    ? build.feats
        .map((f) => (Array.isArray(f) ? asString(f[0]) : asString(f)))
        .filter((f): f is string => Boolean(f))
    : [];

  const data: Record<string, unknown> = {
    source: "pathbuilder",
    importedAt: new Date().toISOString(),
    keyAbility: asString(build.keyability),
    deity: asString(build.deity),
    alignment: asString(build.alignment),
    languages: Array.isArray(build.languages) ? build.languages : [],
    feats,
    lores: Array.isArray(build.lores) ? build.lores : [],
    proficiencies: (build.proficiencies as unknown) ?? {},
    equipment: Array.isArray(build.equipment) ? build.equipment : [],
    spellCasters: Array.isArray(build.spellCasters) ? build.spellCasters : [],
  };

  return {
    name,
    ancestry: asString(build.ancestry),
    heritage: asString(build.heritage),
    background: asString(build.background),
    class: asString(build.class),
    level,
    keyAbility: asString(build.keyability),
    abilities,
    defenses,
    data,
  };
}
