# Fridge Tracker — Product Specification

| | |
|---|---|
| **Course** | Internet Technologies — Become a Full-Stack Engineer (RUNI CS 2026, final assignment) |
| **Document role** | Assignment stage 2 — product specification (business and product perspective) |
| **Status** | Approved for implementation. Written **before** any application code, per the assignment's required work order. |
| **Date** | 2026-08-15 |
| **Companion documents** | `docs/ARCHITECTURE.md` (stage 3 — software architecture), `docs/TECHNICAL_DESIGN.md` (stage 4 — detailed technical design) |

---

## 1. Product Overview

**Fridge Tracker** is a mobile-first web application that lets a household know, at any moment, what is in its fridge and what needs to be bought again.

The core loop: after grocery shopping, the user opens the app on their phone and scans each product's barcode (or finds it by search, or types it in manually). The product is identified — by name, brand, and package size, in Hebrew where the product is Israeli — and added to the user's fridge. As food is consumed, the user updates each item with one tap (Full → ¾ → ½ → ¼ → Finished). Before the next shopping trip, a restock view shows what is running low and what was finished recently.

The product is built specifically for the **Israeli market**: it ships with a locally seeded catalog of Israeli grocery products keyed by barcode, so scanning a carton of Tnuva milk or a bag of Bamba works out of the box, with Hebrew product names — something no mainstream international tool provides.

---

## 2. The Problem

Households manage their fridge from memory, and memory fails in predictable ways:

- **Staples run out unnoticed.** The milk is discovered empty at breakfast, after the shopping trip.
- **Food spoils invisibly.** Items at the back of the fridge are forgotten until they are thrown away — wasted money and wasted food.
- **Shopping lists are rebuilt from scratch.** Before every trip, someone physically inspects the fridge or guesses, and duplicates or gaps follow.
- **Partial quantities are invisible.** "We have hummus" and "we have one spoon of hummus left" are very different facts, and no mental model tracks the difference reliably.

For Israeli households specifically there is an additional gap: existing inventory and scanning apps are built on international product databases with weak coverage of Israeli products. Scanning a local barcode in such apps typically returns nothing, which makes the core convenience — point the camera, get the product — not work in Israel.

## 3. Users and Customer

| | |
|---|---|
| **Users** | Members of a household who do regular grocery shopping and cooking — in Israel. Primary device: their phone. No technical skill assumed beyond using a camera and a website. |
| **Customer** | The household itself (B2C). The person who signs up is the buyer and the beneficiary; there is no separate paying organization. In the university MVP each account represents one household fridge. |

The MVP has exactly **one user role**: an authenticated user managing their own fridge. There are no admins, no shared households, and no anonymous usage.

## 4. Business Goals and Value

The product's value proposition, in order of importance:

1. **Reduce food waste.** Items visible in an inventory (with "running low" and "finished" signals) are consumed or replaced deliberately instead of being forgotten and discarded. Wasted food is a direct, recurring household cost.
2. **Eliminate "we're out of it" moments.** The restock view converts fridge state into a ready shopping signal, so staples are replaced before they are missed.
3. **Save time.** Scanning a barcode is faster and more accurate than writing lists by hand; the restock view removes the pre-shopping fridge inspection.
4. **Fit the Israeli market.** Hebrew product names, Israeli barcodes, and a catalog that actually contains the products Israelis buy — a concrete gap left open by international tools.

These goals are what the software capabilities in §5 exist to serve. A deliberate scope decision follows from them: the MVP does everything **in-app and on-demand** (the user opens the app when shopping or cooking). Push/email nagging is not needed to deliver the value above and is explicitly out of the MVP (§9).

## 5. Software Capabilities Required

Each capability maps to the business goals it supports.

| # | Capability | What it must do | Serves goal |
|---|---|---|---|
| C1 | **Registration and login** | Email + password sign-up, sign-in, sign-out. Every fridge is private to its account; no data is visible to other users. | All (personal data requires an identity) |
| C2 | **Product identification** | Resolve a scanned or typed barcode to a product (name, brand, package size, image where available), via a local Israeli catalog first and an external fallback second. Also: free-text search of the catalog, and fully manual product creation. | 3, 4 |
| C3 | **Shared product catalog** | A pre-seeded catalog of Israeli grocery products (approximately 7–10k items) that grows over time: external lookups are cached into it, and manually created products join it. The catalog is shared reference data; fridge contents are private. | 3, 4 |
| C4 | **Fridge inventory management** | Add a product to the fridge in one or more units; view the fridge grouped by category (Dairy, Drinks, Snacks, …); delete items. | 1, 2 |
| C5 | **Consumption tracking** | Record, per physical unit, how much remains — Full / ¾ / ½ / ¼ / Finished — with a single tap. Keep a lightweight history of consumption actions. | 1, 2 |
| C6 | **Restock decision support** | A view that derives, from fridge state: what is running low, what was finished recently (and not yet replaced), and recent activity. One-tap "restocked" to re-add a finished item. | 1, 2, 3 |

## 6. Main User Journeys

### P1 — Sign up and log in

A new user creates an account with email and password and lands in an empty fridge with a clear call to add their first products. Returning users log in and land on their fridge. Logged-out visitors cannot see or reach any fridge data.

### P2 — Add products after shopping (the core journey)

The user has just returned from the supermarket, phone in hand.

1. **Scan (primary path).** The user opens *Add → Scan*, grants camera permission, and points the phone at a product's barcode. The product appears on screen — Hebrew name, brand, package size, photo where available — the user picks how many units they bought (default 1) and confirms. The item is in the fridge. Repeat per product; a practiced user spends a few seconds per item.
2. **Search (equal-class path).** The user types part of a product name (Hebrew or English) in *Add → Search*, picks the product from the results, chooses units, confirms.
3. **Manual (always-available path).** The user fills a short form — name (required), and optionally barcode, brand, package size, category — and the product is created and added. Manually created products join the shared catalog, so the next user who scans that barcode finds it.

### P3 — Track consumption while cooking and eating

Standing at the open fridge, the user opens the app, taps an item's unit, and picks its new level: Full, ¾, ½, ¼, or Finished. One tap, no typing, no numbers. Items marked Finished move out of the active fridge list and start appearing in the restock view. Mistakes are correctable — a level can be set back up.

### P4 — Decide what to buy

Before shopping, the user opens *Restock* and sees three lists: **Running low** (units at ¼ or less), **Finished recently** (items finished in the last 14 days and not yet replaced), and **Recent activity** (the last few consumption events, for context). This view *is* the shopping list's first draft.

### P5 — Restock

Back from the store, for items the app already predicted, the user taps **Restocked** on a finished item and a fresh, full unit of the same product is added to the fridge — no re-scanning needed. Newly bought products go through P2.

### P6 — Correct and clean up

The user can delete any item from the fridge (bought by mistake, entered twice), and can raise an item's remaining level if it was lowered by mistake.

### P7 — Log out

Ends the session on shared devices; the fridge remains private to the account.

## 7. Product Concepts and Rules

### 7.1 The fridge is a set of physical units

Each *unit* of a product is tracked individually. "Two cartons of milk, one of them half-finished" is represented exactly that way: two units — one Full, one ½. This matches how people actually think about their fridge and makes the consumption interaction unambiguous (you tap the specific carton you used).

### 7.2 Fractional consumption, five levels

Remaining quantity is an approximation by design: **Full / ¾ / ½ / ¼ / Finished**. Nobody weighs their hummus; a quarter-step estimate is accurate enough to drive restocking decisions, and it keeps the interaction to a single tap. The user sets the *new level* directly (tapping ½ means "about half is left"), rather than entering amounts consumed. Setting the same level twice is harmless.

### 7.3 Shared catalog, private fridge

Product identities (barcode, name, brand, size, category, image) are **shared reference data** — the same "Tnuva Cottage 5%" record serves every user. What is private is each user's fridge: which units they hold, how much remains, and their history. Users contribute back to the shared catalog passively: an external-lookup hit is cached for everyone, and a manual product created by one user is findable by all.

### 7.4 Restocking is derived, not scheduled

"Running low" and "finished recently" are computed from current fridge state whenever the user opens the restock view. Nothing is scheduled, no notification state is stored, and the information is always current. An item leaves "finished recently" when the user restocks that product or after 14 days.

### 7.5 Categories

Products carry one category from a fixed, product-owned taxonomy: **Dairy, Meat & Fish, Vegetables, Fruit, Drinks, Sauces & Spreads, Snacks, Prepared, Frozen, Other**. Categories exist to make the fridge scannable at a glance; they are assigned automatically where possible and chosen by the user for manual entries.

### 7.6 Language

The UI is in **English**; product names are shown in their native language — usually Hebrew — and rendered correctly for right-to-left text (`dir="auto"` on name elements). This is a deliberate scope decision for the MVP: it keeps the layout left-to-right while treating Hebrew product data as a first-class citizen.

## 8. Product Entry Methods and Fallback Behavior

A hard product rule: **the user is never blocked.** Every entry path ends with the product in the fridge or a clear next step. The identification chain and its fallbacks:

| Situation | What the user experiences |
|---|---|
| Scanned barcode is in the local Israeli catalog | Product appears immediately — the common case for Israeli groceries, with no dependency on any external service. |
| Barcode is not in the catalog | The app silently checks an external community database (Open Food Facts). If found, the product appears as usual and is cached into the catalog so the next scan — by anyone — is local. |
| Barcode unknown everywhere | The manual-entry form opens **prefilled with the scanned barcode**; the user types a name and confirms. Their entry enriches the shared catalog. |
| Barcode misread by the camera (invalid code) | Instant "couldn't read that — try again" prompt; invalid codes are detected on-device before any lookup. |
| Weighed-goods / store-internal barcode (deli, produce; printed by the store scale) | These codes are store-specific by barcode-standard design and can never resolve in any database. The app recognizes them up front and routes straight to manual entry with an explanation. |
| Camera permission denied, or no camera | A typed barcode field is always available under the scanner, and Search and Manual remain equal-class paths. |
| External database down or slow | The lookup gives up quickly (a few seconds) and falls back to manual entry. The core demo flow never depends on the external service being up. |

## 9. MVP Scope

The MVP is scoped to be **small, clear, useful, secure, and well-built** — the assignment's stated grading preference — and matches the approved implementation plan exactly.

### In scope (the demo)

1. Sign up / log in / log out (email + password).
2. Add product to fridge via **scan**, **search**, or **manual creation**, with multiple units.
3. Product identification chain: local seeded catalog → Open Food Facts fallback (cached) → manual entry.
4. Fridge inventory view grouped by category, per-unit remaining level, item deletion.
5. Consume action: set a unit's remaining level (Full/¾/½/¼/Finished).
6. Restock view: running low + finished recently + recent activity + one-tap restock.
7. Pre-seeded Israeli product catalog (~7–10k products) so scanning and search work with no external dependency.

### Explicitly out of scope for the MVP (stretch — only if the MVP is stable, tested, and documented first)

- Email restock digest (would require scheduled jobs and an email provider — not required by the assignment).
- Seeding a second retail chain for broader catalog coverage.
- Expiry dates and "expiring soon".
- PWA installation (home-screen app).
- Contributing photos of missing products back to Open Food Facts.

### Non-goals (rejected for this product, not merely deferred)

- Nutrition tracking, OCR, or AI product recognition.
- Price data or price comparison of any kind.
- Household sharing / multi-user fridges / roles and permissions beyond a single authenticated user.
- Native mobile apps.
- Always-fresh mirroring of supermarket catalogs (a one-time seed plus organic growth is sufficient for this product).

## 10. Success Criteria for the University MVP

The MVP is successful if all of the following hold, on the deployed production URL, on a real phone:

1. **The full loop works end-to-end:** a new user can sign up, add a product by scanning a real Israeli barcode, add another by search and one manually, consume a unit down to Finished, see it in the restock view, and restock it — with no developer intervention.
2. **First-scan experience is local:** common Israeli staples resolve from the seeded catalog without any external call.
3. **No dead ends:** misreads, unknown barcodes, store-internal codes, denied camera permission, and external-service outages all land the user in a working alternative path (§8).
4. **Privacy holds:** one user can never see or modify another user's fridge (enforced at the database layer and verified by tests).
5. **Mobile-first quality:** the primary flows are comfortable one-handed on a phone (iOS Safari and Android Chrome).
6. **Assignment completeness:** all ten required submission items (deployed app, repository, this document and its companions, test spec and code, scalability and security documents, setup instructions, presentation) are delivered by **September 6, 2026**.

## 11. Assumptions and Constraints

- **Mandated stack:** Next.js + TypeScript, Supabase (database and auth), Vercel deployment, public URL — fixed by the assignment.
- **Timeline:** ~3 weeks to final submission; scope discipline in §9 exists to protect quality within it.
- **One fridge per account:** the household is modeled as a single account in the MVP.
- **Seeded catalog coverage is finite:** roughly 7–10k products from one major retail chain's statutory price-transparency data. The fallback chain (§8) exists precisely because no catalog covers everything.
- **Israeli data is legally clean to use:** the seed source is published under a statutory free-reuse provision (including commercial use); the external fallback database is open-licensed with attribution. Details and evidence are in the architecture document and the research reports.

## 12. Assignment Requirement Mapping (stage 2)

| Assignment requirement | Where addressed |
|---|---|
| The problem the product solves | §2 |
| Who the product's users are | §3 |
| Who the customer is | §3 |
| The product's business goals | §4 |
| Software capabilities needed to support the business goals | §5 |
| Main processes the product enables users to perform | §6 (registration/login, adding information, receiving recommendations-equivalent restock signals, managing inventory) |

## 13. References

- `docs/ARCHITECTURE.md` — how the system is structured to deliver this specification.
- `docs/TECHNICAL_DESIGN.md` — the detailed pre-implementation design.
- `docs/IMPLEMENTATION_PLAN.md` — the approved implementation plan this specification is derived from.
- `docs/research/ISRAELI_RETAIL_DATA.md`, `docs/research/BARCODE_APIS.md` — verified research behind the Israeli-catalog and barcode-lookup product decisions.
