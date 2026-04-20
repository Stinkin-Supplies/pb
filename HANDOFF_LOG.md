# Stinkin' Supplies — Session Handoff
**Date:** April 20, 2026
**Status:** ✅ PU catalog enriched | ✅ Orphans deleted | ✅ Fitment expanded | ✅ Reindexed 51,141 docs

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 51,141 products (27,132 WPS + 24,009 PU), all flagged and legitimate
- **Search** — Typesense live, 51,141 docs, 0 errors
- **PU enrichment** — features, dimensions, images, OEM numbers, catalog page refs all backfilled
- **Fitment** — catalog_fitment expanded to 26,008 rows across all HD model families
- **OEM numbers** — catalog_unified.oem_numbers[] populated, GIN indexed, searchable in Typesense
- **Catalog page refs** — all 24,009 PU products have fatbook/oldbook page_reference strings
- **Production** — https://stinksupp.vercel.app

---

## 🚨 CURRENT ISSUES

### Issue 1: import_pu_brand_xml.js has dead OEM backfill step
Step 4 of the script tries to UPDATE `cu.oem_part_number` which doesn't exist on catalog_unified.
OEM is correctly handled via `catalog_oem_crossref` → `oem_numbers[]` instead.
**Fix:** Remove the `cuOEM` query block from `import_pu_brand_xml.js` step 4, or just ignore
the error — it doesn't affect any data since OEM was populated separately.

### Issue 2: Image rendering on live site still unconfirmed
API returns correct `/api/img?u=...` URLs but browser-side rendering not verified.
Check DevTools Network tab on `/shop` for PU products.

### Issue 3: catalog_unified.oem_numbers only covers 3,898 products
Only products with entries in catalog_oem_crossref get OEM numbers.
WPS FatBook PDF OEM extraction still pending (low priority).

### Issue 4: 9 PU products with NULL computed_price
Genuinely unpriceable — no pricing data anywhere. Low priority.

---

## 🏗️ INFRASTRUCTURE

### Servers
```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.126.nip.io)
```

### Vercel
```
Project:  epluris-projects/pb
URL:      https://stinksupp.vercel.app
Deploy:   npx vercel --prod
```

---

## 📊 DATABASE STATE (End of April 20)

### catalog_unified
```
Total:       51,141 rows
WPS:         27,132 (9,742 HardDrive + 17,390 tires/tools)
PU:          24,009 (11,225 fatbook | 3,607 oldbook | 9,177 both)
```

### PU Enrichment Coverage
```
features backfilled:       17,434 products
dimensions (H/W/L):        12,102 products
weight:                    24,007 products
images in catalog_media:   23,827 new URLs inserted
UPC:                        4,389 products
country_of_origin:         12,102 products
catalog page references:   24,009 products (all PU)
oem_numbers[]:              3,898 products (crossref populated)
```

### catalog_fitment
```
Total rows:    26,008
New this session: 8,536 (from pu_fitment → catalog_fitment)

By model:
  Touring      8,146
  Softail      3,993
  All Models   3,633
  Dyna         2,633
  Sportster    2,573
  Big Twin     1,033
  FXR            522
  M8             446
  Trike          395
  Twin Cam       285
  Evolution      237
  V-Rod          213
  + others
```

### catalog_oem_crossref
```
Total rows: ~97,422 (93,548 WPS + 3,874 PU inserted this session)
```

---

## 📂 NEW SCRIPTS (April 20)

All in `scripts/ingest/`:

| Script | Purpose |
|--------|---------|
| `import_pu_brand_xml.js` | Parse all XML files in scripts/data/pu_pricefile/ → pu_brand_enrichment + catalog_media + catalog_unified backfill. Handles PIES and Catalog Content formats. |
| `backfill_pu_dimensions.js` | Copy merch dims + weight from pu_brand_enrichment → catalog_unified. Also backfills UPC + country_of_origin from pu_products_filtered. |
| `backfill_pu_fitment_structured.js` | Promote pu_fitment rows → catalog_fitment (one row per family/year span). |
| `backfill_pu_catalog_refs.js` | Build fatbook/oldbook page_reference strings in catalog_unified. |
| `run_pu_enrichment.js` | Master runner for all 4 scripts in order. |

### Re-run enrichment (e.g. after new XML files downloaded):
```bash
npx dotenv -e .env.local -- node scripts/ingest/run_pu_enrichment.js
# Then reindex:
TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate
```

### Re-run OEM aggregation (after new brand XML or crossref data):
```bash
# Insert PU OEM numbers into crossref
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
CREATE TEMP TABLE pu_oem_staging AS
SELECT cu.sku, pbe.oem_part_number, pbe.brand
FROM pu_brand_enrichment pbe
JOIN catalog_unified cu ON cu.sku = pbe.sku
WHERE pbe.oem_part_number IS NOT NULL AND pbe.oem_part_number != ''
  AND cu.source_vendor = 'PU';
INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
SELECT sku, oem_part_number, brand, 'pu_brand_enrichment'
FROM pu_oem_staging
ON CONFLICT (sku, oem_number, oem_manufacturer) DO NOTHING;
"

# Re-aggregate into catalog_unified.oem_numbers[]
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
UPDATE catalog_unified cu
SET oem_numbers = sub.nums
FROM (
  SELECT sku, array_agg(DISTINCT oem_number) AS nums
  FROM catalog_oem_crossref GROUP BY sku
) sub
WHERE cu.sku = sub.sku;
"
```

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Verify PU product images rendering on live site** — check DevTools on /shop for PU products
2. **Fix import_pu_brand_xml.js** — remove dead `cuOEM` UPDATE block (cu.oem_part_number doesn't exist)
3. **Deploy to Vercel** — `npx vercel --prod` to push enriched data to production
4. **PDP display** — surface features[], dimensions, page_reference, oem_numbers[] on product detail page
5. **WPS FatBook PDF OEM extraction** — low priority, expands oem_numbers coverage

---

## 💡 OPERATIONAL GOTCHAS (April 20 additions)

| Issue | Solution |
|-------|----------|
| REPLACE() join on large tables | Always hangs — use temp table + direct SKU join instead |
| import_pu_brand_xml.js is slow | 27min for 38K rows — use --brand=EBC to filter to one brand |
| catalog_unified has no oem_part_number column | Use oem_numbers[] (array) instead — populated from catalog_oem_crossref |
| PU XML files have no ProductAttribute blocks | No structured specs (Type/Material/etc) available from PU data exports |
| catalog_unified.oem_numbers[] | GIN indexed — query with @> operator: WHERE oem_numbers @> ARRAY['4185408'] |
