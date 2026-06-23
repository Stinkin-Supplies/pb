# Stinkin' Supplies — Master Reference
**Last Updated:** June 8, 2026 (Forty-Fifth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Homepage rebuilt ✅ | Font system locked ✅ | ModelFinder built ✅ | FilterSidebar updated ✅ | VariantSelector fitment+color mode ✅ | Variant groups merged ✅ | browse.ts name-grouping ✅ | VTwin SKU dupes resolved ✅ | Filtering system audit complete ✅ | MODEL_ALIASES expanded ✅ | VTwin scraper round 2 complete ✅ | CategoryBentoGrid built ✅ | display_subcategory taxonomy COMPLETE ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (active) | **~91,000** | ✅ PU 36,396+ / WPS 15,844+ / VTwin 38,365+ (misclassification cleanup added products) |
| catalog_fitment_v2 | ~3,800,000 rows | ✅ |
| catalog_oem_crossref | ~65,000+ rows | ✅ |
| catalog_variant_groups | 7,556 | ✅ 8 new master groups added session 41 |
| catalog_variant_members | ~29,031 | ✅ All reparented to master groups |
| oem_fitment | 379,899 rows | ✅ |
| harley_model_years | ~2,070 rows | ✅ |
| harley_models | ~360 rows | ✅ |
| mv_family_product_ranges | 81,332 rows | ✅ Auto-refreshes in index_unified.js |
| Typesense | **90,605 docs** | ✅ Current |

### Fitment Coverage (June 8 — Session 44)
| Vendor | Total Active | With Fitment | Coverage |
|--------|-------------|--------------|----------|
| PU | 36,396 | 17,918 | 49.2% |
| VTwin | 38,365 | 15,480 | 48.0% |
| WPS | 15,844 | 6,463 | 40.8% |

✅ VTwin scraper round 2 complete (22,583 rows imported). Coverage ceiling ~50% — remaining products are universal/generic with no fitment data.

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (IPv4 — ALWAYS use this)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
psql:       psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
Vercel env: CATALOG_DATABASE_URL
```

⚠️ NEVER use IPv6 2a01:4ff:f0:fa6f::1 in Vercel code.
⚠️ catalog_app is NOT superuser — use \copy not COPY TO file.
⚠️ catalog_oem_crossref joins on `sku` column — NOT product_id or catalog_product_id.

---

## FONT SYSTEM

| CSS Variable | Font | Use |
|---|---|---|
| `--font-tanker` | Tanker Regular | Primary display — era names, headings, kinetic text, CTAs |
| `--font-bespoke` | Bespoke Serif Regular | Editorial/secondary — section headers, prices, tab labels |
| `--font-stencil` | Share Tech Mono | UI labels, mono badges, SKUs, year ranges |
| `--font-sailor` | → alias for --font-tanker | Legacy compat |
| `--font-caesar` | → alias for --font-bespoke | Legacy compat |

Files: `public/fonts/Tanker-Regular.ttf` + `public/fonts/BespokeSerif-Variable.ttf` (variable wght 300–800, replaces BespokeSerif-Regular.ttf)
Bebas Neue — removed. No longer used.

---

## HOMEPAGE LAYOUT

Section order (app/page.jsx):
1. SmokeBackground (canvas, lazy loaded)
2. VideoHero — R2 CDN video
3. ModelFinder — era → year → model code → /browse
4. ScrollVelocity band
5. BrandRolodex

Removed: FloatingNav, EraKineticTile, EraCarousel.

---

## MODEL FINDER

`components/home/ModelFinder.jsx`

**Flow:** Era tile grid → Year slider (era-locked range) → Model codes (from /api/models/search) → /browse

**Props:**
- `compact` — narrow sidebar variant (maxWidth 420, 2-col era grid, smaller model list)
- `onSelect(fn)` — controlled mode, receives `{ era, year, model, url }`

**Routing:** Always `/browse?family=X&year=Y&model=Z` — no /harley/ intermediate.

**API:** Uses existing `/api/models/search?q={year}` endpoint. Results grouped by family client-side.

**Era year ranges:** Static fallback in `ERA_YEARS` constant, auto-gates slider to era bounds.

---

## VTWIN SKU NAMESPACE

| Type | Format | Count | Status |
|------|--------|-------|--------|
| Prefixed | `VT-10-0030` | 37,749 | **Canonical / Active** |
| Bare | `10-0030` | 521 active, 14,407 inactive | Legacy orphans |

Always use VT- prefixed SKUs. import_vtwin_fitment_partial.mjs handles both automatically.

---

## VTWIN FITMENT SCRAPER

```bash
cd /Users/home/Desktop/vtwin_scraper/vtwin_scraper
source venv/bin/activate
python3 scrape_vtwin_fitment.py
```

Scrape target list: `vtwin_scrape_targets.csv` (20,236 SKUs)

| Category | Count | Action |
|----------|-------|--------|
| *UPDATE discontinued | 13 | Skip |
| SKU-only (no name) | 1,794 | Skip |
| Tools/universal | 2,350 | vtwin_mark_universal.sql |
| Scrape targets | 20,236 | Re-scrape (in progress) |

---

## VTWIN FITMENT IMPORT

```bash
VTWIN_CSV=/Users/home/Desktop/vtwin_scraper/vtwin_scraper/vtwin_checkpoint_export.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs

# After import: mark "All models" rows as universal
UPDATE catalog_unified cu SET is_universal = true
FROM vtwin_scrape_data vsd
WHERE cu.source_vendor = 'VTWIN'
  AND (cu.sku = 'VT-' || vsd.sku OR cu.sku = vsd.sku)
  AND vsd.fitment_raw IN ('All models', 'All')
  AND cu.is_universal = false;
```

MODEL_ALIASES: `E → [EL,ELH]`, `XL883 → [5 variants]`, `XL1200 → [11 variants]`, `FLHR → [10 Road King variants]`, `FLHX → [4 Street Glide variants]`, `FLSTF → [5 Fat Boy variants]`, `FXSTB → [3 Night Train variants]`, `FXDWG → [4 Wide Glide variants]`

---

## VARIANT GROUP SYSTEM

### Master Groups Added Session 41

| ID | display_name | family_key | Members |
|----|---|---|---|
| 30315 | 100' Wire Spool | 100-wire-spool | 68 |
| 30316 | 25' GXL Wire Spool | 25-gxl-wire-spool | 32 |
| 30317 | 35' Wire Spool | 35-wire-spool | 10 |
| 30318 | Universal Brake Line | universal-brake-line | 122 |
| 30319 | Brake Line | brake-line | 387 |
| 30320 | Quick Connect Clutch Cable - Upper | qc-clutch-cable-upper | 102 |
| 30321 | License Plate Frame | license-plate-frame | 14 |
| 30322 | Windshield | windshield | 32 |
| 30323 | Air Cleaner Cover | air-cleaner-cover | 14 |
| 30324 | Foot Pegs | foot-pegs | 19 |

### Merge Pattern (for future use)
```sql
-- Step 1: Create master (separate transaction, commit first)
BEGIN;
INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key, created_at)
SELECT 'Base Name', source_vendor, 'family-key', NOW()
FROM catalog_variant_groups WHERE display_name LIKE 'Base Name - %' LIMIT 1;
COMMIT;

-- Step 2: Reparent + delete (one transaction)
BEGIN;
UPDATE catalog_variant_members SET group_id = (SELECT id FROM catalog_variant_groups WHERE family_key = 'family-key' LIMIT 1)
WHERE group_id IN (SELECT id FROM catalog_variant_groups WHERE display_name LIKE 'Base Name - %');
UPDATE catalog_unified SET variant_group_id = (SELECT id FROM catalog_variant_groups WHERE family_key = 'family-key' LIMIT 1)
WHERE variant_group_id IN (SELECT id FROM catalog_variant_groups WHERE display_name LIKE 'Base Name - %');
DELETE FROM catalog_variant_groups WHERE display_name LIKE 'Base Name - %'
  AND NOT EXISTS (SELECT 1 FROM catalog_variant_members WHERE group_id = catalog_variant_groups.id)
  AND NOT EXISTS (SELECT 1 FROM catalog_unified WHERE variant_group_id = catalog_variant_groups.id);
COMMIT;
```

⚠️ MUST update both `catalog_variant_members.group_id` AND `catalog_unified.variant_group_id` — FK on catalog_unified will block DELETE otherwise.

⚠️ Products in catalog_unified but never in catalog_variant_members need direct UPDATE:
```sql
UPDATE catalog_unified SET variant_group_id = {MASTER_ID}
WHERE name ILIKE '%base name%' AND is_active = true AND variant_group_id IS NULL;
```

---

## BROWSE DEDUP (browse.ts)

DISTINCT ON key — 3-tier priority:
1. `variant_group_id::text` — explicit group
2. `brand || '||' || base_name` — name-based (strips color/finish suffixes)
3. `'u' || id::text` — unique fallback

Color suffixes stripped: `(BLACK)` parenthetical, `- BLACK` dash-suffix, bare words: BLACK/CHROME/SILVER/GOLD/RED/BLUE/GREEN/BROWN/PINK/WHITE/NATURAL/POLISHED/WRINKLE/GLOSS/MATTE/SATIN.

✅ Middle regex tightened in session 42 — now restricted to known finish words `(BLACK|CHROME|SILVER|...)` only. BRAKE PAD - FRONT and BRAKE PAD - REAR no longer collapse.

---

## FILTER SIDEBAR

`components/browse/FilterSidebar.jsx`

Props: `facets`, `filters`, `onChange`, `open`, `onClose`, `mobileSheet`

Sections: In Stock toggle, Category, Subcategory (when category active), **Engine Era**, Brand, Price.

- Model Family section removed in session 41.
- `year` chip added in session 42 — shows and dismisses independently.
- Family chip clear also resets `year`.
- Outer `activeCount` now includes `family`, `model`, `year` — header badge correct.
- Both clear-all handlers include `year: null`.
- Section renamed "Era" → "Engine Era" (engine generation, not HD family).
- Coverage hint ("Fitment-matched + universal parts") shown when family/model active.

---

## VARIANT SELECTOR

`components/browse/VariantSelector.jsx`

Three render modes:
- **Mode A — fitment+color:** variants have both `option_1_value` AND `fitment_by_family`. Fitment accordions, color swatches inside. Fixes duplicate BLACK/CHROME rows.
- **Mode B — fitment only:** flat year-range rows (FitmentVariantCard).
- **Mode C — options only:** flat color/size list (VariantCard).

---

## ADMIN INLINE EDIT

Activate: `?admin=1&token=ADMIN_SECRET`

Edit fields: display_category, display_subcategory, fits_all_models
Flag types: wrong_category, wrong_subcategory, missing_fitment, wrong_fitment, bad_image, duplicate, other

API: `app/api/admin/products/[id]/route.ts`
- `PATCH { action: "update" }` — updates catalog_unified + Typesense
- `PATCH { action: "flag" }` — upserts to catalog_review_flags
- `GET` — returns unresolved flags (limit 200)

---

## CATEGORY TAXONOMY

21 Display Categories (confirmed June 8 from DB):
Accessories & Misc · Brakes · Carburetion & Fuel · Electrical · Engine · Exhaust · Fenders & Body · Foot Controls · Frame & Hardware · Handlebar & Controls · Instrumentation · Lighting · Luggage & Racks · Riding Gear & Apparel · Seating · Security & Covers · Suspension · Tools & Chemicals · Transmission & Clutch · Wheels & Tires

CategoryBentoGrid excludes: Riding Gear & Apparel + Tools & Chemicals (18 tiles shown)

### display_subcategory Status — ALL CATEGORIES COMPLETE ✅

| Category | Coverage |
|----------|---------|
| Instrumentation | 96.5% |
| Fenders & Body | 95.9% |
| Carburetion & Fuel | 95.8% |
| Lighting | 95.3% |
| Seating | 95.0% |
| Handlebar & Controls | 94.9% |
| Transmission & Clutch | 94.8% |
| Brakes | 94.3% |
| Luggage & Racks | 93.3% |
| Exhaust | 93.1% |
| Foot Controls | 92.9% |
| Security & Covers | 92.8% |
| Wheels & Tires | 92.2% |
| Electrical | 92.1% |
| Engine | 91.2% |
| Suspension | 87.8% |
| Frame & Hardware | 87.5% |
| Tools & Chemicals | 71.3% |
| Riding Gear & Apparel | 65.2% |
| Accessories & Misc | 6.1% (catch-all) |

See filter_roadmap.md Phase 5 for full subcategory lists per category.

### Category Reorganizations (Session 44)
- Gas Tanks & Caps (was Carburetion & Fuel) → **Fenders & Body** (Gas Tanks + Gas Caps & Petcocks)
- Oil System (was Carburetion & Fuel) → **Transmission & Clutch** (Oil System subcategory)
- Alternators/ignition/starters → moved from Engine → **Electrical**
- ABS sensors → moved from Engine/Electrical → **Brakes**
- Wheel bearings → moved from Transmission → **Wheels & Tires**

---

## VTWIN IMAGE URL PATTERN

```
Primary:  https://www.vtwinmfg.com/WebPics/{first-segment}/{raw-sku}a.jpg
Fallback: https://www.vtwinmfg.com/WebPics/{first-segment}/{raw-sku}.jpg
```
~51% hit rate. Backfill script: `/tmp/vtwin_image_backfill.py`

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|---------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| VTwin SKU prefix | VT- prefixed = canonical. Bare = legacy. |
| catalog_oem_crossref join | Joins on `sku` — NOT product_id |
| sortMap in browse.ts | Must use d. alias — inner DISTINCT ON query aliases as d |
| WPS variant groups | wps_product_id is a LINE id — cap at 20 members |
| Framer Motion removeChild | Never swap two component trees — keep single mounted element |
| source_vendor case | catalog_unified: uppercase. catalog_products: lowercase |
| oem_numbers[] rebuild | After bulk deleting from catalog_oem_crossref, rebuild oem_numbers[] |
| Typesense oem_numbers | In schema AND query_by — required for OEM# search |
| name_extraction re-run | Safe: NOT EXISTS guard prevents overwrite |
| name_extraction Tier 3 deleted | 1,269,765 conf=0.65 rows gone. Re-run will NOT reinsert. |
| Reindex | Run locally: node scripts/ingest/index_unified.js --recreate |
| psql \copy | Writes to LOCAL machine /tmp/ |
| psql regex backslashes | Use dollar-quoting $r$...$r$ to avoid \s* being interpreted as psql commands |
| zsh special chars | Write .js file and run with node — never inline -e with IPv6 brackets or ! |
| VTwin fitment parallel import | NEVER run two import_vtwin_fitment_partial.mjs in parallel |
| import_vtwin_fitment_full.mjs | Wrong schema. Do not use. |
| mv_family_product_ranges refresh | Run plain REFRESH MATERIALIZED VIEW (not CONCURRENTLY) |
| Tanker/Bespoke fonts | public/fonts/Tanker-Regular.ttf + BespokeSerif-Regular.ttf. Not in git. |
| Variant group merge FK | Must update catalog_unified.variant_group_id BEFORE deleting old groups |
| Variant group merge — direct assign | Products not in catalog_variant_members need direct UPDATE on catalog_unified |
| FlowingMenu hydration | Seeded random sr() — never use Math.random() in row config |
| "All Makes" family | Slug is "street". Routes to /browse?universal=true |
| AdminEditPanel token | Read from ?token= URL param, cached in sessionStorage |
| Next.js 15 route params | params is Promise<{id}> — must await before reading .id |
| JGI- prefix on OEM | Strip to get real HD OEM. Already done. |
| A- prefix on OEM | Eastern Motorcycle Parts — same OEM as without prefix |
| FLHX 1984 | Street Glide didn't exist — bad data, deleted |
| VTwin bare dupes | 14,407 deactivated. 521 legitimate bare-only remain active. |
| fits_all_models column | Does NOT exist on catalog_unified. Use `is_universal` instead. |
| vtwin_mark_universal.sql | Sets `is_universal = true` using category + name patterns. 2,328 marked. |
| VTwin "All models" scraper rows | Post-import: UPDATE from vtwin_scrape_data WHERE fitment_raw IN ('All models','All') |
| browse.ts dash-suffix regex | Fixed session 42 — open-ended dash strip replaced with finish-word list |
| import_vtwin_fitment_full.mjs | Wrong schema — uses harley_model_id not model_year_id. Do not use. |
| harley_models duplicate codes | OK to have same model_code with different year ranges (different eras). NOT ok to duplicate same year range. |
| catalog_unified.vendor_sku | THE real per-vendor ordering number. internal_sku is OUR format (CAT###/TRN###.p) — never use for vendor API calls. PU: vendor_sku = brand_part_number minus dashes (fallback: sku for ~7,103 empty rows). WPS: vendor_sku 100% populated, use as-is. VTwin: vendor_sku populated for 37,749/38,365 (fallback: sku minus 'VT-' prefix). |
| product_vendors.vendor_sku | Fixed June 11–12 (pass 47) — was wrongly populated from internal_sku. Now correct per above. Any future bulk product_vendors inserts MUST source from catalog_unified.vendor_sku with the fallback logic, NOT internal_sku. |
| canonical_products / product_vendors | New layer (pass 47) sitting on top of catalog_unified. One canonical_product per real-world part; product_vendors links it to 1+ catalog_unified rows (one per vendor). catalog_unified.canonical_product_id FK. Browse/search still query catalog_unified directly — canonical layer is for checkout/fulfillment only (for now). |
| canonical_match_proposals | OEM-based cross-vendor match review queue. Status flow: pending → confirmed/rejected → applied (merge executed). Review at /admin/canonical-matches?token=... |
| Shared params array across differently-shaped queries | NEVER share one params array across queries whose WHERE clauses differ (e.g. product/count/facet variants that each drop a different condition). If a condition's $N placeholder is dropped from one query's text but the params array still has a value at that position, Postgres throws "could not determine data type of parameter $N". Each query needs its own freshly-renumbered params array. (browse.ts fixed June 16 — tagged-condition + renderWhere() pattern.) |
| Dead-link checks must verify Content-Type, not just HTTP status | A URL can return a healthy 200 while serving something completely unusable as an image (confirmed: zip archives at `application/x-zip`). Status-only checks are blind to this. Always check the real Content-Type header. |
| PU image data — image_url / product_image / pu_brand_enrichment.image_uri can ALL be the same bad zip | Confirmed June 16: ~13,790 active PU products (37.6%) had every image-related field across `pu_catalog`, `catalog_unified`, and `pu_brand_enrichment` independently resolving to the same zip archive. Not a column-mixup bug — PU's feed never shipped a direct image for these. **Resolved June 17:** a live zip-extraction proxy (`app/api/image-proxy/route.ts`) already existed in the codebase and is now wired into both the browse grid and PDP, recovering real photos for the large majority on the fly (no batch pipeline needed). The genuine remainder — products with no source image anywhere, not even in `pu_brand_enrichment` — is **3,573**, not 13,790. See `PU_ZIP_EXTRACTION_TODO.md` (now reference-only) and `HANDOFF_LOG.md` Fifty-Third Pass. |
| catalog_media for PU sourced from pu_brand_enrichment.image_uri | Any `catalog_media` fallback logic does NOT independently rescue PU products affected by the zip contamination above — it's the same underlying source. |
| pu_brand_enrichment SKU join | Use the normalized join from `import_pu_brand_catalogs_WORKING.js`: `replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')` — NOT a plain exact `sku = sku` match, which under-matches. |
| Standalone Node scripts (scripts/ingest/*.mjs) and env vars | These do NOT get Next.js's automatic `.env.local` loading. Either `export` the var in the shell first, or load it manually in the script (see `check_dead_images.mjs` for a minimal loader pattern). |
| Server components needing onError image fallback | A server component (e.g. `app/browse/[slug]/page.jsx`) can't hold `useState` directly. Extract a small client component (see `components/browse/ProductImage.jsx`) that takes `src`/`alt` props and handles the `onError` fallback internally. |

---

## FULFILLMENT & CHECKOUT ARCHITECTURE (Pass 47)

**Model:** Drop-ship. PU + WPS via API (daily inventory sync + order submission). VTwin manual PO (no API yet) — payment captured, order flagged `pending_manual` in `vendor_orders`, admin submits PO manually.

**Canonical product layer:** Customer never sees vendor identity. `canonical_products.canonical_sku` (CP-XXXXXX) is what's in the cart. `product_vendors` links each canonical product to 1+ `catalog_unified` rows (one per vendor offering that part). The fulfillment optimizer (`lib/fulfillment/optimizer.ts`) resolves vendor routing **at checkout time**, not at add-to-cart:
1. Minimize vendor count (one shipping charge > two)
2. Maximize margin within the chosen vendor
3. Fall back to next vendor if out of stock
4. VTwin items always flagged `is_manual_fulfillment = true`

**Order flow:**
`CartContext` (localStorage, canonical_sku-based) → `/api/checkout/prepare` (runs optimizer, creates `orders`/`order_items`/`vendor_orders`, returns totals) → `/api/checkout/charge` (gateway-agnostic — ONE TODO block for the actual charge call) → `triggerFulfillment.ts` (vendor adapter pattern: PU/WPS API submission, VTwin → manual queue).

**Adding a new vendor (e.g. VTwin API later):** write an adapter implementing `submitOrder(items, shipping, ourRef)` in `triggerFulfillment.ts`, register it in `ADAPTERS`. No other changes needed.

**Payment gateway:** Not yet chosen. `app/api/checkout/charge/route.ts` has the full order-marking + fulfillment-trigger logic already wired; only the actual gateway charge call (TODO block) needs filling in once decided. Shape examples for Authorize.net and NMI are commented inline.

**Shipping/tax:** Currently $0 placeholders (`calculateShipping`, `calculateTax` in `checkout/prepare/route.ts`) — need real logic before launch.

---

## KEY COMMANDS

```bash
# Connect
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'

# Typesense reindex
node scripts/ingest/index_unified.js --recreate

# VTwin fitment import
VTWIN_CSV=./scripts/ingest/vtwin_fitment_combined.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs

# Mark universal VTwin tools (initial — category/name based)
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -f scripts/ingest/vtwin_mark_universal.sql

# Mark "All models" universals from scrape data (run after vtwin fitment import)
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' -c "
UPDATE catalog_unified cu SET is_universal = true
FROM vtwin_scrape_data vsd
WHERE cu.source_vendor = 'VTWIN'
  AND (cu.sku = 'VT-' || vsd.sku OR cu.sku = vsd.sku)
  AND vsd.fitment_raw IN ('All models', 'All')
  AND cu.is_universal = false;"

# OEM backfill (VTwin)
UPDATE catalog_unified cu
SET oem_numbers = ARRAY(SELECT oem_number FROM catalog_oem_crossref WHERE sku = cu.sku)
WHERE source_vendor = 'VTWIN'
AND EXISTS (SELECT 1 FROM catalog_oem_crossref WHERE sku = cu.sku);

# Refresh mat view
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -c 'REFRESH MATERIALIZED VIEW mv_family_product_ranges;'

# Rebuild variant groups
node scripts/ingest/build_variant_groups.cjs

# Deploy
npx vercel --prod

# Add env var
npx vercel env add ADMIN_SECRET

# VTwin scraper
cd /Users/home/Desktop/vtwin_scraper/vtwin_scraper && source venv/bin/activate
python3 scrape_vtwin_fitment.py

# Check fitment coverage
SELECT source_vendor, COUNT(DISTINCT cu.id) as total, COUNT(DISTINCT f.product_id) as with_fitment,
  ROUND(COUNT(DISTINCT f.product_id)::numeric / COUNT(DISTINCT cu.id) * 100, 1) as pct
FROM catalog_unified cu
LEFT JOIN catalog_fitment_v2 f ON f.product_id = cu.id
WHERE cu.is_active = true GROUP BY source_vendor ORDER BY source_vendor;

# Check null slugs
SELECT source_vendor, COUNT(*) FROM catalog_unified
WHERE is_active = true AND (slug IS NULL OR slug = 'null') GROUP BY source_vendor;

# Fix null slugs (VTwin)
UPDATE catalog_unified SET slug = lower(regexp_replace(regexp_replace(name,'[^a-zA-Z0-9\s-]','','g'),'\s+','-','g'))
  || '-' || lower(replace(sku,'VT-','')) || '-v'
WHERE source_vendor='VTWIN' AND is_active=true AND (slug IS NULL OR slug='null');

# Find over-split variant groups
SELECT regexp_replace(display_name, '\s*-\s*[^-]+$', '') AS base_name, COUNT(*) AS sub_group_count
FROM catalog_variant_groups GROUP BY base_name HAVING COUNT(*) > 2 ORDER BY sub_group_count DESC LIMIT 20;

# Check variant group assignment
SELECT cvg.display_name, cvg.family_key, cvg.id, COUNT(cu.id) AS assigned
FROM catalog_variant_groups cvg
LEFT JOIN catalog_unified cu ON cu.variant_group_id = cvg.id AND cu.is_active = true
WHERE cvg.family_key IS NOT NULL
GROUP BY cvg.display_name, cvg.family_key, cvg.id ORDER BY cvg.display_name;
```

---

*Master Reference — Last update: June 11–12, 2026 · Forty-Seventh Pass (canonical products layer + fulfillment/checkout backend scaffolded, critical product_vendors.vendor_sku data fix across all 90,605 rows, OEM match review queue live at /admin/canonical-matches)*

*Operational Gotchas table appended June 16, 2026 (Fifty-First Pass) with findings from that session — params-array query bug, PU image zip contamination, and related patterns. Executive summary stats and main status line above are NOT refreshed past June 11–12 — sessions 48–50's stat changes aren't reflected here yet; cross-reference HANDOFF_LOG.md and ROADMAP.md for current figures.*
