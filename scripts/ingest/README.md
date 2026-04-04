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
npx dotenv -e .env.local -- node ingest/pipeline.js --from 0
```

## Pipeline Stages

### Stage 0: Raw Import
Imports D00108_DealerPrice.csv into `raw_vendor_pu` table as JSONB batches.

```bash
npx dotenv -e .env.local -- node ingest/stage0-pu-dealerprice.cjs
```

Notes:
- Stage 0 writes to the catalog database via `CATALOG_DATABASE_URL`.
- Stages 1-3 also use `CATALOG_DATABASE_URL` (Hetzner).

### Stage 1: Normalization
Maps PU fields to canonical schema:
- `catalog_products` - Parent products
- `vendor_offers` - Pricing & stock
- `catalog_specs` - Product attributes

```bash
npx dotenv -e .env.local -- node ingest/normalize_pu.js
```

### Stage 2: Computed Values
Calculates:
- `our_price` with MAP compliance
- `computed_price` for storefront
- Marks discontinued products

```bash
npx dotenv -e .env.local -- node ingest/computed_values.js
```

### Stage 3: Typesense Index
Builds search index with:
- Weighted search fields (name:10, brand:5, sku:3)
- Facets (brand, category, fitment)
- Price & stock sorting

```bash
npx dotenv -e .env.local -- node ingest/index_assembly.js
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
npx dotenv -e .env.local -- node ingest/pipeline.js

# Start from Stage 1
npx dotenv -e .env.local -- node ingest/pipeline.js --from 1

# Run only Stage 3 (reindex)
npx dotenv -e .env.local -- node ingest/pipeline.js --stage 3

# Force clean reindex
rm .stage3_checkpoint.json
npx dotenv -e .env.local -- node ingest/pipeline.js --stage 3 --recreate
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
