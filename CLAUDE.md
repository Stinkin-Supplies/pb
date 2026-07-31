# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

# Catalog pipeline (all require CATALOG_DATABASE_URL in .env.local)
npm run setup:db     # Apply SQL migrations (migration_add_oem_table.sql)
npm run typesense:recreate   # Drop + recreate Typesense schema
npm run typesense:index      # Full catalog index to Typesense
npm run typesense:index-test # Index first 100 products (smoke test)
npm run verify               # Verify env + DB connections

# Run ingest scripts directly (most default to dry-run; pass --apply to write)
npx dotenv -e .env.local -- node scripts/ingest/<script>.mjs
# Exception: build_variant_groups.cjs defaults LIVE — pass --dry to preview
```

## Architecture

**Two separate databases:**
- **Supabase** (`@supabase/supabase-js`) — auth, user profiles, orders, cart, audit log. Clients in `lib/supabase/{client,server,admin}.ts`. Types in `lib/supabase/types.ts`.
- **Catalog Postgres** (`pg` Pool, `CATALOG_DATABASE_URL`) — all product/catalog data. Singleton pool in `lib/db/catalog.ts`. Primary query layer in `lib/db/browse.ts`.

**Typesense** (self-hosted Hetzner Docker) — full-text search. Client + filter builder in `lib/typesense/client.ts`. Used only as a pre-filter: returns matching product IDs, which are then passed to Postgres as `tsIds`.

**Three vendor sources** merge into `catalog_unified`:
- `pu_catalog` — Parts Unlimited (PU). **PU rows join on `sku`, not `vendor_sku`** — `vendor_sku` is frequently empty for PU.
- `wps_catalog` — Western Power Sports
- `vtwin_catalog` — V-Twin Manufacturing

`scripts/ingest/sync_catalog_unified.mjs` rebuilds `catalog_unified` from these three tables (upsert-only, never truncates, dry-run by default).

## Browse / Search Flow

`app/browse/page.jsx` (client) → `app/api/browse/products/route.ts` → two parallel paths:
1. If `?q=` present: Typesense search (3s timeout, falls back on failure) → returns product IDs
2. `lib/db/browse.ts::browseProducts()` — Postgres query with filters, facets, DISTINCT ON dedup

**Dedup key priority** (see `DEDUP_KEY` in `lib/db/browse.ts`): `variant_group_id` → `canonical_product_id` → brand+name color-strip → unique fallback. `variant_group_id` always wins over `canonical_product_id` to protect known-good variant splits.

**OEM chain matching**: when `year` + `modelCode` filters are active, `fetchChainProductIds()` pre-fetches products reachable via `mv_oem_fitment_coverage` + `catalog_oem_crossref` supersession chains.

## Key Database Tables

| Table | Purpose |
|---|---|
| `catalog_unified` | Primary product table (~97K rows). Has `display_category`, `display_subcategory`, `display_subcategory_detail` (3-tier taxonomy) |
| `catalog_fitment_v2` | Fitment rows (~3.2M). Sources: PU (`pu_fitment_expanded`), WPS, VTwin scrape, OEM catalog promotion |
| `product_fitment_year_model` | Compressed year-range fitment (~786K rows). Rebuilt by `build_fitment_year_ranges.cjs` |
| `catalog_oem_crossref` | OEM part number ↔ product links (~43K rows). `oem_format` distinguishes `hd_oem`, `hd_oem_nodash`, etc. |
| `canonical_products` | Cross-vendor dedup anchors (~91K rows). Linked via `catalog_unified.canonical_product_id` |
| `catalog_variant_groups` / `catalog_variant_members` | Variant grouping for color/size families |
| `harley_families`, `harley_models`, `harley_model_years` | HD model hierarchy for fitment resolution |
| `oem_supersession` | HD OEM part number supersession chains (283 rows, survived TRUNCATE incident) |

## Routing / Fulfillment

`lib/routing/` — offer scoring logic for multi-vendor fulfillment. `lib/fulfillment/optimizer.ts` selects vendor(s) for an order; `lib/fulfillment/triggerFulfillment.ts` fires the actual vendor order.

## Environment Variables

Required in `.env.local`:
- `CATALOG_DATABASE_URL` — direct Postgres connection to the catalog DB (Hetzner)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
- `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`/`TYPESENSE_SEARCH_KEY`, `TYPESENSE_COLLECTION`
- `ADMIN_SECRET` — token for admin-only routes
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Vendor API keys: `WPS_API_KEY`, `PARTS_UNLIMITED_*`

## Active Recovery Work

`CATALOG_RECOVERY_PLAN.md` — documents a 2026-07-18 TRUNCATE incident and recovery status. As of 2026-07-20 the catalog is largely restored. Remaining gaps:

1. **Phase 3** — ~6,794 `catalog_unified` rows (post-snapshot additions) have `display_category` only, no subcategory. Run `rebuild_*_taxonomy.mjs` for affected categories scoped to `WHERE display_subcategory IS NULL`.
2. **Phase 9** — full Typesense reindex needed (fitment/crossref data landed after last index).
3. **WPS refresh** — blocked on missing source files (`scripts/data/wps/master_item_wps.csv`, `scripts/data/wps/Catalogs/hdmstr_with_urls.csv`).

**Do not run** `import_oem_crossref.js` (unguarded TRUNCATE) or `import_vtwin_fitment_full.mjs` (deletes good data, wrong schema) — both are confirmed broken.
