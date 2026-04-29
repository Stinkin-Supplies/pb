# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 29, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

1. **Complete catalog_unified population** — 44,343 PU + 37,538 VTwin + 378 WPS missing
2. **Migrate catalog_fitment_v2 FK** — drop FK to catalog_products, add FK to catalog_unified
3. **Run VTwin fitment migration** — script ready at scripts/ingest/migrate_vtwin_fitment_to_v2.js
4. **PU ACES fitment files** — request from PU rep (30% → 70%+)
5. **Expand model_alias_map** — add FLTRX, FXDB, FLHTK, FLSTF, FLHRC, FXDWG

---

## ✅ DONE APRIL 29

| Task | Result |
|------|--------|
| Homepage redesign | Era cards + category grid + corner nav + floating header |
| lib/eras/config.ts | 9 eras with year_min/year_max for Sportster split |
| app/era/[slug]/page.jsx | Era landing page, side panel filters, product grid |
| lib/db/browse.ts | Multi-family, universal, yearMin/yearMax, dbCategories |
| api/browse/products/route.ts | Passes families[], year_min, year_max, dbCategory[] |
| app/layout.tsx | Bebas Neue + Share Tech Mono via next/font/google |
| /shop → /browse | All references updated, shop directory deleted |
| migrate_vtwin_fitment_to_v2.js | Script written, blocked on FK migration |
| knucklehead.webp | Live on homepage era card |

---

## ✅ DONE APRIL 27

| Task | Result |
|------|--------|
| Phase 10 complete | catalog_fitment → catalog_fitment_archived, all routes on v2 |
| 6 ingest scripts retired | Moved to scripts/ingest/_retired/ |
| api/fitment/route.ts | HD-only, non-Harley paths removed |
| api/products/route.ts | Non-Harley fitment block removed |
| api/harley2/style-products/route.ts | Rewritten for catalog_fitment_v2 |
| app/browse/[slug]/page.jsx | Fitment reads from catalog_fitment_readable |

---

## 🔴 HIGH PRIORITY

### Complete catalog_unified
Frontend reads ONLY from catalog_unified. Currently missing:
- 44,343 PU products
- 37,538 VTwin products
- 378 WPS products

Until complete, era pages show limited products and fitment FK cannot be migrated.

### Migrate catalog_fitment_v2 FK
Current: product_id → catalog_products.id
Target:  product_id → catalog_unified.id

Safe migration once unified is complete:
```sql
UPDATE catalog_fitment_v2 cfv
SET product_id = cu.id
FROM catalog_unified cu
JOIN catalog_products cp ON cp.sku = cu.sku
WHERE cfv.product_id = cp.id;

ALTER TABLE catalog_fitment_v2 DROP CONSTRAINT catalog_fitment_v2_product_id_fkey;
ALTER TABLE catalog_fitment_v2 ADD CONSTRAINT catalog_fitment_v2_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
```

### VTwin fitment migration
Script: `scripts/ingest/migrate_vtwin_fitment_to_v2.js`
Blocked until FK migration above is complete.
Expected: ~521,000 new rows across Softail, Dyna, Touring, Sportster, FXR.

### PU ACES fitment files
30% → 70%+ fitment coverage for PU. Request from PU rep.

---

## 🔵 LOW PRIORITY / FUTURE

### Era images remaining (800×600px min, WebP, landscape)
```
public/images/eras/panhead.webp
public/images/eras/ironhead-sportster.webp
public/images/eras/shovelhead.webp
public/images/eras/evolution.webp
public/images/eras/evo-sportster.webp
public/images/eras/twin-cam.webp
public/images/eras/milwaukee-8.webp
public/images/eras/chopper.webp
```

### My Garage audit
Built against /shop — review now that /browse is canonical.

### Expand model_alias_map
```sql
INSERT INTO model_alias_map (alias_text, model_family, model_code, priority)
VALUES ('fltrx', 'touring', 'FLTRX', 9), ('fxdb', 'dyna', 'FXDB', 9),
       ('flhtk', 'touring', 'FLHTK', 9), ('flstf', 'softail', 'FLSTF', 9),
       ('flhrc', 'touring', 'FLHRC', 9), ('fxdwg', 'dyna', 'FXDWG', 9);
```

### WPS FatBook PDF OEM extraction
### Tire catalog images — tire_master_image.xlsx not processed
### Fix import_pu_brand_xml.js — remove dead cuOEM UPDATE block
### IMG_CACHE_DIR — set in .env.local on Hetzner

---

## 📊 CURRENT STATE (End of April 29)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows (INCOMPLETE) |
| — WPS | 26,754 |
| — PU | 24,009 |
| — VTwin | 37,749 |
| catalog_products | ~95,484 rows |
| Typesense indexed | 88,301 |
| catalog_fitment_archived | 26,008 rows (legacy) |
| catalog_fitment_v2 | 3,048,726 rows |
| — FK points to | catalog_products.id (needs migration) |
| harley_families | 15 |
| harley_models | 158 |
| harley_model_years | 1,415 rows |
| Era pages | 9 eras live at /era/[slug] |
| Homepage | Live — era cards + category grid + corner nav |
| Fonts | Bebas Neue + Share Tech Mono live |

---

## 🏗️ ARCHITECTURE VISION

Each vendor has their own catalog for daily price updates:
- `catalog_wps` — WPS native format
- `catalog_pu` — PU native format
- `catalog_vtwin` — VTwin native format

All flow into `catalog_unified` — the ONLY table the frontend reads.
`catalog_fitment_v2.product_id` must reference `catalog_unified.id`.

Current reality: catalog_unified is incomplete, FK still on catalog_products.

---

*Updated: April 29, 2026*
