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

## Start here (2026-07-19)

**What's fully done:** base catalog rebuild, all three vendor source tables
refreshed, category/subcategory/canonical-links/variant-groups/most-fitment
restored via a lucky Typesense snapshot find (see Phase 2). The catalog is
in genuinely good shape for browsing/search already.

**What's still missing, in priority order:**
1. **Phase 6** — relational fitment tables (`catalog_fitment_v2`,
   `product_fitment_year_model`) are still at 0 rows. The *flat* fitment
   data on `catalog_unified` itself (year ranges, HD model codes) is back,
   but year-by-year/model-by-model fitment lookups aren't. **Do this next.**
2. **Phase 7** — `catalog_oem_crossref`, `vendor_offers`, `catalog_media` all
   still at 0 rows.
3. **Phase 3 (reduced scope)** — ~6,794 `catalog_unified` rows (new products
   added after the July 17 Typesense snapshot, or previously-inactive rows)
   only have a rough regex-guessed `display_category`, no subcategory.
4. **Phase 1 (WPS)** — blocked, needs fresh source files from you (see below).
5. **Phase 9** — full Typesense reindex once the above land, so search
   reflects everything that's been restored.

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

## Current state (verified 2026-07-19)

| Table | Rows | Notes |
|---|---|---|
| `catalog_unified` | 97,122 | 100% have `display_category`; 90,328 have subcategory/canonical link/most fitment (Typesense restore); 53,479 have subcategory detail; 46,384 have OEM part number; 45,358 have flat fitment data; 20,334 tagged with a variant group |
| `pu_catalog` | 36,701 | Refreshed 2026-07-19, dealer price included |
| `wps_catalog` | 22,278 | Untouched by incident; **stale**, blocked on source files |
| `vtwin_catalog` | 38,315 | Refreshed 2026-07-19 |
| `canonical_products` | 91,283 | Intact, now fully relinked to `catalog_unified` |
| `catalog_variant_groups` | 6,940 | Rebuilt 2026-07-19 |
| `catalog_variant_members` | 20,337 | Rebuilt 2026-07-19 |
| `catalog_variant_candidates` | 235 | Intact but orphaned `product_id` refs (Phase 8, low priority) |
| `catalog_review_flags` | 111 | Intact but orphaned `product_id` refs (Phase 8, low priority) |
| `oem_supersession` | 283 | Intact, survived untouched |
| `catalog_oem_crossref` | 0 | **Needs Phase 7** |
| `catalog_fitment_v2` | 0 | **Needs Phase 6** |
| `product_fitment_year_model` | 0 | **Needs Phase 6** |
| `vendor_offers` | 0 | **Needs Phase 7** |
| `catalog_media` | 0 | **Needs Phase 7** |

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

## Phase 6 — Relational fitment tables (NEXT UP)

`catalog_fitment_v2` and `product_fitment_year_model` are both still at 0
rows — the *flat* fitment columns on `catalog_unified` are back (Phase 2),
but these relational tables (used for fitment-filtered browse/search, not
just display) are not.

- [ ] PU fitment: `scripts/ingest/_unverified/import_pu_fitment.mjs` or `import_pu_fitment_fixed.mjs` — read both first, confirm which is current
- [ ] WPS fitment: `scripts/ingest/_unverified/import_wps_fitment.mjs`
- [ ] VTwin fitment: `scripts/ingest/_unverified/import_vtwin_fitment_full.mjs` or `import_vtwin_fitment_partial.mjs` — check for local source CSVs first (several large ones got archived to `_unverified/` during the pre-recovery cleanup pass, e.g. `vtwin_fitment_combined.csv`)
- [ ] `scripts/ingest/_unverified/build_fitment_year_ranges.cjs` — may already be redundant given Phase 2 restored `fitment_year_start`/`_end` directly; check before running
- [ ] `oem_supersession` table survived intact (283 rows, untouched) — no action needed there, but verify `mv_oem_fitment_coverage` materialized view (referenced in old HANDOFF sessions) still works / doesn't need a `REFRESH MATERIALIZED VIEW`

## Phase 7 — OEM crossref, vendor offers, media

All three still at 0 rows.

- [ ] `catalog_oem_crossref`: multiple `import_oem_crossref.*` versions exist across `scripts/ingest/_unverified/` — identify the current one (check file dates / HANDOFF_LOG mentions) plus HardDrive/WPS OEM crossref CSVs already in `scripts/data/` or `data/`
- [ ] `vendor_offers`: `scripts/ingest/_unverified/populate_wps_vendor_offers.cjs` (or `.js` sibling)
- [ ] `catalog_media`: current image/media pipeline not yet identified — likely tied to the fflate-based image proxy mentioned in old HANDOFF sessions; needs investigation before picking a script

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
