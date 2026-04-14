# Stinkin' Supplies - Session Handoff
**Date:** April 10, 2026  
**Status:** Unified catalog complete, Typesense indexed, ready for frontend build

---

## 🎯 CURRENT STATE

### Database Inventory
| Component | Count | Status |
|-----------|-------|--------|
| **WPS Products** | 96,522 | ✅ In catalog_unified |
| **PU Products (filtered)** | 81,431 | ✅ In pu_products_filtered (A/E/C codes only) |
| **PU Brand Enrichment** | 90,539 rows / 123 brands | ✅ pu_brand_enrichment |
| **PU Fitment** | 30,615 records | ✅ pu_fitment (16K Harley) |
| **Unified Catalog** | 138,872 products | ✅ catalog_unified |
| **Typesense Index** | 132,801 documents | ✅ Indexed on Hetzner Docker |
| **catalog_media** | 38,512 images | ✅ WPS images |

### Data Quality — catalog_unified
| Metric | Count | % |
|--------|-------|---|
| Total products | 138,872 | 100% |
| In stock | 93,958 | 68% |
| With image | 68,362 | 49% |
| With description | 115,818 | 83% |
| With features | 64,190 | 46% |
| With category (WPS only) | 96,522 | 70% |
| Harley fitment records | 8,129 | — |
| With year range | 4,627 | — |
| In Oldbook (H-D catalog) | 5,632 | — |
| In Fatbook (metric catalog) | 14,024 | — |
| Drag parts | 15,376 | — |

### Key Tables
```
✅ catalog_products          (96,522 WPS - original, untouched)
✅ pu_products_filtered       (81,431 PU - A/E/C product codes only, no discontinued)
✅ pu_brand_enrichment        (90,539 rows, 123 brands - PIES + Catalog Content formats)
✅ pu_fitment                 (30,615 fitment records parsed from names/features)
✅ catalog_unified            (138,872 merged products - THE SOURCE OF TRUTH)
✅ catalog_media              (38,512 WPS images)
✅ catalog_product_enrichment (172,656 WPS enrichment records)
```

---

## 🏗️ ARCHITECTURE

### Data Flow
```
WPS API → catalog_products → ┐
                              ├→ catalog_unified → Typesense [products]
PU CSV → pu_products_filtered → ┘
              ↕
    pu_brand_enrichment (XML catalogs)
              ↕
         pu_fitment (parsed fitment)
```

### Typesense
- **Host:** 5.161.100.126:8108 (Hetzner Docker, typesense/typesense:30.1)
- **API Key:** xyz (admin)
- **Search Key:** vqoStSHb9RWTsVIGPBR7EzTxchwAe7cX (frontend, read-only)
- **Collection:** products
- **Documents:** 132,801

### Typesense Facets Available
```
brand, category, source_vendor, product_code
in_stock, has_image, is_active, is_discontinued
is_harley_fitment, is_universal
fitment_year_start, fitment_hd_families, fitment_hd_models, fitment_hd_codes, fitment_other_makes
in_oldbook, in_fatbook, drag_part, closeout
has_map_policy, ad_policy, hazardous_code, truck_only, no_ship_ca
msrp (range filter)
```

---

## 📂 SCRIPTS — COMPLETE

### Location: `~/Desktop/Stinkin-Supplies/scripts/ingest/`

| Script | Status | Purpose |
|--------|--------|---------|
| `import_pu_brand_catalogs_WORKING.js` | ✅ Complete | Imports PIES + Catalog Content XML brand files |
| `import_pu_filtered.js` | ✅ Complete | Imports PU price file filtered to A/E/C product codes |
| `parse_fitment.js` | ✅ Complete | Parses fitment data from brand enrichment names/features |
| `merge_vendors.js` | ✅ Complete | Merges WPS + PU into catalog_unified |
| `index_unified.js` | ✅ Complete | Indexes catalog_unified into Typesense |
| `download_pu_pricefile.js` | ✅ Complete | Downloads fresh PU price file from API |
| `enrich_wps_batch.js` | ⏳ Background | WPS API enrichment (160/96K complete) |
| `progress_bar.js` | ✅ Utility | ProgressBar + BatchProgressBar classes |

### Data Files: `scripts/data/pu_pricefile/`
- `20260407pu-pricefile.csv` — original full PU catalog (152K rows)
- `oldbook-fatbook/BasePriceFile.csv` — filtered A/E/C catalog (85K rows)
- `oldbook-fatbook/D00108_PriceFile.csv` — dealer prices
- `*.xml` — 47+ brand XML catalogs (PIES + Catalog Content formats)

---

## 🚀 NEXT STEPS

### Step 1: Update Frontend API Routes (IMMEDIATE)
Three files need updating to query `catalog_unified` instead of `catalog_products`:
- `app/api/search/route.ts` — point Typesense at Hetzner host
- `app/api/products/route.ts` — query catalog_unified
- `lib/typesense/client.ts` — update host/key

**Typesense client config:**
```typescript
const client = new Typesense.Client({
  nodes: [{ host: '5.161.100.126', port: 8108, protocol: 'http' }],
  apiKey: process.env.TYPESENSE_SEARCH_KEY, // vqoStSHb9RWTsVIGPBR7EzTxchwAe7cX
  connectionTimeoutSeconds: 10,
});
```

**New search fields to expose:**
```typescript
query_by: 'name,brand,description,features,oem_part_number'
filter_by: 'is_active:true'
facet_by: 'brand,category,source_vendor,in_stock,is_harley_fitment,fitment_hd_families,in_oldbook,in_fatbook,drag_part'
sort_by: 'sort_priority:desc,_text_match:desc'
```

### Step 2: Add PU Categories
PU products have no categories — only WPS does. Options:
1. Use `drag_part` flag + `product_code` (A/E/C) as proxy categories
2. Run Claude API against product names to auto-categorize
3. Map brands to categories manually (e.g. all S&S Cycle = Engine)

### Step 3: Continue WPS Enrichment (Background)
```bash
node scripts/ingest/enrich_wps_batch.js
```
Currently: 160/96,522 WPS products with API attributes (0.7%)
Takes ~27 hours to complete all. Run in background via tmux.

### Step 4: Re-run Brand Enrichment When New XMLs Arrive
```bash
# Drop new XML files into scripts/data/pu_pricefile/
node scripts/ingest/import_pu_brand_catalogs_WORKING.js
# Then re-run fitment parser
node scripts/ingest/parse_fitment.js
# Then re-merge and reindex
node scripts/ingest/merge_vendors.js
node scripts/ingest/index_unified.js --recreate
```

### Step 5: Frontend Search Features to Build
- Year/model fitment filter (year_start/end range + hd_families facet)
- Drag Specialties section (filter: drag_part:true)
- Harley-Davidson section (filter: is_harley_fitment:true OR in_oldbook:true)
- In-stock only toggle (filter: in_stock:true)
- Brand facet sidebar
- Category facet sidebar (WPS products)

---

## 🔧 CREDENTIALS

### Hetzner Catalog DB
```
Host: 5.161.100.126
Port: 5432
Database: stinkin_catalog
User: catalog_app
Password: smelly
Connection: psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
SSH Alias: ssh stinkdb
SSH User: deploy / password: smelly
```

### Typesense (Hetzner Docker)
```
Host: 5.161.100.126
Port: 8108
Protocol: http
Admin Key: xyz
Search Key: vqoStSHb9RWTsVIGPBR7EzTxchwAe7cX
Collection: products
Container: typesense (docker)
```

### Parts Unlimited API
```
Dealer: D00108
Username: website
Password: Smelly26
API: https://dealer.parts-unlimited.com/api/quotes/v2/pricefile
```

### Vercel Env
All secrets in `.env.local` (pulled from Vercel). Key vars:
- `CATALOG_DATABASE_URL`
- `TYPESENSE_HOST` = 5.161.100.126
- `TYPESENSE_PORT` = 8108
- `TYPESENSE_PROTOCOL` = http
- `TYPESENSE_API_KEY` = xyz
- `TYPESENSE_SEARCH_KEY` = vqoStSHb9RWTsVIGPBR7EzTxchwAe7cX
- `WPS_API_KEY`, `STRIPE_*`, `SUPABASE_*`

---

## 📊 PU PRODUCT CODE REFERENCE
| Code | Category | Count |
|------|----------|-------|
| A | Street / Motorcycle | 38,400 |
| E | Drag Specialties | 39,255 |
| C | Common Parts (universal) | 7,821 |
| F | MX/Off-road | excluded |
| D | ATV | excluded |
| B | Snowmobile | excluded |
| G | Watercraft | excluded |

---

## 🔍 USEFUL QUERIES

```bash
# Catalog state
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
SELECT source_vendor, COUNT(*), COUNT(*) FILTER (WHERE in_stock) AS in_stock,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS with_image
FROM catalog_unified GROUP BY source_vendor;"

# Harley fitment products
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -c "
SELECT brand, COUNT(*) FROM catalog_unified
WHERE is_harley_fitment = true GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 20;"

# Test Typesense search
curl -s "http://5.161.100.126:8108/collections/products/documents/search?q=softail&query_by=name,brand,features&filter_by=is_harley_fitment:true&per_page=5" \
  -H "X-TYPESENSE-API-KEY: xyz"

# Reindex after data changes
cd ~/Desktop/Stinkin-Supplies
node scripts/ingest/index_unified.js --recreate
```

---

## ⚠️ KNOWN ISSUES / TECH DEBT

| Issue | Priority | Notes |
|-------|----------|-------|
| PU categories missing | HIGH | 42K PU products have no category |
| WPS enrichment 0.7% complete | MEDIUM | Run enrich_wps_batch.js in background |
| Fitment only 8K Harley records | MEDIUM | More brands need XML files |
| Image coverage 49% | MEDIUM | PU images are LeMans CDN URLs, some may be placeholders |
| Typesense HTTP not HTTPS | LOW | Fine for internal use, add SSL if exposed publicly |
| Brand name mismatches | LOW | Fixed K&N and Nelson-Rigg, others may exist |

---

## 📖 COMMANDS QUICK REFERENCE

```bash
# Database
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"

# Import new PU brand XMLs (drop in scripts/data/pu_pricefile/ first)
node scripts/ingest/import_pu_brand_catalogs_WORKING.js

# Re-parse fitment after new brands added
node scripts/ingest/parse_fitment.js

# Full re-merge (after any data changes)
node scripts/ingest/merge_vendors.js

# Reindex Typesense
node scripts/ingest/index_unified.js --recreate

# Download fresh PU price file
node scripts/ingest/download_pu_pricefile.js

# WPS enrichment (run repeatedly in background)
node scripts/ingest/enrich_wps_batch.js

# SSH to Hetzner
ssh stinkdb

# Check Typesense health
curl http://5.161.100.126:8108/health
```
