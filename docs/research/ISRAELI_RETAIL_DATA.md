# Israeli Retail Product & Price Data — Research Report

| | |
|---|---|
| **Research date** | 2026‑08‑14 (all live probes and "current status" statements refer to this date) |
| **Scope** | Hypothesis 1: consuming Israel's statutory **Price Transparency data** directly. Hypothesis 2: consuming it via the **OpenIsraeliSupermarkets** open‑source project. Plus licensing / operational implications of both. |
| **Out of scope** | Open Food Facts and commercial barcode APIs, except one short comparison paragraph (§6.3) where strictly needed. |
| **Consuming project (context)** | "Fridge Tracker" — a university fullstack final (Next.js / TypeScript / Supabase / Vercel) that needs an Israeli grocery **product catalog keyed by barcode** (EAN‑13 → Hebrew name, manufacturer, package size) to resolve phone‑camera barcode scans. Price data itself is secondary for this product. |
| **Author** | AI research agent; written to be usable by an agent/human with no access to this conversation. |

## 0. Epistemic legend

Every substantive claim below is tagged:

- **[VERIFIED]** — read directly from a primary source (statute text, regulation text, repository source code, license file) during this session.
- **[OBSERVED]** — empirical result reproduced live during this session (HTTP/FTP probes, file downloads, counts). Dated 2026‑08‑14 unless stated otherwise.
- **[INFERENCE]** — reasonable conclusion from verified/observed facts; not itself directly sourced.
- **[UNCERTAIN]** — could not be resolved this session; includes instructions for how to resolve.

Section 8 is a source register with URLs and re‑verification instructions.

---

## 1. Executive summary

1. **The data exists because of a statute, not goodwill.** Israel's *Law for Promotion of Competition in the Food and Pharm Sectors, 5774‑2014* (חוק קידום התחרות בענפי המזון והפארם) Chapter C obliges every "large retailer" to publish, per store, machine‑readable files of all grocery prices and promotions, updated within one hour of a checkout price change, with criminal penalties for non‑compliance. **[VERIFIED]**
2. **Reuse is explicitly free, including commercial reuse.** Section 30(e) of the law states that *any person* may access and use the published data "freely and without payment, for private or commercial purposes." This is the strongest possible licensing position for Hypothesis 1. **[VERIFIED]**
3. **There is no central government feed.** Each chain publishes on its own portal (or a hosting provider's portal). The Consumer Protection Authority only publishes a page of links on gov.il. In practice the ~35+ obligated chains cluster into ~6 portal "families" (Cerberus/NCR FTP, BinaProjects, Laibcatalog, PublishPrice, self‑hosted web portals, Wolt's gateway). **[VERIFIED from scraper source + probes; gov.il page itself was bot‑blocked this session]**
4. **The data is real and healthy today.** Live probes on 2026‑08‑14: Shufersal's portal served a full per‑store catalog of 6,502–7,468 items (~97 % of item codes are 13‑digit GTINs; ~7 % weighted items with pseudo‑barcodes); the Cerberus FTP server accepted the published `RamiLevi` username with an empty password; BinaProjects and Laibcatalog endpoints answered. **[OBSERVED]**
5. **OpenIsraeliSupermarkets is a genuinely useful, actively maintained wrapper — with two hard caveats.** (a) **Its code and its Kaggle data dumps are *non‑commercial* licensed** (custom license / CC BY‑NC‑SA 3.0 IGO), unlike the underlying data, which is free for any use. (b) **Its hosted API/website was down during this session** and the maintainer's own roadmap describes the infrastructure as a "small unstable instance". Self‑running their scraper (or writing your own ~100‑line fetcher for one chain) avoids caveat (b); only writing your own avoids caveat (a) for a commercial future. **[VERIFIED + OBSERVED]**
6. **For the Fridge Tracker use case** (one‑time/occasional catalog seeding, barcode→product lookup): Hypothesis 1 consumed directly is fully sufficient, legally clean, and technically small (one chain's `PriceFull` files ≈ 330–380 KB gzipped per store, parseable with any XML library). Hypothesis 2 is a legitimate accelerator for a non‑commercial academic project (with attribution), and its Kaggle dataset is the easiest bulk source — but do not build a commercial dependency on it without written permission. **[INFERENCE from 1–5]**

---

## 2. Legal basis (shared foundation for both hypotheses)

### 2.1 The statute

- Official current name: **חוק קידום התחרות בענפי המזון והפארם, התשע"ד‑2014** ("Law for the Promotion of Competition in the Food and Pharm Sectors, 5774‑2014"). Originally the "Food Sector" law; renamed when a 2024 amendment (תשפ"ד‑2) extended it to large pharm retailers. **[VERIFIED — consolidated text on Hebrew Wikisource, read 2026‑08‑14]**
- Chapter C ("שקיפות מחירים", Price Transparency), sections 29–31, is the relevant part:
  - **§29 (definitions):** "מצרך" (product) = food and any other product sold in a store **except** electronics, textiles, clothing/footwear, optics, jewelry, wallets/bags, toys, office supplies, housewares, books, newspapers, perfumes, makeup and preparations. "Large retailer" = as defined in §2 of the law, provided average store sales area > 120 m² (non‑online), **plus** (since the 2024 amendment) "large pharm retailer" per §21a — pharm chains with annual revenue above ₪450 M (indexed; ₪461,899,261.99 for 2026) and ≥ 12 pharm stores. **[VERIFIED]**
  - **§30(a):** each large retailer must publish on the internet, separately per store, the current total price (incl. VAT and unavoidable charges) of every product it sells, updated **no later than one hour** after the price changes at the store's registers. **[VERIFIED]**
  - **§30(b):** publication must be in a **machine‑readable file** (per the Computers Law 1995 definition) enabling ongoing basket comparison; the retailer must give the regulator its publication URL, and the regulator (Consumer Protection and Fair Trade Authority) must publish a page of links to all such URLs. **[VERIFIED]**
  - **§30(d):** minimum content: product list (items in stock near publication time), prices incl. prices for different consumer types, and every "special sale" (promo) incl. conditions and expiry. **[VERIFIED]**
  - **§30(e) — the reuse clause, quoted verbatim:**
    > "כל אדם רשאי לגשת לפרסום, למידע ולנתונים הכלולים בו לפי סעיפים קטנים (א) ו־(ד), ולהשתמש בהם, באופן חופשי ובלא תמורה, לצרכים פרטיים או מסחריים"
    (Translation: *"Any person may access the publication, the information and the data included in it under subsections (a) and (d), and use them, freely and without payment, for private or commercial purposes."*) **[VERIFIED — Wikisource consolidated text]**
  - **§31 (penalties):** a large retailer that fails to publish as required, or publishes misleading information, is liable to three months' imprisonment or a fine (7× the Penal Law §61(a)(2) amount). **[VERIFIED]**
- The transparency obligation became operative on **20 May 2015** for the (then) 19 largest chains. **[VERIFIED from contemporaneous press (Ynet 19.5.2015, TheMarker 20.5.2015); the exact commencement instrument was not re‑read this session — treat the date as well‑corroborated secondary sourcing]**

### 2.2 The regulations (file specification)

**תקנות קידום התחרות בענף המזון (שקיפות מחירים), התשע"ה‑2014** (Price Transparency Regulations), published in Kovetz HaTakanot 7442, 20 Nov 2014, p. 218, signed by then‑Economy‑Minister Naftali Bennett. Full text read this session both as the original gazette PDF and as Wikisource's consolidated version (identical in substance — the regulations appear unamended). **[VERIFIED]** Key provisions:

- **Reg. 2:** each large retailer publishes on its website (1) a chain **Stores file**, and per store (2) a **Prices file** and (3) a **Promos file**. File names must carry a fixed prefix — chain code, sub‑chain code, store number — plus a timestamp of the file's dispatch time. Files must be **XML**, with exactly the fields defined in the schedules ("all the fields and only them").
- **Reg. 3 (update cadence):**
  1. every day a store is open, the **full** prices file and promos file must be published **no later than store opening time**;
  2. **within one hour** of a register price update, an incremental update file must be published (price changes, promos, added products, removed products);
  3. a changed stores file must be republished within one day.
- **Reg. 4 (accessibility):** downloads must be available as XML, Excel, **Gzip** and Deflate; every user must be able to retrieve any file on an ongoing basis; site availability must be **≥ 99.5 %**.
- **Reg. 5 (retention):** files, including updates, must be kept available for **three months** from publication. (So the public window is rolling; anyone wanting history must archive it themselves — this is exactly the gap the OpenIsraeliSupermarkets Kaggle dataset fills.)
- **Schedules:** First = Stores file fields (chain code, sub‑chain, store number, check digit, store type physical/online, chain/sub‑chain/store names, address, city, zip, last update date/time). Second = Prices file fields, notably: **the product's barcode as printed on the product; if none exists, an internal chain code is published instead, and for weighted goods the code is normalized per 1 kg / 1 L / 1 m**, plus an explicit internal‑barcode flag (0 = internal, 1 = real barcode), manufacturer‑given item name (50 chars), manufacturer/importer name, country of origin, item description, unit of quantity (per Israeli Standard 1145), quantity, unit of measure, pack quantity, total price, unit price, on‑promo flag, and record status (0 = remove discontinued item / 1 = price update / 2 = add item). Third = Promos file fields (promo code, club/multiple‑discount flags, promo id, description, start/end date‑times, target population 0 none/1 club/2 chain credit card/3 other, min quantity, max per purchase, discount %, min basket, discounted price, post‑promo unit price, restrictions, free text). Fourth = 12 promo type codes (0 none, 1 quantity‑conditional, 2 percent, 3 amount, 4 min‑basket, 5 retailer club, 6 conditional on other products, 7 second/third free, 8 second identical discounted, 9 second non‑identical discounted, 10 bundle, 11 other/textual). **[VERIFIED — schedules read in full]**
- **Notable schema facts for catalog builders:** there is **no category/taxonomy field**, **no image field**, and **no nutrition field** anywhere in the schedules — and Reg. 2 forbids extra fields ("ואותם בלבד"). Item names are ≤ 50 characters, Hebrew, often abbreviated. **[VERIFIED]**

### 2.3 What "licensing" means here

- The data is published by **private retailers under statutory duty**; it is not "government open data" and carries no Creative Commons license. Its reuse permission comes **directly from §30(e) of the statute** — free use, private or commercial. **[VERIFIED]**
- Individual prices and product attributes are facts; Israeli copyright doctrine does not protect facts as such, and the statute's explicit reuse grant moots the question for this dataset. No portal presented any ToS during this session's probes. **[INFERENCE — reasonable; not legal advice]**
- Practical consequence: **anyone may scrape, store, transform, and commercially exploit the transparency files themselves.** Restrictions can only re‑enter through *third‑party wrappers* (see §4.3). **[INFERENCE from VERIFIED §30(e)]**

---

## 3. Hypothesis 1 — consuming the Price Transparency data directly

### 3.1 Publication topology

There is **no single endpoint**. The canonical index is a gov.il page maintained by the Consumer Protection and Fair Trade Authority under §30(b):

- `https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations` (redirects to `https://www.gov.il/he/pages/cpfta_prices_regulations`). It lists every obligated retailer with its publication URL and, where the portal requires a login, the public username/password. **[UNCERTAIN in the narrow sense: the page is Cloudflare‑bot‑blocked and is an Angular SPA, so its current live content could not be read programmatically this session. Its existence, role, and general content are corroborated by (a) §30(b) of the law, (b) the OpenIsraeliSupermarkets scraper README linking to it as "the GOV.IL site" list, (c) dated maintenance comments in the scraper source tracking changes to this page as recently as 04.08.2026, and (d) multiple secondary sources. → To re‑verify: open the URL in a normal browser.]**

Portal families, reconstructed from the OpenIsraeliSupermarkets scraper source (current `main`, pushed 2026‑08‑05) and partially probed live. Chain IDs are the 13‑digit GS1‑style codes used in files ("ChainId"):

| Portal family | Mechanism | Chains (chain id) | Auth | Status probe 2026‑08‑14 |
|---|---|---|---|---|
| **Cerberus / NCR** — `url.retail.publishedprices.co.il` (web UI at `publishedprices.co.il`) | FTP (also web) directory of files | Rami Levy (7290058140886) user `RamiLevi`; Yohananof (7290803800003) `yohananof`; Osher Ad (7290103152017) `osherad`; Tiv Taam (7290873255550) `TivTaam`; Dor Alon (7290492000005) `doralon`; Keshet Teamim (7290785400000) `Keshet`; Stop Market (7290639000004) `Stop_Market`; Yellow/Paz (7290644700005) `Paz_bo`/`paz468`; Politzer (7291059100008) `politzer`; Fresh Market/Super Dosh (7290876100000) `freshmarket`; Cofix (7291056200008) `SuperCofixApp`; Salach Dabach (7290526500006) `SalachD`/`12345` | Per‑chain username, usually **empty password** (credentials are public) | **FTP login succeeded** with `RamiLevi` + empty password; server banner: "Welcome to Public Published Prices Server, Created by NCR L.T.D". (Directory listing itself failed from this network due to a blocked passive‑mode data channel — an environment issue, not auth.) **[OBSERVED]** |
| **Self‑hosted web portals** | Paginated HTML file lists | Shufersal (7290027600007) `prices.shufersal.co.il`; Super‑Pharm (7290172900007) `prices.super-pharm.co.il`; Hazi Hinam (7290700100008) `shop.hazi-hinam.co.il/Prices` | None | **Shufersal fully probed — see §3.3.** Files served from Azure Blob Storage (`pricesprodpublic.blob.core.windows.net`) via short‑lived SAS links. **[OBSERVED]** |
| **BinaProjects** — `{prefix}.binaprojects.com` | Web portal per chain | King Store (7290058108879) `kingstore`; Good Pharm (7290058197699) `goodpharm`; Zol VeBegadol (7290058173198) `zolvebegadol`; (more small chains per scraper list) | None | `kingstore.binaprojects.com/Main.aspx` returned HTTP 200. **[OBSERVED]** |
| **Laibcatalog** — `laibcatalog.co.il` (JSON API: `/webapi/api/getbranches`, `/webapi/api/getfiles`) | JSON API | Victory (7290696200003); Het Cohen (7290455000004); Mahsani HaShuk (7290661400001 / 7290633800006) | None | `getbranches?edi=7290696200003` returned live Victory branch JSON. **[OBSERVED]** (These chains migrated here from the older "Matrix catalog" source. **[VERIFIED — source comments]**) |
| **PublishPrice** — `publishprice.{infix}.co.il` | Web directory | Yeinot Bitan & Carrefour IL (7290055700007, infix `carrefour`); Quik (7291029710008, infix `quik`) | None | Not probed. |
| **Wolt gateway** | Static per‑date HTML indexes | Wolt Market (7290058249350) `wm-gateway.wolt.com/isr-prices/public/v1/index.html` (+ `YYYY-MM-DD.html`) | None | Not probed. Notable: even a delivery platform publishes transparency files. **[VERIFIED — source]** |

**The topology churns.** Documented changes in the scraper source alone: Mega's portal removed 1 July 2025 (absorbed by Carrefour); Cofix and Quik lost their dedicated gov.il entries on **4 Aug 2026** (folded under Rami Levy); Hazi Hinam moved from Cerberus to its own site; Victory/Het Cohen/Mahsani HaShuk moved from Matrix to Laibcatalog. Any direct consumer must expect to revisit endpoints a few times a year. **[VERIFIED — dated comments in `scrappers_factory.py` and scraper modules]**

### 3.2 Files, names, and cadence

Five file kinds circulate in practice (the regulation names three; publishers split full vs. incremental):

| File | Content | Example (observed) |
|---|---|---|
| `Stores...` | all stores of the chain | — |
| `PriceFull...` | full per‑store price catalog, published daily before store opening | `PriceFull7290027600007-001-001-20260814-030000.gz` |
| `Price...` | incremental price updates, ≤ 1 h after register change | `Price7290027600007-001-001-20260814-020000.gz` |
| `PromoFull...` / `Promo...` | full / incremental promotions | — |

Name pattern observed at Shufersal: `<Type><ChainId 13d>-<SubChainId 3d>-<StoreId 3d>-<YYYYMMDD>-<HHMMSS>.gz`. Other chains omit the sub‑chain segment or vary slightly; treat the name as chain‑specific. **[OBSERVED + INFERENCE]**

Cadence and retention are regulation‑fixed: full files daily, increments hourly, everything retrievable for 3 months, portal availability ≥ 99.5 % (see §2.2). **[VERIFIED]**

### 3.3 Empirical validation (live, 2026‑08‑14)

Probes run from an Israeli residential network:

1. **Shufersal portal** (`https://prices.shufersal.co.il/`): serves a paginated list (85 pages that morning) with filter controls `ddlCategory` = {0 All, 1 Prices, 2 PricesFull, 3 Promos, 4 PromosFull, 5 Stores} and `ddlStore` = all branches (the branch dropdown itself is a readable store directory of the chain's sub‑brands — שלי / דיל / יש / BE / יוניברס). Filtered listing URL: `/FileObject/UpdateCategory?catID=2&storeId=<n>`. **[OBSERVED]**
2. **Incremental `Price` file** (store 001): 1,442 bytes gz → 10.7 KB XML, 13 items. Structure exactly:
   ```xml
   <Root>
     <ChainID>7290027600007</ChainID>
     <SubChainID>001</SubChainID>
     <StoreID>001</StoreID>
     <BikoretNo>9</BikoretNo>
     <Items>
       <Item>
         <PriceUpdateTime>2026-08-14T00:10:00</PriceUpdateTime>
         <ItemCode>7290004846602</ItemCode>
         <ItemType>1</ItemType>
         <ItemName>גולש עגל מעובד ארוז קפוא</ItemName>
         <ManufactureName>זהר בשר עופות ובשר בע"מ</ManufactureName>
         <ManufactureCountry>IL</ManufactureCountry>
         <ManufactureItemDescription>...</ManufactureItemDescription>
         <UnitQty>קילוגרם</UnitQty>
         <Quantity>1.00</Quantity>
         <UnitOfMeasure>1קילוגרם</UnitOfMeasure>
         <bIsWeighted>1</bIsWeighted>
         <QtyInPackage>1</QtyInPackage>
         <ItemPrice>64.90</ItemPrice>
         <UnitOfMeasurePrice>64.90</UnitOfMeasurePrice>
         <AllowDiscount>1</AllowDiscount>
         <ItemStatus>1</ItemStatus>
       </Item>
       ...
   ```
   (Shufersal adds a non‑regulation `LastSaleDateTime` element; empty `ManufactureName` values occur.) **[OBSERVED]**
3. **Full catalogs:**
   - Store 001 (sub‑chain 001 "Sheli", small urban format): `PriceFull` = 332 KB gz → 5.2 MB XML → **6,502 items**; item‑code length distribution: **6,291 × 13‑digit (96.8 %)**, 80 × 8‑digit (EAN‑8), 47 × 12‑digit (UPC‑A), 83 × 11‑digit, 1 × 10‑digit; **501 items flagged `bIsWeighted=1`** (produce/deli sold per kg with internal per‑1kg codes).
   - Store 014 (sub‑chain 002 "Deal" discount format): 378 KB gz → 6.0 MB XML → **7,468 items**, 7,230 × 13‑digit (96.8 %). **[OBSERVED]**
4. **Cerberus FTP**: control connection + login OK with public `RamiLevi` user (see §3.1 table). **[OBSERVED]**
5. **BinaProjects, Laibcatalog**: endpoints alive (see table). **[OBSERVED]**

**Scale inference for catalog seeding:** one large store yields ~7–8 K distinct barcodes; the union across a chain's stores and sub‑chains, or across 2–3 chains, plausibly reaches the 20–40 K SKU range assumed in the project plan. Not directly measured. **[INFERENCE]**

### 3.4 Data semantics & quality caveats (for a barcode‑keyed catalog)

- **`ItemCode` is the printed barcode ~97 % of the time** at Shufersal (13‑digit GTIN; plus valid EAN‑8/UPC‑A shorter codes). The remainder are internal codes — mandated by the regulation when no barcode exists, mainly weighted goods normalized to 1 kg / 1 L / 1 m. Filter with the regulation's internal‑barcode flag where the chain emits it; Shufersal's files carry `bIsWeighted` (weighed goods) and `ItemType` instead — chains differ. **[OBSERVED + VERIFIED schedule]**
- **The same GTIN appears once per store per chain** — a catalog builder must dedupe across stores/chains; name/manufacturer strings for the same GTIN differ between chains (each retailer types its own 50‑char Hebrew name). Entity resolution across chains is a known open problem (OpenIsraeliSupermarkets keeps an `entity-matching` experiment repo for exactly this). **[OBSERVED (single chain) + VERIFIED (repo exists); cross‑chain divergence itself is INFERENCE/common knowledge — verify by diffing two chains' files for one GTIN]**
- **No categories, no images, no nutrition** (§2.2). Any taxonomy must be built by the consumer (keyword mapping, manual curation). **[VERIFIED]**
- **Divergence between regulation and practice:** the schedules define a 5‑digit "chain code", but real files use 13‑digit GS1‑style `ChainID`s; XML element names are an English convention (e.g. `ManufactureName`) that appears nowhere in the (Hebrew) regulation, and no official public XSD was located this session. Chains vary in envelope details, encodings and even field spellings — this is why parser libraries carry per‑chain code. **[OBSERVED + UNCERTAIN: an official technical XML spec may exist on gov.il; locate via the gov.il page in a browser]**
- **Quirks documented in the wild** (from OpenIsraeliSupermarkets source/README, current main): Stop Market's store files use a truncated chain id (`72906390`); Cofix publishes empty store files; Bareket and Quik are "flaky"; **some chain portals block access from outside Israel**. **[VERIFIED as maintainer‑reported claims; the geo‑blocking was not independently tested this session — test by fetching a portal from a non‑IL VPS]**

### 3.5 Operational implications of consuming H1 directly

- **Effort scales with chain count, not with data size.** One chain ≈ one small fetcher (list files → download gz → parse XML). The Shufersal path used in this session is ~30 lines of Python. All ~35 chains ≈ maintaining 6 portal engines + per‑chain config + monitoring — i.e., re‑implementing OpenIsraeliSupermarkets. **[OBSERVED + INFERENCE]**
- **Run fetchers from Israel (or test carefully).** Given the maintainer‑reported geo‑blocking of some portals, a Vercel serverless function or GitHub Actions runner (US/EU egress) may fail for some chains; Shufersal's Azure blob links worked from this session's IL network and its SAS links suggest CDN‑friendly hosting, but this was not tested from abroad. A local seed script (as the project plan already intends) sidesteps the issue entirely. **[VERIFIED claim + INFERENCE + UNCERTAIN for any specific chain from abroad]**
- **Freshness needs are decoupled:** for a *product catalog*, refreshing monthly or never (after seeding) is fine; the hourly/daily machinery only matters for *price comparison* products. **[INFERENCE]**
- **History requires self‑archiving** (3‑month rolling window, and the Cerberus engine's docstring notes it can't serve historical data). **[VERIFIED]**
- **Volume budgeting:** a full daily mirror of one chain ≈ (stores × ~350 KB gz) per day — Shufersal (~400 stores) ≈ ~140 MB/day gzipped for PriceFull alone; all chains multiply this to GBs/day (the community's daily Kaggle dump version is 24.77 GB — see §4.2). Seeding a catalog from a handful of stores is instead a few MB. **[OBSERVED anchors + INFERENCE for extrapolation]**
- **Legal exposure: none identified** for any polite‑rate consumption, given §30(e) and the credential publication model. Rate‑limit courtesy still applies (the portals exist to serve everyone; Reg. 4 forces the chains to provision capacity). **[INFERENCE from VERIFIED law]**

---

## 4. Hypothesis 2 — OpenIsraeliSupermarkets

### 4.1 What it is

- GitHub organization **`OpenIsraeliSupermarkets`** ("We utilize the data published by the Israeli supermarket to help the community"), Israel; single dominant maintainer **Sefi Erlich** (`erlichsefi`, 953 of ~965 contributions on the main repo); founded 2022 (main repo created 2022‑09‑08, org 2022‑12‑26); website `https://www.openisraelisupermarkets.co.il/`. **[VERIFIED — GitHub API]**
- Public repos (6): **`israeli-supermarket-scarpers`** [sic] (the downloader, 36 ⭐), **`israeli-supermarket-parsers`** (XML→DataFrame normalization, 9 ⭐), **`daily-publish-supermarket-data`** (orchestration: cron scraping → MongoDB/Kafka → Kaggle publishing → FastAPI server), `entity-matching`, `product-matching-service`, `.github`. **[VERIFIED]**
- **Actively maintained as of this week:** pushes on 2026‑08‑05 (scrapers) and 2026‑08‑08 (parsers, daily‑publish); scraper source contains gov.il‑tracking comments dated 04.08.2026; CI runs the full scrape test suite **daily** against the real portals, so breakage is detected quickly. PyPI package `il-supermarket-scraper` is at v1.0.8 with ~5.6 K downloads/month. A README line still says development is paused pending new issues ("beta software… development stopped until new issues will be found") — best read as "maintenance mode with active upkeep". **[VERIFIED / OBSERVED]**

### 4.2 The four consumption options it offers

| Option | What you get | Freshness | Access | Status 2026‑08‑14 |
|---|---|---|---|---|
| **A. Python package / Docker** (`pip install il-supermarket-scraper`; `erlichsefi/israeli-supermarket-scarpers` on Docker Hub) | Raw files from all ~36 supported chains onto your disk/queue (Kafka/memory), with per‑chain enable flags, file‑type filters, date filters | You run it; current snapshot only (no history) | Self‑hosted; no keys | Package installable; code current. **[OBSERVED/VERIFIED]** |
| **B. Parsers package** (`il-supermarket-parsers`) | Chain‑by‑chain XML→tabular (DataFrame/CSV) normalization handling per‑chain schema quirks | n/a (library) | Self‑hosted | Active repo. **[VERIFIED]** |
| **C. Kaggle dataset** [`erlichsefi/israeli-supermarkets-2024`](https://www.kaggle.com/datasets/erlichsefi/israeli-supermarkets-2024) | Daily‑versioned dump of the raw data, scraped every 4 h, pushed at midnight; per‑chain CSVs by file type (`price_file_*`, `price_full_file_*`, `promo_*`, `stores_*`) | Daily versions; **history preserved** (fills the 3‑month legal gap) | Kaggle account | Version 631, **24.77 GB**, "Updated 3 days ago" → pipeline alive. **[OBSERVED]** |
| **D. Hosted API** (FastAPI: `/list_chains`, `/list_file_types`, `/list_scraped_files`, `/raw/file_content`, health endpoints; Supabase‑JWT auth) | REST access to the raw scraped files without running anything | Daily data only (per roadmap) | Token (Supabase) | **Website/API unreachable this session** — Cloudflare tunnel error 1033, then HTTP 530, on both direct fetch and retry; Wayback has 2025 captures. Org roadmap self‑describes: "Running on small unstable in[s]tance", target "API accessible to support a few dozen customers". **[OBSERVED + VERIFIED]** |

The `daily-publish` repo also documents self‑hosting the whole pipeline (MongoDB + Kaggle token + Supabase project), i.e., you can run your own copy of option D. **[VERIFIED]**

### 4.3 Licensing — the critical difference from H1

- **All three main repos carry the same custom license** (`LICENSE.txt`, read verbatim this session; GitHub shows "Other/NOASSERTION", PyPI shows "CUSTOM"). Key terms:
  - grant: worldwide, royalty‑free, non‑exclusive, non‑transferable — **"for non‑commercial purposes only"**;
  - **attribution required** (name, repo link, changes indicated);
  - **commercial use expressly prohibited without prior written permission** from Sefi Erlich; all commercial rights reserved;
  - contributors assign broad rights to the licensor (who *may* use contributions commercially);
  - AS‑IS, Israeli governing law, Israeli courts. **[VERIFIED — full text read]**
- **The Kaggle dataset is licensed CC BY‑NC‑SA 3.0 IGO** — attribution + **non‑commercial** + share‑alike. **[OBSERVED — Kaggle page]**
- **Layered effect:** the *underlying facts* remain free for commercial use under §30(e) of the law, but H2's *code* and H2's *published data compilations* are contractually non‑commercial. Whether a court would enforce a non‑commercial restriction over a re‑extraction of the statutory facts from the Kaggle dump is untested and doubtful territory — but the safe reading is simple: **commercial products should collect the data themselves from the chains' portals; non‑commercial/academic projects can use everything H2 offers, with attribution.** **[VERIFIED terms + INFERENCE on the interaction; the enforceability point is UNCERTAIN and should be treated conservatively]**
- A university assignment is comfortably non‑commercial; note that the consuming project's assignment brief emphasizes "genuine real‑world business value", so if the product were ever commercialized, the H2 dependency would need to be replaced or licensed. **[INFERENCE]**

### 4.4 Reliability assessment

- **Strengths:** only one‑stop shop for all chains; daily real‑portal CI; documented handling of chain quirks and portal migrations (with dates); Docker/PyPI distribution; Kaggle provides history that the law does not; responsive to gov.il changes within days (04.08.2026 change already encoded by 05.08.2026 push). **[VERIFIED/OBSERVED]**
- **Weaknesses:** effectively a single‑maintainer project (bus factor 1); hosted API/website **down during this session** and self‑described as unstable — do not put it on a production request path; non‑OSI license limits future reuse; Kaggle dump is raw (per‑chain CSV of the XML), so schema unification is still on the consumer (option B helps). **[OBSERVED/VERIFIED]**

---

## 5. Head‑to‑head

| Dimension | H1: transparency data directly | H2: OpenIsraeliSupermarkets |
|---|---|---|
| Data license | Statutory free use, **incl. commercial** (§30(e)) **[VERIFIED]** | Code + dumps **non‑commercial**, attribution, permission needed for commercial **[VERIFIED]** |
| Engineering cost (1–3 chains, catalog seeding) | Low (~30‑line fetcher per self‑hosted portal; FTP client for Cerberus chains) **[OBSERVED]** | Lowest (pip/Docker one‑liner, or download Kaggle CSVs) **[VERIFIED]** |
| Engineering cost (all chains, continuous) | High — 6 portal engines, churn tracking, monitoring **[INFERENCE]** | Low — that is the project's whole point **[VERIFIED]** |
| Historical data | None beyond 3 months (self‑archive) **[VERIFIED]** | Kaggle daily versions since ~2024 **[OBSERVED]** |
| Freshness | Hourly increments, daily fulls **[VERIFIED]** | Scraped every 4 h; Kaggle daily; API "daily data only" **[OBSERVED/VERIFIED]** |
| Availability dependency | Chains' portals (legally ≥ 99.5 %; NCR/Azure/Bina infra observed healthy) **[OBSERVED]** | Adds a community layer; hosted API observed **down**; self‑hosting removes this **[OBSERVED]** |
| Schema normalization | Yours to build (per‑chain quirks) **[OBSERVED]** | Parsers package handles per‑chain quirks (non‑commercial license) **[VERIFIED]** |
| Product metadata depth | Name ≤ 50 chars, manufacturer, size, price; **no category/image/nutrition** **[VERIFIED]** | Same (it is the same data) **[VERIFIED]** |

### 5.1 Minimal external comparison (per scope, one paragraph)

Open Food Facts' live API reported **8,092 products tagged Israel** on 2026‑08‑14 **[OBSERVED]** — i.e., roughly the size of a *single* Shufersal store's assortment, but with categories, images and nutrition, under the ODbL share‑alike license. This confirms the working assumption that OFF is a useful *enrichment/fallback* layer (images, categories) but cannot replace transparency data as the primary Israeli barcode catalog; commercial barcode APIs were not researched here (see the companion report `docs/research/BARCODE_APIS.md`, if present, for that comparison).

---

## 6. Recommendations for the Fridge Tracker project

1. **Primary catalog: Hypothesis 1, consumed directly, seeded offline.** Download `PriceFull` files for a handful of large stores from 1–3 chains (Shufersal alone gives ~97 % GTIN‑keyed rows; add Rami Levy via Cerberus FTP and Victory via Laibcatalog JSON for breadth), dedupe by `ItemCode`, keep `ItemName`, `ManufactureName`, `Quantity`+`UnitQty`, drop or specially handle `bIsWeighted=1` rows. This is legally unencumbered (commercial‑grade), a few MB of data, and runs fine as the planned local `scripts/seed-catalog.ts`. **[Grounded in §3 OBSERVED results]**
2. **Run the seed from an Israeli network** (or verify each chosen chain works from abroad first) because of the reported geo‑blocking; never fetch chain portals at request time from Vercel. **[VERIFIED claim + INFERENCE]**
3. **H2 as an accelerator, eyes open.** For the academic deliverable it is legitimate (non‑commercial + attribution) to: use the Kaggle dataset for a quick bulk seed, or run the `il-supermarket-scraper` Docker image locally instead of writing fetchers. Do **not** architect against the hosted API (observed down; maintainer calls it unstable), and document the license boundary in the project's docs in case of future commercialization. **[VERIFIED/OBSERVED]**
4. **Do not attempt full‑market, always‑fresh mirroring** for this product; it buys nothing for a fridge inventory app and costs the entire H1 "all chains" maintenance burden. **[INFERENCE]**
5. **Attribute sources in the app/docs** regardless of obligation: "product data from Israel's price transparency publications (חוק שקיפות מחירים)" and, if used, "via OpenIsraeliSupermarkets (Sefi Erlich)" with repo link — the latter is contractually required, the former is good practice. **[VERIFIED requirement for H2]**

---

## 7. Unresolved uncertainties (with resolution paths)

1. **Current live content of the gov.il links page** (exact chain list, credentials table) — bot‑blocked this session. *Resolve: open in a browser; cross‑check against `scrappers_factory.py`.*
2. **Existence/location of an official technical XML spec (XSD/element dictionary)** beyond the regulation's Hebrew field tables. *Resolve: check the gov.il page's attachments section manually.*
3. **Which specific chains geo‑block non‑Israeli IPs** (maintainer‑reported, not enumerated). *Resolve: probe each candidate portal from a non‑IL VPS before relying on CI‑based seeding.*
4. **Chain‑wide distinct‑SKU counts** (only two stores sampled). *Resolve: download PriceFull for all stores of one chain and count distinct `ItemCode`s.*
5. **Enforceability of non‑commercial terms over re‑extracted statutory facts** from H2's dumps. *Resolve: legal advice; or moot it by scraping directly (recommended).*
6. **Hosted API's normal availability** (single observation of downtime; Wayback shows it up in 2025). *Resolve: monitor `openisraelisupermarkets.co.il` over a week before concluding anything beyond "not production‑grade".*
7. **Effective date nuance** — 20 May 2015 start is from contemporaneous press, not re‑verified in the gazette. *Resolve: check the regulations' commencement clause / amendment in Reshumot if the exact date ever matters.*

---

## 8. Source register (all accessed 2026‑08‑14)

**Hypothesis 1 — primary legal sources**
1. Consolidated law text: he.wikisource.org — "חוק קידום התחרות בענפי המזון והפארם, התשע"ד‑2014", Chapter C §§29–31 (incl. §30(e) reuse clause, §31 penalties, §21a pharm definitions, amendment markers תשע"ז/תשפ"ד‑2/תשפ"ו). `https://he.wikisource.org/wiki/חוק_קידום_התחרות_בענף_המזון`
2. Original regulations as gazetted: Kovetz HaTakanot 7442 (20.11.2014) p. 218, "תקנות קידום התחרות בענף המזון (שקיפות מחירים), התשע"ה‑2014" — full text incl. all four schedules. PDF mirror: `https://olaw.org.il/takanot/takanot-7442.pdf`
3. Consolidated regulations (identical in substance): `https://he.wikisource.org/wiki/תקנות_קידום_התחרות_בענף_המזון_(שקיפות_מחירים)`
4. Canonical government links page (bot‑blocked this session; verify in browser): `https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations`
5. Commencement press coverage (20.5.2015): Ynet `https://www.ynet.co.il/articles/0,7340,L-4658836,00.html`; TheMarker `https://www.themarker.com/consumer/2015-05-20/ty-article/0000017f-e1a3-d7b2-a77f-e3a718e90000`

**Hypothesis 1 — empirical endpoints probed**
6. Shufersal portal: `https://prices.shufersal.co.il/` (+ `/FileObject/UpdateCategory?catID=2&storeId=1|14`); files `Price7290027600007-001-001-20260814-020000.gz`, `PriceFull7290027600007-001-001-20260814-030000.gz` (6,502 items), `PriceFull7290027600007-002-014-20260814-030000.gz` (7,468 items), served from `pricesprodpublic.blob.core.windows.net`.
7. Cerberus/NCR FTP: `url.retail.publishedprices.co.il`, login `RamiLevi` / empty password → "230 Password Ok" (banner "Created by NCR L.T.D").
8. BinaProjects: `https://kingstore.binaprojects.com/Main.aspx` (HTTP 200).
9. Laibcatalog JSON API: `https://laibcatalog.co.il/webapi/api/getbranches?edi=7290696200003` (Victory branches JSON).

**Hypothesis 2 — primary sources**
10. Org: `https://github.com/OpenIsraeliSupermarkets` (6 repos; metadata via GitHub API: scrapers pushed 2026‑08‑05, parsers & daily‑publish 2026‑08‑08).
11. Scraper repo + README (chain list, geo‑block warning, flaky chains, Docker/queue modes, "development stopped" note): `https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers`; per‑chain configs under `il_supermarket_scarper/scrappers/*.py`; portal engines under `il_supermarket_scarper/engines/*.py` (incl. dated gov.il‑change comments, 04.08.2026).
12. Custom license (verbatim, identical file in scrapers & parsers repos): `https://raw.githubusercontent.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers/main/LICENSE.txt`
13. PyPI: `https://pypi.org/project/il-supermarket-scraper/` (v1.0.8, "License: CUSTOM", ~5,648 downloads/month, dependency & release history).
14. Pipeline & self‑host/API docs: `https://github.com/OpenIsraeliSupermarkets/daily-publish-supermarket-data` README (MongoDB/Kafka/Kaggle/Supabase, FastAPI endpoints).
15. Org roadmap ("small unstable instance", API for "a few dozen customers"): `https://github.com/OpenIsraeliSupermarkets/.github` profile README.
16. Kaggle dataset: `https://www.kaggle.com/datasets/erlichsefi/israeli-supermarkets-2024` — CC BY‑NC‑SA 3.0 IGO, daily, Version 631 = 24.77 GB, updated 3 days before access; per‑chain CSV layout.
17. Hosted site/API outage observations: `https://www.openisraelisupermarkets.co.il/` → Cloudflare error 1033 (14:21 UTC) and HTTP 530 (retry ~30 min later).

**Comparison (minimal, per scope)**
18. Open Food Facts live count: `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&page_size=1` → `count: 8092`.
