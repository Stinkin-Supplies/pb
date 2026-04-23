# Stinkin' Supplies — Master Reference
**Last Updated:** April 23, 2026
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Images backfilled ✅ | Fitment authority live ✅ | OEM expanded ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified | 88,512 rows | ✅ Clean |
| — WPS products | 26,754 | ✅ 100% priced |
| — PU products | 24,009 | ✅ 99.99% priced |
| — VTwin products | 37,749 | ✅ Ingested April 23 |
| Typesense indexed | 88,301 | ✅ Reindexed April 23 |
| Products with images | 18,415 PU + WPS via catalog_media | ✅ |
| catalog_oem_crossref | ~95,116 rows | ✅ |
| catalog_unified.oem_numbers[] | 5,411 products | ✅ |
| catalog_fitment (legacy) | 26,008 rows | ✅ |
| catalog_fitment_v2 | 2,717,429 rows / 10,580 products | ✅ Live |
| catalog_products.fits_all_models | 3,646 universal products | ✅ |
| harley_families | 15 | ✅ |
| harley_models | 158 model codes | ✅ |
| harley_model_years | 1,415 rows | ✅ |
| is_harley_fitment = true | 7,244 products | ✅ |

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (Hetzner)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
Connection: postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog
```

Note: catalog_app is NOT a superuser. Cannot DISABLE TRIGGER ALL.

---

## SCHEMA OVERVIEW

### Two-Schema Layout
- **vendor schema** — raw vendor data, never modified by application
- **public schema** — application catalog, derived from vendor data

---

## PUBLIC SCHEMA — KEY TABLES

### catalog_products (~95,484 rows | ~620 MB)
Master customer-facing product catalog.

**Key columns:** id, sku, slug, name, description, brand, category, subcategory, source_vendor, msrp, cost, map_price, computed_price, has_map_policy, drop_ship_eligible, is_active, is_discontinued, manufacturer_part_number, oem_part_number, upc, pricing_rule_id, internal_sku

**Cascade children:** catalog_media, catalog_specs, catalog_fitment, catalog_prices, catalog_reviews, catalog_variants, catalog_attributes

**Non-cascade dependents (delete manually first):** vendor_offers, map_audit_log, routing_decisions

---

### catalog_unified (88,512 rows)
Denormalized customer-facing table. Regular table — TRUNCATE + INSERT to rebuild.

WPS: 26,754 | PU: 24,009 | VTwin: 37,749. 73 columns including fitment flags, image_url, features[], oem_numbers[], warehouse stock.

---

### catalog_media
Canonical image table. `catalog_images` was DROPPED April 17.

Schema: `(id, product_id→catalog_products CASCADE, url, media_type, priority)`

Two URL types: direct HTTPS CDN links + LeMans ZIP URLs (proxied via `/api/img`)

---

### catalog_fitment (26,008 rows) — LEGACY
Original fitment table. String-based year ranges. Still used for non-HD makes.
Unique index: NULLS NOT DISTINCT ON (product_id, make, model, year_start, year_end)

---

### catalog_fitment_v2 (2,232,451 rows) — CANONICAL
New ID-based fitment table. One row per product × model_year.

```sql
catalog_fitment_v2 (
  id            SERIAL PRIMARY KEY,
  product_id    INT REFERENCES catalog_products(id) ON DELETE CASCADE,
  model_year_id INT REFERENCES harley_model_years(id) ON DELETE CASCADE,
  UNIQUE(product_id, model_year_id)
)
```

---

### catalog_fitment_readable (VIEW)
Backward-compatible view over catalog_fitment_v2.

```sql
SELECT product_id, family, model, model_code, year
FROM catalog_fitment_readable
WHERE product_id = $1;
```

---

### Harley Authority Tables

**harley_families** — 15 rows. Original 8 modern families + 6 engine-era families added April 23 (Knucklehead, Panhead, Shovelhead, V-Rod, Twin Cam, Evolution) + FXR.

**harley_models** — 158 rows, one per model_code. FK → harley_families. Includes engine-era canonical models (model_code = engine_key, e.g. `twin_cam`, `shovelhead`).

**harley_model_years** — 1,415 rows, one per model × year. FK → harley_models. Coverage spans 1936–2026.

#### Family list (April 23)
```
Modern families:    Touring, Softail Evo, Softail M8, Dyna, Sportster,
                    Trike, Revolution Max, Street, FXR
Engine-era families: Twin Cam (1999–2017), Evolution (1984–1999),
                     Shovelhead (1966–1984), Panhead (1948–1965),
                     Knucklehead (1936–1947), V-Rod (2002–2017)
```

---


### VTwin Manufacturing (vendor.vtwinmtc_products — 37,749 rows)
Classic and vintage Harley aftermarket parts catalog.

**Pipeline tables:**
- `vendor.vtwinmtc_products` — raw product data (37,749 rows)
- `vendor.vtwin_category_map` — page→category→family map (394 rows)
- `vendor.vtwin_category_pages` — expanded page→category rows (2,652 rows, includes last_yr fallback)
- `vendor.vtwin_category_to_catalog` — VTwin category → catalog_unified category (200 rows, includes sku_prefix)
- `vendor.vtwin_sku_staging` — generated internal SKUs (37,749 rows)

**SKU range:** 700001–71xxxx per prefix (well above WPS/PU range of ~100k–200k)

**Coverage:**
- 28,277 products resolved via this_yr page mapping (74.9%)
- 4,900 products resolved via last_yr_catpage fallback
- 9,472 products unmatched (page=0 or missing from map) → assigned ACC/General
- 26,062 in stock | 30,857 with images | 13,444 with OEM numbers

**Ingest scripts:** `scripts/ingest/generate_vtwin_skus.js`, `scripts/ingest/ingest_vtwin_unified.js`

**Re-ingest:**
```bash
node scripts/ingest/generate_vtwin_skus.js
node scripts/ingest/ingest_vtwin_unified.js
```

**Known SKU collision issue (resolved):** VTwin SKUs were initially generated in the same number range as WPS/PU (100k–150k), causing 13,568 WPS rows to be overwritten. Fixed April 23 by regenerating all VTwin SKUs starting at 700,001 per prefix. WPS rows restored from catalog_products.


### catalog_oem_crossref (~95,116 rows)
OEM cross-reference numbers. Columns: sku, oem_number, oem_manufacturer, page_reference, source_file

Sources: WPS vendor data, PU brand XML, wps_harley_oem_cross_reference.csv

---

### catalog_inventory (697,796 rows)
WPS warehouse inventory. Warehouses: boise, fresno, elizabethtown, ashley, midlothian, jessup, midway

---

### pricing_rules (4 rows)
```
IF map_price > 0 AND has_map_policy → sell at map_price
ELSE → LEAST(GREATEST(dealer/0.75, dealer/0.90), msrp)
WPS → pricing_rule_id=2 | PU → pricing_rule_id=3
```

---

## FITMENT API

### Dropdowns (DB-driven, canonical)
```
GET /api/fitment?type=families
GET /api/fitment?type=models&make=Harley-Davidson&family=Touring
GET /api/fitment?type=years&make=Harley-Davidson&model=FLHX
```

### Product filtering
Harley-Davidson → `catalog_fitment_v2` (exact model_year_id match)
All other makes → `catalog_fitment` (legacy range query)

---

## TYPESENSE SEARCH

**Collection:** `products`
**Host:** 5.161.100.126:8108 (direct) / 5.161.100.126.nip.io:443 (nginx HTTPS)
**API Key:** xyz
**Batch size:** 1,000 docs/batch

**Current schema fields:** sku, slug, mpn, name, brand, category, specs_blob, search_blob, computed_price, stock_quantity, in_stock, free_shipping, primary_image, images, fitment_make, fitment_model, fitment_year, sport_types, oem_numbers, vendors

⚠️ Schema is missing: drag_part, in_fatbook, in_harddrive, is_active, has_image, source_vendor, features — needs update.

**query_by:** name, brand, specs_blob, search_blob, oem_numbers

**Reindex:**
```bash
node scripts/ingest/index_assembly.js --recreate
```

---

## IMAGE PROXY

LeMans CDN serves ZIP archives. Pattern: `http://asset.lemansnet.com/z/<base64>`

**Proxy route:** `GET /api/img?u=<encoded_lemans_url>`
- Validates host is `asset.lemansnet.com` (SSRF protection)
- Downloads ZIP, extracts first image via `adm-zip`
- SHA-256-keyed disk cache (`IMG_CACHE_DIR`, default `/tmp/stinkin-img-cache`)

**IMPORTANT:** Typesense `primary_image` is already proxied. Do NOT run `proxyImageUrl()` on it again.

---

## CATALOG SCOPE

### Included
| Source | Catalog | Filter |
|--------|---------|--------|
| WPS | Hard Drive (HDTwin) | Brand name ILIKE |
| WPS | Tires & Wheels | Tire brand match |
| WPS | Tools & Chemicals | Category ILIKE |
| PU | Fatbook / Fatbook Mid-Year | fatbook_catalog field |
| PU | Oldbook / Oldbook Mid-Year | oldbook_catalog field |
| PU | Tire / Service | tire_catalog field |

### Excluded
Street, ATV, Offroad, Snow, Watercraft, Apparel, Helmets, Jackets, Footwear, Pants, Bicycle, FLY Racing, metric brands

---

## HARLEY SHOP CATEGORY MAPPING

`lib/harley/config.ts` maps UI slugs → DB categories:

| UI Label | DB Categories |
|----------|--------------|
| Controls & Handlebars | Handlebars, Hand Controls, Levers, Grips, Cable/Hydraulic Control Lines, Throttle, Switches |
| Engine | Engine |
| Seats | Seat |
| Exhaust | Exhaust |
| Wheels & Tires | Tire & Wheel, Tires, Wheels, Tubes, Tire/Wheel Accessories, Wheel Components |
| Electrical | Electrical, Batteries, Illumination, Starters |
| Suspension | Suspension, Steering |
| Brakes | Brakes |
| Frame & Body | Body, Mirrors, Mounts/Brackets, Hardware/Fasteners/Fittings, Guards/Braces, Clamps |
| Fuel Systems | Intake/Carb/Fuel System, Air Filters, Jets |
| Drivetrain | Clutch, Drive, Sprockets, Chains, Belts, Foot Controls |
| Gaskets/Seals | Gaskets/Seals |
| Luggage & Bags | Luggage, Accessories, Straps/Tie-Downs |
| Windshields | Windshield/Windscreen |
| Oils & Chemicals | Oils & Chemicals, Chemicals, Oil Filters |

---

## KNOWN ISSUES

### 🔴 Active
1. **Typesense schema mismatch** — `index_assembly.js` missing drag_part, in_fatbook, is_active, has_image, source_vendor, features
2. **Phase 9 not done** — no Admin UI for catalog_fitment_v2 management
3. **Phase 10 not done** — catalog_fitment still exists; cutover pending

### ⚠️ catalog_fitment Source Data Quality (17 permanently unresolved rows)
These rows in `catalog_fitment` have bad year data and will never resolve to `catalog_fitment_v2`. Do not attempt to fix — the source data is wrong.

| model | year_start | year_end | products | reason |
|-------|-----------|---------|----------|--------|
| Street | 1999 | 2013 | 2 | Street platform didn't exist until 2015 |
| Street | 2006 | 2007 | 2 | Same — pre-dates platform |
| Panhead | 1976 | 1984 | 2 | Panhead ended 1965 |
| Dyna | 1989 | 1991 | 1 | Dyna (FXD) started 1991 — off by ~2 years |
| Dyna | 1991 | 1992 | 2 | Dyna exists but no model_year rows for 1991–1992 |
| Twin Cam | 1970 | 1998 | 1 | Twin Cam started 1999 |
| FXR | 1999 | 1999 | 1 | FXR ended 1994 |
| Softail | 2086 | 2017 | 1 | Typo — year 2086 |
| Sportster | 2086 | 2017 | 1 | Typo — year 2086 |
| TLE - SIDECAR | 2002 | 2002 | 1 | Not in hierarchy |
| TLEU - SIDECAR ULTRA | 2002 | 2002 | 1 | Not in hierarchy |

Total: 17 products permanently unresolved. Acceptable — 99.9%+ coverage achieved.

### ⚠️ Low Priority
4. **9 PU products with NULL computed_price** — genuinely unpriceable
5. **Tire catalog images** — tire_master_image.xlsx not yet processed
6. **WPS FatBook PDF OEM extraction** — would expand oem_numbers coverage
7. **import_pu_brand_xml.js dead step** — remove cuOEM UPDATE block
8. **catalog_media index history** — idx_catalog_media_unique was a bloated 29GB btree on (product_id, url). Dropped and rebuilt April 23 as md5 hash index. If it reappears bloated, VACUUM FULL catalog_media.

---

## IMPORTANT OPERATIONAL NOTES

### Disk Space — Hetzner Server
Root disk `/dev/sda1` is 75GB. As of April 23: 14GB used / 59GB free (19%) after cleanup.

**April 23 incident:** Disk hit 100% during a large `catalog_fitment_v2` INSERT. Root cause was `catalog_media` having a catastrophically bloated 29GB btree unique index on `(product_id, url)` — 188k rows should not produce a 29GB index. Fixed by:
1. `DROP INDEX idx_catalog_media_unique`
2. `VACUUM FULL catalog_media` (reclaimed ~43GB)
3. Rebuilt as `CREATE UNIQUE INDEX idx_catalog_media_unique ON catalog_media (product_id, md5(url))`

**If disk fills again:** Check `catalog_media` index size first — it's the historical culprit. Also clear journal logs: `sudo journalctl --vacuum-size=200M`

| VTwin SKU range | Always generate from 700001+ to avoid WPS/PU collision (100k–200k range) |
| VTwin page mapping | 9,472 products have page=0 — no category resolvable, assigned ACC |
| VTwin date_added | Format YYYYMMDD text — validate is exactly 8 digits before parsing |
| VTwin stock | Only Yes/No flag, no warehouse breakdown — stock_quantity always 0 |
| VTwin re-ingest | Run generate_vtwin_skus.js first, then ingest_vtwin_unified.js |

### Before Any Bulk Delete/DDL
1. Stop Next.js dev server — holds AccessShareLocks
2. Use temp table pattern for large ID sets
3. Delete vendor_offers BEFORE catalog_products (non-cascade FK)

### Query Performance
- `NOT IN (large subquery)` → hangs, use `NOT EXISTS` or temp table
- CROSS JOIN fitment → use temp table for product_ids first

### Casing Rules
- vendor_code: always lowercase ('wps'/'pu')
- catalog_unified.source_vendor: UPPERCASE ('WPS'/'PU')

### HD Fitment Notes
- FXR ≠ Dyna: FXR rubber-mount 1982-1994, Dyna FXD 1991-2017
- M8: Touring 2017+, Softail 2018+, Sportster S 2021+
- model param in /api/fitment = model_code (e.g. FLHX), not model name

---

## KEY COMMANDS

```bash
# Reindex Typesense
node scripts/ingest/index_assembly.js --recreate

# Deploy
npx vercel --prod

# DB
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
ssh stinkdb

# Fitment API test
curl "http://localhost:3000/api/fitment?type=families"
curl "http://localhost:3000/api/fitment?type=models&make=Harley-Davidson&family=Touring"
curl "http://localhost:3000/api/fitment?type=years&make=Harley-Davidson&model=FLHX"
```

---

*Master Reference maintained by Claude — Last update: April 23, 2026 (VTwin ingestion complete)*
