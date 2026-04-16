# Stinkin' Supplies — Build Tracker
**Last Updated:** April 16, 2026
**Status:** Database Audit & Cleanup In Progress 🔧

---

## 🎯 CURRENT PHASE: DATABASE AUDIT & REMEDIATION

### Session Summary — April 16, 2026

Full database audit completed. Root cause of missing products identified. First major cleanup operation executed successfully. Work continues.

---

## ✅ COMPLETED TASKS

### Database Infrastructure
- [x] Hetzner Postgres Setup — 5.161.100.126:5432/stinkin_catalog
- [x] 32+ Tables Created — Core catalog + vendor raw data + unified view
- [x] SSH Access — `ssh stinkdb` alias configured
- [x] Schema Design — Products, media, inventory, pricing, enrichment, routing

### WPS Integration
- [x] API Authentication — Bearer token validated
- [x] Brands Import — 988 brands
- [x] Attribute Keys — 90 attribute types
- [x] Inventory Import — 697,796 records across 7 warehouses
- [x] WPS Pricing — 22,278 WPS products fully priced (100% coverage)

### Image Pipeline
- [x] Excel HYPERLINK Extraction — Python regex script
- [x] HardDrive Catalog Images — ~27,854 WPS CDN URLs in catalog_media
- [x] PU Images — LeMans CDN URLs in catalog_media
- [x] catalog_media total — 38,512 records (28,445 distinct products)

### Search Infrastructure
- [x] Typesense Schema — 22 fields + facets
- [x] OEM cross-reference search — working (oem_numbers field populated)
- [x] Allowlist-filtered indexing — index_assembly.js uses catalog_allowlist

### April 16 — Database Audit & Metric Product Purge ✅
- [x] Full DB audit completed (DB_AUDIT_REPORT.md + DB_SAMPLE_ROWS.json)
- [x] Root cause identified: vendor.vendor_products → catalog_products pipeline incomplete
- [x] Identified 18,450 non-HD/metric/apparel products incorrectly in catalog_products
- [x] Identified 9,699 legitimate HD products in catalog_products missing from allowlist
- [x] **DELETED 18,450 metric/apparel/non-HD products** from catalog_products + all child rows
- [x] Cascade-safe delete: vendor_offers, catalog_images, catalog_media, catalog_specs, catalog_fitment, catalog_prices, catalog_reviews, catalog_variants, catalog_attributes all cleaned
- [x] FK constraints on catalog_images temporarily dropped and restored for delete operation
- [x] Post-delete verified: 78,072 products remaining (WPS: 7,948 | PU: 70,124)

---

## 🔄 IN PROGRESS — April 16 Session

### Fix 1: Allowlist repair for 9,699 orphaned HD products ← NEXT UP
These are legitimate HD-brand products (Drag Specialties, S&S, Biltwell, Mustang, Cobra, etc.)
that are in catalog_products but NOT in catalog_allowlist, so they are invisible in search.
Root cause: case mismatch between catalog_products.brand and allowlist source, plus some
brands never added to the allowlist builder.

**Brands affected (sample):**
- DRAG SPECIALTIES / DRAG SPECIALTIES SEATS — 2,622 products
- Cobra / COBRA — 720 products
- S&S Cycle / S&S CYCLE — 664 products
- MUSTANG — 652 products
- NAMZ CUSTOM CYCLE — 625 products
- BILTWELL — 607 products
- Klock Werks / KLOCK WERKS — 598 products
- James Gasket / JAMES GASKETS — 512 products
- + 19 more HD brands

**Fix:** Insert missing SKUs into catalog_allowlist under wps_hard_drive or pu_fatbook/oldbook
source as appropriate, then reindex Typesense.

### Fix 2: PU pricing — 70,124 PU products with zero pricing ← QUEUED
- pu_pricing table has 151,497 rows (D00108 price file loaded)
- catalog_products PU rows have 0% pricing coverage
- Need to join pu_pricing → catalog_pricing by SKU
- Need to confirm pu_pricing schema columns first

### Fix 3: WPS pipeline gap — 122,192 WPS in vendor_products, only 7,948 in catalog ← QUEUED
- ~114,244 WPS products never promoted from vendor.vendor_products to catalog_products
- These include drop_ship_eligible = true, status = STK products (confirmed from samples)
- Need to understand original promotion script and why it only got 7,948
- Promotion should only include Hard Drive / HDTwin brands + tire brands + tools/chemicals

### Fix 4: PU pipeline gap — 173,741 PU in vendor_products, only 70,124 in catalog ← QUEUED
- ~99,403 PU products missing from catalog
- Need same investigation as WPS

### Fix 5: catalog_unified rebuild ← QUEUED (after fixes 1-4)
- Currently 138,872 rows — stale, contains orphaned PU rows
- Needs full rebuild after catalog_products is corrected

### Fix 6: catalog_images consolidation ← QUEUED
- Two image tables: catalog_images (legacy, 21,891 products) and catalog_media (active, 28,445)
- Typesense uses catalog_media; product detail page may use catalog_images
- Plan: migrate any catalog_images rows not in catalog_media, then drop catalog_images

---

## 📋 PENDING TASKS

### High Priority

**Allowlist & Search**
- [ ] Fix allowlist: insert 9,699 orphaned HD products into catalog_allowlist
- [ ] Reindex Typesense after allowlist fix
- [ ] Verify search returns correct HD products

**Pricing**
- [ ] Confirm pu_pricing schema columns
- [ ] Join pu_pricing to catalog_pricing for 70,124 PU products
- [ ] Validate pricing coverage after load

**Pipeline Gaps**
- [ ] Investigate WPS promotion script — why only 7,948/122,192 promoted
- [ ] Promote missing HD-brand WPS products from vendor.vendor_products
- [ ] Investigate PU promotion gap
- [ ] Promote missing PU products from vendor.vendor_products

**Catalog Unified**
- [ ] Rebuild catalog_unified after catalog_products stabilizes

**Image Consolidation**
- [ ] Migrate catalog_images → catalog_media
- [ ] Drop catalog_images table
- [ ] Verify product detail pages use catalog_media

### Medium Priority

**OEM Cross-Reference**
- [ ] catalog_oem_crossref has only 19 rows — needs expansion
- [ ] Extract oem_part_number from pu_products at scale → catalog_oem_crossref
- [ ] FatBook PDF OEM extraction pipeline
- [ ] Update search route to include oem_numbers in query_by
- [ ] Display OEM numbers on product detail pages

**Fitment**
- [ ] catalog_fitment has only 11,891 rows across 78K products (~15%)
- [ ] Build regex/NLP extraction pipeline from vendor description fields
- [ ] Target: structured make/model/year rows in catalog_fitment

**Tire Images**
- [ ] Extract tire catalog images from tire_master_image.xlsx (same HYPERLINK formula method)
- [ ] Import into catalog_media

### Low Priority
- [ ] Real-time inventory sync
- [ ] Automated vendor updates
- [ ] Monitoring & backup automation
- [ ] Image URL 404 validation

---

## 🏗️ ARCHITECTURE DECISIONS

### Catalog Scope — LOCKED
Stinkin' Supplies sells Harley-Davidson focused products only:
- **WPS Hard Drive (HDTwin)** — HD-brand parts (Drag Specialties, S&S, Kuryakyn, etc.)
- **WPS Tires & Wheels** — All tire brands (universal fitment)
- **WPS Tools & Chemicals** — Maintenance/chemical/tool products (universal)
- **PU Fatbook / Oldbook** — HD-focused parts catalog
- **PU Tire / Service** — Tires and service items

Excluded: Street/ATV/Offroad/Snow/Watercraft/Apparel/FLY Racing/Metric brands

### Allowlist Architecture — ACTIVE
catalog_allowlist table on Hetzner Postgres is the source of truth for what gets indexed.
index_assembly.js joins against it in the Typesense indexing query.
Allowlist sources: wps_hard_drive, wps_tire_brands, wps_tools_chemicals, pu_fatbook, pu_oldbook, pu_tire

### Image Strategy — catalog_media is canonical
catalog_media is the active image table used by Typesense indexer.
catalog_images is legacy — will be consolidated into catalog_media and dropped.
CDN URLs only — WPS CDN + LeMans CDN, no local image storage.

### Two-Schema DB Layout
- vendor schema: vendor.vendor_products (296K raw), vendor.vendor_categories, etc. — untouched source data
- public schema: catalog_products (78K clean), catalog_unified, catalog_media, etc. — application data

---

## 📊 CURRENT METRICS (as of April 16 post-cleanup)

| Metric | Value | Notes |
|--------|-------|-------|
| catalog_products | 78,072 | Post-cleanup (was 96,522) |
| — WPS | 7,948 | Underpromoted — pipeline gap |
| — PU | 70,124 | Missing pricing |
| catalog_unified | 138,872 | Stale — needs rebuild |
| catalog_media | 38,512 rows | 28,445 distinct products with images |
| catalog_allowlist | 479,565 rows | 169,041 unique SKUs |
| In allowlist | 68,373 | Products currently searchable |
| HD brands not in allowlist | 9,699 | Need allowlist fix |
| catalog_inventory | 697,796 | WPS warehouse inventory |
| catalog_pricing (WPS) | 22,278 | 100% WPS coverage |
| catalog_pricing (PU) | 0 | 0% PU coverage — fix queued |
| catalog_oem_crossref | 19 | Near-empty — expansion needed |
| catalog_fitment | 11,891 | ~15% coverage |
| vendor.vendor_products | 295,933 | Raw vendor data (wps: 122,192, pu: 173,741) |

---

## 🔧 TOOLS & SCRIPTS

### Import Scripts
```
scripts/ingest/
  ├── import_wps_inventory.js           — Warehouse inventory
  ├── fetch_wps_reference_data.js       — Brands + attributes
  ├── extract_harddrive_images.py       — Excel HYPERLINK extraction
  ├── import_harddrive_ultra_fast.js    — Bulk image import
  ├── import_wps_pricing.js             — Dealer pricing
  ├── index_assembly.js                 — Typesense indexer (uses allowlist)
  ├── index_assembly_optimized.cjs      — OEM indexing pipeline
  ├── stage0-pu-dealerprice.cjs         — Import D00108 dealer price file
  └── build-catalog-allowlist.cjs       — Build/rebuild catalog_allowlist
```

### Key Commands
```bash
# Rebuild allowlist from scratch
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs

# Reindex Typesense (clean)
rm .stage3_checkpoint.json
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"

# Connect to DB
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
ssh stinkdb
```

### Delete Pattern for Non-Cascade FKs
When deleting from catalog_products, must manually delete from these tables first
(they have NO ACTION FK, not CASCADE):
1. vendor_offers (catalog_product_id)
2. catalog_images (catalog_product_id AND product_id — two FKs)
3. map_audit_log (catalog_product_id)
4. routing_decisions (catalog_product_id)

catalog_images also has CASCADE FK (product_id), which conflicts with manual delete.
Solution: DROP the two catalog_images FK constraints, delete manually, then ADD them back.
catalog_app user cannot disable system triggers — must use constraint drop/add approach.

---

## 🐛 KNOWN ISSUES

### Database
1. **catalog_images dual FK problem** — has both `product_id` (CASCADE) and `catalog_product_id` (NO ACTION) pointing to catalog_products. The CASCADE fires during catalog_products delete and conflicts with manual pre-delete. Fix: drop both FKs before bulk delete, restore after. Document this pattern for future deletes.
2. **Lock contention** — Next.js dev server holds AccessShareLocks on catalog_products. Stop dev server before running bulk deletes/alters.
3. **NOT IN subquery performance** — `WHERE sku NOT IN (SELECT sku FROM catalog_allowlist)` hangs on 479K rows. Always use `NOT EXISTS` or temp table pattern instead.
4. **catalog_app permission** — Cannot `DISABLE TRIGGER ALL` (superuser only). Use DROP/ADD constraint pattern instead.

### Pipeline Gaps (root causes TBD)
1. WPS: 122,192 in vendor_products, only 7,948 in catalog_products — promotion script ran incomplete
2. PU: 173,741 in vendor_products, only 70,124 in catalog_products
3. WPS/PU vendor_code in vendor.vendor_products is lowercase ('wps', 'pu') — joins must use lowercase

### Pricing
1. PU: 70,124 products with zero pricing — pu_pricing has the data (151,497 rows) but not joined to catalog_pricing

### Search Coverage
1. 9,699 HD-brand products in catalog_products not in catalog_allowlist — invisible to search
2. Typesense index is stale — needs rebuild after all fixes

---

## 📝 LESSONS LEARNED

### Excel Data Extraction
**Pattern:** `re.search(r'"(http[^"]+)"', str(cell.value))` — openpyxl raw cell.value + regex

### Bulk Delete Safety Pattern
```sql
-- 1. Build temp table of IDs (avoids repeated subquery evaluation)
CREATE TEMP TABLE ids_to_delete AS SELECT id FROM ... WHERE ...;
CREATE INDEX ON ids_to_delete(id);
SELECT COUNT(*) FROM ids_to_delete; -- verify before proceeding

-- 2. Begin transaction
BEGIN;

-- 3. Drop non-cascade FKs that will block
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_product_id_fkey;
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_catalog_product_id_fkey;

-- 4. Delete dependent tables (NO ACTION FKs first, then CASCADE children)
DELETE FROM vendor_offers WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM map_audit_log WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM routing_decisions WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_images WHERE product_id IN (SELECT id FROM ids_to_delete);
-- ... other children ...

-- 5. Delete main table
DELETE FROM catalog_products WHERE id IN (SELECT id FROM ids_to_delete);

-- 6. Restore FKs
ALTER TABLE catalog_images ADD CONSTRAINT catalog_images_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_products(id) ON DELETE CASCADE;
ALTER TABLE catalog_images ADD CONSTRAINT catalog_images_catalog_product_id_fkey
  FOREIGN KEY (catalog_product_id) REFERENCES catalog_products(id);

-- 7. Verify counts, then COMMIT
```

### Performance Rules
- Never use `NOT IN (subquery)` on large tables — use `NOT EXISTS` or temp tables
- Stop Next.js dev server before bulk DDL/DML — it holds read locks
- `catalog_app` is not superuser — cannot DISABLE TRIGGER ALL
- Kill blocking PIDs with `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE ...`

### vendor.vendor_products casing
vendor_code is stored lowercase: 'wps' and 'pu' — not 'WPS'/'PU'
catalog_products.source_vendor is also lowercase: 'wps' and 'pu'

---

## 🎯 NEXT SESSION PRIORITIES

1. **Fix allowlist** — INSERT 9,699 orphaned HD products into catalog_allowlist
2. **Fix PU pricing** — JOIN pu_pricing → catalog_pricing for 70,124 products
3. **Investigate WPS pipeline gap** — why only 7,948/122,192 promoted, fix promotion
4. **Investigate PU pipeline gap** — why only 70,124/173,741 promoted
5. **Rebuild catalog_unified** — after catalog_products stabilizes
6. **Consolidate image tables** — catalog_images → catalog_media, drop legacy

---

## 🔗 KEY RESOURCES

### Database
- Connection: `postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog`
- SSH: `ssh stinkdb`

### Documentation
- Master Reference: `StinkinSupplies_MasterRef_April16.md`
- Catalog Filter Rules: `StinkinSupplies_CatalogFilter_Doc.docx`
- Build Tracker: This file

### Git
- Branch: `claude/wizardly-perlman`
- PR: https://github.com/Stinkin-Supplies/pb/pull/new/claude/wizardly-perlman
- Project: `/Users/home/Desktop/Stinkin-Supplies`

---

*Build Tracker maintained by Claude — Last update: April 16, 2026*
