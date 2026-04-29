# Stinkin' Supplies — Session Handoff
**Date:** April 29, 2026
**Status:** ✅ Homepage live | ✅ Era pages live | ✅ Fonts fixed | ⏳ catalog_unified incomplete | ⏳ fitment FK migration blocked

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,301 docs
- **Fitment filtering** — catalog_fitment_v2 (~3,048,726 rows)
- **Fitment dropdowns** — /api/fitment HD-only, canonical tables
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — /era/[slug] live for all 9 eras with side panel filters
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body) via next/font/google
- **Browse** — /browse replaces /shop everywhere
- **Admin** — /admin/products live
- **Production** — https://stinksupp.vercel.app

---

## 📦 WHAT WAS DONE THIS SESSION (April 29)

### Homepage Redesign
- Full page rebuilt at `app/page.jsx`
- Floating header — teal on load, dark on scroll, 52px height
- Era cards — full bleed background image, 50/50 text/image, accent color per era, parallax on scroll
- Shop by Part — 15 category cards with hover animation
- Corner nav — fixed bottom-right, fans out 4 links on click
- `mixBlendMode: "screen"` for era images on dark background

### Era System
- `lib/eras/config.ts` — 9 eras defined:
  - Knucklehead (1936–1947)
  - Panhead (1948–1965)
  - Ironhead Sportster (1957–1985)
  - Shovelhead (1966–1984)
  - Evolution (1984–1999)
  - Evo Sportster (1986–2021)
  - Twin Cam (1999–2017)
  - Milwaukee Eight (2017–present)
  - Chopper (Universal)
- `year_min`/`year_max` on each era to split shared families (Ironhead vs Evo Sportster both = "Sportster" family)
- `app/era/[slug]/page.jsx` — hero + side panel filters + product grid

### Browse API Updates
- `lib/db/browse.ts` — added `families[]`, `yearMin`, `yearMax`, `universal`, `dbCategories[]`
- `app/api/browse/products/route.ts` — passes all new params through

### Fonts
- `app/layout.tsx` — Bebas Neue (`--font-caesar`) + Share Tech Mono (`--font-stencil`)

### Shop → Browse Migration
- All `/shop` references replaced with `/browse` across codebase
- `app/shop/` directory deleted

### VTwin Fitment Migration (BLOCKED)
- Script written: `scripts/ingest/migrate_vtwin_fitment_to_v2.js`
- Blocked because `catalog_fitment_v2.product_id` FK points to `catalog_products`
- VTwin only exists in `catalog_unified`, not `catalog_products`
- Cannot migrate until: (1) catalog_unified is complete, (2) FK is remapped

---

## 🚨 CURRENT ISSUES

### Issue 1 — catalog_unified incomplete
Missing 44,343 PU + 37,538 VTwin + 378 WPS products.
Frontend reads only catalog_unified so these products are invisible to users.

### Issue 2 — catalog_fitment_v2 FK on wrong table
Points to `catalog_products.id` but should point to `catalog_unified.id`.
Blocks VTwin fitment migration and era page product counts.

### Issue 3 — Era pages show few products
Direct result of Issues 1 + 2. Knucklehead/Panhead especially sparse.

---

## 🗺️ NEXT SESSION PRIORITIES

1. Complete catalog_unified population (audit why 82k products are missing)
2. Migrate catalog_fitment_v2 FK to catalog_unified
3. Run VTwin fitment migration (~521k new rows)
4. Request PU ACES files from rep

---

## 🏗️ INFRASTRUCTURE (unchanged)

```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.126.nip.io)
Vercel:     epluris-projects/pb → https://stinksupp.vercel.app
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| catalog_fitment_v2 FK | Points to catalog_products — NOT catalog_unified (yet) |
| VTwin in catalog_unified only | No rows in catalog_products for VTwin |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| Era image blend | mixBlendMode: "screen", opacity: 0.9 for dark backgrounds |
| Sportster split | yearMin/yearMax in era config splits Ironhead vs Evo via hmy.year filter |
| harley_families no slug | Use name for all joins |
| DATABASE_URL not persistent | export each session |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| catalog_fitment archived | catalog_fitment_archived — do not write to it |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
