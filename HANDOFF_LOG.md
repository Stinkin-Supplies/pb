# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— FORTY-FIRST PASS (June 5, 2026) ———

Session: Forty-First Pass · June 5, 2026

## WHERE WE ARE

Full frontend + data quality session. Homepage rebuilt around ModelFinder. Font system locked in. Variant display overhauled. 199 variant sub-groups merged into 8 master groups. Typesense reindexed twice.

⚠️ Several output files need to be dropped into the codebase — see NEXT SESSION in CHASE_LIST.

## What Was Done This Session

### 1. Homepage Rebuilt ✅
`app/page.jsx` — new section order:
- VideoHero (unchanged)
- ModelFinder (new — era → year → model code)
- ScrollVelocity band
- BrandRolodex

Removed: FloatingNav, EraKineticTile, EraCarousel.

### 2. ModelFinder Component ✅
`components/home/ModelFinder.jsx` — 3-step bike selector:
- **Step 1:** Era image cards (uses ERAS array from eras.js, full art/gradient/corner bracket style matching EraCarousel). Clicking advances immediately.
- **Step 2:** Year slider locked to era's year range. Smart tick marks. GO button fetches models.
- **Step 3:** Model codes from `/api/models/search?q={year}`, grouped by family, gold rivet radio buttons. Find Parts CTA routes to `/browse?family=X&year=Y&model=Z`.

Props: `compact` (narrow sidebar variant), `onSelect` (controlled mode).
Routing: always goes to `/browse` — no more `/harley/` intermediate page.

### 3. Font System Locked In ✅
`app/layout.tsx` updated:
- `--font-tanker` = Tanker Regular (primary display — replaces New Sailor + Bebas Neue)
- `--font-bespoke` = Bespoke Serif Regular (editorial/secondary)
- `--font-stencil` = Share Tech Mono (UI mono, unchanged)
- Legacy aliases: `--font-sailor → --font-tanker`, `--font-caesar → --font-bespoke`
- Bebas Neue removed from Google Fonts import

Files confirmed at: `public/fonts/Tanker-Regular.ttf` + `public/fonts/BespokeSerif-Regular.ttf`

### 4. FilterSidebar — Model Family Removed ✅
`components/browse/FilterSidebar.jsx`:
- Removed `HD_FAMILY_SUBMODELS` constant
- Removed `HD_FAMILIES_FLAT` constant
- Removed `{/* Model Family */}` Section block
- Removed `family: false` from sections initial state
- Removed family auto-open `useEffect`
- Removed `filters.family` + `filters.model` from `activeCount`

### 5. VariantSelector — Fitment+Color Mode ✅
`components/browse/VariantSelector.jsx` — new Mode A (fitment+color):

**Problem:** Products like sissy bars had `option_1_value="BLACK"` AND `fitment_by_family` data, causing flat list to show 3× BLACK, 2× CHROME (one per fitment family).

**Fix:** When variants have both option values AND fitment, group by fitment family first. Each family row is an accordion; color swatches inside. Gold color dot per finish name.

Three modes total:
- Mode A — fitment+color (new): fitment accordions with color swatches
- Mode B — fitment only (unchanged): flat year-range rows
- Mode C — options only (unchanged): flat color/size list

### 6. browse.ts — Name-Based Group Key ✅
`lib/db/browse.ts` — DISTINCT ON key upgraded:

**Before:** `COALESCE(variant_group_id::text, 'u' || id::text)`

**After:** 3-tier key:
1. `variant_group_id::text` — explicit group (best)
2. `brand || '||' || base_name` — strip trailing color/finish suffixes via 3-pass regex
3. `'u' || id::text` — unique (no grouping)

Regex strips: `(BLACK)` parenthetical, `- BLACK` dash-suffix, bare trailing color words (BLACK/CHROME/SILVER/GOLD/RED/BLUE/GREEN/BROWN/PINK/WHITE/NATURAL/POLISHED/WRINKLE/GLOSS/MATTE/SATIN).

Also adds `ng` subquery to count name-grouped variants for the badge.

### 7. Variant Group Merges ✅
8 master groups created, 199 sub-groups deleted:

| Master Group | family_key | Members |
|---|---|---|
| Universal Brake Line | universal-brake-line | 122 |
| Brake Line | brake-line | 387 |
| Quick Connect Clutch Cable - Upper | qc-clutch-cable-upper | 102 |
| License Plate Frame | license-plate-frame | 14 |
| Windshield | windshield | 32 |
| Air Cleaner Cover | air-cleaner-cover | 14 |
| Foot Pegs | foot-pegs | 19 |
| 100' Wire Spool | 100-wire-spool | 68 |

Also: 25' GXL Wire Spool (32 members), 35' Wire Spool (10 members).

Wire spool `option_2_value` (Color) populated from product names via file-based SQL (psql regex workaround).

**Key lesson:** `catalog_variant_members` reparenting is not enough — must also UPDATE `catalog_unified.variant_group_id` to avoid FK violations and ensure browse dedup works.

### 8. Typesense Reindex ✅ (×2)
90,510 docs, 0 errors both runs.

## DB State After This Session

| Table | Change |
|-------|--------|
| catalog_variant_groups | 8 new master groups added (IDs 30315–30324). 199 old sub-groups deleted. |
| catalog_variant_members | All members reparented to master group IDs. |
| catalog_unified.variant_group_id | Updated to master group IDs for all affected products. Wire spool 74 products assigned to 30315. |
| catalog_variant_members (wire spool) | option_2_name=Color, option_2_value extracted for 45 members of group 30315. |
| Typesense | 90,510 docs indexed. |

## Files in outputs/ Ready to Drop In

| File | Destination |
|------|-------------|
| page.jsx | app/page.jsx |
| ModelFinder.jsx | components/home/ModelFinder.jsx |
| FilterSidebar.jsx | components/browse/FilterSidebar.jsx |
| VariantSelector.jsx | components/browse/VariantSelector.jsx |
| browse.ts | lib/db/browse.ts |
| layout.tsx | app/layout.tsx |
| by-engine-route.ts | app/api/models/by-engine/route.ts |
| codes-route.ts | app/api/models/codes/route.ts |
| Tanker-Regular.ttf | public/fonts/Tanker-Regular.ttf |
| BespokeSerif-Regular.ttf | public/fonts/BespokeSerif-Regular.ttf |

## What Needs to Happen Next

See CHASE_LIST — NEXT SESSION section. Priority order:
1. Drop all output files into codebase
2. Run vtwin_mark_universal.sql
3. Import vtwin scraper results when ready
4. Add ADMIN_SECRET to Vercel
5. Manual variant group review (size variants)

---

# ——— FORTIETH PASS (June 4, 2026) ———

Session: Fortieth Pass · June 4, 2026

## WHERE WE ARE

Long data quality + fitment session. Fixed three files (route.ts, extract_fitment_from_names.mjs, FilterSidebar.jsx), resolved major VTwin SKU duplicate problem, imported VTwin fitment, identified remaining scrape gap.

## What Was Done This Session

### 1. console.log Removed from route.ts ✅
Removed debug console.log from isAuthorized() in app/api/admin/products/[id]/route.ts.

### 2. extract_fitment_from_names.mjs — Tier 2 Fix ✅
Added softailCutoff: skip Softail family mapping when year range ends ≤ 1984.

### 3. FilterSidebar.jsx — Full Redesign ✅
Active filter chips, gold dot indicators, auto-open sections, collapsed desktop labels, mobile Clear + Show Results footer, framer-motion hover.

### 4. VTwin SKU Duplicate Discovery & Cleanup ✅
14,407 bare-SKU dupes deactivated. Prefixed (VT-) rows canonical. Active VTwin: 38,270.

### 5. import_vtwin_fitment_partial.mjs — Four Patches ✅
fits_all_models wired, MODEL_ALIASES added, SKU resolution active-only + prefixed priority, delete scope includes bare IDs.

### 6. VTwin Fitment Import ✅
185,234 rows inserted on correct prefixed IDs.

### 7. VTwin Fitment Gap Analysis ✅
20,236 genuine scrape targets → vtwin_scrape_targets.csv. Scraper running.

### 8. OEM Backfill ✅
catalog_oem_crossref joins on sku. UPDATE 3,897 VTwin products.

---

# ——— THIRTY-NINTH PASS (June 4, 2026) ———

Data quality session. Fitment filter bug fixed. OEM cleanup. Typesense reindex 104,917 docs.

---

# ——— THIRTY-EIGHTH PASS (June 4, 2026) ———

Admin inline PDP edit built. API route for update + flag. catalog_review_flags table. Next.js 15 params fix.

---

# ——— THIRTY-SEVENTH PASS (June 3, 2026) ———

FlowingMenu built. /models page rebuilt. mv_family_product_ranges mat view (9s → 83ms). Font system added. VTwin scraper finished (37,980 rows).

