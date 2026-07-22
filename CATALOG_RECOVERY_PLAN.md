# Catalog Recovery Plan

**Incident:** 2026-07-18, `catalog_unified` was `TRUNCATE`d to zero rows by
`scripts/ingest/merge_catalog_unified.js` (no dry-run, no transaction, no
`--apply` guard). The `CASCADE` also wiped every table with a live foreign
key into `catalog_unified`. Full writeup in `HANDOFF_LOG.md` and this
conversation's history. The dangerous script is deleted; replacements exist
for everything it did (see Guardrails, bottom of this doc).

**This doc is a standalone handoff** — written so a fresh conversation with
no prior context can pick up recovery work immediately. Read "Start here,"
then the phase list.

---

## Start here (2026-07-20)

**What's fully done:** base catalog rebuild, all three vendor source tables
refreshed, category/subcategory/canonical-links/variant-groups/most-fitment
restored via a lucky Typesense snapshot find (see Phase 2). Phase 6
(relational fitment) and Phase 7 (OEM crossref, vendor offers, media) are
now also done (session 91-92) — see the status table below. The catalog is
in genuinely good shape end-to-end now.

**What's still missing, in priority order:**
1. **Phase 3 (reduced scope)** — ~6,794 `catalog_unified` rows (new products
   added after the July 17 Typesense snapshot, or previously-inactive rows)
   only have a rough regex-guessed `display_category`, no subcategory.
   **Do this next** — nothing higher-priority is outstanding.
2. **Phase 9** — full Typesense reindex, so search reflects everything
   that's been restored (fitment/crossref data landed after the last
   reindex).
3. **Phase 8** — low-priority orphaned-ID cleanup (`catalog_review_flags`,
   `catalog_variant_candidates`).

**What needs you specifically:**
- WPS refresh is blocked on `scripts/data/wps/master_item_wps.csv` and
  `scripts/data/wps/Catalogs/hdmstr_with_urls.csv` — both missing on disk.
  Need fresh exports from WPS.
- DB-level permission separation (make `TRUNCATE` actually impossible for
  the app's routine credential, not just absent from current scripts) needs
  Postgres superuser access on the Hetzner box — proposed, not done. You
  offered root access once already but we deferred it to focus on data
  recovery first; revisit when convenient.

**Nothing here is committed to git** — 428 files show as changed
(`git status --short`), all from this recovery + the earlier cleanup pass.
Review before committing.

---

## Current state (verified 2026-07-20)

| Table | Rows | Notes |
|---|---|---|
| `catalog_unified` | 97,122 | 100% have `display_category`; 90,328 have subcategory/canonical link/most fitment (Typesense restore); 53,479 have subcategory detail; 46,384 have OEM part number; 65,014 have `is_harley_fitment=true` (re-synced from `catalog_fitment_v2` after Phase 6); 20,334 tagged with a variant group |
| `pu_catalog` | 36,701 | Refreshed 2026-07-19, dealer price included |
| `wps_catalog` | 22,288 | Refreshed 2026-07-19 (session 91), plus `fitment` JSONB populated 2026-07-20 for 17,765 items |
| `vtwin_catalog` | 38,315 | Refreshed 2026-07-19 |
| `canonical_products` | 91,283 | Intact, now fully relinked to `catalog_unified` |
| `catalog_variant_groups` | 6,940 | Rebuilt 2026-07-19 |
| `catalog_variant_members` | 20,337 | Rebuilt 2026-07-19 |
| `catalog_variant_candidates` | 235 | Intact but orphaned `product_id` refs (Phase 8, low priority) |
| `catalog_review_flags` | 111 | Intact but orphaned `product_id` refs (Phase 8, low priority) |
| `oem_supersession` | 283 | Intact, survived untouched |
| `catalog_oem_crossref` | 43,316 | **Phase 7 DONE 2026-07-20** — fatbook/oldbook/WPS-Harley/VTwin-scrape/PU_PIES (29,835) + user-supplied structured CSV + merged XLSX (+13,481 net new). ~56% of the 76,937 historical peak. |
| `catalog_fitment_v2` | 3,223,471 | **Phase 6 DONE 2026-07-20** — base: PU (1,405,416 via `pu_fitment_expanded`), WPS (715,983), VTwin (352,274 via new `promote_vtwin_scrape_fitment.mjs`); + OEM-catalog promotion (`promote_oem_fitment.mjs`, 3 paths, run twice — once after base rebuild, once after the crossref-file addendum). ~55% of the 5,874,564 historical peak — see Phase 6/7 addenda for the known remaining gap. |
| `product_fitment_year_model` | 786,372 | **Phase 6 DONE 2026-07-20** — rebuilt via `build_fitment_year_ranges.cjs` (patched to drop a per-row-`UPDATE` perf bug that made it ~1800x slower than necessary), re-run twice as `catalog_fitment_v2` grew |
| `vendor_offers` | 90,544 | Done session 91 |
| `catalog_media` | 59,325 | Session 91 (WPS, 23,195) + PU brand-XML enrichment 2026-07-20 (36,130) |

---

## Phase 0 — Base data restore ✅ DONE

- [x] `pu_catalog`/`wps_catalog`/`vtwin_catalog` confirmed to have survived the incident untouched
- [x] Built `scripts/ingest/sync_catalog_unified.mjs` (upsert-only, never truncates, dry-run by default) to replace the deleted `merge_catalog_unified.js`
- [x] Ran it — `catalog_unified` rebuilt to 97,122 rows

## Phase 1 — Vendor source data freshness

- [x] **PU** — DONE. `pull_pu_pricefile.mjs --apply` (2026-07-19): 35,248/35,248 synced, 0 errors, dealer price restored.
- [x] **VTwin** — DONE. `pull_vtwin_catalog.mjs --apply`: 37,749/37,749 synced, 0 errors, `oem_numbers` rebuilt for 13,559 products.
- [ ] **WPS** — BLOCKED. `pull_wps_catalog.mjs` exists (syntax-validated, never run against real data). Missing source files: `scripts/data/wps/master_item_wps.csv`, `scripts/data/wps/Catalogs/hdmstr_with_urls.csv`. Get these from WPS, then: `node scripts/ingest/pull_wps_catalog.mjs` (dry run) → check counts → `--apply`.

## Phase 2 — Category, subcategory, canonical links, fitment ✅ DONE (via Typesense)

**Major discovery**: Typesense is a separate service from Postgres — the
`TRUNCATE` never touched it. Its `products` collection was built
**2026-07-17** (the day before the incident) with 90,483 documents, matching
the historical "90,483 active rows" figure from `HANDOFF_LOG.md` exactly.
Keyed by `sku` (verified to match `catalog_unified.sku` exactly for all
three vendors), it still had: `display_category`, `display_subcategory`,
`display_subcategory_detail`, `canonical_sku`, `oem_part_number`,
`oem_numbers`, full fitment fields, and era flags.

This was **exact historical data**, not reconstruction — far better than
guessing categories from regex on product names.

- [x] Exported the full collection: `scripts/data/recovery/typesense_export.jsonl` (90,483 docs)
- [x] Wrote `scripts/ingest/restore_from_typesense_snapshot.mjs` — matches by SKU, restores category/subcategory/detail/canonical link/fitment/era flags. `COALESCE`s OEM/canonical fields so nothing already-correct gets overwritten with null.
- [x] Ran it: 90,328/90,483 matched (99.83%), 0 errors, fully committed. The 155 unmatched are VTwin SKUs no longer in `vtwin_catalog` (likely discontinued between the July 17 snapshot and now).
- [x] For the ~6,794 rows with no Typesense match, ran a **fallback regex classifier** (`scripts/ingest/restore_display_category_full.mjs`, adapted from `scripts/ingest/_retired/rebuild_display_category_v2.mjs`'s `classify()` function — that script was written for surgical patching, this version removes the scope restriction to classify every row) — gives them a broad `display_category` only, no subcategory.

**Remaining gap**: those ~6,794 rows still need subcategory work — see reduced-scope Phase 3 below.

## Phase 3 — Subcategory rebuild for Typesense-unmatched rows (reduced scope)

Originally planned as a full ~20-category replay; **superseded by Phase 2**
for 90,328 of 97,122 rows. What's left is just the ~6,794 rows with no
Typesense match.

- [ ] Identify which categories these ~6,794 rows fall into (`SELECT display_category, count(*) FROM catalog_unified WHERE display_subcategory IS NULL GROUP BY 1 ORDER BY 2 DESC`)
- [ ] For those categories, the current/authoritative subcategory scripts are in `scripts/ingest/` directly (not archived): `rebuild_engine_taxonomy.mjs` + `detail_engine.mjs`, `rebuild_transmission_taxonomy_v2.mjs` + `detail_transmission_taxonomy.mjs`, `rebuild_foot_controls_taxonomy.mjs`, `rebuild_fuel_air_carbs_taxonomy.mjs` + `detail_fuel_air_carbs.mjs`, `rebuild_gaskets_seals_taxonomy_v2.mjs` + `rebuild_gaskets_detail_groups.mjs`, `rebuild_handlebars_taxonomy.mjs`, `rebuild_luggage_taxonomy.mjs` + `rebuild_luggage_detail_groups.mjs`, `rebuild_seating_detail_groups.mjs`, `rebuild_tools_chemicals_taxonomy.mjs`, `rebuild_subcategory_detail.mjs` (cross-category sweep)
- [ ] For categories not in that list, check `scripts/ingest/_retired/fix_X_taxonomy.mjs` (older generation, likely still authoritative for categories that never got a "rebuild_" upgrade) or `scripts/ingest/_unverified/fix_X_taxonomy.mjs` (lower confidence, read before running — see `CLEANUP_AUDIT.md`)
- [ ] **Sequencing note**: `category_cleanup_20260714*.sql` / `category_cleanup_20260715*.sql` (in `scripts/ingest/`) are rename/merge *refinement* passes on top of already-classified subcategories, not initial classifiers — run the rebuild/fix script for a category first, then these SQL files if that category appears in them, in `part` number order.
- [ ] These per-category scripts scope by `WHERE display_category = 'X' AND display_subcategory IS NULL` (or similar) and classify by product name — should be directly runnable without adaptation

## Phase 4 — Variant groups ✅ DONE

- [x] Ran `scripts/ingest/build_variant_groups.cjs` live (default is LIVE — pass `--dry` to preview, opposite convention from other scripts here). Its dry-run summary counter is buggy (reports "0 groups" despite real candidates found) — verify results via actual DB counts, not the console summary. Result: 6,940 groups, 20,337 members, 20,334 `catalog_unified` rows tagged. Script self-protects `ADMIN`/`MULTI` hand-curated groups from past incidents.
- If this ever needs re-running (e.g. after Phase 3 fills in more subcategories), it's a full idempotent rebuild — safe to rerun anytime.

## Phase 5 — Canonical product relinking ✅ DONE (folded into Phase 2)

`canonical_products` (91,283 rows) survived intact; `restore_from_typesense_snapshot.mjs` resolved `canonical_sku` → `canonical_products.id` and set `catalog_unified.canonical_product_id` for all 90,328 matched rows. No separate script needed.

## Phase 6 — Relational fitment tables ✅ DONE (2026-07-20)

`catalog_fitment_v2` (2,473,673 rows) and `product_fitment_year_model`
(538,093 rows) both rebuilt.

- [x] **PU fitment** — used `scripts/ingest/_unverified/promote_pu_fitment.cjs` against `pu_fitment_expanded` (1,640,065 source rows, already populated in the DB — not the CSV path originally assumed). 1,405,416 rows promoted, 18,610 products backfilled with `is_harley_fitment=true`. The CSV-based `import_pu_fitment.mjs`/`import_pu_fitment_fixed.mjs` scripts were **not used** — `pu_fitment_expanded` was the real, already-staged source.
- [x] **WPS fitment** — `import_wps_fitment.mjs` (live WPS API pagination, ~22K items, writes `wps_catalog.fitment` JSONB) then `promote_wps_fitment.cjs` (JSONB → `catalog_fitment_v2`, resolves model/year via `harley_model_years` + `model_alias_map`). 715,983 rows.
- [x] **VTwin fitment** — the CSV-based `import_vtwin_fitment_partial.mjs` was rejected: it also upserts new bare-bones `catalog_unified` products for unmatched SKUs (447 of 13,275), which would have reintroduced NULL-category rows. `import_vtwin_fitment_full.mjs` was confirmed broken (writes columns that don't exist on the current schema, deletes good data first — **do not use**). Instead wrote new `scripts/ingest/promote_vtwin_scrape_fitment.mjs`, sourcing directly from `vtwin_scrape_data` (19,695 rows, fresher and a 98% match rate against existing products, vs. 97% for the stale CSV) and touching only already-existing products. 352,274 rows.
- [x] `build_fitment_year_ranges.cjs` — rebuilds `product_fitment_year_model` from `catalog_fitment_v2` via gaps-and-islands SQL. **Patched a real perf bug**: the original did a bulk 500-row INSERT then a *separate per-row UPDATE* (no covering index) to set the array columns — ~9 rows/sec, ~16h projected for 538K rows. Fixed to insert everything in one pass; full run then took under a minute.
- [x] `oem_supersession` (283 rows) — confirmed untouched, no action needed.

## Phase 7 — OEM crossref, vendor offers, media

`vendor_offers` (90,544) and `catalog_media` (23,195) done session 91.
`catalog_oem_crossref` (14,199) done 2026-07-20:

- [x] `import_fatbook_crossref.js` — **fixed a real bug**: referenced a `vendor_sku` column that doesn't exist on `catalog_oem_crossref` (real column is `sku`) and would have failed on first run; also needed `DISTINCT ON` to avoid an `ON CONFLICT` double-update error from intra-file duplicates. Renamed to `.cjs` (this directory's `package.json` sets `"type": "module"`, so a bare `.js` fails as ESM). 3,940 rows, 95.5% match rate.
- [x] `import_oldbook_crossref.cjs` — fixed `ON CONFLICT` target (was `(sku, oem_number, oem_manufacturer)`, needed to be `(sku, oem_number)` to match the actual narrower unique index `catalog_oem_crossref_sku_oem_uniq`). ~1,973 net-new rows after cross-source overlap, 96.1% match rate.
- [x] `import_wps_harley_oem_crossref.js` — fixed a relative-path bug (`.env.local` resolution was two `../` short, silently loading nothing and falling back to a localhost DB connection). 1,651 rows, 603 WPS SKUs not found in `catalog_products` (skipped, not created).
- [x] `import_vtwin_oem_crossref.mjs --apply` — worked as-is (already dry-run-by-default). 6,635 rows from `vtwin_scrape_data.oem_no`.
- Explicitly **not used**: `import_oem_crossref.js` (unguarded `TRUNCATE oem_crossref`, wrong/legacy table — do not run), `import-oem-crossref.cjs`/`.js` hyphenated pair (stub/sample data only). HardDrive crossref (`import-harddrive-crossref.js`) skipped as optional/unconfirmed, not part of this pass.
- [x] `sync_fitment_flat_columns.mjs` (found in `scripts/ingest/_retired/` — archived after use, not superseded) re-run afterward: 31,996 products' flat fitment columns re-synced from the now-populated `catalog_fitment_v2`.

### Phase 7 addendum — PU brand XML enrichment ✅ DONE (2026-07-20)

A separate, previously-missed gap: the 133 PU brand XML files
(`scripts/data/pu_pricefile/brand_files/`) feed `catalog_media` (multi-image
galleries), `catalog_unified.product_details` (features/description JSONB),
and a `PU_PIES`-sourced slice of `catalog_oem_crossref` — none of which
`pu_fitment_expanded` (used above) touches. Both scripts live in
`scripts/ingest/_retired/`, not deleted:

- [x] `extract_pu_images.mjs` — **fixed a real bug**: it joined XML part
  numbers against `catalog_unified.vendor_sku`, but PU part numbers
  (`DS373701`, `99040977`, etc.) live in `catalog_unified.sku` — `vendor_sku`
  is frequently empty or holds an unrelated manufacturer code for PU rows
  (the same "PU joins on sku" gotcha documented elsewhere in this doc and in
  `VENDOR_DATA_PIPELINE.md`). The unfixed version matched <1% of rows
  (e.g. 0/6,753 for PU's own core Drag Specialties brand file). Also
  **fixed a perf bug**: the per-row `UPDATE` loop for features/descriptions
  (~25K individual round trips) was batched into set-based updates via
  `json_to_recordset`, matching the pattern established elsewhere this
  session. Result: 36,130 `catalog_media` rows (`source='pu_xml'`), 15,592
  products gained `product_details.features`, 9,492 gained
  `product_details.description`, 15,636 `catalog_oem_crossref` rows
  (`source='PU_PIES'`) — all consistent with the pre-incident historical
  figures (33,740 / — / 8,828 / 15,330).
- [x] `backfill_pu_brand_xml_fitment.mjs` — already correct (joins on `sku`,
  already batched, dry-run gated). Found 0 gap products to backfill, which
  is expected: the much larger `pu_fitment_expanded` promotion above already
  covers what this supplementary pass used to target.

### Phase 6 addendum — OEM-catalog fitment promotion ✅ DONE (2026-07-20)

After reporting the above as "done," the user asked whether we were back to
the pre-incident row counts. Honest answer: no — `catalog_fitment_v2` was at
2,473,673 vs. a last-recorded historical peak of 5,874,564 (21 distinct
sources, MasterRef.md). The dominant missing piece turned out to be a
two-stage pipeline, both scripts in `scripts/ingest/_retired/`:

- **`oem_fitment`** — a raw table of HD OEM part numbers mined from 121
  official Harley-Davidson OEM parts catalog PDFs (`build_oem_fitment_all.mjs`,
  source PDFs at `/Users/home/Desktop/Stanky/parts-catalogs`, outside the
  repo). This table **survived the incident** (no FK into `catalog_unified`,
  so the `TRUNCATE ... CASCADE` never touched it) — 315,427 rows, all 121
  catalogs already loaded. Ran `--match-only` to re-link `matched_product_id`
  against the now-current `catalog_unified`/`catalog_oem_crossref` — 95.8%
  of existing links were still valid, +2,326 new matches picked up (total
  38.6% matched — most of the remainder needs a bigger `catalog_oem_crossref`
  than we currently have, see below).
- **`promote_oem_fitment.mjs`** — promotes `oem_fitment` → `catalog_fitment_v2`
  via three paths: direct match (`oem_catalog_hd`, 0.95 confidence),
  VTwin-OEM-crossref bridge (`oem_crossref_vtwin`, 0.90), and
  fatbook/OEM-crossref bridge (`oem_crossref_fatbook`, 0.88), each with a
  lower-confidence "universal" (fits-all-models) variant. Already
  well-engineered — single set-based `INSERT...SELECT` per path (not
  per-row), `ON CONFLICT` upsert that keeps the highest confidence score and
  never downgrades a manual/higher-confidence row, dry-run support. **Fixed
  one real bug**: `PATH_A_SPECIFIC` inserted `oem_fitment.matched_product_id`
  directly with no validity check, unlike `PATH_A_UNIVERSAL` which correctly
  joins `catalog_unified` — hit a foreign-key violation on the ~5,072 rows
  whose `matched_product_id` still pointed at a pre-incident (now-deleted)
  ID. Added the same `JOIN catalog_unified` guard. The failed query left no
  partial writes (verified row count unchanged before re-running).

**Result**: +746,489 net-new rows. `catalog_fitment_v2` 2,473,673 →
**3,220,162** (~55% of the 5,874,564 historical peak, up from ~42%).
`product_fitment_year_model` rebuilt again: 538,093 → **785,218** rows.
`catalog_unified` flat fitment columns re-synced: 35,910 products (up from
31,996).

**Still not at full historical parity** — remaining known gaps, roughly in
order of likely size: Seating name-extraction backfill (+256,143 rows,
session 76, category-specific text-mining not yet re-run), Eastern/Colony/GMA-
specific historical backfills, EBC catalog fitment (3,005 rows), HD battery
fitment. Each of these was originally a separate, smaller one-off
script/session — lower priority than the two big pipelines above, not
investigated further this pass.

### Phase 7 addendum #2 — supplementary OEM crossref files, user-supplied (2026-07-20)

User supplied two files directly (outside the repo, at
`/Users/home/Desktop/Stanky/FITMENT/`): `Cross Reference Data-Table 1.csv`
(8,729 rows, structured fatbook/oldbook export — cleaner than the raw
`.txt` files parsed earlier, page numbers and dedup metadata intact) and
`OEM_Crossref_Merged.xlsx` (`OEM Crossref - Full` sheet, 8,291 wide rows —
one row per OEM number with a column per vendor: OldBook/FatBook/VTwin/
WPS — unpivoted into 10,677 long-format triples via a one-off script, saved
to `scripts/ingest/_unverified/oem_crossref_merged_xlsx_unpivoted.csv` for
re-runnability). Checked overlap against the DB before importing anything:
8,665/8,729 and 8,107/9,652 distinct pairs respectively were net-new.

New script `scripts/ingest/import_supplementary_oem_crossref.mjs` (dry-run
gated, batched, `ON CONFLICT (sku, oem_number) DO NOTHING`) combined both,
deduped within the import batch, inserted **13,481 net-new rows**.
`catalog_oem_crossref`: 29,835 → **43,316** (~56% of the 76,937 historical
peak, up from ~39%).

Re-ran the downstream chain since a bigger `catalog_oem_crossref` feeds
`promote_oem_fitment.mjs`'s Path C: `build_oem_fitment_all.mjs --match-only`
(+94 newly-matched `oem_fitment` rows), then `promote_oem_fitment.mjs`
again (+3,309 net-new `catalog_fitment_v2` rows — smaller gain than
expected, since most of the new crossref rows' OEM numbers don't overlap
with the HD-catalog-derived `oem_fitment.oem_part_no` values). Final:
`catalog_fitment_v2` **3,223,471** rows (~55% of peak), `product_fitment_year_model`
rebuilt again to **786,372** rows, flat columns re-synced for 35,929 products.

## Phase 8 — Low-priority cleanup

- [ ] `catalog_review_flags` (111 rows) and `catalog_variant_candidates` (235 rows) have `product_id` values pointing at deleted `catalog_unified` IDs (from before the incident, IDs were reset). Either re-derive by SKU match or accept as stale/historical and clear.

## Phase 9 — Full Typesense reindex

- [ ] Once Phases 6-7 land (or sooner, if you want search reflecting current state now), run a full reindex. Two candidate mechanisms found, need to confirm which is current: `/api/admin/reindex` (Vercel cron route, in `vercel.json`) or `scripts/ingest/index_unified.js` (standalone script, in `_retired/` per the cleanup audit — check it's not stale before using)

---

## Guardrails already in place (built during this recovery, don't redo)

- `scripts/check-no-destructive-sql.mjs` + `.git/hooks/pre-commit` (local only, not tracked by git) — blocks any `TRUNCATE`/`DROP TABLE` against protected tables in staged files
- `app/api/cron/backup-catalog-db/route.ts` — daily Supabase Storage backup of 14 core tables, 14-day retention, wired into `vercel.json` cron schedule
- Every script built this session (`sync_catalog_unified.mjs`, `pull_pu_pricefile.mjs`, `pull_wps_catalog.mjs`, `pull_vtwin_catalog.mjs`, `restore_from_typesense_snapshot.mjs`, `restore_display_category_full.mjs`) is upsert-only (never truncates), defaults to dry-run, requires `--apply` to write, wraps writes in a transaction with per-row `SAVEPOINT` isolation (so one bad row can't poison the whole batch — a real bug that happened once this session and was fixed)
- Deleted the actively dangerous scripts: `merge_catalog_unified.js`, `merge_vendors.js` (worse than the original — dropped and rebuilt the table with a stale schema), `import_pu_catalog.js`, `import_wps_catalog.js`, `import_vtwin_catalog.js` (all unconditional `TRUNCATE`, no `--apply` guard)
- **Not done yet**: DB-level permission separation (revoke `TRUNCATE` from the app's routine Postgres role). `catalog_app` currently *owns* the core tables, so a simple `REVOKE` won't work — needs a genuine Postgres superuser to create a properly separated, non-owning role. Needs your input/access to complete.

## Reference

- Full audit of what got archived vs. kept during the pre-recovery cleanup pass: `CLEANUP_AUDIT.md`
- Archived-but-still-usable scripts: `scripts/ingest/_retired/` (confirmed done/superseded) and `scripts/ingest/_unverified/` (lower confidence, read before running)
- Typesense export for reference/re-use: `scripts/data/recovery/typesense_export.jsonl`
- DB connection: `CATALOG_DATABASE_URL` in `.env.local` (self-hosted Postgres on Hetzner, role `catalog_app`)
- Typesense connection: `TYPESENSE_HOST`/`PORT`/`PROTOCOL`/`API_KEY`/`COLLECTION` in `.env.local`
