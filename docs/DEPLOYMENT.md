# Deployment

FableKeeper deploys to **Cloudflare Workers** using the modern
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter (not
Cloudflare Pages), with the GitHub repository as the deployment source.

## Overview

| Concern            | Service                                                     |
| ------------------ | ---------------------------------------------------------- |
| App runtime        | Cloudflare Workers (via OpenNext)                           |
| Static assets/CDN  | Cloudflare's edge (`[assets]` binding in `wrangler.toml`)   |
| Auth & database    | Supabase                                                    |
| Large media (opt.) | Cloudflare R2 and/or Cloudflare Images                      |

Key config files:

- [`wrangler.toml`](../wrangler.toml) — Worker name, assets, vars, bindings.
- [`open-next.config.ts`](../open-next.config.ts) — OpenNext adapter config.
- [`next.config.mjs`](../next.config.mjs) — calls `initOpenNextCloudflareForDev()`
  so bindings work under `next dev`.

## Prerequisites

- A Cloudflare account and an API token with **Workers** edit permission.
- A configured Supabase project (URL + anon key).

## Environment variables & secrets

**Public** build-time values go in `wrangler.toml` under `[vars]`. **Secrets**
must never be committed — set them with Wrangler:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GEMINI_API_KEY      # optional — AI Assist only
```

The public Supabase values are needed at build time. Provide them via your CI/CD
environment or a local `.env.local` (they are safe to expose; RLS protects data):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Deploying from the CLI

```bash
# Authenticate once
npx wrangler login

# Build with the OpenNext adapter and deploy
npm run deploy
```

`npm run deploy` runs `opennextjs-cloudflare build` (which runs `next build`
first) and then `opennextjs-cloudflare deploy`.

To test the Workers runtime locally before deploying:

```bash
npm run preview
```

## Deploying from GitHub (repository as source)

You can wire up continuous deployment so pushes to the default branch deploy
automatically. Two common approaches:

1. **Cloudflare Workers Builds** — connect the repo in the Cloudflare dashboard
   (Workers & Pages → your Worker → Builds), set the build command to
   `npx opennextjs-cloudflare build` and the deploy command to
   `npx opennextjs-cloudflare deploy`, and add the `NEXT_PUBLIC_SUPABASE_*`
   build variables and secrets there.

2. **GitHub Actions** — run `npm ci && npm run deploy` with
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set as repository secrets.

## Optional bindings

`wrangler.toml` includes commented-out bindings you can enable as later phases
need them:

- **KV** (`NEXT_INC_CACHE_KV`) — Next.js incremental cache for ISR/revalidation.
- **R2** (`MEDIA_BUCKET`) — user-uploaded maps, portraits, and handouts.

After creating the resource (`wrangler kv namespace create …` /
`wrangler r2 bucket create …`), uncomment the binding and, for the cache, wire it
into `open-next.config.ts`.

## Supabase configuration for production

- Set your production URL in Supabase Auth **Site URL** and **Redirect URLs**
  (add `https://<your-domain>/auth/callback`).
- Configure Google and Discord OAuth providers with their production redirect
  URIs.
- Apply migrations to the production project (`supabase db push`).

## Runtime notes

- The app targets the Workers runtime; `wrangler.toml` sets `nodejs_compat`.
- Middleware (`src/middleware.ts`) runs on every request to refresh sessions —
  keep it lean.
