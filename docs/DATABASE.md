# Database schema

FableKeeper uses Supabase (PostgreSQL). The Phase 1 schema is defined by two
ordered migrations:

- [`0001_init.sql`](../supabase/migrations/0001_init.sql) — extensions, enums,
  tables, triggers, and helper functions.
- [`0002_rls.sql`](../supabase/migrations/0002_rls.sql) — Row Level Security
  policies.

Apply them in order (see the README for CLI vs. SQL-editor instructions).

## Entity overview

```
auth.users ──1:1── profiles
     │
     │ owns
     ▼
 campaigns ──1:N── campaign_members ──N:1── auth.users
     │        └─── campaign_invites
     │
     │ 1:N
     ▼
   worlds ──1:N── world_entries ──N:N── world_entries   (via entry_links)
```

## Tables

### `profiles`
One row per authenticated user, created automatically by the `handle_new_user`
trigger on `auth.users` insert. Holds display name and avatar.

### `campaigns`
A campaign owned by a user. `slug` is unique per owner. The `system` column
defaults to `pf2e` to leave room for future systems. Creating a campaign fires
the `add_owner_membership` trigger, which inserts the owner into
`campaign_members` with the `owner` role.

### `campaign_members`
The heart of authorization: maps `(campaign_id, user_id) → role`. `role` is the
`campaign_role` enum: `owner`, `game_master`, `assistant_gm`, `player`,
`viewer`. Unique on `(campaign_id, user_id)`.

### `campaign_invites`
Pending email invitations with a role, a random `token`, and an expiry. Consumed
when the invited user accepts (Phase 3 flow).

### `worlds`
A campaign can contain one or more worlds. `slug` is unique per campaign.

### `world_entries`
The World Builder / wiki documents. A single flexible table backs every entry
`type` (`nation`, `city`, `npc`, `item`, `article`, …) so new entry kinds are an
enum addition, not a schema migration. Notable columns:

- `content jsonb` — rich-text document (editor-agnostic).
- `is_secret boolean` — GM-only entries hidden from players by RLS.
- `tags text[]` — GIN-indexed for tag filtering.
- Title is trigram-indexed (`pg_trgm`) to power fuzzy global search in Phase 2.

### `entry_links`
Directed links between entries, enabling Obsidian-style backlinks. Unique on
`(source, target)` and forbids self-links.

## Helper functions

Defined `SECURITY DEFINER` so RLS policies can call them without recursion:

| Function                        | Returns          | Purpose                                   |
| ------------------------------- | ---------------- | ----------------------------------------- |
| `campaign_role(uuid)`           | `campaign_role`  | Caller's role in a campaign (or null)     |
| `is_campaign_member(uuid)`      | `boolean`        | Is the caller a member?                   |
| `can_edit_campaign(uuid)`       | `boolean`        | Owner / GM / Assistant GM?                |
| `can_view_secrets(uuid)`        | `boolean`        | May the caller see GM secrets?            |

## Row Level Security

RLS is enabled on every table. The policies mirror
[`src/lib/permissions.ts`](../src/lib/permissions.ts). Summary:

| Table              | Read                                             | Write                                  |
| ------------------ | ------------------------------------------------ | -------------------------------------- |
| `profiles`         | any authenticated user                           | self only                              |
| `campaigns`        | members                                           | owner (update/delete); self (create)   |
| `campaign_members` | members                                           | owner/GM; self can leave               |
| `campaign_invites` | owner/GM                                          | owner/GM                               |
| `worlds`           | members                                           | owner/GM/assistant                     |
| `world_entries`    | members (secrets: only secret-viewers)           | owner/GM/assistant                     |
| `entry_links`      | when the source entry is visible to the caller   | editors of the source entry            |

The `world_entries` read policy is the key privacy guarantee: a non-secret entry
is visible to any campaign member, but a `is_secret = true` entry is visible only
to Owners, GMs, and Assistant GMs.

### Hardening

[`0003_security_hardening.sql`](../supabase/migrations/0003_security_hardening.sql)
tightens the exposed API surface to clear the Supabase database linter:

- Pins `search_path` on `set_updated_at`.
- Revokes `EXECUTE` on the trigger functions (`set_updated_at`,
  `handle_new_user`, `add_owner_membership`) from all API roles — triggers run
  regardless, so they never need to be callable as RPCs.
- Revokes `EXECUTE` on the four RLS helpers from `anon` (policies are
  `to authenticated`).
- Moves the `pg_trgm` extension out of `public` into the `extensions` schema.

The linter still reports the four RLS helper functions as executable by
`authenticated` — this is **intentional and required**: RLS policies evaluate
those functions in the caller's role, so `authenticated` must keep `EXECUTE`.
They only ever reveal the caller's *own* membership (via `auth.uid()`), so the
exposure leaks nothing a user cannot already determine about themselves.

## Regenerating TypeScript types

The types in [`src/types/database.ts`](../src/types/database.ts) are
hand-authored to match these migrations. Once the schema stabilizes, regenerate
them to stay perfectly in sync:

```bash
supabase gen types typescript --linked > src/types/database.ts
```

## Migration conventions

- Migrations are numbered and applied in order; never edit an already-applied
  migration — add a new one.
- Each new table must ship with RLS enabled in the same or an adjacent migration.
- Prefer `SECURITY DEFINER` helper functions over duplicating membership logic
  inside policies.
