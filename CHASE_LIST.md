# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 18, 2026 — Twenty-First Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Fix STINKIN'' double apostrophe | browse/page.jsx topbar + any other instances |
| 2 | vendor_offers rebuild | Schema: catalog_product_id (int FK) + vendor_code. Use part_number_dupes.csv for routing |
| 3 | Product grid OEM badge | Badge on cards with oem_numbers. Hover=fitment popover. Mobile=bottom sheet |
| 4 | WPS fitment files | Pending from rep since April 30 — follow up |
| 5 | Category subcategory filter | Second-level filter row e.g. Lighting → Headlamps / Turn Signals / Tail Lights. Query DB for subcategory values per parent. |
| 6 | git add -A && git commit && git push | ModelShop, harley pages, era page, BottomNav fix, browse fix — all uncommitted |
| 7 | Run apply_category_labels.py | Script built, needs to run locally to apply labels + alpha sort to era + model pages |

---

## ✅ DONE MAY 18 — TWENTY-FIRST PASS

| Area | What Was Done |
|------|---------------|
| ModelShop.tsx | Rebuilt as industrial gold tile grid. Evolution removed (routes to /era/evolution instead). Tiles route to /harley/[slug]. New Sailor font. |
| ModelShop tile style | Added vintage metal inset border (layered box-shadow), hover lift effect, corner bracket ornaments, diagonal hatch texture, font sized to fill each tile. |
| harley/[family]/page.tsx | Built — fetches filter_groups from DB via /api/harley/[family]/models, renders industrial tiles with year range + product count. |
| harley/[family]/[model]/page.tsx | Built — product grid with two-row gold CategoryTabBar, year range filter in hero, breadcrumb, pagination. Uses HarleyProduct type + getCatalogDb(). |
| api/harley/[family]/models/route.ts | Built — returns filter_groups for a family slug with product counts and year ranges. Uses getCatalogDb(). params is Promise (Next.js 15+). |
| api/harley/[family]/[model]/products/route.ts | Built — products by filter_group + year filter + category filter. model_filter_groups cross-membership join. params is Promise. |
| harley_models DB cleanup | Fixed misassigned models: FXLR/FXLRS/FXLRST → Softail LOW_RIDER. FXSB/FXSBSE/FXSE → Softail. FXDRS → Dyna. FXRPF/FXRDG/FXEF → FXR. Trike models → TRIKE filter_group. FXWG/FXDG → SUPER_GLIDE. EL → Knucklehead. evolution_bigtwin → EVOLUTION filter_group. |
| Category cleanup DB | Merged: ELECTRONICS → ELECTRICAL SYSTEM GROUP. TIRE AND TUBE → WHEEL AND RIM. SISSY BAR → SEATING. GRAPHICS → MEDIA PRODUCTS. FENDER → FRAME AND BODY. LUGGAGE + TRANSPORTATION → SECURITY-COVERS-SHELTERS. RADIATOR → ENGINE. 32 categories → 24 categories. |
| Category labels | Built apply_category_labels.py — maps raw DB strings to clean display labels (Engine, Brakes, Controls & Bars, etc.) + alphabetical sort with All Parts pinned first. |
| CategoryTabBar | Rebuilt as two-row layout across era + model pages. Gold tiles, black text, active state = lighter top border. Applied to app/era/[slug]/page.jsx + app/harley/[family]/[model]/page.tsx. |
| Era page gap | Fixed — was BottomNav spacer div (height: 82 → 0) + sticky tab top: 52 → 0. Browse page had its own 52px sticky topbar causing the gap. |
| Era page coverage tiers | ERA_COVERAGE map: pending/limited/full. Knucklehead promoted to full after VTwin scan. VintagePendingState + LimitedBanner components built. |
| Era page accent color | All era.accent references replaced with hardcoded #c9a84c — no more green/orange on Milwaukee-8 etc. |
| NavBar.tsx shim | Created components/NavBar.tsx as re-export of BottomNav — fixed 8 broken imports across account/admin/brands/checkout/order pages. |
| Footer.tsx | Reduced padding, removed marginTop: auto, added 80px bottom padding to clear BottomNav pill. |
| BottomNav spacer | height: 82 → 0. Was creating gap at top of every page globally. |
| browse/page.jsx gap | Removed 24px top padding from product grid wrapper. |
| era-page.jsx sticky | top: 52 → 0 on CategoryTabBar sticky position. |
| harley model page sticky | top: 52 → 0. |
| harley_families routing conflicts | Removed [models] dynamic folder, stray page.tsx, old static models route that conflicted with [family] dynamic segment. |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| vendor_offers rebuild | Wiped by CASCADE — needed for fulfillment routing |
| Fix STINKIN'' double apostrophe | Still in production on browse page |
| Run apply_category_labels.py | Script ready at ~/Downloads/apply_category_labels.py |
| WPS fitment files | Pending from rep since April 30 |
| Category subcategory filter | Second drill-down level on category tabs |
| git commit everything | Large uncommitted changeset |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| VTwin fitment pipeline | vtwin_oem_crossref (12,278 pairs) → catalog_fitment_v2 |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products before full run |
| WPS vehicle scopes | Request vehicle:read + vehiclemodel:read from WPS for fitment data |
| PDP redesign | Light/gold/white theme — after fitment stable |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Cron jobs | Hold until stable |
| Reindex API dotenv fix | Bundle dotenv into Vercel Lambda or remove dependency |
| Expand fitment coverage | 17,431 products covered (20%). Need more OEM source data esp. vintage eras. |
| Panhead era coverage | 1 product — pending VTwin scan completion |
| Flathead era coverage | 26 products — limited, banner shown |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| flathead.webp | Still missing from public/images/eras/ |
