# Stinkin' Supplies — Master Reference
**Last Updated:** April 21, 2026
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Images backfilled ✅ | Fitment authority live ✅ | OEM expanded ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified | 51,141 rows | ✅ Clean |
| — WPS products | 27,132 | ✅ 100% priced |
| — PU products | 24,009 | ✅ 99.99% priced |
| Typesense indexed | 50,763 | ✅ Reindexed April 21 |
| Products with images | 18,415 PU + WPS via catalog_media | ✅ |
| catalog_oem_crossref | ~95,116 rows | ✅ |
| catalog_unified.oem_numbers[] | 5,411 products | ✅ |
| catalog_fitment (legacy) | 26,008 rows | ✅ |
| catalog_fitment_v2 | 2,232,451 rows / 8,593 products | ✅ Live |
| harley_families | 8 | ✅ |
| harley_models | 149 model codes | ✅ |
| harley_model_years | 1,248 rows | ✅ |
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

### catalog_unified (51,141 rows)
Denormalized customer-facing table. Regular table — TRUNCATE + INSERT to rebuild.

WPS: 27,132 | PU: 24,009. 73 columns including fitment flags, image_url, features[], oem_numbers[], warehouse stock.

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

**harley_families** — 8 rows (Touring, Softail Evo, Softail M8, Dyna, Sportster, Trike, Revolution Max, Street)

**harley_models** — 149 rows, one per model_code. FK → harley_families.

**harley_model_years** — 1,248 rows, one per model × year. FK → harley_models.

---

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
node scripts/ingest/index_unified.js --recreate
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
1. **Typesense reindex** — refresh the live collection with `index_unified.js`
2. **Phase 9 not done** — no Admin UI for catalog_fitment_v2 management
3. **Phase 10 not done** — catalog_fitment still exists; cutover pending

### ⚠️ Low Priority
4. **9 PU products with NULL computed_price** — genuinely unpriceable
5. **Tire catalog images** — tire_master_image.xlsx not yet processed
6. **WPS FatBook PDF OEM extraction** — would expand oem_numbers coverage
7. **FXR / V-Rod not in canonical tables** — skipped in migration
8. **import_pu_brand_xml.js dead step** — remove cuOEM UPDATE block

---

## IMPORTANT OPERATIONAL NOTES

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
node scripts/ingest/index_unified.js --recreate

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

*Master Reference maintained by Claude — Last update: April 21, 2026*
