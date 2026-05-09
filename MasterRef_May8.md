# Stinkin' Supplies — Master Reference
**Last Updated:** May 8, 2026 (Thirteenth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search pending reindex | Nav redesigned ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified | 84,626 rows | ✅ Clean rebuild May 8 |
| — WPS (HardDrive only) | 9,742 | ✅ harddrive_catalog=true |
| — PU (Drag Part=Y only) | 37,135 | ✅ Drag-only filter |
| — VTwin | 37,749 | ✅ Ingested |
| catalog_fitment_v2 | 215,588 rows | ✅ JW Boon rebuilt |
| oem_fitment | 379,899 rows | ✅ All families rebuilt |
| product_fitment_year_model | 0 rows | ⚠️ Needs repopulation |
| vendor_offers | 0 rows | ⚠️ Needs populate_wps_vendor_offers.js |
| pu_products_filtered | 37,150 rows | ✅ Fresh |
| pu_brand_enrichment | 93,625 rows | ✅ Fresh |
| vtwin_oem_crossref | 12,278 rows | ✅ Built May 8 |
| catalog_oem_crossref | 1,587 rows | ✅ |
| hd_year_model_master | 1,618 rows | ✅ |
| model_alias_map | 347 rows | ✅ |
| Typesense | Stale | ⚠️ Needs --recreate reindex |

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (IPv4 — ALWAYS use this)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
psql:       psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
Vercel env: CATALOG_DATABASE_URL
```

⚠️ NEVER use IPv6 2a01:4ff:f0:fa6f::1 in code — Vercel does not support IPv6.
⚠️ catalog_app is NOT superuser — use \copy not COPY TO file.

---

## CATALOG PIPELINE — CANONICAL ORDER

```
Step 1: node scripts/ingest/import_pu_filtered.js
        → pu_products_filtered (37,150 rows, Drag Part=Y only)
        Data: scripts/data/pu_pricefile/oldbook-fatbook/BasePriceFile.csv

Step 2: node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
        → catalog_products (122K rows; merge uses harddrive_catalog=true = 9,742)

Step 3: node scripts/ingest/import_pu_brand_catalogs_WORKING.js
        → pu_brand_enrichment (93,625 rows from brand XMLs)
        Data: scripts/data/pu_pricefile/*.xml

Step 4: node scripts/ingest/merge_vendors.js
        → catalog_unified (WPS harddrive + PU drag = ~46,877)
        ⚠️ Drops/rebuilds catalog_unified — see rebuild procedure below

Step 5: node scripts/ingest/ingest_vtwin_unified.js
        → catalog_unified += VTWIN (37,749) → total ~84,626

Step 6: node scripts/ingest/import_jwboon_fitment_v2.mjs
        → catalog_fitment_v2 (~215,588 rows)
        Data: scripts/data/jwboon_parts_final.xlsx

Step 7: (run all OEM fitment scripts)
        node scripts/ingest/build_oem_fitment.mjs
        node scripts/ingest/build_oem_fitment_softail.mjs
        node scripts/ingest/build_oem_fitment_dyna.mjs
        node scripts/ingest/build_oem_fitment_touring.mjs
        node scripts/ingest/build_oem_fitment_fx.mjs
        → oem_fitment (~379,899 rows total)

Step 8: node scripts/ingest/populate_wps_vendor_offers.js
        → vendor_offers

Step 9: (repopulate product_fitment_year_model from catalog_fitment_v2 + oem_fitment)

Step 10: node scripts/ingest/index_unified.js --recreate
         → Typesense reindex
```

---

## CATALOG_UNIFIED REBUILD PROCEDURE

When rebuilding catalog_unified (merge_vendors.js drops and recreates it):

```sql
-- BEFORE running merge_vendors.js:
DROP VIEW IF EXISTS v_catalog_fitment;
ALTER TABLE IF EXISTS catalog_fitment_v2 DROP CONSTRAINT IF EXISTS catalog_fitment_v2_product_id_fkey;
ALTER TABLE IF EXISTS product_fitment_year_model DROP CONSTRAINT IF EXISTS product_fitment_year_model_unified_id_fkey;
ALTER TABLE IF EXISTS vendor_offers DROP CONSTRAINT IF EXISTS vendor_offers_catalog_product_id_fkey;

-- AFTER full pipeline (WPS + PU + VTWIN all loaded):
DELETE FROM catalog_fitment_v2 WHERE product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM product_fitment_year_model WHERE unified_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM vendor_offers WHERE catalog_product_id NOT IN (SELECT id FROM catalog_unified);

ALTER TABLE catalog_fitment_v2 ADD CONSTRAINT catalog_fitment_v2_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
ALTER TABLE product_fitment_year_model ADD CONSTRAINT product_fitment_year_model_unified_id_fkey
  FOREIGN KEY (unified_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
ALTER TABLE vendor_offers ADD CONSTRAINT vendor_offers_catalog_product_id_fkey
  FOREIGN KEY (catalog_product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;

CREATE OR REPLACE VIEW v_catalog_fitment AS
  SELECT cu.sku, cu.name, cu.brand,
    cu.fitment_hd_families, cu.fitment_hd_codes,
    cu.fitment_year_start, cu.fitment_year_end,
    cu.is_harley_fitment, cu.is_universal,
    m.model_code, m.model_name, m.family AS resolved_family,
    m.year_start AS model_year_start, m.year_end AS model_year_end,
    m.engine_key, e.nickname AS engine_nickname, e.name AS engine_name
  FROM catalog_unified cu
  LEFT JOIN LATERAL unnest(cu.fitment_hd_codes) fc(code) ON true
  LEFT JOIN hd_models m ON m.model_code = fc.code
    AND (cu.fitment_year_start IS NULL
      OR (cu.fitment_year_start <= COALESCE(m.year_end, 9999)
      AND COALESCE(cu.fitment_year_end::integer, 9999) >= m.year_start))
  LEFT JOIN hd_engine_types e ON e.engine_key = m.engine_key
  WHERE cu.is_harley_fitment = true;
```

---

## KNOWN SCRIPT ISSUES & FIXES

| Script | Issue | Fix Applied |
|--------|-------|-------------|
| All build_oem_fitment*.mjs | IPv6 hardcoded | sed replaced with 5.161.100.126 |
| All build_oem_fitment*.mjs | python3 path | /usr/bin/python3 in execSync |
| import_jwboon_fitment_v2.mjs | IPv6 hardcoded | Replaced with 5.161.100.126 |
| ingest_vtwin_unified.js | IPv6 hardcoded | Now uses CATALOG_DATABASE_URL |
| wps-master-item-import.js | ES module error | Renamed to .cjs |
| wps-master-item-import.cjs | Duplicate isValid() | Removed at line 223 |
| merge_vendors.js | CASCADE drop wipes fitment | Drop FK constraints before, re-add after |
| merge_vendors.js | v_catalog_fitment view | Drop view before DROP TABLE, recreate after |
| import_pu_filtered.js | Wrong filter | Filter on Drag Part=Y, not product code |
| stage0-wps-master-files.cjs | References catalog_specs (dropped) | Enrichment only — run after catalog rebuild |

---

## PUBLIC SCHEMA — TABLE INVENTORY

| Table | Rows | Size | Notes |
|-------|------|------|-------|
| product_fitment_year_model_archived | 2,739,739 | 244 MB | Archived inferred rows — do not restore |
| catalog_unified | 84,626 | 106 MB | ✅ Clean — rebuilt May 8 |
| product_fitment_year_model | 0 | 101 MB | ⚠️ Needs repopulation |
| oem_fitment | 379,899 | 100 MB | ✅ All families |
| catalog_fitment_v2 | 215,588 | 98 MB | ✅ JW Boon |
| catalog_products | 146,989 | 94 MB | WPS+PU raw pipeline |
| pu_brand_enrichment | 93,625 | 86 MB | ✅ Fresh |
| pu_products | 152,928 | 62 MB | Full PU raw |
| catalog_media | 171,200 | 44 MB | Product images |
| pu_products_filtered | 37,150 | 14 MB | ✅ Fresh — Drag Part=Y |
| pu_fitment | 35,730 | 9 MB | PU fitment |
| vendor_offers | 0 | 6 MB | ⚠️ Needs repopulation |
| vtwin_oem_crossref | 12,278 | 2 MB | ✅ Built May 8 |
| catalog_oem_crossref | 1,587 | 608 KB | FatBook crossref |
| hd_year_model_master | 1,618 | 400 KB | ✅ DO NOT MODIFY |
| harley_model_years | 1,633 | 200 KB | ✅ DO NOT MODIFY |
| hd_models | 309 | 120 KB | ✅ DO NOT MODIFY |
| model_alias_map | 347 | 80 KB | Search aliases |
| user_garage | 1 | 80 KB | |
| hd_engine_types | 15 | 64 KB | ✅ DO NOT MODIFY |
| hd_sportster_models | 26 | 48 KB | ✅ DO NOT MODIFY |
| harley_families | 17 | 48 KB | ✅ DO NOT MODIFY |
| engine_platform_map | 6 | 48 KB | ✅ DO NOT MODIFY |
| harley_models | 214 | 48 KB | ✅ DO NOT MODIFY |
| hd_family_engine_map | 16 | 32 KB | ✅ DO NOT MODIFY |

---

## VENDOR SCHEMA — VTWIN TABLES

| Table | Rows | Notes |
|-------|------|-------|
| vendor.vtwinmtc_products | 37,749 | Raw VTwin data |
| vendor.vtwin_sku_staging | 37,749 | Internal SKUs (700001+ range) |
| vendor.vtwin_category_map | ~394 | page→category map |
| vendor.vtwin_category_to_catalog | ~200 | VTwin→catalog category |
| vendor.vtwin_category_pages | ~2,652 | Expanded page→category |

⚠️ VTwin SKU range always 700001+ per prefix — never overlap WPS/PU (100k–200k range).

---

## UI — CURRENT STATE

### Homepage (app/page.jsx + components/home/)
- Bento grid, dark bg, black/gold/white palette
- **Era carousel at TOP of grid** (moved May 8 — was below search)
- ModelSearch tile: year dropdown → portal modal → /browse
- SmokeBackground: 40 particles, warm gold/grey, fixed canvas z-index 1
- Other tiles: Video, Category, Deals (placeholders)

### FloatingNav (components/home/FloatingNav.jsx)
- Dark glass pill `rgba(8,8,8,0.78)` + backdrop blur
- Gold cloud: `::before` radial gradient blur underneath
- Pill border: `rgba(201,168,76,0.22)`, brightens on scroll
- Minimizes on scroll down >80px, restores on scroll up
- **Mini button:** HD bar & shield SVG inline (menubutton.svg v2), 140×104px
- Gold SVG border (`#947600`), click pulse + gold glow burst animation
- Shield **only visible when nav is minimized** (`showMini = mounted && minimized && !manualOpen`)

### Era Pages (app/era/[slug]/)
- Slugs locked: flathead, knucklehead, panhead, shovelhead, ironhead-sportster,
  evolution, evo-sportster, twin-cam, milwaukee-8, chopper
- Images: public/images/eras/*.webp (flathead.webp still missing)

---

## IMAGE PROXY

LeMans CDN serves ZIP archives. Pattern: `http://asset.lemansnet.com/z/<base64>`

**Proxy route:** `GET /api/image-proxy?url=<encoded_lemans_url>`
- Validates host is asset.lemansnet.com (SSRF protection)
- Downloads ZIP, extracts first image via fflate
- Disk cache keyed by SHA-256 (IMG_CACHE_DIR, default /tmp/stinkin-img-cache)

---

## TYPESENSE

**Collection:** products  
**Host:** 5.161.100.126:8108 (direct) / nginx HTTPS proxy  
**Env vars:** TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_API_KEY, TYPESENSE_SEARCH_KEY  
**IS_GROUPS_COLLECTION:** must stay = false in lib/typesense/client.ts  

Reindex: `node scripts/ingest/index_unified.js --recreate`

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| psql IPv6 | Quote URL: psql 'postgresql://...' |
| catalog_unified rebuild | See REBUILD PROCEDURE section above |
| product_fitment_year_model | Wiped on rebuild — repopulate from catalog_fitment_v2 + oem_fitment |
| pdfplumber subprocess | Use /usr/bin/python3 in execSync — not bare python3 |
| zsh heredoc | Edit file directly — heredoc fails on special chars |
| Vercel env vars | Use printf not echo (avoids \n in vars) |
| IS_GROUPS_COLLECTION | Must stay = false in lib/typesense/client.ts |
| WPS filter | harddrive_catalog=true (9,742 of 122K rows) |
| PU filter | Drag Part=Y in BasePriceFile.csv (37,150 of 152K rows) |
| VTwin SKUs | Always regenerate from 700001+ per prefix |
| COPY TO file | Use \copy — catalog_app not superuser |
| Disk space | 75GB root. Check catalog_media index if fills. journalctl --vacuum-size=200M |
| catalog_specs | DROPPED May 8 — any script referencing it will fail |
| catalog_brands | DROPPED May 8 — rebuild from vendor data |

---

## KEY COMMANDS

```bash
# Connect
ssh stinkdb
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"

# Full catalog rebuild
node scripts/ingest/import_pu_filtered.js
node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
node scripts/ingest/import_pu_brand_catalogs_WORKING.js
node scripts/ingest/merge_vendors.js
node scripts/ingest/ingest_vtwin_unified.js

# Fitment rebuild
node scripts/ingest/import_jwboon_fitment_v2.mjs
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs

# Typesense
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod
```

---

*Master Reference — Last update: May 8, 2026 · Full catalog + fitment rebuild complete*
