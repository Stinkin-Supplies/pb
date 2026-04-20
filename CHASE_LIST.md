# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 20, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

1. **Verify PU images rendering on live site** — check DevTools Network tab on `/shop` for PU products. Look for `/api/img?u=` requests and confirm 200 responses.
2. **Deploy to Vercel** — enrichment data is in DB and Typesense but Vercel may not have been redeployed: `npx vercel --prod`
3. **Fix import_pu_brand_xml.js** — remove dead `cuOEM` UPDATE block (step 4) that tries to set `cu.oem_part_number` which doesn't exist. Low priority since it only errors on re-runs.
4. **Surface enriched data on PDP** — features[], dimensions (H/W/L/weight), page_reference, oem_numbers[] not yet displayed on product detail page.

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

## ✅ DONE APRIL 19

| Task | Result |
|------|--------|
| Rebuilt ShopClient filter sidebar | 4 sections: Fitment, Category, Brand, Price Range |
| Fixed $0.00 prices | computed_price field in Typesense |
| Fixed image double-proxy | primary_image field used directly |
| Deleted Apparel / Helmets / metric products | ~2,869 products gone |
| Reindexed Typesense | 91,531 indexed, 0 failed |
| Fixed Harley shop zero results | dbCategories mapping in config.ts |
| Fixed Harley shop pricing | computed_price instead of msrp |

---

## 🔴 HIGH PRIORITY

### PDP enrichment display
Features, dimensions, page_reference, oem_numbers[] are now in the DB but not shown on PDP.
`app/shop/[slug]/page.jsx` queries `catalog_unified` — all columns are available, just need UI.

### Image rendering on live site (unconfirmed)
API returns correct `/api/img?u=...` URLs. Browser-side rendering not verified.
If broken: check `next.config.js` for allowed image domains.

---

## 🔵 LOW PRIORITY / FUTURE

### WPS FatBook PDF OEM extraction
WPS side of catalog_oem_crossref still sparse — only 3,898 total products have OEM numbers.
Would significantly expand fitment/OEM search coverage.

### Tire catalog images
`tire_master_image.xlsx` not yet processed.

### catalog_fitment sparse for non-HD models
"All Models" catch-all used for some PU products — real model data may be in pu_fitment.hd_models[].
Could expand to per-model rows for better fitment filtering.

### import_pu_brand_xml.js performance
27 minutes per run (one query per row for pu_brand_enrichment upsert).
Could batch into multi-row upserts like the catalog_specs/catalog_media steps.
Use `--brand=EBC` flag to limit to one brand for testing.

### computed_price facetable in Typesense
Currently `facet: false` — price range hint doesn't populate.
Low priority — price filter inputs work without it.

### IMG_CACHE_DIR persistence
Set `IMG_CACHE_DIR=/var/cache/stinkin-images` in `.env.local` on Hetzner.

---

## 📊 CURRENT STATE (End of April 20)

| Metric | Value |
|--------|-------|
| catalog_unified | 51,141 rows (clean) |
| — WPS | 27,132 (9,742 HardDrive + 17,390 tires/tools) |
| — PU | 24,009 (fatbook/oldbook/both, all drag_part=true) |
| Typesense indexed | 51,141 (0 errors) |
| catalog_fitment | 26,008 rows |
| catalog_oem_crossref | ~97,422 rows |
| catalog_unified.oem_numbers[] | 3,898 products |
| PU products with features | 17,434 |
| PU products with dimensions | 12,102 |
| PU products with images | 23,827 new in catalog_media |
| PU catalog page refs | 24,009 (100%) |
| Search | ✅ Working |
| Prices | ✅ Fixed |
| Filter sidebar | ✅ Working |

---

## 📋 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table |
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

---

*Updated: April 20, 2026 — end of session*
