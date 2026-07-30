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

`updateCharacter` reads the existing `data` jsonb and spreads the form-owned
fields over it, so values only a Pathbuilder import supplies (spells, alignment)
survive a manual edit.

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

The registry already lists the roadmap modules (World Builder, Characters,
Campaign Manager, Encounter Builder, Generators, Shop Generator, Interactive
Maps, AI Assist) as `planned`, so they appear in the UI as "coming soon" and can
be activated as each is built.
