# OEM & Fitment Data Model

Canonical reference for how OEM part numbers and fitment data flow through the catalog. Companion to `FITMENT_MASTER_REF.md` (coverage snapshot) and `CATALOG_RECOVERY_PLAN.md` (incident history) — this doc explains the *architecture*, not the current data state.

## Table relationships

Three tables carry "OEM-ness," each with a different role:

```
oem_fitment                    catalog_oem_crossref              catalog_fitment_v2
(HD catalog PDFs,       →      (vendor/reference bridge,   →     (denormalized usable result,
 most authoritative)            keyed on sku, not FK)              keyed on product_id/model_year_id)
```

- **`oem_fitment`** (315,427 rows) — mined directly from 121 HD OEM parts catalog PDFs. Each row is `oem_part_no` + model/year data + `matched_product_id` (nullable FK to `catalog_unified`, no CASCADE — survived the TRUNCATE incident untouched because it was never actually joined via a hard FK). This is the ground-truth source: if HD's own catalog says a part number fits a model/year, that's as authoritative as it gets.
- **`catalog_oem_crossref`** (43,316 rows) — bridges vendor/reference-book part numbers to OEM numbers. Keyed on `(sku, oem_number)`, unique index, `sku` is a plain text match against `catalog_unified.sku` (not an FK — this is deliberate, since crossref data can arrive before or independent of a product existing). Sources: FatBook, Oldbook, WPS-Harley, VTwin scrape, PU brand-XML (`PU_PIES`).
- **`catalog_fitment_v2`** (3,223,471 rows) — the actual usable result: `product_id` + `model_year_id` + `fitment_source` + `confidence`. This is what `browse.ts`'s OEM chain matching (`fetchChainProductIds()`) actually queries. Populated by promoting rows from both `oem_fitment` (direct catalog matches) and `catalog_oem_crossref` (bridge matches).

**Trace query** — "why does this product have this OEM number":

```sql
SELECT cu.id, cu.name, cu.sku, cu.oem_numbers,
       coc.oem_number, coc.source AS crossref_source,
       of.oem_part_no, of.model_codes, of.match_confidence,
       cf.fitment_source, cf.confidence
FROM catalog_unified cu
LEFT JOIN oem_fitment of ON of.matched_product_id = cu.id
LEFT JOIN catalog_oem_crossref coc ON coc.sku = cu.sku
LEFT JOIN catalog_fitment_v2 cf ON cf.product_id = cu.id
WHERE cu.id = $1
ORDER BY of.oem_part_no, coc.source;
```

Run this whenever a fitment claim looks wrong — it shows the full provenance chain in one shot instead of guessing which table is lying.

## Confidence-score convention

`catalog_fitment_v2.confidence` and `oem_fitment.match_confidence` follow this scale (established informally across several ingest scripts, written down here as policy):

| Score | Meaning |
|---|---|
| 1.0 | Direct `oem_fitment.oem_part_no` → `catalog_unified.oem_numbers[]` array match |
| 0.95 | `oem_fitment` matched via `catalog_oem_crossref` bridge, single vendor-confirmed |
| 0.90 | VTwin crossref bridge |
| 0.88 | FatBook/Oldbook crossref bridge |
| 0.85 / 0.80 | fits-all-models variants of the above (broader, less certain) |
| 0.5 | Default — manual insert or unverified/no source metadata |

Upsert logic across the pipeline keeps the **highest** confidence on conflict (`GREATEST(existing, new)`), never downgrades a manual/higher-confidence row.

**New rule**: any newly-imported source document (V-Twin PDF, wps-cross-fitment.csv, Numbers export, etc.) starts at ≤0.5 in `oem_crossref_staging` and only gets promoted to the tiers above after passing validation (see below) — it does not go straight into `catalog_oem_crossref` at a trusted confidence level just because the source document looks official.

## Vendor join-key footgun

**PU joins on `sku`. WPS and VTwin join on `vendor_sku`.** `vendor_sku` is frequently empty for PU rows, so joining PU on `vendor_sku` silently drops matches. Every new crossref/fitment import script must state which key it uses in a header comment — this has caused silent data loss before and will again if left implicit.

## Source-to-table mapping

Tracks every OEM cross-reference document and where its data lands. Fill in a row per document as it's processed.

| Source document | Format | Key columns | Join key | Target table | Dedup key | Status |
|---|---|---|---|---|---|---|
| Structured `Cross Reference Data-Table 1.csv` (FatBook/Oldbook) | CSV | `part_number, oem_number, source, page_number, duplicate_count` | `sku` (PU-style part numbers) | `catalog_oem_crossref` | `(sku, oem_number)` | Imported session 92 — 8,665 net-new rows. **Correction (this session)**: the FatBook-sourced rows (`source='structured_fatbook_oem_cross'`, 4,720 rows) had `sku`/`oem_number` backwards relative to Oldbook's rows in the same file — confirmed via pattern-matching against real HD OEM number format, fixed by swapping the two columns (2,097 pure-duplicate rows removed, 2,623 rows corrected in place) |
| `OEM_Crossref_Merged.xlsx` unpivoted | CSV (converted) | `part_number, oem_number, source, oem_manufacturer` | `sku` | `catalog_oem_crossref` | `(sku, oem_number)` | Imported session 92 — 8,107 net-new rows |
| `Oldbook-OEM.pdf` (19 pages) | PDF, clean tabular (OEM#/Part#/Page#) | OEM#, Part# (DS-xxxxx / numeric), Page# | `sku` | `oem_crossref_staging` → `catalog_oem_crossref` | `(sku, oem_number)` | **Done** — extracted via `pdftotext -layout`, diffed against DB: 97.2% already present (same underlying source as the structured CSV above). Only 105 genuinely net-new rows imported; all flagged `no_product_match` (their part numbers aren't in the current catalog) |
| `FatBook-OEM.pdf` (24 pages) | PDF, clean tabular | Same as Oldbook | `sku` | `oem_crossref_staging` → `catalog_oem_crossref` | `(sku, oem_number)` | **Done** — same treatment, 96.9% already present, 104 net-new rows imported (also flagged `no_product_match`) |
| `VTwin-OEM.pdf` (267 pages) | PDF, tabular; header row garbled in the source PDF but data rows clean | OEM#, Part# (V-Twin catalog numbers like `10-0026`) | `vendor_sku` | `oem_crossref_staging` → `catalog_oem_crossref` | `(sku, oem_number)` | **Done** — extracted via `pdftotext -layout` (full 267 pages, not just a sample — the text layer turned out reliable). 12,127 rows parsed, 569 already present, 5,948 clean/promoted, 2,491 flagged `different_product` (likely mostly legitimate multi-vendor equivalents — same OEM part, different vendor SKU across VT-/WPS-/DS- catalogs — left in the review queue rather than auto-resolved), 3,119 flagged `no_product_match` |
| `wps-cross-fitment.csv` (2,273 rows) | CSV | `OEM#, WPS#, Vendor, Vend#` | `vendor_sku` (WPS# maps here) | `oem_crossref_staging` → `catalog_oem_crossref` | `(sku, oem_number)` | **Done** — 2,180 already present, 15 clean/promoted, 54 flagged `no_product_match`, 1 flagged `different_product` |
| `oem_cross_reference_database.numbers` / its CSV export | Apple Numbers / CSV | Multi-sheet export; main sheet is deduplicated OEM+Part pairs | n/a | n/a | n/a | **Skipped, not imported** — 100% of its 8,729 rows already match existing `catalog_oem_crossref` data (this is the same underlying spreadsheet `import_supplementary_oem_crossref.mjs` already consumed). Diffing it is what surfaced the FatBook orientation bug above |
| `vendor.vtwinmtc_products` (37,749 rows, separate `vendor` Postgres schema) | DB table (not a document) | `oem_xref1/2/3`, `full_pic1-4`, `thumb_pic` | `sku` (= VTwin vendor_sku) | Already reflected in `catalog_unified.oem_numbers[]` / `image_url` / `image_urls` | n/a | **Informational only** — discovered this session. 97.6% of its multi-OEM-ref rows and 99.97% of its images are already synced into `catalog_unified`, via a one-time backfill (`scripts/sql/unified_backfill_oem_fitment*.sql`), not the recurring `pull_vtwin_catalog.mjs` pipeline. Status of the `vendor` schema itself (16 tables total) is unclear — not part of the documented three-vendor-source architecture. Not wiring up a recurring sync for it; the gap remaining is too small to justify new pipeline code |
| `catalog_fitment_enriched.csv` (ds-fitment-scraper, 19,559 rows) | CSV | `sku, fitment_details, oem_numbers, fitment_status` | `sku` (PU-style, needs dash/DS-prefix normalization, 99.1% match) | `fitment_staging` → `catalog_fitment_v2`; clean `oem_numbers` tokens also → `oem_crossref_staging` | `(sku, model_code_raw, year_start, year_end, source)` | **Done** — 349,689 fitment claims staged, 295,626 auto-approved. 52,459 initially flagged `no_model_match` due to a word-order bug in the source text (`"Harley-Davidson ModelName MODELCODE"` instead of the expected `"...MODELCODE ModelName"`); `recover_fitment_word_order.mjs` recovered 45,743 of those by re-parsing with the code as the last word. Net: 4,909 new `catalog_fitment_v2` rows (most candidates already existed — PU already had strong coverage) |
| `vtwin_fitment.csv` (vtwin_scraper re-scrape, 19,669 rows) | CSV | Same schema as `vtwin_scrape_data` | `vendor_sku` | Upserted into `vtwin_scrape_data`, promoted via existing `promote_vtwin_scrape_fitment.mjs` | `sku` (PK) | **Done** — 1,833 genuinely new SKUs (17,760 were already-scraped re-scrapes). +32,924 new `catalog_fitment_v2` rows |
| `pu_fitment_review_needed.csv` (1,787 rows) | CSV | `sku, name, year_range, notes_snippet, features_snippet, commodity_category/subcategory` | `sku` (zero-padded to 8 digits, 99.4% match) | `catalog_review_flags` only — **not** promoted to `catalog_fitment_v2` | n/a | **Flagged for human review, not auto-imported.** No model code, only a year range + free-text notes. A conservative "does the text contain exactly one unambiguous `harley_models.model_code` token" check found 108 candidates, but sampling them showed the notes frequently contain **exclusion language** (`"NOT FOR 16-17 FXDLS"`, `"N/F 15-20 FLTRX/U/K"`) that a naive token match reads as a positive fit — exactly backwards. All 1,777 resolvable rows were flagged `fitment_needs_manual_review` instead; 986 of them are products with no fitment coverage at all today |

## Lesson: negation language in free-text fitment notes

`pu_fitment_review_needed.csv` surfaced a real trap worth remembering for any future free-text fitment source: abbreviations like `"NOT FOR"` and `"N/F"` mean the part does **not** fit the model that follows — a plain substring/token match against `harley_models.model_code` cannot tell an inclusion from an exclusion. Never auto-promote a fitment claim extracted from free text without first checking for negation markers near the matched token, and when in doubt, flag for human review rather than guess.

## Staging-first policy

As of this document, no new OEM/fitment source should write directly to `catalog_oem_crossref` or `catalog_fitment_v2`. Everything lands in `oem_crossref_staging` (OEM part-number pairs) or `fitment_staging` (year/model claims) first, passes through `validate_oem_crossref_staging.mjs` / `validate_fitment_staging.mjs`, gets human review for anything flagged, and only then gets promoted via `promote_oem_crossref_staging.mjs` / `promote_fitment_staging.mjs`.
