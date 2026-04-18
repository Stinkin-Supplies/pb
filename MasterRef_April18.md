# Stinkin' Supplies — Master Reference
**Last Updated:** April 18, 2026
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Images proxied ✅ | Filters rebuilt ✅ | Harley shop fixed ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_products | ~95,484 | ✅ Clean (post April 18 deletions) |
| — WPS products | 27,219 | ✅ 100% priced |
| — PU products | ~68,265 | ✅ 99.99% priced |
| catalog_unified | 94,400 rows | ⚠️ Stale — needs rebuild |
| Typesense indexed | 91,531 | ✅ Reindexed April 18 |
| Products with images | ~44,508 | ✅ via catalog_media |
| Products with proxied LeMans images | ~19,824 | ✅ via `/api/img` |
| Products with descriptions | 80,273 (82%) | ✅ Backfilled April 17 |
| Products with specs | 71,276 | ✅ Extracted April 17 |
| catalog_media | 58,544 rows | ✅ Canonical image table |
| catalog_oem_crossref | 93,548 rows | ✅ Expanded April 17 |
| catalog_fitment | 18,653 rows / 7,256 products | ⚠️ ~7.7% coverage |
| catalog_product_enrichment | 77,023 rows | ✅ Cleaned April 17 |

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
Master customer-facing product catalog. Source of truth for all product data.

**Key columns:**
- `id` (PK serial)
- `sku` (unique text) — vendor SKU
- `slug` (unique text) — URL identifier
- `name`, `description` — product content
- `brand`, `category`, `subcategory`
- `source_vendor` — 'wps' or 'pu' (lowercase)
- `msrp`, `cost`, `map_price`, `computed_price`
- `has_map_policy`, `drop_ship_eligible`
- `is_active`, `is_discontinued`
- `manufacturer_part_number`, `oem_part_number`, `upc`
- `pricing_rule_id` → pricing_rules FK
- `internal_sku` — 3-letter prefix + 6-digit sequential (e.g. ENG-100142)

**Cascade children (auto-delete on product delete):**
catalog_media, catalog_specs, catalog_fitment, catalog_prices,
catalog_reviews, catalog_variants, catalog_attributes

**Non-cascade dependents (must delete manually first):**
vendor_offers, map_audit_log, routing_decisions

Note: catalog_images was DROPPED April 17 — no longer a dependent.

---

### catalog_unified (94,400 rows — STALE, needs rebuild)
Denormalized customer-facing view. Rebuilt April 16.
⚠️ As of April 18: ~2,869 deleted products still present. Harley shop queries this table directly.

**Quick cleanup (run before rebuild):**
```sql
DELETE FROM catalog_unified
WHERE sku NOT IN (SELECT sku FROM catalog_products WHERE is_active = true);
```

Has 69 columns including all fitment, image_url, features array, stock quantities by warehouse.
WPS: 27,219 rows | PU: 67,181 rows (pre-deletion).

---

### catalog_allowlist (494K+ rows)
Controls what gets indexed into Typesense.

**Rebuild command:**
```bash
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs
```

---

### catalog_media (58,544 rows)
**CANONICAL image table.** `catalog_images` DROPPED April 17.

**Schema:** `(id, product_id→catalog_products CASCADE, url, media_type, priority)`
- Unique constraint on (product_id, url)
- 44,508 distinct products have at least one image
- Two URL types: direct HTTPS CDN links + LeMans ZIP URLs (proxied via `/api/img`)

---

### catalog_inventory (697,796 rows)
WPS warehouse inventory. All records supplier='WPS'.
**Warehouses:** boise, fresno, elizabethtown, ashley, midlothian, jessup, midway

---

### catalog_pricing (123,034 rows)
Dealer pricing. WPS=27,219 rows (100%). PU=62,065 rows (~87%).

---

### catalog_fitment (18,653 rows | 7,256 products)
Structured fitment data. ~7.7% of products covered.
Columns: product_id, make, model, year_start, year_end, notes

**Unique index:** `NULLS NOT DISTINCT ON (product_id, make, model, year_start, year_end)`

**Model families:**
| Family | Products |
|--------|---------|
| Touring | 4,201 |
| Softail | 1,462 |
| Dyna (FXD) | 1,081 |
| Sportster | 942 |
| FXR | 388 |

Note: FXR ≠ Dyna. FXR = rubber-mount 1982-1994. Dyna = FXD 1991-2017.

**Extraction script:** `scripts/ingest/extract_fitment.js` — safe to re-run (idempotent)

---

### catalog_oem_crossref (93,548 rows)
OEM cross-reference numbers. Columns: sku, oem_number, oem_manufacturer, page_reference, source_file

---

### catalog_product_enrichment (77,023 rows)
Brand/supplier metadata, features, dimensions. Links by SKU (not product_id).

---

### pricing_rules (4 rows)
Business rules for markup/margin.

**Pricing formula:**
```
IF map_price > 0 AND has_map_policy → sell at map_price
ELSE → LEAST(GREATEST(dealer/0.75, dealer/0.90), msrp)
WPS → pricing_rule_id=2 | PU → pricing_rule_id=3
```

---

## CATALOG SCOPE — WHAT WE SELL

### Included
| Source | Catalog | Filter Method |
|--------|---------|---------------|
| WPS | Hard Drive (HDTwin) | Brand name ILIKE match |
| WPS | Tires & Wheels | Tire brand name match |
| WPS | Tools & Chemicals | Category name ILIKE match |
| PU | Fatbook | fatbook_catalog field in D00108 |
| PU | Fatbook Mid-Year | fatbook_midyear field |
| PU | Oldbook | oldbook_catalog field |
| PU | Oldbook Mid-Year | oldbook_midyear field |
| PU | Tire / Service | tire_catalog field |

### Excluded (cleaned out April 16 + April 18)
Street, ATV, Offroad, Snow, Watercraft, Apparel, Helmets, Jackets, Footwear, Pants,
Tracks (snowmobile), Bicycle, FLY Racing, metric brands

---

## TYPESENSE SEARCH

**Collection:** `products` (active — set via `TYPESENSE_COLLECTION` env var)
**Host:** 5.161.100.126:8108 (direct HTTP) — also accessible via nip.io HTTPS
**nginx limit:** 20MB per request
**Batch size:** 1,000 docs/batch

**Key Typesense field names (confirmed via API):**
| Field | Type | Notes |
|-------|------|-------|
| `primary_image` | string | Already proxied — do NOT re-proxy |
| `images` | string[] | Array of proxied image URLs |
| `computed_price` | float | `facet: false` — cannot facet, can filter/sort |
| `stock_quantity` | int64 | Used for sort |
| `in_stock` | bool | Facetable |
| `brand` | string | Facetable |
| `category` | string | Facetable |

**query_by:** name, brand, sku, mpn, specs_blob, search_blob, oem_numbers

**Reindex command:**
```bash
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```

---

## IMAGE PROXY

LeMans CDN serves ZIP archives. Pattern: `http://asset.lemansnet.com/z/<base64>`

**Proxy route:** `GET /api/img?u=<encoded_lemans_url>`
- Validates host is `asset.lemansnet.com` (SSRF protection)
- Downloads ZIP, extracts first image entry via `adm-zip`
- SHA-256-keyed disk cache (`IMG_CACHE_DIR` env var, default `/tmp/stinkin-img-cache`)
- Returns `Cache-Control: public, max-age=31536000, immutable`

**IMPORTANT:** Typesense `primary_image` field already contains proxied URLs.
Do NOT run `proxyImageUrl()` on `primary_image` — it will double-proxy.
`proxyImageUrl()` should only be called on raw `asset.lemansnet.com` URLs.

**`proxyImageUrl()` in `lib/utils/image-proxy.ts`** — handles URL transform.

**Deployment:** Set `IMG_CACHE_DIR=/var/cache/stinkin-images` in `.env.local` on Hetzner.

---

## HARLEY SHOP CATEGORY MAPPING

As of April 18, `lib/harley/config.ts` maps each UI category slug to real DB category values:

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
1. **catalog_unified stale** — ~2,869 deleted products still present; needs rebuild or cleanup
2. **Image rendering unconfirmed on live site** — API returns correct URLs but browser rendering not verified
3. **9 PU products with NULL computed_price** — genuinely unpriceable

### ⚠️ Low Priority
4. **catalog_fitment sparse** — 7.7% coverage
5. **Tire catalog images** — tire_master_image.xlsx not yet processed
6. **WPS FatBook PDF OEM extraction** — WPS side incomplete
7. **computed_price not facetable** — price range hint (min/max display) doesn't populate; inputs still work

---

## IMPORTANT OPERATIONAL NOTES

### Before Any Bulk Delete/DDL
1. Stop Next.js dev server — holds AccessShareLocks
2. Use temp table pattern for large ID sets
3. Delete vendor_offers BEFORE catalog_products (non-cascade FK)

### Query Performance
- `NOT IN (large subquery)` — hangs, use `NOT EXISTS` or temp table

### Casing Rules
- vendor_code: always lowercase ('wps'/'pu')
- catalog_unified.source_vendor: UPPERCASE ('WPS'/'PU')

### HD Fitment Notes
- FXR ≠ Dyna: FXR rubber-mount 1982-1994, Dyna FXD 1991-2017
- M8 (Milwaukee-Eight): Touring 2017+, Softail 2018+, Sportster S 2021+
- XL alone = ambiguous (matches clothing); use XLH/XLS/XL+digits for Sportster

---

## KEY COMMANDS

```bash
# Reindex Typesense
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"

# Fitment extraction (safe to re-run)
npx dotenv -e .env.local -- node scripts/ingest/extract_fitment.js

# Rebuild allowlist
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs

# DB
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
ssh stinkdb

# Quick catalog_unified cleanup (pending full rebuild)
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c \
  "DELETE FROM catalog_unified WHERE sku NOT IN (SELECT sku FROM catalog_products WHERE is_active = true);"
```

---

*Master Reference maintained by Claude — Last update: April 18, 2026*
