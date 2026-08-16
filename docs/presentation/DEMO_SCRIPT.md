# Fridge Tracker — Live Demo Script

Target: 5–6 minutes inside a 10–15 minute presentation.
Primary path uses **only the seeded catalog** — no live Open Food Facts
dependency, no camera dependency (typed barcodes work everywhere).

## Before the presentation (checklist)

- [ ] Production URL opens over HTTPS on the presentation machine **and** on
      the demo phone
- [ ] Demo account exists and logs in (use a dedicated demo user, not a
      personal one; keep the password out of slides/screenshots)
- [ ] Demo account state: fridge has 2–3 products with mixed levels, at least
      one item finished earlier (so Restock has content), **plus one Bamba
      unit already at ¼** so a "finish" step is instant
- [ ] Phone: camera permission previously granted to the site (or be ready to
      accept the prompt on stage)
- [ ] A physical Bamba bag (or any `729…` product from the barcode kit below)
- [ ] Fallback tab open: local `npm run dev` against the local Supabase stack
      (in case venue Wi-Fi dies)

## Demo barcode kit

| Barcode         | Product                             | Purpose                              |
| --------------- | ----------------------------------- | ------------------------------------ |
| `7290000066318` | במבה 80 גרם אסם (Bamba)             | main scan/search demo (seeded)       |
| `7290004131074` | חלב בקרטון 3% שומן 1 ל (Tnuva milk) | second seeded product                |
| `0011210000032` | Tabasco 60ml                        | leading-zero correctness (seeded)    |
| `2000000000008` | store-internal / weighed RCN        | guided manual-entry path             |
| `1234567890123` | invalid check digit                 | friendly error message               |

## Timed sequence

**0:00 — Login (30 s).**
Open the production URL → `/login` → sign in with the demo account. Point
out the redirect: logged-out visits to `/fridge` bounce to `/login`.

**0:30 — Fridge overview (45 s).**
`/fridge`: category grouping, Hebrew RTL names, per-unit chips
(Full/¾/½/¼), the Low and Finished filters, item counts. One sentence:
"every unit is a physical package; levels are quarter estimates."

**1:15 — Add by barcode (75 s).**
`/add` → Scan tab.

- On the phone: Enable camera → scan the physical Bamba bag → confirmation
  sheet shows the seeded product (name/brand in Hebrew).
- On a laptop (or if the camera misbehaves): type `7290000066318` into
  "Or type the barcode" → Look up. Same confirmation sheet.

In the confirmation sheet, set **Units: 2** → Add to fridge → toast.
Say it out loud: "resolved from our seeded Israeli catalog — no external API
call."

**2:30 — Consume (60 s).**
`/fridge` → tap Bamba **Unit 1** chip → consume sheet → pick **½**. Undo
toast appears — tap nothing, just point at it. Tap the pre-staged **¼ unit**
→ **Finished — all gone**. Toast: "…it's on your Restock list."

**3:30 — Restock (45 s).**
`/restock`: Running low (milk at ¼), Recently finished (the Bamba unit),
Recent activity feed with the events you just created. Tap **Restock** on
Bamba → toast — a fresh 100% unit is back in the fridge. History is not
lost: back on `/fridge`, the Finished filter still shows the finished units.

**4:15 — Manual entry + edge cases (60 s).**
`/add` → type `2000000000008` → Look up → "Looks like a weighed item" →
**Add manually** → Manual tab is pre-selected; name it (e.g. "סלט חומוס של
שוק הכרמל"), pick a category → Add to fridge.
Then type `1234567890123` → friendly "check the digits" error (bad check
digit — validated client-side, no API hit).

**5:15 — Search close (30 s).**
`/add` → Search tab → type "במבה" → Hebrew results from the seeded catalog →
add one via the + button. Hand back to slides.

## Fallback paths

| Failure                        | Fallback                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Camera denied / broken on stage | Use "Or type the barcode" with the kit above — identical resolution flow, zero loss of demo value            |
| Venue network unreliable       | Switch to the prepared local tab (`npm run dev` + local Supabase stack, same seeded catalog and demo account) |
| Open Food Facts down           | Irrelevant to the primary path — every scripted step resolves from the seeded catalog or manual entry         |
| Projector/phone mirroring dies | Laptop-only demo: typed barcodes + search cover everything except the camera moment                           |

## Q&A prompts to be ready for

- "What stops me from reading another user's fridge?" → RLS demo/matrix
  (`docs/SECURITY.md` §5): every table policy-checked, verified with two real
  users, including the consumption-event ownership fix.
- "Why not just use Open Food Facts?" → Israeli coverage is weak; the seeded
  Shufersal catalog makes the core flow deterministic; OFF is an attributed
  fallback (ODbL).
- "What happens with weighed items from the deli counter?" → RCN `2xx…`
  detection routes to guided manual entry (show it if time allows).
