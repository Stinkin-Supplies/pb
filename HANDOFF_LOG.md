# Stinkin' Supplies — Session Handoff
**Date:** April 19, 2026 (Updated Evening)
**Status:** ✅ Shop working, prices showing, correct products — PU data quality issues remain

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 33,751 correct products (Drag/Oldbook/Fatbook/HardDrive), no metric/snow/ATV
- **Search** — Typesense live, filters working, 91,531 docs indexed
- **Prices** — WPS pricing imported from `2026-04-17.json` (123K records), showing correctly
- **Images** — WPS images loading from CDN, LeMans zip extraction via `/api/img`
- **Product Detail** — prices, MAP, stock, cart, points all working
- **Sidebar filters** — categories, brands, price range, Shop by Type toggles
- **Production** — https://stinksupp.vercel.app live and working

---

## 🚨 CURRENT ISSUES

### Issue 1: PU Products Missing Prices
PU products show $0.00 — their pricing is in `pu_products_filtered` (`dealer_price`, `jobber_price`, `retail_price`) but not being used in `catalog_unified`.

**Fix:**
```sql
UPDATE catalog_unified cu
SET 
  msrp = p.retail_price::numeric,
  cost = p.dealer_price::numeric
FROM pu_products_filtered p
WHERE (cu.sku = p.sku OR cu.sku = p.sku_punctuated)
  AND cu.source_vendor = 'PU'
  AND p.retail_price IS NOT NULL
  AND p.retail_price != ''
  AND p.retail_price != '0';
```
Then reindex: `TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate`

**Verify price columns exist:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'pu_products_filtered' 
AND column_name IN ('dealer_price','jobber_price','retail_price','msrp');
```

### Issue 2: PU Products Missing Categories
42K PU products have NULL category — only WPS products have categories.
This means PU products don't show up in category filters.

**Fix options (pick one):**
1. Map `product_code` → category label:
   - E (Drag Specialties) → "Drag Specialties"
   - A (Street) → "Street/Motorcycle"  
   - C (Common) → "Common Parts"
2. Use brand → category mapping from brand XML enrichment
3. Use Claude API to auto-categorize from product names (best quality)

**Quick SQL fix:**
```sql
UPDATE catalog_unified SET category = 'Drag Specialties' 
WHERE source_vendor = 'PU' AND product_code = 'E' AND category IS NULL;

UPDATE catalog_unified SET category = 'Street/Motorcycle'
WHERE source_vendor = 'PU' AND product_code = 'A' AND category IS NULL;

UPDATE catalog_unified SET category = 'Common Parts'
WHERE source_vendor = 'PU' AND product_code = 'C' AND category IS NULL;
```

### Issue 3: PU Product Images Not Showing on PDP
Product detail page shows broken image icon for PU products.
The `image_url` in `catalog_unified` for PU products is a LeMans zip URL.
`proxyImageUrl()` in `lib/utils/image-proxy.ts` handles this correctly → routes to `/api/img?u=`.
But the PDP (`app/shop/[slug]/page.jsx`) may not be calling `proxyImageUrl()`.

**Check:** `app/shop/[slug]/page.jsx` → `normalizeProduct()` function → image handling.
Should use: `proxyImageUrl(row.image_url ?? row.image_urls?.[0]) ?? null`

### Issue 4: Brand Name Duplicates in Sidebar
Same brand appears twice with different casing (e.g. "COLONY" and "Colony", "S&S CYCLE" and "S&S Cycle").
This is because WPS uses UPPERCASE and PU uses Title Case.

**Fix in catalog_unified:**
```sql
UPDATE catalog_unified SET brand = UPPER(brand);
```
Then reindex.

### Issue 5: PDP Image Broken
Product detail page shows broken image for many products.
The PDP queries `catalog_unified` but image handling may not proxy correctly.
Check `app/shop/[slug]/page.jsx` `normalizeProduct()` function.

---

## 🏗️ INFRASTRUCTURE

### Servers
```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb  (user: deploy, password: smelly)
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker container "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443  HTTPS → Typesense  (5.161.100.126.nip.io, Let's Encrypt auto-renew)
```

### Vercel
```
Project:  epluris-projects/pb
URL:      https://stinksupp.vercel.app
Deploy:   npx vercel --prod
```

### Key Env Vars
```
TYPESENSE_HOST=5.161.100.126.nip.io
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=xyz
TYPESENSE_SEARCH_KEY=xyz
TYPESENSE_COLLECTION=products
CATALOG_DATABASE_URL=postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog
```

---

## 📊 DATABASE STATE

### Table Counts
```
catalog_products          96,522  — WPS original (do not modify)
pu_products_filtered      81,431  — PU filtered to A/E/C codes only
pu_brand_enrichment       90,539  — Brand XML enrichment (123 brands)
pu_fitment                30,615  — Fitment parsed from product names
catalog_unified          138,872  — THE SOURCE OF TRUTH
catalog_media             38,512  — WPS product images
```

### catalog_unified Flag Counts (current)
```sql
SELECT
  COUNT(*) FILTER (WHERE drag_part)    AS drag,      -- 24,009
  COUNT(*) FILTER (WHERE in_oldbook)   AS oldbook,   -- 12,784
  COUNT(*) FILTER (WHERE in_fatbook)   AS fatbook,   -- 20,402
  COUNT(*) FILTER (WHERE in_harddrive) AS harddrive  --  9,742
FROM catalog_unified;
-- Total shop SKUs (union): 33,751
```

### What Shows in the Shop
Filter: `is_active:true && (drag_part:true || in_oldbook:true || in_fatbook:true || in_harddrive:true)`
- WPS HardDrive catalog: 9,742 H-D specific parts
- PU Drag Specialties: 24,009 Drag parts
- PU Oldbook (H-D catalog): 12,784 H-D parts
- PU Fatbook (metric street): 20,402 street parts

### catalog_unified Key Columns
```
id, sku, slug, source_vendor (WPS/PU), product_code (A/E/C for PU)
name, brand, category (NULL for most PU products ← ISSUE)
msrp (WPS: from 2026-04-17.json, PU: needs fix), cost
image_url, image_urls[]
in_stock, stock_quantity
warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc
drag_part, in_oldbook, in_fatbook, in_harddrive
is_harley_fitment, fitment_hd_families[], fitment_year_start/end
features[], description, oem_part_number
sort_priority, slug, is_active, is_discontinued
```

---

## 📂 SCRIPTS

All in `~/Desktop/Stinkin-Supplies/scripts/ingest/`

| Script | Status | Purpose |
|--------|--------|---------|
| `index_unified.js` | ✅ | Indexes catalog_unified → Typesense (run after ANY data change) |
| `update_wps_pricing.js` | ✅ | Updates WPS msrp/cost from JSON pricing file |
| `update_wps_catalog_flags.js` | ✅ | Sets in_harddrive/in_street from wps-master-product.csv |
| `merge_vendors.js` | ⚠️ | Merges WPS+PU → catalog_unified (SKU join bug for flags, use SQL patch instead) |
| `import_pu_brand_catalogs_WORKING.js` | ✅ | Imports PU brand XML files |
| `import_pu_filtered.js` | ✅ | Imports PU price file (A/E/C codes only) |
| `parse_fitment.js` | ✅ | Parses fitment from product names |
| `download_pu_pricefile.js` | ✅ | Downloads fresh PU price file |
| `progress_bar.js` | ✅ | ProgressBar utility (clearLine wrapped in try/catch) |

### Data Files: `scripts/data/`
```
wps-master-product.csv     — WPS product catalog with catalog flags
2026-04-17.json            — WPS dealer pricing (123K records)
pu_pricefile/              — PU XML brand catalogs + price files
```

---

## 🌐 FRONTEND

### Key Files
| File | Status | Notes |
|------|--------|-------|
| `app/api/search/route.ts` | ✅ | Typesense search, normalizes docs, IS_GROUPS_COLLECTION=false |
| `app/api/img/route.ts` | ✅ | LeMans zip extraction, disk cache, adm-zip |
| `app/api/image-proxy/route.ts` | ✅ | WPS CDN redirect, fflate fallback |
| `lib/typesense/client.ts` | ✅ | Base filter includes all 4 catalog flags |
| `lib/utils/image-proxy.ts` | ✅ | proxyImageUrl() routes LeMans → /api/img, WPS → CDN |
| `app/shop/ShopClient.jsx` | ✅ | Shop by Type toggles (Harley/Drag/H-D Catalog) |
| `app/shop/page.jsx` | ✅ | SSR via /api/search |
| `app/shop/[slug]/page.jsx` | ⚠️ | Queries catalog_unified, image proxy may need fix |

### Image Architecture
```
LeMans (PU):  catalog_unified.image_url = "http://asset.lemansnet.com/z/..."
              → proxyImageUrl() → /api/img?u={url} → adm-zip extract → serve PNG

WPS:          catalog_unified.image_url = "https://cdn.wpsstatic.com/..."
              → proxyImageUrl() → /api/image-proxy?url={url} → 302 redirect to CDN
              OR directly from catalog_media table
```

### IS_GROUPS_COLLECTION Note
`lib/typesense/client.ts` has `export const IS_GROUPS_COLLECTION = false;` appended at bottom.
This is needed because `app/api/search/route.ts` imports it.
The file was originally written for a `product_groups` collection that was never used.
Do NOT remove this line.

---

## 📖 PU DATA REFERENCE

### Product Codes
| Code | Type | Count |
|------|------|-------|
| A | Street/Motorcycle | 38,400 |
| E | Drag Specialties | 39,255 |
| C | Common Parts | 7,821 |

### PU API Credentials
```
Dealer:   D00108
Username: website
Password: Smelly26
```

### pu_products_filtered Key Columns
```
sku, sku_punctuated, product_code, brand, name, description
dealer_price, jobber_price, retail_price  ← pricing source for PU
drag_part (bool), oldbook_year_page, fatbook_year_page
features[], fitment data
```

---

## 🔧 QUICK COMMANDS

```bash
# Check Typesense health
curl https://5.161.100.126.nip.io/health

# Restart Typesense if down
ssh stinkdb "sudo docker restart typesense && sleep 30 && curl http://localhost:8108/health"

# DB shell
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"

# Full reindex (run after ANY data changes to catalog_unified)
cd ~/Desktop/Stinkin-Supplies
TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Check shop counts
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
SELECT COUNT(*) FILTER (WHERE drag_part) AS drag,
       COUNT(*) FILTER (WHERE in_oldbook) AS oldbook,
       COUNT(*) FILTER (WHERE in_fatbook) AS fatbook,
       COUNT(*) FILTER (WHERE in_harddrive) AS harddrive
FROM catalog_unified;"

# Test search API
curl -s "https://stinksupp.vercel.app/api/search?q=softail&per_page=3" | python3 -m json.tool | grep -E '"found"|"name"'
```

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Fix PU prices** — SQL UPDATE from pu_products_filtered.retail_price → catalog_unified.msrp
2. **Fix PU categories** — SQL UPDATE based on product_code (E→Drag Specialties, A→Street, C→Common)
3. **Fix brand name casing** — UPPER(brand) across all unified products, then reindex
4. **Fix PDP images** — check normalizeProduct() in app/shop/[slug]/page.jsx
5. **WPS tire catalog** — add `tire_catalog` flag from wps-master-product.csv (noted for future)

---

## 💡 FUTURE FEATURES NOTED
- WPS Tire catalog flag (`tire_catalog` in wps-master-product.csv) — add as separate shop section
- Real domain instead of 5.161.100.126.nip.io for Typesense
- WPS enrichment (currently 0.7% complete — run enrich_wps_batch.js in background)
