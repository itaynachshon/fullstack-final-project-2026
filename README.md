# Fridge Tracker

Know what is in your fridge and what to buy again — scan Israeli product
barcodes, track how much of each item is left (100/75/50/25/0%), and get a
restock list built from what actually ran out.

University Fullstack course project. The full product and technical design
lives in [`docs/`](docs/):

- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — what we're building and why
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system components and data flow
- [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) — schema, contracts, flows
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — wave-by-wave build plan

## Status: Wave 1 (foundation)

Implemented: project skeleton, Supabase auth (login/signup/logout), protected
routes, the complete MVP database schema + RLS migration, CI, and the frozen
TypeScript/API contracts that Wave 2 builds against.

Not yet implemented (Wave 2+): barcode scanning and lookup, catalog search and
seeding, fridge CRUD, consume/restock flows. The `/add` and `/restock` pages
are intentional placeholders, and the API routes return contract-shaped stub
responses.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase
(Postgres + Auth, `@supabase/ssr`) · Zod v4 · Vitest · ESLint · Vercel.

## Local setup

Prereqs: Node 20.9+ (CI uses 22), npm, and a free
[Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env.local   # then fill in the two values, see below
npm run dev                  # http://localhost:3000
```

### 1. Supabase project configuration

1. Create a project at [database.new](https://database.new).
2. In **Project Settings → API**, copy the Project URL and the `anon` public
   key into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. In **Authentication → Sign In / Providers → Email**, disable
   **"Confirm email"** (approved MVP behavior: signup logs you in
   immediately).

The `SUPABASE_SERVICE_ROLE_KEY` line in `.env.example` stays empty for now —
it is used only by the local catalog seed script that arrives in Wave 2, and
must never be committed or set on Vercel.

### 2. Apply the database migration

Option A — Supabase CLI (recommended):

```bash
supabase init            # creates supabase/config.toml (not committed)
supabase link --project-ref <your-project-ref>
supabase db push         # applies supabase/migrations/*.sql
```

Option B — dashboard: open the SQL Editor, paste the contents of
`supabase/migrations/20260815000000_initial_schema.sql`, run it once.

The migration creates `products`, `fridge_items`, and `consumption_events`
with Row Level Security enabled and all policies — RLS is the authorization
layer for the whole app.

### 3. Verify

Sign up at `/signup`, land on the (empty) `/fridge`. Logged-out visits to
`/fridge`, `/add`, or `/restock` redirect to `/login`.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch)
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, and unit tests on every
push and pull request.

## Deployment (Vercel)

1. Push this repo to GitHub and import it in Vercel (framework preset:
   Next.js — no custom build settings needed).
2. Set two environment variables in the Vercel project:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Do **not** set the service-role key on Vercel.
3. Deploy. Expected result: visiting the production URL redirects to
   `/login`; after signing up you land on the protected empty `/fridge`.

## Project structure (Wave 1)

```
src/
  app/                  # App Router: (auth) login/signup, (app) fridge/add/restock, api/
  components/           # auth forms, app shell (header, bottom nav)
  lib/
    types.ts            # FROZEN shared domain + contract types
    schemas.ts          # FROZEN Zod boundary schemas
    routes.ts           # FROZEN route map + gating predicates
    actions/            # server-action signatures (stubs until Wave 2)
    supabase/           # server / browser / proxy-session clients
  proxy.ts              # session refresh + route gating (Next 16 network boundary)
supabase/migrations/    # FROZEN schema + RLS (reviewable SQL)
```

Files marked FROZEN are shared contracts: Wave 2 agents build against them and
must not modify them independently (see `docs/IMPLEMENTATION_PLAN.md` §21).
