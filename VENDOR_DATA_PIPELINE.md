# Vendor Data Ingestion Pipeline — Start to Finish

A clean walkthrough of how product data moves from raw vendor files to a
fully-enriched, customer-facing catalog. Written 2026-07-20, based on the
actual working pipeline (join keys and quirks verified directly against
live data, not assumed from older docs).

This is the map. For chronological narrative of *how* each piece got built
or fixed, see `HANDOFF_LOG.md`. For the fuller scripts inventory and other
technical trivia, see `MasterRef.md`. For the July 18 TRUNCATE incident and
its recovery, see `CATALOG_RECOVERY_PLAN.md`.

---

## The shape of it

```
Vendor files/exports
        │
        ▼
Source tables (pu_catalog / wps_catalog / vtwin_catalog)  ← one row per vendor SKU, raw vendor data
        │
        ▼
catalog_unified          ← the merged master table, one row per vendor SKU
        │
        ├─→ Taxonomy (display_category / display_subcategory)
        ├─→ canonical_products         (same physical item, different vendors → one canonical ID)
        ├─→ catalog_variant_groups     (same product, different color/length/size → customer-facing dropdown)
        ├─→ vendor_offers              (real cost/price/stock per vendor)
        ├─→ catalog_media              (product images)
        ├─→ catalog_fitment_v2 / product_fitment_year_model   (year/model-specific fitment lookups)
        ├─→ catalog_oem_crossref       (OEM part number cross-referencing)
        │
        ▼
Typesense index           ← what actually powers site search
        │
        ▼
Storefront (browse grid, PDP, variant selector, search)
```

Three vendors feed this: **PU** (Parts Unlimited / LeMans), **WPS**
(Western Power Sports), **VTwin** (V-Twin Mfg). Each has its own file
format, its own source table, and — this is the part that trips people up —
**a different join key back into `catalog_unified`**.

---

## Stage 1: Source tables

Each vendor's raw data lands in its own staging table first. Nothing here
is customer-facing; these are just typed, queryable mirrors of whatever the
vendor sent.

### PU (`pu_catalog`)

- **Source files**: a pricing/dealer-cost CSV and a master item CSV, refreshed
  periodically. Current puller: `scripts/ingest/pull_pu_pricefile.mjs`.
- **Key columns**: `sku`, `dealer_price`, `base_dealer_price`, `msrp`,
  `original_retail`, `dropship_fee`, `warehouse_wi/ny/tx/nv/nc` (5 named
  warehouses, **stored as `character varying`, not integer** — values can be
  a plain number ("4") or a floor value like `"20+"` or `"N/A"`. Parse with a
  digit-strip + `parseInt`, never assume it's already numeric).
- 36,701 rows as of this writing.

### WPS (`wps_catalog`)

- **Source files** (three, all required — `pull_wps_catalog.mjs` hard-fails
  if any is missing):
  1. `scripts/data/wps/master_item_wps.csv` — product names, categories,
     catalog-flag booleans (`harddrive_catalog`, `street_catalog`, etc.),
     list price, standard dealer price. **Filtered to
     `harddrive_catalog = true`** on import — this is a HardDrive-network
     catalog, not the full WPS universe.
  2. `scripts/data/wps/Inventory-Files/WPS-inventory-<date>.csv` — real
     per-warehouse stock, 7 named warehouses (`boise`, `fresno`,
     `elizabethtown`, `ashley`, `midlothian`, `jessup`, `midway`). **The
     exact filename is hardcoded in the script** (`INVENTORY` constant) —
     if WPS sends a differently-dated file, either rename it to match or
     update the constant.
  3. `scripts/data/wps/Catalogs/hdmstr_with_urls.csv` — image URLs,
     dimensions, `supplier_item_id`. Multiple rows per SKU (different
     angles/crops); no explicit ordering field, file order is used as
     display priority.
- **A separate pricing file** (`scripts/data/wps/wps_pricing.csv` —
  `id, sku, actual_dealer_price, standard_dealer_price, list_price,
  drop_ship_eligible, drop_ship_fee`) has *better* cost/fee granularity than
  the master item file and is consumed separately by `sync_vendor_offers.mjs`
  for `vendor_offers`, not by `pull_wps_catalog.mjs`.
- **Column name gotcha**: the master item file's map-price column is
  `mapp_price` (double-p, a vendor typo), not `map_price`. `pull_wps_catalog.mjs`
  already accounts for this — don't "fix" it back to `map_price` or it'll
  silently stop matching.
- 22,288 rows as of this writing.

### VTwin (`vtwin_catalog`)

- **Source**: `pull_vtwin_catalog.mjs`. Thinnest source data of the three —
  no product description field at all, no drop-ship fee, no per-warehouse
  breakdown. Just `sku`, `name`, `dealer_price`, `retail_price`,
  `has_stock` (boolean only, no real quantity), plus basic dimensions and
  up to 3 OEM cross-reference columns (`oem_xref1/2/3`).
- 38,315 rows as of this writing.

---

## Stage 2: Merge into `catalog_unified`

One row per vendor SKU (a product carried by 2 vendors gets 2 rows here —
that's what `canonical_products` is for later, see below). `source_vendor`
is `'PU'` / `'WPS'` / `'VTWIN'` on every row.

**The join key back to each source table is NOT the same column for every
vendor** — this is the single most common mistake to make when writing a
new sync script against these tables. Confirmed directly against live data:

| Vendor | Join | Match rate |
|---|---|---|
| PU | `catalog_unified.sku = pu_catalog.sku` | 36,684 / 36,701 (99.95%) |
| WPS | `catalog_unified.vendor_sku = wps_catalog.sku` | ~100% |
| VTwin | `catalog_unified.vendor_sku = vtwin_catalog.sku` | 38,160 / 38,315 (99.6%) |

(Trying `vendor_sku` for PU only gets 880 matches — it's the wrong column
for that vendor. `MasterRef.md`'s "VENDOR SKU RULES" table documents the
same rule from an earlier session; this reconfirms it against current data.)

97,122 total rows (90,544 active) as of this writing.

---

## Stage 3: Enrichment layers

Everything below reads `catalog_unified.id` as its anchor and adds
structured data on top. None of these require re-deriving the base merge —
they're independent passes, safe to run in any order relative to each
other (though taxonomy should generally happen before variant grouping,
since some grouping scope filters key off `display_category`).

### Taxonomy — `display_category` / `display_subcategory` / `display_subcategory_detail`

The largest, most session-heavy part of this whole pipeline historically —
see `HANDOFF_LOG.md`'s dozens of `rebuild_*_taxonomy.mjs` / `fix_*_taxonomy.mjs`
entries. Each category was hand-classified via keyword rules against
product names, refined over many passes as edge cases were found. Not a
single script — a category-by-category body of work. Current state:
100% of active rows have a category, 98% have a subcategory.

### `canonical_products` — cross-vendor "same physical item" linking

Solves: PU, WPS, and VTwin frequently carry the *identical* physical
product under totally different SKUs and names (confirmed example: one
ignition sensor plate sold as "SENSOR PICKUP 32400-94" / PU, "CAM POSITION
PLATE ASSEMBLY" / WPS, "Ignition Sensor Plate Assembly" / VTwin — same
part, unrecognizable as duplicates by name alone).

- Built by `build_canonical_products.mjs`: Phase A does a 1:1 init (every
  row gets a canonical entry), Phase B does OEM-number + `display_category`
  cross-vendor matching, auto-confirming on exact `brand_part_number`/name
  match and queuing ambiguous ones to `canonical_match_proposals` for human
  review.
- **Heuristic, not exact** — confirmed false positives exist historically
  (documented in that script's own comments) and a fresh one was found this
  session: 38 `(variant_group_id, canonical_product_id)` pairs where two
  *different* variants (e.g. "Grips Old School Black" vs "...White") share
  a bad canonical match. This is why `lib/db/browse.ts`'s dedup key checks
  `variant_group_id` before `canonical_product_id`, not the other way
  around — see that file's comment for the full reasoning.
- 91,283 rows; 88,878 of 90,544 active `catalog_unified` rows linked (98%).
- **What it's used for**: `lib/db/browse.ts`'s browse-grid dedup (one tile
  per physical product, not one per vendor) — added this session. Not (yet)
  used by checkout/fulfillment routing — see `lib/fulfillment/optimizer.ts`
  (built, correctly canonical-keyed, but not called by any live route).

### `catalog_variant_groups` / `catalog_variant_members` / `catalog_variant_member_options`

Solves: one product, multiple purchasable options (color, length, size) —
the dropdown selector on the PDP.

- **Automated pass**: `build_variant_groups.cjs`. Three phases — WPS groups
  by `wps_product_id` (sub-partitioned by base name), PU/VTwin group by
  extracting one named attribute (Color/Size/Finish/Side/Gauge/etc, see its
  `ATTRIBUTE_RULES` array) from the product name and clustering on the
  name-with-attribute-stripped, then a `brand_part_number`-suffix
  cross-reference phase connects siblings the name-matching missed. Full
  rebuild every run — **excludes `source_vendor IN ('ADMIN','MULTI','LENGTH')`**
  from its wipe so hand-curated and specialty-built groups survive a
  re-run. Never remove that exclusion without a deliberate reason (past
  incidents wiped both).
- **Gap this pass can't cover**: when the distinguishing attribute isn't in
  the product name at all (e.g. 43 SKUs of "Clutch Line" differing only by
  a `length_in` column value with nothing in the name to extract). For
  that, a separate `build_length_variant_groups.mjs` groups by exact name +
  `length_in`, tagged `source_vendor='LENGTH'`.
- **Manual pass**: for genuinely ambiguous or small-scale cases (hand-picked
  via the variant-term-review process), groups get built directly via the
  same schema, tagged `source_vendor='ADMIN'` — same pattern as
  `app/api/admin/variant-groups/create/route.ts`, which is the reference
  implementation for the exact INSERT sequence (group → members with legacy
  `option_1/2` columns → `catalog_variant_member_options` junction rows →
  backfill `catalog_unified.variant_group_id`).
- `catalog_variant_member_options` is the real N-axis store (unlimited
  named axes via `axis_name`/`axis_value`); `option_1/2` on
  `catalog_variant_members` are kept only as a legacy mirror.
- 7,132 groups; 20,914 active products currently in a group.
- **Frontend**: `components/browse/VariantSelector.jsx` reads
  `app/api/browse/variants/[productId]/route.ts`, picks a render mode
  (fitment+color / fitment / color+qty / dropdown / style+finish / flat
  options) based on what axes are present. `AxisDropdownSelector.jsx` is
  the generic N-axis `<select>` mode, added this session for single-axis
  many-value cases (lengths, etc.) — the other modes predate it and use
  pill/card UI instead.

### `vendor_offers` — real cost, price, and stock per vendor

Solves: the browse grid and PDP variant selector both read this table for
`stock_qty`/`offer_price` — until it's populated, everything shows 0 stock
and falls back to `catalog_unified.msrp`.

- Built by `sync_vendor_offers.mjs`, one pass per vendor (`vendor_code` +
  `catalog_product_id` is the unique key, so it's one row per vendor SKU,
  same granularity as `catalog_unified` itself — not deduplicated to
  canonical level).
- PU: cost from `pu_catalog.dealer_price`, real per-warehouse quantities.
- WPS: cost preferentially from the separate pricing CSV (better
  granularity + real drop-ship fee) falling back to `wps_catalog`; stock
  from `wps_catalog.stock_quantity` (already vendor-side aggregated across
  the 7 named warehouses — this pipeline does *not* attempt to map those
  7 city names onto `vendor_offers`' 2-letter state columns, since that
  mapping isn't confidently known; the raw per-warehouse breakdown is kept
  in the `warehouse_json` column instead of guessed into a specific state).
- VTwin: cost from `dealer_price`; stock is a **placeholder** (1 if
  `has_stock` else 0) since the source only has a boolean, not a real
  count — do not treat VTwin's `total_qty` in this table as a real
  inventory figure.
- **Operational note**: this table's populate script processes ~90k rows
  via individual per-row upserts. A single unbroken transaction over that
  many rows is fragile — this session hit a silent connection hang (no
  error thrown, just a dead socket) that stalled for 4 hours before being
  caught manually. Current script batches commits every 1000 rows and sets
  `statement_timeout`/`query_timeout` (15s) so a hang becomes a caught,
  retried error instead of an infinite wait. Any future large-batch ingest
  script against this DB should do the same.

### `catalog_media` — product images

Solves: multi-image galleries (vs. `catalog_unified.image_url`, which only
holds one). Built from the same WPS image export used in Stage 1
(`hdmstr_with_urls.csv`), matched by `vendor_sku`, one row per (product,
image URL) pair with file-encounter-order as `priority`. Read by
`app/browse/[slug]/page.jsx` and the variants API route — but only
actually *shown* for products that don't already have a populated
`catalog_unified.image_urls` array (that column wins when present).

### `catalog_fitment_v2` / `product_fitment_year_model` — relational fitment

Year/model-specific fitment lookups (as opposed to the flat
`fitment_year_start/end`/`fitment_hd_models` columns already on
`catalog_unified`, which cover display but not filtered browse/search).
**Rebuilt 2026-07-20** (`catalog_fitment_v2`: 2,473,673 rows;
`product_fitment_year_model`: 538,093 rows) — PU via
`promote_pu_fitment.cjs` against the already-staged `pu_fitment_expanded`
table (not a CSV), WPS via `import_wps_fitment.mjs` + `promote_wps_fitment.cjs`,
VTwin via a new script, `promote_vtwin_scrape_fitment.mjs`, sourced from
`vtwin_scrape_data` rather than the older `vtwin_fitment_partial.csv` (that
CSV script also upserts new bare-bones `catalog_unified` products for
unmatched SKUs — not wanted here). See `CATALOG_RECOVERY_PLAN.md` Phase 6
for the full writeup, including a real per-row-`UPDATE` performance bug
found and fixed in `build_fitment_year_ranges.cjs`. Now 3,426,836 rows as of
session 93 (2026-07-22) — see below.

### `catalog_oem_crossref` — OEM part number cross-referencing

**Rebuilt 2026-07-20** (14,199 rows) from four sources: fatbook, oldbook,
WPS Harley crossref CSV, and VTwin scrape OEM numbers. Several of the
`_unverified/` scripts had real bugs (wrong column names, wrong `ON
CONFLICT` target, a broken relative `.env.local` path) fixed in place — see
`CATALOG_RECOVERY_PLAN.md` Phase 7 for specifics on each. `import_oem_crossref.js`
is confirmed unsafe (unguarded `TRUNCATE` against a legacy table) and should
never be run. Now 48,817 rows as of session 93.

### Staging/validation gate (new, session 93) — reads before both of the above

As of session 93, **no new OEM/fitment source writes to either table
above directly.** New source documents land first in `oem_crossref_staging`
/ `fitment_staging` (`catalog-migrations/115`, `116`), get flagged by
`validate_oem_crossref_staging.mjs` / `validate_fitment_staging.mjs` (no
product match, OEM# already linked elsewhere, unresolved/ambiguous model
code), get human review via `/admin/review-queue` for anything flagged, and
only then get promoted by `promote_oem_crossref_staging.mjs` /
`promote_fitment_staging.mjs`. Full architecture, confidence-score
convention, and the vendor join-key rules in `OEM_FITMENT_DATA_MODEL.md`.
Any future ingest script for these two tables should follow this pattern,
not write to `catalog_oem_crossref`/`catalog_fitment_v2` directly.

---

## Stage 4: Search indexing

`scripts/ingest/index_unified.js` pushes `catalog_unified` (plus
`product_details`) into Typesense. Run after any pass that changes
category/subcategory/fitment data, so search facets stay in sync.
`sync_fitment_flat_columns.mjs` should run first if `catalog_fitment_v2`
was just updated, since the flat columns it aggregates are part of what
gets indexed.

---

## Known gotchas (worth re-reading before writing a new ingest script)

1. **PU joins on `sku`, WPS and VTwin join on `vendor_sku`.** Getting this
   backwards silently returns a tiny fraction of real matches instead of
   erroring — always sanity-check match count against source table size
   before trusting a new join.
2. **PU warehouse quantity columns are text, not integer**, and can contain
   `"20+"` or `"N/A"`. Strip non-digits before parsing; never `parseInt` a
   raw value in a `WHERE` clause.
3. **WPS's `mapp_price` column name typo** is real vendor data, not a bug
   to fix — matching code needs to use the misspelled name.
4. **WPS's inventory filename is date-stamped and hardcoded** in
   `pull_wps_catalog.mjs`. A fresh export needs either a rename or a
   constant update, or the script hard-fails with a clear "missing file"
   error (which is at least safe — it won't run against stale data
   silently).
5. **`build_variant_groups.cjs`'s full-rebuild wipe must keep excluding
   `'ADMIN'`, `'MULTI'`, and `'LENGTH'`** or it silently deletes hand-curated
   and specialty variant groups on its next run. Two past incidents did
   exactly this before the exclusions were added.
6. **Large batch writes (10k+ rows) need batched commits and query
   timeouts**, not one long transaction on one connection. Confirmed this
   session: a single ~90k-row transaction hit a silent, error-free
   connection hang and made zero progress for 4 hours before being killed
   manually.
7. **`lib/db/browse.ts`'s dedup key must check `variant_group_id` before
   `canonical_product_id`**, not the reverse — canonical linking is
   heuristic and has confirmed false positives that would incorrectly
   merge real variants if it won priority.

---

## Running a full pipeline from scratch (rough order)

1. Refresh source tables: `pull_pu_pricefile.mjs`, `pull_wps_catalog.mjs`,
   `pull_vtwin_catalog.mjs` (all dry-run by default, `--apply` to write).
2. Merge/sync into `catalog_unified`: `sync_catalog_unified.mjs`.
3. Taxonomy: category-specific `rebuild_*_taxonomy.mjs` / `fix_*_taxonomy.mjs`
   scripts (see `MasterRef.md`'s Scripts Inventory for the current list —
   there is no single "rebuild everything" taxonomy script, it's
   category-by-category).
4. `build_canonical_products.mjs` (Phase A then Phase B).
5. `build_variant_groups.cjs`, then any specialty passes
   (`build_length_variant_groups.mjs`, etc.) that target what the
   name-based pass structurally can't reach.
6. `sync_vendor_offers.mjs --apply`.
7. `sync_catalog_media.mjs --apply` (or the WPS-specific image sync).
8. Fitment: `sync_fitment_flat_columns.mjs` after anything touching
   `catalog_fitment_v2`.
9. `index_unified.js` to push everything into Typesense.

Every script above is dry-run-by-default / `--apply`-to-write and
transactional (with per-row `SAVEPOINT` isolation on the newer ones) —
safe to re-run, and safe to interrupt.
