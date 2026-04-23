# Stinkin' Supplies — Session Handoff
**Date:** April 23, 2026
**Status:** ✅ Fitment v2 migration complete | ✅ 99.9% coverage | ✅ Disk incident resolved | ✅ Engine-era families seeded | ✅ VTwin ingested | ✅ Reindexed 88,301 docs

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 50,763 products, images rendering for PU products (18,415 with image_url)
- **Search** — Typesense live, 50,763 docs, 0 errors
- **Fitment filtering** — Phase 7 complete: Harley queries use `catalog_fitment_v2` (ID-based, no range logic)
- **Fitment dropdowns** — Phase 6 complete: `/api/fitment` serves families/models/years from canonical tables
- **OEM numbers** — 5,411 products have OEM numbers
- **catalog_fitment_v2** — 2,717,429 rows covering 10,580 specific-fitment products + 3,646 universal (`fits_all_models=true`) = **14,226 total** vs original v1 target of 12,927 ✅
- **fits_all_models flag** — 3,646 products flagged on catalog_products (sourced from All Models / Universal rows in catalog_fitment)
- **Harley authority tables** — 15 families, 158 models, 1,415 model-year rows (coverage 1936–2026)
- **Disk** — 100% full disk resolved; server now 19% used (59GB free)
- **VTwin** — 37,749 products ingested into catalog_unified (source_vendor=VTWIN)
- **Typesense** — Reindexed 88,301 docs (WPS + PU + VTwin), 0 failures
- **Production** — https://stinksupp.vercel.app

---

## 🚨 CURRENT ISSUES

### Issue 1: Typesense schema mismatch
`index_assembly.js` defines an old schema missing `drag_part`, `in_fatbook`, `in_harddrive`, `is_active`, `has_image`, `source_vendor`, `features`. Workaround applied (removed `is_active` from `buildFilters` base, removed `description` from `query_by`) but the indexer schema needs a proper update to match what the app expects.

### Issue 2: import_pu_brand_xml.js dead OEM step
Step 4 tries to UPDATE `cu.oem_part_number` which doesn't exist. Low priority — OEM handled correctly via `catalog_oem_crossref` → `oem_numbers[]`.

### Issue 3: Phase 9 (Admin UI) not yet built
No `/admin/fitment` UI for managing `catalog_fitment_v2` assignments.

### Issue 4: Phase 10 (cutover) not done
`catalog_fitment` still exists and is still the source for non-HD fitment. Cutover pending Admin UI completion.

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

## 📊 DATABASE STATE (End of April 23)

### catalog_unified
```
Total:       88,512 rows
WPS:         26,754
PU:          24,009
VTwin:       37,749 (ingested April 23)
image_url:   18,415 PU products + 30,857 VTwin products
```

### Harley Fitment Authority Tables
```
harley_families:     15 rows
  Modern:            Touring, Softail Evo, Softail M8, Dyna, Sportster,
                     Trike, Revolution Max, Street, FXR
  Engine-era:        Twin Cam (1999–2017), Evolution (1984–1999),
                     Shovelhead (1966–1984), Panhead (1948–1965),
                     Knucklehead (1936–1947), V-Rod (2002–2017)

harley_models:       158 model codes (includes engine-era canonicals)
harley_model_years:  1,415 rows (1936–2026)

catalog_fitment_v2:  2,717,429 rows
Products covered:    10,580 (specific fitment)
fits_all_models:     3,646 (universal — set on catalog_products)
Total covered:       14,226 (vs 12,927 v1 target — exceeded ✅)
Permanently unresolved: 17 products (bad source data — see Known Issues)
```

### Disk (Hetzner)
```
/dev/sda1:  75G total, 14G used, 59G free (19%) as of April 23
Root cause of April 23 incident: catalog_media had a bloated 29GB btree
index on (product_id, url). Fixed: dropped + rebuilt as md5 hash index.
VACUUM FULL catalog_media reclaimed ~43GB.
```

### catalog_oem_crossref
```
Total rows:    ~95,116
Products with oem_numbers[]: 5,411
```

---

## 📂 SCRIPTS

All in `scripts/ingest/`:

| Script | Purpose |
|--------|---------|
| `phase1_2_harley_authority.js` | Creates harley_families/models/model_years tables and seeds canonical data |
| `phase4_migrate_fitment.js` | Migrates catalog_fitment → catalog_fitment_v2 |
| `import_wps_harley_oem_crossref.js` | Loads WPS Harley OEM CSV → catalog_oem_crossref |

### Re-run fitment v2 migration (if catalog_fitment changes):
```bash
node scripts/ingest/phase4_migrate_fitment.js
```

### Re-ingest VTwin:
```bash
node scripts/ingest/generate_vtwin_skus.js
node scripts/ingest/ingest_vtwin_unified.js
```

### Reindex (use stable WiFi):
```bash
node scripts/ingest/index_assembly.js --recreate
```

### Deploy:
```bash
npx vercel --prod
```

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Phase 9 — Admin UI** — `/admin/fitment`: Family → Model → Year selector, assign product fitment via `catalog_fitment_v2`
2. **Phase 10 — Cutover** — stop writing to `catalog_fitment`, archive, all writes → v2
3. **Fix Typesense schema** — update `index_assembly.js` to include missing fields, reindex
4. **Verify PU images** — check DevTools on live site for `/api/img` 200 responses

---

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| CROSS JOIN fitment on large product sets | Use temp table for product_ids first to avoid hanging |
| GENERATE_SERIES with $params | Must cast: GENERATE_SERIES($1::int, $2::int) |
| index_assembly.js dotenv unreliable | Hardcode CATALOG_DATABASE_URL in script for ingest runs |
| Vercel 100MB deploy limit | Keep dump files off project root — move to ~/Desktop |
| catalog_fitment_v2 null-year rows | Use family CROSS JOIN model_years (all years), not year range |
| Disk fills on Hetzner | Check catalog_media index size first — historical culprit. Then: `sudo journalctl --vacuum-size=200M` |
| psql pager blocks output | Run `\pset pager off` at start of session |
| VTwin SKU range | Always generate from 700001+ — WPS/PU use 100k–200k range |
| VTwin re-ingest | Run generate_vtwin_skus.js first, then ingest_vtwin_unified.js |
| VTwin date_added | Validate exactly 8 digits before parsing as YYYYMMDD |
