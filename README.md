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

## Status: Wave 3 (integrated MVP)

The full flow works end to end: camera scan → barcode
normalization/classification → local catalog lookup → Open Food Facts
fallback → product confirmation → add units to the fridge → consume
(Full → ¾ → ½ → ¼ → Finished) → restock. Also implemented: catalog text
search, manual product entry (the fallback for unknown/store-internal
barcodes), the restock page (running low · finished recently · recent
activity), and a ~7,490-product seeded Israeli catalog
(`data/catalog-seed.csv`, Shufersal price-transparency data).

Camera scanning needs a browser with camera access over HTTPS (or
`localhost`). The ZXing WASM decoder is self-hosted: `scripts/sync-zxing-wasm.mjs`
copies the installed `zxing-wasm` binary into `public/wasm/` automatically
before every `dev` / `test` / `build` run, and the scanner loads it from our
own origin — no CDN at runtime.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase
(Postgres + Auth, `@supabase/ssr`) · Zod v4 ·
`@yudiel/react-qr-scanner` (barcode-detector + zxing-wasm) · Vitest · ESLint ·
Vercel. UI primitives, icons (Lucide glyphs), and toasts are small in-repo
components — no shadcn/sonner/lucide-react packages.

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

The `SUPABASE_SERVICE_ROLE_KEY` is used ONLY by the local catalog seed script
(step 3) — it must never be committed or set on Vercel.

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

### 3. Seed the Israeli catalog

Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Project Settings → API →
`service_role` key), then:

```bash
npm run seed:db   # upserts data/catalog-seed.csv (~7,490 products)
```

The committed CSV was built from Shufersal's statutory price-transparency
files; `npm run seed:fetch` regenerates it (needs access to the Israeli
portal and is never required for grading — the CSV is committed).

### 4. Verify

Sign up at `/signup`, land on the (empty) `/fridge`. Logged-out visits to
`/fridge`, `/add`, or `/restock` redirect to `/login`. On `/add`, searching
"במבה" should hit the seeded catalog, and scanning/typing barcode
`7290000066318` should resolve without calling Open Food Facts.

## Scripts

```bash
npm run dev          # dev server (auto-syncs the scanner WASM binary first)
npm run build        # production build (same auto-sync)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (single run; same auto-sync)
npm run test:watch   # Vitest (watch)
npm run seed:db      # seed/upsert the product catalog into Supabase
npm run seed:fetch   # regenerate data/catalog-seed.csv from the retailer portal
npm run wasm:sync    # manually copy zxing_reader.wasm into public/wasm/
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, and unit tests on every
push and pull request.

## Deployment (Vercel)

1. Push this repo to GitHub and import it in Vercel (framework preset:
   Next.js — no custom build settings needed; `prebuild` syncs the scanner
   WASM binary automatically).
2. Set two environment variables in the Vercel project:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Do **not** set the service-role key on Vercel.
3. Deploy. Camera scanning requires HTTPS, which Vercel provides by default —
   verify `/add` → Scan → "Enable camera" on a real phone, and that
   `https://<your-app>/wasm/zxing_reader.wasm` is served (the self-hosted
   decoder).

## Project structure

```
src/
  app/                  # App Router: (auth) login/signup, (app) fridge/add/restock, api/, scan-test
  components/
    app-shell/          # top bar, bottom nav, toaster
    fridge/             # inventory, add flow (scan/search/manual), restock components
    scanner/            # BarcodeScanner island, state machine, UPC-E expansion, WASM config
    ui/                 # hand-vendored shadcn-style primitives (button, input, badge, modal, skeleton)
  lib/
    types.ts            # FROZEN shared domain + contract types
    schemas.ts          # FROZEN Zod boundary schemas
    routes.ts           # FROZEN route map + gating predicates
    barcode/            # GTIN domain: normalize · check digit · classify (RCN)
    products/           # lookup chain, search, Open Food Facts client, categorization
    fridge/             # derivations (low/finished/activity), formatting, mappers, queries
    actions/            # server actions (fridge CRUD, manual product)
    supabase/           # server / browser / proxy-session clients
  proxy.ts              # session refresh + route gating (Next 16 network boundary)
scripts/                # catalog fetch/seed + WASM sync
data/catalog-seed.csv   # committed Israeli catalog (~7,490 products)
supabase/migrations/    # FROZEN schema + RLS (reviewable SQL)
```

Files marked FROZEN are shared contracts: Wave 2 agents build against them and
must not modify them independently (see `docs/IMPLEMENTATION_PLAN.md` §21).
