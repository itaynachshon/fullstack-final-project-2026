# Fridge Tracker — Scalability

This document analyzes how the **implemented** application behaves as usage
grows, what its realistic bottlenecks are, and what a sensible scaling path
looks like. Numbers marked *measured* come from running the real frozen
migration and the real 7,490-row catalog in a local Postgres 16 container
with synthetic multi-user volume (202 users, ~4,000 fridge items, ~12,000
consumption events); see §14 for exactly what was executed and what remains
pending. Nothing here is a fabricated benchmark.

## 1. Expected scale

The assignment targets a small real application, not a hyperscale system.
Design target:

```text
dozens → hundreds of users, one household fridge each
~20–60 live fridge rows per user, a handful of consumption events per day
```

The analysis below also states what happens if usage grows past that —
without designing for millions of users.

## 2. Current architecture scaling model

```text
Browser (RSC HTML + small client islands)
  → Vercel serverless Next.js (stateless, scales per request)
    → Supabase Postgres (managed, RLS, PostgREST connection handling)
    → Open Food Facts — only on catalog miss, result cached forever
```

One Next.js app, one managed Postgres, one external read-only API. No
microservices, queues, Redis, separate backend, or distributed cache — at
hundreds of users every one of those would be overhead without benefit. The
app tier is stateless (sessions live in cookies, data in Postgres), so Vercel
can run any number of concurrent function instances without coordination;
the database is deliberately the single point of truth and the single
capacity question that matters (§12).

## 3. Product catalog scale — measured

The committed seed is 7,490 products; runtime growth adds one row per
first-ever-scanned unknown barcode (`source='off'`) or manual creation
(`source='user'`) — a slow, bounded trickle, not per-user duplication
(the catalog is shared).

Measured storage with the full real catalog loaded:

| Object | Measured size |
| --- | --- |
| `products` table (7,490 rows) | 1.25 MB |
| trigram GIN index on `name` | 4.3 MB |
| barcode unique partial index | 0.25 MB |
| primary key + other | 0.3 MB |
| **catalog total** | **≈ 6 MB** |

Two proportionality facts: the *entire catalog* is 156 heap pages — it fits
in Postgres shared buffers wholesale, so catalog queries are memory-speed;
and the trigram index is ~3.5× its table (normal for GIN over Hebrew text) —
an acceptable trade for substring search (§6). This is tiny by Postgres
standards; the catalog could grow 100× before any of the numbers in this
document change category.

## 4. Database growth — measured per-row costs, projected

Measured from the synthetic dataset (table + its share of indexes):

- `fridge_items`: ≈ 200 bytes/row
- `consumption_events`: ≈ 190 bytes/row
- Whole audit database, everything included: **17 MB**

Projection at target scale (300 active users, ~50 fridge rows each, ~5
events/day): fridge ≈ 15k rows ≈ 3 MB; events ≈ 550k rows/year ≈
**~110 MB/year**. Against Supabase Free's 500 MB database cap, that is years
of headroom at target scale; consumption events are the only table that grows
without bound and are therefore the long-term storage story (§9).

## 5. Barcode lookup — measured plan

The hot path of the whole product (every scan). Query:
`products WHERE barcode = $1 LIMIT 1` (`src/lib/products/lookup.ts`), served
by the unique partial index `products_barcode_key` (partial over
`barcode IS NOT NULL` — barcode-less manual rows don't bloat it).

*Measured:* `Index Scan using products_barcode_key`, 3 buffer hits,
~0.2 ms execution in the container. O(log n) — at 7 million products it
would still be a handful of page reads. Barcode lookup will never be the
bottleneck; the network round trip to the database dwarfs it.

## 6. Product search and index strategy — measured, with an honest planner finding

Implementation (`src/lib/products/search.ts`): `name ILIKE '%q%'` with LIKE
metacharacters escaped, ordered by `(name, id)`, 21-row page probe (§7). The
migration provides a `pg_trgm` GIN index on `name`; trigram indexes are the
standard way to accelerate *substring* matching, and unlike Postgres
full-text search they work for Hebrew (no stemming dependency — trigram
extraction from Hebrew text was verified working in the container).

*Measured finding worth stating precisely:* at 7,490 rows the planner
**chooses a sequential scan and is right to** — the common-term query
('חלב', 204 matches) reads all 156 pages in ~5 ms; forcing the trigram index
produced the same rows with *more* buffer traffic (511 vs 162). The index is
effectively dormant at current catalog size and will be picked up
automatically by the planner as the table grows into the tens/hundreds of
thousands of rows, which is exactly how it should behave. Both plans were
captured; the index is proven usable, not just present.

Cost as the catalog grows: seq-scan cost grows linearly but only matters past
~10⁵ rows, at which point the planner flips to the (already existing) index.
GIN maintenance on writes is negligible at this write rate (a trickle of new
products). At *much* larger scale (millions of rows, relevance ranking),
alternatives would be `tsvector` search where language allows, RUM indexes,
or an external search engine — explicitly not needed now.

## 7. Pagination — verified in code

`GET /api/products/search` returns at most 20 items: the query uses
`range(offset, offset + 20)` — a 21-row probe where the extra row only sets
`hasMore`, avoiding a separate COUNT query (COUNT on a filtered ILIKE result
would cost as much as the scan itself). Ordering by `(name, id)` is a total
order, so pages are deterministic — no duplicated/skipped rows between pages.
The entire catalog is never returned in one response; worst-case response
size is 21 compact rows regardless of catalog size.

Offset pagination is exactly right at this scale (users read page 1–3 of a
narrow substring match; OFFSET cost is proportional to rows skipped, which is
tiny here). Keyset pagination on `(name, id)` is the documented upgrade if
catalogs ever reach the point where deep offsets matter — not implemented now.

## 8. Fridge and restock queries — measured plans

Per-user data is small by nature (a physical fridge), which the design leans
into. `fetchFridgeUnits` (`src/lib/fridge/queries.ts`) fetches the user's
items with the product **embedded in the same query** (PostgREST FK embed →
join, no N+1); `fetchRecentActivity` fetches the newest 10 events with the
product name embedded through the item FK.

*Measured plans (all RLS predicates visible in-plan, all index-served):*

- Fridge fetch: bitmap index scan on `fridge_items_user_finished_idx` for the
  RLS `user_id = auth.uid()` predicate, memoized product-PK lookups for the
  embed, sort by `added_at`; 20 rows in ~0.4 ms.
- Recent activity: bitmap index scan on `consumption_events_user_created_idx`
  (the `(user_id, created_at DESC)` composite), top-N heapsort for the
  `LIMIT 10`; ~0.3 ms.
- Restock-derivation shape (if it were pushed to SQL): the same composite
  `(user_id, finished_at)` index serves both the user filter and
  `finished_at IS NOT NULL`; ~0.04 ms. Today this derivation happens in JS
  from the already-fetched rows — correct at per-user volumes (§15).

The three migration indexes match the three access patterns one-to-one:
`(user_id, finished_at)` for fridge/restock, `(product_id)` for
"already in fridge" checks and FK joins, `(user_id, created_at DESC)` for the
activity feed. RLS itself is index-aligned: because policies are direct
column comparisons on `user_id`, the security predicate *is* the access path,
so isolation adds no table scans.

## 9. Consumption-event growth

Events are append-only (no UPDATE/DELETE policies) and never loaded
unboundedly: the only runtime read is the newest-10 feed, whose cost is
bounded by the composite index regardless of history length (top-N over an
ordered index prefix). Growth is therefore a pure *storage* concern
(~110 MB/year at target scale, §4), not a query-latency one.

If the app outlives its storage headroom: retention policy (delete events
older than N months), monthly aggregation rows, or archival to cold storage —
in that order of effort. None implemented now; none needed at target scale.
One structural note: deleting a fridge item cascades away its events, so
history is naturally pruned when users clear finished items.

## 10. Client/server separation

React Server Components do all data access: `fridge/page.tsx`,
`restock/page.tsx`, and the add-flow pages fetch via server-side queries and
render HTML; the browser receives no Supabase query logic, no service
credentials (there are none at runtime), and no over-fetched rows to filter
client-side. Mutations are server actions (`src/lib/actions/`) — RPC stubs on
the client, validation and writes on the server.

Client components exist only where interactivity demands them: the scanner
(`BarcodeScanner.tsx` — camera + WASM decode stay fully in-browser, §SECURITY
14), the debounced search panel (fetches the paginated JSON API), the
remaining-level stepper, and auth forms. Consequences for scale: less
JavaScript shipped per page, one server round trip per view instead of
client-side query waterfalls, and the database access pattern is fixed by
server code rather than varying per client.

## 11. Open Food Facts dependency

OFF is consulted **only on local catalog miss**, server-side, with a 3 s
timeout, and every hit is cached permanently as a `products` row:

```text
first-ever scan of an unknown barcode → one OFF call, cached for everyone
every later scan of that barcode     → local DB only (§5 speed)
```

So OFF traffic is proportional to *distinct never-seen barcodes*, not to
users or scans — it decays as the shared cache warms. Failure behavior is
degradation, not outage: timeouts/errors surface as "not found → manual
entry" while all cached products keep working.

At higher scale the residual costs are repeated misses for genuinely unknown
codes (no negative cache — the same unknown barcode re-queries OFF on every
scan) and upstream rate limits/outages. Future mitigations, deliberately not
built now: negative caching with TTL, per-user throttling, scheduled
enrichment jobs.

## 12. Vercel and Supabase platform considerations

**Vercel:** serverless functions scale horizontally per request and the app
is stateless, so the app tier is not the capacity question at any scale this
project can reach. Per-request latency is dominated by the Supabase round
trip (and OFF on cache misses, bounded at 3 s), not compute. Free-tier
function invocation/bandwidth quotas are generous relative to hundreds of
users. One deployment note: pin the function region near the database region
(§13).

**Supabase:** access goes through Supabase's managed API (PostgREST) and its
connection handling — the app never opens raw persistent Postgres
connections, so serverless instance fan-out does not exhaust `max_connections`
(the classic serverless+Postgres failure mode is designed out). Free-tier
realities that actually matter here: 500 MB database (years of headroom, §4),
**projects pause after ~1 week of inactivity** — operationally relevant for a
university demo; Wave 5 added `.github/workflows/supabase-keepalive.yml`,
a twice-weekly authenticated 1-row ping that keeps the project warm during
the grading window — and no production SLA. A paid tier removes the pause and raises limits; no
production-scale guarantees are claimed from the free tier.

## 13. Regional latency

Plan: Supabase in EU (Frankfurt), reasonably close to Israeli users. The
browser→Vercel leg is edge-routed; the function→database leg is the one that
multiplies (every page render does at least one DB round trip), so the Vercel
function region should be pinned to Frankfurt (`fra1`) rather than the US
default — implemented in Wave 5 via the committed `vercel.json`
(`"regions": ["fra1"]`; single-region selection is supported on the Hobby
plan). OFF (European infrastructure) adds its latency only on cache misses.
Multi-region replication is out of scope and unnecessary for one small region.

## 14. Query/index verification performed — and what is pending

Executed for this document (local Postgres 16 container, real frozen
migration, real 7,490-row catalog CSV, 202 synthetic users / ~4k items /
~12k events, `EXPLAIN (ANALYZE, BUFFERS)` under the `authenticated` role with
a real JWT claim so RLS predicates appear in plans):

| Query | Verified plan |
| --- | --- |
| Barcode lookup | Index Scan `products_barcode_key`, 3 buffers |
| Search common Hebrew term | Seq scan by planner choice at 7.5k rows (~5 ms, whole table = 156 pages); trigram index proven usable when forced; Hebrew trigram extraction confirmed |
| Search rare term | Seq scan, 8 rows, ~3 ms |
| Fridge fetch (embed) | Bitmap on `fridge_items_user_finished_idx` + memoized PK joins, no N+1 |
| Recent activity | Bitmap on `consumption_events_user_created_idx`, top-N limit 10 |
| Restock shape | Composite `(user_id, finished_at)` serves both predicates |

Container timings are order-of-magnitude local measurements (no network);
they establish plan *shapes* and index usage, not production latency.

**Pending:** the same checks against the hosted Supabase project (not yet
provisioned) — production adds network RTT and PostgREST's exact generated
SQL for embeds (audited here as the equivalent join; same indexes apply).
No production latency numbers are claimed anywhere in this document.

## 15. Known limitations

1. **`fetchFridgeUnits` loads the user's full item history**, including all
   finished units forever (the fridge page shows a Finished group and restock
   derives from the same rows — a deliberate single-query design). Per-user
   and index-served, so it degrades slowly: a heavy user might accumulate
   ~500 finished rows/year → payloads grow by roughly 100–200 KB/year of use.
   Improvement path when it matters: filter finished units older than N days
   into a separate on-demand query, or prompt users to clear old finished
   items (delete also prunes event history via cascade).
2. **No negative caching for OFF misses** (§11) — repeated scans of the same
   unknown barcode re-query OFF each time.
3. **No rate limiting** anywhere (§SECURITY 8) — a single authenticated user
   can generate unbounded load; acceptable at course scale.
4. **Free-tier pause behavior** can make the first demo request fail after a
   week of inactivity (§12).
5. **Search ordering is lexicographic, not relevance-ranked** — a deliberate
   PostgREST constraint (no expression ORDER BY without an RPC); fine at
   catalog size where substring matches are already narrow.

## 16. Likely bottlenecks, ranked

1. **OFF latency/availability on cache misses** — the only multi-second
   anything in the request path (bounded by the 3 s timeout, shrinking as the
   cache warms). First real bottleneck users could feel.
2. **Platform quotas / free-tier behavior** — the inactivity pause is the
   likeliest *demo-day* failure; storage takes years to matter.
3. **Search cost at much larger catalog size** — self-resolving via the
   already-present trigram index when the planner flips (§6).
4. **Event-table growth over years** — storage-only, cheap remediations (§9).
5. **Finished-item over-fetch for long-lived heavy users** (§15.1).

Not bottlenecks, verified: barcode lookup (§5), per-user fridge queries (§8),
N+1 patterns (none — embeds), app-tier compute (stateless serverless).

## 17. Scaling path

**Now (dozens–hundreds of users):** ship as is. The measured numbers say the
current single-app + Supabase design is operating orders of magnitude below
its comfortable capacity.

**If usage reaches high hundreds–thousands:** upgrade the Supabase tier
(removes pause, more storage/compute); add monitoring (Vercel analytics +
Supabase query stats); add per-user rate limiting and OFF negative caching;
filter finished items out of the default fridge query; consider a periodic
catalog refresh job.

**Only at much larger scale:** background ingestion pipeline for catalog
data (second retailer, scheduled OFF enrichment), dedicated search
(tsvector/RUM or external engine) with relevance ranking, event
retention/archival policy, and object storage/CDN if the app ever hosts its
own product images instead of hotlinking OFF's. Microservices are not on
this path at any scale this product can plausibly reach — the natural
evolution is "bigger database, background jobs," not service decomposition.
