# Stinkin' Supplies — Session Handoff
**Date:** April 30, 2026 (third pass)
**Status:** ✅ Flathead era live | ✅ PDP rich content deployed | ✅ 10 eras with real counts | ⏳ WPS fitment files | ⏳ Flathead era image

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,512 docs (reindexed April 30, pricing current)
- **Browse search** — param bug fixed, search works across name/brand/sku/oem
- **Fitment filtering** — catalog_fitment_v2 (~3,163,382 rows) — FK points to catalog_unified
- **Fitment dropdowns** — /api/fitment HD-only, canonical tables
- **Pricing** — Daily price sync live, MAP compliant, WPS + PU
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — 10 eras live at /era/[slug], all with real product counts
- **Era images** — 9/10 WebP images live (flathead.webp missing)
- **Flathead era** — 3,803 products, V/U/W-series + Servi-Car, 1930–1952
- **Old iron** — Knucklehead 2,745 / Panhead 3,224 / Shovelhead 6,310
- **Chopper/Universal** — 3,630 products, 311 flagged is_universal
- **PDP** — Multi-image gallery, special_instructions block, VTwin-only products resolve
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body)
- **Browse** — /browse replaces /shop everywhere
- **Admin** — /admin/products live
- **Production** — https://stinksupp.vercel.app
- **PU images** — 23,975 / 24,009 products have image_url (99.9%)
- **PU dual images** — 8,310 products have image_urls array with 2 images
- **Special instructions** — 970 PU products display gold instruction block on PDP

---

## 📦 WHAT WAS DONE THIS SESSION (April 30 — third pass)

### Flathead Era
Built out the full pre-Knucklehead flathead era from scratch:

**DB:**
- Added `Flathead` family to `harley_families` (1930–1952)
- Added 12 models: V, VC, VL, VLD, VLH, VD, U, UH, UL, ULH, WL, G (Servi-Car)
- Added 86 `harley_model_years` rows
- Added Flathead entry to `hd_family_engine_map`

**Fitment inference:**
- Added Flathead keyword rules to `infer_fitment_staging.js`:
  - `flathead`, `side valve`, `servi-car`, `\bULH\b`, `\bWLA\b`, `hummer side valve`
- Re-ran inference — 3,851 Flathead staging rows generated
- Promoted: 24,124 fitment rows → catalog_fitment_v2 (0 conflicts — all new)
- Result: 3,803 Flathead products in catalog_fitment_v2

**Era config:**
- Added `flathead` era to `lib/eras/config.ts` (before Knucklehead, accent #6b7c5a)
- Still needs `public/images/eras/flathead.webp`

### PDP Rich Content
- Added `cu.image_urls` and `cu.special_instructions` to both SQL SELECTs in `app/browse/[slug]/page.jsx`
- Gallery now merges `catalog_media` images + `image_urls` from PU enrichment (deduped, media first)
- `special_instructions` column added to `catalog_unified` via `ALTER TABLE`
- 970 rows synced from `pu_products.special_instructions`
- Gold `special-instructions` block added to `ProductDetailClient.jsx` — renders when not null

---

## 🚨 CURRENT ISSUES

### Issue 1 — Flathead era image missing
`public/images/eras/flathead.webp` not yet created. Era page works but shows no hero image.

### Issue 2 — WPS fitment files pending
Contacted rep April 30. Once received, run fitment extraction and insert into catalog_fitment_v2.

### Issue 3 — Low-confidence staging rows pending
~500 products with `confidence='low'`, `status='pending'` in `fitment_staging`.
Displacement-inference rows — not yet reviewed or promoted.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **WPS fitment files** — ingest once received
2. **My Garage audit** — built against /shop, needs review for /browse
3. **Low-confidence fitment review** — ~500 pending rows
4. **Flathead era image** — drop flathead.webp in public/images/eras/

---

## 🏗️ INFRASTRUCTURE (unchanged)

```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.126.nip.io)
Vercel:     epluris-projects/pb → https://stinksupp.vercel.app
Cron:       0 3 * * * daily_price_sync.js (Hetzner)
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| catalog_fitment_v2 FK | Now points to catalog_unified.id ✅ |
| vendor_offers FK | Now points to catalog_unified.id ✅ |
| harley_families — no slug column | Use name for all joins |
| Flathead family name | Exact string: `'Flathead'` — covers V/U/W/G series |
| VTwin family names in DB | Softail Evo, Softail M8 — NOT "Softail" or "Big Twin" |
| Era config family names | Must match harley_families.name exactly |
| harley_models requires start_year/end_year | NOT NULL — always include both |
| PU duplicate SKUs | 1001-0018 and 10010018 both exist — use DISTINCT ON cu.id in joins |
| PU map_price | pu_pricing.suggested_retail = MAP for PU |
| WPS map_price | cu.map_price on catalog_unified |
| MSRP < MAP | Handled by GREATEST(…, map_price) in pricing formula |
| Daily price sync | scripts/ingest/daily_price_sync.js — bulk SQL |
| Price sync cron | 0 3 * * * on Hetzner, logs to /var/log/price_sync.log |
| PU XML format detection | Detect by root tag: `<root>` = Catalog Content, else PIES |
| PU enrich script | scripts/ingest/enrich_pu_products.cjs <xml_dir> |
| special_instructions | On catalog_unified (synced from pu_products) — not on pu_products directly |
| Fitment staging | scripts/ingest/infer_fitment_staging.js --replace |
| Fitment promotion | scripts/ingest/promote_fitment_staging.js --confidence high --dry-run |
| OEM year decode | Strict HD OEM format only (NNNNN-YY) — rejects Mikuni jets, cable lengths |
| CATALOG_DATABASE_URL | Must be set — no fallback, throws if missing |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| Era image blend | mixBlendMode: "screen", opacity: 0.9 for dark backgrounds |
| Sportster split | yearMin/yearMax in era config splits Ironhead vs Evo |
| DATABASE_URL not persistent | export each session |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| catalog_fitment archived | catalog_fitment_archived — do not write to it |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| vendor_code casing | Always lowercase ('wps'/'pu') |
| source_vendor casing | Always UPPERCASE ('WPS'/'PU'/'VTWIN') |
| catalog_fitment_v2 columns | id, product_id, model_year_id, created_at, fitment_source, confidence_score, parsed_snapshot — NO source_notes |

## 🖼️ ERA IMAGES STATUS
```
public/images/eras/flathead.webp        ← STILL NEEDED
public/images/eras/knucklehead.webp     ✅
public/images/eras/panhead.webp         ✅
public/images/eras/ironhead-sportster.webp ✅
public/images/eras/shovelhead.webp      ✅
public/images/eras/evolution.webp       ✅
public/images/eras/evo-sportster.webp   ✅
public/images/eras/twin-cam.webp        ✅
public/images/eras/milwaukee-8.webp     ✅
public/images/eras/chopper.webp         ✅
```
