# Fitment Master Reference

**Compiled 2026-07-20**, after the July 18 TRUNCATE-incident recovery
(`CATALOG_RECOVERY_PLAN.md` Phases 6/7) and a follow-on OEM-catalog
promotion + user-supplied crossref pass. This is a coverage/gap snapshot,
not a static historical record — re-run the queries below (or ask for a
refresh) after any future fitment-related ingest work.

---

## 1. Overall coverage

| | Count | % of active catalog |
|---|---|---|
| Active products (`catalog_unified`, `is_active=true`) | 90,544 | 100% |
| Has specific fitment (`is_harley_fitment=true`) | 64,575 | 71.3% |
| Universal / fits-all (`is_universal=true`) | 3,007 | 3.3% |
| **Gap — neither** | **23,981** | **26.5%** |

"Gap" here follows the definition established in earlier sessions
(`HANDOFF_LOG.md`): no `is_harley_fitment`, no `is_universal`, no flat
fitment columns, no `catalog_fitment_v2` rows. **Riding Gear & Apparel and
Tools & Chemicals are excluded from the "real gap" figures below** — helmets,
jackets, cleaners, and hand tools are not bike-specific by nature, so a lack
of fitment there isn't a data gap, it's correct. Real gap after excluding
those two: **19,428 products**.

## 2. Coverage by vendor

| Vendor | Total active | Has fitment | Universal | Gap |
|---|---|---|---|---|
| PU (Parts Unlimited) | 36,370 | 36,370 | 27 | **0** |
| VTWIN | 38,140 | 21,907 | 2,980 | **14,245** |
| WPS | 16,034 | 6,298 | 0 | **9,736** |

PU is fully covered (`pu_fitment_expanded`, a pre-parsed structured table,
turned out to already exist with 1.64M rows — see `CATALOG_RECOVERY_PLAN.md`
Phase 6). VTwin and WPS carry essentially the entire remaining gap.

**Root cause found for the VTwin gap**: `vtwin_scrape_data` (the table
`promote_vtwin_scrape_fitment.mjs` reads from) only covers **19,337 of
38,140** active VTwin products (50.7%). Half the VTwin catalog was never
scraped for fitment text in the first place — this isn't a linking bug,
it's a genuine data-collection gap. **This is the single highest-value
target for closing the remaining gap**: a fresh/fuller VTwin scrape (or an
export from vtwinmfg.com covering the other ~18,800 SKUs) would likely
close a large chunk of the 14,245 VTwin gap directly.

WPS's gap is smaller in relative terms but still substantial — `import_wps_fitment.mjs`
matched 17,765/22,288 `wps_catalog` items to `catalog_unified`, but only
5,794 of those actually had Harley vehicle data in WPS's own API response
(most WPS items are simply non-Harley-specific per WPS's own categorization,
or the "Hard Drive" taxonomy term this session's script queried doesn't
cover WPS's full catalog).

## 3. Coverage by category (real fitment-relevant categories, sorted by gap size)

| Category | Total | Has fitment | Universal | Gap |
|---|---|---|---|---|
| Electrical | 7,736 | 5,559 | 66 | 2,122 |
| Engine | 8,215 | 6,419 | 126 | 1,739 |
| Handlebars & Hand Controls | 6,831 | 5,237 | 99 | 1,531 |
| Transmission & Clutch | 7,222 | 5,610 | 148 | 1,531 |
| Wheels & Tires | 3,507 | 1,973 | 45 | 1,495 |
| Hardware | 2,834 | 1,389 | 88 | 1,369 |
| Lighting | 3,984 | 2,651 | 88 | 1,254 |
| Brakes | 6,150 | 4,950 | 81 | 1,166 |
| Tanks & Body | 4,251 | 3,108 | 106 | 1,062 |
| Fuel, Air & Carburetors | 4,443 | 3,190 | 729 | 849 |
| Gaskets & Seals | 4,588 | 3,740 | 21 | 838 |
| Frames & Suspension | 3,977 | 3,167 | 99 | 749 |
| Foot Controls & Pegs | 3,465 | 2,683 | 62 | 729 |
| Exhaust | 2,795 | 2,149 | 29 | 619 |
| Accessories & Gear | 1,839 | 738 | 671 | 580 |
| Cables | 4,675 | 4,230 | 22 | 425 |
| Saddlebags, Sissy Bars & Luggage | 1,772 | 1,367 | 91 | 354 |
| Seating | 3,483 | 3,121 | 48 | 316 |
| Dashes & Gauges | 1,145 | 846 | 16 | 286 |
| Windshields & Fairings | 1,505 | 1,267 | 1 | 237 |
| Uncategorized | 931 | 754 | 0 | 177 |

*(Excluded as not real fitment gaps: Riding Gear & Apparel — 3,437 total,
65 fitment, GAP 3,362; Tools & Chemicals — 1,759 total, 362 fitment, 361
universal, GAP 1,191.)*

Electrical, Engine, Handlebars, and Transmission & Clutch are the biggest
absolute gaps — worth prioritizing if doing category-specific text-mining
(see §5) since they're both large and clearly bike-specific (unlike Apparel).

## 4. Which pipeline is covering which products (fitment_source)

| Source | Products covered |
|---|---|
| `vtwin_scrape` | 13,883 |
| PU (`pu_fitment_expanded`, untagged) | 12,116 |
| `wps` | 5,219 |
| `oem_catalog_hd` (HD OEM PDF catalogs, direct match) | 3,241 |
| `oem_crossref_vtwin` (OEM→VTwin bridge) | 2,441 |
| `oem_crossref_fatbook` (OEM→fatbook bridge) | 2,176 |
| `oem_catalog_hd_universal` | 1,354 |
| `oem_crossref_vtwin_universal` | 1,052 |
| `oem_crossref_fatbook_universal` | 1,039 |

Note: `catalog_fitment_v2` row counts are much larger than these
product-level counts because most products fit *multiple* model-years (one
row each). See `CATALOG_RECOVERY_PLAN.md` for the raw row totals
(`catalog_fitment_v2`: 3,223,471 rows / ~55% of the last-recorded
pre-incident peak of 5,874,564).

## 5. Is there unlinked fitment data sitting around? (the "quick win" check)

Before assuming the 23,981-product gap needs new source data, checked
whether data we already have just isn't linked:

| Check | Count |
|---|---|
| Gap products with `oem_numbers[]` populated at all | 2,689 |
| ...of which, the OEM number matches something already in `oem_fitment` (121 HD catalog PDFs) | **136** |
| ...of which, linkable via `catalog_oem_crossref` → `oem_fitment` (Path C) | 1 |
| Gap products with **no** `oem_numbers[]` and **no** `catalog_oem_crossref` entry at all | **21,288** |
| Gap products (real categories) with a year or HD-model-name hint in the product `name` text | 337 |

**Conclusion: this is a genuine data-availability gap, not a linking bug.**
89% of the gap (21,288/23,981) has zero cross-reference signal of any
kind — no OEM number, no crossref entry, nothing to promote from. Only 136
products have fitment data sitting in `oem_fitment` that isn't yet linked
(worth a manual look, but small). Text-mining product names (the approach
that closed Seating's gap with +256,143 rows in session 76) would only
plausibly help ~337 products here — most VTwin/WPS product names are
generic part descriptions without embedded model/year text; the real
fitment info for those products lives in vendor-supplied structured data
(`fitment_raw`, API vehicle data) that we either don't have or haven't
scraped yet, not in the product name.

## 6. Recommended next steps, in priority order

1. **Re-scrape VTwin** (or get a fuller export) — only 50.7% of active
   VTwin SKUs are in `vtwin_scrape_data`. This is the single largest,
   most concrete, most likely-to-succeed target: ~18,800 VTwin products
   have no fitment scrape data at all.
2. **Investigate WPS's fuller vehicle-fitment API/export** — the
   `taxonomyterms/196/items` (Hard Drive) endpoint used this session may
   not be the only or most complete WPS fitment source; only 5,794/17,765
   matched WPS items had Harley vehicle data attached.
3. **Manually review the 136 "should-link" products** — small, low-effort,
   already-have-the-data list.
4. **Category-specific text-mining passes**, lower priority given the small
   (337) estimated yield catalog-wide, but could still be worth it for the
   highest-gap categories (Electrical, Engine, Handlebars, Transmission)
   specifically, the way the Seating pass worked in session 76 — would need
   its own investigation into whether those categories' names/descriptions
   carry any signal the 337-count above may be undercounting.
5. Historical smaller backfills not yet re-run this recovery: Seating
   name-extraction (+256,143 rows originally — may already be substantially
   covered now via the OEM-catalog promotion, worth re-checking before
   re-running), Eastern/Colony/GMA crossref-driven backfills, EBC catalog
   fitment, HD battery fitment.

## 7. How to refresh this document

Re-run the queries in `CATALOG_RECOVERY_PLAN.md`'s verification section,
or ask for an updated pass — the core queries are:

```sql
-- Overall coverage
SELECT COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE is_harley_fitment) AS has_fitment,
  COUNT(*) FILTER (WHERE is_universal) AS universal,
  COUNT(*) FILTER (WHERE NOT is_harley_fitment AND NOT is_universal) AS gap
FROM catalog_unified WHERE is_active = true;

-- By category
SELECT COALESCE(display_category, category, '(none)') AS cat, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE is_harley_fitment) AS has_fitment,
  COUNT(*) FILTER (WHERE NOT is_harley_fitment AND NOT is_universal) AS gap
FROM catalog_unified WHERE is_active = true GROUP BY 1 ORDER BY gap DESC;

-- VTwin scrape coverage
SELECT COUNT(*) AS total_vtwin,
  COUNT(*) FILTER (WHERE sku IN (SELECT 'VT-'||sku FROM vtwin_scrape_data)) AS in_scrape_data
FROM catalog_unified WHERE source_vendor='VTWIN' AND is_active=true;
```
