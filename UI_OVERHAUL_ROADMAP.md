# Stinkin' Supplies — UI Overhaul Roadmap
**Started:** July 14, 2026
**Scope:** Full front-end pass — every page touched, component library modernized, one navbar standardized site-wide.
**Not in scope (yet):** backend/catalog/taxonomy work — that track (ROADMAP.md / MasterRef.md) keeps running in parallel, untouched by this doc.

---

## 0. Ground rules

- **Brand system: evolve, don't replace.** Tanker (display), Bespoke Serif (editorial), Barlow (body/UI), Share Tech Mono (technical data) stay. Gold `#c9a84c` / cream `#f0ebe3` / black `#0a0909` stay as the core palette. What's fair game: spacing scale, motion language, component shapes/radii, hover states, secondary accent tints — refinement, not a rebrand.
- **No Tailwind, no shadcn, no next-themes in this codebase.** Every "inspiration" component pulled from a UI kit site gets ported to plain CSS + inline styles + framer-motion (already a dependency), matching how `BottomNav.tsx` is written. Don't introduce a styling framework mid-project.
- **One navbar, not four.** The project currently has `NavBar.tsx` (a re-export shim), `BottomNav.tsx` (mobile orb nav), `FloatingNav.jsx` (homepage-only), and `SideNav.jsx` (unused/legacy?). Phase 1 ends with exactly one navbar system doing both desktop and mobile duty.
- **Every "done" claim gets checked against the live page, not the plan.** Same lesson the backend team learned the hard way (HANDOFF_LOG, session 84) — mark a page done here only after actually loading it.

---

## 1. Where things stand right now

| Area | Current state |
|---|---|
| Navbar | `NotchNavbar.tsx` — **shipped this session**, wired into `app/layout.tsx`, live on every page except `/admin*` and `/database`. Desktop: full pill nav with notch-cutout corners (Browse/Models/Categories left, Brands/Deals right, Search/Garage/Cart utility cluster, cart badge wired to `useCartSafe`). Mobile: collapses to logo + hamburger + search/cart, slide-down panel for the rest. `BottomNav.tsx` (orb nav) is **still live underneath it** — see Phase 1 below for the plan to retire or repurpose it. |
| Landing page (`app/page.jsx`) | 61 lines — `VideoHero`, `ModelFinder`, era/model browse entry points. Needs a full rework per your notes (see §3, Phase 2). |
| Home components | `VideoHero`, `ModelFinder`, `ModelSearch`, `EraCarousel`, `EraKineticTile`, `ScrollVelocity`, `SmokeBackground`, `FloatingNav` (candidate for retirement once NotchNavbar covers homepage). |
| Browse / PDP | Most mature part of the front end — `FilterSidebar`, `ProductCard`, `ProductImageGallery`, `VariantSelector`, `OemPartTimeline`, `PDPTabs`. Functionally solid; visual pass still needed for consistency with new component language. |
| Models / Categories | `CategoryBentoGrid`, `FlowingMenu` — bespoke, animated, already fairly current. Lighter-touch pass. |
| Checkout | Flagged in ROADMAP.md Phase 11 as **architecturally mid-rebuild** (old Supabase checkout being retired, Postgres-backed flow wired but page itself not rebuilt). This is a backend-and-frontend joint job — coordinate before restyling a page that's about to be functionally rewritten anyway. |
| Admin | Deliberately excluded from NotchNavbar and from the general aesthetic pass — it has its own cream/gold admin theme (`admin/products/[id]`, `ProductManager`, canonical-matches workbench). Cosmetic-only touch-ups at most, low priority. |
| Garage / Account | `/account` redirects to `/garage` (profile, bikes, points, wishlist, orders tabs) — this is the de facto account hub. Needs a pass once nav/landing are stable. |
| Brands, Deals, Search, Auth, Order | Not yet inventoried in detail — first task of Phase 4 is opening each and cataloging what exists today. |

---

## 2. Phase order

Sequencing is deliberate: nav first (done), then the highest-traffic/highest-impact page (landing), then the pages that share the most components (browse/PDP), then everything else, then a consistency sweep.

### Phase 0 — Navbar ✅ done this session
- `NotchNavbar.tsx` built and wired into every page via `app/layout.tsx`.
- **Open decision:** what happens to `BottomNav.tsx`. Three options, pick one before Phase 1 closes:
  1. Keep both — NotchNavbar as top utility nav, BottomNav as mobile thumb-zone nav (current state, works, but two nav systems is real maintenance overhead).
  2. Retire BottomNav entirely, extend NotchNavbar's mobile panel to cover garage/search/filter-toggle duty it currently handles on `/browse`.
  3. Merge concepts — NotchNavbar's structure, BottomNav's mobile ergonomics (bottom-anchored on small screens only).
- `FloatingNav.jsx` (homepage-only nav) and `SideNav.jsx` — audit whether either is still referenced anywhere; if dead code, remove during this phase rather than carry it through the whole overhaul.

### Phase 1 — Navbar decision + cleanup
- Resolve the BottomNav question above.
- Remove or fold in `NavBar.tsx` (currently just `export { default } from './BottomNav'` — either point it at NotchNavbar or delete it once nothing imports it).
- Confirm nav behavior on `/browse` (filter-toggle interaction currently lives in BottomNav) doesn't break if BottomNav changes.

### Phase 2 — Landing page rework
This is the page every visitor hits first — highest leverage of the whole overhaul.
- Bring your ideas for the new landing page (layout, sections, what replaces/keeps `VideoHero` + `ModelFinder`).
- Decide: does `ModelFinder`'s era-first → year slider → model flow stay as the primary landing CTA, or does the new design lead with something else (search, categories, deals)?
- `EraCarousel` / `EraKineticTile` — keep, restyle, or retire?
- This phase is where the "evolved" component language (spacing, motion, card shapes) gets defined for real — later phases reuse whatever gets built here rather than re-inventing per page.

### Phase 3 — Browse + PDP visual pass
Highest shared-component surface area — get this right once, it propagates everywhere product data shows up.
- `ProductCard`, `ProductImageGallery`, `FilterSidebar`, `VariantSelector`, `PDPTabs`, `OemPartTimeline` — restyle to match Phase 2's component language, not a functional rebuild (this layer is already solid per MasterRef.md Phase 5/7).
- `ProductQuickViewModal` — check if still in use (ROADMAP.md Phase 5 notes QuickView modal was *removed*, cards navigate straight to PDP — component may be dead code).

### Phase 4 — Remaining pages, page by page
Inventory-then-execute for each, same pattern as the backend taxonomy work (audit → plan → apply):
`models`, `categories`, `brands`, `deals`, `search`, `garage` (account hub), `auth`, `checkout` (coordinate with backend rebuild first), `order`.

### Phase 5 — Consistency sweep + admin touch-up
- Full click-through of every page against the new component language.
- Light cosmetic pass on `/admin/*` only if time allows — functionality there is out of scope.
- Kill any now-dead components (`FloatingNav`, `SideNav`, `ProductQuickViewModal`, old `NavBar.tsx` shim) found unreferenced along the way.

---

## 3. What I need from you to keep this moving

1. **BottomNav decision (Phase 1)** — keep both navs, retire BottomNav, or merge. Pick one of the three options above (or a fourth).
2. **Landing page direction (Phase 2)** — you mentioned ideas for "every bit of it." Landing page is next up — bring layout/section ideas whenever you're ready and I'll turn them into a real page.
3. **Per-phase, as we get there** — any reference components/screenshots/URLs the way you did for the navbar. Same process each time: I'll port the concept to this project's actual stack (plain CSS + framer-motion, no new frameworks) rather than dropping in incompatible Tailwind/shadcn code.

---

## 4. Component inventory (for reference)

**Nav/shell:** `NotchNavbar.tsx` (new, live) · `BottomNav.tsx` · `NavBar.tsx` (shim) · `FloatingNav.jsx` · `SideNav.jsx` · `Footer.tsx` · `CartDrawer.jsx` · `CartRoot.jsx` · `CartContext.jsx`

**Home:** `VideoHero.jsx` · `ModelFinder.jsx` · `ModelSearch.jsx` · `EraCarousel.jsx` · `EraKineticTile.jsx` · `ScrollVelocity.jsx` · `SmokeBackground.jsx` · `HeroSearch.jsx` · `HorizontalScrollCarousel.jsx`

**Browse/PDP:** `BrowseBackButton.jsx` · `BrowseSearchBar.jsx` · `FilterSidebar.jsx` · `InlinePanel.jsx` · `OemAlternativesPanel.jsx` · `OemPartTimeline.jsx` · `PDPTabs.jsx` · `ProductCard.jsx` · `ProductImage.jsx` · `ProductImageGallery.jsx` · `ProductQuickViewModal.jsx` (possibly dead) · `VariantSelector.jsx`

**Models/Categories:** `CategoryBentoGrid.jsx` · `FlowingMenu.jsx`

**Admin (out of scope, low priority):** `AdminEditPanel.jsx` · `ProductManager.jsx` · `DatabaseSnapshotView.jsx`

**Pages:** `/` (home) · `/browse` + `/browse/[slug]` (PDP) · `/models` · `/categories` · `/brands` · `/deals` · `/search` · `/garage` (account hub) · `/account` (redirect) · `/auth` · `/checkout` · `/order` · `/era` · `/modelshop` · `/harley` · `/admin/*` · `/database`

---

## 5. Log

- **Session 1 (July 14, 2026):** Roadmap created. `NotchNavbar.tsx` built from your Vengeance UI reference, adapted to plain CSS/framer-motion/real routes, wired into `app/layout.tsx`. Live on every page except `/admin/*` and `/database`. `BottomNav.tsx` left in place pending Phase 1 decision.
