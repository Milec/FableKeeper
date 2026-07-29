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

Design notes:

- **Content** is stored as `{ markdown: string }` in the `world_entries.content`
  jsonb column, rendered with `react-markdown` + `remark-gfm`. Wiki links are
  rewritten to markdown links before rendering; unresolved links render in a
  muted "missing" style that offers to create the entry.
- **Backlinks** are a first-class table (`entry_links`), kept in sync from
  content so the "Linked from" section and future graph views are just queries.
- **Secrets & search** rely on RLS: the search API and command palette run as
  the signed-in user, so a Player's search can never surface a GM secret.

## Planned modules

The registry already lists the roadmap modules (World Builder, Characters,
Campaign Manager, Encounter Builder, Generators, Shop Generator, Interactive
Maps, AI Assist) as `planned`, so they appear in the UI as "coming soon" and can
be activated as each is built.
