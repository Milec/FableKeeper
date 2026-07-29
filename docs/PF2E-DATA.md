# PF2E data

FableKeeper bundles real Pathfinder 2e data — the bestiary and published tables —
rather than hand-written stand-ins. This document explains where it comes from,
what is deliberately excluded, and how to refresh it.

## Why it's a separate dataset

The original brief asked that "PF2E data can be updated independently from the
application itself". So the data is **not** written into TypeScript source.
Instead an ingestion script produces plain JSON:

```
scripts/fetch-pf2e-data.mjs   →   src/data/pf2e/bestiary.json
                                  src/data/pf2e/tables.json
```

Refresh it any time with:

```bash
npm run data:pf2e
```

Application code only ever reads the JSON through typed helpers
(`src/lib/bestiary/`, `src/lib/tables/builtins.ts`), so new Paizo releases are a
data refresh, not a code change.

## Source

Data is ingested from [Pf2eTools](https://github.com/Pf2eToolsOrg/Pf2eTools), a
community-maintained machine-readable mirror of Paizo's published mechanics.

| Dataset | Contents | Size |
| ------- | -------- | ---- |
| `bestiary.json` | 1,156 creatures, levels −1 → 25 | ~150 KB (19 KB gzipped) |
| `tables.json` | 18 tables (7 roll, 11 reference) | ~33 KB (9 KB gzipped) |

The bestiary is loaded through a **dynamic import** (`src/lib/bestiary/load.ts`)
so it is code-split out of the main bundle and fetched only when the Encounter
Builder needs it.

## Licensing — what's included and what isn't

Only sources whose *mechanical* content is open are ingested: OGL 1.0a for the
pre-remaster hardcovers and ORC for the remaster. The allow-list lives in
`OPEN_SOURCES` in the ingestion script:

- **Creatures** — Bestiary 1–3, Core Rulebook, Gamemastery Guide.
- **Tables** — Core Rulebook, Gamemastery Guide, Player Core, Secrets of Magic,
  Treasure Vault, Dark Archive, and similar rules hardcovers.

Deliberately **excluded**:

- **Adventure Paths** (Age of Ashes, Outlaws of Alkenstar, Season of Ghosts,
  Rusthenge, …). Their random tables are narrative product content, not open
  mechanics.
- **Card decks** (Critical Hit, Critical Fumble, Hero Point).
- **Lost Omens setting content**, which is Product Identity.

Creature records keep only what an encounter builder needs — name, level, size,
rarity, traits, and source/page for attribution. No stat blocks, descriptions, or
flavour text are copied.

> Pathfinder is a trademark of Paizo Inc. FableKeeper is unofficial and
> unaffiliated, and uses Paizo's mechanics with attribution consistent with the
> Community Use Policy.

### A note on how many roll tables exist

Pathfinder 2e's open-licensed core books contain comparatively **few pure random
tables** — 7 in this dataset. That is a property of the game line, not a gap in
the ingestion: most published PF2E random tables live in Adventure Paths and card
products, which are closed content. Anything else a GM wants is supported through
**custom tables** and **JSON import** inside a campaign.

The 11 remaining tables are *reference* (lookup) tables — Party Treasure by
Level, Treasure by Encounter, Character Wealth, and friends. They share the same
shape but are read by level rather than rolled on, so the UI shows them in a
separate section without a Roll button.

## Data shapes

```ts
// bestiary.json
interface Creature {
  name: string;
  level: number;      // -1 … 25
  size: string;       // tiny … gargantuan
  rarity: string;     // common | uncommon | rare | unique
  types: string[];    // creature-type traits, e.g. ["undead"]
  traits: string[];   // remaining traits, e.g. ["fire", "mindless"]
  source: string;     // "B1", "GMG", …
  page?: number;
}

// tables.json
interface BuiltinTable {
  id: string;
  name: string;
  kind: "rollable" | "reference";
  category: string;   // readable book name
  source: string;
  page?: number;
  die: string;        // "d20", "d%", or the index column label
  columns: string[];
  entries: { weight: number; text: string }[];
}
```

Both files also carry a `meta` block recording the ingestion date, upstream
source, and the source-book allow-list, which the UI surfaces as attribution.

## Markup handling

Pf2eTools stores text with 5etools-style tags (`{@b bold}`,
`{@item Longsword|CRB}`, `{@dice 1d6|Roll}`). The ingestion script reduces each
tag to its human-readable display text so bundled entries are plain strings.
