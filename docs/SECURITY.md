# Fridge Tracker — Security

This document describes the security model of the **implemented** application:
what protects each layer, what was verified and how, which risks are accepted
for the MVP, and what a production deployment should add. It audits the actual
Wave 3 code and migration SQL, not the design documents.

Claims are classified three ways throughout:

| Label | Meaning |
| --- | --- |
| **Implemented** | Exists in the code/migration today and was reviewed (and where stated, empirically tested) |
| **Accepted MVP risk** | A real, understood gap we consciously ship with at university-project scale |
| **Production recommendation** | Not implemented; what we would add before serious production use |

**Verification status in one sentence:** every RLS policy and attack scenario
below was executed empirically against the real migration and the real 7,490-row
catalog in a local Postgres 16 container that emulates Supabase's RLS execution
model (same SQL, same `anon`/`authenticated` roles, same `auth.uid()`
mechanism); verification against the **hosted** Supabase project remains
pending because no live project is provisioned yet (see §18).

---

## 1. Scope

In scope: the Next.js app (pages, API routes, server actions), the Supabase
Postgres schema and RLS policies, authentication/session handling, the Open
Food Facts (OFF) integration, the barcode scanner, secrets and environment
variables, and the catalog seed pipeline.

Out of scope: Supabase's and Vercel's own platform security (managed services;
we rely on their controls), and denial-of-service resilience beyond basic
input bounds — no explicit rate limiting exists in the MVP (§8, §16).

Audited surfaces: `supabase/migrations/`, `src/proxy.ts`,
`src/lib/supabase/`, `src/lib/actions/`, `src/app/api/`, `src/lib/products/`,
`src/lib/fridge/`, `src/lib/schemas.ts`, `src/components/` (rendering paths),
`next.config.ts`, `scripts/` (seed + WASM sync), `.env.example`, `.gitignore`,
`.github/workflows/ci.yml`.

## 2. Trust boundaries

```text
UNTRUSTED                          TRUSTED (server)                 DATA
┌──────────────┐  cookies (httpOnly)  ┌──────────────────┐  anon key + user JWT  ┌──────────────────┐
│ Browser       │ ───────────────────▶│ Next.js on Vercel │ ────────────────────▶│ Supabase Postgres │
│ (any client)  │  server actions /   │  proxy.ts gate    │   RLS evaluates      │  RLS on all three │
│               │  GET JSON APIs      │  getUser() checks │   auth.uid() per row │  app tables       │
└──────────────┘                      └──────────────────┘                       └──────────────────┘
                                              │ https, 3s timeout, barcode only
                                              ▼
                                      ┌──────────────────┐
                                      │ Open Food Facts   │  untrusted input:
                                      │ (external, keyless)│  names/brands/image URLs
                                      └──────────────────┘
```

Three principles follow from this picture:

1. **Nothing from the browser is trusted.** Every input crosses a Zod schema
   on the server; every row access crosses RLS in the database. Client-side
   validation exists only for UX.
2. **The database is the authorization boundary.** The Next.js server runs
   with the *public anon key* plus the caller's JWT — it holds no privileged
   credential, so even a bug in application code cannot read another user's
   rows. Application-level auth checks exist for better error messages, not
   for protection.
3. **OFF responses are untrusted input**, sanitized at the boundary
   (`src/lib/products/offClient.ts`) like any user input.

## 3. Authentication — Implemented

Supabase Auth with email/password. The pieces, tied to files:

- **Signup / login** — `src/components/auth/AuthForm.tsx` calls
  `supabase.auth.signUp` / `signInWithPassword` from the browser client
  (`src/lib/supabase/client.ts`). Passwords are handled and stored (hashed)
  entirely by Supabase Auth; the app never sees or stores them.
- **Session storage** — `@supabase/ssr` keeps the session in **httpOnly
  cookies**, not `localStorage`, so page JavaScript (including any injected
  script) cannot read tokens.
- **Session refresh + route gating** — `src/proxy.ts` (Next.js 16's network
  boundary, the successor of `middleware.ts`) runs on every matched request
  and calls `updateSession` (`src/lib/supabase/middleware.ts`), which invokes
  `supabase.auth.getUser()`. That call *validates the JWT against the Auth
  server* (it does not merely decode the cookie), refreshes expiring tokens,
  and then gates routes: unauthenticated page requests redirect to `/login`,
  unauthenticated `/api/*` requests get JSON 401, and signed-in users are
  bounced away from `/login`–`/signup`. Route classes live in
  `src/lib/routes.ts`.
- **Server-side re-checks** — every server component that reads data, every
  server action, and both API routes call `getUser()` again on their own
  cookie-bound client (`src/lib/supabase/server.ts`). The proxy gate is a
  convenience layer; no code path trusts it alone.
- **Logout** — a server action calls `supabase.auth.signOut()`, clearing the
  cookies server-side.

**Which operations require a signed-in user — explicitly:** everything except
`/login`, `/signup`, and `/scan-test` (a hardware test page that touches no
data). All app pages (fridge, add flow, restock), both JSON APIs, and all five
mutations require authentication; on top of that, the database policies grant
rights only to the `authenticated` role, so an anonymous caller hitting
Supabase directly sees zero rows and cannot write at all (empirically
confirmed, §5 rows 14–15).

**The trust boundary point:** authentication only establishes *who* is
calling. It deliberately does not decide *what they may touch* — that is RLS
(§4). A hypothetical missing `getUser()` check would degrade error quality,
not expose data.

### Email confirmation tradeoff

- **Current MVP behavior (deliberate):** email confirmation is disabled in the
  Supabase project settings, so signup immediately yields a usable session.
  The graded live demo must not depend on email deliverability.
- **Security downside (accepted MVP risk):** possession of the email address
  is never proven; anyone can register `someone-else@example.com`. Since
  accounts only contain the fridge data the registrant creates, impact at
  project scale is low.
- **Production recommendation:** enable confirmation, send through a custom
  SMTP provider with proper SPF/DKIM, and add signup abuse protection
  (CAPTCHA / rate limits). Not enabled silently per the approved scope.

## 4. Authorization — RLS as the single enforcement layer

RLS is enabled on all three application tables
(`supabase/migrations/20260815000000_initial_schema.sql`), and **all runtime
database access goes through the anon key + caller JWT** — there is no
service-role client anywhere under `src/` (verified by search; the only
service-role usage is the local seed script, §12). Policies target the
`authenticated` role only, so the `anon` role sees zero rows everywhere
(empirically confirmed).

Actual policies, from the migration SQL (not from design docs):

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `products` | any authenticated user (shared catalog) | own rows only: `created_by = auth.uid()` **and** `source ∈ {'user','off'}` | only own `source='user'` rows (both `USING` and `WITH CHECK`) | **no policy → impossible** |
| `fridge_items` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` (both clauses) | `user_id = auth.uid()` |
| `consumption_events` | `user_id = auth.uid()` | `user_id = auth.uid()` | **no policy → impossible** | **no policy → impossible** |

Why each shape exists:

- **`products` is shared reference data** — everyone reads it; provenance
  rules keep writes honest (§6).
- **`fridge_items` is strictly private** — all four verbs filter on ownership.
- **`consumption_events` is append-only history** — the absence of UPDATE and
  DELETE policies means even the *owner* cannot rewrite their history
  (empirically confirmed: `UPDATE 0` / `DELETE 0` on the user's own event).
  Rows disappear only through `ON DELETE CASCADE` when the parent fridge item
  is deleted. Append-only keeps the activity feed trustworthy and makes the
  write path simple: one INSERT per consumption change, no reconciliation.

`user_id` on `consumption_events` is denormalized (it is derivable through
`fridge_item_id`) precisely so the RLS predicate is a direct indexed column
comparison instead of a subquery — cheaper and harder to get wrong.

## 5. User-data isolation — empirically tested attack matrix

The full matrix was executed with two real users (A, B) through the RLS
machinery (SET ROLE `authenticated` + JWT claim, exactly how PostgREST
executes queries). Results:

| # | Attack (as user B) | Result | Blocking control |
| --- | --- | --- | --- |
| 1 | List A's fridge rows (`WHERE user_id = A`) | 0 rows | RLS SELECT policy |
| 2 | Read A's item by exact UUID | 0 rows | RLS SELECT policy |
| 3 | `setRemaining`-shaped UPDATE on A's item UUID | `UPDATE 0` | RLS UPDATE `USING` |
| 4 | DELETE A's item by UUID | `DELETE 0` | RLS DELETE `USING` |
| 5 | INSERT fridge item with `user_id = A` | error `42501` | RLS INSERT `WITH CHECK` |
| 6 | INSERT product with `created_by = A` | error `42501` | RLS INSERT `WITH CHECK` |
| 7 | INSERT product with `source = 'catalog'` | error `42501` | RLS INSERT `WITH CHECK` |
| 8 | UPDATE a seeded catalog row | `UPDATE 0` | RLS UPDATE `USING` |
| 9 | UPDATE A's manual product | `UPDATE 0` | RLS UPDATE `USING` |
| 10 | DELETE any product | `DELETE 0` | no DELETE policy |
| 11 | Read A's consumption events | 0 rows | RLS SELECT policy |
| 12 | INSERT event with `user_id = A` | error `42501` | RLS INSERT `WITH CHECK` |
| 13 | UPDATE/DELETE B's **own** event | 0 rows | no UPDATE/DELETE policy (append-only) |
| 14 | Unauthenticated (anon role) read of all 3 tables | 0 / 0 / 0 rows | no policy targets `anon` |
| 15 | Anon INSERT into products | error `42501` | no policy targets `anon` |

Note the two distinct failure modes, which the server actions rely on:
statements that *filter* rows (SELECT/UPDATE/DELETE) silently match nothing —
the app reports "Item not found" — while statements that *create* rows
violating a `WITH CHECK` raise SQL error `42501`, which the app maps to a
generic failure message. Neither mode reveals whether the target row exists.

**Defense in depth on top of RLS:** the server actions never accept a user id
from the client at all — `user_id` is always taken from the server-side
session (`user.id` from `getUser()`), and reads simply omit user filters,
letting RLS scope them. So "forge someone else's user id" is not even
expressible through the app's API; the matrix rows above attack the database
layer directly, and it holds on its own.

### One confirmed integrity gap — Accepted MVP risk

The `consumption_events` INSERT policy checks only `user_id = auth.uid()` — it
does **not** verify that `fridge_item_id` references a fridge item the caller
owns. Empirically confirmed against the real migration:

- B **can** insert an event with `user_id = B` but `fridge_item_id` = A's
  item UUID (`INSERT 0 1`). The FK to `fridge_items` passes because foreign
  keys are checked with table-owner rights, bypassing RLS.
- Because the FK errors (`23503`) only for *nonexistent* UUIDs, this doubles
  as a **UUID existence oracle**: an attacker who somehow obtained a candidate
  UUID could confirm whether it is a real fridge item.

Measured impact is contained, also empirically: B still cannot read the
referenced item (0 rows); A never sees the junk event (its `user_id` is B, so
A's activity feed excludes it); and when A deletes their item the cascade
removes the junk row. The app itself never sends such a request — it is only
reachable by hand-crafted PostgREST calls, requires guessing random v4 UUIDs,
and pollutes only the attacker's own history.

**Production recommendation:** extend the INSERT policy with an ownership
subquery — `fridge_item_id IN (SELECT id FROM fridge_items WHERE user_id =
auth.uid())`. Not applied now because the Wave 1 migration is a frozen
contract and the exploit yields no data access; it is the first schema change
Wave 5 should batch.

## 6. Product catalog permissions

The catalog is shared by design: seeded rows (`source='catalog'`,
`created_by IS NULL`, inserted only by the local service-role seed script),
cached OFF rows (`source='off'`, written under the *scanning user's* JWT —
no privileged key at runtime), and manual rows (`source='user'`).

What the policies enforce (all rows verified in the matrix above): users
cannot modify or delete seeded rows, cannot touch other users' manual rows,
cannot forge `source='catalog'`, and cannot attribute rows to someone else.
The `products_source_valid` CHECK rejects unknown provenance values outright.

**Shared user-created catalog — Accepted MVP risk.** Any authenticated user
can add a product that every other user can find in search: junk names,
offensive text, duplicates, or a wrong-but-plausible name attached to a real
barcode (the `products_barcode_key` unique index at least guarantees a GTIN
can only be claimed once — confirmed `23505` on duplicate insert). There is no
moderation layer; for a small university cohort this is acceptable, and rows
are creator-attributed (`created_by`) so abuse is traceable.
**Production recommendation:** private-by-default custom products, a
moderation/approval flow, or trust scoring — explicitly out of MVP scope.

## 7. Server actions — Implemented

All five mutations (`addToFridge`, `setRemaining`, `deleteItem`,
`restockItem` in `src/lib/actions/fridge.ts`; `createManualProduct` in
`src/lib/actions/products.ts`) follow one audited pattern:

1. `"use server"` module — Next.js compiles these to POST-only RPC endpoints;
   they are not reachable via GET (§16 covers CSRF).
2. `getUser()` first; unauthenticated callers get a uniform
   `{ ok: false, error: "Not signed in." }`.
3. Zod parse of the raw argument (`src/lib/schemas.ts`); malformed input gets
   a generic validation message.
4. Writes bind ownership to the session: inserts set
   `user_id: user.id` / `created_by: user.id`; updates/deletes filter
   `.eq("user_id", user.id)` *in addition to* RLS.
5. Database errors are logged server-side (`console.error`) and replaced with
   generic strings; no raw error, SQL detail, or stack trace crosses to the
   client (§17).

Also verified: no service-role client import anywhere in `src/`; no
state-changing GET route exists; nothing logs secrets or session tokens.

Two design notes documented for honesty: `setRemaining` writes the item
update and the history event as two sequential statements with a best-effort
compensation (not a transaction — PostgREST offers none without an RPC), so a
mid-flight crash could lose one history event; acceptable for a consumption
log. And `restockItem` resets `remaining_percent` to 100 on the *same row*
(per spec) rather than creating a new unit row.

## 8. API routes — Implemented

`GET /api/products/lookup?barcode=…` and `GET /api/products/search?q=…&page=…`
(`src/app/api/products/*/route.ts`) are the only route handlers. Both are
read-only JSON endpoints that: require `getUser()` (401 otherwise — also
pre-gated by the proxy), Zod-validate query params (400 with a static message),
and catch everything else into a generic 500. Verified: no stack traces or
upstream error bodies in any response; OFF failures inside lookup degrade to
`{ found: false }` (200) so the client flow continues to manual entry.

Neither endpoint accepts a URL, hostname, or path from the caller — lookup
interpolates only a *validated, normalized barcode* into the fixed OFF URL
template, so there is no open-proxy/SSRF surface. Search passes the query
string through the Supabase client builder as a bound pattern (§10).

**No rate limiting — Accepted MVP risk.** An authenticated user can hammer
both endpoints; lookup misses also generate outbound OFF calls (bounded by a
3 s timeout and permanent caching of hits). At course scale this is fine.
**Production recommendation:** per-user/IP rate limiting at the edge,
negative caching for confirmed-unknown barcodes (§13).

## 9. Input validation — three layers, verified end to end

```text
Client (UX only)          →  re-validated on server        →  enforced by the database
React form constraints       Zod schemas (schemas.ts)         CHECK / UNIQUE / FK / RLS
```

The client layer improves UX; nothing trusts it. The Zod layer is the trust
boundary for *shape*; the database layer is the final invariant keeper that
holds even against hand-crafted PostgREST requests. Key fields:

| Field | Zod (server) | Database backstop (all empirically confirmed) |
| --- | --- | --- |
| barcode | trimmed, length + charset via barcode domain (`src/lib/barcode/`: normalization, GTIN mod-10 check digit, RCN classification) | `products_barcode_key` unique partial index → `23505` on duplicates |
| product name | 1–120 chars, trimmed | `products_name_not_empty` CHECK → `23514` on `''` |
| category | enum of the 10 canonical values | `products_category_valid` CHECK → `23514` |
| source | never client-supplied; server sets `'user'`/`'off'` | `products_source_valid` CHECK + RLS forgery block |
| remaining % | enum {0,25,50,75,100} | `fridge_items_remaining_valid` CHECK → `23514` on 37 |
| delta % | derived server-side | `consumption_events_delta_valid` CHECK → `23514` on 150 |
| unit count | int 1–24 | n/a (expands to N inserts server-side) |
| search q / page | 1–60 chars / positive int ≤ bound | n/a (read-only) |
| UUIDs | `z.uuid()` | FK + RLS ownership |
| package size / brand | bounded optional strings | column is display-only text |

One honest asymmetry: `image_url` has **no database-level length or format
constraint** (Zod and the OFF client constrain it on the app path, and §11's
render guard neutralizes hostile values on the way out). A CHECK constraint is
a candidate for the same Wave 5 migration as the §5 policy fix —
**production recommendation**, low urgency.

## 10. SQL injection — risk limited by construction

No application code concatenates user input into SQL. All queries go through
the Supabase client builder (PostgREST), which transmits filters as typed
query parameters, not SQL text; there is no raw `sql`/RPC string anywhere in
`src/` (verified by search). The one place user text meets a query *pattern* —
catalog search — escapes LIKE metacharacters first
(`escapeLikePattern` in `src/lib/products/search.ts` escapes `\`, `%`, `_`),
so `"50%"` searches for the literal string and cannot degenerate into a
match-everything pattern. The seed script's CSV path re-validates every row
against the same category/name rules before insert and talks to PostgREST,
not raw SQL.

Qualification rather than absolutism: the residual surface is PostgREST and
Postgres themselves (kept current by Supabase), not string assembly in this
codebase — there is simply no string-assembled SQL to inject into.

## 11. XSS and untrusted rendering — Implemented (one defect found and fixed)

Untrusted text reaches the UI from three sources: OFF product data, the
seeded Shufersal catalog (Hebrew names), and other users' manual products
(shared catalog). Verified:

- All of it renders through React JSX text interpolation, which HTML-escapes
  by default. There is **no** `dangerouslySetInnerHTML`, no `innerHTML`, no
  `eval`/`new Function` in `src/` (verified by search).
- No external string is used as a link `href`, style, or attribute that could
  carry a `javascript:` payload.
- Image URLs are the only untrusted *URLs* in the system, constrained twice
  (below and §12).

**Defect found by this audit — fixed now.** `products.image_url` is
app-constrained but not database-constrained (§9), and `next/image` **throws
at render time** for any host not allow-listed in `next.config.ts`. A user
inserting a product row with a hostile `image_url` via direct PostgREST would
have crashed the fridge/search UI (error boundary) for every user who viewed
that shared product — a stored data-poisoning → denial-of-rendering defect.
The fix (`src/components/fridge/image-src.ts`, wired into `ProductImage.tsx`,
with 10 unit tests): re-apply the same allow-list at render time — only
`https://images.openfoodfacts.org/...` URLs are ever handed to `next/image`;
anything else (foreign hosts, lookalike subdomains, `http:`, `javascript:`,
`data:`, relative paths, garbage) silently degrades to the category-icon
fallback that missing images already use.

## 12. Remote images — Implemented

`next.config.ts` allow-lists exactly one remote pattern:
`https://images.openfoodfacts.org/**`. This matters because `next/image`
proxies remote images through the app's optimizer — an open pattern would let
stored URLs turn the app into an image proxy and hand bandwidth/SSRF-ish
surface to attackers. Seeded and manual products have `image_url = null` and
render the deterministic category-icon fallback; OFF images are hotlinked
*pixels*, never HTML, and a load failure flips to the same fallback
(`onError` in `ProductImage.tsx`). Config was already minimal — no narrowing
needed; §11's guard now enforces the same list at render time.

## 13. External API security (Open Food Facts) — Implemented

`src/lib/products/offClient.ts`, audited line by line:

- Called **server-side only** (inside `/api/products/lookup`'s chain) — the
  browser never talks to OFF, so no user IP/identity leaks to OFF and no
  third-party endpoint is reachable from client code.
- The URL is a fixed template into which only a **validated normalized
  barcode** is interpolated (after GTIN check-digit validation and RCN
  filtering in `src/lib/barcode/` — restricted-circulation codes never leave
  the app). No user-controlled host, path, or query.
- Keyless public API — no secret to leak. Custom `User-Agent` identifies the
  app per OFF etiquette.
- 3-second `AbortSignal` timeout; network errors, non-200s, timeouts, and
  malformed bodies all collapse to "not found" → the UI degrades to manual
  entry, never a 5xx.
- Responses are untrusted: only allow-listed fields are read, names/brands are
  length-clamped, categories mapped through a fixed table, and image URLs pass
  `safeImageUrl` (https + OFF image host) before being cached in `products`.
- Hits are cached permanently in `products` (`source='off'`), so each unknown
  barcode costs at most one upstream call globally — an OFF outage degrades
  lookups to "not found → manual entry" while everything already cached keeps
  working.

**Abuse consideration (accepted MVP risk):** an authenticated user
deliberately scanning unknown-but-valid GTINs forces one OFF round trip each;
there is no per-user throttle. Mitigations if needed later: negative caching,
per-user rate limits, edge throttling.

## 14. Camera and scanner privacy — Implemented (verified against code)

The claims below were checked against `src/components/scanner/*`:

- Decoding is **fully in-browser** (ZXing compiled to WASM via
  `@yudiel/react-qr-scanner`). Camera frames go from `getUserMedia` to the
  local decoder; **no frame, image, or video is ever uploaded** — the only
  thing that leaves the scanner component is the decoded barcode *string*
  (`onScan` → scan-flow logic).
- No photograph storage, no OCR, no AI/vision API calls exist anywhere in the
  codebase.
- Camera permission is requested through the standard browser prompt and can
  be revoked at any time; `/scan-test` (the hardware test page) is similarly
  local-only and touches no product API or database.
- The WASM decoder binary is **self-hosted** (`public/wasm/zxing_reader.wasm`,
  synced from the exact npm package version by `scripts/sync-zxing-wasm.mjs`
  with byte-for-byte verification, configured in
  `src/components/scanner/zxing-config.ts`). No third-party CDN is contacted
  at scan time — better privacy (no CDN sees scan-page traffic), better demo
  reliability, and version predictability. Npm dependencies themselves remain
  a normal supply-chain risk, mitigated only by lockfile pinning and CI — the
  same posture as every other dependency in the project.

## 15. Secrets and environment variables — Implemented

| Variable | Exposure | Role |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public by design | project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public by design | RLS-bound API key |
| `SUPABASE_SERVICE_ROLE_KEY` | **local machine only** | seed script's RLS bypass |

The anon key is *intentionally* public: it grants only what RLS allows, which
is why §4–§5 are the real protection. The service-role key bypasses RLS and
is therefore confined to `scripts/seed-db.ts` (run manually, reads
`.env.local`); it is **not referenced anywhere under `src/`** (verified by
search), not in CI (`ci.yml` uses no secrets at all), and per the deployment
docs must never be set on Vercel.

Audit performed: `.gitignore` excludes `.env*` except `.env.example` (which
contains placeholders only); a repository-wide scan for secret patterns (JWTs,
`sb_secret`/service-role strings, private keys, bearer tokens) plus a scan of
the **entire git history** (`git log -p`) found no committed credential.
No `.env.local` exists in this checkout at all — nothing to leak.

## 16. CSRF and request-origin — Implemented

All state changes go through **server actions**, for which Next.js provides
layered protection: they are POST-only RPC endpoints (a `<img src>`/GET-based
CSRF cannot trigger them), and Next.js verifies the `Origin` header against
the request host on every action invocation, rejecting cross-origin POSTs.
The auth session lives in httpOnly cookies managed by `@supabase/ssr`.

The two custom route handlers are read-only GETs (no state-changing GET
endpoints exist — verified across `src/app/api/`), so the classic CSRF target
class is empty. This is strong same-origin protection, not a claim of
absolute immunity: it assumes framework behavior (kept current via lockfile)
and browser `Origin` semantics; no additional token scheme was added because
the framework mechanism covers the actual mutation surface.

## 17. Error handling and information disclosure — Implemented

Uniform policy, verified across all handlers and actions:

- **Client sees:** typed result unions (`ActionResult`) or JSON bodies with
  static, generic messages ("Something went wrong…"), correct status codes
  (400/401/404/500), and the global error boundary (`src/app/error.tsx` /
  `global-error.tsx`) with a friendly message plus a support digest — never
  SQL text, constraint names, stack traces, OFF response bodies, or env
  values.
- **Server logs see:** `console.error` with the underlying Supabase/fetch
  error for diagnosis (visible in Vercel logs). These may contain row-level
  detail (e.g., a constraint name) but no secrets or tokens — the anon key
  and JWTs are never logged.
- Zod failures return field-agnostic messages; auth failures are
  indistinguishable from missing rows for cross-user probes (§5), so error
  responses don't function as an existence oracle at the app layer.

## 18. Security verification performed — exactly what ran

**Empirical (executed for this document):**

1. **Full RLS attack matrix** — §5's fifteen scenarios plus five
   constraint-backstop probes and the §5 gap demonstration, executed against
   the real frozen migration and the real 7,490-row seed CSV in a Postgres 16
   container emulating Supabase's execution model (`anon`/`authenticated`
   roles, JWT-claim-backed `auth.uid()`, PostgREST-style role switching).
   Every result matched the intended design except the documented
   `consumption_events` gap, which is confirmed real.
2. **Render-guard fix verification** — 10 new unit tests for
   `renderableImageSrc` (hostile hosts, lookalike subdomains, `javascript:`,
   `data:`, http-downgrade, garbage); full suite green (§11).
3. **Secret scan** — repo tree + full git history pattern scan; clean (§15).
4. **Static code audit** — every file listed in §1: no service-role usage in
   `src/`, no `dangerouslySetInnerHTML`, no raw SQL, no state-changing GET,
   no secret logging, all inputs Zod-parsed, all errors genericized.

**Pending (not claimed):**

- Runtime RLS verification **against the hosted Supabase project** — pending
  live provisioning (no `.env.local` in this environment). The local matrix
  gives high confidence the frozen SQL behaves as designed, but §5's results
  should be re-run once against production before the demo (Agent D's
  permission tests cover this path).
- Vercel deployment env-var review on the real dashboard.

## 19. Findings summary

**Implemented protections:** httpOnly cookie auth with server-validated
sessions and route gating; RLS on every table as the single authorization
layer (empirically tested); ownership pinned to server-side session in all
mutations; three-layer input validation with database backstops; LIKE-escaped
parameterized search; React-escaped rendering with zero raw-HTML sinks;
double-constrained image URLs (config allow-list + render guard); server-only
keyless OFF client with timeout and untrusted-response sanitization; local
in-browser barcode decoding with self-hosted WASM; service-role key confined
to the local seed path; POST-only origin-checked mutations; generic error
surfaces.

**Accepted MVP risks:** email confirmation disabled (demo reliability);
no rate limiting on APIs or OFF-triggering lookups; shared user-created
catalog is unmoderated; `consumption_events` INSERT does not verify
`fridge_item_id` ownership (confirmed; contained); `image_url` lacks a
database-level constraint (render-side neutralized).

**Production recommendations:** enable email confirmation + SMTP + signup
abuse protection; per-user/IP rate limiting and negative caching; catalog
moderation or private custom products; Wave 5 migration batching the event
INSERT ownership subquery and an `image_url` CHECK; re-run the §5 matrix and
Agent D's permission suite against the hosted project before grading.
