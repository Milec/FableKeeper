import { createRng, type Rng } from "./random";
import { generateNames } from "./names";
import {
  ANCESTRIES,
  BONDS,
  FLAWS,
  GOALS,
  IDEALS,
  OCCUPATIONS,
  PERSONALITY_TRAITS,
  type Ancestry,
} from "./data";

export interface BackstoryOptions {
  ancestry?: Ancestry | "any";
  occupation?: string | "any";
  /** Approximate age band. */
  age?: "young" | "adult" | "middle-aged" | "old" | "any";
  name?: string;
  seed?: number | string;
}

export interface GeneratedBackstory {
  name: string;
  ancestry: Ancestry;
  occupation: string;
  age: string;
  summary: string;
  history: string;
  hooks: string[];
  goals: string;
}

const ORIGINS = [
  "born in a cramped harbor slum", "raised on a remote farmstead",
  "orphaned young and taken in by a temple", "the child of traveling performers",
  "third of seven siblings in a merchant house", "abandoned at a monastery gate",
  "raised by a grandparent after a plague", "born on the road to nowhere in particular",
];

const TURNING_POINTS = [
  "a fire that took everything", "a betrayal by someone they trusted",
  "an unexpected inheritance", "a war that swept through their home",
  "a chance meeting with a stranger", "a crime they witnessed and couldn't unsee",
  "the death of the one person who believed in them", "a debt that changed hands",
];

function ageBand(rng: Rng, age: BackstoryOptions["age"]): string {
  const band = !age || age === "any"
    ? rng.pick(["young", "adult", "middle-aged", "old"])
    : age;
  return band;
}

export function generateBackstory(
  options: BackstoryOptions = {},
): GeneratedBackstory {
  const rng = createRng(options.seed);
  const ancestry: Ancestry =
    !options.ancestry || options.ancestry === "any"
      ? rng.pick(ANCESTRIES)
      : options.ancestry;
  const occupation =
    !options.occupation || options.occupation === "any"
      ? rng.pick(OCCUPATIONS)
      : options.occupation;
  const age = ageBand(rng, options.age);
  const name =
    options.name?.trim() ||
    generateNames({ kind: "person", ancestry, count: 1, seed: rng.int(0, 2 ** 30) })[0]!;

  const origin = rng.pick(ORIGINS);
  const turn = rng.pick(TURNING_POINTS);
  const personality = rng.pick(PERSONALITY_TRAITS);
  const bond = rng.pick(BONDS);
  const flaw = rng.pick(FLAWS);
  const ideal = rng.pick(IDEALS);
  const goal = rng.pick(GOALS);

  const summary =
    `${name}, ${age === "old" ? "an" : "a"} ${age} ${ancestry.toLowerCase()} ${occupation}, ` +
    `${personality}. Everything changed the day of ${turn}.`;

  const history = [
    `${name} was ${origin}. Life as a ${occupation} was unremarkable until ${turn}.`,
    `That moment left its mark: they carry ${bond}, and to this day they ${flaw}.`,
    `Through it all, one conviction held: "${ideal}" It has cost them as much as it has saved them.`,
  ].join(" ");

  const hooks = rng.sample(
    [
      `Someone from ${name}'s past resurfaces with a claim on them.`,
      `${name} is offered a chance to undo the day of ${turn} — at a price.`,
      `A letter arrives that ${name} was never meant to read.`,
      `${name}'s old ${occupation} skills are suddenly, dangerously in demand.`,
      `The person tied to ${bond} needs ${name}'s help, right now.`,
    ],
    3,
  );

  return {
    name,
    ancestry,
    occupation,
    age,
    summary,
    history,
    hooks,
    goals: `${name} now strives ${goal}.`,
  };
}

export function backstoryToMarkdown(b: GeneratedBackstory): string {
  return [
    `# ${b.name}`,
    "",
    `*${b.age} ${b.ancestry} ${b.occupation}*`,
    "",
    "## Summary",
    "",
    b.summary,
    "",
    "## History",
    "",
    b.history,
    "",
    "## Future goals",
    "",
    b.goals,
    "",
    "## Adventure hooks",
    "",
    ...b.hooks.map((h) => `- ${h}`),
  ].join("\n");
}
