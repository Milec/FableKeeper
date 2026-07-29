# FableKeeper

**An all-in-one Pathfinder Second Edition (PF2E) campaign management platform for Game Masters and their players.**

FableKeeper unites worldbuilding, character management, encounter design, rollable tables, and interactive maps into a single fast, modern, dark-mode-first workspace. It draws inspiration from the strengths of MythScribe, World Anvil, Pathbuilder, Foundry VTT, Obsidian, and Notion — combined into an original tool built specifically for PF2E.

> This is an independent, unofficial project. Pathfinder is a trademark of Paizo Inc. FableKeeper is not affiliated with or endorsed by Paizo.

---

## Status

FableKeeper is being built iteratively. **Phases 1–4 are implemented** in this repository.

**Phase 1 — Foundation**
- ✅ Project setup — Next.js (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query, Zod, Framer Motion
- ✅ Authentication — email/password + Google & Discord OAuth via Supabase
- ✅ Database schema — PostgreSQL with Row Level Security
- ✅ User roles & permissions — Owner, Game Master, Assistant GM, Player, Viewer (per campaign)
- ✅ Core layout & navigation — app shell, sidebar, dark-mode-first theming
- ✅ Shared UI component library (shadcn/ui primitives)
- ✅ A complete, unit-tested **dice engine** and interactive dice roller (a working reference module)
- ✅ Cloudflare Workers deployment via the OpenNext adapter

**Phase 2 — World Builder & Wiki**
- ✅ Worlds within a campaign, and a wiki of typed entries (nations, cities, NPCs, items, lore, …) across 25 entry types
- ✅ Markdown rich-text editing with live preview
- ✅ Obsidian-style `[[wiki links]]` with automatic **backlinks** ("Linked from")
- ✅ GM **secret** entries, hidden from players by Row Level Security
- ✅ Tags, and a type-filtered entry browser
- ✅ **Global search** — a full search page plus a ⌘K command palette, both RLS-scoped so players never see secrets

**Phase 3 — Character & Campaign Managers**
- ✅ PF2E **character sheets** — identity, ability scores with modifiers, defenses, feats, and a markdown notes/journal, with multiple characters per user
- ✅ **Pathbuilder import** (paste JSON export) and **character export** (download JSON)
- ✅ **Image storage** — portraits and other campaign media uploaded to Supabase Storage, with uploads restricted to campaign members by RLS
- ✅ **Session tracker** with dated recap notes and GM-only planning sessions
- ✅ **Quest tracker** grouped by status (active / on hold / completed / failed), with GM-secret quests
- ✅ Per-campaign section navigation (Overview · Characters · Sessions · Quests)

**Phase 4 — Generators**
- ✅ **NPC Generator** — personality, ideals/bonds/flaws, appearance, voice, biography, plot hooks, and a portrait prompt
- ✅ **Name Generator** — people (by ancestry), settlements, taverns, and ships, with saved favorites
- ✅ **Shop Generator** — a keeper, description, and priced inventory that scales to settlement size and level
- ✅ **Backstory Generator** — summary, full history, future goals, and adventure hooks
- ✅ All generators are **deterministic** (seedable), copy out as **markdown** for the World Builder, and run with no external services

See the [roadmap](#roadmap) for what comes next.

---

## Tech stack

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| Framework    | [Next.js 15](https://nextjs.org) (App Router, React Server Components)      |
| Language     | TypeScript (strict)                                                         |
| UI           | React 18, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com), Framer Motion   |
| Data / forms | TanStack Query, React Hook Form, Zod                                        |
| Backend      | [Supabase](https://supabase.com) — Auth, PostgreSQL, RLS, Realtime, Storage |
| Deployment   | [Cloudflare Workers](https://workers.cloudflare.com) via `@opennextjs/cloudflare`, CDN, R2 |
| Testing      | Vitest                                                                      |

---

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)
- (For deployment) a Cloudflare account

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in your Supabase URL and anon key. To enable Google/Discord login, configure
those providers in your Supabase dashboard (Authentication → Providers).

### 3. Set up the database

Apply the migrations in [`supabase/migrations`](./supabase/migrations) to your
Supabase project. Either use the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

…or paste the SQL from `0001_init.sql` then `0002_rls.sql` into the Supabase SQL
editor, in order. See [docs/DATABASE.md](./docs/DATABASE.md) for schema details.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Script              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the dev server                           |
| `npm run build`     | Production build                               |
| `npm run typecheck` | Type-check without emitting                    |
| `npm run test`      | Run the Vitest suite                           |
| `npm run lint`      | Lint                                           |
| `npm run preview`   | Build + preview on the Cloudflare Workers runtime |
| `npm run deploy`    | Build + deploy to Cloudflare Workers           |

---

## Project structure

```
src/
├─ app/
│  ├─ (auth)/           # Login, signup, OAuth (route group, unauthenticated)
│  ├─ (app)/            # Authenticated app shell: dashboard, tools
│  ├─ auth/callback/    # OAuth / email-confirmation callback route
│  ├─ layout.tsx        # Root layout (fonts, providers)
│  └─ page.tsx          # Marketing landing page
├─ components/
│  ├─ ui/               # shadcn/ui primitives (Button, Card, …)
│  ├─ layout/           # App shell pieces (sidebar, user menu)
│  └─ providers.tsx     # Theme + TanStack Query providers
├─ lib/
│  ├─ supabase/         # Browser, server, and middleware Supabase clients
│  ├─ dice/             # The dice engine (pure, unit-tested)
│  ├─ permissions.ts    # Role & capability matrix (mirrors RLS)
│  ├─ auth.ts           # Server-side auth/session helpers
│  └─ utils.ts          # Shared utilities
├─ modules/             # Feature modules (registry + implementations)
├─ types/               # Shared TypeScript types (incl. DB types)
└─ middleware.ts        # Session refresh + route protection

supabase/migrations/    # SQL schema & RLS policies
docs/                   # Architecture, database, deployment, module docs
```

---

## Architecture at a glance

FableKeeper is built around a **modular architecture** (see
[`src/modules/registry.ts`](./src/modules/registry.ts)). Every major feature is a
self-contained module; navigation, dashboards, and search scopes are derived
from the registry so new modules can be added without refactoring existing code.

Data access is protected at the database layer with **Row Level Security**. The
role/permission matrix lives in [`src/lib/permissions.ts`](./src/lib/permissions.ts)
and is mirrored by the RLS policies, so the UI and the database enforce the same
rules — players only ever see what a GM intentionally reveals.

For the full picture, read:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/DATABASE.md](./docs/DATABASE.md)
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- [docs/MODULES.md](./docs/MODULES.md)

---

## Roadmap

FableKeeper is developed in phases. **Phase 1 is complete.**

| Phase | Focus                                                              | Status         |
| ----- | ----------------------------------------------------------------- | -------------- |
| 1     | Setup, auth, schema, permissions, layout, shared UI, dice engine  | ✅ Done        |
| 2     | World Builder, wiki, search, relationships/backlinks              | ✅ Done        |
| 3     | Character Manager, Campaign Manager, image storage               | ✅ Done        |
| 4     | NPC / Shop / Name / Backstory generators                          | ✅ Done        |
| 5     | Encounter Builder, Rollable Tables (dice engine ready)            | 🔜 Next        |
| 6     | Interactive maps, AI-assisted generation, performance, polish     | Planned        |

Future modules the architecture is designed to accommodate include a Bestiary
Manager, Kingdom Management, Hex Crawl tools, a Discord bot, and offline support.

---

## License

[MIT](./LICENSE) — see the file for details. Pathfinder and PF2E rules content
referenced by the application remain the property of Paizo Inc. under the
Pathfinder [Community Use Policy](https://paizo.com/community/communityuse) and
ORC/OGL as applicable.
