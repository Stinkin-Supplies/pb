# OEM Supersession Architecture — Handoff Document
**Project:** Stinkin' Supplies  
**Feature:** OEM part change tracking + smarter part-finding queries  
**Date:** 2026-06-14  
**Status:** Schema designed, not yet implemented  

---

## 1. What This Is and Why It Exists

Harley-Davidson replaces OEM part numbers over time (e.g. `37909-84` becomes `37909-84A` in 2000, then `37909-84B` in 2007). Vendors list aftermarket parts under one or more of these numbers. Without tracking these chains:

- A user searching for "1995 Dyna primary tensioner" who types in the 2000+ OEM number gets no results
- Products get siloed under one OEM number even though they cover bikes across the entire chain
- Kit products (which "include" a component OEM) never surface when someone searches by that component's OEM

**The fix:** A single new table (`oem_supersession`) plus one materialized view (`mv_oem_fitment_coverage`). No existing tables change. No data is destroyed. The worst-case rollback is `DROP TABLE oem_supersession CASCADE` and `DROP MATERIALIZED VIEW mv_oem_fitment_coverage`.

---

## 2. Existing Schema Context

These tables already exist and are NOT modified by this feature.

### `catalog_unified`
Main product table. 96,711 rows. SKU prefixes: `WPS-`, `VT-`, or raw PU SKU.  
Key columns: `id`, `sku`, `name`, `source_vendor` (always uppercase), `is_active`, `is_universal`, `display_category`, `display_subcategory`.

### `catalog_oem_crossref`
Canonical OEM ↔ product bridge. 20,836 rows. `product_id` FK already backfilled.  
Key columns: `id`, `product_id` (FK → catalog_unified.id), `oem_number`.  
Source: FatBook/OldBook PDFs + VTwin PDF extraction.

### `catalog_fitment_v2`
Canonical fitment table. ~500K+ rows. **Never truncate.**  
Key columns: `id`, `product_id` (FK → catalog_unified.id), `model_year_id` (FK → harley_model_years.id).

### `harley_model_years`
Key columns: `id`, `year`, `model_id` (FK → harley_models.id).

### `harley_models`
293 model codes including vintage (Flathead through Knucklehead, Panhead, Shovelhead, Ironhead), police, CVO, V-Rod.  
Key columns: `id`, `model_code`, `family`, `era_*` booleans.

### Important operational constraints
- **Vercel cannot resolve IPv6.** Always use `CATALOG_DATABASE_URL` env var with `5.161.100.126` (not hostname).
- **`getCatalogDb()` returns a shared pool.** Never call `.end()` on it.
- **OEM number text casts.** Whenever using `= ANY(oem_numbers)`, always cast: `::text`.
- **`catalog_fitment_v2` must never be truncated.** Use `DELETE WHERE` or insert-on-conflict patterns.

---

## 3. New Table: `oem_supersession`

### Purpose
Stores directed supersession relationships between OEM part numbers, with the year the change took effect and confidence metadata. Self-referential (A→B→C forms a chain traversed recursively).

### Full Schema

```sql
-- Helper function: normalize OEM numbers for fuzzy matching
-- Strips dashes and spaces, uppercases. Used in generated columns + indexes.
CREATE OR REPLACE FUNCTION normalize_oem(oem TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT UPPER(REGEXP_REPLACE(oem, '[\s\-]', '', 'g'))
$$;

CREATE TABLE oem_supersession (
    id               SERIAL          PRIMARY KEY,

    -- The supersession pair
    from_oem         TEXT            NOT NULL,
    to_oem           TEXT            NOT NULL,

    -- Auto-normalized versions for fuzzy/typo-tolerant lookups
    from_oem_norm    TEXT            GENERATED ALWAYS AS (normalize_oem(from_oem)) STORED,
    to_oem_norm      TEXT            GENERATED ALWAYS AS (normalize_oem(to_oem)) STORED,

    -- Year the change took effect. NULL = unknown or applies to all years.
    effective_year   INT             CHECK (effective_year BETWEEN 1903 AND 2030),

    -- Data source
    source           TEXT            NOT NULL
                                     CHECK (source IN (
                                         'fatbook',   -- HD FatBook PDF extraction
                                         'oldbook',   -- HD OldBook PDF extraction
                                         'vtwin',     -- VTwin catalog data
                                         'wps',       -- WPS/HardDrive data
                                         'inferred',  -- boundary detection algorithm
                                         'manual'     -- hand-entered
                                     )),

    -- Confidence: 1 = inferred/needs review, 2 = confirmed, 3 = direct HD source
    confidence       SMALLINT        NOT NULL DEFAULT 2
                                     CHECK (confidence BETWEEN 1 AND 3),

    -- Optional notes (e.g. "redesigned for Twin Cam rocker box clearance")
    notes            TEXT,

    -- Audit columns
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- No self-loops, no duplicate pairs (normalized)
    CONSTRAINT no_self_reference     CHECK (normalize_oem(from_oem) <> normalize_oem(to_oem)),
    UNIQUE (from_oem_norm, to_oem_norm)
);

-- Forward traversal: old → what replaced it
CREATE INDEX ON oem_supersession (from_oem);
CREATE INDEX ON oem_supersession (from_oem_norm);

-- Backward traversal: new ← what it replaced (equally important for search)
CREATE INDEX ON oem_supersession (to_oem);
CREATE INDEX ON oem_supersession (to_oem_norm);

-- Audit/review filtering
CREATE INDEX ON oem_supersession (source, confidence);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER oem_supersession_updated_at
    BEFORE UPDATE ON oem_supersession
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

### What a row means

| from_oem | to_oem | effective_year | source | confidence | notes |
|---|---|---|---|---|---|
| `37909-84` | `37909-84A` | 2000 | `fatbook` | 3 | Dyna tensioner, redesigned for TC88 |
| `37909-84A` | `37909-84B` | 2007 | `fatbook` | 3 | Updated shoe material |
| `41300-84` | `41300-04` | 2004 | `inferred` | 1 | — |

The chain `37909-84 → 37909-84A → 37909-84B` means a product covering any one of these should surface for all of them.

### Review view (check regularly after inference runs)

```sql
CREATE VIEW oem_supersession_review AS
SELECT id, from_oem, to_oem, effective_year, notes, created_at
FROM oem_supersession
WHERE confidence = 1 AND source = 'inferred'
ORDER BY created_at DESC;
```

---

## 4. Part Change Detection: Inferring Supersession from Fitment Boundaries

Before manually seeding the table, run this inference query. It detects OEM pairs whose fitment year ranges are adjacent (e.g. one ends in 1999, another starts in 2000) and whose product names are similar — strong signal of a part change event.

```sql
WITH oem_year_ranges AS (
    SELECT
        x.oem_number,
        MIN(my.year)  AS first_year,
        MAX(my.year)  AS last_year,
        -- Strip year ranges, colors, and trim from names to expose the base part name
        REGEXP_REPLACE(
            LOWER(cu.name),
            '\d{4}[\-–]\d{4}|\s+(black|chrome|raw|natural|polished|powder\s+coat\w*)\b',
            '', 'gi'
        ) AS base_name
    FROM catalog_oem_crossref x
    JOIN catalog_fitment_v2 fv    ON fv.product_id  = x.product_id
    JOIN harley_model_years my    ON my.id           = fv.model_year_id
    JOIN catalog_unified cu       ON cu.id           = x.product_id
    WHERE cu.is_active = true
    GROUP BY x.oem_number, base_name
),
candidates AS (
    SELECT
        a.oem_number                    AS old_oem,
        b.oem_number                    AS new_oem,
        a.last_year                     AS boundary_year,
        b.first_year                    AS new_start_year,
        a.base_name,
        -- Score: exact adjacent boundary = highest confidence
        CASE WHEN b.first_year = a.last_year + 1 THEN 1 ELSE 2 END AS gap
    FROM oem_year_ranges a
    JOIN oem_year_ranges b ON
        a.base_name      =  b.base_name
        AND a.oem_number <> b.oem_number
        AND b.first_year >= a.last_year      -- b starts at or after a ends
        AND b.first_year <= a.last_year + 2  -- gap of at most 1 year (allows for sparse data)
        AND a.last_year  <  b.last_year      -- b is the newer part
)
SELECT
    old_oem, new_oem, boundary_year, new_start_year, base_name, gap
FROM candidates
WHERE gap <= 2
ORDER BY gap, boundary_year;
```

### Bulk-insert candidates from the inference query

```sql
-- Run after reviewing the query output above.
-- Sets confidence = 1 (inferred, needs review).
INSERT INTO oem_supersession (from_oem, to_oem, effective_year, source, confidence)
SELECT DISTINCT old_oem, new_oem, boundary_year, 'inferred', 1
FROM (/* paste inference query here */) candidates
ON CONFLICT (from_oem_norm, to_oem_norm) DO NOTHING;
```

### Promote reviewed rows to confidence = 2

```sql
UPDATE oem_supersession
SET confidence = 2, notes = 'Reviewed — fitment boundary confirmed'
WHERE id = <id>;
```

---

## 5. New Materialized View: `mv_oem_fitment_coverage`

### Purpose
For every OEM number in `catalog_oem_crossref`, walk the full supersession chain (both forward and backward) and union all fitment from every product in the chain. Result: a single flat lookup table keyed by `(oem_number, model_year_id)`.

This is what makes "slightly off" queries work — looking up any OEM number in the chain returns the full fitment picture.

### Full SQL

```sql
CREATE MATERIALIZED VIEW mv_oem_fitment_coverage AS
WITH RECURSIVE chain AS (
    -- Seed: every OEM number we know from the crossref table
    SELECT
        oem_number   AS root_oem,
        oem_number   AS current_oem,
        0            AS depth
    FROM (SELECT DISTINCT oem_number FROM catalog_oem_crossref) base

    UNION ALL

    -- Walk forward through supersession chain (A → B → C)
    SELECT
        c.root_oem,
        s.to_oem,
        c.depth + 1
    FROM chain c
    JOIN oem_supersession s
        ON normalize_oem(s.from_oem) = normalize_oem(c.current_oem)
    WHERE c.depth < 10  -- cycle guard
),
-- Also walk backward so searching by NEW oem finds OLD product fitment too
chain_backward AS (
    SELECT
        oem_number   AS root_oem,
        oem_number   AS current_oem,
        0            AS depth
    FROM (SELECT DISTINCT oem_number FROM catalog_oem_crossref) base

    UNION ALL

    SELECT
        c.root_oem,
        s.from_oem,
        c.depth + 1
    FROM chain_backward c
    JOIN oem_supersession s
        ON normalize_oem(s.to_oem) = normalize_oem(c.current_oem)
    WHERE c.depth < 10
),
all_chains AS (
    SELECT root_oem, current_oem FROM chain
    UNION
    SELECT root_oem, current_oem FROM chain_backward
)
SELECT
    ch.root_oem                                                          AS oem_number,
    fv.model_year_id,
    my.year,
    hm.model_code,
    hm.family,
    COUNT(DISTINCT x.product_id)                                         AS vendor_count,
    ARRAY_AGG(DISTINCT cu.source_vendor ORDER BY cu.source_vendor)       AS vendors,
    -- Surface whether this fitment comes from a direct match or chain traversal
    BOOL_OR(ch.current_oem = ch.root_oem)                               AS has_direct_match
FROM all_chains ch
JOIN catalog_oem_crossref x
    ON normalize_oem(x.oem_number) = normalize_oem(ch.current_oem)
JOIN catalog_fitment_v2 fv  ON fv.product_id  = x.product_id
JOIN harley_model_years my  ON my.id           = fv.model_year_id
JOIN harley_models hm       ON hm.id           = my.model_id
JOIN catalog_unified cu     ON cu.id           = x.product_id
WHERE cu.is_active = true
GROUP BY ch.root_oem, fv.model_year_id, my.year, hm.model_code, hm.family;

-- Indexes
CREATE UNIQUE INDEX ON mv_oem_fitment_coverage (oem_number, model_year_id);
CREATE INDEX ON mv_oem_fitment_coverage (model_year_id);
CREATE INDEX ON mv_oem_fitment_coverage (model_code, year);
CREATE INDEX ON mv_oem_fitment_coverage (oem_number);
```

### Refreshing

```sql
-- Safe concurrent refresh (no lock on reads during rebuild)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage;
```

**When to refresh:**
- After any `INSERT` or `UPDATE` into `oem_supersession`
- After a VTwin/WPS/PU catalog resync (new products → new fitment rows)
- After running the inference import

Do NOT refresh inside a transaction that also writes to `catalog_fitment_v2` — run it as a separate step.

---

## 6. Chain Traversal Query (reusable CTE)

Use this anywhere you need the full chain for a given OEM number:

```sql
-- Returns every OEM in the chain that contains '37909-84'
WITH RECURSIVE chain AS (
    SELECT
        from_oem, to_oem,
        1            AS depth,
        ARRAY[normalize_oem(from_oem)] AS visited
    FROM oem_supersession
    WHERE from_oem_norm = normalize_oem('37909-84')

    UNION ALL

    SELECT
        s.from_oem, s.to_oem,
        c.depth + 1,
        c.visited || normalize_oem(s.from_oem)
    FROM oem_supersession s
    JOIN chain c
        ON normalize_oem(s.from_oem) = normalize_oem(c.to_oem)
    WHERE normalize_oem(s.from_oem) <> ALL(c.visited)  -- cycle guard
      AND c.depth < 10
)
SELECT from_oem, to_oem, depth FROM chain ORDER BY depth;
-- 37909-84  → 37909-84A  (depth 1)
-- 37909-84A → 37909-84B  (depth 2)
```

---

## 7. Scored Part Finder Query

This is the query that powers user-facing search. It returns products ranked by how well they match the user's bike + search term.

**Score tiers:**
- `1` — Product has a direct fitment row for this exact model year
- `2` — Product's OEM number is in the chain that covers this bike (inherited fitment)
- `3` — Product is flagged universal (`is_universal = true`)
- `4` — Weak text match only, no fitment signal

```sql
-- Parameters: $1 = year (INT), $2 = model code (TEXT), $3 = search term (TEXT)
WITH target_my AS (
    SELECT my.id AS model_year_id
    FROM harley_model_years my
    JOIN harley_models hm ON hm.id = my.model_id
    WHERE my.year = $1
      AND (
          hm.model_code ILIKE $2
          OR hm.family   ILIKE $2
          OR hm.model_code ILIKE $2 || '%'   -- e.g. 'FXD' matches 'FXDL'
      )
    LIMIT 1
),
bike_oems AS (
    -- All OEM numbers whose chain covers this bike
    SELECT DISTINCT oem_number
    FROM mv_oem_fitment_coverage
    WHERE model_year_id = (SELECT model_year_id FROM target_my)
),
candidates AS (
    SELECT
        cu.id,
        cu.sku,
        cu.name,
        cu.source_vendor,
        cu.display_category,
        cu.display_subcategory,
        cu.is_universal,
        x.oem_number,
        fv.model_year_id    IS NOT NULL     AS has_direct_fit,
        x.oem_number        IS NOT NULL
            AND x.oem_number IN (
                SELECT oem_number FROM bike_oems
            )                               AS has_chain_fit
    FROM catalog_unified cu
    LEFT JOIN catalog_fitment_v2 fv
        ON  fv.product_id   = cu.id
        AND fv.model_year_id = (SELECT model_year_id FROM target_my)
    LEFT JOIN catalog_oem_crossref x
        ON  x.product_id    = cu.id
    WHERE cu.is_active = true
      AND (
          cu.name             ILIKE '%' || $3 || '%'
          OR cu.display_category ILIKE '%' || $3 || '%'
          OR x.oem_number     ILIKE '%' || $3 || '%'
      )
),
scored AS (
    SELECT
        id, sku, name, source_vendor, display_category,
        display_subcategory, is_universal, oem_number,
        CASE
            WHEN has_direct_fit              THEN 1
            WHEN has_chain_fit               THEN 2
            WHEN is_universal                THEN 3
            ELSE                                  4
        END AS score
    FROM candidates
)
SELECT DISTINCT ON (id)
    id, sku, name, source_vendor, display_category,
    display_subcategory, oem_number, score
FROM scored
ORDER BY id, score
-- Outer sort: best score first, then name
-- (wrap in a subquery if you need ORDER BY score, name on the final result)
;
```

---

## 8. Seed Data: Where Supersession Rows Come From

In rough priority order:

1. **FatBook / OldBook PDFs** — already extracted into `catalog_oem_crossref`. The PDFs may contain explicit "superseded by" notes in part descriptions. These need a targeted pass to extract.
2. **VTwin catalog** — VTwin often lists supersession inline in product descriptions (e.g. "Replaces OEM 37909-84"). The scraper can be extended to capture this.
3. **Inference query** (Section 4 above) — run immediately, bulk insert at `confidence = 1`, review progressively.
4. **Manual entry** — for high-value parts (primary tensioners, cam chains, lifters) where you know the history.

### Checking how many inferred rows are pending review

```sql
SELECT COUNT(*) FROM oem_supersession_review;
```

---

## 9. Implementation Order

Do these in sequence. Each step is independently testable.

**Step 1 — Create the normalize function**
```sql
CREATE OR REPLACE FUNCTION normalize_oem(oem TEXT) ...
```
Test: `SELECT normalize_oem('37909-84A');` → `'3790984A'`

**Step 2 — Create `oem_supersession` table**
Full DDL from Section 3. No data yet.  
Test: `SELECT COUNT(*) FROM oem_supersession;` → `0`

**Step 3 — Run inference query, review output**
Run the query from Section 4. Spot-check 20–30 candidate pairs before inserting.  
Test: Do the pairs make sense? Are the base names similar enough?

**Step 4 — Bulk insert inferred rows**
`INSERT INTO oem_supersession ... ON CONFLICT DO NOTHING`  
Test: `SELECT COUNT(*) FROM oem_supersession_review;` (should be > 0)

**Step 5 — Manually seed known high-value chains**
Hand-enter the known Evo → TC88 → M8 part transitions for your top categories.  
Test: `SELECT * FROM oem_supersession WHERE confidence = 3 LIMIT 20;`

**Step 6 — Build `mv_oem_fitment_coverage`**
Full DDL from Section 5.  
Test:
```sql
-- Should return the model years covered by the full 37909-84 chain
SELECT year, model_code
FROM mv_oem_fitment_coverage
WHERE oem_number = '37909-84'
ORDER BY year, model_code;
```

**Step 7 — Test the chain traversal CTE**
Run the CTE from Section 6 against a known 3-hop chain.  
Test: Does `depth` increment correctly? Do you get the right number of rows?

**Step 8 — Test the scored query**
```sql
-- Concrete test: 1995 Dyna, primary tensioner
-- Expect: score = 1 rows for direct matches, score = 2 for chain matches
-- [paste scored query with $1=1995, $2='FXD', $3='tensioner']
```

**Step 9 — Integrate into `browse.ts`**
Add the score column to the Typesense reindex pipeline and the browse query. Details in Section 10.

**Step 10 — Schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY`**
Add to whatever cron/pipeline runs after catalog syncs.

---

## 10. Frontend Integration Notes

### Typesense reindex
When reindexing to Typesense, join `mv_oem_fitment_coverage` to include the count of bikes covered by each product's full OEM chain. This enables a "fitment coverage breadth" sort factor.

```js
// In your Typesense indexing script
// Add to the document shape:
oem_chain_coverage: row.oem_chain_model_years ?? 0,  // how many model years the chain covers
```

### `browse.ts` query changes
The scored query (Section 7) replaces the current direct fitment join for OEM-driven search. For regular category/filter browse, behavior is unchanged. Only activate the scoring when:
- User has a bike selected (year + model in session/URL), AND
- The query returns fewer than ~15 direct matches (score = 1)

In that case, append score = 2 results below a "— also fits via OEM match —" divider.

### PDP `ProductQuickViewModal` — OEM tab
The OEM tab already exists as a 3-tab interface. The OEM tab should now query:
```sql
SELECT DISTINCT s.from_oem, s.to_oem, s.effective_year, s.confidence
FROM oem_supersession s
WHERE normalize_oem(s.from_oem) = normalize_oem($1)  -- product's OEM number
   OR normalize_oem(s.to_oem)   = normalize_oem($1)
ORDER BY s.effective_year;
```
Display this as a timeline ("this part replaced X in [year], was itself replaced by Y in [year]").

---

## 11. Potential Issues and Gotchas

### Cycle guard is important
If bad data creates a loop (A→B→C→A), the recursive CTE will spin forever without `AND c.depth < 10`. Always keep that guard. The `visited` array pattern also prevents revisiting nodes but is slightly slower — use depth guard for production queries, visited array only for debugging.

### Normalize everything, everywhere
Vendor data is inconsistent. WPS uses `3790984` (no dashes), VTwin uses `37909-84`, some PDFs use `37909 84` (space). Always compare via `normalize_oem()` or `from_oem_norm / to_oem_norm` columns. Never use plain `=` on raw OEM strings in this context.

### `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index
The `CREATE UNIQUE INDEX ON mv_oem_fitment_coverage (oem_number, model_year_id)` handles this. If you ever need to drop and recreate the view, re-create this index first before running concurrent refresh.

### Backward chain traversal can be expensive
The `chain_backward` CTE in the materialized view doubles the CTE cost. If the view build is slow, build it in two passes: forward chain first, add backward chain in a second `UNION` after confirming forward performance.

### Inference false positives
The inference query will occasionally match unrelated parts that happen to have similar names and adjacent fitment ranges. The `confidence = 1` flag and the `oem_supersession_review` view exist exactly for this. Don't promote to `confidence = 2` without spot-checking.

### `effective_year` nulls in the scored query
If `effective_year IS NULL` in a supersession row, it means "unknown when the change happened." The scored query doesn't filter by year — it just uses the full chain. This is intentional: it's better to show a chain match at score = 2 and let the user verify, than to miss it entirely.

### Kit products
A kit SKU (e.g. "Primary Chain & Tensioner Kit") may list `37909-84` as an OEM it includes (not as a direct replacement). This correctly surfaces in the chain query because the kit has a `catalog_oem_crossref` row pointing to `37909-84`, and the user finds it. No special handling needed — the architecture handles this transparently.

---

## 12. Files and Scripts Referenced

| File | Purpose |
|---|---|
| `HANDOFF_LOG.md` | Session continuity log (update after each working session) |
| `CHASE_LIST.md` | Outstanding tasks |
| `filter_roadmap.md` | Browse/filter architecture decisions |
| `MasterRef` | Canonical reference for schema decisions |
| `vtwin_mark_universal.sql` | Existing universal fitment marking |
| `extract_fitment_from_names.mjs` | Name-based fitment inference (related) |
| `build_variant_groups.cjs` | Variant grouping (unrelated but runs in same pipeline) |

---

## 13. Quick Reference: Key SQL Snippets

```sql
-- Check chain for any OEM number
SELECT * FROM oem_supersession
WHERE from_oem_norm = normalize_oem('37909-84')
   OR to_oem_norm   = normalize_oem('37909-84');

-- How many bikes does a given OEM chain cover?
SELECT COUNT(DISTINCT model_year_id) AS bikes_covered
FROM mv_oem_fitment_coverage
WHERE oem_number = '37909-84';

-- Which vendors cover a given OEM chain?
SELECT oem_number, vendors, vendor_count
FROM mv_oem_fitment_coverage
WHERE oem_number = '37909-84'
LIMIT 1;

-- All inferred pairs pending review
SELECT * FROM oem_supersession_review;

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage;

-- Row counts to sanity check after build
SELECT COUNT(*) FROM oem_supersession;                  -- supersession pairs
SELECT COUNT(*) FROM oem_supersession WHERE confidence = 1; -- pending review
SELECT COUNT(*) FROM mv_oem_fitment_coverage;           -- OEM × model_year coverage rows
```

---

*End of handoff document. Next session: start at Section 9, Step 1.*
