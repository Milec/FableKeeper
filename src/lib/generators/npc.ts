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

export interface NpcOptions {
  ancestry?: Ancestry | "any";
  alignment?: string | "any";
  occupation?: string | "any";
  /** 1–20, or "any" to roll a level appropriate for a commoner-to-notable. */
  level?: number | "any";
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
  const level =
    !options.level || options.level === "any"
      ? rng.weighted([
          { value: 0, weight: 5 }, // level 0 = ordinary townsfolk
          { value: 1, weight: 4 },
          { value: 2, weight: 3 },
          { value: 3, weight: 2 },
          { value: 4, weight: 1 },
          { value: 5, weight: 1 },
        ])
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

  return {
    name,
    ancestry,
    alignment,
    level,
    occupation,
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
    `*Placeholder — build a ${levelLabel} ${npc.occupation} NPC using the PF2E ` +
      `NPC Gallery or the building-creatures guidelines.*`,
    "",
    `> Portrait prompt: ${npc.portraitPrompt}`,
  ].join("\n");
}
