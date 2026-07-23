# Fitment Master Reference

**Refreshed 2026-07-22** (originally compiled 2026-07-20). This is a
coverage/gap snapshot, not a static historical record — re-run the queries
in §7 (or ask for a refresh) after any future fitment-related ingest work.

**Methodology correction (this refresh)**: the 2026-07-20 version measured
coverage via the flat `catalog_unified.is_harley_fitment` flag. Session 93
found that flag is unreliable — sampled PU products with the flag set `true`
but every actual fitment column (`fitment_year_start/end`,
`fitment_hd_families/models`) NULL and zero backing `catalog_fitment_v2`
rows (likely a blanket default set during the July 18 TRUNCATE recovery's
Typesense-snapshot restore, not derived from real fitment data). This
refresh measures coverage by **having at least one real `catalog_fitment_v2`
row** instead — the same relational data the site's own fitment filtering
actually queries. The numbers below are consequently different from (and
more trustworthy than) the 07-20 version, in both directions: some
previously-"covered" products (mostly PU) turn out to have no real fitment
data, while five session-93 imports also added a large amount of genuinely
new coverage.

---

## 1. Overall coverage

| | Count | % of active catalog |
|---|---|---|
| Active products (`catalog_unified`, `is_active=true`) | 90,544 | 100% |
| Has real fitment (≥1 `catalog_fitment_v2` row) | 37,263 | 41.2% |
| Universal / fits-all (`is_universal=true`) | 3,007 | 3.3% |
| **Gap — neither** | **51,048** | **56.4%** |

**Riding Gear & Apparel and Tools & Chemicals are excluded from the "real
gap" figure** — helmets, jackets, cleaners, and hand tools are not
bike-specific by nature, so a lack of fitment there isn't a data gap, it's
correct. Real gap after excluding those two: **46,398 products**.

## 2. Coverage by vendor

| Vendor | Total active | Has fitment | Universal | Gap |
|---|---|---|---|---|
| PU (Parts Unlimited) | 36,370 | 14,745 | 27 | **21,598** |
| VTWIN | 38,140 | 17,263 | 2,980 | **18,671** |
| WPS | 16,034 | 5,255 | 0 | **10,779** |

**PU is no longer "0 gap"** — that was the flag-based artifact described
above. `pu_fitment_expanded` (the 1.64M-row structured table) clearly
doesn't cover every PU product's relational fitment; 21,598 PU products have
no real `catalog_fitment_v2` row despite the flag claiming otherwise. This
is now the single largest vendor gap and worth investigating directly
(check whether `pu_fitment_expanded`'s own coverage has gaps, or whether the
promotion step from it into `catalog_fitment_v2` silently dropped rows).

VTwin and WPS gaps are roughly where they were, netted against real
progress: VTwin's re-scrape (session 93) added 32,924 new
`catalog_fitment_v2` rows and the DS-fitment-scraper contributed
substantially too, but the underlying vendor_sku-matching ceiling
(`vtwin_scrape_data` coverage) is the same constraint documented below.

## 3. Coverage by category (real fitment-relevant categories, sorted by gap size)

| Category | Total | Has fitment | Universal | Gap |
|---|---|---|---|---|
| Handlebars & Hand Controls | 6,831 | 1,410 | 99 | 5,344 |
| Engine | 8,215 | 4,061 | 126 | 4,088 |
| Electrical | 7,736 | 3,785 | 66 | 3,892 |
| Seating | 3,483 | 475 | 48 | 2,962 |
| Transmission & Clutch | 7,222 | 4,267 | 148 | 2,863 |
| Brakes | 6,150 | 3,362 | 81 | 2,731 |
| Cables | 4,675 | 2,031 | 22 | 2,624 |
| Wheels & Tires | 3,507 | 930 | 45 | 2,537 |
| Lighting | 3,984 | 1,555 | 88 | 2,348 |
| Gaskets & Seals | 4,588 | 2,243 | 21 | 2,331 |
| Tanks & Body | 4,251 | 1,961 | 106 | 2,206 |
| Hardware | 2,834 | 709 | 88 | 2,043 |
| Fuel, Air & Carburetors | 4,443 | 1,957 | 729 | 2,034 |
| Frames & Suspension | 3,977 | 2,152 | 99 | 1,756 |
| Foot Controls & Pegs | 3,465 | 1,748 | 62 | 1,663 |
| Exhaust | 2,795 | 1,519 | 29 | 1,247 |
| Saddlebags, Sissy Bars & Luggage | 1,772 | 857 | 91 | 856 |
| Windshields & Fairings | 1,505 | 828 | 1 | 676 |
| Uncategorized | 931 | 348 | 0 | 583 |
| Dashes & Gauges | 1,145 | 598 | 16 | 534 |

*(Excluded as not real fitment gaps: Riding Gear & Apparel — 3,437 total,
46 fitment, 10 universal, GAP 3,381; Tools & Chemicals — 1,759 total, 265
fitment, 361 universal, GAP 1,269.)*

Handlebars & Hand Controls, Engine, and Electrical are now the biggest
absolute gaps under the relational measure (this reshuffles the 07-20
priority order, where Electrical/Engine/Handlebars/Transmission were
close together — Handlebars pulled well ahead once PU's flag-based
"coverage" there was corrected). Seating jumped into the top 5 for the
same reason.

## 4. Which pipeline is covering which products (fitment_source)

| Source | Distinct products covered |
|---|---|
| `vtwin_scrape` | 14,612 |
| PU (`pu_fitment_expanded`, untagged / null source) | 12,121 |
| `wps` | 5,851 |
| `ds_fitment_scraper` (new, session 93) | 3,355 |
| `oem_catalog_hd` (HD OEM PDF catalogs, direct match) | 3,330 |
| `oem_crossref_vtwin` (OEM→VTwin bridge) | 2,441 |
| `oem_crossref_fatbook` (OEM→fatbook bridge) | 2,179 |
| `oem_catalog_hd_universal` | 1,414 |
| `oem_crossref_vtwin_universal` | 1,052 |
| `oem_crossref_fatbook_universal` | 1,040 |

Row counts (not product counts) are far larger since most products fit
*multiple* model-years: `catalog_fitment_v2` total is now **3,426,836 rows**
(up from 3,223,471 at the 07-20 snapshot), with `ds_fitment_scraper`
alone contributing 170,439 of those rows across two import passes this
session (the scraper had to be debugged mid-session — see `HANDOFF_LOG.md`
session 93 — so its real contribution came almost entirely from the second,
post-fix pass). `catalog_oem_crossref` is now 48,817 rows (up from 43,316).

## 5. Recommended next steps, in priority order

1. **Investigate the PU gap directly** — now the largest vendor gap
   (21,598) and a genuine surprise this session. Check whether
   `pu_fitment_expanded` itself has row-level gaps, or whether its
   promotion into `catalog_fitment_v2` dropped rows silently.
2. **Re-run the DS-fitment-scraper against `retry_wifi_outage_errors.csv`**
   (13,382 SKUs that hit a wifi-outage error this session, now fixed for a
   future network drop) — straightforward, already-built retry list, see
   `HANDOFF_LOG.md` session 93.
3. **Re-scrape VTwin further** — `vtwin_scrape_data` still doesn't cover
   the full active VTwin catalog even after session 93's re-scrape added
   1,833 new SKUs; re-check current coverage % before deciding if another
   pass is worth it.
4. **Work the review-queue backlog** — ~2,491 `oem_conflict`, ~4,658
   `fitment_ambiguous_model`, ~491 `fitment_no_model_match`, 1,777
   `fitment_needs_manual_review` flags are sitting in `/admin/review-queue`
   with bulk actions now available (session 93) to work through them.
5. Historical smaller backfills not yet re-run this recovery: Eastern/Colony/GMA
   crossref-driven backfills, EBC catalog fitment, HD battery fitment.

## 6. How to refresh this document

```sql
-- Overall coverage (relational, not the is_harley_fitment flag)
SELECT
  COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE cf.product_id IS NOT NULL) AS has_fitment,
  COUNT(*) FILTER (WHERE cu.is_universal) AS universal,
  COUNT(*) FILTER (WHERE cf.product_id IS NULL AND NOT cu.is_universal) AS gap
FROM catalog_unified cu
LEFT JOIN LATERAL (SELECT product_id FROM catalog_fitment_v2 WHERE product_id = cu.id LIMIT 1) cf ON true
WHERE cu.is_active = true;

-- By vendor
SELECT cu.source_vendor, COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE cf.product_id IS NOT NULL) AS has_fitment,
  COUNT(*) FILTER (WHERE cu.is_universal) AS universal,
  COUNT(*) FILTER (WHERE cf.product_id IS NULL AND NOT cu.is_universal) AS gap
FROM catalog_unified cu
LEFT JOIN LATERAL (SELECT product_id FROM catalog_fitment_v2 WHERE product_id = cu.id LIMIT 1) cf ON true
WHERE cu.is_active = true GROUP BY 1 ORDER BY gap DESC;

-- By category
SELECT COALESCE(cu.display_category, cu.category, '(none)') AS cat, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE cf.product_id IS NOT NULL) AS has_fitment,
  COUNT(*) FILTER (WHERE cu.is_universal) AS universal,
  COUNT(*) FILTER (WHERE cf.product_id IS NULL AND NOT cu.is_universal) AS gap
FROM catalog_unified cu
LEFT JOIN LATERAL (SELECT product_id FROM catalog_fitment_v2 WHERE product_id = cu.id LIMIT 1) cf ON true
WHERE cu.is_active = true GROUP BY 1 ORDER BY gap DESC;

-- Distinct products per fitment_source
SELECT fitment_source, COUNT(DISTINCT product_id) AS products
FROM catalog_fitment_v2 GROUP BY 1 ORDER BY 2 DESC;
```
