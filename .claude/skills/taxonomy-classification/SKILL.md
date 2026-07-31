---
name: taxonomy-classification
description: Guidance for working on the catalog's 3-tier taxonomy (display_category/display_subcategory/display_subcategory_detail) — running rebuild scripts, applying cleanup SQL, and the display-ordering policy. Use when classifying, auditing, or refining product categories/subcategories in catalog_unified.
---

**3-tier hierarchy**: `display_category` → `display_subcategory` → `display_subcategory_detail`

**Filter sidebar ordering** is controlled by `SUBCATEGORY_DISPLAY_GROUPS` in `lib/db/browse.ts` (not in a separate config file). Categories listed there get "type group first, then alphabetical" ordering; unlisted categories use count-DESC. Add entries here when a category completes its taxonomy pass.

**Policy**: subcategories with >150 products get detail groupings. Catch-all buckets ("General", "Misc", etc.) must be renamed or split on audit.

**Authoritative taxonomy scripts** live directly in `scripts/ingest/` (e.g. `rebuild_engine_taxonomy.mjs`, `rebuild_fuel_air_carbs_taxonomy.mjs`). The `_retired/` subdirectory holds scripts archived after use — not deleted, may need re-running. The `_unverified/` subdirectory has lower-confidence scripts; read carefully before running.

**`category_cleanup_20260714*.sql` / `20260715*.sql`** are refinement passes on top of already-classified subcategories, not initial classifiers — run the `rebuild_` script for a category first, then these SQL files in part-number order.
