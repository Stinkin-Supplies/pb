# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 18, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

1. **Verify images are actually loading on live site** — API confirmed returning correct `/api/img?u=...` URLs but browser rendering needs confirmation. Check DevTools Network tab on `/shop`.
2. **Rebuild `catalog_unified`** — still has pre-deletion data (~2,869 deleted products). Run:
   ```sql
   -- rebuild script (from original pipeline)
   ```
3. **Check `normalizeHarleyProductRow`** in `lib/harley/catalog.ts` — uses `image_url` from `catalog_unified`; may need to use `proxyImageUrl()` on it like the search route does
4. **Confirm `catalog_unified.computed_price` column exists** — Harley products route uses it for ORDER BY

---

## ✅ DONE APRIL 18

| Task | Result |
|------|--------|
| Rebuilt ShopClient filter sidebar | 4 sections: Fitment, Category, Brand, Price Range |
| Fixed `setFiltersState` → `setFilters` bug | Filter clicks now work |
| Removed duplicate filter sections (Availability ×2, Fitment ×2) | Clean sidebar |
| Fixed $0.00 prices | `computed_price` field in Typesense |
| Fixed image double-proxy | `primary_image` field used directly |
| Deleted Apparel / Helmets / Jackets / Footwear / Pants / Tracks | ~2,869 products gone |
| Reindexed Typesense | 91,531 indexed, 0 failed |
| Deleted stale `app/route.ts` | Build error fixed |
| Fixed Harley shop zero results | `dbCategories` mapping in config.ts |
| Fixed Harley shop pricing | `computed_price` instead of `msrp` |
| Fixed Harley shop sort | in_stock DESC, stock_quantity DESC |
| Added `computed_price` price filter in buildFilters | Was using `msrp` |

---

## ✅ DONE APRIL 17

| Task | Result |
|------|--------|
| Reindexed Typesense (start of session) | 94,400 indexed, 0 failed |
| OEM crossref expansion | 19 → **93,548 rows** |
| catalog_images migration | 21,075 rows → catalog_media, table dropped |
| catalog_media | 38K → **58,544 rows** |
| Products with images | 31,130 → **44,508** |
| nginx client_max_body_size | 1MB → 20MB |
| catalog_product_enrichment orphan cleanup | 172,656 → **77,023 rows** |
| Fitment extraction pipeline | **18,653 rows / 7,256 products** |
| LeMans image proxy built | `/api/img` route working |
| Description backfill | 80,273 / 98,353 (82%) |
| internal_sku generated for all products | 0 NULL remaining |

---

## 🔴 HIGH PRIORITY

### catalog_unified rebuild needed
- ~2,869 deleted products still in catalog_unified
- Harley shop queries catalog_unified directly — may return deleted products
- Need to rebuild or at minimum: `DELETE FROM catalog_unified WHERE sku NOT IN (SELECT sku FROM catalog_products WHERE is_active = true)`

### Image rendering on live site
- API confirmed returning `/api/img?u=...` URLs correctly
- Browser-side rendering still unconfirmed — need screenshot of live `/shop`
- If still broken: check Next.js `next.config.js` for allowed image domains

### 9 PU products with NULL computed_price
```sql
SELECT sku, brand, name, msrp, cost, map_price
FROM catalog_products
WHERE computed_price IS NULL AND is_active = true;
```

---

## 🔵 LOW PRIORITY / FUTURE

### Tire catalog images
- `tire_master_image.xlsx` not yet processed
- Same Python HYPERLINK extraction as HardDrive catalog

### WPS FatBook PDF OEM extraction
- WPS side of catalog_oem_crossref still sparse

### catalog_fitment sparse (7.7% coverage)
- Pre-existing rows have messy model name variants (FXRT Sport Glide, TLE SIDECAR, etc.)
- Low urgency — main families clean

### IMG_CACHE_DIR persistence
- Set `IMG_CACHE_DIR=/var/cache/stinkin-images` in `.env.local` on Hetzner
- Makes proxy cache persist across server restarts

### computed_price facetable in Typesense
- Currently `facet: false` — can't show price range hint
- To fix: update Typesense collection schema, reindex
- Low priority — price filter inputs work without it

---

## 📊 CURRENT STATE (End of April 18)

| Metric | Value |
|--------|-------|
| catalog_products | ~95,484 |
| WPS in catalog | 27,219 (100% priced) |
| PU in catalog | ~68,265 (99.99% priced) |
| catalog_unified | 94,400 (stale — needs rebuild) |
| Typesense indexed | **91,531** |
| Products with images | ~44,508 |
| catalog_media | 58,544 rows |
| catalog_oem_crossref | 93,548 rows |
| catalog_fitment | 18,653 rows / 7,256 products |
| Search | ✅ Working |
| Prices | ✅ Fixed |
| Filter sidebar | ✅ Rebuilt |
| Harley shop categories | ✅ Fixed |

---

## 📋 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table |
| `DISABLE TRIGGER ALL` denied | catalog_app not superuser |
| Next.js holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps'/'pu' |
| catalog_unified source_vendor | UPPERCASE 'WPS'/'PU' |
| pu_products.map_price | VARCHAR 'Y'/'N' flag — not a price |
| PU SKU format | Punctuated in catalog (1401-1193), plain in pu_pricing (14011193) |
| Typesense on hotspot | Fails — needs stable WiFi |
| Typesense batch size | 1000 docs/batch safe (nginx 20MB limit) |
| catalog_unified not a view | Regular table — TRUNCATE + INSERT to rebuild |
| catalog_fitment unique index | NULLS NOT DISTINCT — safe to re-run extract_fitment.js |
| FXR ≠ Dyna | FXR = rubber-mount 1982-1994, Dyna = FXD 1991-2017 |
| M8 = Milwaukee-Eight | 2017+ Touring, 2018+ Softail, 2021+ Sportster S |
| Typesense `primary_image` field | Already proxied — do NOT run proxyImageUrl() on it again |
| vendor_offers non-cascade | Must DELETE vendor_offers before DELETE catalog_products |
| Harley category slugs | Map to multiple DB categories via `dbCategories[]` in config.ts |

---

*Updated: April 18, 2026 — end of session*
