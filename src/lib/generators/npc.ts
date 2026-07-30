import { createRng, type Rng } from "./random";
import { generateNames } from "./names";
import {
  ALIGNMENTS,
  ANCESTRIES,
  APPEARANCE_BUILD,
  APPEARANCE_FEATURE,
  BONDS,
  FLAWS,
  GOALS,
  IDEALS,
  OCCUPATIONS,
  PERSONALITY_TRAITS,
  VOICE,
  type Ancestry,
} from "./data";
import {
  generateStatBlock,
  levelRangeForRole,
  roleForOccupation,
  statBlockToMarkdown,
  type NpcRole,
  type StatBlock,
} from "./statblock";

export interface NpcOptions {
  ancestry?: Ancestry | "any";
  alignment?: string | "any";
  occupation?: string | "any";
  /** 1–20, or "any" to roll a level appropriate for a commoner-to-notable. */
  level?: number | "any";
  /** Combat role shaping the stat block; "auto" infers it from occupation. */
  role?: NpcRole;
  seed?: number | string;
}

export interface GeneratedNpc {
  name: string;
  ancestry: Ancestry;
  alignment: string;
  level: number;
  occupation: string;
  personality: string;
  ideal: string;
  bond: string;
  flaw: string;
  goal: string;
  appearance: string;
  voice: string;
  biography: string;
  hooks: string[];
  portraitPrompt: string;
  /** A full, level-appropriate PF2E stat block. */
  statBlock: StatBlock;
}

function pickMaybe<T extends string>(
  rng: Rng,
  value: T | "any" | undefined,
  pool: readonly T[],
): T {
  return !value || value === "any" ? rng.pick(pool) : value;
}

export function generateNpc(options: NpcOptions = {}): GeneratedNpc {
  const rng = createRng(options.seed);

  const ancestry = pickMaybe(rng, options.ancestry, ANCESTRIES);
  const alignment = pickMaybe(rng, options.alignment, ALIGNMENTS);
  const occupation = pickMaybe(rng, options.occupation, OCCUPATIONS);

  // A PF2E creature's level *is* its stat level, so the level has to agree with
  // what the NPC actually is: a village fisher is level -1/0, not a level-4
  // creature with a warrior's AC and attack bonus. Roll within the band implied
  // by the role, and honour an explicit level when one is given.
  const role: Exclude<NpcRole, "auto"> =
    !options.role || options.role === "auto"
      ? roleForOccupation(occupation)
      : options.role;
  const [minLevel, maxLevel] = levelRangeForRole(role);
  const level =
    !options.level || options.level === "any"
      ? rng.int(minLevel, maxLevel)
      : options.level;

  const name = generateNames({
    kind: "person",
    ancestry,
    count: 1,
    seed: rng.int(0, 2 ** 30),
  })[0]!;

  const personality = rng.pick(PERSONALITY_TRAITS);
  const ideal = rng.pick(IDEALS);
  const bond = rng.pick(BONDS);
  const flaw = rng.pick(FLAWS);
  const goal = rng.pick(GOALS);
  const build = rng.pick(APPEARANCE_BUILD);
  const feature = rng.pick(APPEARANCE_FEATURE);
  const appearance = `A ${build} ${ancestry.toLowerCase()} with ${feature}.`;
  const voice = rng.pick(VOICE);

  const article = /^[aeiou]/i.test(occupation) ? "an" : "a";
  const biography =
    `${name} is ${article} ${occupation} of ${ancestry.toLowerCase()} descent. ` +
    `They are ${personality}, driven above all ${goal}. ` +
    `Those who know them speak of ${bond}, and warn that they ${flaw}. ` +
    `At heart, they believe: "${ideal}"`;

  const hooks = rng.sample(
    [
      `${name} needs something recovered — and can't say why.`,
      `A rival is spreading a rumor about ${name} that happens to be true.`,
      `${name} offers the party work that conveniently serves their own goal.`,
      `Someone is looking for ${name}, and they aren't friendly.`,
      `${name} owes a debt to a dangerous party and is out of time.`,
      `${name} knows a secret the party needs, but wants a favor first.`,
    ],
    3,
  );

  const portraitPrompt =
    `Portrait of ${name}, a ${build} ${ancestry.toLowerCase()} ${occupation}, ` +
    `${feature}, ${alignment.toLowerCase()} demeanor, fantasy character art, ` +
    `dramatic lighting, painterly.`;

  const statBlock = generateStatBlock({
    level,
    role,
    occupation,
    seed: rng.int(0, 2 ** 30),
  });

  return {
    name,
    ancestry,
    alignment,
    level,
    occupation,
    statBlock,
    personality,
    ideal,
    bond,
    flaw,
    goal,
    appearance,
    voice,
    biography,
    hooks,
    portraitPrompt,
  };
}

/** Render an NPC as markdown (for copying into a World Builder entry). */
export function npcToMarkdown(npc: GeneratedNpc): string {
  const levelLabel = npc.level === 0 ? "Ordinary (level 0)" : `Level ${npc.level}`;
  return [
    `# ${npc.name}`,
    "",
    `*${npc.ancestry} ${npc.occupation} · ${npc.alignment} · ${levelLabel}*`,
    "",
    `**Appearance.** ${npc.appearance} Speaks with ${npc.voice}.`,
    "",
    `**Personality.** ${npc.personality}.`,
    "",
    `**Ideal.** ${npc.ideal}`,
    `**Bond.** ${npc.bond}.`,
    `**Flaw.** ${npc.flaw}.`,
    `**Goal.** ${npc.goal}.`,
    "",
    "## Biography",
    "",
    npc.biography,
    "",
    "## Plot hooks",
    "",
    ...npc.hooks.map((h) => `- ${h}`),
    "",
    "## Stat block",
    "",
    statBlockToMarkdown(npc.statBlock, npc.name, [
      npc.alignment,
      npc.ancestry.toLowerCase(),
      "humanoid",
    ]),
    "",
    `> Portrait prompt: ${npc.portraitPrompt}`,
  ].join("\n");
}
