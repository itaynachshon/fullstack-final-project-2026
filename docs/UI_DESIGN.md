# Fridge Tracker — UI / UX Design System

| | |
|---|---|
| **Status** | Approved visual contract — implemented in Waves 2–3; verified in the Wave 5 four-viewport QA pass (no defects); kept as the visual reference |
| **Date** | 2026-08-15 |
| **Authority** | Subordinate to `docs/IMPLEMENTATION_PLAN.md` (scope, architecture, routes, data model). This document owns everything visual and interactive. Where the plan names a UX mechanism (e.g., "product-confirm sheet", plan §9), this document specifies it. |
| **Inputs** | `docs/IMPLEMENTATION_PLAN.md`, `English-Assignment.md`, `Hebrew-Assignment.md`. (`PRODUCT_SPEC.md` / `ARCHITECTURE.md` / `TECHNICAL_DESIGN.md` were not yet written at authoring time; the plan is self-contained by its own declaration.) |
| **Scope** | Design only. No code, no dependencies, no config changes are made by this document. The token values and class recipes below are the contract implementation agents apply during their waves. |

**The product in one line:** a mobile-first web app where an Israeli household scans groceries into a virtual fridge, taps units down through Full → ¾ → ½ → ¼ → Finished, and checks a restock view before shopping.

**The design in one line:** a calm, light, green-accented utility that feels like a well-made consumer app — flat white cards on warm paper, one typeface covering Hebrew and English, one accent color, a thumb-first bottom bar, and generous 44 px targets everywhere.

---

## 1. Design Intent

Personality targets (from the design brief): clean, modern, friendly, calm, high quality, lightweight, trustworthy — a household grocery utility, not a dashboard.

What this means concretely:

- **Calm surfaces.** Warm off-white app background, pure-white cards separated by hairline borders. Nothing floats unless it is a transient overlay.
- **One accent.** A single fresh green carries brand, primary actions, active states, and "healthy stock" semantics. Amber appears only for "running low". Red appears only for destructive actions and failures. Nothing else is colored.
- **Food is the hero.** Product photos and Hebrew product names get the visual priority on every card; chrome recedes.
- **Thumb-first.** Primary actions live in the bottom half of the phone screen; every target is at least 44 px.
- **States are designed, not defaulted.** Every list has an empty state that says what to do next; every wait has a skeleton; every failure has a recovery action.

Explicitly banned (per brief): admin-dashboard styling, stat-card grids, charts, gradients, glassmorphism, heavy shadows, oversized border radii, arbitrary colors, dense data tables, decorative animation.

---

## 2. Research Notes

Sources inspected on 2026-08-15 (principles extracted; no visual copying):

| Source | What was taken |
|---|---|
| **shadcn/ui theming docs** (ui.shadcn.com/docs/theming, Tailwind v4 guide) | Current token model: OKLCH values on `:root`, mapped through `@theme inline`; `name` / `name-foreground` pairing convention; radius scale derived from a single `--radius`; custom tokens (e.g., warning) join the same system; sonner is the current toast primitive. §3.3 and §4 map our palette onto exactly this system. |
| **Apple HIG — Tab Bars** | Bottom tab bars are for 3–5 top-level *destinations*, never inline actions; keep labels short; preserve per-tab state. Our three routes fit exactly. |
| **Material 3 — Navigation Bar** | Confirms 3–5 destinations; below three, use tabs instead; on desktop replace the bottom bar with side/top navigation rather than stretching it. Informed the ≥ 768 px top-bar switch (§5.4). |
| **WCAG 2.2** (2.5.8 Target Size, 2.4.11 Focus Appearance, 2.5.5 Enhanced) | 24 px is the legal floor for targets; 44 px is the AAA/platform recommendation we adopt; focus indicators need ≥ 3:1 contrast. Drives §11. |
| **Barcode-scanner UX references** (Scanbot viewfinder tutorial, VP0 viewfinder journal, QR-scan UX pattern guides) | Dim overlay + bright *wide* cutout (1D barcodes are wide, not square), corner brackets, one-line instruction, torch toggle, request permission only after an explicit user action, denied state must offer a first-class manual path, success needs instant haptic/visual feedback, not-found must be an explicit designed state. Drives §6.4.1. |
| **Consumer grocery/pantry apps** (Bring!-style list apps, Yuka scan flow, published pantry-app case studies) | Compact shadow-less cards so many items fit per screen; scanning reachable from anywhere via the persistent bar; segmented controls over hidden gestures (dexterity + discoverability); status via icon + text, never color alone; empty pantry state = one message + one CTA ("Scan your first product"); checked/finished items move to their own section instead of cluttering the main list. |

Anti-patterns observed and rejected: floating notched center FABs (dated, gimmicky), swipe-only destructive gestures (undiscoverable, inaccessible), continuous progress bars for stepped quantities (fake precision), infinite scroll for a 20-per-page catalog search (unpredictable), full-screen spinners (layout jank).

---

## 3. Design System — Foundations

### 3.1 Typography

**Typeface: Rubik** (Google Fonts, loaded via `next/font/google` — built into Next.js, no new dependency), subsets `latin` + `hebrew`, weights **400 / 500 / 600**, `display: swap`, exposed as `--font-sans`.

Why Rubik and not the default Geist or Inter: product names, brands, and search queries are Hebrew; the UI is English (plan §9, §24). Geist and Inter have no Hebrew glyphs, so they would silently fall back to a mismatched system font inside every product card — the exact place where typography matters most. Rubik ships Latin and Hebrew in one family, its Hebrew was professionally revised (correct proportions, nikkud, geresh/gershayim, ₪), and its slightly rounded terminals give the friendly-but-serious tone this product wants. Considered alternatives: **Heebo** (Roboto-derived; safest, but generic) and **Assistant** (elegant, but light at UI sizes). Rubik wins on personality at equal legibility. Fallback stack: `system-ui, -apple-system, "Segoe UI", sans-serif`.

**Exactly seven text styles.** No page may introduce an eighth.

| # | Style | Spec | Tailwind recipe | Used for |
|---|---|---|---|---|
| 1 | Page title | 24 / 32, 600, tight tracking | `text-2xl font-semibold tracking-tight` | One per page: "Fridge", "Add a product", "Restock", auth headlines |
| 2 | Section heading | 16 / 24, 600 | `text-base font-semibold` | Restock sections, sheet titles, empty-state titles |
| 3 | Category label | 12 / 16, 500, uppercase, wide tracking, muted | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | Fridge category group headers ("DAIRY · 4") |
| 4 | Product name | 16 / 22, 500, `dir="auto"`, clamp 2 lines | `text-base font-medium leading-snug line-clamp-2` | Product names everywhere |
| 5 | Body | 14 / 20, 400 | `text-sm` | Default copy, form labels (`font-medium` allowed on labels) |
| 6 | Meta | 12 / 16, 400, muted | `text-xs text-muted-foreground` | Brand · size lines, timestamps, helper text, nav labels (nav adds `font-medium`) |
| 7 | Button | 14 / 20, 500 | `text-sm font-medium` | All buttons, tabs, chips (shadcn default) |

**Hard rules:**

- **Inputs are always 16 px** (`text-base`). iOS Safari auto-zooms the page when a focused input is below 16 px; that zoom is the single fastest way to make a web app feel broken on a phone.
- Every element that can contain catalog text — product name, brand, search input, search query echoed in empty states — carries `dir="auto"` so Hebrew renders RTL inside the English LTR page (plan §9, §16).
- Numbers that must align (unit counts, percent labels) use `tabular-nums`.
- No italic, no letter-spacing outside style 3, no font weights other than 400/500/600.

### 3.2 Spacing

Base unit **4 px**. Allowed steps only: **4, 8, 12, 16, 24, 32, 48** (Tailwind `1, 2, 3, 4, 6, 8, 12`). When unsure, use 8 inside a component, 16 between components, 24 between sections.

| Context | Value |
|---|---|
| Page gutter | 16 px mobile (`px-4`), 24 px ≥ 768 px (`px-6`) |
| Card internal padding | 12 px (`p-3`) |
| Gap between cards in a list | 8 px (`gap-2`) |
| Heading → its content | 12 px (`mb-3`) |
| Between page sections | 32 px (`space-y-8`) |
| Icon → its label | 8 px (`gap-2`) |
| Form field vertical rhythm | label → input 6 px (`space-y-1.5`, the one sanctioned half-step, matching shadcn), field → field 16 px |
| Content → bottom nav clearance | 96 px bottom padding (`pb-24`) so the last card is never hidden behind the bar |

The bottom navigation is 64 px tall plus `env(safe-area-inset-bottom)` (see §5.2).

### 3.3 Color

Semantic roles only — components never reference raw palette classes (`bg-emerald-600` is forbidden in JSX; `bg-primary` is required). Values are OKLCH per current shadcn/Tailwind v4 convention. One added token pair (`warning`) follows the standard `name`/`name-foreground` convention from the shadcn theming docs.

| Role | Token | Value (light) | ≈ Hex | Usage |
|---|---|---|---|---|
| App background | `--background` | `oklch(0.985 0.004 95)` | `#FBFAF6` | Page canvas — warm paper, not clinical white |
| Default text | `--foreground` | `oklch(0.24 0.012 95)` | `#37352F` | All primary text |
| Surface / card | `--card` (+ `--card-foreground`) | `oklch(1 0 0)` | `#FFFFFF` | Cards, sheets, nav bars, inputs |
| Primary | `--primary` | `oklch(0.52 0.12 160)` | `#0E7A5A` | Primary buttons, active nav, selected chips, healthy gauge fill, links |
| Primary foreground | `--primary-foreground` | `oklch(1 0 0)` | `#FFFFFF` | Text/icons on primary |
| Secondary | `--secondary` (+ fg `oklch(0.35 0.08 160)`) | `oklch(0.96 0.02 160)` | `#E8F4EE` | Secondary buttons (Restock, Load more), soft mint tint |
| Muted | `--muted` | `oklch(0.955 0.006 95)` | `#F2F1EC` | Skeletons, empty-state circles, disabled fills, image fallback bg |
| Muted foreground | `--muted-foreground` | `oklch(0.50 0.015 95)` | `#6E6B63` | Meta text, inactive nav, placeholder icons |
| Accent | `--accent` (+ fg `oklch(0.30 0.05 160)`) | `oklch(0.95 0.015 160)` | `#E4F0EA` | Hover/pressed tint on rows, ghost buttons, current level row |
| Destructive | `--destructive` (+ fg white) | `oklch(0.55 0.21 27)` | `#C93B2B` | Delete confirm, failure banners. Never for "Finished" |
| Low-stock warning | `--warning` / `--warning-foreground` | surface `oklch(0.965 0.04 90)` / text `oklch(0.47 0.10 70)` | `#FBF3DC` / `#8A5A0B` | "Low" badges, ¼-level gauge fill (fill uses `--warning-foreground` for ≥ 3:1 contrast) |
| Finished state | *(no new color)* | muted treatment | — | Finished = gray + empty gauge + label. Finishing food is normal, not an error |
| Borders | `--border`, `--input` | `oklch(0.90 0.008 95)` | `#E4E2DB` | Hairlines on cards, inputs, dividers |
| Focus ring | `--ring` | `oklch(0.52 0.12 160)` | `#0E7A5A` | Focus indicator = primary green |

Contrast commitments (verified against WCAG 2.2 AA): white on primary ≈ 4.8:1 ✓; muted-foreground on white ≈ 4.9:1 ✓; warning-foreground on warning surface ≥ 5:1 ✓; white on destructive ≈ 4.9:1 ✓; all non-text indicators (gauge fills, focus ring, brackets) ≥ 3:1 against their backgrounds ✓.

**Decisions:**

- **Green is the only accent.** It is the semantically honest color for a freshness/food product and it doubles as the "well stocked" state, so success needs no extra token. Chart and sidebar tokens from the shadcn default block are left untouched and unused — no charts in this product.
- **Light mode only for MVP.** Dark mode doubles the visual QA surface (photos on dark, amber on dark, camera overlay on dark) for zero assignment value. The token architecture makes it a clean stretch goal; the generated `.dark` block stays as scaffolded, unused. Set `<meta name="theme-color" content="#FBFAF6">` so mobile browser chrome matches the canvas.
- Alpha variants of tokens (`bg-destructive/8`, `bg-black/40`) are permitted only where this document specifies them (form banners §6.1, error doctrine §9, scrim §3.5, scanner overlay §6.4.1).

### 3.4 Radius

One knob: **`--radius: 0.75rem` (12 px)**. shadcn derives the scale automatically (`sm` 8 / `md` 10 / `lg` 12 / `xl` 16).

| Element | Radius | Class |
|---|---|---|
| Buttons, inputs, segmented tabs | 10 px | `rounded-md` |
| Product thumbnails, scanner viewport, skeleton blocks | 12 px | `rounded-lg` |
| Cards, dialogs, empty-state panels | 16 px | `rounded-xl` |
| Bottom sheets | 16 px top corners only | `rounded-t-xl` |
| Chips, badges, unit chips, count pills, toasts | full | `rounded-full` |

Philosophy: soft enough to feel friendly, tight enough to feel precise. Exactly these four stops — a fifth radius anywhere is a defect.

### 3.5 Shadows and Borders — the elevation model

Three levels. Nothing else exists.

| Level | Treatment | Applies to |
|---|---|---|
| **0 — In-flow content** | `border` (1 px `--border`), **no shadow** | All cards, inputs, list rows, section panels, top bar (`border-b`), bottom nav (`border-t`) |
| **1 — Anchored transients** | `border + shadow-md` | Toasts, the rare popover/menu |
| **2 — Modal overlays** | `shadow-lg` + scrim `bg-black/40` | Bottom sheets, dialogs |

Rationale: a fridge list where every card floats reads as noise. Borders group; shadows mean "this is temporarily above the page" — keeping that meaning consistent is what makes the two modal surfaces feel physical.

### 3.6 Icons

**Family: Lucide** — consistent 24 px grid, `stroke-width={2}` always. No second icon family, no emoji-as-icon, no filled variants. *Implementation note (Wave 2/3): the glyphs are vendored as plain SVG components in `src/components/icons.tsx` (and `scanner/scanner-icons.tsx`) with ISC attribution — the `lucide-react` package is not installed, because dependencies were frozen during parallel work and the owned-code form is easier to explain.*

| Size | Usage |
|---|---|
| 16 px (`size-4`) | Inline with meta text, inside buttons/badges, field adornments |
| 20 px (`size-5`) | List-row leading icons, input search icon |
| 24 px (`size-6`) | Bottom-nav tabs, sheet headers, torch button glyph |
| 32 px (`size-8`) | Only inside 64 px empty-state circles |

Canonical assignments (implementation agents must not improvise different metaphors; verify exact export names on lucide.dev):

| Meaning | Icon |
|---|---|
| Brand / Fridge tab / empty fridge | `Refrigerator` |
| Add tab | `Plus` |
| Restock tab | `ShoppingBasket` |
| Scan mode / manual barcode field | `ScanBarcode` |
| Search mode / search field | `Search`; no results `SearchX` |
| Manual mode | `PencilLine` |
| Torch | `Flashlight` / `FlashlightOff` |
| Camera states | `Camera` / `CameraOff` |
| Low stock | `TriangleAlert` |
| Finished | `CircleCheck` (muted — completion, not failure) |
| Restock action / restocked activity | `RotateCcw` |
| Consumed activity | `ArrowDownRight` |
| Delete | `Trash2` |
| Weighed-item notice | `Weight` |
| Network problem | `WifiOff` |
| Sign out | `LogOut` |
| Category icons (image fallback + manual-form chips) | Dairy `Milk` · Meat & Fish `Beef` · Vegetables `Carrot` · Fruit `Apple` · Drinks `CupSoda` · Sauces & Spreads `Droplets` · Snacks `Cookie` · Prepared `CookingPot` · Frozen `Snowflake` · Other `Package` |

Brand mark: the `Refrigerator` glyph, white, centered in a primary-green `rounded-xl` tile (40–48 px). Wordmark "Fridge Tracker" in style 2. That is the entire brand system — no custom logo work.

---

## 4. Design Tokens — shadcn/ui Integration Contract

The agent that owns `globals.css` (coordinate per plan §21) applies exactly this block (values from §3.3–§3.4) using the current shadcn Tailwind-v4 convention (`:root` values + `@theme inline` mapping). This is the only place colors are ever defined.

```css
:root {
  --radius: 0.75rem;
  --background: oklch(0.985 0.004 95);
  --foreground: oklch(0.24 0.012 95);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.24 0.012 95);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.24 0.012 95);
  --primary: oklch(0.52 0.12 160);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.96 0.02 160);
  --secondary-foreground: oklch(0.35 0.08 160);
  --muted: oklch(0.955 0.006 95);
  --muted-foreground: oklch(0.50 0.015 95);
  --accent: oklch(0.95 0.015 160);
  --accent-foreground: oklch(0.30 0.05 160);
  --destructive: oklch(0.55 0.21 27);
  --destructive-foreground: oklch(1 0 0);
  --warning: oklch(0.965 0.04 90);
  --warning-foreground: oklch(0.47 0.10 70);
  --border: oklch(0.90 0.008 95);
  --input: oklch(0.90 0.008 95);
  --ring: oklch(0.52 0.12 160);
}

@theme inline {
  /* standard shadcn mappings, plus: */
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --font-sans: var(--font-rubik);
}
```

Notes for the implementing agent: keep the scaffolded chart/sidebar/`.dark` variables as generated (unused ≠ removed; zero maintenance); wire Rubik through `next/font/google` with `variable: '--font-rubik'`, subsets `['latin', 'hebrew']`, weights `['400','500','600']`; add `viewport-fit=cover` to the viewport export and `<meta name="theme-color">` per §3.3.

---

## 5. Mobile Navigation

### 5.1 Decision: bottom navigation bar — yes

The app has exactly three top-level destinations of equal importance: **Fridge** (`/fridge`), **Add** (`/add`), **Restock** (`/restock`). Both Apple HIG (tab bars: 3–5 sections) and Material 3 (navigation bar: 3–5 destinations) prescribe a bottom bar for precisely this shape. Supporting reasons:

- **Thumb reach.** On tall phones the top corners are dead zones; the app's most frequent loop (check fridge → add → check restock) must be one-thumb.
- **Add is a destination, not an action.** HIG warns against action buttons in tab bars — but `/add` is a full screen with three modes and its own state, i.e., a legitimate destination. No conflict.
- **Alternatives fail:** a hamburger hides three items behind a tap for no reason; top tabs are unreachable one-handed; a floating action button for Add would orphan Restock.

### 5.2 Anatomy (mobile, < 768 px)

```
┌──────────────────────────────────────┐
│              page content            │
├──────────────────────────────────────┤ ← 1px border-t, bg-card
│    Fridge         (+)        Restock │   64px + safe-area-inset-bottom
│   icon 24         Add        icon 24 │   labels: 12px medium
└──────────────────────────────────────┘
```

- Fixed bottom, `bg-card`, `border-t` (elevation 0 — the bar does not float). Three equal-width slots, each a ≥ 64 × 48 px target.
- **Inactive item:** icon + label in `text-muted-foreground`. **Active item:** icon + label in `text-primary`, `aria-current="page"`, no pill, no underline — color + weight is enough at this size.
- **Center Add emphasis:** the Add slot renders its `Plus` icon inside a **48 px primary-filled circle** (white glyph), label "Add" beneath like its siblings. The circle sits *inside* the bar — no notch, no floating, no elevation. This is the discoverability move: the eye lands on the one filled shape on screen, but structurally it is just the middle tab. The circle stays filled in all states (it is the app's permanent visual anchor); Fridge/Restock communicate their own active state.
- Press feedback: `scale-95` on the pressed slot, 150 ms.
- The keyboard overlays the bar naturally on mobile browsers — no special handling; forms already keep their submit buttons above the fold (§6.1).

Secondary Add entry points: the empty-fridge CTA (§6.3) and the empty-restock link (§6.5). No other navigation chrome exists on mobile; the page header carries a per-page trailing action (sign-out on Fridge) instead of a global top bar.

### 5.3 Route-level integration

The bar lives in the authenticated `(app)` layout; `/login`/`/signup` render without it. Active state derives from the pathname. Each tab preserves its own scroll/UI state on switch where Next.js layouts allow it (notably: Add keeps its selected mode and typed input when you bounce to Fridge and back within a session).

### 5.4 Larger screens (≥ 768 px)

The bottom bar disappears (`md:hidden`) and a **top header bar** appears: 56 px, `bg-card border-b`, inner container `max-w-5xl mx-auto px-6`, containing — brand tile 28 px + wordmark (left), inline nav links Fridge / Add / Restock (center-left, style 7; active = `text-primary` + `bg-accent` pill `rounded-full px-3 py-1.5`), sign-out ghost icon button (right). Material guidance is explicit that bottom bars are a mobile pattern; a desktop bottom bar reads as a mistake. A sidebar was rejected — three links do not justify one, and sidebars are the admin-dashboard smell this product must avoid. The ODbL attribution required by plan §17 renders as a one-line `text-xs text-muted-foreground` footer under the content container on desktop, and at the bottom of the Restock page on mobile: "Product data: our catalog + Open Food Facts (ODbL)."

---

## 6. Screen Specifications

Shared page skeleton (all authenticated pages): gutter per §3.2 → page title row (style 1 + optional trailing 44 px ghost icon action) → optional subtitle (style 6) → content sections. One page title per page, always the first element, `pt-4 pb-2`.

### 6.1 Login (`/login`)

Purpose: fastest possible path back into the fridge. Zero marketing.

- **Composition (mobile):** flat on `--background` — no card-in-card. Vertical stack, `max-w-sm mx-auto px-4`, top-aligned starting ~64 px down (`pt-16`). Top-aligned matters: vertical centering pushes the form under the keyboard on phones.
- **Branding:** 48 px brand tile + "Fridge Tracker" (style 2) centered, then headline "Welcome back" (style 1) and subtitle "Log in to see what's in your fridge." (body, muted). Total brand moment ≤ 120 px tall.
- **Form width:** `max-w-sm` (384 px) at all breakpoints — credentials forms never stretch.
- **Fields:** label above input (body, 500). Inputs `h-12` (48 px), 16 px text, `rounded-md`, `border-input`, white bg. Email: `type=email`, `autocomplete=email`, `autocapitalize=none`, `inputmode=email`. Password: `autocomplete=current-password`, trailing 44 px show/hide `Eye`/`EyeOff` ghost toggle inside the field.
- **Hierarchy:** exactly one primary button — "Log in", full-width, `h-12`, directly under the fields. Below it a single centered text link: "New here? **Create an account**" (body; link fragment in `text-primary font-medium`). Nothing else on the page.
- **Keyboard behavior:** compact layout keeps the submit visible above the iOS keyboard on a 667 pt viewport; Enter submits; 16 px inputs prevent zoom; focused field scrolls into view natively.
- **Submitting:** button disabled + inline 16 px spinner + label "Logging in…".
- **Errors:** auth failure renders a form-level banner above the fields — `rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5`, `CircleAlert` 16 px + "Email or password is incorrect. Try again." in `text-sm text-destructive`. Field-blaming is avoided (Supabase doesn't disclose which was wrong — a security-honest detail worth mentioning in the demo). Field-level validation (empty/malformed email) renders as 12 px destructive text + 14 px icon under the offending field. No shake animation, no toast for form errors.
- **Desktop (≥ 768):** the same stack gains card chrome — `bg-card border rounded-xl p-6`, page `pt-[12vh]`.

### 6.2 Signup (`/signup`)

Mirror of Login with these deltas:

- Headline "Set up your fridge", subtitle "One account, one fridge, two minutes."
- Fields: email + password only (matches plan §11 — no confirm-password; the show-password toggle is the modern replacement and one less thing to mistype on a phone).
- Password helper text (meta style, persistent, not an error): "At least 8 characters." Turns destructive only after a failing submit.
- Primary button "Create account"; footer link "Already have an account? **Log in**".
- Email confirmation is disabled (plan §11), so success lands directly on `/fridge` — whose empty state (§6.3) *is* the onboarding. No welcome tour, no modal.
- Duplicate-email failure: same banner pattern — "That email already has an account. **Log in instead?**" (link inside the banner).

### 6.3 Fridge (`/fridge`) — the centerpiece

```
Fridge                             [sign out]
12 items · 3 low · 2 finished                ← summary, meta style
( All ) ( Low 3 ) ( Finished 2 )             ← filter pills
DAIRY · 4                                    ← category label
┌────────────────────────────────────────┐
│ [img] קוטג' תנובה 5%                    │
│ 56px  Tnuva · 250 g                    │
│       (████ Full) (██░░ ½)             │  ← unit chips, 44px
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ [img] חלב טרי 3%                        │
│       Tara · 1 L        [! Low]        │
│       (█░░░ ¼)                          │
└────────────────────────────────────────┘
VEGETABLES · 2 …
```

- **Header:** title "Fridge"; trailing 44 px ghost `LogOut` button (`aria-label="Sign out"`) — mobile has no top bar, so sign-out lives here.
- **Inventory summary:** one meta-style line: "12 items · 3 low · 2 finished". This is the entire "dashboard" — deliberately a sentence, not stat cards.
- **Filter pills:** All / Low / Finished as 36 px `rounded-full` segmented pills with counts; selected = `bg-primary text-primary-foreground`, others = `bg-card border`. They filter in place; category grouping persists. (36 px visual height is padded to a ≥ 44 px hit area — §11.)
- **Category grouping:** fixed taxonomy order from plan §7 (Dairy → … → Other); only non-empty categories render. Header = category label style + count. Groups are not collapsible — a fridge holds ~10–40 items; collapsing adds state for nothing.
- **Product cards:** the `ProductCard` fridge variant (full spec §7). One card per product; physical units render as chips *inside* the card (plan §12: "Milk ×2: [100%] [50%]").
- **Unit chips — the core control:** `rounded-full`, 44 px tall, `bg-card border`; content = 4-segment mini-gauge + fraction label (`Full`, `¾`, `½`, `¼` — text, always, never color alone). Gauge fill: primary at 100/75/50; at 25 the filled segment uses `--warning-foreground`, the chip border shifts amber, and the card gains a `[TriangleAlert] Low` badge in warning colors; at 0 the gauge is empty gray with a `Finished` label and muted styling. Tap → consumption sheet (§8). ≥ 2 units: chips wrap horizontally, ordered fullest-first; each chip carries a full `aria-label` ("Unit 2 — half remaining. Change level").
- **Consume interaction:** tap chip → §8 sheet. **Delete interaction:** lives *inside* the same sheet ("Remove this unit"), because deletion is per physical unit (per-row `fridge_items`, plan §7) and a card-level trash icon would be ambiguous with 2+ units. Two taps for a destructive action is correct friction; the confirm dialog (§8) completes it.
- **Finished units:** disappear from All (plan §12 — they move to the Finished section), reappear under the Finished filter as muted cards with a `Restock` secondary button and per-unit delete. Low filter shows only ≤ 25 % live units.
- **Empty fridge:** the standard empty-state block (§9): `Refrigerator` icon in a muted circle, "Your fridge is empty" (style 2), "Scan a barcode — or search the catalog — and it'll show up here." (body, muted), primary button "Add your first product" → `/add`. This doubles as post-signup onboarding.
- **What keeps it from being a spreadsheet:** photos lead every card, Hebrew names at 16 px are the loudest text, quantity is a tactile chip instead of a number column, categories break the wall of rows, and there are no table headers, zebra stripes, or right-aligned numerals anywhere.

### 6.4 Add Product (`/add`)

- **Header:** title "Add a product".
- **Mode switcher:** a full-width 3-segment control directly under the title — `Scan` / `Search` / `Manual`, equal thirds, 44 px, `rounded-md` container with `bg-muted` track and `bg-card` raised active segment (shadcn Tabs, ARIA tablist). Icons 16 px + labels. **Scan is the default segment** (primary flow per plan §3). Switching is instant and non-destructive: typed search text, manual-form drafts, and camera state survive a segment change within the page session. The scan → manual handoffs (barcode prefill, name prefill) switch segments programmatically.

#### 6.4.1 Scan mode

Layout: viewport panel (full gutter width, aspect 4:3, `rounded-lg`, overflow hidden, max height 420 px on ≥ 768 px) → helper caption → "Or type the barcode" manual block (always visible, never revealed only on failure — plan §16 demands the fallback be permanently on screen).

State machine and visual spec:

1. **Pre-permission (idle).** No `getUserMedia` call on mount — the browser prompt fires only from a user gesture (researched best practice; also keeps Safari predictable). Panel: `bg-muted`, centered `Camera` 32 px muted, "Scan barcodes with your camera" (style 2), "The camera is used for scanning only — nothing is recorded." (meta), primary button "Enable camera".
2. **Requesting.** Same panel; button → spinner + "Waiting for permission…"; meta hint "Choose *Allow* in the browser prompt."
3. **Scanning.** Live video (`object-cover`). Overlay: `bg-black/40` dim with a clear **wide window — 78 % width, 2.4:1 aspect** (EAN-13 is wide; a square QR-style window is the wrong shape), `rounded-lg`, four corner brackets 2 px `white/90`. Brackets breathe (opacity 70 ↔ 100 %, 2 s loop — the only looping animation in the app; disabled under reduced motion). Bottom-center caption pill: "Point at the barcode" (`text-xs`, white on `black/60`, `rounded-full`). Torch: 44 px circular button, bottom-right inside the viewport, `bg-black/50` white `Flashlight` icon, rendered only when the camera track supports torch; active state swaps the icon and adds a primary ring.
4. **Detected.** Brackets snap to primary green, `CircleCheck` flashes centered (200 ms), `navigator.vibrate(50)` where supported, preview freezes → straight to lookup. Instant feedback is what makes scanning feel trustworthy; no beep by default.
5. **Misread (checksum fail, plan §6).** No sheet, no red: caption pill swaps to "Didn't catch that — hold steady" for 1.5 s, scanning continues.
6. **Looking up.** Bottom sheet (§3.5 level 2) rises: 64 px skeleton square + two skeleton lines + "Looking it up…" (meta). Camera stays frozen behind.
7. **Found → product-confirm sheet** (the plan §9 "product-confirm sheet"; the same sheet serves Search mode): 64 px product image (§7 treatment), product name (style 4, `dir="auto"`), brand · size (meta), category badge, source note when relevant ("Found on Open Food Facts", meta) — then a **Units stepper** (44 × 44 `−` / `+` secondary buttons, 16 px 600 `tabular-nums` count, range 1–20 per schema, disabled at bounds) — then full-width primary `h-12` "Add to fridge" and ghost "Scan again". Confirm → sheet closes, toast "Added קוטג' תנובה ×2", **scanner auto-resumes** — the after-shopping loop is scan-add-scan-add, so re-arming must cost zero taps.
8. **Not found (catalog + OFF miss, or OFF timeout with `fallbackUsed`).** Sheet, friendly, zero red: `SearchX` muted in circle, "We don't know this barcode yet" (style 2), "Add it once — it's saved to the shared catalog for everyone." (body muted), primary "Add details manually" → Manual segment with barcode prefilled (plan §6.1), ghost "Scan again".
9. **Store-internal code (RCN 2xx/02x).** Sheet: `Weight` icon muted, "Looks like a weighed item", "Store scales print their own labels, so there's nothing to look up. Add it manually instead." Primary "Add manually" → Manual segment, barcode field *empty* (plan §6.1 clears it), ghost "Scan again".
10. **Lookup network failure (client can't reach our API).** Sheet: `WifiOff`, "Couldn't reach the catalog", "Check your connection and try again.", primary "Retry", ghost "Enter it manually".
11. **Camera denied / no camera.** The viewport panel is *replaced* — same size, same `bg-muted` calm, zero destructive styling: `CameraOff` 32 px muted, "Camera is off" (style 2), "No problem — type the code printed under the barcode lines. Same result." (body muted), and a collapsed disclosure link "How to turn the camera back on" (meta, expands to a two-line generic browser-settings hint). Attention lands on the manual block below via layout, not autofocus (keyboard jumps are rude). The fallback is first-class by construction: it is the same manual block premium-path users see, in the same position — not an error page with a form bolted on.

**Manual barcode block** (always under the viewport): label "Or type the barcode" (body, 500), `h-12` numeric input (`inputmode=numeric`, `dir="ltr"` — digits are always LTR; placeholder "e.g. 7290000066318"), secondary `h-12` "Look up" button. Client-side checksum validation before the API call; failure = field error "That code doesn't look right — check the digits under the lines." Successful lookup joins the exact sheet flow above (states 6–10).

#### 6.4.2 Search mode

- **Field:** `h-12`, 16 px, `Search` icon 20 px leading, clear-`X` 44 px trailing target when non-empty, placeholder "Search by name — חלב, במבה, cottage…", **`dir="auto"` on the input** (Hebrew queries must render RTL as typed), debounced 300 ms, min 1 / max 60 chars per the API contract.
- **Pre-query state:** centered hint block — `Search` icon muted circle, "Search 8,000+ Israeli products" (style 2), "Hebrew or English names both work." (meta).
- **Results:** vertical list of `ProductCard` search-result variant rows (§7): 48 px thumb, name, brand · size meta, trailing 40 px `Plus` circle (visual affordance; the *entire row* is the ≥ 56 px tap target). Tap → the same product-confirm sheet as Scan state 7 (one confirm surface app-wide). After adding, the sheet closes back to the results with the query intact — users add several items from one search.
- **Loading:** first page → 6 skeleton rows (48 px square + two lines each). Never a spinner-in-void.
- **Pagination:** page size 20 (API contract); when `hasMore`, a full-width secondary "Show more" button follows the list; while loading page n+1 it shows an inline spinner + "Loading…"; existing rows never unmount. Explicit button over infinite scroll: predictable, testable, and the footer stays reachable.
- **No results:** empty-state block — `SearchX`, "Nothing for 'שוקולד פרה'" (query echoed, `dir="auto"`), "Check the spelling — or add it yourself in a few seconds.", secondary button "Add it manually" → Manual segment with the query prefilled as the product name.

#### 6.4.3 Manual mode

A short favor, not a form. One column, labels above fields, `h-12` inputs, 16 px text, optional fields marked with a muted "(optional)" suffix — no asterisks anywhere (name is the only required field, so we mark the exceptions, which is the friendlier direction).

Field order (talk-out-loud order): **Name** (`dir="auto"`, placeholder "e.g. קוטג' תנובה 5%") → **Brand** (optional, `dir="auto"`) → **Package size** (optional, placeholder "e.g. 250 g / 1 L") → **Category** — a wrapping **chip grid** of the 10 fixed categories (44 px chips, `rounded-full`, category icon 16 px + label; selected = primary fill; exactly-one-selected radio-group semantics; "Other" preselected) — a tap-friendly, visual control instead of an administrative `<select>` → **Barcode** (optional, numeric, `dir="ltr"`; when prefilled from a scan handoff it shows a meta note "From your scan" and stays editable) → **Units** stepper (default 1) → full-width primary `h-12` "Add to fridge".

Validation: name required — "Give it a name and you're done." under the field on empty submit; barcode checksum if present (§6.4.1 wording); duplicate barcode is *not* an error — the action returns the existing product (plan §10) and the UI confirms via the standard confirm sheet with a meta note "Already in the catalog — added your units."

### 6.5 Restock (`/restock`)

The pre-shopping checklist. Urgency is communicated by **position (lowest first), icons, count badges, and fraction text** — never color alone.

- **Header:** title "Restock", subtitle meta line "3 things to buy".
- **Section 1 — Running low** (`TriangleAlert` 20 px warning-foreground + section heading + count pill): rows = `ProductCard` restock variant — 48 px thumb, name, meta line "¼ left · Dairy", amber mini-gauge, trailing secondary button **"Restock"** (44 px, `RotateCcw` 16 px + label). Restock = "I bought another one": inserts a fresh 100 % unit (plan §10 `restockItem`); the row's button morphs to a check + "Added" for 800 ms, a toast "Milk added to your fridge" fires, and the row stays (the low unit still exists until consumed/finished — visually honest).
- **Section 2 — Recently finished** (last 14 days; `CircleCheck` muted + heading + count): same rows, muted treatment, empty gray gauge, meta "Finished · 2 days ago" (relative time), same "Restock" button — after restocking, the row fades out and collapses (250 ms), because restocked products leave this query (plan §13).
- **Section 3 — Recent activity** (`History` icon + heading): the quietest block — last 10 `consumption_events`, each one line of meta text: 16 px direction icon (`ArrowDownRight` consumed / `RotateCcw` restocked) + "חלב טרי 3% → ½" + "· 2h ago". No cards, no borders — a plain `space-y-2` list. Pure history; zero actions.
- **Per-section empty states** (§9 table): sections never vanish silently while others have content. Whole-page empty (new account): single empty-state block — `ShoppingBasket`, "Nothing to restock", "When something runs low or finishes, it lands here so you know what to buy.", secondary "Go to your fridge".
- Mobile footer: the ODbL attribution line (§5.4).

---

## 7. Product Card System

One component, four variants, one visual language. `ProductCard` is owned by Wave 2 Agent B (`src/components/fridge/`); Search/Scan surfaces reuse it — no page may hand-roll a product row.

| Variant | Where | Anatomy |
|---|---|---|
| `fridge` | `/fridge` | 56 px image · name (2-line clamp) · brand · size meta · optional Low badge · unit-chip row |
| `search-result` | Add → Search | 48 px image · name (1-line clamp) · meta · trailing `Plus` affordance · whole row tappable, ≥ 56 px |
| `confirm` | Product-confirm sheet | 64 px image · name (no clamp) · meta · category badge · sits above stepper + CTA |
| `restock` | `/restock` | 48 px image · name (1-line clamp) · state meta ("¼ left" / "Finished · 2d ago") · mini-gauge · trailing Restock button |

**Image treatment (identical in all variants):**

- Fixed **1:1** container, `rounded-lg`, `bg-white`, 1 px `border` (separates white packshots from white cards), `object-contain` — **never `object-cover`**: OFF images are packshots on white, and cover-cropping decapitates bottles.
- `next/image` with explicit square dimensions (no layout shift), `loading="lazy"` below the fold, `alt` = product name, OFF host allow-listed per plan §17.
- **Missing image:** the product's category icon, 20–24 px `text-muted-foreground`, centered on `bg-muted` in the same container. Deterministic, calm, never a broken-image glyph — and the category coding quietly aids scanning the list.
- Runtime image errors fall back to the same category tile.

**Text and data edge cases (all mandatory behaviors):**

| Case | Behavior |
|---|---|
| Hebrew product name in English UI | Name element carries `dir="auto"`; with `text-align: start` it right-aligns naturally inside the LTR card. Layout must not assume LTR name flow. |
| Very long names (Hebrew catalog names run long) | `line-clamp-2` (fridge/confirm) or `line-clamp-1` (dense rows); never horizontal scroll; card height flexes by one line. |
| Missing brand | Meta line shows package size alone. No "Unknown brand" placeholder — absence over noise. |
| Missing package size | Brand alone. Both missing → meta line renders the category name instead, so the slot never collapses to zero height (keeps card rhythm even). |
| Brand may also be Hebrew | Meta line carries `dir="auto"` too. The " · " separator is a direction-neutral middle dot. |
| Multiple physical units | Chips per §6.3, fullest-first, wrapping to a second row on narrow phones. The card never shows "×2" alone — each unit is individually visible and tappable (per-unit rows are the data model, plan §7). |
| Different remaining percentages | Always the 4-segment gauge + text fraction pair. The gauge is reinforcement; text carries the information (§11). |
| Long meta / badge collision | The `Low` badge sits in its own flex slot and never truncates; meta truncates first. |

**Mini-gauge (`LevelGauge`) spec:** 4 segments, each ~10 × 5 px (chip context) with 2 px gaps, `rounded-full` per segment; filled = `bg-primary` (or `bg-warning-foreground` when the unit is at 25 %), empty = `bg-muted`. It is a discrete 4-cell indicator by design — a continuous bar would imply precision the ¼-step model doesn't have (plan §12).

---

## 8. Consumption Interaction

Trigger: tapping any unit chip. Surface: **bottom sheet** on mobile (shadcn `Sheet`, `side="bottom"`, `rounded-t-xl`, scrim per §3.5, drag-handle bar 32 × 4 px `bg-muted` centered at top), **centered dialog ≤ `max-w-sm`** on ≥ 768 px. Why a sheet and not an inline control: five 52 px targets cannot fit inside a list card without destroying density, and the sheet lands the options in the thumb zone — the bottom third of the screen.

```
──────────── ▂▂▂ ────────────
 קוטג' תנובה 5%                ← name, style 4, dir=auto
 Unit 2 · added Aug 3          ← meta
┌───────────────────────────┐
│ ████  Full          100 % │ ← 52px rows
│ ███░  ¾              75 % │
│ ██░░  ½          ✓ current│ ← accent bg, check, disabled
│ █░░░  ¼              25 % │
├───────────────────────────┤
│ (✓)   Finished — all gone │ ← muted, after divider
├───────────────────────────┤
│ [Trash2] Remove this unit │ ← destructive text row
└───────────────────────────┘
```

- **Five options, one tap each:** Full / ¾ / ½ / ¼ / Finished as full-width 52 px rows — leading `LevelGauge` rendered at that row's level, label (16 px / 500), trailing percent (meta, `tabular-nums`). The control *is* the mental model: five amounts, pick one. No slider (fake precision, hard one-handed), no dial, no drag gesture (fails WCAG 2.5.7 alternatives thinking, and hidden gestures die in usability tests).
- **Current level:** `bg-accent`, `Check` 16 px, `aria-current="true"`, non-interactive (an idempotence guard against double-taps, mirroring plan §12).
- **Finished** sits below a divider with muted styling and `CircleCheck` — visually "the end of the scale", never red: finishing food is success, not damage. Selecting it closes the sheet, the unit leaves the All list (§6.3), toast: "קוטג' תנובה finished — it's on your Restock list" with action **"Undo"**.
- **Any selection:** optimistic update (`useOptimistic` per plan §9) — gauge animates 200 ms, sheet auto-dismisses, toast "Set to ½" + **Undo** (re-issues the previous absolute level — safe because `setRemaining` is idempotent and absolute; corrections are legal and event-logged per plan §12). Server failure → toast swaps to destructive "Couldn't save — check your connection", UI reverts.
- **Remove this unit:** destructive-text row (`Trash2` 16 px, `text-destructive`, 52 px) at the very bottom — deliberately distant from the level options. Tap → confirm dialog: "Remove this unit of קוטג' תנובה?" / meta "Its history goes with it." / ghost "Cancel" + destructive "Remove". This is the app's only delete path (rationale §6.3) and one of exactly two red buttons in the product.
- Raising a finished unit back to a level (from the Finished filter) uses the same sheet — the model explicitly allows corrections (plan §12 negative-delta events).

One-hand audit: the sheet's options span the bottom ~40 % of a 6.1-inch screen; the most common action (one step down) is one thumb-arc from the chip that opened it; dismiss = scrim tap, drag handle, or Esc/back.

---

## 9. Empty, Loading, and Error States

**Shared `EmptyState` block:** centered, `py-12`, 64 px `bg-muted` circle with a 32 px `text-muted-foreground` icon, title (style 2), body (body, muted, `max-w-[36ch]`, centered), optional single action button. Every state below tells the user what to do next — that is the acceptance test.

| State | Icon | Title | Body → next step | Action |
|---|---|---|---|---|
| Empty fridge | `Refrigerator` | Your fridge is empty | "Scan a barcode — or search the catalog — and it'll show up here." | Primary "Add your first product" → `/add` |
| No low items | `CircleCheck` | Nothing's running low | "Items drop in here when they hit a quarter left." | — (good news needs no button) |
| No recently finished | `CircleCheck` | Nothing finished lately | "When a unit hits Finished, it waits here for 14 days." | — |
| Restock fully empty | `ShoppingBasket` | Nothing to restock | "When something runs low or finishes, it lands here so you know what to buy." | Secondary "Go to your fridge" |
| Search loading | — | *(6 skeleton rows matching the result layout)* | — | — |
| No search results | `SearchX` | Nothing for "…" *(query echoed, `dir="auto"`)* | "Check the spelling — or add it yourself in a few seconds." | Secondary "Add it manually" (name prefilled) |
| Barcode lookup loading | — | *(sheet with image + text skeletons)* | "Looking it up…" | — |
| Product not found | `SearchX` | We don't know this barcode yet | "Add it once — it's saved to the shared catalog for everyone." | Primary "Add details manually" (barcode prefilled) + ghost "Scan again" |
| Camera unavailable/denied | `CameraOff` | Camera is off | "No problem — type the code printed under the barcode lines. Same result." | Manual barcode block right below (§6.4.1 state 11) |
| Network/API problem (fetch failed) | `WifiOff` | Couldn't reach the catalog | "Check your connection and try again." | Primary "Retry" + ghost "Enter it manually" |
| Page-level crash (`error.tsx`) | `TriangleAlert` | Something went wrong | "It's us, not you. Try again — your fridge data is safe." | Primary "Try again" (reset) |
| Auth failure / session expired | — | *(redirect to `/login`)* | Banner on login: "You've been signed out. Log in to continue." (info-toned: `bg-muted`, not red) | The login form |

**Loading doctrine:** skeletons mirror the final layout (`bg-muted rounded-lg animate-pulse`), lists show 3–6 placeholder rows, buttons carry their own inline `Loader2` spinner + verb ("Adding…", "Logging in…"), and there is **no full-page spinner anywhere**. Mutations are optimistic (§8), so most writes need no loading state at all.

**Error doctrine:** transient action failures → destructive-toned toast with retry guidance; contextual failures → inline banner/state per the table; form errors → field-level text; never a bare "Error" and never an alert dialog for something a toast can say. Failures degrade to the manual path wherever one exists (mirrors the plan's "degraded, not fatal" backend policy, plan §8). Toasts (the custom `Toaster` component) anchor bottom-center, offset 72 px above the nav on mobile, elevation level 1, one line + optional action.

---

## 10. Responsive Design

Mobile-first; the phone layout is the design. Larger screens get more air and columns — never stretched phone cards.

| Tier | Width | Layout changes |
|---|---|---|
| Narrow phone (SE/mini) | < 380 px | Gutter 12 px; fridge thumbs 48 px; unit chips wrap to a second row; type scale unchanged (small phones don't get smaller text) |
| Phone (baseline) | 380–767 px | Everything as specified in §6; bottom nav; sheets |
| Tablet | 768–1023 px | Top bar replaces bottom nav (§5.4); gutter 24 px; **Fridge cards → 2-column grid** (`md:grid-cols-2 gap-3`) inside `max-w-4xl`; Add content `max-w-lg` centered, scan viewport capped at 420 px tall; Restock stays a single `max-w-2xl` column (it's a checklist); auth gains card chrome; consumption + confirm sheets become centered dialogs `max-w-sm` |
| Desktop | ≥ 1024 px | Container `max-w-5xl`; **Fridge → 3 columns ≥ 1280 px** (`xl:grid-cols-3`, `max-w-6xl`); hover states activate (`hover:bg-accent` rows, hover borders on chips); everything else inherits tablet |

Max content widths (hard caps): auth `max-w-sm` (384) · Add `max-w-lg` (512) · Restock `max-w-2xl` (672) · Fridge grid `max-w-4xl` / `max-w-6xl` (896 / 1152) · nav container `max-w-5xl`. Full-bleed content on desktop is forbidden.

Grid mechanics: category sections span the full grid width; cards flow 2-up/3-up *within* a category; a category with one item shows one card at column width (no stretching). Chips, sheets→dialogs, and image sizes are the only components that change form across tiers — everything else only reflows.

---

## 11. Accessibility and Usability

Baseline: WCAG 2.2 AA, with the Apple/Material 44 px target convention adopted app-wide (above the 24 px legal floor of SC 2.5.8).

- **Touch targets:** every interactive element ≥ 44 × 44 px effective hit area (the visual element may be smaller with padding making up the difference — filter pills, nav slots, show-password, torch, clear-search are all audited in their specs). Adjacent targets keep ≥ 8 px gaps.
- **Focus states:** global `focus-visible` treatment — 2 px `ring` (primary green) with 2 px offset (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`) on *every* interactive element, including unit chips, nav slots, category chips, and sheet rows. Ring-on-white contrast ≈ 4.8:1, satisfying Focus Appearance (2.4.11). Never `outline: none` without this replacement.
- **Keyboard:** full app operable without touch — segments/tabs move with arrow keys (hand-rolled ARIA tablist in `AddFlow`), sheets/dialogs trap focus, restore it to the triggering chip on close, and close on Esc; Enter submits forms; the scanner has a complete keyboard equivalent by design (the manual barcode field). Toast Undo is focusable.
- **Contrast:** commitments in §3.3 (4.5:1 text, 3:1 UI graphics/indicators). Muted text never sits on muted surfaces except the verified warning pair.
- **Status ≠ color alone:** low = amber **+ `TriangleAlert` + "Low" text + "¼" fraction**; finished = gray **+ "Finished" label + empty gauge**; gauge fills always pair with text fractions; destructive rows carry icon + verb.
- **Labels:** every input has a visible `<label>` (placeholders are examples, never labels); icon-only buttons (sign-out, torch, clear, stepper, show password) carry `aria-label`s; unit chips get full sentence labels (§6.3); correct `autocomplete` / `inputmode` attributes per §6.1 (SC 1.3.5).
- **Announcements:** scanner state changes ("Looking it up…", "Not found") and search result counts announce via a polite `aria-live` region; the custom `Toaster` renders its own polite live region.
- **Text sizing:** 16 px minimum for inputs (§3.1); body-critical content at 14 px+; the layout tolerates 200 % browser zoom (single-column flows, no fixed-height text boxes); no text baked into images.
- **Forms and consumption controls (extra care per brief):** error text is tied to fields via `aria-describedby`; the level picker is semantically a radio group (current level `aria-current`, group labeled by the product name); destructive confirm dialogs name the object ("Remove this unit of X?") so screen-reader users confirm the right thing.
- **RTL correctness:** `dir="auto"` on every catalog-text element and the search input (§6.4.2); barcode/digit fields pinned `dir="ltr"`; direction-neutral separators (·); no directional icons whose meaning would flip.
- **Motion sensitivity:** `prefers-reduced-motion` disables the bracket loop, all translate/scale transitions, and skeleton pulse — opacity-only feedback remains (§12).
- **Auth accessibility:** no CAPTCHA, no memory puzzles (SC 3.3.8 — consistent with plan §17).

---

## 12. Motion

Motion is feedback, not decoration. Three duration tokens, two easings, no exceptions:

| Token | Value | Used for |
|---|---|---|
| `fast` | 150 ms, ease-out | Hover/press tints, nav press scale, tab-panel opacity swap, toggle states |
| `base` | 200 ms, ease-out | Gauge fill change, detected-flash, button-to-check morphs, toast enter |
| `slow` | 300 ms, `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet slide-up (scrim fades 250 ms), dialog scale-in 200 ms |

| Interaction | Spec |
|---|---|
| Sheet opening | Translate-Y from bottom 300 ms + scrim fade; exit 200 ms ease-in. Dialogs: 96 % → 100 % scale + fade |
| Successful scan | Brackets snap to green + one 200 ms `CircleCheck` flash + `vibrate(50)`. **One pulse — it must not loop** |
| Adding a product | Sheet slides away 200 ms → toast enters 200 ms. No confetti, no flying-card tricks |
| Consumption update | Optimistic gauge segments transition 200 ms; chip label crossfades; sheet dismisses |
| Restock action | Button content morphs to check + "Added" 200 ms, holds 800 ms; finished rows then fade + height-collapse 250 ms |
| Misread hint | Caption pill text swap, 150 ms fade |
| Skeletons | Default `animate-pulse` only |

Rules: nothing bounces, nothing loops except skeleton pulse and the scanning brackets, nothing exceeds 300 ms, springs/parallax/scroll-driven effects are banned, and `prefers-reduced-motion` reduces everything to ≤ 150 ms opacity crossfades (the scrim still appears — losing the modal cue is worse than losing the slide).

---

## 13. Visual Consistency Rules (non-negotiable)

1. **One accent.** Primary green is the only brand color. Amber = low stock only. Red = destructive/failed only.
2. **Semantic tokens only.** No hex values, no Tailwind palette classes (`bg-emerald-*`, `text-gray-*`) in any component — `bg-primary`, `text-muted-foreground`, etc., exclusively.
3. **No arbitrary shadows.** The three-level elevation model (§3.5) is exhaustive. Static content never floats.
4. **Seven text styles** (§3.1). New sizes/weights are defects, not creativity.
5. **The spacing set** (4/8/12/16/24/32/48) everywhere. No `p-[13px]`, no visual nudging.
6. **Four radii** (10/12/16/full) per the §3.4 table. No per-component overrides.
7. **One `ProductCard`, one `LevelGauge`, one `EmptyState`, one confirm sheet** — reused everywhere they apply; no page-local forks.
8. **44 px touch targets** on everything interactive, mobile and desktop alike.
9. **Product images:** 1:1, `object-contain`, white bg, hairline border, category-icon fallback — no exceptions, no crops.
10. **`dir="auto"` on every element that can contain catalog text.** Hebrew must render correctly on first paint everywhere.
11. **Every async surface ships its empty + loading + error states** from the §9 table in the same PR as the surface itself — states are not polish.
12. **Banned outright:** gradients, glassmorphism/backdrop-blur, charts, stat-card dashboards, carousels, decorative illustrations, emoji in UI copy, full-page spinners, and any second icon family.

---

## 14. Instructions for Frontend Implementation Agents

This section translates the specification into work rules for Wave 2 Agents A/B/C and the Wave 3 integrator. It changes nothing in the approved architecture (plan §5–§10); ownership boundaries from plan §20–§21 stay in force.

### 14.1 One-time setup (whoever owns `globals.css` first — coordinate per plan §21)

1. Apply the §4 token block to `globals.css` (`:root` values + `@theme inline` additions). Do not create a second CSS file; do not touch `.dark`.
2. Wire **Rubik** via `next/font/google` in the root layout: subsets `['latin','hebrew']`, weights `['400','500','600']`, `variable: '--font-rubik'`, `display: 'swap'`; expose through `--font-sans` per §4.
3. Viewport export: `viewport-fit=cover`; metadata: `theme-color #FBFAF6`.
4. Vendor shadcn-style primitives (new-york look). *As built (Wave 2/3): hand-written equivalents in `src/components/ui/` — `button`, `input`, `badge`, `skeleton`, and a single `modal` that serves both the sheet and dialog roles — plus a ~100-line custom `Toaster` (`app-shell/Toaster.tsx`) in sonner's role and hand-rolled ARIA tabs inside `AddFlow`. No shadcn/Radix/sonner packages were installed (dependencies were frozen during parallel Wave 2 work), and the owned equivalents follow this document's tokens and interaction specs.* **Do not add** `drawer`/vaul, `select`, `table`, chart, or calendar components — the designs deliberately avoid them, and dependency additions are frozen without coordinator sign-off (plan §21).

### 14.2 Component contract (build once, in the owning agent's directory)

| Component | Owner | Contract |
|---|---|---|
| `ProductCard` (variants `fridge` / `search-result` / `confirm` / `restock`) | Agent B | §7 exactly — image treatment, clamps, `dir="auto"`, missing-data fallbacks |
| `LevelGauge` | Agent B | 4 discrete segments; fill color by level per §7; sizes for chip and sheet contexts |
| `UnitChip` | Agent B | 44 px pill, gauge + fraction text, low/finished styling, full `aria-label` per §6.3 |
| `ConsumeSheet` + delete confirm | Agent B | §8 exactly, incl. optimistic flow, Undo toast, `aria-current` |
| `EmptyState` | Agent B | §9 block; all copy verbatim from the §9 table |
| `BottomNav` / top bar | Agent B | §5.2–§5.4, incl. safe-area inset, active logic, 48 px Add circle |
| Product-confirm sheet (+ units stepper) | Agent B (slot) / Wave 3 (wiring) | §6.4.1 state 7; the single confirm surface for scan *and* search |
| Scanner viewport + §6.4.1 states 1–5 and 11 | Agent C | Overlay geometry (78 % width, 2.4:1 window), brackets, torch, caption pill, denied panel; emits `onDetected` per the frozen prop contract |
| Auth forms | Wave 1 agent | §6.1–§6.2, incl. autocomplete attributes and the banner pattern |

### 14.3 Rules while implementing any UI

- **Copy is spec.** Use the exact strings from §6 and §9 (they were written for tone and for `dir` behavior). Copy changes go through the coordinator.
- **Class recipes are spec.** Use the §3.1 Tailwind recipes verbatim for the seven text styles; compose, don't invent.
- **Checklist for every screen PR:** tokens only (rule 2) · spacing set only (rule 5) · states shipped (rule 11) · 44 px targets (rule 8) · `dir="auto"` on catalog text (rule 10) · focus-visible ring present (§11) · inputs 16 px (§3.1) · works at 360 px width without horizontal scroll · content clears the bottom nav (`pb-24`).
- **Test hooks:** the RTL component tests planned in plan §15 should assert the visible-state contracts defined here (e.g., the consume control renders five levels with the current one disabled; the low badge renders icon + text; empty states render their action). This document is the expected-behavior source for those assertions.
- **Verify on a real phone** (Agent C's `/scan-test` and Wave 3's mobile pass, plan §20): specifically check iOS input-zoom (16 px rule), safe-area padding on the nav, Hebrew rendering in cards, and one-hand reach of the consume sheet.
- **When this document and visual instinct disagree, this document wins.** If it is genuinely wrong (a contrast failure, an unreachable target), stop and escalate to the coordinator rather than silently diverging — the same freeze discipline as `types.ts` / `schemas.ts` (plan §21).

### 14.4 What "done and on-brand" looks like (Wave 3 exit review)

A grader opening the deployed URL on a phone should see: a warm, quiet screen with one green accent; photos and Hebrew names leading every card; a bottom bar whose middle button obviously adds things; a scanner that explains itself before asking for the camera and never dead-ends; consumption that takes two taps and confirms itself; a restock list that reads like a shopping list, not a report; and not a single spinner-in-a-void, raw error, broken image, or misaligned Hebrew string anywhere.
