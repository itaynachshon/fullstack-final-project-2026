# Fridge Tracker — Test Specification

| | |
|---|---|
| **Course** | Internet Technologies — Become a Full-Stack Engineer (RUNI CS 2026) |
| **Document role** | Assignment stage 6 — formal test specification |
| **Application state** | Final (Wave 5) submission state; this document reflects the implemented repository, not only the earlier plan |
| **Date** | 2026-08-16 |
| **Automated tools actually used** | Vitest 4 and Playwright 1 (Chromium) |

## 1. Purpose

The strategy protects the product's main promise: an authenticated household can identify a product, add physical units to its private fridge, update each unit through the five remaining levels, see correct restock guidance, and add a fresh unit without losing finished history.

The tests prioritize failures that would make the application misleading or unsafe:

- a barcode resolving to the wrong path;
- a consume action recording the wrong sign or remaining level;
- a finished/restocked item disappearing incorrectly;
- one user seeing or changing another user's fridge;
- an external Open Food Facts failure blocking manual entry;
- a protected page or API becoming available without authentication.

The goal is meaningful confidence in the business loop, not a test for every rendering detail or line of code.

## 2. Scope

### In scope

- email/password login behavior and logged-out route/API protection;
- local-catalog barcode lookup, Open Food Facts fallback, and manual fallback;
- GTIN normalization, check digits, UPC-E expansion, and RCN classification;
- Hebrew/English catalog search, empty results, pagination logic, and invalid queries;
- adding 1–20 physical fridge units;
- manual product validation and shared-catalog duplicate behavior;
- inventory grouping, filtering, low-stock boundaries, deletion, and remaining levels;
- consumption-event sign and user-visible Consumed/Restored language;
- Finished state, recently-finished eligibility, restocking, fresh-row creation, and retained history;
- per-user authorization for fridge items and consumption events;
- scanner wrapper state, duplicate suppression, typed-code integration, self-hosted WASM configuration, and camera error copy;
- basic Chromium E2E behavior, responsive/manual QA, physical-phone camera QA, and production smoke checks.

### Out of scope

There are no tests for email notifications, cron, expiry dates, PWA behavior, price comparison, household sharing, OCR, AI, or nutrition because those features are not in the MVP. V2 foundation contracts (schemas, stub actions, migration SQL) are covered by Vitest in `src/lib/v2/`; feature UI, scheduler, and provider tests belong to agents F1–F3 (`docs/FEATURES_V2_PLAN.md` §9).

## 3. Test Layers and Ownership

| Layer | Actual tool | Responsibility |
|---|---|---|
| Static verification | TypeScript, ESLint, `next build` | Type safety, lint rules, production compilation, and route generation |
| Unit/domain | Vitest in `src/**/*.test.ts` | Pure barcode, category, fridge, scanner, formatting, and schema behavior |
| Integration with fakes | Vitest | Lookup chain, Open Food Facts client, Supabase query construction, and server actions without live credentials |
| Browser E2E | Playwright in `e2e/` | Real Chromium navigation, accessible UI interactions, actions, and page re-renders |
| Runtime permission integration | Playwright runner + two ordinary Supabase clients | Real RLS behavior with separate user JWTs; never uses the service-role key for tested operations |
| Manual device/visual | Checklists in this document | Physical cameras, mobile Safari/Chrome, responsive layout, and production deployment behavior |

React Testing Library is **not installed or claimed**. Existing UI confidence comes from pure behavior tests, Playwright, accessible selectors, and documented manual checks.

## 4. Unit Test Matrix

The colocated Vitest suite contains 16 files and 318 tests. Important areas are grouped below; this is not an individual-test inventory.

| Area | Important verified behavior | Main files |
|---|---|---|
| Barcode domain | whitespace/hyphen cleanup; EAN-8; UPC-A/short-code padding; GTIN-14 indicator handling; GS1 mod-10 check digit; invalid lengths/characters | `src/lib/barcode/barcode.test.ts` |
| RCN and UPC-E | `2xx`, `02x`, `04x`, and zero-prefix RCNs; all four UPC-E expansion patterns; scanner-to-classifier handshake | `src/lib/barcode/barcode.test.ts`, `src/components/scanner/upce.test.ts` |
| Lookup chain | invalid/RCN no-I/O short circuit; DB hit before OFF; OFF hit mapping/cache; cache race; 404; timeout/network/5xx degradation | `src/lib/products/lookup.test.ts`, `src/lib/products/offClient.test.ts` |
| Categories | ten-category taxonomy; Hebrew/English keywords; boundary and precedence rules | `src/lib/products/categorize.test.ts` |
| Search | escaped `ILIKE`; stable ordering; 20+1 pagination; empty page; query error | `src/lib/products/search.test.ts` |
| Fridge derivation | category/product grouping; stable unit identity; live/finished filters; low boundary at 25 versus 26; 14-day window; hide recently finished after a live replacement | `src/lib/fridge/derive.test.ts` |
| Consumption | `100 → 75` gives `+25`; `0 → 50` gives `−50`; finish/restore timestamps; no-op idempotence; positive maps to Consumed and negative to Restored | `src/lib/actions/fridge.test.ts`, `src/lib/fridge/derive.test.ts` |
| Restock actions | fresh 100% row; source finished row retained; invisible/foreign source treated as not found | `src/lib/actions/fridge.test.ts` |
| Scanner wrapper | permission/scanning states; first detection only; duplicate suppression; pause/rearm/retry; torch support; supported formats | `src/components/scanner/scanner-state.test.ts` |
| Scan decisions | found/not-found/invalid/RCN/network outcomes; invalid and RCN avoid lookup; duplicate detections do not repeat lookup | `src/components/fridge/add/scan-flow.test.ts` |
| ZXing deployment | installed and public WASM parity; expected local path; configuration registration | `src/components/scanner/zxing-config.test.ts` |
| Product images | allowlisted HTTPS Open Food Facts host; reject lookalike/foreign hosts, HTTP, script/data schemes, relative paths, and malformed values | `src/components/fridge/image-src.test.ts` |
| Validation | malformed UUIDs; five allowed levels; query bounds; unit bounds 1–20; trimmed required name; optional field lengths; category enum | `src/lib/schemas.test.ts` |
| Server actions | authentication gate, RLS-shaped no-row behavior, writes, compensation on event failure, generic user errors, and path revalidation | `src/lib/actions/*.test.ts` |

## 5. Integration and API Tests

### Credential-free automated coverage

Vitest uses operation-recording Supabase fakes and mocked `fetch`. This verifies application decisions without depending on a network:

- `addToFridge`, `setRemaining`, `deleteItem`, `restockItem`, and `createManualProduct`;
- DB-first lookup and OFF cache behavior;
- OFF timeout, network error, 5xx, malformed response, and not-found behavior;
- search query construction and pagination;
- action validation and generic error results.

Playwright's `@public` tests run against a real production build with placeholder Supabase values and verify:

- logged-out `/fridge`, `/add`, and `/restock` redirect to `/login`;
- logged-out `/api/products/search` returns HTTP 401 and the standard generic JSON error.
- `/login` and `/scan-test` have no horizontal overflow at all four required viewport sizes.

### Credential-gated automated coverage

With a migrated Supabase test project and `E2E_USER_A_*` credentials, Playwright additionally verifies:

- real UI login and protected-page access;
- malformed authenticated search request returns 400;
- a checksum-invalid lookup is a 200 domain result with `status: "invalid"`;
- manual product action, fridge page query, consume actions, restock query/action, and history query;
- deterministic no-result search handoff;
- optional seeded-product search.

Live OFF is deliberately excluded from CI. OFF behavior is already mocked at the unit/integration layer, and the browser smoke journey creates a deterministic manual product or uses a configured seeded catalog product.

## 6. E2E User Journeys

`e2e/fridge-flow.spec.ts` defines the main browser journeys.

### E2E-1 — Full fridge lifecycle

1. Log in as dedicated User A.
2. Open Add → Manual and create a run-unique product.
3. Add two physical units.
4. Verify both full units in `/fridge`.
5. Change one unit from 100% to 50%, then to Finished.
6. Verify it does **not** appear under Recently finished while another live unit of that product remains. This matches the implemented approved query.
7. Verify the recent activity says `Consumed <product> → ½`.
8. Finish the second unit.
9. Verify the product now appears under Recently finished.
10. Restock it.
11. Verify a new full unit appears.
12. Open the Finished filter and verify both historical finished rows remain.
13. Delete only rows created by the test, using the same ordinary user's RLS-scoped client.

### E2E-2 — Typed barcode fallback without camera

- invalid check digit → friendly field validation;
- RCN/store-internal barcode → weighed-item explanation;
- Manual handoff → barcode cleared;
- blank manual name → field-level error;
- authenticated lookup/search HTTP validation responses.

### E2E-3 — Search handoff

A unique query returns no results, displays the designed empty state, switches to Manual, and prefills the product name.

### E2E-4 — Seeded search add

When `E2E_CATALOG_QUERY` and `E2E_CATALOG_PRODUCT_NAME` identify a known seeded row, the test selects it through Search, confirms one unit, verifies it in the fridge, and deletes only the newly added item ID. This test is skipped unless both values and User A credentials exist.

Signup is not automated. Repeated disposable email creation is unreliable and leaves auth users behind. A pre-created test user is the stable strategy; signup remains a manual pre-submission smoke check.

## 7. Authorization and RLS

The application has one role, but authorization still matters because fridge/history rows are private per user.

`e2e/permissions.spec.ts` signs in two separate ordinary Supabase clients with the anon key:

1. User A creates a run-unique shared product, one fridge item, and one event.
2. User B can read the shared product row — intended catalog behavior.
3. User B receives no rows when selecting User A's fridge item.
4. User B's update and delete affect no rows.
5. User A confirms the item is unchanged.
6. User B cannot insert a fridge row while impersonating User A's `user_id`.
7. User B cannot read, update, or delete User A's event.
8. User B cannot insert an event while impersonating User A.
9. User A deletes the owned item; its event is removed by cascade.

No service-role key is loaded by this test. Runtime RLS execution requires two pre-created test users and was not available when this document was authored.

Exact execution:

```bash
# In .env.local: Supabase URL + anon key, E2E User A and User B credentials.
# Apply the migration first. Seed data is optional for the RLS test.
npx playwright install chromium
npm run test:e2e
```

Expected permission result: the `@rls` test passes. A skip means RLS was **not** runtime-verified and must not be reported as a pass.

## 8. Invalid Inputs and Edge Cases

| Input/risk | Expected behavior | Automated layer |
|---|---|---|
| invalid characters/length/check digit barcode | reject before DB/OFF; friendly retry/error copy | Vitest + credential-gated Playwright |
| RCN/store barcode | no global lookup; manual handoff with barcode cleared | Vitest + credential-gated Playwright |
| malformed UUID | validation result; no DB write | Vitest |
| units below 1 or above 20 | validation error; controls disabled at bounds | Vitest; E2E exercises increment |
| remaining level outside 0/25/50/75/100 | validation error; DB constraint is final guard | Vitest |
| blank or over-80-character manual name | field validation | Vitest; blank-name E2E |
| oversized brand/package/query | validation error | Vitest |
| unknown product | manual path, barcode/name prefilled where applicable | Unit/scan-flow tests; no-result E2E |
| OFF timeout/network/5xx | `not_found` with degraded fallback, not a raw 5xx | Vitest with mocked fetch |
| repeated same-level submission | successful no-op; no duplicate event | Vitest |
| repeated scanner callback | one lookup until rearmed | Vitest |
| duplicate barcode | return existing catalog product, not duplicate row | Vitest |
| finished item with another live unit | omitted from Recently finished | Vitest + full E2E |
| server/DB error | generic user message; raw error only server-side | Vitest; manual smoke |

## 9. Scanner and Camera Testing

### Automated scope

Automation can honestly verify:

- scanner state transitions and error-to-copy mapping;
- EAN-13/EAN-8/UPC-A/UPC-E format configuration;
- duplicate callback suppression and rearming;
- UPC-E expansion;
- invalid/RCN/found/not-found decision routing;
- typed barcode fallback;
- self-hosted WASM path and file parity;
- no physical camera needed for the post-detection Add flow.

It cannot prove that a real phone grants permission, chooses its rear lens, focuses on printed bars, exposes torch controls, or decodes a real product in mobile Safari/Chrome.

### iPhone Safari checklist

**Overall status: Pending manual execution**

- [ ] Open the production HTTPS `/scan-test`.
- [ ] Tap Enable camera and grant permission. Record device model and iOS/Safari version.
- [ ] Verify the rear camera is selected.
- [ ] Scan a real EAN-13 and compare every detected digit with the printed digits.
- [ ] Verify one callback/result appears, not repeated callbacks.
- [ ] Rearm/scan again and verify a second detection works.
- [ ] Deny/reset camera permission and verify the Camera is off guidance plus typed fallback.
- [ ] Verify torch appears and toggles if the device/browser exposes it; otherwise record Not supported.
- [ ] Rotate portrait ↔ landscape; verify viewport, overlay, and controls remain usable.
- [ ] Open `/add` → Scan and verify the integrated known-product confirmation flow.
- [ ] Complete an unknown/manual fallback if a suitable valid unknown barcode is available.

Result format: `Passed — tested on <device>, <OS>, <browser>, <date>` or `Failed — <step and evidence>`.

### Android Chrome checklist

**Overall status: Pending manual execution**

- [ ] Repeat all iPhone steps on production HTTPS `/scan-test`.
- [ ] Record phone model and Android/Chrome versions.
- [ ] Verify rear-camera selection, one callback, re-scan, denied permission copy, rotation, integrated `/add`, known product, unknown/manual fallback, and torch where available.

Do not mark either platform passed based on desktop camera emulation.

## 10. Browser and Responsive Testing

### Automated target

Playwright uses one Chromium/Desktop Chrome project. It automatically checks `/login` and the public `/scan-test` scanner surface at `390 × 844`, `430 × 932`, `768 × 1024`, and `1440 × 900` for visibility and horizontal overflow. This is intentionally small and deterministic. Authenticated surfaces still require the manual checklist below. Safari/WebKit is not claimed as an automated target because camera behavior must be tested on real iPhone Safari.

### Required manual targets

- iPhone Safari: current supported iOS on the student's real device;
- Android Chrome: current Chrome on a real Android device;
- desktop Chromium/Chrome for automated E2E and production smoke.

### Real viewport checklist

**Overall status: Pending manual execution**

Run each size against `/login`, `/add`, `/fridge`, and `/restock` with representative data:

- [ ] `390 × 844` — phone baseline;
- [ ] `430 × 932` — large phone;
- [ ] `768 × 1024` — tablet breakpoint;
- [ ] `1440 × 900` — desktop.

At every size check:

- [ ] no horizontal overflow or clipped focus rings;
- [ ] mobile bottom navigation / tablet-desktop top navigation switches correctly;
- [ ] sheets become usable dialogs at larger breakpoints;
- [ ] Hebrew names render RTL inside the English layout;
- [ ] very long names clamp without covering controls;
- [ ] missing images use category fallbacks;
- [ ] login, search, manual, and barcode forms remain usable;
- [ ] scanner viewport and typed fallback fit;
- [ ] restock rows and buttons do not collide;
- [ ] keyboard focus order and visible focus states work;
- [ ] 200% zoom remains operable on desktop.

Record screenshots only for failures or final submission evidence; generated Playwright artifacts are git-ignored.

## 11. Test Data Strategy

- Use dedicated non-production User A/User B accounts.
- Never run destructive cleanup against the student's normal fridge account.
- Use run-unique manual names such as `E2E Fridge Flow <worker>-<timestamp>`.
- Capture pre-existing item IDs before adding a shared seeded product; cleanup deletes only IDs created by the test.
- Let each account delete only its own rows under RLS. Events disappear through `ON DELETE CASCADE`.
- Do not clear tables or delete all fridge data.
- Manual/catalog product rows cannot be deleted by ordinary users; unique test products remain in the shared test catalog. Use a dedicated test project and periodically reset it administratively outside the suite.
- Use known seeded products only after confirming the target test project has been seeded. The default documented demo barcode is Bamba `7290000066318`.
- Do not use production for state-mutating E2E unless it is a dedicated production test account and retained catalog test rows are acceptable.

## 12. CI and Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e          # all 8 specs; credential-dependent specs skip explicitly
npm run test:e2e:public   # 3 credential-free auth/API/viewport checks
npm run test:e2e:ui       # local interactive Playwright debugging
```

GitHub Actions continues to run lint, typecheck, and all Vitest tests. A separate job installs Chromium and runs only `test:e2e:public` with placeholder values. Authenticated UI and RLS tests are intentionally not in mandatory CI until repository secrets and a stable migrated test Supabase project exist. A permanently skipped credentialed job would give false confidence; a permanently red one would be worse.

## 13. Deployment Smoke Checklist

**Status: Executed 2026-08-17 against `https://fridge-tracker-delta.vercel.app`
(hosted Supabase project, Frankfurt)** — except the physical-phone checklist,
which requires a real device.

- [x] Production URL is HTTPS and serves `/login` (`/signup` and `/scan-test` also 200).
- [x] Logged-out `/fridge`, `/add`, and `/restock` redirect (307) to `/login`.
- [x] Dedicated test user can log in and log out (full Playwright suite on the production URL).
- [x] Seeded Hebrew search returns the configured known product (`במבה` → `במבה 80 גרם אסם`).
- [x] `/wasm/zxing_reader.wasm` returns HTTP 200, `application/wasm`, ~1.09 MB.
- [x] Add one unit, change a level, finish it, open Restock, and restock it (lifecycle E2E on production).
- [x] Refresh/navigation persistence verified through the cross-page E2E journeys.
- [x] Invalid input (bad check digit, RCN store code) shows friendly copy, no stack trace/Postgres error.
- [ ] Run the physical-phone and responsive checklists above (requires the student's real devices).

For non-mutating remote checks, set `PLAYWRIGHT_BASE_URL=https://<deployment>` and run `npm run test:e2e:public`. Run stateful tests remotely only with dedicated credentials and data.

## 14. Exit Criteria

Before submission:

1. lint, typecheck, all Vitest tests, and production build pass;
2. `test:e2e:public` passes in CI;
3. all credential-gated Playwright tests pass against a migrated dedicated Supabase project, with zero skips for required `@supabase`/`@rls` tests;
4. RLS proves User B cannot read/update/delete User A's private rows;
5. the full add → consume → finish → restock journey passes;
6. OFF fallback unit tests remain deterministic and green;
7. iPhone Safari and Android Chrome camera checklists are executed and recorded;
8. all four viewport checks are executed and recorded;
9. production smoke passes after the final deployment;
10. no failure shows raw stack traces, SQL, keys, or internal database errors.

## 15. Evidence Record

Evidence must distinguish execution from preparation.

| Check | Result at 2026-08-16 (Wave 5) | Evidence |
|---|---|---|
| ESLint | Passed | `npm run lint` |
| TypeScript | Passed | `npm run typecheck` |
| Vitest | Passed — 318/318, 16 files | `npm test` |
| Production build | Passed | `npm run build` |
| Playwright public | Passed — 3/3 | `npm run test:e2e:public` |
| Playwright full suite | **Passed — 8/8** | `npm run test:e2e` against a local Supabase stack (`supabase start`, full migration chain, seeded catalog, dedicated users A/B) |
| Runtime RLS | **Executed — all attacks blocked** (incl. the Wave 5 event-ownership fix) | `e2e/permissions.spec.ts` + hand-crafted PostgREST calls on the local stack; hosted re-run pending the student's project |
| Physical camera | Pending manual execution | No device test performed |
| Responsive visual QA | **Executed — no defects** | 390×844 / 430×932 / 768×1024 / 1440×900, authenticated, screenshot + overflow audit of /fridge, /add (all tabs), /restock, sheets/dialogs/toasts/focus |
| Production smoke | Pending deployment | No Vercel URL available yet |

| Check | Result at 2026-08-17 (hosted deployment) | Evidence |
|---|---|---|
| Migrations on hosted project | Applied — all 3 in order | `supabase db push` to project `zcbmsukrspenbcizzwqh` (eu-central-1) |
| Hosted catalog seed | Passed — 7,490 products inserted | `npm run seed:db`; Bamba `7290000066318` resolves via authenticated anon-key read |
| Playwright full suite vs hosted Supabase | **Passed — 9/9** (2026-08-18, incl. the typed-barcode lookup regression test) | `npx playwright test --workers=1`, local server + hosted project, dedicated users A/B |
| Playwright full suite vs production | **Passed — 9/9** (2026-08-18) | `PLAYWRIGHT_BASE_URL=https://fridge-tracker-delta.vercel.app npx playwright test --workers=1` |
| Scan/typed lookup "found" regression (2026-08-18) | **Fixed + regression-tested** | Prop-driven `Modal` close echoed `onClose`, resetting ScanPanel to idle and instantly closing the confirm sheet after a successful lookup; fixed in `modal.tsx`, covered by the new `E2E_CATALOG_BARCODE` journey |
| Hosted runtime RLS | **Executed — all attacks blocked** | `e2e/permissions.spec.ts` (@rls) against the hosted project, incl. Wave 5 event-ownership fix |
| Production smoke | **Passed** | §13 checklist: routes, redirects, WASM binary, full lifecycle journey |
| Physical camera | Pending manual execution | Requires the student's real phone |
| Manual responsive re-check on production | Pending manual execution | Automated 4-viewport public checks passed in the production suite |

## 16. Known Testing Limitations

- ~~Hosted re-run gap~~ Closed 2026-08-17: the full credentialed suite (incl. the RLS attack matrix) passed 8/8 against the hosted Supabase project and again 8/8 against the production Vercel deployment.
- No physical iPhone or Android camera test has been performed.
- Chromium is the only automated browser.
- There is no visual-regression snapshot suite, performance/load suite, or coverage-percentage target.
- Browser tests do not call live Open Food Facts; outage/mapping behavior is covered with deterministic mocked fetch tests.
- An unknown valid barcode is not hard-coded into E2E because it may later appear in OFF or the shared catalog. That flow is covered by unit decision tests and the manual camera/production checklist.
- The shared catalog intentionally retains run-unique manual products because ordinary users have no product-delete permission.
- Signup remains manual to avoid unbounded disposable auth accounts and email-confirmation dependencies.

These limitations are explicit test boundaries, not passed results.

## 17. F5 — V2 hosted verification evidence (2026-08-20)

All results below are from real runs against the hosted Supabase project
(Frankfurt) and deployed Vercel **Preview** builds of `feature/v2` — no
local database was involved.

**Local gate (final F5 run):** Prettier clean · ESLint clean · `tsc` clean ·
**Vitest 673 passed / 0 failed (48 files)** · production build succeeds.

**Playwright, official suite (5 spec files), twice:**

| Target | Result |
|---|---|
| Local server + hosted Supabase (`npx playwright test e2e/{auth-protection,fridge-flow,lineage-rls,permissions,reminders-rls}.spec.ts`) | **14 passed / 0 failed / 0 skipped** |
| Deployed Vercel Preview (`PLAYWRIGHT_BASE_URL=<preview>`) | **14 passed / 0 failed / 0 skipped** |

This includes the new F5 `e2e/lineage-rls.spec.ts` (cross-user +
nonexistent-UUID lineage attacks with indistinguishable 42501s, legitimate
same-user lineage allowed) and the full reminder RLS matrix incl.
`last_sent_key` write/smuggle denial against the hosted database.

**Temporary hosted UI QA suite (deleted after the run, evidence in
`docs/SECURITY.md` §24 and screenshots under `qa-screens-f5/` during the
run):** 5/5 passed on Preview — F1 item-history lineage (restocked-on +
origin facts across old/new units), reminder editor lifecycle
(create/persist/edit/toggle/delete, browser-timezone default
`Asia/Jerusalem`), notification bell (server-seeded row, unread badge,
mark-read persisted server-side), chat all-providers-unavailable UX (calm
notice, message persisted, retry does not duplicate), and a 4-viewport
responsive sweep (390×844 / 430×932 / 768×1024 / 1440×900) of `/fridge`,
`/restock`, `/chat` with zero horizontal overflow and Hebrew/RTL content.

**Reminder infrastructure (hosted):** controlled-time worker matrix
(due/not-due/disabled/channel combinations/empty-fridge/duplicate) all
correct and idempotent; real pg_cron delivery verified end-to-end with
exactly one notification and zero duplicates across ~250 subsequent
real 5-minute ticks (~21 h). Details: `docs/RESTOCK_REMINDERS.md` §11.

**Live AI (real keys, Preview):**

- `node scripts/ai-smoke.mjs`: Gemini `gemini-2.5-flash` OK (~0.8 s);
  Groq `openai/gpt-oss-120b` OK (~0.5 s) after F5 replaced the
  decommissioned `llama-3.3-70b-versatile` default.
- Primary chat journey ("What can I make right now?" over a seeded
  fridge): answer grounded in actual inventory, conversation persisted
  across reload, no vendor names or UUIDs anywhere in the UI.
- **Failover proven with real 429s:** when the Gemini free-tier quota
  exhausted, server logs recorded
  `AI turn served by "groq" after failover (google: HTTP 429)` while the
  user saw an ordinary answer — same conversation, no duplicate user
  message, provider chain invisible.
- Free-tier quota context for graders: one agentic turn makes several
  provider calls; Gemini free tier allows 10 requests/min and 250/day,
  Groq 8k tokens/min — sustained test bursts can exhaust both, which
  surfaces the (correct, calm) "temporarily unavailable" UX rather than a
  crash.
- **Deferred (quota, not code):** the remaining scripted live-UI runs of
  the missing-ingredient no-path, full recipe→consume confirmation, and
  stale-proposal flows were cut short when the day's Gemini quota
  exhausted mid-suite. Partially observed live: the missing-ingredient
  card rendered with its quick replies on a real turn, and every
  underlying action (proposal accept/reject/stale-conflict/revert,
  explicit-confirmation boundary) is covered by the 673-test unit layer
  (`src/lib/v2/actions/ai.test.ts`, `proposal-controller.test.ts`,
  `tools.test.ts`). Owner decision: release now, re-run the live flows
  when the quota resets.
- **2026-08-21 follow-up attempt (post-release, production URL):** the
  primary chat journey passed again on production (third pass overall).
  The flow tests still could not complete: the configured Google key's
  *daily* free budget proved far smaller than the documented AI-Studio
  tier (exhausted after a handful of agentic turns — it appears to be a
  Vertex-express-style key), and with Gemini down, tool-heavy multi-step
  turns cumulatively exceed Groq's 8k tokens/minute inside a single turn
  (simple turns still succeed on Groq). Production behavior during this
  window was the designed degradation: simple questions answered, heavy
  turns showed the calm "temporarily unavailable" notice with a working
  retry, message always persisted. Also verified live: the assistant may
  legitimately ask about a missing ingredient in prose instead of the
  structured card (persona-allowed nondeterminism); the harness now
  nudges once for the structured path. Re-run path: execute
  `e2e/tmp-f5-ai-live.spec.ts` tests 23/24/25 after the Google daily
  reset (~10:00 Israel time), or sooner with a standard AI-Studio
  (`AIza…`) key, which has a 250-requests/day budget.
- **2026-08-22 post-reset run (production URL) — flows verified live:**
  after the Google daily reset, three of the four deferred flow tests
  **passed against production**:
  - *23 — missing ingredient, yes path:* structured card → "Yes, I have
    it" → add proposal → verified **no** fridge mutation before consent →
    "Add to fridge" → item persisted, "Applied" chip shown.
  - *23b — missing ingredient, no path:* "I don't have it" acknowledged
    in prose, no proposal created, fridge row-count unchanged.
  - *24 — recipe → "I cooked this" → explicit consumption confirm:*
    recipe card rendered from seeded inventory, consumption proposal with
    human-readable levels, **no** mutation until "Update fridge", then
    real quarter-step decrements persisted and proposal marked accepted.
  Only *25 — stale-proposal conflict* remains unobserved live: the run
  consumed the small daily Google budget, and its tool-calling turn
  exceeds Groq's 8k tokens/min alone (retried thrice; the calm
  "temporarily unavailable" + retry UX behaved correctly each time).
  The stale-conflict path is fully covered at the unit layer
  (`proposal-controller.test.ts`, `ai.test.ts`). A live attempt also
  confirmed correct persona behavior: without explicit quantities the
  assistant *asks* what was used instead of inventing precision, so the
  harness prompt now states "half of each". Re-run: test 25 only, after
  the next daily reset.

**Fixed during F5 (regression-tested):** Groq `tool_use_failed` →
transient classification (+2 failover unit tests); ingredient `quantity`
cap 40→100 (tool + persisted schemas); `NotificationBell` stale-response
merge; cross-worker `signOut` scope in all credentialed specs
(`{ scope: "local" }`).
