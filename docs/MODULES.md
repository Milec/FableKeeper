# Modules

FableKeeper is organized as a set of **modules**. This document describes the
module contract and how to add a new one, so future tools slot in without
refactoring existing code.

## The registry

Every module is declared in
[`src/modules/registry.ts`](../src/modules/registry.ts) as a `ModuleDefinition`:

```ts
interface ModuleDefinition {
  id: string;                       // stable id, also the URL segment
  name: string;                     // shown in navigation
  description: string;              // one-liner for dashboards/tooltips
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4 | 5 | 6;     // roadmap phase it arrives in
  status: "available" | "planned";  // gates navigation
  requiredPermission?: Permission;  // capability needed to see/use it
}
```

The registry is the single source of truth the shell reads from. The sidebar
navigation, dashboards, and (in later phases) the command palette and global
search scopes are all derived from it. That means **adding a module never
requires editing the navigation or other modules.**

## Separation of concerns

Each module splits into two layers:

| Layer      | Location                | Rule                                            |
| ---------- | ----------------------- | ----------------------------------------------- |
| Pure logic | `src/lib/<module>/`     | No React, no I/O side effects. Unit-tested.     |
| UI         | `src/modules/<module>/` | React components. Presentation + local state.   |
| Route      | `src/app/(app)/tools/<id>/` | Thin page that renders the module UI.       |

The **dice engine** is the reference implementation:

- [`src/lib/dice/`](../src/lib/dice) — the parser, roller, and types. Pure and
  covered by [`dice.test.ts`](../src/lib/dice/dice.test.ts) (14 tests). It takes
  an injectable random source so rolls are deterministic in tests.
- [`src/modules/dice/dice-roller.tsx`](../src/modules/dice/dice-roller.tsx) — the
  interactive UI (formula input, quick dice, animated results, history). It
  contains **no rolling logic** — it only calls `@/lib/dice`.
- [`src/app/(app)/tools/dice/page.tsx`](../src/app/(app)/tools/dice/page.tsx) —
  the route.

This layering is why the same dice engine can later be reused inside encounters,
shops, generators, and rollable tables without duplication.

## Adding a module — checklist

1. **Register it.** Add a `ModuleDefinition` to `src/modules/registry.ts`.
2. **Model its data (if any).** Add a migration under `supabase/migrations/`,
   enable RLS, and add matching policies. Add any new capability string to the
   `PERMISSIONS` list in `src/lib/permissions.ts` and grant it to the right roles.
3. **Write the pure logic.** Put it in `src/lib/<module>/` and add tests.
4. **Build the UI.** Put components in `src/modules/<module>/`, reusing
   `src/components/ui/` primitives.
5. **Add the route.** Create `src/app/(app)/tools/<id>/page.tsx`.
6. **Flip the status.** Set `status: "available"` when it's ready to appear in
   navigation.

## The dice engine API

For modules that need dice:

```ts
import { roll, rollMany, validateFormula, formatRollResult } from "@/lib/dice";

roll("4d6kh3+2");           // → RollResult with per-die breakdown and total
rollMany("1d20", 3);        // → RollResult[]
validateFormula("2d6+x");   // → error message string, or null if valid
```

Supported notation: `d2`–`d100` (any sides 1–1000), counts up to 1000, flat
modifiers (`+`/`-`), and keep-highest / keep-lowest (`4d6kh3`, `2d20kl1`).

## World Builder (Phase 2)

The World Builder is the second reference module and shows the pattern at a
larger scale:

- **Pure logic** in `src/lib/world/`:
  - `entry-types.ts` — metadata (labels, icons, categories) for all 25 entry
    types; the single source the browser sidebar reads from.
  - `wikilinks.ts` — parses and rewrites `[[wiki links]]`; pure and unit-tested
    (`wikilinks.test.ts`).
  - `queries.ts` — server-only read helpers (`server-only` guarded).
  - `actions.ts` — Server Actions for create/update/delete, including
    `syncEntryLinks`, which derives the `entry_links` backlink rows from the
    wiki links in an entry's markdown on every save.
  - `resolver.ts` — builds the slug→URL map the renderer uses.
- **UI** in `src/modules/world/` (editor, create-world form) and
  `src/components/world/` (markdown renderer, ⌘K command palette).
- **Routes** under `src/app/(app)/campaigns/[campaignId]/…` for the campaign
  overview, world browser, entry view/create/edit, and search.

### Navigation

The World Builder is a **shell**, not a drill-down. `worlds/[worldId]/layout.tsx`
renders a persistent navigator (`src/components/world/world-tree.tsx`) with the
world switcher, a name filter, and a category → type → entry tree, so the whole
world is reachable from any entry. Earlier the type filters only existed on the
world index page, which meant walking campaign → world → index before anything
was usable, and losing the navigation the moment you opened an entry.

`campaigns/[campaignId]/world/page.tsx` is a resolver: it redirects to the
campaign's world (or the overview when none exists), so the sidebar and campaign
nav can link to "World" without knowing a world id. The sidebar also takes a
`fallbackCampaignId` from the app layout so campaign-scoped links work from the
dashboard instead of bouncing back to it.

### Editing

`src/components/editor/rich-markdown-editor.tsx` provides the formatting toolbar
(bold/italic/strike/code, H1–H3, lists, quote, divider, ⌘B/⌘I) and **two ways to
link without typing brackets**: a *Link entry* button that opens a searchable
picker, and inline autocomplete when you type `[[` (↑↓ + Enter). Selected text
becomes the link alias, i.e. `[[Target|selected]]`.

All text manipulation lives in `src/lib/editor/markdown-commands.ts` — pure
functions over `{text, selectionStart, selectionEnd}`, covered by 22 unit tests,
so the toolbar behaviour is verified without a DOM. `MarkdownField` wraps the same
editor, so sessions, quests, and character journals share it.

`src/lib/world/templates.ts` supplies MythScribe-style guided templates per entry
type: a new City opens with Overview / Government & Power / Economy & Trade /
Districts / Notable Figures / Troubles & Hooks rather than an empty box. Templates
are plain markdown, so they can be edited or deleted freely, and the type selector
can re-insert one on demand.

Design notes:

- **Content** is stored as `{ markdown: string }` in the `world_entries.content`
  jsonb column, rendered with `react-markdown` + `remark-gfm`. Wiki links are
  rewritten to markdown links before rendering; unresolved links render in a
  muted "missing" style that offers to create the entry.
- **Backlinks** are a first-class table (`entry_links`), kept in sync from
  content so the "Linked from" section and future graph views are just queries.
- **Secrets & search** rely on RLS: the search API and command palette run as
  the signed-in user, so a Player's search can never surface a GM secret.

## Character & Campaign Managers (Phase 3)

- **Character Manager** — `src/lib/characters/` holds the pure Pathbuilder
  importer (`pathbuilder.ts`, unit-tested), server queries, and Server Actions;
  `src/modules/characters/` holds the sheet editor and the Pathbuilder import
  form. Characters support manual creation, Pathbuilder JSON import, JSON export
  (`…/characters/[id]/export`), portraits, and a markdown journal. RLS lets a
  player manage their own characters while GMs see the whole party.
- **Campaign Manager** — `src/lib/campaign/` holds session/quest queries and
  actions; `src/modules/campaign/` holds their editors. Sessions are dated recap
  notes (with GM-only planning sessions); quests are grouped by status with
  GM-secret support. Both reuse the markdown renderer and the secret-visibility
  RLS pattern.
- **Image storage** — `src/components/media/image-upload.tsx` uploads to the
  `media` Storage bucket at `{campaignId}/{kind}/{uuid}.{ext}` and writes the
  public URL into the surrounding form. Reused anywhere images are needed.

Navigation for these lives in the campaign section nav
(`src/components/layout/campaign-nav.tsx`), since they are campaign-scoped rather
than global tools.

## Generators (Phase 4)

Four generators live under `src/lib/generators/` (pure, unit-tested) with UIs in
`src/modules/generators/` and routes under `src/app/(app)/tools/`:

- `random.ts` — a small seedable PRNG (`mulberry32`) with `pick`/`sample`/
  `weighted` helpers. Seeding makes every generator **reproducible** and
  deterministically testable.
- `data.ts` — original, PF2E-flavoured data tables (ancestries, name fragments,
  traits, occupations, shop goods) kept separate from logic so the data can grow
  independently.
- `names.ts`, `npc.ts`, `shop.ts`, `backstory.ts` — the generators, each with a
  `…ToMarkdown` helper so a result can be copied straight into a World Builder
  entry.

- `statblock.ts` — generates a full PF2E stat block for an NPC: AC, HP, saves,
  Perception, skills, strikes with damage dice, and a spell DC for casters.
  Numbers come from `benchmarks.json` (see [PF2E-DATA.md](./PF2E-DATA.md)), with
  a **combat role** deciding which percentile each statistic draws from — so a
  level-5 brute is tough but easy to hit, while a level-5 soldier is the reverse.
  Roles also bound the level a role plausibly occupies: PF2E creature level *is*
  the stat level, so a village fisher is generated at level −1/0 rather than
  being statted as a level-4 creature with a warrior's AC and attack bonus.

The generators run entirely client-side with no external services. The Name
Generator stores favourites in `localStorage`.

### Character sheet

`src/lib/characters/sheet.ts` derives everything a sheet displays from the stored
character, following PF2E's maths (`level + proficiency rank + ability modifier`,
with untrained skills getting no level bonus): all three saves, Perception, Class
DC, the 16 skills plus Lores, spellcasting by rank, feats, inventory, coins,
languages, and conditions, plus XP progression toward the next level and hero
points. Pathbuilder imports already carried this data in the `data` jsonb; the
sheet surfaces it. Covered by unit tests that assert the derived numbers for a
known level-5 character. AI-assisted generation (Phase 6) can layer on top of the
same pure functions later without changing the UIs.

**Proficiency rank editor** — `src/modules/characters/proficiency-editor.tsx`
lets a hand-built character set every rank directly (Perception, the three saves,
Class DC, all 16 skills, and any number of Lores), previewing the resulting
modifier live so the PF2E maths stays visible while editing. Without it, ranks
could only arrive via a Pathbuilder import, so a manually created character
always showed untrained modifiers.

Two implementation details are worth knowing before editing these forms:

- The editors serialise their state into **hidden JSON inputs** (`proficiencies`,
  `lores`, `feats`, `equipment`) rather than indexed field names, so adding and
  removing rows never leaves stale keys in the submitted `FormData`. Lores and
  equipment emit Pathbuilder's `[name, rank]` / `[name, quantity]` tuple shape,
  so imported and hand-edited data stay interchangeable. `actions.ts` re-validates
  everything server-side, clamping ranks to PF2E's `0/2/4/6/8`.
- Every `TabsContent` in the character form uses **`forceMount`**. Radix unmounts
  inactive tab panels by default, which would silently drop those fields from the
  submitted form; the panels are hidden with
  `data-[state=inactive]:hidden` instead.

`src/lib/characters/form-data.ts` holds the pure `FormData` → `data` jsonb
parsers, kept out of `actions.ts` so they are unit-testable without a Supabase
client. The **merge rules are the subtle part**, because the editors expose less
than a Pathbuilder import stores and a naive write-back destroys the difference:

- `updateCharacter` spreads the form-owned fields over the existing `data`, so
  keys with no UI at all (spells, alignment) survive an edit.
- `proficiencies` is **merged, not replaced**: Pathbuilder keeps armour, weapon,
  and spellcasting proficiencies in the same map the rank editor writes to.
- `feats` and `equipment` are **matched by name against the stored entries**, so
  an unchanged row is written back as its original tuple. A Pathbuilder feat is
  `[name, source, type, level]`; the editor only shows the name, so flattening
  would throw the rest away.

Tests in `form-data.test.ts` pin each of these rules.

## Encounters & Rollable Tables (Phase 5)

Both build on the tested dice engine and the seedable RNG:

- **Encounter Builder** — `src/lib/encounters/budget.ts` holds the pure PF2E
  budgeting math (XP budget by threat/party size, per-creature XP by level,
  elite/weak, simple/complex hazards), unit-tested in `budget.test.ts`. The
  builder UI (`src/modules/encounters/`) recomputes the live threat rating as you
  edit; encounters persist to the `encounters` table.
- **Rollable Tables** — `src/lib/tables/roll.ts` holds weighted rolling, range
  computation, and JSON import/export (tested); `builtins.ts` exposes the real
  published PF2E tables from the bundled dataset. `TableRoller`
  (`src/modules/tables/`) always renders the **whole** table and highlights the
  rolled row in place, rather than only reporting a result. Custom tables persist
  to `roll_tables`; the published ones render at `/tools/tables`.

### Bestiary & automatic encounter generation

- `src/data/pf2e/bestiary.json` — 1,156 real PF2E creatures, produced by
  `scripts/fetch-pf2e-data.mjs`. See [PF2E-DATA.md](./PF2E-DATA.md).
- `src/lib/bestiary/` — types, pure filtering/faceting, and a memoised dynamic
  loader so the dataset is code-split away from the main bundle.
- `src/lib/encounters/generate.ts` — the generator. Notably it does **not** fill
  greedily: PF2E creature XP comes in coarse steps (10/15/20/…/160) and the threat
  thresholds are hard steps, so finishing a few XP under budget would report a
  whole band too low. Instead `solveBudget()` runs a small bounded DP over
  (sum, count) to hit the budget exactly — with a capped overshoot for the level
  bands where the budget is arithmetically unreachable. A property test asserts
  the requested threat band is achieved >99% of the time across 180
  party/level/threat combinations.
- `src/modules/encounters/` — `generator-panel.tsx` (criteria + one-click fill),
  `bestiary-picker.tsx` (search/filter/add), and `chip-select.tsx` (expandable
  multi-select; it always keeps selected chips visible so a selection can never
  hide behind the "show more" toggle).

## Planned modules

Every module in the registry is now `available`. The `planned` status remains
part of `ModuleDefinition` because it is how a module is introduced: register it
as `planned` so it appears in the UI as "coming soon", then flip it to
`available` with its `campaignPath` once the route exists. Nothing else needs to
change — the sidebar, the module grid, and the search index all read the
registry.

## Interactive Maps (Phase 6)

The module's first capability is **cross-compatibility with Azgaar's Fantasy Map
Generator**: import a map's JSON export and it becomes a connected set of World
Builder articles.

- `src/lib/maps/azgaar.ts` — parses FMG's Full and Minimal export shapes (both
  nest entities under `pack`) and normalises its terse fields. Also exports
  `compactAzgaarExport`, which the client runs **before uploading**.
- `src/lib/maps/entries.ts` — maps each entity onto the entry type that matches
  what it is (Monarchy → Kingdom, `ruins` marker → Ruin, `caves` → Dungeon) and
  writes `[[wiki links]]` between them.
- `src/lib/maps/actions.ts` — the Server Action. Bulk-inserts in chunks and
  resolves the whole backlink graph in memory from one lookup, rather than the
  per-entry query the normal save path uses; a 600-entry import would otherwise
  be 600 round trips.
- `src/modules/maps/azgaar-import.tsx` — the import UI. Because the parser is
  pure, **the same code previews the file in the browser** before anything is
  uploaded: entity counts per group, per-type totals, and a population filter,
  all live.

### Things the format demands you get right

These were established against Azgaar's own `tests/fixtures/demo.map` (v1.112),
not inferred, and each one silently corrupts an import if missed:

- **Index 0 is a placeholder in only some collections.** `states[0]` is
  "Neutrals", `cultures[0]` "Wildlands", `religions[0]` "No religion" — all
  meaning unclaimed. `burgs[0]`, `provinces[0]`, and `features[0]` are the
  literal number `0`. But `markers[0]` and `zones[0]` are **real entities**, so a
  blanket skip-id-0 rule drops the first marker and zone.
- **`removed: true` entries stay in the array** — FMG tombstones to keep ids
  stable.
- **A burg records neither its province nor its religion.** Those live only in
  the per-cell arrays, so they are recovered from `pack.cells`. This is why
  compaction *reduces* the cell array to the burg-occupied cells rather than
  dropping it: a real 1.7 MB export compacts to 0.38 MB with all 753 burgs still
  fully linked.
- **A marker's name is in the map notes** (`marker3` → "Mount Tother"), not on
  the marker. FMG's generated legends are real flavour text and lead the article.
- **Populations are scaled**: `population * populationRate * urbanization`.

Settlements split three ways: **city** at 5,000+, **town** at 1,000+, **village**
below that, with capitals always cities. The bands matter — the median burg on a
generated map sits near 3,700, so with only city and village either two thirds of
a map becomes "cities" or every market town is filed as a village. Migration
`0009` adds the `town` entry type for this.

Re-importing the same map is safe: entries whose slug already exists are left
untouched rather than overwritten, since the GM has probably edited them.

### The map viewer

`maps` holds an image plus `map_pins`. Pins store **normalised coordinates**
(0–1 of the image on each axis) rather than pixels, because Azgaar records
positions in the pixel space of the map *it* generated (`info.width` ×
`info.height`) while the GM exports the picture at whatever resolution they like,
and may swap in a tidied version later. Fractions survive all of that.

Two consequences worth keeping in mind when touching `map-viewer.tsx`:

- **The frame's aspect ratio is measured from the image on load**, not
  hard-coded. Pins are positioned as percentages of the frame, so if the frame's
  ratio doesn't match the image, `object-contain` letterboxes the image inside it
  and every pin drifts.
- **Pins counter-scale with zoom** (`scale(1/zoom)`) so they stay a constant
  on-screen size instead of ballooning as the map is magnified.

`buildPinDrafts` resolves a pin to its article through the entry drafts rather
than by re-slugifying the name. The draft builder de-duplicates slug collisions,
and Azgaar names a province after its seat burg — re-deriving the slug would
point a city's pin at the province's article.

**Fog of war** is per pin: `map_pins.is_revealed` gates player visibility in the
RLS select policy, while campaign editors always see everything so they can
reveal it. Pins toggle individually, and **Reveal all / Hide all** cover the two
ways a campaign actually starts — everything hidden and revealed as the party
travels, or a map the players already know. Both are optimistic and roll back if
the action fails.

Because the gate is in the policy rather than the UI, a player's page never
receives an unrevealed pin at all. Verified with two real accounts: with pins
hidden the GM sees three and the player's map reports "0 pins"; after the GM
reveals, the player sees all three.

## AI Assist (Phase 6)

The reason to generate lore *inside* FableKeeper rather than in a general chat
tool is that the world already exists here. So the module's real work is
context assembly, and that lives in a pure module the API call merely consumes.

- `src/lib/ai/prompt.ts` — everything deterministic: the system prompt, the
  world digest, the response schema, and `normaliseDraft`. Kept free of any
  network or Supabase dependency so the prompt is unit-tested without spending
  anything. The digest is capped at `MAX_CONTEXT_ENTRIES` (60) and each summary
  clipped to 160 characters — an Azgaar import alone produces 600+ entries, and
  sending them all would drown the GM's brief in noise. When entries are
  dropped the prompt says how many, so the model knows the list is partial
  rather than exhaustive.
- `src/lib/ai/actions.ts` — the Server Action. Reads the world digest through
  the **user's** Supabase client, so RLS scopes the context to what that person
  may read: a draft requested by a Player is grounded only in what the GM has
  actually revealed. Uses structured outputs against `DRAFT_SCHEMA`, and checks
  `stop_reason === "refusal"` *before* touching `response.content` — a refused
  response carries no usable body, so indexing into it would throw rather than
  explain. SDK errors are caught by type, most specific first, because a
  rejected key and a rate limit need very different things from the reader.
- `src/modules/ai/assist-form.tsx` — the UI.

Two decisions worth keeping:

**Links are the point.** The model is told to reference existing entries by
wrapping their exact title in `[[double brackets]]`, and explicitly *never* to
invent a bracketed link to something that doesn't exist — a paraphrased title
produces a dead wiki link, which is worse than no link. In an empty world the
prompt omits the invitation entirely rather than asking for links to nothing.

**Nothing is saved automatically.** The draft is rendered for review, and
"Open in the editor" is a plain `GET` form that hands `title`, `summary`,
`content`, and `tags` to the normal new-entry page as query params. Generated
text therefore goes through exactly the same editor, validation, and save path
as hand-written text, and only lands in the world when the GM saves it. The
entry editor's template-seeding effect skips when a draft is prefilled, so the
type's guided template can't clobber the generated body.

The module is optional. `isAiConfigured()` gates the form on the presence of
`GEMINI_API_KEY`; without one the page explains what to add and nothing else in
FableKeeper is affected.

### Why Gemini, and what the provider seam looks like

The module runs on **Gemini 2.5 Flash** through `@google/genai`, chosen because
it is the strongest model with a genuine free tier — good enough prose for
setting-book copy, native structured outputs, and no card on file. `MODEL` is
deliberately a *stable* id rather than a `-preview` alias: preview models are
withdrawn on Google's schedule, and a campaign wiki shouldn't lose a feature
because an alias retired.

Swapping providers touches exactly two files, which is the point of the split:

- `prompt.ts` is provider-agnostic. `DRAFT_SCHEMA` is plain JSON Schema, which
  Gemini takes directly as `responseJsonSchema`; it needed no changes when the
  module moved off its first provider.
- `errors.ts` holds the failure-message mapping, pure and unit-tested, because
  these strings are the only thing a GM sees when generation fails. The mapping
  distinguishes *who has to act*: a rejected key needs someone with access to
  the secret, a 429 just needs a minute, and a 400 is our bug — telling someone
  to "check your key" on a quota error sends them hunting for a fault that
  isn't there.

Only `actions.ts` knows which vendor is in use.

**Free tiers make quota a routine path, not an edge case.** Google no longer
publishes per-model free-tier limits in its docs (they're shown per-account in
AI Studio) and has cut them before, so 429 is treated as an ordinary outcome
with a message that says it resolves on its own, and `MAX_OUTPUT_TOKENS` caps
each response so one rambling brief can't spend the day's allowance.

Gemini can stop a generation in two different places, and both are checked
*before* reading the text: `promptFeedback.blockReason` (the brief itself was
blocked, before anything was written) and the candidate's `finishReason` (the
output was cut off partway). Either one leaves the JSON absent or truncated, so
parsing first would surface a meaningless syntax error instead of an
explanation. Note that `finishReason` is *absent* on some successful responses,
so `isUsableFinish` treats missing as fine — rejecting it would throw away good
drafts.
