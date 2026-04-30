# Stinkin' Supplies — Session Handoff
**Date:** April 30, 2026
**Status:** ✅ Typesense reindexed | ✅ PU images fully ingested | ✅ WPS fitment rep contacted | ⏳ Era pages unverified | ⏳ PDP rich content not yet displayed

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,512 docs (reindexed April 30, pricing current)
- **Fitment filtering** — catalog_fitment_v2 (~2,896,193 rows) — FK points to catalog_unified
- **Fitment dropdowns** — /api/fitment HD-only, canonical tables
- **Pricing** — Daily price sync live, MAP compliant, WPS + PU
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — /era/[slug] live for all 9 eras with side panel filters
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body) via next/font/google
- **Browse** — /browse replaces /shop everywhere
- **Admin** — /admin/products live
- **Production** — https://stinksupp.vercel.app
- **PU images** — 23,975 / 24,009 products have image_url (99.9%)
- **PU dual images** — 8,310 products have image_urls array with 2 images

---

## 📦 WHAT WAS DONE THIS SESSION (April 30)

### Typesense Reindex
- Ran `node scripts/ingest/index_unified.js --recreate`
- 88,512 docs indexed, 0 errors
- computed_price values now current

### WPS Fitment
- Contacted WPS rep for fitment files
- Awaiting ACES XML delivery

### pu_products Schema Migration
Added 4 new columns:
```sql
ALTER TABLE pu_products
  ADD COLUMN part_image text,
  ADD COLUMN product_image text,
  ADD COLUMN special_instructions text,
  ADD COLUMN supplier_number text;
```

### PU Image + Content Ingestion
Built `scripts/ingest/enrich_pu_products.cjs`:
- Parses all PU XML files — Catalog Content (`<root>`) and PIES formats
- **Format detection by root tag** (`xml.trimStart().startsWith('<root>')`) — not filename
- Extracts: `part_image`, `product_image`, `special_instructions`, `supplier_number`
- Bulk upserts into `pu_products` via temp table
- Syncs `image_url` + `image_urls` to `catalog_unified`

Ran against two directories:
- `scripts/data/pu_pricefile/` — 134 files, 77,958 updated
- `~/Desktop/Stinkin-Supplies/data/pu-files/` — 95 files, 6,434 updated

**Final PU image coverage:**
- image_url populated: 23,975 / 24,009 (99.9%)
- image_urls (2+ images): 8,310 / 24,009
- 34 products still missing — no image in any XML

**Brands with minor SKU mismatch (low priority):**
- jagoilcoolers — 55 parsed, 1 updated
- dannygray — 72 parsed, 6 updated
- ohlins — 102 parsed, 50 updated
- avon-gripd — 285 parsed, 40 updated

---

## 🚨 CURRENT ISSUES

### Issue 1 — Era pages unverified
catalog_fitment_v2 FK migrated to catalog_unified on April 29. Era page product count queries have not been verified against the new FK target.

### Issue 2 — PDP not displaying rich content
`image_urls`, `special_instructions`, and bullets (`features`) are now in `catalog_unified` but the PDP does not yet render them. Need:
- Multi-image gallery using `image_urls` array
- `special_instructions` block (conditional, where not null)
- Bullets from `features` array (may already render — confirm)

### Issue 3 — WPS fitment files pending
Contacted rep April 30. Once received, run fitment extraction and insert into catalog_fitment_v2.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Verify era page product counts** — confirm queries work against new FK
2. **PDP rich content** — multi-image, special_instructions, bullets
3. **WPS fitment files** — ingest once received from rep
4. **Era images** — 8 WebP images still missing
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
| PU XML format detection | Detect by root tag: `<root>` = Catalog Content, else PIES — NOT by filename |
| PU enrich script | scripts/ingest/enrich_pu_products.cjs <xml_dir> |
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
