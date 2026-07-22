# Internal SKU / Category Coding Scheme — Proposal

**Status: proposal only. No script written, nothing executed.** Per the phased plan, this workstream is gated on the general/misc taxonomy cleanup finishing (tracked separately) — this doc is here for review now so the mapping itself can be agreed on ahead of time.

## The problem

Every `catalog_unified` row already has an `internal_sku` (format `PREFIX######.suffix`, e.g. `ENG439952.p`), assigned by `scripts/ingest/sync_catalog_unified.mjs`'s inline vendor-category→prefix map. That map is keyed off **raw vendor category text** (whatever string PU/WPS handed us), not the curated `display_category` taxonomy that's been built up over many sessions of manual review. Two consequences:

1. **60% of the active catalog (54,413 of 90,544 rows) carries the `MSC` prefix** — not because those products are genuinely miscellaneous, but because their raw vendor category string didn't match any of the map's entries. Many of these products have a perfectly good curated `display_category` (Engine, Brakes, etc.) that the prefix simply ignores.
2. **It reassigns on every ingest run.** `sync_catalog_unified.mjs` runs on every vendor refresh, so this isn't a one-time historical mistake — it's actively overwriting prefixes (including ones a human may have since corrected via admin tools) each time vendor data syncs.

## The proposal

Derive the prefix from **`display_category`** (23 curated categories, see [CATEGORY_TAXONOMY_FULL.md](CATEGORY_TAXONOMY_FULL.md)) instead of raw vendor text. One stable 3-letter code per category:

| # | display_category | Proposed prefix | Products (current) |
|---|---|---|---|
| 1 | Engine | `ENG` | 8,215 |
| 2 | Electrical | `ELC` | 7,736 |
| 3 | Transmission & Clutch | `TRN` | 7,222 |
| 4 | Handlebars & Hand Controls | `HAN` | 6,831 |
| 5 | Brakes | `BRK` | 6,150 |
| 6 | Cables | `CBL` | 4,675 |
| 7 | Gaskets & Seals | `GSK` | 4,588 |
| 8 | Fuel, Air & Carburetors | `FUL` | 4,443 |
| 9 | Tanks & Body | `TNK` | 4,251 |
| 10 | Lighting | `LIG` | 3,984 |
| 11 | Frames & Suspension | `SUS` | 3,977 |
| 12 | Wheels & Tires | `WHL` | 3,507 |
| 13 | Seating | `SEA` | 3,483 |
| 14 | Foot Controls & Pegs | `FTR` | 3,465 |
| 15 | Riding Gear & Apparel | `APP` | 3,437 |
| 16 | Hardware | `HRD` | 2,834 |
| 17 | Exhaust | `EXH` | 2,795 |
| 18 | Accessories & Gear | `ACC` | 1,839 |
| 19 | Saddlebags, Sissy Bars & Luggage | `LUG` | 1,772 |
| 20 | Tools & Chemicals | `TLS` | 1,759 |
| 21 | Windshields & Fairings | `WND` | 1,505 |
| 22 | Dashes & Gauges | `DSH` | 1,145 |
| 23 | Uncategorized | `MSC` | 931 |

Most codes reuse what's already live where it happens to line up 1:1 with a curated category (`ENG`, `ELC`, `TRN`, `HAN`, `BRK`, `FUL`, `TNK`, `LIG`, `SUS`, `WHL`, `FTR`, `HRD`, `EXH`, `LUG`, `TLS`, `WND`) — minimizes churn for products that already happen to have a sensible prefix. Six are new (`CBL`, `GSK`, `SEA`, `APP`, `ACC`, `DSH`) since the old 14-code scheme never had a category for Cables, Gaskets & Seals, Seating, Riding Gear & Apparel, Accessories & Gear, or Dashes & Gauges as such. `MSC` becomes a **reserved code for genuinely uncategorized products only** (the 931 real `Uncategorized` rows) — not a silent fallback for anything a regex failed to match.

## How this would run (not built yet)

- A new, standalone script — decoupled from `sync_catalog_unified.mjs` entirely, so vendor refreshes stop silently reassigning prefixes.
- Idempotent and dry-run by default: only touches rows whose current prefix is `MSC` (the old catch-all) or whose `display_category` has changed since the last assignment. Never touches a row that already has a correct, stable prefix.
- Reuses the existing `sku_counter` per-prefix sequential counter (already kill-safe/resumable) — no new numbering mechanism needed.

## Gate before running

Per the approved plan, full-catalog reassignment should wait until:
1. Phase 3 gap closes (~6,794 rows currently missing `display_subcategory`), and
2. The "General"/"Misc" catch-all dispersal work (tracked in memory as the ongoing taxonomy cleanup project) is finished.

Running it earlier would just bake today's incomplete categorization into a different layer (the SKU) instead of fixing the actual gap.

## Open question for review

Does the 23→prefix mapping above look right, or are there categories where you'd want a different 3-letter code (e.g. for brand/family recognition in URLs or reports)? This table is the one piece worth confirming before the execution script gets written, since changing a prefix later means re-touching every SKU that used it.
