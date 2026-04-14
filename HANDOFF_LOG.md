# Handoff Log

Use this file as the root-level record of changes, verification, and follow-up items.

## Entry Template

```md
## YYYY-MM-DD

### Summary
- Short description of the change set.

### Changed Files
- `path/to/file.ext`
- `path/to/other-file.ext`

### Details
- What was changed and why.
- Any important implementation notes or constraints.

### Verification
- Commands run.
- Build/test results.

### Open Items
- Remaining work.
- Risks or assumptions.
```

## Current State

- `/shop` now opens the Harley-first experience.
- `/shop/classic` preserves the legacy catalog grid.
- `/harley` is available as a dedicated Harley-focused landing route.
- `npm run build` currently passes.
- Live cloud database audit artifacts were generated in the repo root:
  - `DB_AUDIT_REPORT.md`
  - `DB_SAMPLE_ROWS.json`
- The current implementation direction is to make Harley-first shopping the main flow while preserving the classic catalog fallback until verification is complete.

## Database Audit Summary

- Live DB schemas currently in use: `public` and `vendor`.
- User tables discovered: 51 total.
- Top row-count tables are concentrated in catalog, staging, and normalization layers:
  - `public.catalog_inventory`
  - `public.catalog_allowlist`
  - `public.catalog_specs`
  - `vendor.vendor_products`
  - `public.catalog_product_enrichment`
  - `vendor.pu_pricefile_staging`
  - `public.pu_products`
  - `public.pu_pricing`
  - `public.catalog_unified`
  - `public.product_group_members`
  - `public.product_groups`
  - `public.catalog_pricing`
  - `public.raw_vendor_wps_products`
  - `public.catalog_products`
  - `public.pu_brand_enrichment`
- Core relational integrity exists, but a lot of cleanup still depends on app conventions and import pipelines rather than foreign keys alone.
- The canonical customer-facing layer is still `catalog_unified`, with `catalog_products`, `vendor_products`, `vendor_offers`, `catalog_specs`, and `catalog_inventory` feeding it.

## Cleanup Priorities

- Normalize and backfill `catalog_unified` where fields are null-heavy:
  - `category`
  - `image_url`
  - `fitment_year_start`
  - `fitment_year_end`
  - `display_brand`
  - `manufacturer_brand`
- Improve product identity coverage in `catalog_products`:
  - `manufacturer_part_number`
  - `oem_part_number`
  - brand naming consistency
- Fix linkage gaps in `product_group_members` so group rows resolve to canonical products more often.
- Materialize pricing consistently so `vendor_offers.computed_price` is not effectively empty.
- Treat raw/staging tables as source history, not customer-facing truth, and avoid cleaning them destructively.
- For Harley-specific accuracy, add exact submodel enrichment on top of the existing generic fitment layer instead of replacing it.

## Harley Shop Direction

- The shop should become Harley-first without losing the existing catalog flow.
- Two browsing modes are required:
  - exact fitment search by year + submodel
  - style browsing for broader product discovery
- The desired style set includes:
  - chopper
  - touring
  - Evo
  - Shovelhead
  - Panhead
  - Softail
  - Sportster
  - Dyna
  - FXR
  - M8
  - Big Twin
- Product scope should stay limited to the two approved catalogs:
  - Parts Unlimited: `oldbook` and `fatbook`
  - WPS: `HardDrive`
- Duplicate display should be handled in the unified catalog layer, not only in the UI.
- The four requested animations remain part of the target implementation:
  - layered stack for style selection
  - expandable cards for categories
  - shared layout product detail
  - corner nav for related categories

## Recommended Next Build Steps

- Enrich fitment with a companion `catalog_submodels` table for JP Cycles-style submodel precision.
- Keep `catalog_fitment` as the generic base layer.
- Add or confirm API routes for styles, submodels, categories, products, exact-products, and related categories.
- Keep `/shop/classic` available until browser verification confirms the Harley-first flow is stable.
- Once verified, decide whether to retire the fallback path or keep it as a hidden support route.

## 2026-04-14

### Summary
- Fixed broken build issues in the products API route, product detail page, and shop client prerender state.

### Changed Files
- `app/api/products/route.ts`
- `app/shop/[slug]/ProductDetailClient.jsx`
- `app/shop/ShopClient.jsx`

### Details
- Rebuilt `app/api/products/route.ts` into a valid GET handler after the file was left in a broken merged state.
- Removed stale and duplicated control flow from the products API route.
- Fixed JSX parsing in `app/shop/[slug]/ProductDetailClient.jsx` by removing stray closing tags.
- Removed the duplicate `activeTab` state declaration in `ProductDetailClient.jsx`.
- Added missing `openSections` state in `app/shop/ShopClient.jsx` so category/shop pages can prerender without crashing.

### Verification
- `npm run build` completed successfully.
- Prior failures were:
  - syntax errors in `app/api/products/route.ts`
  - JSX parse issues in `app/shop/[slug]/ProductDetailClient.jsx`
  - missing `openSections` state during prerender on `/shop/category/[category]`

### Open Items
- The repo contains Typesense and OEM cross-reference scaffolding, but external execution steps against Postgres and Typesense cannot be confirmed from the filesystem alone.
- Append future implementation notes here when changing core catalog, search, sync, or admin flows.

## 2026-04-14 Harley Shop Swap

### Summary
- Replaced the default `/shop` experience with a Harley-first shop flow while keeping the legacy grid available.

### Changed Files
- `app/shop/page.jsx`
- `app/shop/classic/page.jsx`
- `app/harley/page.tsx`
- `app/harley/HarleySearchClient.tsx`
- `app/api/harley2/styles/route.ts`
- `app/api/harley2/style-models/route.ts`
- `app/api/harley2/style-products/route.ts`
- `app/api/harley2/submodels/route.ts`
- `app/api/harley2/products/route.ts`
- `app/api/harley2/exact-products/route.ts`
- `lib/harley/config.ts`
- `lib/harley/catalog.ts`

### Details
- The new shop experience starts with a Harley style stack, then drills into model, submodel, and category browsing.
- Existing `/shop` now defaults to the Harley-first flow.
- The legacy catalog grid remains available at `/shop/classic` and via `?view=classic`.
- Harley fitment routes now read from the existing vehicle and catalog tables instead of placeholder packages.
- Product detail uses a shared-layout modal transition.

### Verification
- `npm run build` completed successfully after the Harley swap.

### Open Items
- The Harley experience is now wired, but the exact fitment behavior still depends on how much submodel data exists in the `vehicles` and catalog fitment tables.
- If you want, the next step is browser-level review and small layout polish after you inspect `/shop` and `/shop/classic`.
