# Stinkin' Supplies - Catalog Ingestion Pipeline

4-stage pipeline for normalizing Parts Unlimited (PU) catalog data for Tire, Oldbook, and Fatbook catalogs.

## Quick Start

```bash
# 1. Install dependencies
cd scripts && npm install

# 2. Ensure your .env.local has:
# CATALOG_DATABASE_URL=...   # Hetzner catalog Postgres (raw_vendor_* + catalog tables)
# TYPESENSE_HOST=...
# TYPESENSE_ADMIN_KEY=...

# 3. Run SQL migrations first (in Supabase SQL Editor)
# See: sql/migrations-100-110.sql

# 4. Run the full pipeline
node scripts/ingest/pipeline.js --from 0
```

## Pipeline Stages

### Stage 0: Raw Import
Imports D00108_DealerPrice.csv into `raw_vendor_pu` table as JSONB batches.

```bash
node scripts/ingest/stage0-pu-dealerprice.cjs
```

Notes:
- Stage 0 writes to the catalog database via `CATALOG_DATABASE_URL`.
- Stages 1-3 also use `CATALOG_DATABASE_URL` (Hetzner).

Additional raw imports (optional but recommended):

```bash
# ACES fitment feeds (XML) -> raw_vendor_aces
npx dotenv -e .env.local -- node scripts/ingest/stage0-aces.cjs

# WPS vehicle fitment (API) -> raw_vendor_wps_vehicles + catalog_fitment
# Requires WPS_API_KEY. This is how you get structured make/model/year.
npx dotenv -e .env.local -- node scripts/ingest/stage0-wps-fitment.js

# PIES attribute feeds (XML) -> raw_vendor_pies
npx dotenv -e .env.local -- node scripts/ingest/stage0-pies.cjs
```

### Stage 1: Normalization
Maps PU fields to canonical schema:
- `catalog_products` - Parent products
- `vendor_offers` - Pricing & stock
- `catalog_specs` - Product attributes

```bash
node scripts/ingest/normalize_pu.js
```

Resume safety:
- Stage 1 writes a checkpoint to `scripts/ingest/.stage1_pu_checkpoint.json` every few seconds.
- Re-run the same command to resume after a stop/crash.
- Use `--reset` to discard the checkpoint, or `--no-resume` to ignore it for a single run.
 - Resume is batch-based (safe boundary): it finishes the current batch transaction, then saves.

### Stage 2: Computed Values
Calculates:
- `our_price` with MAP compliance
- `computed_price` for storefront
- Marks discontinued products

```bash
node scripts/ingest/computed_values.js
```

Optional denormalization for faster Stage 3 indexing:
- Stage 2 can also refresh a denormalized cache table (`catalog_product_search_cache`)
  that precomputes specs/fitment/media blobs used by Stage 3.
- Enable it with `STAGE2_BUILD_SEARCH_CACHE=1` after applying migration
  `catalog-migrations/113_catalog_product_search_cache.sql`.

### Stage 3: Typesense Index
Builds search index with:
- Weighted search fields (name:10, brand:5, sku:3)
- Facets (brand, category, fitment)
- Price & stock sorting

```bash
node scripts/ingest/index_assembly.js
```

Throughput tuning:
- Increase worker concurrency: `INDEX_CONCURRENCY=8 node scripts/ingest/index_assembly.js`
- Allow each worker to keep multiple Typesense imports in-flight (advanced):
  `INDEX_INFLIGHT=2 node scripts/ingest/index_assembly.js`
- Flags also work: `node scripts/ingest/index_assembly.js --concurrency 8 --inflight 2 --batch-size 2000`
- If you see `OUT_OF_MEMORY` rejects from Typesense, lower load:
  `INDEX_BATCH_SIZE=500 INDEX_CONCURRENCY=2 INDEX_INFLIGHT=1 node scripts/ingest/index_assembly.js`

Low-memory Typesense mode (recommended when OOM persists):
- Build a lightweight index that disables heavy facets (specs/fitment) entirely:
  `INDEX_PROFILE=core INDEX_COLLECTION=products_core node scripts/ingest/index_assembly.js --recreate`
- Then run your app search against `products_core`.
  Later, you can add a second `products_metadata` collection if you want heavy filters.

## Phase 1 Baseline (Known-Good)

This section documents the Phase 1 baseline that is known to work reliably on a memory-constrained
Typesense node. Treat it as a locked reference.

Do NOT change for the baseline:
- allocator config (`MALLOC_ARENA_MAX`)
- Stage 3 batch handling logic (split/slim/skip OOM behavior)
- the core ingestion flow (Stages 0 → 1 → 2 → 3)

### Typesense (Self-Hosted on Hetzner)

Run Typesense in Docker (example: Hetzner `ubuntu-4gb-ash-2`). This is the baseline runtime:

```bash
sudo mkdir -p /opt/typesense-data

docker rm -f typesense 2>/dev/null || true

docker run -d --name typesense \
  --restart unless-stopped \
  -p 8108:8108 \
  -v /opt/typesense-data:/data \
  -e MALLOC_ARENA_MAX=2 \
  --memory=3g --memory-swap=3g \
  typesense/typesense:30.1 \
  --data-dir /data \
  --api-key=xyz \
  --listen-port 8108 \
  --listen-address 0.0.0.0 \
  --enable-cors

curl -s http://127.0.0.1:8108/health
```

Notes:
- This baseline uses **HTTP** on port `8108`.
- Ensure your firewall/security group allows inbound `8108` from wherever you run indexing.

### Mac `.env.local` (Indexing Client)

Set these in repo root `.env.local`:

```env
TYPESENSE_HOST="http://5.161.100.126:8108"
TYPESENSE_ADMIN_API_KEY="xyz"
TYPESENSE_API_KEY="xyz"
```

### Stage 3 Baseline Index Profile

Use the ultra-minimal schema/doc set:
- `INDEX_PROFILE=products_search`
- `INDEX_COLLECTION=products_search`
- Document includes only: `id,name,sku,brand,category,price,in_stock,image_url`
- Excludes: `specs,fitment_*,search_blob,description,slug,msrp`
- Facets limited to: `brand`, `category`, `in_stock`
- `image_url` is stored but not indexed

Baseline reindex command:

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_checkpoint.json
INDEX_PROFILE=products_search INDEX_COLLECTION=products_search INDEX_BATCH_SIZE=50 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

Baseline resume command (no recreate):

```bash
cd /Users/home/Desktop/Stinkin-Supplies
INDEX_PROFILE=products_search INDEX_COLLECTION=products_search INDEX_BATCH_SIZE=50 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3
```

Troubleshooting:
- `EPROTO ... packet length too long`: you are using HTTPS against an HTTP server.
  Fix by setting `TYPESENSE_HOST` to `http://...:8108`.
- `401 Forbidden - a valid x-typesense-api-key`: your `.env.local` key doesn't match Typesense `--api-key`.

## Incremental Add-Ons (Keep Baseline Locked)

Add features by creating a new collection with a new profile. Do not modify the baseline collection.

### Add `fitment_make` (max 10, deduped, normalized)

Profile:
- `INDEX_PROFILE=products_search_make`
- Adds `fitment_make` as `string[]` (non-faceted, non-indexed)
- Values are normalized to lowercase, trimmed, deduplicated, and capped to 10.

Recreate into a new collection:

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_checkpoint.json
INDEX_PROFILE=products_search_make INDEX_COLLECTION=products_search_make INDEX_BATCH_SIZE=50 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

### Add `description` (stored, non-indexed)

After validating `products_search_make` is stable and completes with no errors, you can add
`description` as a stored field that is not indexed (lower RAM).

Profile:
- `INDEX_PROFILE=products_search_make_desc`

Recreate into a new collection:

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_checkpoint.json
INDEX_PROFILE=products_search_make_desc INDEX_COLLECTION=products_search_make_desc INDEX_BATCH_SIZE=50 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

### Add `search_blob` (shortened, indexed, not stored)

After validating `products_search_make_desc` is stable, you can add a shortened `search_blob`
field for better search relevance.

Profile:
- `INDEX_PROFILE=products_search_make_desc_blob`

Behavior:
- `search_blob` is built from `name sku brand category fitment_make`
- capped to 200 chars
- `index: true`, `store: false`

Recreate into a new collection:

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_checkpoint.json
INDEX_PROFILE=products_search_make_desc_blob INDEX_COLLECTION=products_search_make_desc_blob INDEX_BATCH_SIZE=50 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

### Two-Collection Fitment Strategy (Recommended)

Instead of exploding `fitment_year` into large arrays on the primary product index, use:

1) Primary product index: summarized fitment (make/model arrays, year min/max)
2) Secondary `product_fitment` index: one doc per (product, make, model, year)

This enables a 2-step query:
- Step 1: query `product_fitment` with fitment filters to get `product_id`s
- Step 2: query your primary product collection filtered by `id:=[...]`

Optional: token lookup
- `product_fitment` also stores an indexed (not faceted) token: `make:model:year` (all normalized lowercase).
- You can query it via `q` on the `token` field (instead of `filter_by make/model/year`) to reduce query complexity.

Build both collections in one Stage 3 run:

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_checkpoint.json .stage3_fitment_checkpoint.json
INDEX_PROFILE=products_primary_fitment INDEX_COLLECTION=products_primary INDEX_BUILD_FITMENT_COLLECTION=true \
INDEX_FITMENT_COLLECTION=product_fitment INDEX_FITMENT_BATCH_SIZE=100 \
INDEX_BATCH_SIZE=100 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

Build / rebuild only the `product_fitment` collection (skip primary products):

```bash
cd /Users/home/Desktop/Stinkin-Supplies
rm -f .stage3_fitment_checkpoint.json
INDEX_ONLY_FITMENT_COLLECTION=true INDEX_BUILD_FITMENT_COLLECTION=true \
INDEX_FITMENT_COLLECTION=product_fitment INDEX_FITMENT_BATCH_SIZE=100 \
INDEX_BATCH_SIZE=100 INDEX_CONCURRENCY=1 INDEX_INFLIGHT=1 \
  node scripts/ingest/pipeline.js --stage 3 --recreate
```

## Catalog Allowlist

Filter to only Tire/Oldbook/Fatbook products:

```bash
npx dotenv -e .env.local -- node ingest/build-catalog-allowlist.js
```

This creates the `catalog_allowlist` table used by Stage 3 to filter the Typesense index.

## Full Pipeline Commands

```bash
# Run all stages
node scripts/ingest/pipeline.js

# Start from Stage 1
node scripts/ingest/pipeline.js --from 1

# Run only Stage 3 (reindex)
node scripts/ingest/pipeline.js --stage 3

# Force clean reindex
rm .stage3_checkpoint.json
node scripts/ingest/pipeline.js --stage 3 --recreate
```

## Data Flow

```
D00108_DealerPrice.csv
        ↓
[Stage 0] raw_vendor_pu (JSONB batches)
        ↓
[Stage 1] catalog_products + vendor_offers + catalog_specs
        ↓
[Stage 2] computed_price + our_price (MAP-compliant)
        ↓
[Allowlist] catalog_allowlist (Tire/Oldbook/Fatbook filter)
        ↓
[Stage 3] Typesense search index
```

## Target Catalogs

| Catalog | Code | Description |
|---------|------|-------------|
| Fatbook | 2 | Harley/V-Twin parts |
| Fatbook Mid-Year | 8 | Mid-year Fatbook updates |
| Tire | 10 | Tires, tubes, wheels |
| Oldbook | 11 | Vintage/classic parts |
| Oldbook Mid-Year | 12 | Mid-year Oldbook updates |
