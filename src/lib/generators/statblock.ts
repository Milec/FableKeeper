import benchmarkData from "@/data/pf2e/benchmarks.json";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * NPC stat block generation.
 *
 * Numbers come from `src/data/pf2e/benchmarks.json` — per-level percentiles
 * measured from the 1,156 published creatures we ingest (see
 * scripts/fetch-pf2e-data.mjs). A creature role then decides which percentile
 * each statistic draws from, so a level-5 brute gets high HP and damage but a
 * soft AC, while a level-5 soldier is the other way round.
 *
 * Everything here is pure and seedable, so a given NPC always produces the same
 * stat block and the maths is unit-testable.
 */

export interface Tier {
  low: number;
  moderate: number;
  high: number;
  min: number;
  max: number;
}

interface LevelBenchmark {
  sampleSize: number;
  ac: Tier | null;
  hp: Tier | null;
  perception: Tier | null;
  fort: Tier | null;
  ref: Tier | null;
  will: Tier | null;
  attack: Tier | null;
  damageAvg: Tier | null;
  bestAbility: Tier | null;
}

const LEVELS = (benchmarkData as { levels: Record<string, LevelBenchmark> }).levels;

export const MIN_NPC_LEVEL = -1;
export const MAX_NPC_LEVEL = 24;

/** Nearest level with measured data (levels 21+ get sparse). */
export function benchmarkFor(level: number): LevelBenchmark | null {
  const clamped = Math.max(MIN_NPC_LEVEL, Math.min(MAX_NPC_LEVEL, Math.round(level)));
  for (let spread = 0; spread <= 6; spread++) {
    for (const candidate of [clamped - spread, clamped + spread]) {
      const b = LEVELS[String(candidate)];
      if (b?.ac) return b;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const NPC_ROLES = [
  "auto",
  "noncombatant",
  "expert",
  "skirmisher",
  "soldier",
  "brute",
  "sniper",
  "caster",
  "leader",
] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

export const ROLE_LABELS: Record<NpcRole, string> = {
  auto: "Auto (from occupation)",
  noncombatant: "Non-combatant",
  expert: "Skilled expert",
  skirmisher: "Skirmisher",
  soldier: "Soldier",
  brute: "Brute",
  sniper: "Sniper",
  caster: "Spellcaster",
  leader: "Leader",
};

type Level = "low" | "moderate" | "high";

interface RoleProfile {
  ac: Level;
  hp: Level;
  attack: Level;
  damage: Level;
  fort: Level;
  ref: Level;
  will: Level;
  perception: Level;
  /** Preferred key ability, used to shape the ability spread. */
  key: "str" | "dex" | "con" | "int" | "wis" | "cha";
  spellcaster?: boolean;
  ranged?: boolean;
  /** Extra descriptive line for the block. */
  note?: string;
  /**
   * Level band this role plausibly occupies when no level is specified.
   * PF2E creature level *is* the stat level, so an ordinary townsperson is
   * level -1/0 — statting a village fisher as a level-4 creature would give
   * them a warrior's AC and attack bonus.
   */
  levelRange: [number, number];
}

const PROFILES: Record<Exclude<NpcRole, "auto">, RoleProfile> = {
  noncombatant: { ac: "low", hp: "low", attack: "low", damage: "low", fort: "low", ref: "low", will: "moderate", perception: "moderate", key: "cha", levelRange: [-1, 0], note: "Avoids a fight; flees or surrenders if threatened." },
  expert: { ac: "low", hp: "low", attack: "low", damage: "low", fort: "low", ref: "moderate", will: "high", perception: "high", key: "int", levelRange: [0, 3], note: "Fights poorly, but knows things worth knowing." },
  skirmisher: { ac: "moderate", hp: "moderate", attack: "moderate", damage: "moderate", fort: "moderate", ref: "high", will: "low", perception: "high", key: "dex", levelRange: [1, 6], note: "Strikes and repositions rather than trading blows." },
  soldier: { ac: "high", hp: "moderate", attack: "high", damage: "moderate", fort: "high", ref: "moderate", will: "low", perception: "moderate", key: "str", levelRange: [1, 6], note: "Holds the line and protects allies." },
  brute: { ac: "low", hp: "high", attack: "moderate", damage: "high", fort: "high", ref: "low", will: "low", perception: "low", key: "str", levelRange: [1, 6], note: "Hits hard and soaks punishment; easy to outmanoeuvre." },
  sniper: { ac: "low", hp: "low", attack: "high", damage: "moderate", fort: "low", ref: "high", will: "moderate", perception: "high", key: "dex", ranged: true, levelRange: [1, 6], note: "Opens at range and keeps its distance." },
  caster: { ac: "low", hp: "low", attack: "low", damage: "low", fort: "low", ref: "moderate", will: "high", perception: "moderate", key: "cha", spellcaster: true, levelRange: [1, 7], note: "Relies on spells; vulnerable in melee." },
  leader: { ac: "moderate", hp: "moderate", attack: "moderate", damage: "moderate", fort: "moderate", ref: "moderate", will: "high", perception: "high", key: "cha", levelRange: [2, 8], note: "Commands others and fights alongside them." },
};

/** The level band a role plausibly occupies, for rolling an unspecified level. */
export function levelRangeForRole(role: Exclude<NpcRole, "auto">): [number, number] {
  return PROFILES[role].levelRange;
}

/** Occupations that imply a combat role, for `role: "auto"`. */
const OCCUPATION_ROLES: Record<string, Exclude<NpcRole, "auto">> = {
  guard: "soldier",
  soldier: "soldier",
  mercenary: "soldier",
  hunter: "sniper",
  thief: "skirmisher",
  smuggler: "skirmisher",
  sailor: "skirmisher",
  blacksmith: "brute",
  miner: "brute",
  tanner: "brute",
  priest: "caster",
  alchemist: "caster",
  herbalist: "caster",
  healer: "caster",
  bard: "caster",
  scholar: "expert",
  scribe: "expert",
  cartographer: "expert",
  noble: "leader",
  "tax collector": "leader",
  innkeeper: "noncombatant",
  farmer: "noncombatant",
  merchant: "noncombatant",
  fisher: "noncombatant",
  carpenter: "noncombatant",
  cook: "noncombatant",
  stablehand: "noncombatant",
  beggar: "noncombatant",
};

export function roleForOccupation(occupation: string): Exclude<NpcRole, "auto"> {
  return OCCUPATION_ROLES[occupation.toLowerCase()] ?? "expert";
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function pick(tier: Tier | null, level: Level, fallback: number): number {
  if (!tier) return fallback;
  return tier[level] ?? tier.moderate ?? fallback;
}

/**
 * Express a target average damage as dice notation, e.g. 14 → "3d8+1".
 * Uses larger dice for hard-hitting roles so the notation reads plausibly.
 */
export function damageDice(targetAverage: number, faces: number): string {
  const perDie = (faces + 1) / 2;
  const count = Math.max(1, Math.floor(targetAverage / perDie));
  const flat = Math.round(targetAverage - count * perDie);
  if (flat > 0) return `${count}d${faces}+${flat}`;
  if (flat < 0) return `${count}d${faces}${flat}`;
  return `${count}d${faces}`;
}

export interface StatBlockAttack {
  name: string;
  bonus: number;
  damage: string;
  damageType: string;
  traits: string[];
  ranged: boolean;
}

export interface StatBlock {
  level: number;
  role: Exclude<NpcRole, "auto">;
  roleLabel: string;
  perception: number;
  ac: number;
  hp: number;
  saves: { fort: number; ref: number; will: number };
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  speed: number;
  skills: { name: string; modifier: number }[];
  attacks: StatBlockAttack[];
  /** Present for spellcasting roles. */
  spellcasting?: { dc: number; attack: number; tradition: string };
  note?: string;
  /** How many published creatures informed this level's numbers. */
  sampleSize: number;
}

const MELEE_WEAPONS = [
  { name: "fist", type: "bludgeoning", traits: ["agile", "finesse", "nonlethal", "unarmed"], faces: 4 },
  { name: "club", type: "bludgeoning", traits: [], faces: 6 },
  { name: "dagger", type: "piercing", traits: ["agile", "finesse", "thrown 10 ft."], faces: 4 },
  { name: "shortsword", type: "piercing", traits: ["agile", "finesse", "versatile S"], faces: 6 },
  { name: "longsword", type: "slashing", traits: ["versatile P"], faces: 8 },
  { name: "battle axe", type: "slashing", traits: ["sweep"], faces: 8 },
  { name: "warhammer", type: "bludgeoning", traits: ["shove"], faces: 8 },
  { name: "spear", type: "piercing", traits: ["thrown 20 ft."], faces: 6 },
  { name: "greataxe", type: "slashing", traits: ["sweep"], faces: 12 },
  { name: "staff", type: "bludgeoning", traits: ["two-hand d8"], faces: 4 },
];

const RANGED_WEAPONS = [
  { name: "shortbow", type: "piercing", traits: ["deadly d10", "range 60 ft.", "reload 0"], faces: 6 },
  { name: "longbow", type: "piercing", traits: ["deadly d10", "range 100 ft.", "reload 0"], faces: 8 },
  { name: "crossbow", type: "piercing", traits: ["range 120 ft.", "reload 1"], faces: 8 },
  { name: "sling", type: "bludgeoning", traits: ["propulsive", "range 50 ft.", "reload 1"], faces: 6 },
];

const SKILLS_BY_KEY: Record<RoleProfile["key"], string[]> = {
  str: ["Athletics", "Intimidation"],
  dex: ["Acrobatics", "Stealth", "Thievery"],
  con: ["Athletics", "Survival"],
  int: ["Crafting", "Society", "Arcana", "Lore"],
  wis: ["Medicine", "Nature", "Religion", "Survival"],
  cha: ["Diplomacy", "Deception", "Performance", "Intimidation"],
};

const TRADITIONS = ["arcane", "divine", "occult", "primal"];

export interface StatBlockOptions {
  level: number;
  role?: NpcRole;
  occupation?: string;
  seed?: number | string;
}

/** Generate a level-appropriate PF2E NPC stat block. */
export function generateStatBlock(options: StatBlockOptions): StatBlock {
  const rng: Rng = createRng(options.seed);
  const level = Math.max(MIN_NPC_LEVEL, Math.min(MAX_NPC_LEVEL, Math.round(options.level)));
  const role =
    !options.role || options.role === "auto"
      ? roleForOccupation(options.occupation ?? "")
      : options.role;
  const profile = PROFILES[role];
  const b = benchmarkFor(level);

  const ac = pick(b?.ac ?? null, profile.ac, 15 + level);
  const hp = Math.max(4, pick(b?.hp ?? null, profile.hp, 10 + level * 8));
  const perception = pick(b?.perception ?? null, profile.perception, level + 3);
  const saves = {
    fort: pick(b?.fort ?? null, profile.fort, level + 3),
    ref: pick(b?.ref ?? null, profile.ref, level + 3),
    will: pick(b?.will ?? null, profile.will, level + 3),
  };
  const attackBonus = pick(b?.attack ?? null, profile.attack, level + 6);
  const damageTarget = Math.max(2, pick(b?.damageAvg ?? null, profile.damage, 4 + level * 2));

  // Ability spread: the key ability sits at the level's best-ability benchmark,
  // the rest fan out below it.
  const best = pick(b?.bestAbility ?? null, "moderate", Math.min(5, 3 + Math.floor(level / 5)));
  const order: RoleProfile["key"][] = ["str", "dex", "con", "int", "wis", "cha"];
  const others = order.filter((k) => k !== profile.key);
  const abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  abilities[profile.key] = best;
  const shuffled = rng.sample(others, others.length);
  shuffled.forEach((k, i) => {
    // Step down from the key ability, never below -1.
    abilities[k] = Math.max(-1, best - 1 - Math.floor(i / 2) - rng.int(0, 1));
  });

  // Fighting roles carry actual weapons; only the unarmed civilians throw punches.
  const armed = role !== "noncombatant" && role !== "expert";
  const meleePool = MELEE_WEAPONS.filter((w) => {
    if (armed && w.name === "fist") return false;
    if (profile.damage === "high") return w.faces >= 8;
    if (profile.damage === "low") return w.faces <= 6;
    return true;
  });

  const weapon = profile.ranged
    ? rng.pick(RANGED_WEAPONS)
    : rng.pick(meleePool.length ? meleePool : MELEE_WEAPONS);

  const attacks: StatBlockAttack[] = [
    {
      name: weapon.name,
      bonus: attackBonus,
      damage: damageDice(damageTarget, weapon.faces),
      damageType: weapon.type,
      traits: weapon.traits,
      ranged: Boolean(profile.ranged),
    },
  ];
  // Combat-capable NPCs usually carry a backup of the other kind.
  if (armed && rng.chance(0.6)) {
    const backupPool = profile.ranged
      ? MELEE_WEAPONS.filter((w) => w.name !== "fist")
      : RANGED_WEAPONS;
    const backup = rng.pick(backupPool);
    attacks.push({
      name: backup.name,
      bonus: Math.max(0, attackBonus - rng.int(1, 3)),
      damage: damageDice(Math.max(2, damageTarget - 2), backup.faces),
      damageType: backup.type,
      traits: backup.traits,
      ranged: !profile.ranged,
    });
  }

  // Always keep the key ability's skills — a soldier that lists only Arcana and
  // Society reads wrong — then top up from a second ability for flavour.
  const primarySkills = SKILLS_BY_KEY[profile.key];
  const secondarySkills = SKILLS_BY_KEY[rng.pick(order.filter((k) => k !== profile.key))];
  const skillNames = [
    ...primarySkills,
    ...rng.sample(secondarySkills, 2),
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  const skills = skillNames.slice(0, 4).map((name) => ({
    name,
    // Trained-ish spread around the level's perception benchmark.
    modifier: Math.max(0, perception + rng.int(-2, 3)),
  }));

  const statBlock: StatBlock = {
    level,
    role,
    roleLabel: ROLE_LABELS[role],
    perception,
    ac,
    hp,
    saves,
    abilities,
    speed: 25 + (rng.chance(0.35) ? 5 : 0),
    skills,
    attacks,
    note: profile.note,
    sampleSize: b?.sampleSize ?? 0,
  };

  if (profile.spellcaster) {
    // Spell DC tracks the level's better save benchmarks; attack is DC - 10.
    const dc = Math.max(
      14,
      pick(b?.will ?? null, "high", level + 6) + 10 - rng.int(0, 1),
    );
    statBlock.spellcasting = {
      dc,
      attack: dc - 10,
      tradition: rng.pick(TRADITIONS),
    };
  }

  return statBlock;
}

/** Render a stat block as markdown, in roughly PF2E stat-block order. */
export function statBlockToMarkdown(sb: StatBlock, name: string, traits: string[] = []): string {
  const mod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const abilityLine = (["str", "dex", "con", "int", "wis", "cha"] as const)
    .map((k) => `${k.toUpperCase()} ${mod(sb.abilities[k])}`)
    .join(", ");

  const lines = [
    `### ${name} — Creature ${sb.level}`,
    "",
    traits.length ? `*${traits.join(", ")}*` : "",
    `**Perception** ${mod(sb.perception)}`,
    `**Skills** ${sb.skills.map((s) => `${s.name} ${mod(s.modifier)}`).join(", ")}`,
    `**Abilities** ${abilityLine}`,
    "",
    `**AC** ${sb.ac}; **Fort** ${mod(sb.saves.fort)}, **Ref** ${mod(sb.saves.ref)}, **Will** ${mod(sb.saves.will)}`,
    `**HP** ${sb.hp}`,
    "",
    `**Speed** ${sb.speed} feet`,
    ...sb.attacks.map(
      (a) =>
        `**${a.ranged ? "Ranged" : "Melee"}** ${a.name} ${mod(a.bonus)}` +
        `${a.traits.length ? ` (${a.traits.join(", ")})` : ""}` +
        `, **Damage** ${a.damage} ${a.damageType}`,
    ),
  ];

  if (sb.spellcasting) {
    lines.push(
      `**${sb.spellcasting.tradition[0]!.toUpperCase()}${sb.spellcasting.tradition.slice(1)} Spellcasting** ` +
        `DC ${sb.spellcasting.dc}, attack ${mod(sb.spellcasting.attack)}`,
    );
  }
  if (sb.note) lines.push("", `*Role: ${sb.roleLabel}. ${sb.note}*`);

  return lines.filter((l) => l !== "").join("\n");
}
