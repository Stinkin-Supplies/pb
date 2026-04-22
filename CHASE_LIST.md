# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 21, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

1. **Phase 9 — Admin UI** — build fitment management UI at `/admin/fitment`: Family → Model → Year selector, add/remove product fitment via `catalog_fitment_v2`
2. **Phase 10 — Cutover** — stop writing to `catalog_fitment`, archive it, all new writes go to `catalog_fitment_v2`
3. **Fix Typesense schema** — `index_assembly.js` schema is the old one (missing `drag_part`, `in_fatbook`, `is_active`, `has_image`). Needs update to match what `DEFAULT_SEARCH_PARAMS` and `buildFilters` expect.
4. **Shop images** — PU images now backfilled into `catalog_unified.image_url` and reindexed. Verify rendering on live site via DevTools Network tab.
5. **Fix import_pu_brand_xml.js** — remove dead `cuOEM` UPDATE block (step 4).

---

## ✅ DONE APRIL 21

| Task | Result |
|------|--------|
| Deployed enriched PU data to Vercel | stinksupp.vercel.app live |
| Backfilled catalog_unified.image_url from catalog_media | 14,907 PU rows updated, 18,415 now have images |
| Reindexed Typesense | 50,763 docs, 0 errors |
| Fixed buildFilters — removed is_active/has_image (not in schema) | Shop returning products |
| Fixed DEFAULT_SEARCH_PARAMS — removed description from query_by | Search working |
| Phase 1+2 — Created harley_families, harley_models, harley_model_years | 8 families, 149 models, 1,248 year rows |
| Phase 3 — Created catalog_fitment_v2 | Table + indexes live |
| Phase 4 — Migrated existing fitment to v2 | 319,389 rows, 3,292 products |
| Backfilled null-year fitment rows (Touring/Softail/Dyna/Sportster/M8/Trike) | +1,912,862 rows |
| Phase 5 — Created catalog_fitment_readable view | Live, verified |
| Phase 6 — DB-driven fitment dropdowns (/api/fitment) | families/models/years all canonical |
| Phase 7 — Updated product filtering to use catalog_fitment_v2 | No more range logic for HD |
| Loaded WPS Harley OEM cross-reference CSV | 1,568 rows, 5,411 products now have OEM# |
| Updated is_harley_fitment flag on catalog_unified | 7,244 products flagged |
| Reindexed Typesense | 50,763 docs, 0 errors |
| Deployed to Vercel | Live |

---

## ✅ DONE APRIL 20

| Task | Result |
|------|--------|
| Deleted 40,390 orphan PU products from catalog_unified | All-false-flag products gone |
| Wrote + ran import_pu_brand_xml.js | 38,522 products enriched from 134 XML files |
| PU features backfilled | 17,434 products |
| PU dimensions (H/W/L) backfilled | 12,102 products |
| PU weight backfilled | 24,007 products |
| PU images inserted into catalog_media | 23,827 new URLs |
| PU UPC backfilled | 4,389 products |
| PU country_of_origin backfilled | 12,102 products |
| Wrote + ran backfill_pu_fitment_structured.js | 8,536 new fitment rows, 26,008 total |
| Wrote + ran backfill_pu_catalog_refs.js | 24,009 products with page_reference |
| PU OEM numbers → catalog_oem_crossref | 3,874 rows inserted |
| oem_numbers[] aggregated into catalog_unified | 3,898 products |
| Reindexed Typesense | 51,141 docs, 0 errors |

---

## 🔴 HIGH PRIORITY

### Typesense schema mismatch
`index_assembly.js` schema is old — missing `drag_part`, `in_fatbook`, `in_harddrive`, `is_active`, `has_image`, `source_vendor`, `features`.
`buildFilters` and `DEFAULT_SEARCH_PARAMS` reference fields that don't exist in the indexed schema.
Workaround in place (removed `is_active` from base filters) but proper fix is updating the indexer schema.

### Admin UI — Phase 9
Need `/admin/fitment` page: select Family → Model → Year, assign/remove fitment for a product via `catalog_fitment_v2`. Never expose raw IDs.

---

## 🔵 LOW PRIORITY / FUTURE

### Phase 10 — Cutover
Stop writing to `catalog_fitment`. Archive it. All new writes → `catalog_fitment_v2` only.

### Add FXR, V-Rod, Big Twin to canonical tables
Currently skipped in migration. FXR (1982-1994), V-Rod (2002-2017) could be added as families.

### WPS FatBook PDF OEM extraction
WPS side of catalog_oem_crossref still sparse. Would significantly expand OEM search.

### Tire catalog images
`tire_master_image.xlsx` not yet processed.

### import_pu_brand_xml.js performance
27 minutes per run. Could batch into multi-row upserts. Use `--brand=EBC` to limit scope.

### IMG_CACHE_DIR persistence
Set `IMG_CACHE_DIR=/var/cache/stinkin-images` in `.env.local` on Hetzner.

---

## 📊 CURRENT STATE (End of April 21)

| Metric | Value |
|--------|-------|
| catalog_unified | 51,141 rows (clean) |
| — WPS | 27,132 (9,742 HardDrive + 17,390 tires/tools) |
| — PU | 24,009 (fatbook/oldbook/both, all drag_part=true) |
| Typesense indexed | 50,763 (0 errors) |
| catalog_fitment (legacy) | 26,008 rows |
| catalog_fitment_v2 | 2,232,451 rows / 8,593 products |
| harley_families | 8 |
| harley_models | 149 model codes |
| harley_model_years | 1,248 rows |
| catalog_oem_crossref | ~95,116 rows |
| catalog_unified.oem_numbers[] | 5,411 products |
| is_harley_fitment = true | 7,244 products |
| PU products with images | 18,415 (catalog_unified.image_url) |
| Search | ✅ Working |
| Prices | ✅ Fixed |
| Filter sidebar | ✅ Working |
| Fitment dropdowns | ✅ Canonical (DB-driven) |

---

## 📋 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table |
| CROSS JOIN on large product sets | Use temp table for product_ids first, then join |
| REPLACE() join on large tables | Always hangs — use temp table + direct SKU join |
| `DISABLE TRIGGER ALL` denied | catalog_app not superuser |
| Next.js holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps'/'pu' |
| catalog_unified source_vendor | UPPERCASE 'WPS'/'PU' |
| pu_products.map_price | VARCHAR 'Y'/'N' flag — not a price |
| PU SKU format | Punctuated in catalog (1401-1193), plain in pu_pricing (14011193) |
| Typesense on hotspot | Fails — needs stable WiFi |
| catalog_unified not a view | Regular table — TRUNCATE + INSERT to rebuild |
| catalog_fitment unique index | NULLS NOT DISTINCT — safe to re-run extract_fitment.js |
| FXR ≠ Dyna | FXR = rubber-mount 1982-1994, Dyna = FXD 1991-2017 |
| Typesense primary_image field | Already proxied — do NOT run proxyImageUrl() on it again |
| vendor_offers non-cascade | Must DELETE vendor_offers before DELETE catalog_products |
| catalog_unified.oem_numbers[] | GIN indexed — query: WHERE oem_numbers @> ARRAY['4185408'] |
| import_pu_brand_xml.js | 27min full run — use --brand=BRANDNAME to limit scope |
| PU XML has no ProductAttribute | No structured specs (Type/Material) in PU data exports |
| GENERATE_SERIES with params | Must cast: GENERATE_SERIES($1::int, $2::int) |
| index_assembly.js env | Use hardcoded connection string — dotenv unreliable from scripts/ingest/ |
| Vercel deploy size limit | 100MB — keep dump files off project root (move to ~/Desktop) |

---

*Updated: April 21, 2026 — end of session*
