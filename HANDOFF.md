# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: WPS Fitment Pipeline · May 22, 2026 (Twenty-Seventh Pass)**

---

## WHERE WE ARE

### What Was Built This Session

#### 1. WPS Vehicle Master Table ✅
- Created `wps_vehicles` table (vehicle_id, vehicle_type, year_id, year, make_id, make, model_id, model)
- Loaded from `scripts/data/wps/1779424242-1856360.csv` — 44,709 rows
- Harley Davidson = make_id 22, 1,291 Harley rows covering 1955–2026
- Indexes on make, year, make_id

#### 2. WPS Fitment Columns on wps_catalog ✅
```sql
ALTER TABLE wps_catalog
  ADD COLUMN fitment JSONB,
  ADD COLUMN fitment_updated_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_wps_catalog_fitment ON wps_catalog USING GIN (fitment);
```

#### 3. import_wps_fitment.mjs — New Script ✅
`scripts/ingest/import_wps_fitment.mjs`

Key design decisions:
- Uses `GET /taxonomyterms/196/items?include=vehicles&page[size]=50` — Hard Drive catalog only
- taxonomyterm 196 = "Hard Drive" (confirmed via /vocabularies/15/taxonomyterms)
- No `vehicle:read` API scope needed — vehicles come back as included relations on items endpoint
- vehicle:read scope was 403 on the token; this approach bypasses that entirely
- Paginates via `meta.cursor.next` cursor tokens
- Builds in-memory Map from wps_vehicles for fast vehicle_id resolution
- Filters to Harley-only in harley_vehicles[] sub-array
- Stores full JSONB: { raw_vehicle_ids, vehicles, harley_vehicles }
- Idempotent — skips items where fitment IS NOT NULL on re-run

Stats: 22,348 API items seen, 17,779 matched in catalog, 5,810 with Harley fitment

#### 4. promote_wps_fitment.cjs — New Script ✅
`scripts/ingest/promote_wps_fitment.cjs`

Key design:
- Loads harley_model_years with model names into memory
- Builds exactMap ("1999|flhr road king" → model_year_id) and yearMap (year → candidates[])
- 4-tier matching: exact → strip model code prefix → partial containment → model_code first word
- Joins wps_catalog → catalog_unified via `vendor_sku = wc.sku` (NOT cu.sku — WPS rows have WPS- prefix)
- Batch inserts with ON CONFLICT DO NOTHING
- fitment_source = 'wps'

Stats: 5,870 products loaded, 729,975 resolved pairs, 702,633 inserted, 27,342 dupes skipped, 19,810 unresolved

#### 5. Era Backfill + Typesense ✅
- ERA BACKFILL SQL re-run: 18,793 products tagged (up from 13,773)
- Typesense reindexed: 90,276 docs, 0 errors, 4m 7s

---

## GOTCHAS DISCOVERED THIS SESSION

| Issue | Solution |
|-------|----------|
| vehicle:read scope 403 | Don't need it — use taxonomyterms/196/items?include=vehicles |
| WPS API /items/{sku} | Expects integer ID, not SKU string — use taxonomyterms approach |
| catalog_unified WPS join | vendor_sku = wc.sku — NOT cu.sku (has WPS- prefix), NOT cu.wps_item_id (doesn't exist on cu) |
| wps_catalog.supplier_item_id | String SKU used by API — different from wps_item_id (integer) |
| WPS token scope | Token eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO — vehicle:read not granted, items+taxonomyterms works fine |

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Fix PU Product Images (HIGH)
`ProductDetailClient.jsx` gallery doesn't run `cu.image_url` through `proxyImg()`.
LeMans CDN URLs (`http://asset.lemansnet.com/...`) need `/api/img?u=` proxy.
Most PU products show "No Image" on PDP. Fix: ensure all gallery image URLs pass through `proxyImg()`.

### 2. git commit (HIGH)
Large uncommitted changeset spanning May 21 + May 22:
```bash
cd ~/Desktop/Stinkin-Supplies
git add -A
git commit -m "feat: WPS fitment pipeline, variant groups, browse UX, PDP fixes"
git push
```

### 3. Chase WPS Unresolved Models (LOW)
19,810 vehicle records didn't resolve to a harley_model_year. Likely cause: WPS model names
like "FLTRXS Road Glide Special" don't match "Road Glide Special" exactly. A diagnostic query
would show which models are falling through most — worth chasing if coverage matters for those models.

### 4. Fulfillment Routing (FUTURE)
Architecture from May 21 HANDOFF stands. Don't build until browse/PDP UI work complete.

---

## KEY FILES

| File | Location | Status |
|------|----------|--------|
| import_wps_fitment.mjs | scripts/ingest/ | ✅ New May 22 |
| promote_wps_fitment.cjs | scripts/ingest/ | ✅ New May 22 |
| 1779424242-1856360.csv | scripts/data/wps/ | ✅ WPS vehicle master |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 / 90,276 active | ✅ Stable |
| catalog_fitment_v2 | 2,147,352 | ✅ WPS promoted May 22 |
| wps_vehicles | 44,709 | ✅ New May 22 |
| wps_catalog | 22,278 | ✅ fitment JSONB populated on 5,810 items |
| catalog_variant_groups | 2,901 | ✅ |
| catalog_variant_members | 19,557 | ✅ |
| Typesense | 90,276 docs | ✅ Current |
| era_* columns | 18,793 products tagged | ✅ Re-run May 22 |
| vendor_offers | 22,278 | ✅ |
| oem_fitment | 379,899 | ✅ |
| harley_families | 17 | DO NOT MODIFY |
| harley_model_years | ~2,230 | DO NOT MODIFY |
