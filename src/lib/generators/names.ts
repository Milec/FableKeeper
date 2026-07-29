import { createRng, type Rng } from "./random";
import {
  ANCESTRIES,
  NAMES,
  SETTLE_PREFIX,
  SETTLE_SUFFIX,
  SHIP_ADJ,
  SHIP_NOUN,
  TAVERN_ADJ,
  TAVERN_NOUN,
  type Ancestry,
} from "./data";

export const NAME_KINDS = [
  "person",
  "settlement",
  "tavern",
  "ship",
] as const;
export type NameKind = (typeof NAME_KINDS)[number];

export interface NameOptions {
  kind: NameKind;
  /** For `person` names. Defaults to a random ancestry. */
  ancestry?: Ancestry | "any";
  count?: number;
  seed?: number | string;
}

function personName(rng: Rng, ancestry: Ancestry | "any"): string {
  const anc: Ancestry =
    !ancestry || ancestry === "any" ? rng.pick(ANCESTRIES) : ancestry;
  const table = NAMES[anc];
  const given = rng.pick(table.given);
  // Some ancestries use epithets ("the Chewer") rather than surnames; join
  // without a doubled space either way.
  const family = rng.pick(table.family);
  return family.startsWith("of ") || family.startsWith("the ")
    ? `${given} ${family}`
    : `${given} ${family}`;
}

function settlementName(rng: Rng): string {
  return `${rng.pick(SETTLE_PREFIX)}${rng.pick(SETTLE_SUFFIX)}`;
}

function tavernName(rng: Rng): string {
  return `The ${rng.pick(TAVERN_ADJ)} ${rng.pick(TAVERN_NOUN)}`;
}

function shipName(rng: Rng): string {
  return `The ${rng.pick(SHIP_ADJ)} ${rng.pick(SHIP_NOUN)}`;
}

/** Generate one or more names of the requested kind. */
export function generateNames(options: NameOptions): string[] {
  const rng = createRng(options.seed);
  const count = Math.min(Math.max(options.count ?? 6, 1), 50);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    switch (options.kind) {
      case "person":
        out.push(personName(rng, options.ancestry ?? "any"));
        break;
      case "settlement":
        out.push(settlementName(rng));
        break;
      case "tavern":
        out.push(tavernName(rng));
        break;
      case "ship":
        out.push(shipName(rng));
        break;
    }
  }
  return out;
}
