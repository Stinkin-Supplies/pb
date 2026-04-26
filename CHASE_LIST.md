# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 25, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

1. **Reindex Typesense** — all enrichment from April 25 session needs to be picked up
   ```bash
   export DATABASE_URL="postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
   node scripts/ingest/index_unified.js --recreate
   ```
2. **Reindex Typesense** — refresh the live collection with `index_unified.js`
3. **Phase 9 — Admin UI** — `/admin/fitment`: Family → Model → Year selector, assign/remove fitment via `catalog_fitment_v2`
4. **Phase 10 — Cutover** — archive `catalog_fitment`, all writes → `catalog_fitment_v2` only
5. **PU ACES fitment files** — request from PU rep (biggest fitment unlock: 30% → 70%+)

---

## ✅ DONE APRIL 25

| Task | Result |
|------|--------|
| WPS content enrichment | 9,678 rows: description/features/dims/upc backfilled from harddrive CSV |
| WPS image backfill | 1,607 images added to catalog_unified from wps-master-image-list.csv |
| VTwin content enrichment | 21,797 rows: images (up to 4), OEM xrefs, pricing, manufacturer_brand |
| Drag Specialties XML enrichment | 4,302 PU rows enriched from DS catalog XML (bullets→features, images) |
| PU brand XML enrichment | 4,971 rows from 134 brand XMLs (both PIES + Catalog_Content_Export formats) |
| build_fitment.js | OEM xref → catalog_unified fitment columns (year_start/end, families, ranges) |
| build_fitment_v2.js | 265,716 VTwin + 65,081 WPS rows inserted into catalog_fitment_v2 |
| extract_fitment_from_names.js | 6,185 rows: year+family regex extraction from product names |
| extract_fitment_db_driven.js | 14 rows: DB alias table driven extraction |
| model_alias_map table | Created + seeded (205 aliases from harley_models + manual entries) |
| engine_platform_map table | Created + seeded (M8, Twin Cam, Evo, Shovelhead, TC) |
| catalog_fitment_v2 columns | Added fitment_source, confidence_score, parsed_snapshot |

---

## ✅ DONE APRIL 23

| Task | Result |
|------|--------|
| VTwin ingested into catalog_unified | 37,749 products (source_vendor=VTWIN) |
| Engine-era families seeded | Knucklehead, Panhead, Shovelhead, V-Rod, Twin Cam, Evolution, FXR added |
| catalog_fitment_v2 migration complete | 2,717,429 rows, 10,580 products + 3,646 universal |
| Disk incident resolved | catalog_media bloated 29GB index dropped, VACUUM FULL, rebuilt as md5 hash |
| Typesense reindexed | 88,301 docs, 0 errors |
| fits_all_models flag | 3,646 products flagged on catalog_products |

---

## ✅ DONE APRIL 21

| Task | Result |
|------|--------|
| Deployed enriched PU data | stinksupp.vercel.app live |
| Backfilled catalog_unified.image_url | 14,907 PU rows, 18,415 now have images |
| Phase 1+2 — harley authority tables | 8 families, 149 models, 1,248 year rows |
| Phase 3 — catalog_fitment_v2 | Table + indexes live |
| Phase 4 — fitment migration | 319,389 rows, 3,292 products |
| Phase 5 — catalog_fitment_readable view | Live |
| Phase 6 — fitment dropdowns | /api/fitment canonical |
| Phase 7 — HD filtering → v2 | No more range logic |
| WPS Harley OEM cross-ref loaded | 1,568 rows, 5,411 products with OEM# |
| is_harley_fitment flag | 7,244 products flagged |

---

## 🔴 HIGH PRIORITY

### Typesense reindex (blocking for new content to appear in search)
All April 25 enrichment (descriptions, features, images, fitment) is in catalog_unified but not yet in Typesense.

### Typesense schema mismatch
Missing fields: `drag_part`, `in_fatbook`, `in_harddrive`, `is_active`, `has_image`, `source_vendor`, `features`

### PU ACES fitment files
The single biggest remaining fitment unlock. PU delivers per-brand ACES XML files separately from product content XMLs. These contain vehicle application data (year/make/model) for every part number. Would push PU from 21.5% year coverage → 70%+. Request from PU rep.

---

## 🔵 LOW PRIORITY / FUTURE

### Expand model_alias_map
Missing codes that appeared in product names: `FLTRX`, `FXDB`, `FLHTK`, `FLSTF`, `FLHRC`, `FXDWG`. Add to DB, re-run `extract_fitment_db_driven.js`.
```sql
INSERT INTO model_alias_map (alias_text, model_family, model_code, priority)
VALUES ('fltrx', 'touring', 'FLTRX', 9), ('fxdb', 'dyna', 'FXDB', 9), ...;
```

### Phase 9 — Admin UI
`/admin/fitment`: Family → Model → Year selector, add/remove product fitment via `catalog_fitment_v2`.

### Phase 10 — Cutover
Stop writing to `catalog_fitment`. Archive it. All new writes → `catalog_fitment_v2`.

### WPS FatBook PDF OEM extraction
Would expand OEM number coverage significantly. WPS side of catalog_oem_crossref still sparse.

### Tire catalog images
`tire_master_image.xlsx` not yet processed.

### Fix import_pu_brand_xml.js
Remove dead `cuOEM` UPDATE block (step 4 tries to UPDATE cu.oem_part_number which doesn't exist).

### IMG_CACHE_DIR persistence
Set `IMG_CACHE_DIR=/var/cache/stinkin-images` in `.env.local` on Hetzner.

---

## 📊 CURRENT STATE (End of April 25)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows |
| — WPS | 26,754 |
| — PU | 24,009 |
| — VTwin | 37,749 |
| Typesense indexed | 88,301 (stale — needs reindex) |
| catalog_fitment (legacy) | 26,008 rows |
| catalog_fitment_v2 | ~3,048,000+ rows |
| — VTwin covered | 4,858 products (12.9%) |
| — WPS covered | 2,328 products (8.7%) |
| — PU covered | 7,250 products (30.2%) |
| catalog_unified fitment (PU) | 5,171 with year / 5,365 with families |
| catalog_unified fitment (VTwin) | 5,399 with year / 5,370 with families |
| catalog_unified fitment (WPS) | 2,266 with year / 2,362 with families |
| harley_families | 15 |
| harley_models | 158 |
| harley_model_years | 1,415 rows |
| catalog_oem_crossref | ~95,116 rows |
| oem_numbers[] populated | 5,411 products |
| model_alias_map | 205 aliases |
| engine_platform_map | 6 entries |
| VTwin with images | 30,857 |
| PU with images | 18,415 |
| WPS with images | ~25,000+ |

---

*Updated: April 25, 2026 — vendor enrichment + fitment pipeline session*
