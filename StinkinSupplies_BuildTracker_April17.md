# Stinkin' Supplies — Build Tracker
**Last Updated:** April 17, 2026 — END OF SESSION
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Fitment expanded ✅ | OEM expanded ✅ | **Reindex needed**

---

## ✅ COMPLETED APRIL 17

### Session Start
- [x] Reindexed Typesense: 94,400 indexed, 0 failed (96.4s) — pricing updates live

### OEM Cross-Reference
- [x] Inserted 93,529 rows from pu_brand_enrichment → catalog_oem_crossref
- [x] catalog_oem_crossref: 19 → **93,548 rows**
- [x] Updated index_assembly.js: added `oem_numbers[]` schema field + `catalog_oem_crossref` JOIN
- [x] Updated client.ts query_by: now searches oem_numbers in Typesense

### catalog_images → catalog_media Migration
- [x] Migrated 21,075 unique rows from catalog_images → catalog_media
- [x] Dropped catalog_images table (legacy, dual-FK, no longer needed)
- [x] catalog_media: 38,512 → **58,544 rows**
- [x] Products with images: 31,130 → **44,508**

### Infrastructure
- [x] nginx `client_max_body_size` raised from 1MB → 20MB on Typesense proxy
  - Was silently failing second Typesense batch (1000 docs × ~1KB ≈ 1MB limit)
  - Fixed on `/etc/nginx/sites-enabled/typesense` on stinkdb

### catalog_product_enrichment Cleanup
- [x] Identified true orphans: all 172,656 rows had NULL product_id (joins by SKU, not ID)
- [x] Deleted 95,633 rows where SKU NOT IN catalog_products
- [x] catalog_product_enrichment: 172,656 → **77,023 rows**

### Fitment Extraction Pipeline
- [x] Wrote `scripts/ingest/extract_fitment.js` — regex extraction from name + description
- [x] Correctly handles year formats: `YY-YY`, `YY-UP`, `YYYY-UP`, `YYYY-YYYY`
- [x] Model families: Touring (FL/FLH/FLT/FLHT/FLHR/FLHX), Softail (FXST/FLST), Dyna (FXD), FXR (separate from Dyna), Sportster (XLH/XLS/SPORTSTER)
- [x] M8 inference: `M8` in name → Touring 2017-Up / Softail 2018-Up / Sportster 2021-Up
- [x] Fixed XL false positives — bare `XL` removed (matched helmet sizes); now requires XLH/XLS/XL+digits
- [x] Fixed FXR vs Dyna — FXR is own family (rubber-mount 1982-1994)
- [x] Added `NULLS NOT DISTINCT` unique index on catalog_fitment — safe for re-runs
- [x] catalog_fitment: 11,891 → **18,653 rows**
- [x] Products with fitment: ~600 → **7,256**

**Fitment by family:**
| Family | Products |
|--------|---------|
| Touring | 4,201 |
| Softail | 1,462 |
| Dyna | 1,081 |
| Sportster | 942 |
| FXR | 388 |

---

## ✅ COMPLETED APRIL 16

### Database Cleanup
- [x] Full DB audit — identified all gaps
- [x] Deleted 18,450 metric/apparel/non-HD products + all child rows
- [x] 0 metric products remain in catalog

### Allowlist
- [x] Added 9,699 orphaned HD products to allowlist (WPS: 1,295 | PU: 8,404)
- [x] 98,353 products in catalog, all in allowlist

### WPS Pipeline
- [x] Promoted 19,271 WPS products from vendor.vendor_products
- [x] Extracted 22,181 images from images_raw JSON → catalog_media
- [x] WPS: 7,948 → 27,219 in catalog

### PU Pipeline
- [x] Promoted 1,010 PU products (non-Z1R HD brands) from pu_products
- [x] PU: 70,124 → 71,134 in catalog

### Pricing — COMPLETE
- [x] WPS computed_price: **27,219/27,219 = 100%**
- [x] PU computed_price: **67,172/67,181 = 99.99%** (9 products truly unpriceable)

### Images
- [x] 31,130 products with images (now 44,508 after April 17)

### catalog_unified — REBUILT
- [x] 94,400 rows (WPS: 27,219 | PU: 67,181)

### Search — FIXED & VERIFIED
- [x] Search verified: Drag Specialties 7,394 | S&S Cycle 1,389 | Shinko 515 | Zero metric results

---

## 🚀 FIRST THING NEXT SESSION

```bash
# Reindex Typesense — picks up new fitment facets + OEM search
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```

Then:
1. Tire catalog images — tire_master_image.xlsx (same HYPERLINK extraction as HardDrive)
2. WPS FatBook PDF OEM extraction

---

## 📊 FINAL METRICS (April 17)

| Metric | Value |
|--------|-------|
| catalog_products | 98,353 |
| — WPS | 27,219 (100% priced) |
| — PU | 71,134 (99.99% priced) |
| catalog_unified | 94,400 |
| Typesense indexed | 94,400 (**needs reindex** for fitment + OEM) |
| Products with images | **44,508** |
| catalog_media | **58,544 rows** |
| catalog_pricing WPS | 27,219 (100%) |
| catalog_pricing PU | 62,065 (87%+) |
| computed_price WPS | 27,219 (100%) |
| computed_price PU | 67,172 (99.99%) |
| catalog_oem_crossref | **93,548 rows** |
| catalog_fitment | **18,653 rows / 7,256 products (~7.7%)** |
| catalog_product_enrichment | **77,023 rows** |
| catalog_allowlist | 494K+ rows |
| catalog_inventory | 697,796 rows |

---

## 🏗️ ARCHITECTURE — LOCKED DECISIONS

### Catalog Scope
- WPS Hard Drive (HDTwin) — HD brand parts
- WPS Tires & Wheels — All tire brands
- WPS Tools & Chemicals — Maintenance/tools/chemicals
- PU Fatbook / Oldbook — HD parts
- PU Tire / Service — Tires/service
- **Excluded:** Metric, ATV, Offroad, Snow, Watercraft, Apparel, Z1R helmets

### Pricing Formula (map_protected)
```
IF map_price > 0 AND has_map_policy → sell at map_price
ELSE → LEAST(GREATEST(dealer/0.75, dealer/0.90), msrp)
WPS → pricing_rule_id=2 | PU → pricing_rule_id=3
```

### Image Sources
- catalog_media = canonical (catalog_images DROPPED April 17)
- WPS: from vendor.vendor_products.images_raw JSON
- PU: from pu_brand_enrichment.image_uri

### PU SKU Format
- catalog_products.sku uses PUNCTUATED format (e.g. 1401-1193)
- pu_pricing.part_number uses PLAIN format (e.g. 14011193)
- Always join via punctuated_part_number

### Fitment Model Families
- Touring: FL, FLH, FLT, FLHT, FLHR, FLHX + variants
- Softail: FXST, FLST + variants
- Dyna: FXD, FXDWG, FXDB + variants (1991-2017)
- FXR: FXRS, FXRT, FXRD + variants (1982-1994) — **separate from Dyna**
- Sportster: XLH, XLS, XL+digits, SPORTSTER
- M8 (Milwaukee-Eight): 2017+ Touring, 2018+ Softail, 2021+ Sportster S

---

## 🔧 KEY COMMANDS

```bash
# Reindex Typesense (stable WiFi required)
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"

# Run fitment extraction (safe to re-run — NULLS NOT DISTINCT unique index)
npx dotenv -e .env.local -- node scripts/ingest/extract_fitment.js --dry-run
npx dotenv -e .env.local -- node scripts/ingest/extract_fitment.js

# Rebuild allowlist
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs

# DB
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
ssh stinkdb
```

---

## 🐛 KNOWN ISSUES

1. **9 PU products with NULL computed_price** — no pricing data anywhere, genuinely unpriceable
2. **catalog_fitment sparse** — 7.7% coverage; pre-existing rows have messy model name variants (FXRT Sport Glide, TLE SIDECAR variants, etc.) — low priority
3. **Typesense needs reindex** — fitment + OEM data not yet in search index
4. **Typesense indexer** — sensitive to flaky connections (Promise.all 5 parallel queries). Use stable WiFi.
5. **catalog_app not superuser** — cannot DISABLE TRIGGER ALL

---

## 🔗 RESOURCES

- DB: `postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog`
- SSH: `ssh stinkdb`
- Master Reference: `MasterRef_April16.md`
- Chase List: `CHASE_LIST.md`
- Git Branch: `claude/naughty-lovelace` (worktree)
- Project: `/Users/home/Desktop/Stinkin-Supplies`

---

*Build Tracker — Last update: April 17, 2026 end of session*
