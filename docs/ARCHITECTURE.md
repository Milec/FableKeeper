# Architecture

This document explains how FableKeeper is put together and the principles that
keep it maintainable as more of the roadmap is built.

## Goals

FableKeeper is engineered as though it could eventually support many campaigns
and users, even though it starts as a tool for a small group. The priorities,
in order, are **maintainability, scalability, performance, accessibility, and an
intuitive UX** — ahead of raw feature velocity.

## High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React 18)                        │
│  Client Components · TanStack Query cache · Framer Motion      │
└───────────────▲───────────────────────────┬──────────────────┘
                │ RSC payloads / Server Actions │
┌───────────────┴───────────────────────────▼──────────────────┐
│              Next.js App Router on Cloudflare Workers          │
│   Server Components · Route Handlers · middleware (session)    │
│                    (OpenNext adapter)                          │
└───────────────▲───────────────────────────┬──────────────────┘
                │  supabase-js (RLS-scoped)   │
┌───────────────┴───────────────────────────▼──────────────────┐
│                          Supabase                             │
│  Auth · PostgreSQL + Row Level Security · Realtime · Storage   │
└───────────────────────────────────────────────────────────────┘
```

- **Rendering** — React Server Components render on the Cloudflare Workers
  runtime. Interactive pieces (dice roller, forms, menus) are Client Components.
- **Auth & data** — Supabase provides authentication and a Postgres database.
  All reads/writes go through `supabase-js` using the public anon key; access is
  constrained by Row Level Security, so the client can never see data it is not
  authorized for.
- **Session management** — `src/middleware.ts` refreshes the Supabase session on
  every request and redirects unauthenticated users away from protected routes.

## Key design decisions

### 1. Modular by construction

Every major feature is a **module**, registered in
[`src/modules/registry.ts`](../src/modules/registry.ts). The registry is the
single seam through which the app learns about features: navigation, dashboards,
command palette entries, and (later) search scopes all derive from it. Adding a
module means adding a registry entry and a route under
`src/app/(app)/tools/<module>` — no edits to existing modules.

Each module keeps its **pure logic** in `src/lib/<module>` (dependency-free,
unit-testable) and its **UI** in `src/modules/<module>`. The dice engine is the
reference implementation: [`src/lib/dice`](../src/lib/dice) is pure and tested;
[`src/modules/dice`](../src/modules/dice) is just presentation.

### 2. Authorization in two mirrored places

The role/capability matrix lives in
[`src/lib/permissions.ts`](../src/lib/permissions.ts) as pure, testable
functions, and is mirrored by the RLS policies in
[`supabase/migrations/0002_rls.sql`](../supabase/migrations/0002_rls.sql). The
app uses the TypeScript matrix to decide what to render; the database enforces
the same rules independently. This is what guarantees "players only see what the
GM reveals" even against a hostile client.

Roles are **per campaign** — a user can be a GM in one campaign and a Player in
another. Membership and role live in the `campaign_members` table.

### 3. Server Components + Server Actions first

Data fetching happens in Server Components (`src/lib/auth.ts` helpers), and
mutations happen through Server Actions (`actions.ts` files) validated with Zod.
TanStack Query is available for client-side caching and optimistic updates as
interactive modules grow.

### 4. Accessibility & motion

- Dark-mode-first theming via `next-themes`, with a light theme available.
- shadcn/ui primitives are built on Radix, which handles focus management and
  ARIA semantics.
- `globals.css` honors `prefers-reduced-motion`, disabling animations for users
  who ask for it.

### 5. Performance

The foundation is set up for the performance work in Phase 6: code splitting via
the App Router, `optimizePackageImports` for icon tree-shaking, database indexes
(including trigram indexes for fuzzy search), and an OpenNext config ready to
plug in KV/R2-backed incremental caching.

## Directory conventions

| Path                    | Contains                                              |
| ----------------------- | ---------------------------------------------------- |
| `src/app/(auth)/`       | Unauthenticated routes (login, signup)               |
| `src/app/(app)/`        | Authenticated app shell and feature routes           |
| `src/lib/<domain>/`     | Pure logic for a domain (no React)                   |
| `src/modules/<name>/`   | A feature module's UI                                |
| `src/components/ui/`    | Generic, reusable UI primitives                      |
| `src/types/`            | Shared types, including generated DB types           |
| `supabase/migrations/`  | Ordered SQL migrations                               |

## Extending the app

To add a new module (e.g. the Encounter Builder):

1. Add an entry to `src/modules/registry.ts`.
2. Create `src/lib/encounters/` for pure logic and cover it with tests.
3. Create `src/modules/encounters/` for the UI.
4. Add a route at `src/app/(app)/tools/encounters/page.tsx`.
5. If it introduces new data, add a migration and the matching RLS policies, and
   add any new capability to `src/lib/permissions.ts`.

See [MODULES.md](./MODULES.md) for the module contract in detail.
