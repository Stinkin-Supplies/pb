# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: Model Pages + Era Cleanup + Category Overhaul · May 18, 2026**

---

## WHERE WE ARE

### What Was Built This Session

#### 1. ModelShop — app/modelshop/ModelShop.tsx
Industrial gold tile grid replacing the old FilterGroupLinks component. 7 families (Evolution removed — it's an era, not a model family). Each tile routes to `/harley/[slug]`. New Sailor font loaded via @font-face. Vintage metal inset border via layered box-shadow. Hover lift via framer-motion whileHover. Diagonal hatch texture on background.

Families: Touring, Softail, Sportster, Dyna (paired with FXR), FXR, Vintage, Revolution Max

#### 2. Family Page — app/harley/[family]/page.tsx
Fetches filter_groups from `/api/harley/[family]/models`. Renders industrial tiles (black bg, cream text, corner ornaments, hover lift + border glow). Pairs configured per family (Road King + Road Glide side by side for Touring, etc). Breadcrumb back to /modelshop. Stagger animation on load.

#### 3. Model Product Page — app/harley/[family]/[model]/page.tsx
Full product grid page. Uses `HarleyProduct` type from `@/lib/harley/catalog` and `getCatalogDb()`. Year range filter inline in hero (two number inputs, gold underline style). Two-row gold CategoryTabBar. Breadcrumb: Families → [Family] → [Model]. Pagination. Shimmer loading skeleton.

#### 4. API — app/api/harley/[family]/models/route.ts
Returns distinct filter_groups for a family with year range and product count. Uses `getCatalogDb()`. `params` is `Promise<{family}>` — awaited at top (Next.js 15+ requirement).

#### 5. API — app/api/harley/[family]/[model]/products/route.ts
Products by filter_group with year filter (inside EXISTS subquery), category filter using HARLEY_CATEGORIES dbCategories map, pagination, sort. Returns year_range for slider init and facets.categories. model_filter_groups cross-membership join included. `params` is `Promise<{family, model}>`.

#### 6. harley_models DB Cleanup
Based on official HD model diagram. Changes committed:
- FXLR/FXLRS/FXLRST → Softail family, filter_group = LOW_RIDER
- FXSB/FXSBSE/FXSE → Softail family, filter_group = SOFTAIL
- FXDRS → Dyna family, filter_group = DYNA
- FXRPF/FXRDG/FXEF → FXR family, filter_group = FXR
- FLHXXX/FLTRT/FLHLT/FLHLTSE → Trike family, filter_group = TRIKE
- FXWG/FXDG (Shovelhead) → filter_group = SUPER_GLIDE
- EL → Knucklehead family, filter_group = VINTAGE
- evolution_bigtwin → filter_group = EVOLUTION

#### 7. Category Cleanup DB
Merged 32 → 24 categories in catalog_unified:
- ELECTRONICS GROUP → ELECTRICAL SYSTEM GROUP
- TIRE AND TUBE GROUP → WHEEL AND RIM GROUP
- SISSY BAR-BACKREST-RACK GROUP → SEATING GROUP
- GRAPHICS GROUP → MEDIA PRODUCTS GROUP
- FENDER GROUP → FRAME AND BODY GROUP
- LUGGAGE GROUP + TRANSPORTATION GROUP → SECURITY-COVERS-SHELTERS GROUP
- RADIATOR GROUP → ENGINE GROUP

#### 8. Category Labels + Sort
Built `apply_category_labels.py` — run locally at `~/Downloads/apply_category_labels.py`. Maps raw DB category strings to clean display labels. Alphabetically sorted (All Parts pinned first). Applied to both era page and model page CategoryTabBar.

Display label map:
- ENGINE GROUP → Engine
- HANDLEBAR-CONTROLS-MIRRORS GROUP → Controls & Bars
- BRAKING GROUP → Brakes
- ELECTRICAL SYSTEM GROUP → Electrical
- CARBURETION-FUEL GROUP → Carb / Fuel
- TRANSMISSION-CLUTCH GROUP → Transmission
- SEATING GROUP → Seats
- WHEEL AND RIM GROUP → Tires & Wheels
- LIGHTING-LICENSE GROUP → Lighting
- HARDWARE GROUP → Hardware
- FOOT CONTROLS GROUP → Foot Controls
- EXHAUST GROUP → Exhaust
- FRAME AND BODY GROUP → Frame & Body
- MEDIA PRODUCTS GROUP → Swag
- HELMET AND SHIELD GROUP → Helmets
- SUSPENSION GROUP-FRONT → Suspension Front
- TANK GROUP-GAS AND OIL → Tanks
- DRIVE TRAIN GROUP → Drive Train
- SECURITY-COVERS-SHELTERS GROUP → Luggage & Covers
- WINDSHIELD-FAIRING GROUP → Windshield
- INSTRUMENT GROUP → Gauges
- SUSPENSION GROUP-REAR → Suspension Rear
- COMMON MISC GROUP → General
- TOOLS GROUP → Tools

#### 9. CategoryTabBar — Two-Row Layout
Rebuilt in both era and model pages. Splits tabs at ceil(n/2) — row 1 gets first half, row 2 gets second half. Each row scrolls horizontally independently. Gold background, black text, active = lighter top border + bottom seal. Smaller font (10px vs 11px) to fit two rows. No opacity dimming on inactive.

#### 10. Gap Fix — BottomNav Spacer
`components/BottomNav.tsx` line 21: `height: 82` → `height: 0`. This spacer was adding 82px at the top of every page globally.

#### 11. Gap Fix — Sticky Tab Offset
`app/era/[slug]/page.jsx` + `app/harley/[family]/[model]/page.tsx`: CategoryTabBar `top: 52` → `top: 0`. Was reserving space for a navbar that no longer exists.

#### 12. Era Page Fixes
- All `era.accent` references replaced with hardcoded `#c9a84c`
- Hero padding tightened to `28px 40px 16px`
- ERA_COVERAGE map: flathead=limited, knucklehead=full (promoted after VTwin data), panhead=pending
- VintagePendingState component: full holding page with era name as giant background glyph
- LimitedBanner component: amber left-border notice for sparse eras

#### 13. NavBar Shim
Created `components/NavBar.tsx` as re-export of BottomNav to fix 8 broken imports across account/admin/brands/checkout/order pages.

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Run Category Label Script
```bash
python3 ~/Downloads/apply_category_labels.py
```

### 2. vendor_offers Rebuild
Schema: `catalog_product_id (int FK) + vendor_code`. Use `part_number_dupes.csv` for routing logic. Script: `scripts/ingest/populate_wps_vendor_offers.js`

### 3. Fix STINKIN'' Double Apostrophe
```bash
grep -rn "STINKIN''" ~/Desktop/Stinkin-Supplies/app
```

### 4. Category Subcategory Filter
Second-level filter row appearing when a category is active. Query:
```sql
SELECT name, COUNT(*) as products
FROM catalog_unified
WHERE is_active = true
AND category = 'LIGHTING-LICENSE GROUP'
GROUP BY name -- or whatever subcategory field exists
ORDER BY products DESC;
```
Need to identify what field holds subcategory data first.

### 5. git commit
```bash
cd ~/Desktop/Stinkin-Supplies
git add -A
git commit -m "feat: model pages, category cleanup, gap fix, era improvements"
git push
```

---

## KEY FILES

| File | Location | Status |
|------|----------|--------|
| ModelShop.tsx | app/modelshop/ModelShop.tsx | ✅ Rebuilt this session |
| harley family page | app/harley/[family]/page.tsx | ✅ Built this session |
| harley model page | app/harley/[family]/[model]/page.tsx | ✅ Built this session |
| models API route | app/api/harley/[family]/models/route.ts | ✅ Built this session |
| products API route | app/api/harley/[family]/[model]/products/route.ts | ✅ Built this session |
| era page | app/era/[slug]/page.jsx | ✅ Major cleanup this session |
| BottomNav.tsx | components/BottomNav.tsx | ✅ Spacer fixed (0px) |
| NavBar.tsx | components/NavBar.tsx | ✅ Shim created this session |
| Footer.tsx | components/Footer.tsx | ✅ Padding fixed this session |
| apply_category_labels.py | ~/Downloads/ | ⚠️ NEEDS TO BE RUN |
| browse/page.jsx | app/browse/page.jsx | ✅ Gap fixed, topbar height reduced |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,655 / 87,219 active | Stable |
| catalog_fitment_v2 | ~1.54M total | 897,958 PU + JW Boon + OEM |
| catalog_oem_crossref | ~10,953 | Stable |
| harley_models | 293 | Cleaned up this session — families/filter_groups corrected |
| harley_model_years | ~2,075 | 5 new rows from PU import |
| harley_families | 17 | DO NOT MODIFY |
| model_filter_groups | 81 | Cross-membership rows |
| vendor_offers | 0 | ⚠️ NEEDS REBUILD |
| oem_fitment | 379,899 | All families intact |
| catalog_unified categories | 24 distinct | Down from 32 — merged this session |

---

## DB CONNECTION

```javascript
// Node.js — Vercel (IPv4 only)
const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

// Node.js — local dev
const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});

// psql CLI
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog"

// Preferred: use getCatalogDb() from @/lib/db/catalog in all new routes
```

⚠️ NEVER use IPv6 in Vercel-deployed code — use CATALOG_DATABASE_URL env var.
⚠️ Next.js 15+: params in route handlers is a Promise — always `await params` before destructuring.

---

## FITMENT COVERAGE (as of May 18)

| Family | Products | Notes |
|--------|----------|-------|
| Touring | 10,191 | Strong |
| Softail | 8,669 | Strong |
| Dyna | 6,534 | Strong |
| FXR | 4,094 | Good |
| Sportster | 4,721 | Good |
| Shovelhead | 1,028 | Decent |
| Trike | 2,526 | Good |
| Revolution Max | 126 | Thin |
| V-Rod | 175 | Thin |
| Flathead | 26 | Limited — banner shown |
| Knucklehead | ~200+ | VTwin scan added data |
| Panhead | 1 | Pending — VTwin scan in progress |
| Total covered | 17,431 | 20% of 87,219 active products |
