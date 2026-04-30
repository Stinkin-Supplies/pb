# Stinkin' Supplies — Session Handoff
**Date:** April 30, 2026 (second pass)
**Status:** ✅ Era pages verified | ✅ Fitment staging promoted | ✅ Old iron live | ✅ Browse bugs fixed | ⏳ PDP rich content | ⏳ WPS fitment files

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,512 docs (reindexed April 30, pricing current)
- **Browse search** — param bug fixed, search now works correctly across name/brand/sku/oem
- **Fitment filtering** — catalog_fitment_v2 (~3,139,258 rows) — FK points to catalog_unified
- **Fitment dropdowns** — /api/fitment HD-only, canonical tables
- **Pricing** — Daily price sync live, MAP compliant, WPS + PU
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — /era/[slug] live for all 9 eras, all with real product counts
- **Era images** — all 9 WebP images live
- **Old iron** — Knucklehead 2,745 / Panhead 3,224 / Shovelhead 6,310 products
- **Chopper/Universal** — 3,630 products, 311 flagged is_universal
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body) via next/font/google
- **Browse** — /browse replaces /shop everywhere
- **PDP** — VTwin-only products no longer 404 (unified fallback fixed)
- **Admin** — /admin/products live, fitment route hf.slug bug fixed
- **Production** — https://stinksupp.vercel.app
- **PU images** — 23,975 / 24,009 products have image_url (99.9%)
- **PU dual images** — 8,310 products have image_urls array with 2 images

---

## 📦 WHAT WAS DONE THIS SESSION (April 30 — second pass)

### Era Config + Verification
- Fixed `lib/eras/config.ts` — family names updated to match actual DB values
  - `"Softail"` → `"Softail Evo"` in Twin Cam era
  - `"Evolution"` era now includes `"Softail Evo"`
  - `"Revolution Max"` confirmed present in DB (2021–2026)
- Verified era page product counts via SQL — all 9 eras returning real numbers

### Fitment Staging Pipeline
Built two new scripts in `scripts/ingest/`:

**`infer_fitment_staging.js`** — 4-pass inference across all 88,512 products:
- Pass 1: OEM year decode (deterministic) — `25522-36` → year 1936 → Knucklehead
- Pass 2: Era keyword match — "Knucklehead", "Panhead", "Twin Cam", "M8", etc.
- Pass 3: Displacement inference — "883", "1200", "96 inch", etc.
- Pass 4: Universal flag — "universal", "chopper", "all models"
- OEM pattern tightened to reject false positives (Mikuni jets, cable lengths, dual-OEM refs)
- Writes to `fitment_staging` table — nothing touches catalog_fitment_v2 until approved

**`promote_fitment_staging.js`** — promotes approved rows to catalog_fitment_v2:
- Expands staging rows across all matching model_year_id values
- Flags `is_universal = true` on catalog_unified for Universal-tagged products
- `--dry-run` flag for safe preview before committing

**Results:**
- 61,404 rows inserted to fitment_staging
- High confidence promoted: 43,552 rows
- Medium confidence promoted: 199,513 rows
- 311 products flagged is_universal
- 560 low-confidence rows pending review

### Bug Fixes (all deployed)
- **`lib/db/browse.ts`** — search param bug: `p` was advancing 4x for 1 bind value. Fixed with single `sp` capture.
- **`app/browse/[slug]/page.jsx`** — VTwin PDP 404: removed flag gate (`drag_part/in_fatbook/in_oldbook/in_harddrive`) from unified fallback. Any active `catalog_unified` product now resolves.
- **`app/browse/[slug]/page.jsx`** — `generateMetadata` now queries `catalog_unified` with LEFT JOIN instead of `catalog_products` INNER JOIN — VTwin-only products get proper page titles.
- **`lib/db/catalog.ts`** — removed hardcoded prod DB URL fallback. Now throws clearly if `CATALOG_DATABASE_URL` is missing.
- **`app/api/admin/products/[id]/fitment/route.ts`** — removed `hf.slug` from SELECT (column doesn't exist on harley_families).

---

## 🚨 CURRENT ISSUES

### Issue 1 — PDP not displaying rich content
`image_urls`, `special_instructions`, and bullets (`features`) are now in `catalog_unified` but the PDP does not yet render them. Need:
- Multi-image carousel/gallery using `image_urls` array
- `special_instructions` block (conditional, where not null)
- Bullets from `features` array (may already render — confirm)

### Issue 2 — WPS fitment files pending
Contacted rep April 30. Once received, run fitment extraction and insert into catalog_fitment_v2.

### Issue 3 — Low-confidence staging rows unreviewed
560 products in `fitment_staging` with `confidence='low'`, `status='pending'`.
These are displacement-inference guesses. Review before promoting:
```sql
SELECT cu.name, fs.family_name, fs.year_min, fs.year_max, fs.raw_signal
FROM fitment_staging fs
JOIN catalog_unified cu ON cu.id = fs.product_id
WHERE fs.confidence = 'low' AND fs.status = 'pending'
LIMIT 30;
```

---

## 🗺️ NEXT SESSION PRIORITIES

1. **PDP rich content** — multi-image carousel, special_instructions, bullets
2. **WPS fitment files** — ingest once received from rep
3. **My Garage audit** — was built against /shop, needs review for /browse
4. **Low-confidence fitment review** — 560 pending rows, promote or reject

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
| harley_families — no slug column | Use name for all joins — slug does not exist |
| VTwin family names in DB | Softail Evo, Softail M8 — NOT "Softail" or "Big Twin" |
| Era config family names | Must match harley_families.name exactly — see lib/eras/config.ts |
| PU duplicate SKUs | 1001-0018 and 10010018 both exist — use DISTINCT ON cu.id in joins |
| PU map_price | pu_pricing.suggested_retail = MAP for PU (not a separate MAP field) |
| WPS map_price | cu.map_price on catalog_unified |
| MSRP < MAP | Handled by final GREATEST(…, map_price) in pricing formula |
| Daily price sync | scripts/ingest/daily_price_sync.js — bulk SQL, ~seconds to run |
| Price sync cron | 0 3 * * * on Hetzner, logs to /var/log/price_sync.log |
| PU XML format detection | Detect by root tag: `<root>` = Catalog Content, else PIES — NOT by filename |
| PU enrich script | scripts/ingest/enrich_pu_products.cjs <xml_dir> |
| Fitment staging | scripts/ingest/infer_fitment_staging.js --replace |
| Fitment promotion | scripts/ingest/promote_fitment_staging.js --confidence high --dry-run |
| OEM year decode | Only matches strict HD OEM format (NNNNN-YY) — rejects Mikuni jets, cable lengths |
| CATALOG_DATABASE_URL | Must be set in .env.local and Vercel — no fallback, throws if missing |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| Era image blend | mixBlendMode: "screen", opacity: 0.9 for dark backgrounds |
| Sportster split | yearMin/yearMax in era config splits Ironhead vs Evo via hmy.year filter |
| DATABASE_URL not persistent | export each session |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| catalog_fitment archived | catalog_fitment_archived — do not write to it |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| vendor_code casing | Always lowercase ('wps'/'pu') |
| source_vendor casing | Always UPPERCASE ('WPS'/'PU'/'VTWIN') |
| catalog_fitment_v2 columns | id, product_id, model_year_id, created_at, fitment_source, confidence_score, parsed_snapshot — NO source_notes |
