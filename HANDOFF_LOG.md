# Stinkin' Supplies — Session Handoff
**Date:** April 29, 2026
**Status:** ✅ Homepage live | ✅ Era pages live | ✅ Fonts fixed | ✅ FKs migrated | ✅ Pricing live | ✅ VTwin fitment complete

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,301 docs
- **Fitment filtering** — catalog_fitment_v2 (~2,896,193 rows) — FK now points to catalog_unified
- **Fitment dropdowns** — /api/fitment HD-only, canonical tables
- **Pricing** — Daily price sync live, MAP compliant, WPS + PU
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — /era/[slug] live for all 9 eras with side panel filters
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body) via next/font/google
- **Browse** — /browse replaces /shop everywhere
- **Admin** — /admin/products live
- **Production** — https://stinksupp.vercel.app

---

## 📦 WHAT WAS DONE THIS SESSION (April 29 — DB session)

### FK Migration (both tables)
- `catalog_fitment_v2.product_id` FK migrated from `catalog_products` → `catalog_unified`
- `vendor_offers.catalog_product_id` FK migrated from `catalog_products` → `catalog_unified`
- Orphaned rows deleted (non-Harley products not in catalog_unified)
- Both tables were in mixed state (partial previous migration) — handled cleanly
- Script: `scripts/ingest/03_migrate_fks_to_unified.sql`

**Final row counts after migration:**
- catalog_fitment_v2: 2,327,058 (was 3,048,726 — orphans removed)
- vendor_offers: 23,499 (was 67,342 — orphans removed)

### Daily Price Sync
- Built `scripts/ingest/daily_price_sync.js` — bulk SQL, no row-by-row loops
- WPS: reads from `catalog_pricing`, joins `catalog_unified` on SKU
- PU: reads from `pu_pricing`, joins `catalog_unified` on part_number / punctuated_part_number
- MAP formula: `GREATEST(LEAST(GREATEST(cost/0.75, map_price), NULLIF(msrp,0)), map_price)`
  - Target 25% margin
  - Floor at MAP (never below MAP)
  - Cap at MSRP (never above MSRP)
  - Final GREATEST(…, map_price) handles vendors where MSRP < MAP (bad vendor data)
- Upserts into `vendor_offers`, then bulk syncs to `catalog_unified.computed_price`
- MAP compliance report at end of each run
- **Result: 0 MAP violations** after formula fix
- Cron set on Hetzner: `0 3 * * *`

**Pricing results:**
- WPS: 26,729 products synced, 87 below min margin (priced at MAP — not violations)
- PU: 24,007 products synced, 1,129 below min margin (MAP=MSRP vendor data issue — not violations)

### VTwin Fitment Migration
- Updated `scripts/ingest/migrate_vtwin_fitment_to_v2.js` to use `catalog_unified.id` (was using `catalog_products.id` via join)
- Pass 1: 542,161 rows inserted for products with exact harley_families name matches
- Added `FAMILY_ALIASES` map to handle VTwin generic names:
  - `"Softail"` → `["Softail Evo", "Softail M8"]`
  - `"Touring"` → `["Touring"]`
  - `"Sportster"` → `["Sportster"]`
  - `"Dyna"` → `["Dyna"]`
  - `"FXR"` → `["FXR"]`
  - `"V-Rod"` → `["V-Rod"]`
- Pass 2: +26,974 rows for previously unmatched Softail products
- **Total VTwin fitment inserted: ~569,135 rows**

### model_alias_map Expansion
Added 6 new aliases:
```sql
('fltrx', 'touring', 'FLTRX', 9)
('fxdb',  'dyna',   'FXDB',  9)
('flhtk', 'touring', 'FLHTK', 9)
('flstf', 'softail', 'FLSTF', 9)
('flhrc', 'touring', 'FLHRC', 9)
('fxdwg', 'dyna',   'FXDWG', 9)
```

---

## 🚨 CURRENT ISSUES

### Issue 1 — Typesense not reindexed
catalog_unified updated with new computed_price values. Typesense still has 88,301 docs from April 23. Needs reindex to reflect current pricing.

### Issue 2 — PU ACES fitment files not yet received
PU fitment coverage ~30%. Request ACES XML files from PU rep to push to 70%+.

### Issue 3 — Era pages may show low product counts
catalog_fitment_v2 now points to catalog_unified, but era page queries should be verified against new FK target.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Reindex Typesense** — pick up new computed_price values
2. **Request PU ACES fitment files** from PU rep
3. **Verify era page product counts** — confirm queries work against new FK
4. **Era images** — 8 WebP images still missing (see list below)
5. **My Garage audit** — was built against /shop, needs review for /browse

---

## 🏗️ INFRASTRUCTURE (unchanged)

```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.126.nip.io)
Vercel:     epluris-projects/pb → https://stinksupp.vercel.app
Cron:       0 3 * * * daily_price_sync.js (Hetzner)
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| catalog_fitment_v2 FK | Now points to catalog_unified.id ✅ |
| vendor_offers FK | Now points to catalog_unified.id ✅ |
| VTwin family names | Use FAMILY_ALIASES in migrate_vtwin_fitment_to_v2.js — "Softail" → Softail Evo + M8 |
| PU duplicate SKUs | 1001-0018 and 10010018 both exist — use DISTINCT ON cu.id in joins |
| PU map_price | pu_pricing.suggested_retail = MAP for PU (not a separate MAP field) |
| WPS map_price | cu.map_price on catalog_unified |
| MSRP < MAP | Handled by final GREATEST(…, map_price) in pricing formula |
| Daily price sync | scripts/ingest/daily_price_sync.js — bulk SQL, ~seconds to run |
| Price sync cron | 0 3 * * * on Hetzner, logs to /var/log/price_sync.log |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| Era image blend | mixBlendMode: "screen", opacity: 0.9 for dark backgrounds |
| Sportster split | yearMin/yearMax in era config splits Ironhead vs Evo via hmy.year filter |
| harley_families no slug | Use name for all joins |
| DATABASE_URL not persistent | export each session |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| catalog_fitment archived | catalog_fitment_archived — do not write to it |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| vendor_code casing | Always lowercase ('wps'/'pu') |
| source_vendor casing | Always UPPERCASE ('WPS'/'PU'/'VTWIN') |

## 🖼️ ERA IMAGES STILL NEEDED
```
public/images/eras/panhead.webp
public/images/eras/ironhead-sportster.webp
public/images/eras/shovelhead.webp
public/images/eras/evolution.webp
public/images/eras/evo-sportster.webp
public/images/eras/twin-cam.webp
public/images/eras/milwaukee-8.webp
public/images/eras/chopper.webp
```
Min 800×600px, landscape, WebP format.
