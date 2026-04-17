# Stinkin' Supplies — Build Tracker
**Last Updated:** April 16, 2026 — END OF SESSION
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Reindex needed after pricing fixes

---

## 🎯 SESSION COMPLETE — MAJOR REMEDIATION DONE

---

## ✅ ALL COMPLETED THIS SESSION (April 16)

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
- [x] Loaded 62,065 PU dealer prices into catalog_pricing
- [x] Computed prices via punctuated SKU join for 43 additional products
- [x] Computed prices from msrp/cost for 584 more PU products
- [x] WPS computed_price: **27,219/27,219 = 100%**
- [x] PU computed_price: **67,172/67,181 = 99.99%** (9 products truly unpriceable)
- [x] Pricing formula: map_protected (margin_min=10%, margin_target=25%, msrp_ceiling)

### Images
- [x] Fixed index_assembly.js INNER JOIN → LEFT JOIN
- [x] Added 1,538 PU images from pu_brand_enrichment.image_uri
- [x] 31,130 products with images in catalog_media

### catalog_unified — REBUILT
- [x] Truncated stale 138,872-row table
- [x] Rebuilt: 94,400 rows (WPS: 27,219 | PU: 67,181)
- [x] Inventory aggregated from 7 warehouses
- [x] image_url from catalog_media, features from pu_brand_enrichment

### Search — FIXED & VERIFIED
- [x] Fixed lib/typesense/client.ts query_by (removed description, oem_part_number, upc)
- [x] Fixed lib/typesense/client.ts facet_by (removed 10 invalid fields)
- [x] Fixed lib/typesense/client.ts buildFilters (removed hardcoded is_active:true)
- [x] Fixed app/api/search/route.ts (removed sort_priority from sortMap + default)
- [x] Fixed scripts/lib/db.js connectionTimeoutMillis 5000 → 30000
- [x] Search verified: Drag Specialties 7,394 | S&S Cycle 1,389 | Shinko 515 | Zero metric results

### Typesense
- [x] Last index: 94,400 products, 0 failed
- [ ] **NEEDS REINDEX** — pricing fixes after last index, reindex to pick up computed_price updates

---

## 🚀 FIRST THING NEXT SESSION

```bash
# 1. Reindex Typesense to pick up all pricing updates
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```

Then tackle these in order (see CHASE_LIST.md):
1. OEM cross-reference expansion — quick win, one SQL INSERT
2. catalog_images legacy consolidation → catalog_media, drop table
3. Fitment extraction pipeline

---

## 📊 FINAL METRICS (April 16)

| Metric | Value |
|--------|-------|
| catalog_products | 98,353 |
| — WPS | 27,219 (100% priced) |
| — PU | 71,134 (99.99% priced) |
| catalog_unified | 94,400 (fresh) |
| Typesense indexed | 94,400 (needs reindex for price updates) |
| Products with images | 31,130 |
| catalog_pricing WPS | 27,219 (100%) |
| catalog_pricing PU | 62,065 (87%+) |
| computed_price WPS | 27,219 (100%) |
| computed_price PU | 67,172 (99.99%) |
| catalog_allowlist | 494K+ rows |
| catalog_inventory | 697,796 rows |
| catalog_fitment | 11,891 rows (~12%) |
| catalog_oem_crossref | 19 rows |

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
- catalog_media = canonical (not catalog_images — legacy, to be dropped)
- WPS: from vendor.vendor_products.images_raw JSON
- PU: from pu_brand_enrichment.image_uri

### catalog_unified Rebuild
```sql
TRUNCATE catalog_unified;
INSERT INTO catalog_unified (...) SELECT ...
FROM catalog_products cp
LEFT JOIN (inventory rollup) inv ON inv.sku = cp.sku
LEFT JOIN pu_brand_enrichment pbe ON pbe.sku = cp.sku
WHERE cp.is_active = true;
```

### PU SKU Format
- catalog_products.sku uses PUNCTUATED format (e.g. 1401-1193)
- pu_pricing.part_number uses PLAIN format (e.g. 14011193)
- pu_pricing.punctuated_part_number matches catalog format
- Always join via punctuated_part_number for pricing lookups

### PU drop_ship_eligible
- ALL PU products false — flag is unreliable, ignore for promotions

---

## 🔧 KEY COMMANDS

```bash
# Reindex Typesense (stable WiFi required — hotspot drops parallel queries)
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"

# Rebuild allowlist
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs

# DB
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
ssh stinkdb
```

### Bulk Delete Pattern
```sql
CREATE TEMP TABLE ids_to_delete AS SELECT id FROM catalog_products WHERE ...;
CREATE INDEX ON ids_to_delete(id);
BEGIN;
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_product_id_fkey;
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_catalog_product_id_fkey;
DELETE FROM vendor_offers WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM map_audit_log WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM routing_decisions WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_images WHERE product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_images WHERE catalog_product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_media WHERE product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_specs WHERE product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_fitment WHERE product_id IN (SELECT id FROM ids_to_delete);
DELETE FROM catalog_products WHERE id IN (SELECT id FROM ids_to_delete);
ALTER TABLE catalog_images ADD CONSTRAINT catalog_images_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_products(id) ON DELETE CASCADE;
ALTER TABLE catalog_images ADD CONSTRAINT catalog_images_catalog_product_id_fkey
  FOREIGN KEY (catalog_product_id) REFERENCES catalog_products(id);
COMMIT;
```

---

## 🐛 KNOWN ISSUES

1. **9 PU products with NULL computed_price** — no pricing data anywhere, genuinely unpriceable
2. **catalog_images legacy table** — dual FK, needs migration to catalog_media then DROP
3. **catalog_fitment sparse** — 12% coverage, needs extraction pipeline
4. **catalog_oem_crossref** — 19 rows, needs expansion
5. **Typesense indexer** — sensitive to flaky connections (Promise.all 4 parallel queries). Use stable WiFi.
6. **catalog_app not superuser** — cannot DISABLE TRIGGER ALL

---

## 🔗 RESOURCES

- DB: `postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog`
- SSH: `ssh stinkdb`
- Master Reference: `StinkinSupplies_MasterRef_April16.md`
- Chase List: `CHASE_LIST.md`
- Catalog Filter Rules: `StinkinSupplies_CatalogFilter_Doc.docx`
- Git Branch: `claude/wizardly-perlman`
- Project: `/Users/home/Desktop/Stinkin-Supplies`

---

*Build Tracker — Last update: April 16, 2026 end of session*
