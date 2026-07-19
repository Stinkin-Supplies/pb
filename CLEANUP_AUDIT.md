# Cleanup Audit — scripts/ingest/ and repo-root loose files

**Generated:** 2026-07-18 (research only — no files moved, deleted, or edited)
**Method:** filename patterns, file sizes, mtimes, `git log`, and grep-matching against `HANDOFF_LOG.md` (with special attention to the last ~18 session headers, lines 8–379, covering Session 90's eleven continuations back through Session 86). Where confidence was low, items were left in DEAD/UNCLEAR rather than guessed into a cleaner bucket. Only genuinely ambiguous files got a full `head`/content read.

---

## Summary

### Part 1 — `scripts/ingest/` (451 files found on disk, of an expected ~454)

| Bucket | Count | Disk footprint (approx) |
|---|---|---|
| **DANGEROUS** (TRUNCATE/DROP against protected tables) | **0** | — |
| **ACTIVE** (current pipeline + last-18-session taxonomy work) | **64** | ~0.9 MB |
| **SUPERSEDED** (clear newer replacement exists) | **13** | ~0.15 MB |
| **COMPLETED-ONE-OFF** (did its job, older sessions) | **86** | ~1.1 MB + 3.8 MB of two large JSON fixtures |
| **DEAD/UNCLEAR** (no HANDOFF trace, flagged for human review) | **285** | ~140 MB (dominated by `pu-zips/`-adjacent CSVs, `Archive.zip`, vtwin fitment CSVs) |
| **Total classified** | **448** | |

(The 5-file gap from "451 on disk" vs "454 expected" plus the ~3 stray non-file rows caught during processing is explained below in "Notes on the count.")

### Part 2 — Repo-root loose files

| Bucket | Count |
|---|---|
| Duplicate/superseded docs (docx/md pairs) | 8 |
| One-off audit/result output files | 16 |
| Large binaries/archives | 5 |
| Stray scripts/SQL that belong in `scripts/` | 13 |
| Other loose files (mixed) | 13 |
| **Total loose root files reviewed** | **55** |

---

## Notes on the count / things that don't fit neatly in a bucket

1. **Five files are already gone, mid-flight.** `git status` shows `scripts/ingest/import_pu_catalog.js`, `import_wps_catalog.js`, `import_vtwin_catalog.js`, `merge_catalog_unified.js`, and `merge_vendors.js` as staged deletions (`D`, not yet committed) — they no longer exist on disk. This is exactly the "deleted script called `merge_catalog_unified.js`" referenced in the task context; the replacement (`pull_pu_pricefile.mjs` / `pull_wps_catalog.mjs` / `pull_vtwin_catalog.mjs` / `sync_catalog_unified.mjs`) is already staged as new files. **No action needed from this audit** — this migration is already in progress in the working tree, just uncommitted. Flagging only so it isn't mistaken for something this audit found and left undone.
2. **A whole earlier pipeline generation still exists on disk, seemingly unreferenced by the new one.** `scripts/ingest/README.md` documents a 4-stage `pipeline.js` → `stage0-*.cjs` → `normalize_*.js` flow feeding `raw_vendor_*` tables — this is a *third*, even older generation than the one being deleted in note 1. Nothing in the new `pull_*.mjs`/`sync_catalog_unified.mjs` scripts references it. Grouped under SUPERSEDED/DEAD below with that context noted; recommend a human confirm it's truly dead before archiving, since fitment-specific pieces of it may not have a replacement in the new pipeline.
3. **One phantom row was caught and removed.** An intermediate processing step of this audit briefly produced a bogus `filename` entry (a header row that leaked in from a `sort`); it does not correspond to a real file and has been excluded from all counts above.
4. **A literal shell-error string is a real, 645 KB filename.** `scripts/ingest/wps_new_description_backfill.csv: No such file or directory` exists on disk exactly as typed — almost certainly `2>&1 | tee ...` output redirection gone wrong, producing a garbage filename that happens to hold real CSV content. Listed once, under the clutter group.

---

## Part 1 — `scripts/ingest/`

### DANGEROUS — 0 files

Ran `node scripts/check-no-destructive-sql.mjs`: **"OK — no TRUNCATE/DROP TABLE against protected tables in 583 scanned file(s)."** Nothing to flag.

### ACTIVE — 64 files

Current pipeline (`pull_pu_pricefile.mjs`, `pull_wps_catalog.mjs`, `pull_vtwin_catalog.mjs`, `sync_catalog_unified.mjs`, `build_variant_groups.cjs`), the brand-normalization subsystem currently wired into `sync_catalog_unified.mjs` (`brandNormalizationMap.mjs`, `generate_normalize_brands_sql.mjs` — has an uncommitted diff right now — and its generated `normalize_brands.sql`), plus every taxonomy rebuild/detail/fix/audit script referenced in HANDOFF_LOG sessions 86–90 (the last ~18 session headers), including all 26 `category_cleanup_202607{14,15}_part*.sql` files from the Session 86–87 SQL cleanup passes.

| File | Size | Last touched |
|---|---|---|
| `audit_engine_footcontrols_general.mjs` | 9K | 2026-07-18 |
| `audit_fuel_air_carbs_general.mjs` | 9K | 2026-07-17 |
| `audit_tools_chemicals.mjs` | 3K | 2026-07-17 |
| `brandNormalizationMap.mjs` | 9K | 2026-07-06 |
| `build_variant_groups.cjs` | 54K | 2026-07-18 |
| `category_cleanup_20260714_part10.sql` | 18K | 2026-07-14 |
| `category_cleanup_20260714_part11.sql` | 7K | 2026-07-14 |
| `category_cleanup_20260714_part12.sql` | 8K | 2026-07-14 |
| `category_cleanup_20260714_part14.sql` | 4K | 2026-07-14 |
| `category_cleanup_20260714_part2.sql` | 5K | 2026-07-14 |
| `category_cleanup_20260714_part3.sql` | 3K | 2026-07-14 |
| `category_cleanup_20260714_part4.sql` | 5K | 2026-07-14 |
| `category_cleanup_20260714_part6.sql` | 1K | 2026-07-14 |
| `category_cleanup_20260714_part7.sql` | 2K | 2026-07-14 |
| `category_cleanup_20260714_part9.sql` | 7K | 2026-07-14 |
| `category_cleanup_20260714.sql` | 12K | 2026-07-14 |
| `category_cleanup_20260715_part1.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part10.sql` | 4K | 2026-07-15 |
| `category_cleanup_20260715_part11.sql` | 3K | 2026-07-15 |
| `category_cleanup_20260715_part12.sql` | 3K | 2026-07-15 |
| `category_cleanup_20260715_part13.sql` | 5K | 2026-07-15 |
| `category_cleanup_20260715_part14.sql` | 2K | 2026-07-15 |
| `category_cleanup_20260715_part15.sql` | 3K | 2026-07-15 |
| `category_cleanup_20260715_part2.sql` | 807B | 2026-07-15 |
| `category_cleanup_20260715_part3.sql` | 2K | 2026-07-15 |
| `category_cleanup_20260715_part4.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part5.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part6.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part7.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part8.sql` | 1K | 2026-07-15 |
| `category_cleanup_20260715_part9.sql` | 713B | 2026-07-15 |
| `detail_engine.mjs` | 5K | 2026-07-18 |
| `detail_fuel_air_carbs.mjs` | 5K | 2026-07-17 |
| `detail_transmission_taxonomy.mjs` | 9K | 2026-07-18 |
| `fix_air_cleaner_kits_tubes_bolts.mjs` | 6K | 2026-07-17 |
| `fix_cables_universal_misfiles.mjs` | 3K | 2026-07-18 |
| `fix_pushrods_in_camchest.mjs` | 2K | 2026-07-18 |
| `fix_tools_cargo_tiedowns_covers.mjs` | 4K | 2026-07-17 |
| `flag_fuel_air_carbs_general_stragglers.mjs` | 4K | 2026-07-17 |
| `generate_normalize_brands_sql.mjs` | 2K | 2026-07-18 |
| `move_brake_pedals_to_foot_controls.mjs` | 2K | 2026-07-18 |
| `normalize_brands.sql` | 10K | 2026-07-07 |
| `promote_air_cleaner_inserts_covers.mjs` | 3K | 2026-07-17 |
| `promote_breather_tubes.mjs` | 2K | 2026-07-17 |
| `promote_complete_air_cleaner_kits.mjs` | 2K | 2026-07-17 |
| `pull_pu_pricefile.mjs` | 17K | 2026-07-18 |
| `pull_vtwin_catalog.mjs` | 11K | 2026-07-18 |
| `pull_wps_catalog.mjs` | 10K | 2026-07-18 |
| `rebuild_engine_taxonomy.mjs` | 7K | 2026-07-18 |
| `rebuild_foot_controls_taxonomy.mjs` | 8K | 2026-07-17 |
| `rebuild_fuel_air_carbs_taxonomy.mjs` | 8K | 2026-07-17 |
| `rebuild_gaskets_detail_groups.mjs` | 6K | 2026-07-17 |
| `rebuild_gaskets_seals_taxonomy_v2.mjs` | 12K | 2026-07-17 |
| `rebuild_handlebars_taxonomy.mjs` | 14K | 2026-07-17 |
| `rebuild_luggage_detail_groups.mjs` | 6K | 2026-07-17 |
| `rebuild_luggage_taxonomy.mjs` | 9K | 2026-07-17 |
| `rebuild_seating_detail_groups.mjs` | 8K | 2026-07-17 |
| `rebuild_subcategory_detail.mjs` | 26K | 2026-07-15 |
| `rebuild_tools_chemicals_taxonomy.mjs` | 10K | 2026-07-17 |
| `rebuild_transmission_taxonomy_v2.mjs` | 16K | 2026-07-18 |
| `redistribute_hardware_misc_20260715.mjs` | 7K | 2026-07-15 |
| `session88_seating_fixes.mjs` | 7K | 2026-07-16 |
| `sweep_sensors_to_electrical.mjs` | 4K | 2026-07-18 |
| `sync_catalog_unified.mjs` | 27K | 2026-07-18 |


### SUPERSEDED — 13 files

Clear newer-version pairs, confirmed either by explicit HANDOFF_LOG text or by file content/mtime comparison (not guessed).

| File | Size | Last touched | Superseded by |
|---|---|---|---|
| `audit_frame_hardware.mjs` | 4K | 2026-07-14 | audit_frame_hardware_v2.mjs — written 4 min later, same session |
| `audit_riding_gear_accessories.mjs` | 3K | 2026-07-13 | audit_riding_gear_accessories_v2.mjs — written 96 min later, same session |
| `audit_riding_gear.mjs` | 5K | 2026-07-13 | audit_riding_gear_v2.mjs — written 70 min later, same session |
| `build_fitment.js` | 20K | 2026-04-26 | build_fitment_v2.js — populates the real catalog_fitment_v2 table |
| `fix_transmission_taxonomy.mjs` | 16K | 2026-07-09 | rebuild_transmission_taxonomy_v2.mjs — v1 16-bucket structure explicitly superseded per HANDOFF session 90-x11 |
| `import_jwboon_fitment_v2.mjs` | 27K | 2026-05-08 | import_jwboon_fitment_v3.mjs — v3 changed join path entirely |
| `import_jwboon_fitment.mjs` | 16K | 2026-05-08 | import_jwboon_fitment_v3.mjs |
| `import_pu_fitment.mjs.save` | 13K | 2026-05-17 | import_pu_fitment.mjs — editor .save artifact, near-duplicate |
| `import-oem-crossref.js.old` | 6K | 2026-04-08 | import-oem-crossref.js / import_oem_crossref.js / import-oem-crossref.cjs — explicit .old suffix, 3 other same-purpose files exist |
| `index_assembly.js.backup` | 12K | 2026-04-07 | index_assembly_optimized.cjs — explicit .backup suffix |
| `indexTypesense.js.OLD.js` | 8K | 2026-04-02 | current Typesense indexing path — explicit OLD suffix |
| `pipeline.js` | 6K | 2026-04-26 | pull_pu_pricefile.mjs / pull_wps_catalog.mjs / pull_vtwin_catalog.mjs / sync_catalog_unified.mjs — Gen-1 orchestrator (README-documented), superseded by todays pipeline |
| `rebuild_luggage_racks_taxonomy.mjs` | 12K | 2026-07-07 | rebuild_luggage_taxonomy.mjs — category renamed Luggage & Racks to Saddlebags/Sissy Bars & Luggage, session 89 |


**Also relevant to this bucket but not literally in `scripts/ingest/`** (see note 2 above): `pipeline.js`'s own dependency chain — `preflight.js`, `preflight_fitment_schema.mjs`, `stage0-aces.cjs`, `stage0-pies.cjs`, `stage0-pu-baseprice.cjs`, `stage0-pu-dealerprice.cjs`, `stage0-wps-master-files.cjs`, `stage0-wps-taxonomy.cjs`, `normalize_pu.js`, `normalize_wps.js`, `normalize_pies.js` — are listed in the DEAD/UNCLEAR grouped tables below (under "stage0-*/phaseN" and the WPS/PU pattern groups) rather than here, because unlike the 13 above, no newer file directly grep-matches them by name; the supersession is inferred from the pipeline generation gap (Gen-1 CSV→raw_vendor_* vs. today's Gen-3 pull_*.mjs→catalog_unified), which is a good-confidence but not filename-certain call. Recommend human confirmation before archiving.

### COMPLETED-ONE-OFF — 86 files

Did their job in an earlier, specifically-dated HANDOFF_LOG session (41 through 85); mentioned by name, described as applied/done. Sorted oldest-session-context first. Two large JSON fixtures (`_eastern_raw.json` 2.6 MB, `vtwin_scrape_checkpoint.json` 1.2 MB) are companion data files to one-off imports/scrapes in this same list — safe to archive together with their script.

| File | Size | Last touched | HANDOFF session context |
|---|---|---|---|
| `fix_fenders_body_merge.mjs` | 3K | 2026-07-14 | Session 85 (July 14 2026) — Three duplicate/overlapping categories consolidated:… |
| `audit_fenders_body_merge.mjs` | 3K | 2026-07-14 | Session 85 (July 14 2026) — Three duplicate/overlapping categories consolidated:… |
| `fix_suspension_frames_merge.mjs` | 11K | 2026-07-14 | Session 85 (July 14 2026) — Three duplicate/overlapping categories consolidated:… |
| `fix_suspension_merge_final_subcats.mjs` | 3K | 2026-07-14 | Session 85 (July 14 2026) — Three duplicate/overlapping categories consolidated:… |
| `fix_frame_hardware_consolidate.mjs` | 5K | 2026-07-14 | Session 85 (July 14 2026) — Three duplicate/overlapping categories consolidated:… |
| `index_unified.js` | 18K | 2026-07-06 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `sync_fitment_flat_columns.mjs` | 4K | 2026-07-02 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `report_category_breakdown.mjs` | 4K | 2026-07-13 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `audit_fenders_body.mjs` | 3K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `audit_final_stragglers.mjs` | 2K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `audit_security_covers.mjs` | 2K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `audit_suspension_merge_and_reopened.mjs` | 3K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `fix_fenders_body.mjs` | 4K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `fix_final_stragglers.mjs` | 10K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `fix_frame_hardware.mjs` | 11K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `fix_security_covers.mjs` | 5K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `fix_tools_chemicals.mjs` | 8K | 2026-07-14 | Session 84 (July 14 2026) — Entire session-83 to-do list closed out: Riding Gear… |
| `category_breakdown_report.md` | 9K | 2026-07-14 | Session 83 (July 13 2026) — Accessories & Misc fully resolved end-to-end; Brakes… |
| `fix_accessories_misc_final.mjs` | 47K | 2026-07-13 | Session 83 (July 13 2026) — Accessories & Misc fully resolved end-to-end; Brakes… |
| `fix_brakes_oddballs.mjs` | 3K | 2026-07-13 | Session 83 (July 13 2026) — Accessories & Misc fully resolved end-to-end; Brakes… |
| `fix_accessories_misc_taxonomy.mjs` | 12K | 2026-07-12 | Wheels, Tires & Axles — COMPLETE (session 81, July 12 2026) |
| `audit_full_catalog_health.mjs` | 5K | 2026-07-12 | Full catalog health check — completed, follow-up in progress (session 81, July 1… |
| `audit_accessories_misc_crossclassify.mjs` | 6K | 2026-07-12 | Full catalog health check — completed, follow-up in progress (session 81, July 1… |
| `audit_accessories_misc_nulls.mjs` | 6K | 2026-07-12 | Full catalog health check — completed, follow-up in progress (session 81, July 1… |
| `infer_vtwin_categories.mjs` | 59K | 2026-06-24 | ⚠️ Blocking work, unrelated to taxonomy — WORSENED this session |
| `fix_cables_taxonomy.mjs` | 28K | 2026-07-10 | ⚠️ Blocking work, unrelated to taxonomy — WORSENED this session |
| `audit_tanks_body_scope.mjs` | 6K | 2026-07-10 | Immediate target: next category in the queue (session 79 note — superseded, see … |
| `audit_brakes_holdback.mjs` | 5K | 2026-07-10 | Brakes cleanup (the 96 held-back rows) |
| `classify_brakes_holdback.mjs` | 8K | 2026-07-10 | Brakes cleanup (the 96 held-back rows) |
| `fix_tanks_body_taxonomy.mjs` | 21K | 2026-07-10 | Tanks & Body — new category, 4-source migration |
| `classify_brakes.mjs` | 13K | 2026-07-10 | Classifier build — regression harness caught real bugs twice |
| `test_classify_brakes.mjs` | 35K | 2026-07-10 | Classifier build — regression harness caught real bugs twice |
| `BRAKES_SESSION_NOTES.md` | 4K | 2026-07-10 | The real finding: WPS "Brake - front" raw category is not pure brakes |
| `audit_gaskets_seals_scope.mjs` | 4K | 2026-07-09 | Two Category-Level Migrations (a new script shape) |
| `fix_gaskets_seals_migration.mjs` | 11K | 2026-07-09 | Two Category-Level Migrations (a new script shape) |
| `fix_engine_taxonomy.mjs` | 15K | 2026-07-09 | Within-Category Rebuilds |
| `fix_electrical_taxonomy.mjs` | 15K | 2026-07-09 | Within-Category Rebuilds |
| `fix_lighting_taxonomy.mjs` | 12K | 2026-07-10 | Within-Category Rebuilds |
| `fix_handlebar_controls_mirrors_taxonomy.mjs` | 12K | 2026-07-10 | Within-Category Rebuilds |
| `fix_fuel_air_taxonomy.mjs` | 17K | 2026-07-09 | Within-Category Rebuilds |
| `backfill_seating_name_fitment.mjs` | 16K | 2026-07-08 | What Was Done |
| `fix_flfx_softail_miscode.mjs` | 7K | 2026-07-08 | What Was Done |
| `fix_seating_hardware_miscategorization.mjs` | 17K | 2026-07-08 | What Was Done |
| `fix_exhaust_taxonomy.mjs` | 11K | 2026-07-08 | What Was Done |
| `exclude_display_fixtures.sql` | 3K | 2026-07-07 | WHERE WE ARE |
| `build_pack_size_groups.mjs` | 15K | 2026-06-23 | WHERE WE ARE |
| `audit_brand_duplicates.sql` | 2K | 2026-07-06 | What Was Done |
| `build_canonical_products.mjs` | 25K | 2026-07-07 | What Was Done |
| `rebuild_display_category_v2.mjs` | 19K | 2026-07-05 | What Was Done |
| `audit_missing_variant_vocab.cjs` | 6K | 2026-07-06 | What Was Done |
| `fix_product_vendors_drift.mjs` | 5K | 2026-07-04 | What Was Done |
| `test_orphan_crossref_matching.mjs` | 7K | 2026-07-04 | What Was Done |
| `audit_fitment_oem_health.mjs` | 10K | 2026-07-04 | What Was Done |
| `delete_oem_junk_tokens.mjs` | 4K | 2026-07-04 | What Was Done |
| `link_orphaned_oem_crossref.mjs` | 11K | 2026-07-04 | What Was Done |
| `sync_oem_numbers_from_crossref.mjs` | 7K | 2026-07-04 | What Was Done |
| `backfill_oem_crossref_from_flat_array.mjs` | 6K | 2026-07-04 | What Was Done |
| `delete_impossible_future_model_years.mjs` | 6K | 2026-07-04 | What Was Done |
| `audit_canonical_matches.mjs` | 8K | 2026-07-03 | WHERE WE ARE |
| `check_proposal_coverage.mjs` | 4K | 2026-07-03 | What Was Done |
| `generate_brand_part_number_proposals.mjs` | 7K | 2026-07-03 | What Was Done |
| `bulk_confirm_brand_part_number_proposals.mjs` | 4K | 2026-07-04 | What Was Done |
| `split_false_merge_groups.mjs` | 10K | 2026-07-04 | What Was Done |
| `backfill_pu_brand_xml_fitment.mjs` | 12K | 2026-07-02 | What Was Done |
| `backfill_colony_catalog_fitment.mjs` | 11K | 2026-07-02 | What Was Done |
| `backfill_eastern_crossref_fitment.mjs` | 13K | 2026-07-02 | What Was Done |
| `build_oem_part_timeline.mjs` | 5K | 2026-06-30 | What Was Done |
| `06_create_oem_part_timeline_table.sql` | 2K | 2026-06-30 | Files Changed This Session |
| `build_oem_fitment_all.mjs` | 38K | 2026-06-29 | Next Session Starting Points |
| `promote_oem_fitment.mjs` | 13K | 2026-06-29 | Next Session Starting Points |
| `import_eastern_crossref.mjs` | 12K | 2026-06-29 | What Was Done |
| `_eastern_raw.json` | 2.6M | 2026-06-29 | What Was Done |
| `build_oem_fitment.mjs` | 24K | 2026-05-08 | What Was Done |
| `build_oem_fitment_dyna.mjs` | 23K | 2026-05-08 | What Was Done |
| `build_oem_fitment_fx.mjs` | 23K | 2026-05-08 | What Was Done |
| `build_oem_fitment_softail.mjs` | 23K | 2026-05-08 | What Was Done |
| `build_oem_fitment_touring.mjs` | 24K | 2026-05-08 | What Was Done |
| `import_bike_specs.mjs` | 44K | 2026-06-27 | What Was Done |
| `build_product_details.mjs` | 17K | 2026-06-26 | WHERE WE ARE |
| `scrape_vtwin_missing.mjs` | 11K | 2026-06-24 | WHERE WE ARE |
| `parse_vtwin_fitment_raw.mjs` | 7K | 2026-06-24 | What Was Done |
| `vtwin_scrape_checkpoint.json` | 1.2M | 2026-06-24 | What Was Done |
| `generate_vtwin_skus.js` | 6K | 2026-06-24 | What Was Done |
| `extract_pu_images.mjs` | 14K | 2026-06-24 | What Was Done |
| `scan_pack_qty_from_names.mjs` | 9K | 2026-06-23 | What Was Done |
| `ingest_vtwin_unified.js` | 11K | 2026-06-23 | What Was Done |


### DEAD/UNCLEAR — 285 files

No HANDOFF_LOG mention found by filename (grepped against the full 2,619-line log, not just the recent window). Grouped by naming/purpose pattern for readability; grouping is a convenience, not a confidence claim — see the per-group caveats.

**Read this caveat before acting on any of these:** several of the audit/fix pairs in the "Riding Gear / Accessories & Misc / Frame & Hardware" and "Ungrouped" sections below (e.g. `audit_brakes_scope.mjs`, `audit_cables_scope.mjs`, `audit_dashes_gauges_scope.mjs`, `audit_foot_controls_scope.mjs`, `audit_frames_suspension_scope.mjs`, `audit_hardware_covers_general_scope.mjs`, `fix_brakes_taxonomy.mjs`, `fix_cables_stragglers.mjs`, `fix_dashes_gauges_taxonomy.mjs`, `fix_foot_controls_taxonomy.mjs`, `fix_frames_suspension_taxonomy.mjs`, `fix_hardware_covers_general_taxonomy.mjs`, `fix_wheels_tires_axles_taxonomy.mjs`, and similar) share the *exact* `audit_X_scope.mjs` / `fix_X_taxonomy.mjs` naming convention and July 10–14 date range as the confirmed COMPLETED-ONE-OFF bucket above, and almost certainly did the same kind of one-time category work described narratively (but not by exact script filename) in HANDOFF_LOG sessions 79–86. I did **not** reclassify them as COMPLETED-ONE-OFF because I could not find their literal filenames in the log text — that's a real gap in my confidence, not evidence they're actually dead. A human who can cross-reference session numbers against dates would likely be able to move most of this group to COMPLETED-ONE-OFF quickly.


#### Non-script clutter sitting in scripts/ingest/ (docs, data dumps, backups, checkpoints) (24)

| File | Size | Last touched |
|---|---|---|
| `accessories_misc_current copy.csv` | 28K | 2026-07-13 |
| `accessories_misc_current.csv` | 18K | 2026-07-13 |
| `accessories_misc_remaining.csv` | 35K | 2026-07-13 |
| `brakes_holdback_audit.txt` | 807B | 2026-07-10 |
| `category_map.json` | 88B | 2026-04-07 |
| `fatbookcrossref.txt` | 94K | 2026-05-23 |
| `HANDOFF_LOG.md` **(see note below)** | 190K | 2026-07-10 |
| `HANDOFF_PATCH2.md` | 9K | 2026-06-24 |
| `oldbook-crossref.txt` | 19K | 2026-05-25 |
| `oldbookcrossref.txt` | 117K | 2026-05-23 |
| `package-lock.json` | 50K | 2026-05-12 |
| `package.json` | 449B | 2026-05-12 |
| `README.md` | 11K | 2026-04-26 |
| `vtwin_checkpoint_export.csv` | 10.2M | 2026-06-08 |
| `vtwin_fitment_combined.csv` | 19.2M | 2026-06-04 |
| `vtwin_fitment_final.csv` | 6.2M | 2026-05-30 |
| `vtwin_fitment_missing.csv` | 13.0M | 2026-06-03 |
| `vtwin_fitment_partial.csv` | 5.8M | 2026-05-30 |
| `vtwin_fitment.csv` | 8.6M | 2026-06-08 |
| `vtwin_scrape_targets_2.csv` | 157K | 2026-06-07 |
| `wave4b_deactivate_backup_1783911324216.csv` | 298B | 2026-07-12 |
| `wave4b_delete_backup_1783910885835.csv` | 298B | 2026-07-12 |
| `wps_harley_oem_cross_reference.csv` | 94K | 2026-04-26 |
| `wps_new_description_backfill.csv` | 645K | 2026-07-01 |

#### test_/debug_/check_/diagnose_/probe_/inspect_ one-off scratch scripts (15)

| File | Size | Last touched |
|---|---|---|
| `check_annotated_ids_current_state.mjs` | 4K | 2026-07-13 |
| `check_brand_enrichment_images.mjs` | 8K | 2026-06-16 |
| `check_dead_images.mjs` | 10K | 2026-06-16 |
| `check_product_image_column.mjs` | 6K | 2026-06-16 |
| `check_wps.mjs` | 803B | 2026-05-13 |
| `debug-insert.js` | 5K | 2026-03-29 |
| `diagnose-wps-import.cjs` | 7K | 2026-04-07 |
| `inspect_vendor_columns.mjs` | 594B | 2026-05-13 |
| `probe_wps_attrs.cjs` | 5K | 2026-05-20 |
| `probe_wps_products.cjs` | 6K | 2026-05-20 |
| `test_attribute_values.js` | 5K | 2026-04-09 |
| `test_dealer_pricing.js` | 4K | 2026-04-09 |
| `test_index.js` | 1K | 2026-04-19 |
| `test_wps_token.js` | 3K | 2026-04-09 |
| `test-insert.js` | 5K | 2026-03-29 |

#### WPS-specific import/enrich/update/stage/fetch scripts (older WPS pipeline generations) (39)

| File | Size | Last touched |
|---|---|---|
| `backfill_wps_product_ids.cjs` | 4K | 2026-05-20 |
| `build_wps_canonical_proposals.cjs` | 6K | 2026-06-14 |
| `create_wps_catalog.sql` | 3K | 2026-05-12 |
| `delete_wps.cjs` | 979B | 2026-04-07 |
| `enrich_wps_attributes.js` | 5K | 2026-04-09 |
| `enrich_wps_content.js` | 10K | 2026-04-26 |
| `extract_wps_fitment.cjs` | 6K | 2026-04-07 |
| `extract_wps_hyperlinks.py` | 2K | 2026-04-07 |
| `fetch_wps_pricing.js` | 5K | 2026-04-09 |
| `fetch_wps_reference_data.js` | 10K | 2026-04-09 |
| `fetch-wps-hd-tire-images.cjs` | 7K | 2026-04-07 |
| `fix_wps27.cjs` | 847B | 2026-05-21 |
| `fix_wps8687.cjs` | 726B | 2026-05-21 |
| `import_wps_fitment.mjs` | 8K | 2026-05-22 |
| `import_wps_harley_oem_crossref.js` | 6K | 2026-04-26 |
| `import_wps_inventory.js` | 9K | 2026-04-09 |
| `import_wps_manual_fitment.mjs` | 21K | 2026-05-15 |
| `import_wps_pricing.js` | 8K | 2026-04-09 |
| `import-wps-images-flexible.cjs` | 8K | 2026-04-07 |
| `import-wps-images-from-csv.cjs` | 5K | 2026-04-07 |
| `normalize_wps.js` | 11K | 2026-04-02 |
| `populate_wps_vendor_offers.cjs` | 5K | 2026-05-19 |
| `populate_wps_vendor_offers.js` | 6K | 2026-05-19 |
| `promote_wps_fitment.cjs` | 9K | 2026-07-01 |
| `pull_wps_attributes.cjs` | 7K | 2026-05-20 |
| `reimport_wps_harddrive.cjs` | 8K | 2026-04-07 |
| `setup_wps_tables.js` | 7K | 2026-04-09 |
| `split_wps27.cjs` | 2K | 2026-05-21 |
| `stage0-wps-master-files.cjs` | 13K | 2026-04-07 |
| `stage0-wps-taxonomy.cjs` | 5K | 2026-04-03 |
| `update_wps_catalog_flags.js` | 5K | 2026-04-19 |
| `update_wps_categories.cjs` | 5K | 2026-04-07 |
| `update_wps_pricing.js` | 4K | 2026-04-19 |
| `update_wps_product_features.cjs` | 3K | 2026-04-07 |
| `wps_api_integration.js` | 12K | 2026-04-09 |
| `wps_new_description_backfill.csv: No such file or directory` | 645K | 2026-07-01 |
| `wps-import-images.js` | 8K | 2026-04-06 |
| `wps-ingest.js` | 10K | 2026-03-29 |
| `wps-master-item-import.cjs` | 8K | 2026-05-08 |

#### PU (Parts Unlimited) -specific import/enrich/backfill/stage scripts (older PU pipeline generations) (7)

| File | Size | Last touched |
|---|---|---|
| `normalize_pu.js` | 18K | 2026-07-18 |
| `pu-import-prices.js` | 6K | 2026-03-31 |
| `pu-ingest.js` | 15K | 2026-03-30 |
| `pu-price-sync-route.ts` | 2K | 2026-04-01 |
| `pu-xml-import.js` | 14K | 2026-04-14 |
| `stage0-pu-baseprice.cjs` | 8K | 2026-04-04 |
| `stage0-pu-dealerprice.cjs` | 7K | 2026-04-04 |

#### VTwin-specific import/enrich/scrape/checkpoint scripts (older VTwin pipeline generations) (10)

| File | Size | Last touched |
|---|---|---|
| `build_vtwin_crossref.mjs` | 7K | 2026-05-07 |
| `enrich_vtwin_content.js` | 10K | 2026-04-26 |
| `enrich_vtwin_from_scrape.mjs` | 26K | 2026-06-03 |
| `import_vtwin_fitment_full.mjs` | 13K | 2026-06-03 |
| `import_vtwin_fitment_partial.mjs` | 23K | 2026-06-07 |
| `import_vtwin_manual_fitment.mjs` | 21K | 2026-05-14 |
| `import_vtwin_oem_crossref.mjs` | 8K | 2026-06-26 |
| `import_vtwin_scrape_round2.mjs` | 16K | 2026-06-10 |
| `ingest_vtwin_fitment.cjs` | 9K | 2026-05-21 |
| `migrate_vtwin_fitment_to_v2.js` | 8K | 2026-04-30 |

#### OEM crossref / fitment build scripts (fitment subsystem, pre-dates or parallels current taxonomy work) (35)

| File | Size | Last touched |
|---|---|---|
| `03_migrate_fitment_fk.sql` | 4K | 2026-04-29 |
| `backfill_pu_fitment_structured.js` | 13K | 2026-04-30 |
| `build_fitment_from_oem.mjs` | 9K | 2026-05-13 |
| `build_fitment_v2.js` | 16K | 2026-04-29 |
| `build_fitment_year_ranges.cjs` | 15K | 2026-05-23 |
| `extract_fitment_db_driven.js` | 16K | 2026-04-26 |
| `extract_fitment_from_names.js` | 19K | 2026-04-26 |
| `extract_fitment_from_names.mjs` | 17K | 2026-06-04 |
| `extract_pu_oem_numbers.cjs` | 4K | 2026-04-07 |
| `import_battery_oem_crossref.mjs` | 9K | 2026-06-26 |
| `import_ebc_fitment.mjs` | 14K | 2026-06-26 |
| `import_fatbook_crossref.cjs` | 4K | 2026-05-23 |
| `import_fatbook_crossref.js` | 7K | 2026-05-23 |
| `import_harddrive_crossref.js` | 6K | 2026-04-30 |
| `import_hd_battery_fitment.mjs` | 11K | 2026-06-26 |
| `import_hd_parts_fitment.mjs` | 7K | 2026-05-13 |
| `import_jwboon_fitment_v3.mjs` | 9K | 2026-05-28 |
| `import_oem_crossref.js` | 7K | 2026-05-12 |
| `import_oldbook_crossref.cjs` | 4K | 2026-05-23 |
| `import_pu_fitment_fixed.mjs` | 13K | 2026-05-16 |
| `import_pu_fitment.mjs` | 12K | 2026-05-17 |
| `import_pu_manual_fitment.mjs` | 20K | 2026-05-15 |
| `import-harddrive-crossref.js` | 6K | 2026-04-11 |
| `import-oem-crossref.cjs` | 6K | 2026-04-08 |
| `import-oem-crossref.js` | 6K | 2026-04-08 |
| `infer_fitment_staging.js` | 20K | 2026-04-30 |
| `ingest_pu_fitment_scrape.cjs` | 11K | 2026-05-19 |
| `link_handlebar_oem.mjs` | 7K | 2026-06-26 |
| `migration_add_oem_table.sql` | 2K | 2026-04-08 |
| `normalize_hd_fitment_models.sql` | 9K | 2026-05-02 |
| `parse_fitment.js` | 20K | 2026-04-30 |
| `preflight_fitment_schema.mjs` | 3K | 2026-05-16 |
| `promote_fitment_staging.js` | 7K | 2026-04-30 |
| `promote_pu_fitment.cjs` | 7K | 2026-05-21 |
| `trace_oem_junk_source.mjs` | 4K | 2026-07-04 |

#### stage0-* / phaseN / early pipeline generation scripts (7)

| File | Size | Last touched |
|---|---|---|
| `phase1_2_harley_authority.js` | 25K | 2026-04-26 |
| `phase2-descriptions.js` | 6K | 2026-03-31 |
| `phase2-images.js` | 8K | 2026-03-30 |
| `phase2-merge.cjs` | 16K | 2026-04-07 |
| `phase2-offers.js` | 6K | 2026-03-30 |
| `stage0-aces.cjs` | 3K | 2026-04-04 |
| `stage0-pies.cjs` | 2K | 2026-04-02 |

#### Riding Gear / Accessories & Misc / Frame & Hardware audit-fix one-off scripts (older sessions, no HANDOFF text match found but same naming family as documented completed work) (21)

| File | Size | Last touched |
|---|---|---|
| `audit_accessories_misc_subcat_sample.mjs` | 3K | 2026-07-12 |
| `audit_accessories_misc_wave2.mjs` | 4K | 2026-07-12 |
| `audit_accessories_misc_wave3.mjs` | 4K | 2026-07-12 |
| `audit_accessories_misc_wave4.mjs` | 5K | 2026-07-12 |
| `audit_frame_hardware_consolidate.mjs` | 5K | 2026-07-14 |
| `audit_frame_hardware_v2.mjs` | 3K | 2026-07-14 |
| `audit_riding_gear_accessories_v2.mjs` | 6K | 2026-07-13 |
| `audit_riding_gear_apparel.mjs` | 3K | 2026-07-14 |
| `audit_riding_gear_helmets.mjs` | 4K | 2026-07-14 |
| `audit_riding_gear_missed_378.mjs` | 2K | 2026-07-14 |
| `audit_riding_gear_v2.mjs` | 3K | 2026-07-13 |
| `export_accessories_misc_current.mjs` | 2K | 2026-07-13 |
| `export_accessories_misc_remaining.mjs` | 2K | 2026-07-12 |
| `fix_accessories_misc_batch2.mjs` | 18K | 2026-07-13 |
| `fix_accessories_misc_wave2.mjs` | 11K | 2026-07-12 |
| `fix_accessories_misc_wave3.mjs` | 11K | 2026-07-12 |
| `fix_accessories_misc_wave4.mjs` | 6K | 2026-07-12 |
| `fix_accessories_misc_wave4b.mjs` | 15K | 2026-07-12 |
| `fix_riding_gear_accessories.mjs` | 8K | 2026-07-14 |
| `fix_riding_gear_helmets_apparel.mjs` | 8K | 2026-07-14 |
| `fix_riding_gear_missed_378.mjs` | 5K | 2026-07-14 |

#### lookup_*/sample_*/scope_*/explore_* — small one-off exploratory/investigation scripts (14)

| File | Size | Last touched |
|---|---|---|
| `bucket_missed_merges.mjs` | 6K | 2026-07-03 |
| `explore_variant_data.cjs` | 9K | 2026-05-20 |
| `explore_variant_data2.cjs` | 8K | 2026-05-20 |
| `find_part_number_dupes.mjs` | 14K | 2026-05-13 |
| `lookup_batch2_categories.mjs` | 3K | 2026-07-13 |
| `lookup_existing_categories.mjs` | 4K | 2026-07-12 |
| `lookup_final_batch_categories.mjs` | 1K | 2026-07-13 |
| `lookup_final_categories.mjs` | 2K | 2026-07-12 |
| `lookup_more_categories.mjs` | 2K | 2026-07-12 |
| `lookup_torque_linkage.mjs` | 2K | 2026-07-12 |
| `sample_camchest.mjs` | 3K | 2026-07-13 |
| `sample_dash_subcats.mjs` | 2K | 2026-07-13 |
| `scope_wave4_cluster.mjs` | 3K | 2026-07-12 |
| `summarize_bad_images.mjs` | 3K | 2026-06-16 |

#### import-/export- product-group, canonical, variant scripts (canonical-matching subsystem) (6)

| File | Size | Last touched |
|---|---|---|
| `apply_oversize_variants.cjs` | 8K | 2026-06-13 |
| `build_pu_variant_groups.cjs` | 11K | 2026-05-21 |
| `build-product-groups.js` | 17K | 2026-04-13 |
| `index_product_groups.js` | 15K | 2026-04-11 |
| `migrate_variant_options_to_junction.sql` | 2K | 2026-07-02 |
| `triage_canonical_proposals.cjs` | 7K | 2026-06-14 |

#### generate_/build_ SKU, price, index scripts (9)

| File | Size | Last touched |
|---|---|---|
| `04_verify_pricing_joins.sql` | 3K | 2026-04-29 |
| `assign-internal-skus.js` | 21K | 2026-04-11 |
| `daily_price_sync.js` | 10K | 2026-04-29 |
| `download_pu_pricefile.js` | 4K | 2026-04-10 |
| `import_pricing_json.js` | 6K | 2026-04-09 |
| `import_pricing_ultra_fast.js` | 4K | 2026-04-09 |
| `import_pu_pricing.js` | 8K | 2026-04-09 |
| `importPuPriceFile.js` | 18K | 2026-04-26 |
| `index_assembly_optimized.cjs` | 13K | 2026-04-21 |

#### misc numbered/dated SQL migration or map scripts (no HANDOFF trace) (13)

| File | Size | Last touched |
|---|---|---|
| `02_populate_catalog_unified.sql` | 3K | 2026-04-29 |
| `03_migrate_fks_to_unified.sql` | 7K | 2026-04-29 |
| `add_missing_models.sql` | 6K | 2026-05-29 |
| `audit_database.sql` | 3K | 2026-04-09 |
| `create_pu_catalog.sql` | 5K | 2026-05-12 |
| `fix_hd_models_engine_split.sql` | 11K | 2026-04-30 |
| `fix_transmission_blanks.sql` | 3K | 2026-06-07 |
| `map_all_blanks.sql` | 10K | 2026-06-07 |
| `map_subcategory_carb_fuel.sql` | 13K | 2026-06-07 |
| `map_subcategory_engine.sql` | 12K | 2026-06-08 |
| `merge_wire_spool_groups.sql` | 5K | 2026-06-05 |
| `migrate_add_missing_models.sql` | 4K | 2026-05-16 |
| `seed_vintage_model_years.sql` | 4K | 2026-05-02 |

#### Ungrouped — miscellaneous one-off scripts, no pattern match, no HANDOFF mention (85)

| File | Size | Last touched |
|---|---|---|
| `analyze_catalog_data.js` | 5K | 2026-04-09 |
| `Archive.zip` | 48.9M | 2026-04-14 |
| `audit_brakes_scope.mjs` | 10K | 2026-07-10 |
| `audit_cables_misroutes.mjs` | 4K | 2026-07-13 |
| `audit_cables_scope.mjs` | 9K | 2026-07-11 |
| `audit_chopper_supplies_scope.mjs` | 6K | 2026-07-12 |
| `audit_dashes_gauges_scope.mjs` | 9K | 2026-07-11 |
| `audit_foot_controls_scope.mjs` | 7K | 2026-07-11 |
| `audit_frames_suspension_scope.mjs` | 11K | 2026-07-11 |
| `audit_hardware_covers_general_scope.mjs` | 12K | 2026-07-11 |
| `audit_merchandising_scope.mjs` | 4K | 2026-07-12 |
| `audit_remaining_cleanup.mjs` | 4K | 2026-07-13 |
| `audit_suspension_frames_merge.mjs` | 4K | 2026-07-14 |
| `audit_suspension_nulls_scope.mjs` | 4K | 2026-07-12 |
| `audit_suspension_small_subcats.mjs` | 2K | 2026-07-14 |
| `audit_tools_chemicals_v2.mjs` | 2K | 2026-07-14 |
| `audit_wheels_tires_axles_scope.mjs` | 11K | 2026-07-11 |
| `audit_wrong_category_65.mjs` | 3K | 2026-07-12 |
| `backfill_pu_catalog_refs.js` | 12K | 2026-04-19 |
| `backfill_pu_dimensions.js` | 10K | 2026-04-20 |
| `build-catalog-allowlist.js` | 6K | 2026-04-04 |
| `cleanup_non_harddrive.cjs` | 5K | 2026-04-07 |
| `computed_values.js` | 12K | 2026-04-04 |
| `create_plain_handlebar_subcat.mjs` | 3K | 2026-07-17 |
| `create_toolbox_subcat.mjs` | 3K | 2026-07-17 |
| `create-intent-route.ts` | 5K | 2026-07-02 |
| `DEALER_W_BOTH_DEALER_AND_RETAIL 2.CSV` | 12.1M | 2026-06-22 |
| `delete_metric_pu_brands.cjs` | 4K | 2026-04-07 |
| `detail_levers_hand_controls.mjs` | 4K | 2026-07-17 |
| `enrich_brand_logos.mjs` | 10K | 2026-05-16 |
| `enrich_harddrive.js` | 11K | 2026-04-09 |
| `enrich_pu_catalog_xml.js` | 11K | 2026-05-12 |
| `enrich_pu_products.cjs` | 9K | 2026-04-29 |
| `enrich_pu_xml_comprehensive.js` | 17K | 2026-05-19 |
| `enrich_pu_xml.js` | 17K | 2026-04-26 |
| `export_catalog.js` | 2K | 2026-04-18 |
| `extract_all_pu_data.cjs` | 9K | 2026-04-08 |
| `extract_harddrive_images.py` | 4K | 2026-04-09 |
| `extract_pu_specs.js` | 12K | 2026-04-19 |
| `fix_ape_hangers_stray_hardware.mjs` | 3K | 2026-07-17 |
| `fix_beach_bars_to_plain_handlebar.mjs` | 2K | 2026-07-17 |
| `fix_brakes_taxonomy.mjs` | 14K | 2026-07-10 |
| `fix_burly_wiring_and_twist_grips.mjs` | 5K | 2026-07-17 |
| `fix_cables_misroutes.mjs` | 4K | 2026-07-13 |
| `fix_cables_stragglers.mjs` | 21K | 2026-07-11 |
| `fix_chemicals_misfiled_tools.mjs` | 5K | 2026-07-17 |
| `fix_dashes_gauges_taxonomy.mjs` | 13K | 2026-07-11 |
| `fix_final_two.mjs` | 3K | 2026-07-13 |
| `fix_five_category_subcat_pass.mjs` | 10K | 2026-07-12 |
| `fix_foot_controls_taxonomy.mjs` | 8K | 2026-07-11 |
| `fix_frames_suspension_taxonomy.mjs` | 18K | 2026-07-11 |
| `fix_hardware_covers_general_taxonomy.mjs` | 18K | 2026-07-11 |
| `fix_merchandising_taxonomy.mjs` | 6K | 2026-07-12 |
| `fix_remaining_cleanup.mjs` | 9K | 2026-07-13 |
| `fix_risers_in_drag_bars.mjs` | 2K | 2026-07-17 |
| `fix_suspension_null_reclassify.mjs` | 9K | 2026-07-12 |
| `fix_wheels_tires_axles_taxonomy.mjs` | 12K | 2026-07-11 |
| `fix_wrong_category_65.mjs` | 10K | 2026-07-12 |
| `import_attribute_values_fixed.js` | 5K | 2026-04-09 |
| `import_harddrive_imagelist_fast.js` | 8K | 2026-04-09 |
| `import_harddrive_imagelist.js` | 6K | 2026-04-09 |
| `import_harddrive_ultra_fast.js` | 9K | 2026-04-09 |
| `import_hd_handlebar_specs.mjs` | 27K | 2026-06-26 |
| `import_pu_brand_catalogs_WORKING.js` | 15K | 2026-04-10 |
| `import_pu_brand_catalogs.js` | 13K | 2026-04-09 |
| `import_pu_brand_xml.js` | 24K | 2026-05-21 |
| `import_pu_filtered.js` | 14K | 2026-05-08 |
| `import-local-hd-images.cjs` | 772B | 2026-04-07 |
| `ingest_ds_xml.js` | 10K | 2026-04-26 |
| `normalize_pies.js` | 10K | 2026-04-14 |
| `parse_pu_data.js` | 9K | 2026-04-09 |
| `patch_touring.js` | 3K | 2026-05-02 |
| `pdp_fallback_patch.js` | 2K | 2026-04-15 |
| `preflight.js` | 3K | 2026-03-29 |
| `progress_bar.js` | 4K | 2026-04-19 |
| `raw_import.js` | 4K | 2026-04-02 |
| `rebuild_audio_communication_detail.mjs` | 7K | 2026-07-07 |
| `rebuild_electronics_mounts.mjs` | 7K | 2026-07-07 |
| `rebuild_handlebars_hardware_accessories.mjs` | 9K | 2026-07-17 |
| `rebuild_harley_model_years.mjs` | 11K | 2026-05-13 |
| `rebuild_windshields_fairings_taxonomy.mjs` | 12K | 2026-07-07 |
| `run_pu_enrichment.js` | 2K | 2026-04-26 |
| `scan_zip_contamination_full.mjs` | 12K | 2026-06-16 |
| `sweep_pending_mismatches.mjs` | 6K | 2026-06-16 |
| `sync_pu_status.cjs` | 9K | 2026-06-14 |


### Non-directory clutter and other flags worth a human's attention, inside `scripts/ingest/`

- **`HANDOFF_LOG.md` (190 KB, frozen July 10)** sitting inside `scripts/ingest/` is a **stale duplicate** of the real root `/HANDOFF_LOG.md` (now 338 KB / 2,619 lines, updated today). A future session skimming this folder could read 8 sessions of stale state as current. Recommend deleting — it's a snapshot copy, not a source file.
- **`Archive.zip` (48.9 MB, April 14)** — large zip sitting directly in `scripts/ingest/`, never referenced in HANDOFF_LOG. Likely an old snapshot backup of the scripts folder itself (root also has a separate `ingest_scripts.zip`, see Part 2). Flag for human review — probably safe to delete given git history exists, but not verified.
- **`pu-zips/` subdirectory (88 MB, 43 vendor zip files)** and **`pu-extracted/` (16 KB, contains one stray `phase2-images.js`)** — raw vendor brand-catalog zips, likely inputs to the old `import_pu_brand_xml.js`/`import_pu_brand_catalogs.js` scripts (both in DEAD/UNCLEAR above). Not enumerated file-by-file per the task's file-count scope, but worth a human decision on whether the source zips are still needed now that `pu_catalog` is populated a different way.
- **`sql/` subdirectory (7 files, 52 KB)** — numbered DB migration files (`migration-120-internal-sku.sql`, etc.). These look like legitimate schema-migration history; recommend leaving alone (not part of the "delete candidate" conversation).
- **`package.json` / `package-lock.json` inside `scripts/ingest/`** — this is legitimate: a real, separate `npm install`-able package for the ingest scripts (per `scripts/ingest/README.md`'s own quick-start). Not clutter, just noting it's not itself a script to classify.
- **`category_map.json` (88 bytes, April 7)** — a 3-entry brand→category map (`WPS_BRAKE`, `WPS_ELECTRICAL`, `PU_HELMET`). Tiny and orphaned-looking next to the full taxonomy-rebuild system built since; not grep-matched to any current script. DEAD/UNCLEAR, human call.
- **`create-intent-route.ts`** — this is not an ingest script at all; it's a draft/staging copy of `app/api/stripe/create-intent/route.ts`. A `diff` against the live route shows the live file has since been updated further (points-discount logic added) — this copy predates that. Stray, safe DELETE-candidate.
- **Explicit backup/old-marker files**, all safe DELETE-candidates given their naming: `import-oem-crossref.js.old`, `indexTypesense.js.OLD.js`, `index_assembly.js.backup`, `import_pu_fitment.mjs.save`.
- **Two accidental empty/garbage csvs**: `wave4b_deactivate_backup_1783911324216.csv` and `wave4b_delete_backup_1783910885835.csv` (298 bytes each) — timestamp-suffixed safety backups from a single specific accessories-misc "wave4b" pass, now historical. Safe to archive with their originating script.

---

## Part 2 — Repo-root loose files

### Duplicate/near-duplicate docs — which is authoritative

| Current (keep) | Superseded sibling(s) | Recommendation |
|---|---|---|
| `MasterRef.md` (93 KB, **updated today** 07-18) | `MasterRef_May8.md` (12 KB, May 9), `MasterRef_Addendum.docx` (11 KB, June 3) | ARCHIVE the two older files — `MasterRef.md` is ~8x larger and actively maintained |
| `ROADMAP.md` (89 KB, **updated today** 07-18) | `ROADMAP.docx` (12 KB, May 16) | ARCHIVE the `.docx` — clearly an early snapshot |
| `HANDOFF_LOG.md` (338 KB, root, current — excluded from this review per instructions) | `HANDOFF_LOG.docx` (15 KB, June 4), `HANDOFF_April19_2026.md` (10 KB, April 19) | ARCHIVE both — the log's own header says it "consolidates forward"; these predate that consolidation |
| `CHASE_LIST.docx` (12 KB, "Last Updated: June 4 2026 — Thirty-Eighth Pass") | functionally superseded by HANDOFF_LOG.md's own "NEXT SESSION: START HERE" section | ARCHIVE/DELETE-candidate — 52 sessions stale, same job now done at the top of HANDOFF_LOG.md |

### One-off audit/result output files — safe archive candidates (run outputs, not source)

| File | Size | Note |
|---|---|---|
| `DB_AUDIT_REPORT.md` | 67K | Generated 2026-04-14, schema snapshot; DB has changed massively across 90 sessions since |
| `DB_SAMPLE_ROWS.json` | 403K | Companion sample-rows dump to the same April 14 audit |
| `audit_output.txt` | 172B | Trivial one-off output |
| `bad_content_type_images_2026-06-16T08-12-21.csv` | 49K | Dated run output |
| `dead_images_2026-06-16T05-37-47.csv` | 83B | Dated run output (3 near-identical files, same day, different seconds — looks like 3 retries of the same script) |
| `dead_images_2026-06-16T05-39-10.csv` | 333B | ″ |
| `dead_images_2026-06-16T08-12-21.csv` | 211B | ″ |
| `fitment_audit_results.txt` | 40B | Output of `fitment_audit.sql` |
| `fitment_audit_v2_results.txt` | 58K | Output of `fitment_audit_v2.sql` |
| `hd_models_correction_results.txt` | 2.4K | Output of `hd_models_correction.sql` |
| `hd_models_correction_v2_results.txt` | 4.6K | Output of `hd_models_correction_v2.sql` |
| `hd_models_correction_v4_results.txt` | 8.1K | Output of `hd_models_correction_v4.sql` |
| `riding_gear_audit_output.txt` | 773B | Dated run output |
| `schema_results.txt` | 4.3K | Output of `schema_check.sql` |
| `unified_backfill_oem_fitment_fast_results.txt` | 399B | Run output, filename implies a companion script that no longer appears at root |
| `unified_backfill_oem_fitment_results.txt` | 533B | ″ |
| `unified_catalog_audit_results.txt` | 18K | Run output |
| `zip_scan_report_2026-06-16T19-43-37.csv` | 4.4M | Dated run output — large for what it is, likely a full-catalog scan dump |

### Large binaries/archives

| File | Size | Apparent purpose | Recommendation |
|---|---|---|---|
| `pricing.json` | 20.2 MB | Raw pricing dump, dated April 9 — pipeline now pulls pricing live via `pull_pu_pricefile.mjs`/`pull_wps_catalog.mjs`. Likely derivable fresh from source, not a unique artifact. | Human review — probably archivable |
| `catalog_fitment_enriched.csv` | 13.2 MB | May 17 fitment export; the fitment subsystem has had multiple generations since (see DEAD/UNCLEAR "OEM crossref / fitment" group in Part 1) | Human review |
| `ingest_scripts.zip` | 47.8 MB | Undated-looking zip of ingest scripts, April 9 mtime — likely an old full backup of `scripts/ingest/` from early in the project, now heavily superseded (git history exists) | Archive/delete candidate, but verify nothing unique is trapped inside first |
| `no_fitment_no_oem_2026-07-01.csv` | 2.5 MB | Dated one-off audit output (rows with neither fitment nor OEM numbers) | Archive candidate |
| `vtwin_no_fitment_2026-07-02.csv` | 2.1 MB | Dated one-off audit output, VTwin-specific | Archive candidate |
| `variant_backup_20260705.sql` | 864 KB | Named as a pre-migration safety pg_dump from July 5 — two weeks+ stale now, and a proper `backups/` directory (228 MB) already exists at root for this purpose | Archive/consolidate into `backups/`, or delete if superseded there |

*(Note: `Archive.zip` inside `scripts/ingest/` — see Part 1 — is a separate, second large zip; not the same file as `ingest_scripts.zip`.)*

### Stray scripts/SQL that look like they belong in `scripts/ingest/` or `scripts/data/`, not root

| File | Size | Note |
|---|---|---|
| `build_variant_groups.cjs` | 25K | **Stale duplicate** of the actively-maintained `scripts/ingest/build_variant_groups.cjs` (which has an uncommitted edit right now) — `diff` confirms the root copy is missing content the ingest copy has (a "June 18" axis-dedup rule). Safe DELETE-candidate. |
| `fix_pu_categories.sql` | 5.7K | One-off PU category fix by part-number prefix; belongs with the other one-off category SQL in `scripts/ingest/`, not root |
| `hd_models_correction.sql` | 15K | v1 of a 3-step sequential DB correction (v2, v4 also at root — no v3 ever existed on disk, same numbering-gap pattern seen in `scripts/ingest/category_cleanup_*`) |
| `hd_models_correction_v2.sql` | 16K | v2, superseded by v4 |
| `hd_models_correction_v4.sql` | 15K | Final/current version of the sequence — still a one-off completed correction, not ongoing |
| `schema_check.sql` | 1.4K | One-off schema audit query |
| `fitment_audit.sql` | 9.1K | One-off fitment audit (v1, superseded by v2 below) |
| `fitment_audit_v2.sql` | 11K | Supersedes `fitment_audit.sql` |
| `tier3_candidate_finder.sql` | 3.4K | Session-74 tier-3 detail-classification tool — functionally superseded by the more general `scripts/ingest/rebuild_subcategory_detail.mjs` (ACTIVE, still being extended every session) |
| `tier3_final_mappings.sql` | 21K | Session-74 companion to the above, same supersession note |
| `parse_models.js` / `parse_platforms.js` / `parse_years.js` | <2K each | Small regex-helper fragments (model/platform/year detection). No shebang, no visible module exports in the first few lines — unclear if these are standalone runnable scripts or copy-paste reference snippets. DEAD/UNCLEAR, human call. |
| `patch_era_hero.js` | 10K | One-off patch script for `app/era/[slug]/page.jsx` — either already applied or abandoned; check if the JSX still needs it before archiving |
| `pdp_fallback_patch.js` | 2.1K | One-off patch script for `app/shop/[slug]/page.jsx`, same caveat as above |
| `test-env.js` | 163B | Trivial env-var debug script (`console.log(process.env...)`) — zero ongoing value, DELETE-candidate |

### Other loose files at root (mixed)

| File | Size | Note / recommendation |
|---|---|---|
| `SELECT` | 3.1K | A raw `psql -x` record-format query output, accidentally saved to a file literally named `SELECT` (no extension). Zero source value. DELETE-candidate. |
| `OEM_SUPERSESSION_HANDOFF.md` | 23K | Architecture doc dated June 14, marked "Status: Schema designed, not yet implemented" — HANDOFF_LOG's own Session-49 entry (same date) shows the `oem_supersession` table *was* built that session. Doc is now a historical design reference, not current status. KEEP as architecture reference or ARCHIVE — human call, not urgent either way. |
| `FOLDER_BREAKDOWN.md` | 12K | Repo folder-structure map — no date signal found in a quick peek; worth a human check for whether it still matches current `app/`/`lib/` structure after the UI overhaul (see `UI_OVERHAUL_ROADMAP.md`, started July 14) |
| `taxonomy_v2_plan.md` | 7.9K | Original "Plan v1" doc for the category-rebuild pipeline (~July 5). Actively cross-referenced by code comments (e.g. `rebuild_display_category_v2.mjs` cites "§6"). KEEP — still a live reference even though the plan itself is 13 sessions old. |
| `filter_roadmap.md` | 30K | Filtering-system roadmap, "Last Updated: July 10, Session 77" — recent enough to be a live planning doc. KEEP. |
| `UI_OVERHAUL_ROADMAP.md` | 9.3K | Started July 14, explicitly parallel-tracked to ROADMAP.md/MasterRef.md. KEEP — active. |
| `TYPESENSE_FORMAT_DOCUMENTATION.md` | 12K | Reference doc, no obvious staleness signal from filename alone — human call |
| `TYPESENSE_README.md` | 4.5K | Possible overlap/duplicate purpose with the above — worth a 2-minute compare |
| `typesense_schema_complete.json` | 4.4K | A Typesense collection schema export, dated April 26. Given how many reindexes have happened since (every taxonomy session ends in "Reindexed"), this export is likely stale relative to the live schema. DEAD/UNCLEAR — can't confirm currency without querying live Typesense. |
| `canonical_product_system.html` | 12K | Looks like an HTML/CSS design fragment (admin UI mockup?) — purpose unclear from a quick peek. DEAD/UNCLEAR. |
| `README.md` | 1.5K | Standard, excluded from review per instructions — noted only because it's very short (1.5K) for a project this size; human may want to expand it, not a cleanup item |
| `Downloads/` (empty dir except `.DS_Store`) and `echo/` (fully empty dir) | — | Not "files" per the task's file-list scope, but both look like accidental `mkdir`s sitting at repo root. Trivial DELETE-candidates if a human wants to tidy. |

---

## What to do with this report

Nothing has been moved, deleted, or edited. Suggested next steps for a human:
1. Skim the **SUPERSEDED** table (Part 1) and the **duplicate-docs** table (Part 2) first — highest confidence, smallest risk.
2. Decide on the "already in progress" Gen-2 pipeline deletion (note 1) — it's mid-flight in git, not something this audit needs to act on.
3. Spend the most review time on the **DEAD/UNCLEAR** caveat block — the `audit_X_scope.mjs`/`fix_X_taxonomy.mjs` pairs that look completed but weren't grep-confirmed are the highest-value thing to reclassify correctly before any bulk archive.
4. Large binaries (Part 2) are the best bang-for-buck disk-space win (~85 MB combined) if a human confirms they're derivable from current source data.
