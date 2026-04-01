# Stinkin' Supplies App Folder Breakdown

This document maps the repo structure and explains what each folder is for.
It is based on the current codebase layout and the main app routes/services.

## High-Level Shape

Stinkin' Supplies is a Next.js storefront with:

- a customer-facing shop, search, checkout, account, and brand experience
- an admin dashboard for operational workflows
- API routes for catalog, cart, checkout, sync, webhooks, and cron jobs
- a support layer in `lib/` for database, vendors, routing, images, mail, and search
- ingest and migration tooling for loading product, pricing, image, and vendor data

## Top-Level Folder Map

```text
.
├── app/                  # Next.js App Router pages, layouts, and API routes
├── components/           # Shared client-side UI building blocks
├── lib/                  # Server-side helpers, integrations, and business logic
├── public/               # Static images, icons, and brand assets
├── scripts/              # Import, sync, and maintenance scripts
├── catalog-migrations/   # SQL migrations for the catalog schema
├── phase2-exports/       # CSV outputs from catalog validation / reporting
├── tmp/                  # Temporary vendor files and working data
├── supabase/             # Supabase local config and project helpers
├── route.ts              # Root route proxy/handler
├── proxy.ts              # Proxy middleware-style logic
├── next.config.ts        # Next.js configuration
├── tsconfig*.json        # TypeScript config files
└── package.json          # App scripts and dependencies
```

## `app/` - Routes, Pages, and API Endpoints

This is the heart of the Next.js app. It contains both UI routes and API routes.

### Core shell

- `app/layout.tsx`
  - Global document shell
  - Loads fonts
  - Wraps the app in `CartRoot`
  - Enables Vercel Analytics and Speed Insights
- `app/globals.css`
  - Global styles shared across the app
- `app/page.jsx`
  - Home page
  - Uses the visual storefront landing layout
  - Includes category cards, promos, featured products, and fitment messaging

### Storefront pages

- `app/shop/`
  - Main product listing experience
  - `page.jsx` fetches the first product page server-side
  - `ShopClient.jsx` handles filtering, pagination, and interaction on the client
  - `ShopClient.d.ts` documents the client component props/types
- `app/shop/[slug]/`
  - Product detail pages for individual SKUs
  - `ProductDetailClient.jsx` handles interactive product detail behavior
- `app/shop/category/[category]/`
  - Category-specific browse pages
- `app/search/`
  - Search page and `SearchClient.jsx`
- `app/brands/`
  - Brand directory page
  - `app/brands/[slug]/page.jsx` brand detail page
- `app/deals/page.jsx`
  - Deals and promotions landing page
- `app/garage/`
  - Fitment / vehicle garage experience
  - `GarageHub.jsx` powers the garage UI
- `app/checkout/`
  - Checkout flow
  - `success/page.jsx` confirmation page after checkout
- `app/account/`
  - Customer account hub
  - `orders/`, `points/`, `wishlist/` for account subfeatures
- `app/order/[id]/`
  - Order detail / order lookup page
- `app/auth/`
  - Authentication entry point
  - `callback/route.js` OAuth/auth callback handling
- `app/roadmap/page.tsx`
  - Internal roadmap or planning page

### Admin area

- `app/admin/`
  - Internal admin dashboard and tools
  - `page.jsx` main dashboard
  - `layout.jsx` admin shell
  - `orders/`, `backorders/`, `build-tracker/`, `map/`, `sync/`
  - Each subfolder is a specialized operational screen

### API routes

These are the backend endpoints used by the UI, integrations, and cron jobs.

- `app/api/products/route.ts`
  - Core catalog filtering and pagination endpoint
  - Returns product lists plus facets
- `app/api/search/route.ts`
  - Search endpoint for storefront queries
- `app/api/brands/route.ts`
  - Brand listing endpoint
- `app/api/brands/[slug]/route.ts`
  - Single-brand lookup endpoint
- `app/api/cart/`
  - `ensure/route.ts` and `merge/route.ts` for guest/cart identity handling
- `app/api/checkout/`
  - `create-session/route.ts` and `create-order/route.ts`
  - Stripe checkout session and order creation
- `app/api/stripe/create-intent/route.ts`
  - Stripe payment intent support
- `app/api/webhooks/stripe/route.ts`
  - Stripe webhook receiver
- `app/api/webhooks/wps/route.ts`
  - WPS webhook receiver
- `app/api/vendors/`
  - Vendor-specific sync, inventory, pricing, and order routes
- `app/api/admin/`
  - Admin-only maintenance endpoints
  - Includes sync, map, reindex, build-tracker, import-pies, and price sync routes
- `app/api/cron/restock-notify/route.ts`
  - Scheduled restock notification job
- `app/api/notifications/restock/route.ts`
  - Notification trigger endpoint
- `app/api/image-proxy/route.ts`
  - Image proxy/rewriter for catalog assets
- `app/api/routing/offers/route.ts`
  - Offer routing endpoint used by pricing / fulfillment logic
- `app/api/catalog-test/route.ts`
  - Validation or testing endpoint for catalog data

## `components/` - Shared UI Building Blocks

These are reusable client components used across storefront and account pages.

- `NavBar.jsx`
  - Primary site navigation
- `CartRoot.jsx`
  - Top-level cart provider / wrapper
- `CartContext.jsx`
  - Cart state management
- `CartDrawer.jsx`
  - Slide-out cart UI
- `AddressAutocomplete.jsx`
  - Address lookup and autocomplete helper
- `NotifyMeButton.tsx`
  - Restock notification CTA

## `lib/` - Business Logic, Integrations, and Utilities

This folder is the application’s backend support layer.

### Data access and catalog

- `lib/db/catalog.ts`
  - Catalog database connection / query helper
- `lib/guestCart.ts`
  - Guest cart persistence and merge logic
- `lib/getProductImage.ts`
  - Image resolution helper for products
- `lib/mergeProductImages.ts`
  - Image merge/cleanup utilities

### Routing and fulfillment

- `lib/routing/types.ts`
  - Routing type definitions
- `lib/routing/scoreOffers.ts`
  - Offer scoring logic for routing or ranking offers
- `lib/map/engine.ts`
  - Mapping / compliance engine used by routing and storefront logic

### Vendor integrations

- `lib/vendors/pu.ts`
  - Parts Unlimited integration entrypoint
- `lib/vendors/pu/adapter.ts`
  - Parts Unlimited data adapter
- `lib/vendors/wps.ts`
  - WPS integration entrypoint
- `lib/vendors/wps/adapter.ts`
  - WPS data adapter
- `lib/vendors/wps/checkRestockNotifications.ts`
  - Restock alert helper for WPS inventory changes
- `lib/vendors/partsUnlimited.js`
  - Parts Unlimited legacy helper or adapter glue

### Search and indexing

- `lib/typesense/client.ts`
  - Typesense client setup

### Supabase

- `lib/supabase/client.ts`
  - Browser/client-side Supabase setup
- `lib/supabase/server.ts`
  - Server-side Supabase setup
- `lib/supabase/admin.ts`
  - Admin/service-role Supabase client
- `lib/supabase/types.ts`
  - Generated or shared database types
- Other `lib/supabase/*` files
  - Version markers and project metadata used by the local Supabase workflow

### Messaging and utilities

- `lib/email/sendOrderEmail.ts`
  - Order confirmation / notification email sender
- `lib/utils/money.ts`
  - Money formatting helpers
- `lib/imageProxy.ts`
  - Image URL proxy helper
- `lib/images/cleanImageUrls.js`
  - Image sanitation / normalization script helper
- `lib/stubs/speed-insights-next.tsx`
  - Local stub for Speed Insights in environments where the real component is unavailable

## `scripts/` - Import, Sync, and Maintenance Jobs

The `scripts/` folder is where the heavy data work happens.

### Ingest pipeline

- `scripts/ingest/`
  - Vendor import and sync utilities
  - Parses XML, CSV, ZIP, and price files
  - Contains both one-off scripts and repeatable ingestion steps
- `scripts/ingest/pu-extracted/`
  - Extracted vendor XML data by brand
- `scripts/ingest/pu-zips/`
  - Raw vendor ZIP archives and price file bundles
- `scripts/ingest/node_modules/`
  - Local package install for the ingest subproject
  - Usually treated as generated content

### Other script areas

- `scripts/sql/`
  - SQL utilities and verification scripts
- `scripts/data/`
  - Supporting data used by scripts
- `scripts/phase2-images.js`
  - Image processing / import stage
- `scripts/indexTypesense.ts`
  - Builds or refreshes the search index
- `scripts/importPuPies.ts`
  - Parts Unlimited PIES import
- `scripts/pu-ingest.js`
  - Main Parts Unlimited ingest script

### Ingest subproject files

Inside `scripts/ingest/`, the files are split by function:

- import scripts
  - `pu-import-prices.js`
  - `pu-xml-import.js`
  - `wps-import-images.js`
  - `wps-master-item-import.js`
  - `importPuPriceFile.js`
- phase scripts
  - `phase2-merge.js`
  - `phase2-offers.js`
  - `phase2-descriptions.js`
  - `phase2-images.js`
- diagnostics and checks
  - `preflight.js`
  - `debug-insert.js`
  - `test-insert.js`
- sync helpers
  - `pu-price-sync-route.ts`
  - `wps-ingest.js`

## `catalog-migrations/` - Database Schema History

These SQL files build the catalog and vendor data model in stages.

Suggested reading order:

1. `001_init_schemas.sql`
2. `002_vendor_core_tables.sql`
3. `003_vendor_inventory_tables.sql`
4. `004_vendor_fitment_tables.sql`
5. `005_vendor_categories.sql`
6. `006_vendor_sync_and_error_logs.sql`
7. `007_catalog_core_tables.sql`
8. `008_catalog_images.sql`
9. `009_catalog_fitment.sql`
10. `010_vendor_offers.sql`
11. `011_pricing_rules.sql`
12. `012_routing_engine_tables.sql`
13. `013_typesense_helpers.sql`
14. `014_indexes_and_constraints.sql`
15. `015_initial_seed_data.sql`
16. `016_vendor_products_wps_columns.sql`
17. `017_vendor_products_unique_constraint.sql`
18. `018_vendor_inventory_unique_constraint.sql`
19. `019_vendor_indexes.sql`
20. `023_pricing_function.sql`
21. `024_map_compliance.sql`
22. `025_routing_engine.sql`
23. `026_storefront_rewire.sql`
24. `027_pu_pricefile_staging.sql`

What this means:

- early migrations define the schema foundation
- middle migrations add catalog, image, fitment, pricing, and routing support
- later migrations add constraints, indexes, helper functions, and storefront rewiring
- the newest migrations support vendor price-file staging and routing improvements

## `public/` - Static Assets

Static files used by the storefront UI.

- `public/icons/`
  - Category icons such as tires, exhaust, brakes, engine, seats, lighting, and handlebars
- `public/brands/`
  - Brand logos
- `public/images/`
  - Shared images like placeholders
- Root SVGs
  - Next.js starter assets retained in the project

## `supabase/` - Local Supabase Setup

This folder holds local Supabase config and project metadata.

- `supabase/config.toml`
  - Local Supabase configuration
- Other metadata files
  - Project/version markers used by the Supabase CLI workflow

## Root Configuration Files

These files control the build and runtime environment:

- `next.config.ts`
  - Next.js configuration
- `proxy.ts`
  - Proxy or middleware-style request handling
- `route.ts`
  - Root route handler
- `eslint.config.mjs`
  - Linting rules
- `postcss.config.mjs`
  - CSS processing
- `docker-compose.yml`
  - Local service orchestration
- `vercel.json`
  - Vercel deployment config
- `tsconfig.json`
  - Main TypeScript config
- `tsconfig.scripts.json`
  - Separate TypeScript config for scripts
- `package.json`
  - App scripts and dependencies

## Data / Working Files

These folders are mostly for generated data, diagnostics, and local workflow support.

- `phase2-exports/`
  - CSV outputs from data validation and reporting
- `tmp/`
  - Temporary price-file inputs and working files
- `scripts/ingest/pu-zips/`
  - Raw vendor source ZIP archives
- `scripts/ingest/pu-extracted/`
  - Extracted vendor source files

## How The Pieces Fit Together

1. `scripts/` and `catalog-migrations/` bring vendor and catalog data into the database.
2. `lib/` provides shared access to that data, search, routing, and vendor logic.
3. `app/` renders the storefront, account, and admin experience on top of those services.
4. `app/api/` powers dynamic filters, checkout, vendor sync, webhooks, and scheduled tasks.
5. `components/` contains reusable client-side UI used by the pages.

## Quick Mental Model

- If it is a page or route, look in `app/`
- If it is reusable UI, look in `components/`
- If it is business logic or integration code, look in `lib/`
- If it is import/sync/maintenance, look in `scripts/`
- If it is schema history, look in `catalog-migrations/`
- If it is a static image or icon, look in `public/`

