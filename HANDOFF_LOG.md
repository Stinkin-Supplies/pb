# Stinkin' Supplies — Session Handoff
**Date:** April 21, 2026
**Status:** ✅ Harley fitment authority live | ✅ catalog_fitment_v2 populated | ✅ DB-driven dropdowns | ✅ WPS OEM crossref loaded | ✅ PU images backfilled | ✅ Reindexed 50,763 docs

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 50,763 products, images rendering for PU products (18,415 with image_url)
- **Search** — Typesense live, 50,763 docs, 0 errors
- **Fitment filtering** — Phase 7 complete: Harley queries use `catalog_fitment_v2` (ID-based, no range logic)
- **Fitment dropdowns** — Phase 6 complete: `/api/fitment` serves families/models/years from canonical tables
- **OEM numbers** — 5,411 products have OEM numbers (up from 3,898), including 1,568 from WPS Harley crossref CSV
- **catalog_fitment_v2** — 2,232,451 rows covering 8,593 products across all HD families
- **is_harley_fitment** — 7,244 products flagged in catalog_unified
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

## 📊 DATABASE STATE (End of April 21)

### catalog_unified
```
Total:       51,141 rows
WPS:         27,132 (9,742 HardDrive + 17,390 tires/tools)
PU:          24,009 (11,225 fatbook | 3,607 oldbook | 9,177 both)
image_url:   18,415 PU products (backfilled from catalog_media April 21)
```

### Harley Fitment Authority Tables
```
harley_families:     8 rows
harley_models:       149 model codes
harley_model_years:  1,248 rows

catalog_fitment_v2:  2,232,451 rows
Products covered:    8,593
```

### Harley Families
```
Touring        37 models  407 year-rows
Softail Evo    27 models  228 year-rows
Softail M8     17 models  134 year-rows
Sportster      30 models  264 year-rows
Dyna           14 models  127 year-rows
Trike           7 models   39 year-rows
Revolution Max  8 models   30 year-rows
Street          3 models   19 year-rows
```

### catalog_oem_crossref
```
Total rows:    ~95,116
Sources:       WPS vendor data + PU brand XML + WPS Harley OEM CSV (1,568 new)
Products with oem_numbers[]: 5,411
```

---

## 📂 NEW SCRIPTS (April 21)

All in `scripts/ingest/`:

| Script | Purpose |
|--------|---------|
| `phase1_2_harley_authority.js` | Creates harley_families/models/model_years tables and seeds canonical data |
| `phase4_migrate_fitment.js` | Migrates catalog_fitment → catalog_fitment_v2 (family + model-code mapping) |
| `import_wps_harley_oem_crossref.js` | Loads wps_harley_oem_cross_reference.csv → catalog_oem_crossref + re-aggregates oem_numbers[] |

### Re-run fitment v2 migration (if catalog_fitment changes):
```bash
node scripts/ingest/phase4_migrate_fitment.js
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

## 💡 OPERATIONAL GOTCHAS (April 21 additions)

| Issue | Solution |
|-------|----------|
| CROSS JOIN fitment on large product sets | Use temp table for product_ids first to avoid hanging |
| GENERATE_SERIES with $params | Must cast: GENERATE_SERIES($1::int, $2::int) |
| index_assembly.js dotenv unreliable | Hardcode CATALOG_DATABASE_URL in script for ingest runs |
| Vercel 100MB deploy limit | Keep dump files off project root — move to ~/Desktop |
| catalog_fitment_v2 null-year rows | Use family CROSS JOIN model_years (all years), not year range |
