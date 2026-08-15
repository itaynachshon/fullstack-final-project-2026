# Research Report: Barcode Product-Data Sources for Israeli Groceries

**Scope:** Hypothesis 3 (Open Food Facts), Hypothesis 4 (Commercial Barcode APIs), barcode semantics / GTIN / EAN / UPC normalization, and empirical testing with real Israeli products.
**Out of scope:** Israeli supermarket price-transparency / scraping infrastructure (Hypotheses 1–2, covered in the companion report `docs/research/ISRAELI_RETAIL_DATA.md`).
**Research date:** 2026-08-14 (all API calls, counts, prices, and page contents were retrieved on this date).
**Produced by:** an autonomous research agent. This document is self-contained: a reader with no access to the original chat can re-verify every claim from the sources and reproduction steps given here.

## Epistemic labeling convention

Every important claim in this report carries one of four labels:

- **[VERIFIED]** — stated by an authoritative primary source (standard, official docs, vendor's own page), which is cited.
- **[OBSERVED]** — an empirical result measured directly during this research; the method and inputs are given in Appendix A/B so it can be re-run.
- **[INFERENCE]** — a conclusion that reasonably follows from verified/observed facts but was not directly confirmed.
- **[UNRESOLVED]** — a question this research could not settle, with a note on how to settle it.

---

## 1. Executive summary

1. **[OBSERVED]** Open Food Facts (OFF) contains roughly **3.4–3.6 k products tagged as sold in Israel** and roughly **4.7 k products whose barcode starts with the Israeli GS1 prefix 729** (four mutually corroborating measurements, §4.3). An earlier planning estimate of "~8 k Israeli products" circulating in project notes **did not reproduce** and should not be used.
2. **[OBSERVED]** OFF nevertheless resolved **9 of 10 hand-picked iconic Israeli staples** (Bamba, Bissli, Cottage, Milky, Tnuva milk, Coca-Cola IL, Achla hummus, Para chocolate, Yotvata Choco — all with Hebrew names and photos; only Elite Turkish coffee was missing). The test set is popularity-biased by construction (§4.4), so 90 % is an upper bound, not an expected hit rate for a full fridge.
3. **[OBSERVED]** Commercial barcode APIs are much worse for Israeli domestic products: on the same staples UPCitemdb resolved **4/10**, and those hits were US-marketplace listings (e.g., "Bamba- Israeli Food Israelian Snack 80 Grams Pack", a **1993 collectible Coca-Cola listing**) — not clean catalog data. On a 15-product sample of OFF's Israel-prefix products UPCitemdb scored **0/15**. Brocade.io scored **0/34** overall. Vendors that require paid keys (Barcode Lookup, Go-UPC, EAN-DB, Barcode Spider) could not be hit-rate-tested, but EAN-DB's own statistics show a books/media-dominated database with no Hebrew among its top title languages (§5).
4. **[VERIFIED]** OFF is free under **ODbL** (attribution + share-alike for derivative databases), has **no API cost**, but enforces **15 product reads/min/IP** and expects "1 API call = 1 real user scan"; bulk needs come from its full data exports (MongoDB/JSONL/Parquet/CSV). Commercial APIs cost **$25–$949+/month** and caching rights vary: Chomp explicitly forbids caching on cheap tiers (indefinite storage only at $299/mo), while the UPCitemdb / Go-UPC / Barcode Spider terms reviewed contain no explicit caching clause (§5.2).
5. **[OBSERVED]** OFF's **search/facet endpoints returned HTTP 503 during the entire ~1 h test window** while product-by-barcode reads worked flawlessly (median 304 ms). Any design should treat OFF as a *barcode-lookup* service, not a search service; full-text search lives on a separate service (`search.openfoodfacts.org`) that did respond reliably.
6. **[VERIFIED/OBSERVED]** Barcode semantics matter more than they look: GTIN-12 has an implied leading zero (a 12-digit code starting "729" is a **US** code, not Israeli); OFF normalizes 9–12-digit codes by zero-padding to 13; in-store restricted-circulation codes (prefixes 02/04/20–29/2xx, used for weighed items) will **never** resolve in any global database. A concrete normalization policy is spelled out in §3.6.
7. **Bottom-line assessment (no implementation performed):** H3 is **supported with caveats** — OFF is viable as the primary *external* barcode-lookup source for an Israeli fridge-tracker, covering famous staples well, with zero cost, but it cannot be the only source (thin long-tail coverage, ~13 % Hebrew naming in its 729-prefix top products, no SLA). H4 is **rejected for this use case** — commercial general-purpose barcode APIs offer materially worse Israeli coverage at material cost; the authoritative GS1 registry route is enterprise-gated. The practical implication (consistent with Hypotheses 1–2 research) is that OFF should be a *fallback/enrichment* layer, not the primary catalog.

---

## 2. Background and hypotheses under test

The product under design is a **fridge-tracker web app** (Next.js/TypeScript/Supabase/Vercel, per the course constraints in `English-Assignment.md`): an Israeli user scans a grocery barcode with their phone camera and the system should identify the product (name, brand, package size, category) and add it to a home inventory. Product identification by barcode is the critical external dependency. Four data-source hypotheses were defined in project planning; this report tests two of them:

- **Hypothesis 3 (H3):** *Open Food Facts can serve as the barcode→product data source for Israeli groceries* — evaluated on coverage, data quality, Hebrew support, API mechanics, rate limits, licensing, and reliability.
- **Hypothesis 4 (H4):** *A commercial barcode API can serve that role* — evaluated on the same axes plus price and contractual restrictions (especially caching/storage rights, which determine whether results may be persisted into the app's own catalog).

Additionally this report covers **barcode semantics and normalization** (how to canonicalize scanned codes so that lookups and a local catalog behave correctly), because every lookup source depends on it.

---

## 3. Barcode semantics: GTIN / EAN / UPC and normalization

### 3.1 The GTIN family — identifiers vs. symbologies

**[VERIFIED]** The number encoded in a retail barcode is a **GTIN (Global Trade Item Number)**, administered by GS1. The printed bars are a *symbology* (EAN-13, UPC-A, EAN-8, UPC-E); the *identifier* is the digit string. GTINs come in four lengths (GS1, "How to calculate a check digit manually", <https://www.gs1.org/services/how-calculate-check-digit-manually>; GS1 GenSpecs, <https://ref.gs1.org/standards/genspecs/>):

| Name | Digits | Typical symbology | Notes |
|---|---|---|---|
| GTIN-13 | 13 | EAN-13 | Standard worldwide retail unit code. What Israeli products carry. |
| GTIN-12 | 12 | UPC-A | US/Canada retail. **Implied leading zero**: as a 13-digit number it starts with 0. |
| GTIN-8 | 8 | EAN-8 | Small packages. Not a truncation of a GTIN-13 — a separately allocated short number. |
| GTIN-14 | 14 | ITF-14 / GS1-128 | Trade/case level. Indicator digit (1–8) + GTIN-13 body. Retail consumer units effectively = GTIN-14 with indicator 0. |
| (UPC-E) | 8 shown | UPC-E | Zero-suppressed compression of a GTIN-12 that begins with 0. Must be *expanded* to GTIN-12 before lookup; the expansion algorithm is defined in GS1 GenSpecs §5 (not re-derived here). |

**[VERIFIED]** GS1's prefix table carries an explicit warning that generalizes: *"For 12-digit GTINs, and only 12-digit GTINs, there is an implied leading zero. For example, given the 12-digit GTIN 614141234561, the GS1 Prefix is 061, not 614."* (<https://www.gs1.org/standards/id-keys/company-prefix>, Note 4).

**[OBSERVED]** This is not a theoretical trap: a Wikidata SPARQL query for GTINs starting "729" returned a single 12-digit item (`729843405321`, a US video game) whose real GS1 prefix is **072 (GS1 US)**, not 729 (Israel). Prefix logic must be applied only after normalization to 13/14 digits.

### 3.2 Check digit

**[VERIFIED]** The last digit of every GTIN is a mod-10 check digit: multiply digits alternately by 3 and 1 **starting with weight 3 at the digit adjacent to the check position (i.e., rightmost body digit)**, sum, and subtract from the nearest equal-or-higher multiple of ten (GS1, <https://www.gs1.org/services/how-calculate-check-digit-manually>). Reference implementation used (and validated) in this research:

```python
def check_digit(body: str) -> int:          # body = GTIN without its last digit
    total = sum(int(ch) * (3 if i % 2 == 0 else 1)
                for i, ch in enumerate(reversed(body)))
    return (10 - (total % 10)) % 10

def is_valid_gtin(code: str) -> bool:
    return (code.isdigit() and len(code) in (8, 12, 13, 14)
            and check_digit(code[:-1]) == int(code[-1]))
```

**[OBSERVED]** Validation matters because the lookup sources behave differently on invalid codes:

- OFF **does not validate** check digits: querying Bamba's code with a corrupted last digit (`7290000066319`) returned an ordinary HTTP 404 / `status: 0` "product not found" — indistinguishable from a real-but-unknown product.
- UPCitemdb **does validate**: the same corrupted code returned HTTP 400, `code: "INVALID_UPC"`, message "Not a valid UPC code.".

**[INFERENCE]** An app should therefore validate the check digit itself before any network call: it cheaply catches camera misreads that OFF would otherwise report as a plausible-looking "unknown product" (which could trigger a pointless manual-entry flow).

### 3.3 GS1 prefixes and what "Israeli barcode" means

**[VERIFIED]** GS1 prefix **729 = GS1 Israel** (<https://www.gs1.org/standards/id-keys/company-prefix>). The prefix identifies the GS1 Member Organisation that issued the company prefix — normally the country where the *brand owner* registered, **not** where the item was manufactured or sold.

**[OBSERVED]** Two symmetric consequences were measured:

- **Israeli shelves carry many non-729 codes.** In the Israel-tagged OFF sample (Appendix B, Set B imports): Alpro `54...` (Belgium), Schogetten `40...` (Germany), Barilla `80...` (Italy), Pringles `0038...` (US), a Polish-made Hebrew-labeled protein drink `59...`. A fridge app must not assume `729*`.
- **729 codes circulate far outside Israel.** OFF's most-scanned 729-prefix products are Israeli *exports* scanned by European users: Sabra hummus sold at ASDA (UK), Sodastream syrup, Osem-made "Garden Gourmet"/Tivall vegetarian products for Nestlé Europe — with German/French/Dutch names.

### 3.4 Restricted Circulation Numbers (in-store codes)

**[VERIFIED]** GS1 reserves prefix ranges for numbers that are only meaningful inside a company or a geographic region ("Restricted Circulation Numbers", RCN): `0000000` and `040–049` (company-internal), `020–029` and `200–299` (region/MO-defined) (<https://www.gs1.org/standards/id-keys/company-prefix>). These are the codes supermarkets print for **weighed/loose items** (produce, deli, bakery), typically embedding a price or weight.

**[INFERENCE]** Any barcode whose normalized 13-digit form starts with `02` or `2` will *never* resolve in OFF or in any commercial global database, because by standard it has no global meaning. Each Israeli chain assigns these internally (the exact Israeli chain schemes are MO/retailer-defined; **[UNRESOLVED]** — the per-chain encoding of weight/price digits was not investigated here; it belongs to the H1/H2 price-transparency research, where chain files list those internal codes). For the app this means: detect the RCN ranges up front and route directly to manual entry / non-barcode flows.

### 3.5 EAN-8

**[VERIFIED]** EAN-8 codes are allocated separately by MOs (GS1 prefix table, note 3) and identify small items. OFF stores them as 8-digit codes (see §3.6). No Israeli EAN-8 was included in the test set (none of the sampled staples uses one); their existence in Israel is **[UNRESOLVED]** but they are rare on packaged groceries.

### 3.6 Normalization policy (what the evidence supports)

**[VERIFIED]** OFF's documented storage rule (<https://openfoodfacts.github.io/openfoodfacts-server/api/ref-barcode-normalization/>):

> - codes with ≤ 7 digits (after stripping leading zeros) are zero-padded to **8** digits;
> - codes with 9–12 digits are zero-padded to **13** digits;
> - the `code` field in the DB, dumps and exports is normalized this way, and the API normalizes the requested code on both READ and WRITE.

**[OBSERVED]** Empirical confirmation (full probe table in Appendix B.3): requesting the 12-digit UPC `034000470693` returns the product stored as `0034000470693`; requesting a 14-digit zero-padded form `00034000470693` returns the same product with the 13-digit code; `07290000066318` (14-digit) returns Bamba stored as `7290000066318`. So OFF's canonical form is: **EAN-8 stays 8 digits; everything else is 13 digits with leading zeros preserved as part of the 13**.

**[OBSERVED]** UPCitemdb accepted both 12- and 13- and zero-padded-14-digit forms of the same GTIN and matched them to one item.

**[INFERENCE — recommended canonical policy for the app]** (consistent with GS1 semantics and both tested APIs):

1. Keep only digits; reject non-digit input.
2. Reject lengths other than 7 (UPC-E, expand first), 8, 12, 13, 14.
3. Validate the check digit; reject on mismatch (re-scan prompt).
4. Canonicalize for storage exactly like OFF: strip leading zeros → ≤7 ⇒ pad to 8; 9–12 ⇒ pad to 13; 13 stays; 14 ⇒ strip indicator zero to 13 (non-zero indicator = case code, not a retail unit).
5. Classify before lookup: starts with `2` or `02` (13-digit form) ⇒ in-store code, skip external lookups.
6. When calling external APIs, send the canonical form (both tested APIs handle it).

Storing GTIN-14 (all codes zero-padded to 14) is the other defensible convention (it is what GS1 systems do internally and what Brocade's API requires); the OFF-style convention was preferred above only because the primary external source (OFF) uses it, making cache keys identical to OFF `code` values. Either is fine — what matters is picking one canonical form and normalizing at the boundary. **[INFERENCE]**

---

## 4. Hypothesis 3: Open Food Facts

### 4.1 What it is, licensing, and terms

**[VERIFIED]** (all from OFF's own pages, retrieved 2026-08-14):

- Open Food Facts is a crowdsourced global food-products database run by a French non-profit; data comes from volunteers photographing/typing package data ("Terms of use, contribution and re-use", <https://world.openfoodfacts.org/terms-of-use>).
- **Licenses:** database under **ODbL 1.0**; individual contents under **DbCL**; product photos under **CC-BY-SA** (photos may still embed third-party rights — package artwork, trademarks). Attribution to Open Food Facts with a link is mandatory for re-use, *including derivative works*; derivative databases must be shared under the same conditions (share-alike). Governing law is French law. (Same source, and <https://world.openfoodfacts.org/data>.)
- **No accuracy or completeness warranty** — data is explicitly "as-is", crowdsourced, may contain errors; explicitly not for medical use.
- **API usage policy:** "You are very welcome to use the API for production cases, **as long as 1 API call = 1 real scan by a user**. Any attempt to scrape the database using the API will very likely be blocked, as full daily exports are available" (<https://world.openfoodfacts.org/data>).
- **Contribution rules** (relevant if the app ever writes back): contributors must only submit data taken directly from the physical product/label, must NOT copy from other websites or databases, photos must be their own. WRITE operations require an account; a shared app-level account with `app_name`/`app_uuid` parameters is the documented pattern (<https://openfoodfacts.github.io/openfoodfacts-server/api/>).

**[INFERENCE — licensing implication for the fridge app]** Caching OFF lookup results into the app's own product catalog creates a **derivative database** under ODbL: the app must credit OFF with a link (per-product or globally) and, if that enriched catalog is redistributed, it must be offered under ODbL as well. For a student project that displays products to end users this is a light burden (attribution line + willingness to share the cached table). Mixing OFF data with *other* sources in one table triggers the same share-alike on the combined database — worth a deliberate decision when combining with price-transparency data (H1/H2). **[UNRESOLVED]** The exact boundary between "collective database" and "derivative database" under ODbL §4.5 (which affects whether the *whole* catalog or only the OFF-derived part must be shared) is a legal-interpretation question this research did not settle; the conservative reading is to keep OFF-derived rows attributable and exportable.

### 4.2 API mechanics (READ path)

**[VERIFIED]** from the API documentation (<https://openfoodfacts.github.io/openfoodfacts-server/api/>):

- **Product read:** `GET https://world.openfoodfacts.org/api/v2/product/{barcode}` (v2, deprecated-but-supported) or `/api/v3/product/{barcode}` (current, v3.6 latest). `fields=` selects response fields. No API key for reads; a **custom User-Agent** of the form `AppName/Version (contact@email)` is required.
- **Rate limits:** **15 req/min/IP** for product reads; **10 req/min/IP** for search; no limit on writes. Additional *global* (all-users) anti-crawl limits exist and return **HTTP 503**. Exceeding limits risks IP ban. If users call the API directly from their devices (e.g., the browser calls OFF), the per-IP limits apply per user — a documented architectural lever.
- **Search:** structured search only in v2 (`/api/v2/search`); v3 has **no** search; full-text search is delegated to **Search-a-licious** (`https://search.openfoodfacts.org/search`, Lucene-style `q=`, `page_size`, `sort_by`, `fields`). The legacy `/cgi/search.pl` still exists.
- **Staging:** `https://world.openfoodfacts.net` with HTTP basic auth `off:off`, for development.
- **Bulk data:** nightly exports — MongoDB dump, **JSONL** (gzip), **Parquet on Hugging Face**, CSV (~0.9 GB gz / ~9 GB raw), 14-day **delta files** (`https://static.openfoodfacts.org/data/delta/index.txt`), and image bulk download via AWS Open Data (<https://world.openfoodfacts.org/data>). Documented guidance: apps generating heavy traffic should self-host from exports rather than hammer the API.
- **v3 response shape [OBSERVED]:** `{code, errors[], warnings[], result:{id:"product_found",...}, product:{...}, status}` — per-call structured errors, vs v2's minimal `{code, product, status, status_verbose}`.

**[OBSERVED] Reliability during the test window (2026-08-14 ~14:15–15:30 UTC):**

- Product reads: all 34 test-set reads returned valid responses (33 × HTTP 200 found, 1 × HTTP 404 correct not-found); **median latency 304 ms, p90 313 ms, max 447 ms** (from a Mac on a home connection in Israel; n=33 HTTP-200 reads).
- Unknown product: HTTP **404** with JSON `status: 0, status_verbose: "product not found"`.
- **Search, country facets, and code facets returned HTTP 503 on every attempt across the whole window** (≥ 5 attempts spread over ~70 minutes; v2 search, `/country/israel.json`, `/facets/codes/...json`). The 503 page is OFF's "Page temporarily unavailable" template. The same facet queries succeeded immediately on the **staging** host. Search-a-licious production responded normally throughout.
- **[INFERENCE]** This matches the documented "global rate-limits ... irrespective of IP" protection: product-by-barcode lookup is the hardened, dependable path; list/facet/search on the main host is best-effort only and must not sit on any critical user path.

### 4.3 Israeli coverage — aggregate numbers

Four independent measurements, all 2026-08-14:

| Measurement | Source | Count |
|---|---|---|
| Products tagged `countries_tags = en:israel` | Search-a-licious prod (`q=countries_tags:"en:israel"`) | **3,554** (`is_count_exact: true`) |
| Products tagged `en:israel` | Product Opener **staging** facet (`/country/israel.json`) | **3,424** |
| Products with `code` starting `729` | Search-a-licious prod (`q=code:729*`) | **4,755** |
| Products with `code` starting `729` | Product Opener **staging** facet (`/facets/codes/729xxxxxxxxxx.json`) | **4,650** |

**[OBSERVED]** OFF's Israeli footprint is ≈ 3.5 k Israel-tagged / ≈ 4.7 k Israeli-prefix products. The two backends agree within ~3 % (staging data is a slightly stale copy; the search index may also lag). The "~8,092 Israel-tagged products" figure recorded in earlier project planning notes **could not be reproduced by any method today** and should be treated as stale or mismeasured. (The production facet — the historically common way to get this number — was 503 all day, which may explain how differing numbers circulate.) **[UNRESOLVED]** whether the earlier 8 k figure ever reflected a different metric (e.g., `countries` free-text vs tags), re-checkable when production facets are reachable, or from the CSV export.

**Context for scale [INFERENCE]:** a large Israeli supermarket chain lists on the order of 10,000+ distinct packaged SKUs (the companion H1/H2 report quantifies this from price-transparency files). ~4.7 k Israeli-prefix products in OFF therefore covers at most a modest fraction of the domestic assortment — and the observed skew (below) makes the *effective* domestic coverage smaller.

**[OBSERVED] Composition skew.** The top-300 `729*` products by OFF scan count show OFF's Israeli data is significantly driven by *exports scanned abroad*:

- Highest-scanned 729 product overall: Sabra Houmous sold at ASDA (UK), 85 unique scans — tiny absolute engagement (for comparison, globally popular products have hundreds of thousands).
- The top ranks are dominated by Sodastream syrups and Nestlé "Garden Gourmet"/Tivall vegetarian products manufactured in Israel for European markets, named in German/French/Dutch.
- Only **38 / 300 (12.7 %)** of those top-300 have a Hebrew `product_name`; 271/300 have any name, 239/300 a brand, 205/300 a quantity (Search-a-licious index fields; Appendix B.4).

**[INFERENCE]** OFF-Israel is thin *and* its most-maintained 729 records are export SKUs. However, the domestic staples that Israeli users actually scan are precisely the segment where local OFF contributors have focused (next section) — coverage is popularity-correlated, which is favorable for a consumer app: the first scans a user makes are far likelier to hit than uniform-random SKU sampling would suggest.

### 4.4 Israeli coverage — product-level hit rates (empirical)

**Method** (full provenance in Appendix A): 34 real Israeli-market barcodes in two sets.

- **Set A — 10 curated domestic staples.** Chosen for category breadth (snack, dairy, milk, soft drink, chilled salad, chocolate, coffee); each barcode grounded in at least one **non-OFF public source** (manufacturer product page, price-comparison sites built on government price-transparency data). *Known bias:* famous products, by construction — this measures "will the app's first scans work", not average coverage. *Circularity guard:* barcode identity was established from non-OFF sources; OFF "hit" required the returned name to match the expected product.
- **Set B — 24 products sampled from OFF itself** (15 with `729*` across popularity strata + 9 Israel-tagged imports). By construction these exist in OFF (hit rate meaningless for H3) — their purpose is (a) OFF field-completeness measurement on canonical API responses and (b) an *Israel-relevant* probe set for the commercial APIs in §5.

**Results — Set A against OFF v2 (2026-08-14):**

| Barcode | Product (expected) | Found | OFF name | Hebrew | Photo | Nutriment fields | Quantity |
|---|---|---|---|---|---|---|---|
| 7290000066318 | Osem Bamba 80 g | ✅ | במבה | ✅ | ✅ | 105 | 80 ג |
| 7290000066141 | Osem Bissli Grill 70 g | ✅ | ביסלי גריל | ✅ | ✅ | 50 | 70 ג |
| 7290004127329 | Tnuva Cottage 5 % 250 g | ✅ | קוטג' 5% | ✅ | ✅ | 80 | 250 g |
| 7290104726712 | Strauss Milky chocolate (8-pack) | ✅ | מילקי | ✅ | ✅ | **0** | 1.36 l |
| 7290004131074 | Tnuva milk 3 % 1 L carton | ✅ | חלב טרי 3% | ✅ | ✅ | 156 | 1 L |
| 7290000284316 | Coca-Cola 1.5 L (IL bottler) | ✅ | "Coca-Cola Cachere- 1.5L- Klp -22" | ✅ | ✅ | 63 | 1.5 L |
| 7290105964564 | Achla hummus 400 g | ✅ | חומוס | ✅ | ✅ | 50 | — |
| 7290000170053 | Elite Para milk chocolate 100 g | ✅ | שוקולד חלב | ✅ | ✅ | 85 | 100 g |
| 7290003029181 | Yotvata Choco 1 L | ✅ | Yotvata Choco | ✅* | ✅ | 25 | 1 l |
| 7290000176062 | Elite Turkish coffee 100 g | ❌ 404 | — | — | — | — | — |

\* Hebrew present in `product_name_he`.

**Set A hit rate: 9/10.** All hits included a front photo and a Hebrew name (main or `_he`). Misses and blemishes worth noting **[OBSERVED]**:

- **Elite Turkish coffee 100 g (7290000176062) is absent** — one of the most ubiquitous products in Israeli kitchens (sold in 18 chains per SaveMyCart). Even the "iconic staples" tier is not fully covered.
- **Crowdsourced naming noise:** the Coca-Cola record's display name is "Coca-Cola Cachere- 1.5L- Klp -22" (a French kosher-label scan). Correct product, ugly primary name; `quantity` and brand fields were fine.
- **Multipack vs unit GTINs:** 7290104726712 resolves to the Milky 8-pack (quantity 1.36 l, zero nutriment fields). Single-cup Milky has a different GTIN. Fridge apps must expect distinct codes per pack size and occasional sparse records.

**Set B (OFF-derived, n=24) — field completeness of canonical API responses [OBSERVED]:** names 22/24, brands 21/24, quantity 18/24, front image 23/24, >5 nutriment fields 21/24, Hebrew name only 5/24 (consistent with the export skew — the sample is majority export-SKUs and imports).

### 4.5 Writing back to OFF (optional two-way integration)

**[VERIFIED]** WRITE endpoints exist in v2/v3 (product data + image upload), require an account, are un-rate-limited, and OFF explicitly courts inventory-type apps: "If your users do not expect a result immediately (e.g., Inventory apps): submit photos ... the backend and AI (Robotoff) will generate derived data; over time the community fills gaps." Contributions must originate from the physical product only. **[INFERENCE]** A fridge app could offer "product missing → photograph it" and both fill its own gap queue and improve OFF — but photos must be user-taken, never copied from retailer sites; and this flow needs its own product-name entry anyway, so it complements rather than replaces manual entry.

### 4.6 H3 verdict

**Supported with caveats.** As a *lookup* API, OFF is free, fast (~300 ms), Hebrew-capable, legally clean under ODbL-with-attribution, and empirically strong exactly where a consumer fridge app needs it first (famous staples: 9/10, all with photos and Hebrew names). As a *catalog*, OFF-Israel is thin (~3.5–4.7 k products vs a five-figure domestic SKU universe), export-skewed, occasionally messy, and its search/facet layer was down for the entire test window. It cannot be the sole source; it fits as the external fallback/enrichment layer over a locally-seeded catalog (per H1/H2 research), with strict client-side normalization (§3.6), the 15 req/min/IP budget respected (or lookups made from the user's browser/IP), and attribution rendered.

---

## 5. Hypothesis 4: Commercial barcode APIs

### 5.1 Landscape

Four distinct families exist; they fail differently for Israeli groceries:

1. **General-purpose UPC/EAN databases** (Barcode Lookup, Go-UPC, EAN-DB, UPCitemdb, Barcode Spider, Digit-Eyes, brocade.io): aggregate marketplace/retailer listings, mostly US/EU.
2. **Food/nutrition APIs** (Chomp, Nutritionix, Edamam, Spoonacular, FatSecret, USDA FDC): richer nutrition schemas, overwhelmingly US-branded-food coverage.
3. **Authoritative registry** (GS1 "Verified by GS1"/GEPIR): ground truth for "who owns this GTIN" and basic attributes, but enterprise-gated.
4. **Enterprise catalog syndication** (Syndigo, Salsify, Icecat): brand-supplied content; contract sales, no self-serve — out of a student project's reach and not researched further.

### 5.2 Vendor-by-vendor summary

All prices/limits retrieved 2026-08-14 from the vendors' own pages unless labeled otherwise.

| Vendor | Entry price | Free tier / trial | Rate limits (entry) | Caching / storage terms | Israeli coverage evidence |
|---|---|---|---|---|---|
| **UPCitemdb** (<https://www.upcitemdb.com/api/>) | DEV **$99/mo** — 20 k lookups/day (overage $0.04/100) | **Yes — keyless** trial endpoint, 100 req/day/IP, burst 6 lookups/min | FREE: 6/min; DEV: 15/30 s | ToS reviewed (<https://upcitemdb.com/terms>): **no explicit caching prohibition found** [OBSERVED, non-lawyer reading] | **Tested (§5.3): 4/10 staples, 0/15 IL sample; marketplace-listing quality** |
| **Barcode Lookup** (<https://www.barcodelookup.com/api>) | **$99/mo** — 5 k calls (…$949/mo — 500 k) | Trial key on signup | per-minute limit exposed via `/rate-limits` endpoint | Site behind Cloudflare JS; ToS not retrievable this session — caching terms **[UNRESOLVED]** | Untested (key required). Claims 500 M+ products. |
| **Go-UPC** (<https://go-upc.com/plans>) | **$74.95/mo** — 5 k req (≈1.5 ¢/lookup) | Trial key on request | 2 req/s | ToS (<https://go-upc.com/terms-and-conditions/>): subscription grants retrieval and use in-app; **no explicit cache clause** [OBSERVED] | Untested. Claims 1 B+ items, "six continents". Infers missing check digits. |
| **EAN-DB** (<https://ean-db.com>) | **€9 / 5 k calls** (≈0.18 ¢); bulk/country dumps €0.005/barcode | **250 free calls** after registration | n/p | n/p (ToS not fetched) | Untested (JWT required). **Own stats page** (<https://ean-db.com/stats>): 70.7 M products but top categories = print books / e-books / music CDs; top languages EN/RU/NL/DE/FR — **no Hebrew**; grocery weakness inferred. Sells **country-filtered dumps** — a cheap way to buy the full 729 slice for evaluation (~thousands of € only if huge; 10 k barcodes ≈ €50). |
| **Barcode Spider** (<https://www.barcodespider.com/api>) | **$39/mo** — 10 k req | Free tier 100 req/day (key required), 7-day trial | free: 1 req/5 s; paid: 1 req/s; hard 100/min | ToS (<https://devapi.barcodespider.com/terms>): grants search/retrieve; no explicit cache clause [OBSERVED] | Untested (key required). Marketing claims "500 M–1.5 B records". |
| **Digit-Eyes** (<https://www.digit-eyes.com>) | Low-cost per-lookup model; pricing **not verified** this session | n/a | n/a | n/a | Untested. API spec PDF verified to exist (V3, HMAC-signed URLs); dated service. |
| **brocade.io** | Free, keyless | Open API `GET /api/items/{gtin14}` | n/p | Open data project | **Tested: 0/34** — effectively no Israeli data. |
| **Chomp** (<https://chompthis.com/api/>) | Limited: $0/mo + **$0.01/lookup**; Standard $25/mo + $0.001/req; Premium $299/mo | 5-day trial (paid tiers) | 30/min (Limited) | **Explicit tiered caching rights:** Limited = no caching; Standard = 24 h; Premium = indefinite storage. Must delete cached data on termination. | Untested (key required). "1.2 M+ products", US-centric branded foods; IL coverage **[UNRESOLVED]** but expected minimal. |
| **Nutritionix** (<https://developer.nutritionix.com/docs/v2>) | Enterprise/custom pricing; free dev tier (daily-capped, attribution) | Yes (small) | daily caps | n/p | Untested. US-restaurant/branded focus; secondary sources (ymove.app, selfhostednutrition.org, 2026) describe US-centric coverage. |
| **Edamam / Spoonacular / FatSecret** | ~$9–58/mo per product / from $5/mo points / contract (per secondary comparison ymove.app, 2026) | varies | varies | n/p | Untested; US/EU food focus; no IL claims found. |
| **Verified by GS1 / GEPIR** (<https://www.gs1.org/services/verified-by-gs1>) | Web UI free for spot checks; **API/batch = enterprise via local MO** (GS1 Israel) | n/a | n/a | Registry data; licensing via GS1 | Authoritative for 729 GTIN ownership + basic attributes where brand owners uploaded them. Not self-serve; **[UNRESOLVED]** GS1 Israel's terms/price for API access — requires contacting GS1 Israel. |

n/p = not published / not retrieved this session.

### 5.3 Empirical results (keyless services, 2026-08-14)

Same 34-barcode universe as §4.4 (10 staples + 15 OFF-derived `729*` + 9 Israel-tagged imports). Full raw table in Appendix B.

| Source | Staples (n=10) | `729*` sample (n=15) | Imports sample (n=9) |
|---|---|---|---|
| **Open Food Facts v2** | **9** | 15 (by construction) | 9 (by construction) |
| **UPCitemdb (trial)** | **4** | **0** | 4 |
| **brocade.io** | **0** | **0** | **0** |

UPCitemdb's four staple hits illustrate the *quality* problem beyond the hit-rate problem **[OBSERVED]** — titles are English marketplace listings, not catalog entries:

- `7290000066318` → "Bamba- Israeli Food Israelian Snack 80 Grams Pack" (brand Osem) — usable-ish;
- `7290000066141` → "Israeli Candies And Snacks Package//fast Delivery/" — a reseller bundle title, wrong granularity;
- `7290000284316` → "ISRAEL coca cola hebrew Paper Label **1993** 1.5 liter" — a collectible listing;
- `7290000176062` → "Elite Ground And Roasted Black Turkish Strong Orga…" — correct product (notably, the one OFF lacked).

**[OBSERVED] Wrong-product hit:** among the four import hits, UPCitemdb returned *"Women's Dale Of Norway 100% wool Sweater"* for `4000607851001` — which is Schogetten Alpine Milk Chocolate (GS1 Germany prefix; confirmed by OFF and the manufacturer). A "found" answer from marketplace aggregators is not necessarily the right product; any integration would need plausibility checks.

Latency: UPCitemdb median 606 ms (n=34). Its trial tier is genuinely usable for evaluation (keyless, 100/day/IP) but its Israeli-domestic data is Amazon/eBay-export exhaust, with **0/15** on Israel-focused OFF-known products. brocade.io returned HTTP 404 for all 34 codes. **[INFERENCE]** Community/US-centric aggregators cannot see products that are never listed on US marketplaces — which is most of an Israeli supermarket.

### 5.4 Cost picture at fridge-app scale

**[INFERENCE]** (arithmetic on verified prices): a small user base doing 5,000 external lookups/month would cost $0 on OFF; **$50/mo** on Chomp Limited (per-request); **≥$74.95/mo** on Go-UPC; **$99/mo** on Barcode Lookup/UPCitemdb DEV; ~€9 on EAN-DB. All of the paid options were either measured (UPCitemdb) or reasonably expected (EAN-DB stats; Chomp US focus) to underperform OFF specifically on Israeli domestic products — i.e., paying does not buy Israeli coverage. The only credible paid path to genuine Israeli catalog data is the **GS1 Israel / Verified by GS1** enterprise route, which is not self-serve and remains **[UNRESOLVED]** in cost.

### 5.5 H4 verdict

**Rejected as a primary source for Israeli groceries** — every testable commercial option had far worse Israeli coverage than OFF at nonzero cost, and returned lower-quality (marketplace-style, English-only) records when it hit. **Marginally useful as a supplementary fallback** for imported products (UPCitemdb resolved 4/9 imports, including a US Pringles code) and possibly for the occasional domestic product OFF lacks (it did have the Elite Turkish coffee). If a commercial fallback is ever added, the ToS caching asymmetry matters: Chomp's explicit "no caching on cheap tiers" model vs UPCitemdb/Go-UPC/Barcode Spider ToS with no located caching clause (non-lawyer reading; re-verify before persisting vendor data). Follow-ups that would firm this up without spending money: register for EAN-DB's 250 free calls and Barcode Spider's 100/day free key and run Appendix A's Set A+B against them; ask GS1 Israel about Verified-by-GS1 API terms.

---

## 6. Cross-source comparison (summary matrix)

| Criterion | Open Food Facts | UPCitemdb | Barcode Lookup / Go-UPC / EAN-DB / Barcode Spider | Chomp / Nutritionix etc. | Verified by GS1 |
|---|---|---|---|---|---|
| Israeli staples hit rate (measured) | **9/10** | 4/10 | not testable without key | not testable | n/a (registry) |
| Israel-focused sample (measured) | native | **0/15** | — | — | — |
| Hebrew product names | Yes (all staple hits) | No (English listings) | Unknown, unlikely | No | Brand-owner supplied |
| Photos | Yes (CC-BY-SA) | Sometimes (marketplace) | Claimed | Some | No |
| Nutrition data | Yes (rich on staples) | No | Partial claims | Yes (US) | No |
| Price | Free | $0 trial / $99 mo | $39–$949 mo / €9 per 5 k | $0+per-req … enterprise | Enterprise via GS1 IL |
| Right to cache into own DB | Yes (ODbL share-alike + attribution) | No prohibition found | Varies/unknown | Explicitly tiered (Chomp) | License via GS1 |
| Write-back / community fix | Yes | No | No | No | Brand owners only |
| Availability observed | Reads 100 %, search 0 % (503) | 100 % | — | — | — |

---

## 7. Claims register (for re-verification)

**Verified facts** (primary source, cited):
V1. GS1 prefix 729 = GS1 Israel; 020–029/040–049/200–299/0000000 are restricted-circulation ranges; 12-digit GTINs have an implied leading zero — <https://www.gs1.org/standards/id-keys/company-prefix>.
V2. GTIN mod-10 check-digit algorithm — <https://www.gs1.org/services/how-calculate-check-digit-manually>.
V3. OFF licenses: ODbL (DB) + DbCL (contents) + CC-BY-SA (photos); attribution + share-alike; French law; no-warranty; contributor sourcing rules — <https://world.openfoodfacts.org/terms-of-use>.
V4. OFF rate limits 15 read/min/IP, 10 search/min/IP, none on writes; global anti-crawl 503s; UA requirement; staging `world.openfoodfacts.net` (off/off); v3 current, v2 deprecated, v3 has no search — <https://openfoodfacts.github.io/openfoodfacts-server/api/>.
V5. OFF barcode normalization rules (≤7→8; 9–12→13; API normalizes read+write) — <https://openfoodfacts.github.io/openfoodfacts-server/api/ref-barcode-normalization/>.
V6. OFF exports: MongoDB dump + 14-day deltas, JSONL, Parquet (Hugging Face), CSV ~0.9 GB gz; "1 API call = 1 real scan" policy — <https://world.openfoodfacts.org/data>.
V7. Vendor pricing/limits as tabled in §5.2 — each vendor's cited page, retrieved 2026-08-14.

**Observed empirical results** (this session; reproduction in Appendices):
O1. OFF Israel counts: 3,554 (SaL prod) / 3,424 (staging facet); 729-prefix: 4,755 (SaL) / 4,650 (staging).
O2. Set A staples: OFF 9/10 with Hebrew+photos; miss = 7290000176062 (Elite Turkish coffee). UPCitemdb 4/10 (marketplace-style titles). brocade.io 0/10.
O3. UPCitemdb 0/15 on OFF-derived `729*` sample; 4/9 on imports, of which one hit was a wrong product (sweater record for a Schogetten chocolate GTIN). brocade.io 0/24 on Set B.
O4. OFF completeness — top-300 `729*` by scans: name 90.3 %, brand 79.7 %, quantity 68.3 %, Hebrew name 12.7 %. Set B canonical reads (n=24): images 23, >5 nutriments 21, Hebrew 5.
O5. OFF prod search/facets = HTTP 503 across a ~70-min window while product reads had median 304 ms; staging facets worked; Search-a-licious worked.
O6. Normalization behavior: OFF maps 12→13-digit zero-padded and 14→13; returns 404/status 0 on a wrong check digit (no validation). UPCitemdb returns 400 `INVALID_UPC` on wrong check digit; accepts 13/14-digit forms.
O7. OFF v2 unknown product = HTTP 404 + `status:0`; v3 envelope has `result.id`, `errors[]`, `warnings[]`.
O8. Wikidata has essentially no Israeli-grocery GTINs (1 result for `729*`, and it is a US GTIN-12).

**Reasonable inferences:** I1. Client-side check-digit validation is required (from O6). I2. RCN-prefixed codes can never resolve globally → pre-filter (from V1). I3. OFF is popularity-correlated in Israel → good first-scan experience despite thin catalog (from O1+O2 vs O4 skew). I4. Commercial aggregators structurally miss Israeli domestic SKUs (from O2/O3 + EAN-DB stats). I5. Caching OFF data into the app catalog creates an ODbL derivative database → attribution + share-alike obligations (from V3).

**Unresolved uncertainties:** U1. Origin of the stale "~8 k IL products" figure (recheck prod facet when not 503, or count the CSV/Parquet export). U2. ODbL derivative-vs-collective database boundary when mixing OFF rows with other sources. U3. Israeli chains' internal RCN encoding schemes (H1/H2 scope). U4. Hit rates of key-required vendors (EAN-DB, Barcode Spider, Barcode Lookup, Go-UPC, Chomp) on the Israeli test set — testable free via their trials with the Appendix A set. U5. GS1 Israel Verified-by-GS1 API pricing/terms. U6. Barcode Lookup ToS caching clause (site behind Cloudflare during session). U7. Existence/prevalence of EAN-8 on Israeli retail items.

---

## Appendix A — Test-set provenance (all barcodes are real, currently-sold Israeli-market products)

**Set A — curated staples.** Barcode identity grounded in non-OFF public sources (all accessed 2026-08-14). Discovery was via web search; grounding pages are listed so any agent can re-confirm:

| Barcode | Product | Grounding source(s) |
|---|---|---|
| 7290000066318 | במבה אסם 80 ג | Nestlé Professional IL official product page <https://www.nestleprofessional.co.il/sm/htyp-bmbh-qlsyt> (shows ברקוד field); savemycart.net/product/13778 |
| 7290000066141 | ביסלי גריל אסם 70 ג | Nestlé Professional IL <https://www.nestleprofessional.co.il/sm/htyp-bysly-btm-gryl>; savemycart.net/product/13781 |
| 7290004127329 | קוטג' תנובה 5% 250 ג | chp.co.il product page (barcode in title); cheapersal.co.il/product/7290004127329 |
| 7290104726712 | מילקי שוקולד שטראוס (מארז 8) | savemycart.net/product/21665; cheapersal.co.il/product/7290104726712 (sources disagree single-vs-multipack; OFF data says 1.36 l ⇒ multipack) |
| 7290004131074 | חלב תנובה 3% 1 ל קרטון | sk-m.co.il product page; greenbook.co.il/catalog/588/499/2782 |
| 7290000284316 | קוקה קולה 1.5 ל (ישראל) | pricez.co.il/Product/1271039; kipa.co.il price survey; (also on OFF IL) |
| 7290105964564 | חומוס אחלה 400 ג | savemycart.net/product/12688; chp.co.il (barcode in page) |
| 7290000170053 | שוקולד חלב מעולה (פרה) עלית 100 ג | chp.co.il; oshek.co.il/product/7290000170053; ynet recall article (barcode quoted) |
| 7290003029181 | שוקו יטבתה 1 ל | savemycart.net/product/14036; chp.co.il; cheapersal.co.il/product/7290003029181 |
| 7290000176062 | קפה טורקי עלית 100 ג | topharm.co.il product page (מק"ט = barcode); chp.co.il; savemycart.net/product/2500 |

*Bias disclosure:* Set A is deliberately iconic products (the "first scans" scenario). An unbiased random-SKU coverage test requires an OFF-independent SKU sampling frame (e.g., a chain's price-transparency file — H1/H2 scope; blocked from this session's scope). Treat 9/10 as an upper bound on OFF's general coverage.

**Set B — OFF-derived sample (n=24), for commercial-API probing + OFF completeness.** Sampled 2026-08-14 from Search-a-licious with `sort_by=-unique_scans_n`: `q=code:729*` ranks 1–5, 51–55, 201–205, 801–805, 2001–2005 (first 15 used), plus `q=countries_tags:"en:israel"` ranks 1–8 and 161–168 filtered to non-729 codes (9 used). Codes: 7290104507045, 7290105690005, 7290002793212, 7290010739820, 7290001184936, 7290112966889, 7290013997432, 7290000060477, 7290109359199, 7290111562396, 7290109354941, 7290112969309, 7290117261545, 7290117261569, 7290106727984; imports: 5411188112709, 4000607852008, 4000607851001, 4009900484060, 8853662056661, 8076809513739, 3110846202159, 0038000138430, 5900020015174.

## Appendix B — Reproduction guide (commands actually used)

All calls used header `User-Agent: FridgeTrackerResearch/0.1 (university-project-research)`. Scripts were throwaway files under `/tmp/barcode_research/` (not part of the app); everything needed to re-run is below.

**B.1 OFF product read (per barcode, ≤15/min):**

```bash
curl -s "https://world.openfoodfacts.org/api/v2/product/7290000066318?fields=code,product_name,product_name_he,brands,quantity,categories_tags,image_front_url,lang,nutriments" \
  -H "User-Agent: FridgeTrackerResearch/0.1 (research)"
# found  -> HTTP 200, {"status":1,...}
# missing-> HTTP 404, {"status":0,"status_verbose":"product not found"}
```

**B.2 Counts:**

```bash
# Search-a-licious (production, worked throughout):
curl -s 'https://search.openfoodfacts.org/search?q=countries_tags:"en:israel"&page_size=1'   # -> count: 3554
curl -s 'https://search.openfoodfacts.org/search?q=code:729*&page_size=1'                    # -> count: 4755
# Product Opener facets (prod was 503 all session; staging worked):
curl -s -u off:off 'https://world.openfoodfacts.net/country/israel.json?fields=code&page_size=1'            # -> count: 3424
curl -s -u off:off 'https://world.openfoodfacts.net/facets/codes/729xxxxxxxxxx.json?fields=code&page_size=1' # -> count: 4650
```

**B.3 Normalization probes (results inline):**

| Request code | OFF result | UPCitemdb result |
|---|---|---|
| `034000470693` (12-digit) | 200, returned `code=0034000470693` | — |
| `0034000470693` (13-digit) | 200, same product | — |
| `00034000470693` (14-digit) | 200, same product, code returned as 13-digit | — |
| `07290000066318` (14-digit Bamba) | 200, `code=7290000066318` | 200, `OK`, total 1 |
| `7290000066319` (bad check digit) | **404**, `status:0` (no validation) | **400**, `INVALID_UPC` |

**B.4 Completeness slice:** 300 top-scanned `729*` products via Search-a-licious (`page_size=100`, pages 1–3, `fields=code,product_name,brands,quantity,unique_scans_n`) → has_name 271, has_brands 239, has_quantity 205, Hebrew-regex name 38.

**B.5 Commercial keyless lookups:**

```bash
# UPCitemdb trial (100/day/IP, keep <=6/min):
curl -s "https://api.upcitemdb.com/prod/trial/lookup?upc=7290000066318"
# brocade.io (expects GTIN-14):
curl -s "https://www.brocade.io/api/items/07290000066318"   # -> 404 for all 34 tested codes
```

**B.6 Raw per-code outcome matrix (found ✅ / not-found ❌), 2026-08-14:**

| Code | OFF | UPCitemdb | Brocade |   | Code | OFF | UPCitemdb | Brocade |
|---|---|---|---|---|---|---|---|---|
| 7290000066318 | ✅ | ✅ | ❌ | | 7290109359199 | ✅ | ❌ | ❌ |
| 7290000066141 | ✅ | ✅ | ❌ | | 7290111562396 | ✅ | ❌ | ❌ |
| 7290004127329 | ✅ | ❌ | ❌ | | 7290109354941 | ✅ | ❌ | ❌ |
| 7290104726712 | ✅ | ❌ | ❌ | | 7290112969309 | ✅ | ❌ | ❌ |
| 7290004131074 | ✅ | ❌ | ❌ | | 7290117261545 | ✅ | ❌ | ❌ |
| 7290000284316 | ✅ | ✅ | ❌ | | 7290117261569 | ✅ | ❌ | ❌ |
| 7290105964564 | ✅ | ❌ | ❌ | | 7290106727984 | ✅ | ❌ | ❌ |
| 7290000170053 | ✅ | ❌ | ❌ | | 5411188112709 | ✅ | ❌ | ❌ |
| 7290003029181 | ✅ | ❌ | ❌ | | 4000607852008 | ✅ | ❌ | ❌ |
| 7290000176062 | ❌ | ✅ | ❌ | | 4000607851001 | ✅ | ✅ | ❌ |
| 7290104507045 | ✅ | ❌ | ❌ | | 4009900484060 | ✅ | ❌ | ❌ |
| 7290105690005 | ✅ | ❌ | ❌ | | 8853662056661 | ✅ | ✅ | ❌ |
| 7290002793212 | ✅ | ❌ | ❌ | | 8076809513739 | ✅ | ✅ | ❌ |
| 7290010739820 | ✅ | ❌ | ❌ | | 3110846202159 | ✅ | ❌ | ❌ |
| 7290001184936 | ✅ | ❌ | ❌ | | 0038000138430 | ✅ | ✅ | ❌ |
| 7290112966889 | ✅ | ❌ | ❌ | | 5900020015174 | ✅ | ❌ | ❌ |
| 7290013997432 | ✅ | ❌ | ❌ | | | | | |
| 7290000060477 | ✅ | ❌ | ❌ | | | | | |

(Set B rows are ✅ for OFF by construction — they were sampled from OFF; only Set A's OFF column is a coverage measurement. ✅ means "returned a record", not "returned the *correct* record": UPCitemdb's hit on 4000607851001 was a wrong product, see §5.3.)

## Appendix C — Source index (all accessed 2026-08-14)

**GS1:** company-prefix table <https://www.gs1.org/standards/id-keys/company-prefix> · check digit <https://www.gs1.org/services/how-calculate-check-digit-manually> · GTIN overview <https://www.gs1.org/standards/id-keys/gtin> · GenSpecs <https://ref.gs1.org/standards/genspecs/> · Verified by GS1 <https://www.gs1.org/services/verified-by-gs1>.
**Open Food Facts:** API intro <https://openfoodfacts.github.io/openfoodfacts-server/api/> · barcode normalization <https://openfoodfacts.github.io/openfoodfacts-server/api/ref-barcode-normalization/> · data & exports <https://world.openfoodfacts.org/data> · terms <https://world.openfoodfacts.org/terms-of-use> · Search-a-licious <https://search.openfoodfacts.org> (OpenAPI at `/openapi.json`) · staging <https://world.openfoodfacts.net> (basic auth off/off).
**Vendors:** UPCitemdb <https://www.upcitemdb.com/api/>, plan table <https://www.upcitemdb.com/wp/docs/main/development/plan/>, terms <https://upcitemdb.com/terms> · Barcode Lookup <https://www.barcodelookup.com/api> · Go-UPC <https://go-upc.com/plans>, docs <https://go-upc.com/docs>, T&C <https://go-upc.com/terms-and-conditions/> · EAN-DB <https://ean-db.com>, stats <https://ean-db.com/stats> · Barcode Spider <https://www.barcodespider.com/api>, docs <https://devapi.barcodespider.com/documentation>, terms <https://devapi.barcodespider.com/terms> · Digit-Eyes spec <https://www.digit-eyes.com/specs/UPCAPIImplementation.pdf> · Chomp <https://chompthis.com/api/> · Nutritionix <https://developer.nutritionix.com/docs/v2> · brocade.io <https://www.brocade.io>.
**Secondary (labeled where used):** ymove.app nutrition-API comparison (2026) · selfhostednutrition.org Nutritionix pricing notes (2026) · calorieapi.com Nutritionix pricing blog (2026).
**Israeli product grounding pages:** listed per barcode in Appendix A (nestleprofessional.co.il, chp.co.il, savemycart.net, cheapersal.co.il, oshek.co.il, pricez.co.il, topharm.co.il, sk-m.co.il, greenbook.co.il, kipa.co.il, ynet.co.il).
