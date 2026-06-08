# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026 · **Last Updated:** June 7, 2026 (Session 43)
**Scope:** browse.ts · FilterSidebar · Fitment data · Typesense facets

---

## Status: COMPLETE ✅ (fitment coverage ongoing)

All filter architecture phases complete. Open loop: VTwin scraper round 2 in progress.

---

## Architectural note (revised)

Original concern was that Typesense facets and browse.ts product queries would diverge when fitment params are active. **This is a non-issue** — browse.ts computes all facets (category, brand, subcategory, price) via Postgres using the same `fitmentJoin` + `WHERE` clause as the product grid. Facet counts are already fitment-aware. Phase 4 is resolved by existing architecture.

---

## Phase 1 — Quick Unblocks ✅ COMPLETE

| Item | Result |
|------|--------|
| 1.1 vtwin_mark_universal.sql | ✅ 2,328 marked — category + name-pattern approach |
| 1.2 fits_all_models in browse.ts | ✅ Fixed — `is_universal` OR added to modelCode, year, family fallback |
| 1.3 Dash-suffix regex | ✅ Tightened — finish-word-restricted pattern |
| 1.4 Brand facet cap | ✅ Non-issue — browse.ts uses Postgres `LIMIT 30` |
| 1.5 OEM# search | ✅ Verified — 24009-06 returns 3 products |

---

## Phase 2 — Sidebar UX ✅ COMPLETE

| Item | Result |
|------|--------|
| 2.1 Fitment context chip | ✅ family, year, model all in chips |
| 2.2 activeCount fix | ✅ family, model, year included |
| 2.3 Era label | ✅ "Engine Era" |
| 2.4 Coverage hint | ✅ "Fitment-matched + universal parts" label |
| 2.5 Inline search | ✅ Session 43 — debounced input at top of sidebar, wired to filters.search |

---

## Phase 3 — Fitment Coverage ⏳ IN PROGRESS

| Item | Result |
|------|--------|
| 3.1 Model codes | ✅ 12 added + FXDR. FLHRX still needed. |
| 3.2 MODEL_ALIASES | ✅ 5 new groups (FLHR, FLHX, FLSTF, FXSTB, FXDWG) + XL883/XL1200 expansion |
| 3.3 extract_fitment_from_names | ✅ PU 49.2% · VTwin 37.7% · WPS 40.8% |
| 3.4 VTwin scraper round 1 | ✅ 12,100 SKUs / 102,291 fitment rows / 868 OEM rows |
| 3.5 VTwin scraper round 2 | ⏳ 19,662 remaining SKUs — scraper running |

**Coverage as of Session 43:**
| Vendor | Total Active | With Fitment | Universal | % Covered |
|--------|-------------|-------------|-----------|-----------|
| PU | ~36,400 | ~17,900 | — | ~49% |
| VTwin | 38,353 | 15,371 | 2,946 | 45.7% |
| WPS | ~15,800 | ~6,500 | — | ~41% |

**VTwin gap breakdown:**
- 15,371 with specific fitment
- 2,946 universal (`is_universal = true`)
- 1,170 scraped but no fitment returned (genuinely universal or scraper miss)
- **19,662 never scraped** — scraper running against `vtwin_scrape_targets_2.csv`

**Post-scraper steps (when scraper finishes):**
```bash
# Export checkpoint and import
VTWIN_CSV=.../vtwin_checkpoint_export.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs

# Mark universals (All models + Custom application)
psql '...' -c "
UPDATE catalog_unified cu SET is_universal = true
FROM vtwin_scrape_data vsd
WHERE cu.source_vendor = 'VTWIN'
  AND (cu.sku = 'VT-' || vsd.sku OR cu.sku = vsd.sku)
  AND vsd.fitment_raw IN ('All models', 'All', 'Custom application')
  AND cu.is_universal = false;"

psql '...' -c 'REFRESH MATERIALIZED VIEW mv_family_product_ranges;'
node scripts/ingest/index_unified.js --recreate
```

---

## Phase 4 — Facet Alignment ✅ NON-ISSUE

Facets are Postgres-computed using the same fitmentJoin + WHERE. No architectural change needed.

Remaining low-priority items:
- **Reindex automation** — wire `npm run reindex` as post-step in ingest scripts
- **Typesense schema documentation** — create `scripts/ingest/TYPESENSE_SCHEMA.md`

---

## OEM Pipeline (added Session 43)

`catalog_oem_crossref` is now the **single source of truth** for all OEM data:
- `product_id` FK column added and backfilled
- Unique index on `(sku, oem_number)` prevents duplicates
- `import_vtwin_fitment_partial.mjs` writes to crossref with `source = 'VTWIN_SCRAPE'`
- `oem_numbers[]` on `catalog_unified` rebuilt from crossref after every import
- WPS and PU pipelines should be updated to match this pattern

---

## Issue Summary (final)

| Layer | Issue | Severity | Status |
|-------|-------|----------|--------|
| browse.ts | Dash-suffix regex collapses directional parts | 🔴 | ✅ Fixed |
| browse.ts | is_universal OR missing from fitment WHERE | 🔴 | ✅ Fixed |
| browse.ts | Cross-vendor name collapse | 🟡 | Accepted |
| FilterSidebar | No chip for active year/model params | 🔴 | ✅ Fixed |
| FilterSidebar | activeCount excludes year/model params | 🔴 | ✅ Fixed |
| FilterSidebar | Era vs Family label confusion | 🟡 | ✅ Fixed |
| FilterSidebar | No product search | 🟡 | ✅ Fixed Session 43 |
| Fitment data | vtwin_mark_universal.sql not run | 🔴 | ✅ 2,328 marked |
| Fitment data | ~60% unfitted, no UX signal | 🟡 | ✅ Coverage hint added |
| Fitment data | MODEL_ALIASES incomplete | 🟡 | ✅ 5 groups added |
| Fitment data | 26 model codes missing | 🟡 | ✅ 12 added + FXDR; FLHRX pending |
| Fitment data | 19,662 VTwin SKUs never scraped | 🟡 | ⏳ Scraper running |
| OEM data | VTwin OEM bypassing catalog_oem_crossref | 🔴 | ✅ Fixed Session 43 |
| OEM data | catalog_oem_crossref missing product_id FK | 🟡 | ✅ Fixed Session 43 |
| Typesense | Facets pre-fitment filter | 🔴 | ✅ Non-issue |
| Typesense | No reindex automation | 🟡 | ⏳ Future |
| Typesense | Schema undocumented | ⚪ | ⏳ Future |

---

*Filter Roadmap — Last updated June 7, 2026 · Session 43*
