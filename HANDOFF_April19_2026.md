# Stinkin' Supplies - Session Handoff
**Date:** April 19, 2026
**Status:** ⚠️ NEEDS FIXES — catalog_unified has broken flags, images not showing in shop

---

## 🚨 CURRENT PROBLEMS (Fix These First)

### Problem 1: Wrong products showing in shop
**Root cause:** `drag_part`, `in_oldbook`, `in_fatbook` flags are `false` for most PU products in `catalog_unified`.
**Why:** `merge_vendors.js` joined on `p.sku_punctuated = e.sku` but most PU products in unified use raw `sku`, not punctuated.
**Evidence:**
```sql
SELECT COUNT(*) FROM catalog_unified WHERE drag_part = true;     -- returns ~3,951 (should be ~24,000)
SELECT COUNT(*) FROM catalog_unified WHERE in_oldbook = true;    -- returns ~2,519 (should be ~12,000)
SELECT COUNT(*) FROM catalog_unified WHERE in_fatbook = true;    -- returns ~20,402 (should be ~more)
SELECT COUNT(*) FROM pu_products_filtered WHERE drag_part = true; -- returns 36,622 (source of truth)
```
**Fix:** Re-run `merge_vendors.js` with correct join logic (see fix section below), OR run the SQL patch:
```sql
-- Patch 1: join by punctuated SKU
UPDATE catalog_unified cu
SET
  drag_part = p.drag_part,
  in_oldbook = (p.oldbook_year_page IS NOT NULL AND p.oldbook_year_page != '0'),
  in_fatbook = (p.fatbook_year_page IS NOT NULL AND p.fatbook_year_page != '0')
FROM pu_products_filtered p
WHERE cu.sku = p.sku_punctuated AND cu.source_vendor = 'PU';

-- Patch 2: join by raw SKU
UPDATE catalog_unified cu
SET
  drag_part = p.drag_part,
  in_oldbook = (p.oldbook_year_page IS NOT NULL AND p.oldbook_year_page != '0'),
  in_fatbook = (p.fatbook_year_page IS NOT NULL AND p.fatback_year_page != '0')
FROM pu_products_filtered p
WHERE cu.sku = p.sku AND cu.source_vendor = 'PU';
```
After patching, verify:
```sql
SELECT COUNT(*) FROM catalog_unified WHERE drag_part = true;  -- should be ~24K
```
Then reindex: `TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate`

### Problem 2: No images showing in shop
**Root cause:** `app/api/search/route.ts` normalizeProductDoc maps `doc.primary_image` but `catalog_unified` schema uses `image_url`.
**Fix already applied locally** (sed command already run):
```
doc.image_url ?? doc.primary_image  (instead of just doc.primary_image)
```
Also: LeMans images must go through `/api/img?u=` NOT `/api/image-proxy?url=`.
`proxyImageUrl()` in `lib/utils/image-proxy.ts` handles this routing correctly.
The `normalizeProductDoc` function in `search/route.ts` was NOT calling `proxyImageUrl()`.
**Fix:** In `app/api/search/route.ts` normalizeProductDoc:
```typescript
image:  proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
images: proxyImageUrls(doc.image_urls ?? doc.images ?? []),
```

### Problem 3: Typesense index has old schema
The Docker Typesense instance was originally running the OLD products schema (`computed_price`, `fitment_make`, `specs_blob`).
We reindexed it with `index_unified.js --recreate` which created the NEW schema.
**Current state:** 91,531 documents indexed with correct unified schema.
**Verify:** `curl -s "http://5.161.100.126:8108/collections/products" -H "X-TYPESENSE-API-KEY: xyz" | python3 -m json.tool | grep '"name"'`
Should show: `sku, slug, name, brand, category, msrp, in_stock, image_url, drag_part, in_oldbook, in_fatbook...`

---

## 🏗️ INFRASTRUCTURE

### Servers
```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb (user: deploy, password: smelly)
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  :8108  Docker container "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443   HTTPS proxy → Typesense (domain: 5.161.100.126.nip.io, SSL via Let's Encrypt)
```

### Vercel
```
Project:  epluris-projects/pb
URL:      https://stinksupp.vercel.app
Deploy:   npx vercel --prod
Key env vars:
  TYPESENSE_HOST=5.161.100.126.nip.io
  TYPESENSE_PORT=443
  TYPESENSE_PROTOCOL=https
  TYPESENSE_API_KEY=xyz
  TYPESENSE_SEARCH_KEY=xyz
  TYPESENSE_COLLECTION=products
  CATALOG_DATABASE_URL=postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog
```

---

## 📊 DATABASE STATE

### Tables
```
catalog_products          96,522 rows  — WPS original (untouched, source of truth for WPS)
pu_products_filtered      81,431 rows  — PU filtered to A/E/C product codes only
pu_brand_enrichment       90,539 rows  — Brand XML enrichment (123 brands)
pu_fitment                30,615 rows  — Fitment parsed from product names
catalog_unified          138,872 rows  — MERGED catalog (THE SHOP SOURCE OF TRUTH)
catalog_media             38,512 rows  — WPS product images
```

### catalog_unified schema (key columns)
```
sku, slug, source_vendor ('WPS' or 'PU'), product_code (A/E/C for PU)
name, brand, category (only WPS has categories)
msrp, cost, image_url, image_urls[]
in_stock, stock_quantity, warehouse_wi/ny/tx/nv/nc
drag_part, in_oldbook, in_fatbook    ← FLAGS ARE BROKEN, see Problem 1
is_harley_fitment, fitment_hd_families[], fitment_year_start/end
features[], description, oem_part_number
sort_priority, slug
```

### What should be in the shop
The shop should ONLY show:
- `drag_part = true` (Drag Specialties products) — ~24K products
- `in_oldbook = true` (Harley-Davidson catalog) — ~12K products  
- `in_fatbook = true` (Metric street catalog) — ~16K products

Default Typesense filter in `lib/typesense/client.ts`:
```typescript
filter_by: "is_active:true && (drag_part:true || in_oldbook:true || in_fatbook:true)"
```

---

## 📂 KEY SCRIPTS

All in `~/Desktop/Stinkin-Supplies/scripts/ingest/`

| Script | Purpose | Status |
|--------|---------|--------|
| `merge_vendors.js` | Merges WPS + PU → catalog_unified | ⚠️ Has SKU join bug for flags |
| `index_unified.js` | Indexes catalog_unified → Typesense | ✅ Working |
| `import_pu_brand_catalogs_WORKING.js` | Imports brand XML files | ✅ Working |
| `import_pu_filtered.js` | Imports PU price file (A/E/C only) | ✅ Working |
| `parse_fitment.js` | Parses fitment from product names | ✅ Working |
| `download_pu_pricefile.js` | Downloads fresh PU price file from API | ✅ Working |
| `progress_bar.js` | ProgressBar utility (always use this) | ✅ Working |

### merge_vendors.js bug
The PU phase of merge_vendors.js joins enrichment like this:
```javascript
LEFT JOIN pu_brand_enrichment e ON p.sku_punctuated = e.sku
```
But then sets flags from `p` (pu_products_filtered) correctly. The issue is the
drag_part/oldbook/fatbook flags from `p` aren't making it into `catalog_unified`.

Check these lines in merge_vendors.js:
```javascript
drag_part:  p.drag_part || false,
in_oldbook: !!p.oldbook_year_page && p.oldbook_year_page !== "0",
in_fatbook: !!p.fatbook_year_page && p.fatbook_year_page !== "0",
```
The `p.oldbook_year_page` field is VARCHAR in postgres — comes back as string "0" 
which is truthy in JS. Verify: add `console.log(typeof p.oldbook_year_page)` in script.

---

## 🌐 FRONTEND STATE

### What's working
- `/api/search` — Typesense search, correct response format
- `/api/img` — LeMans zip image extraction with disk cache (uses adm-zip)
- `/shop` — ShopClient loads, sidebar shows, filters work
- Harley/Drag/Oldbook toggles in sidebar

### What's broken
- Images not showing — `normalizeProductDoc` in `app/api/search/route.ts` maps wrong field
- Wrong products showing — flags bug (see Problem 1)

### Image proxy architecture
```
LeMans URLs → /api/img?u={url}     (adm-zip, disk cache, fast)
WPS URLs    → direct CDN redirect  (/api/image-proxy redirects to cdn.wpsstatic.com)
```
`lib/utils/image-proxy.ts` exports `proxyImageUrl()` and `proxyImageUrls()` — always use these.

### app/api/search/route.ts
The route was written for a `product_groups` collection but we're using `products` collection.
`IS_GROUPS_COLLECTION = false` is appended to `lib/typesense/client.ts`.
The `normalizeProductDoc()` function needs:
```typescript
image:  proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
images: proxyImageUrls(doc.image_urls ?? doc.images ?? []),
```

---

## 🔢 PU PRODUCT CODE REFERENCE
| Code | Type | Count in filtered |
|------|------|-------------------|
| A | Street/Motorcycle | 38,400 |
| E | Drag Specialties | 39,255 |
| C | Common Parts | 7,821 |

## PU API Credentials
```
Dealer:   D00108
Username: website  
Password: Smelly26
URL:      https://dealer.parts-unlimited.com/api/quotes/v2/pricefile
```

---

## ✅ STEP-BY-STEP FIX PLAN FOR NEXT SESSION

1. **Fix the flags in catalog_unified** (SQL patch, 2 min):
```bash
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
UPDATE catalog_unified cu
SET drag_part = p.drag_part,
    in_oldbook = (p.oldbook_year_page IS NOT NULL AND p.oldbook_year_page != '0'),
    in_fatbook = (p.fatbook_year_page IS NOT NULL AND p.fatbook_year_page != '0')
FROM pu_products_filtered p
WHERE (cu.sku = p.sku OR cu.sku = p.sku_punctuated)
  AND cu.source_vendor = 'PU';"
```

2. **Verify flags**:
```bash
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
SELECT COUNT(*) FILTER (WHERE drag_part) AS drag,
       COUNT(*) FILTER (WHERE in_oldbook) AS oldbook,
       COUNT(*) FILTER (WHERE in_fatbook) AS fatbook
FROM catalog_unified;"
# Should be: drag ~24K, oldbook ~12K, fatbook ~16K
```

3. **Reindex Typesense**:
```bash
cd ~/Desktop/Stinkin-Supplies
TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate
```

4. **Fix images in search route** — edit `app/api/search/route.ts`:
   Find `normalizeProductDoc` and update image lines to use `proxyImageUrl()`

5. **Deploy**:
```bash
npx vercel --prod
```

6. **Verify production**:
```bash
curl -s "https://stinksupp.vercel.app/api/search?q=*&per_page=3" | python3 -m json.tool | grep -E '"found"|"name"|"image"'
# Should show ~24K found, correct product names, image URLs starting with /api/img?u=
```

---

## 📖 QUICK COMMANDS
```bash
# SSH to Hetzner
ssh stinkdb

# Check Typesense
curl https://5.161.100.126.nip.io/health
sudo docker ps | grep typesense
sudo docker restart typesense

# DB connection
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"

# Reindex after data changes
cd ~/Desktop/Stinkin-Supplies
TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate

# Deploy to production
npx vercel --prod
```
