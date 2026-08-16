# Fridge Tracker — Presentation Deck

> 10–15 minute university presentation · 11 slides.
> Presenter notes are under each slide. Live demo (slide 4) follows
> [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

---

## Slide 1 — Fridge Tracker

**Know what's in your fridge — and what to buy again.**

- Scan Israeli grocery barcodes with your phone camera
- Track how much of each item is left: Full → ¾ → ½ → ¼ → Finished
- Get a restock list built from what actually ran out

_Notes: 30 seconds. One sentence on what it is, then straight to the problem._

---

## Slide 2 — The problem & who it's for

**The problem**

- You're at the store and can't remember: is there milk left? How much?
- Shopping lists are manual, forgotten, and never reflect the fridge
- "Did we finish the cottage cheese?" is a phone call, not a lookup

**Target users**

- Israeli households and roommates who share groceries
- Anyone who shops 1–3×/week and wants a zero-effort inventory

**Value**

- Less duplicate buying and fewer "we're out" surprises
- The restock list writes itself from real consumption events

_Notes: ~1 min. Emphasize the Israeli-market angle — local products, Hebrew
names, local barcodes — which drove the technical strategy on slide 6._

---

## Slide 3 — What the MVP does

- **Add:** camera barcode scan · Hebrew catalog search · manual entry
- **Track:** per-unit quarter steps (Full/¾/½/¼/Finished) with undo
- **Restock:** running-low + recently-finished lists, one-tap restock to a
  fresh unit, recent-activity history
- Email/password accounts; each user sees only their own fridge

_Notes: ~1 min. This is the feature map; the demo proves it next._

---

## Slide 4 — Live demo (5–6 min)

Follow `DEMO_SCRIPT.md`:

login → fridge → scan/search Bamba → add 2 units → consume ¼ steps →
finish one → restock page → one-tap restock → manual product → barcode
edge cases

_Notes: the script has timed steps and three fallback paths (camera, network,
OFF outage). The primary path needs only the seeded catalog._

---

## Slide 5 — Architecture

```
Browser (Next.js React UI + barcode scanner WASM)
   │  supabase-js (anon key + user JWT)          │ server components /
   ▼                                              ▼ server actions
Supabase Postgres ◄── Row Level Security ──  Next.js server (Vercel, fra1)
   ▲
   └── GoTrue auth (email/password, JWT cookies via @supabase/ssr)

Barcode resolution: normalize GTIN → local seeded catalog (~7,490 items)
                    → Open Food Facts fallback → manual entry
```

- Next.js 16 App Router on Vercel (Frankfurt functions), Supabase Postgres
- **The database is the authorization boundary** — RLS on every table
- Scanner runs fully client-side: camera → ZXing WASM (self-hosted) → GTIN

_Notes: ~1.5 min. Stress the trust model: the anon key is public by design;
policies, not the web tier, isolate users._

---

## Slide 6 — Database model

Three tables:

- `products` — shared read-only catalog + user-created rows
  (`source: catalog | off | user`, `created_by`)
- `fridge_items` — one row per physical unit, `remaining_percent`
  ∈ {100, 75, 50, 25, 0}, `finished_at` timestamp
- `consumption_events` — append-only history
  (`delta_percent`, `remaining_after`)

Derivations (low/finished/restock/activity) are computed, not stored —
no denormalized state to drift.

_Notes: ~1 min. Mention indexes on (user_id, finished_at) and barcode._

---

## Slide 7 — The Israeli barcode/product strategy

- EAN-13 `729…` codes and Hebrew names ⇒ global product APIs are weak here
- **Seeded local catalog:** ~7,490 products from Shufersal's statutory
  price-transparency data (committed CSV, reproducible fetch script)
- Lookup chain: **local catalog (fast, reliable) → Open Food Facts (ODbL,
  attributed) → manual entry (always works)**
- Store-internal/weighed codes (`2xx…` RCN) are detected and routed straight
  to manual entry with guidance
- Leading zeros preserved (barcodes are TEXT, never numbers)

_Notes: ~1.5 min. This is the most distinctive engineering decision — the
demo never depends on a third-party API._

---

## Slide 8 — Security

- Supabase Auth (email/password, JWT in cookies); every query runs as the user
- **RLS on all tables** — ownership checks in SQL, e.g. users can only insert
  consumption events that reference *their own* fridge items (gap found in
  the Wave 4 audit, fixed and regression-tested in Wave 5)
- Catalog rows immutable to users; `created_by`/`source` forgery blocked
- Zod validation at every boundary; parameterized queries only (PostgREST)
- Image URLs allow-listed at render time **and** by a DB CHECK constraint
- Verified empirically: a signed-in attacker replayed the full cross-user
  matrix (read/update/delete/insert-forgery) — all blocked

_Notes: ~1.5 min. If asked: service-role key never ships to the app or
Vercel; it is used once, locally, for seeding._

---

## Slide 9 — Testing

- **318 Vitest unit/integration tests** — barcode math (normalize/check
  digit/RCN), lookup chain, fridge derivations, schemas, server actions
- **8 Playwright E2E tests** — auth boundaries, full fridge lifecycle,
  barcode edge cases, Hebrew catalog search, and a two-user RLS attack matrix
- CI on every push: lint, typecheck, unit tests, credential-free E2E
- Manual acceptance: physical-phone camera checklist + 4-viewport
  responsive QA

_Notes: ~1 min. The RLS attack matrix runs in E2E with two real users — the
security claims are executable, not aspirational._

---

## Slide 10 — Scalability

- Reads are per-user and index-backed ⇒ fridge queries stay O(user's items),
  measured with EXPLAIN ANALYZE (see `docs/SCALABILITY.md`)
- Catalog search: trigram/ILIKE over 7.5k rows today; the documented path is
  `pg_trgm` GIN → FTS as the catalog grows 10–100×
- Append-only events table grows linearly; queried by (user, recency) index
- Stateless web tier on Vercel scales horizontally; Supabase managed Postgres
  has a clear upgrade path (connection pooling, read replicas)

_Notes: ~1 min. One honest sentence: at university-demo scale nothing here is
stressed; the doc shows where the first bottleneck would appear and the fix._

---

## Slide 11 — Limitations & future work

**Known limitations**

- Quarter-step estimates, no expiry dates, single-user fridges
- One seeded chain (Shufersal) + OFF fallback; niche items → manual entry
- Demo auth config: email confirmation off (production: SMTP + confirmation)

**Future work (deliberately out of MVP)**

- Household sharing · expiry tracking · weekly email digest ·
  second retailer catalog · PWA/offline · nutrition data

_Notes: ~1 min. Close with: stable MVP, live on Vercel, fully tested — happy
to take questions._
