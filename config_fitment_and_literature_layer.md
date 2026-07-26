# Configuration Fitment + Literature Layer

Additive design on top of the existing catalog. Nothing here replaces `catalog_unified`,
`catalog_fitment_v2`, `catalog_oem_crossref`, `oem_supersession`, or `oem_part_timeline`.

---

## 0. Position vs. the pasted prompt

The pasted prompt is a greenfield spec. You are not greenfield — you have ~90.6K active
products, 683K rows in `mv_oem_fitment_coverage`, 32,570 timeline rows, and a taxonomy
rebuild that took ~85 sessions. A rewrite throws all of that away to gain schema purity.

What the prompt actually identifies that you genuinely lack:

| Prompt asks for | Status |
|---|---|
| Manufacturers / brands / products / variants | Have it (`canonical_products`, `catalog_variant_member_options`) |
| OEM aliases, supersessions, formatting normalization | Have it (`normalize_oem()`, `oem_supersession`, `catalog_oem_crossref.oem_format`) |
| Vendor products / inventory / pricing | Have it (`product_vendors`, three-vendor unify) |
| Categories | Have it (v2 taxonomy) |
| Full-text / trigram / Typesense | Have it |
| **Configuration-level fitment** | **Missing** — fitment is year + model code |
| **Parts books, catalog pages, exploded diagrams as entities** | **Missing** |
| **VIN ranges** | **Missing** |
| **Formal family → platform → generation → model hierarchy** | **Partial** (`harley_families` only) |

So: three new subsystems, not seventeen deliverables.

---

## 1. The one design decision I'd change

The prompt says "a product fits one or more configurations." Taken literally that is a
cardinality bomb. Rough sizing:

- ~100 model years × ~45 models/year → ~4,500 model-years
- × 4–8 configurations each → ~25,000 configurations
- × 90K products, even at 1% match density → far past 20M rows, and most of those rows
  carry zero information because the part fits *every* config of that model year.

**Store fitment at the coarsest node that is true.** A grip fits a model year. A throttle
cable fits a fuel-system config. A rotor fits a wheel-size config. Encode the level:

```
fitment_scope ∈ ('family','platform','generation','model','model_year','configuration')
```

Resolution walks *down* the tree at query time: a `model_year`-scoped row matches every
configuration under it. This keeps the common case at ~1 row and reserves the expensive
case for parts that actually discriminate. It also means the existing 1.9M+ promoted
fitment rows migrate as `model_year` scope with zero loss and zero re-derivation.

---

## 2. Hierarchy tables

```sql
-- Reuse harley_families as the root; add the missing intermediate levels.

CREATE TABLE hd_platform (
  id            serial PRIMARY KEY,
  family_id     int NOT NULL REFERENCES harley_families(id),
  code          text NOT NULL,              -- 'TOURING_FL', 'DYNA_FX', 'SOFTAIL_FLFX'
  name          text NOT NULL,
  UNIQUE (family_id, code)
);

CREATE TABLE hd_generation (
  id            serial PRIMARY KEY,
  platform_id   int NOT NULL REFERENCES hd_platform(id),
  code          text NOT NULL,              -- 'TWIN_CAM_88', 'M8', 'EVO'
  name          text NOT NULL,
  year_start    smallint NOT NULL,
  year_end      smallint,                   -- NULL = current
  UNIQUE (platform_id, code),
  CHECK (year_end IS NULL OR year_end >= year_start)
);

CREATE TABLE hd_model (
  id             serial PRIMARY KEY,
  generation_id  int REFERENCES hd_generation(id),
  model_code     text NOT NULL,             -- 'FLHR', 'VV', 'FXFBS'
  marketing_name text,                      -- 'Road King'
  internal_code  text,
  is_police      boolean NOT NULL DEFAULT false,
  is_cvo         boolean NOT NULL DEFAULT false,
  is_export      boolean NOT NULL DEFAULT false,
  is_military    boolean NOT NULL DEFAULT false,
  UNIQUE (model_code)
);

CREATE TABLE hd_model_alias (
  model_id    int NOT NULL REFERENCES hd_model(id) ON DELETE CASCADE,
  alias       text NOT NULL,                -- 'FXBFS' typo → FXFBS
  alias_kind  text NOT NULL,                -- 'typo','vendor','marketing','abbrev'
  PRIMARY KEY (model_id, alias)
);

-- Authoritative year/model reference. This is hd_year_model_clean.csv, normalized.
CREATE TABLE hd_model_year (
  id         serial PRIMARY KEY,
  model_id   int NOT NULL REFERENCES hd_model(id),
  year       smallint NOT NULL CHECK (year BETWEEN 1903 AND 2035),
  model_name text,                          -- '74ci Flathead' as printed that year
  UNIQUE (model_id, year)
);
CREATE INDEX ON hd_model_year (year);
```

Note the `is_*` flags rather than a trim table: CVO/Police/Export are properties of the
model code itself in HD's own numbering, not orthogonal options. Anniversary and color
packages *are* orthogonal — those go in the config option junction below.

---

## 3. Configuration layer

```sql
CREATE TABLE hd_configuration (
  id             bigserial PRIMARY KEY,
  model_year_id  int NOT NULL REFERENCES hd_model_year(id),
  config_key     text NOT NULL,        -- deterministic hash of the option set
  is_default     boolean NOT NULL DEFAULT false,  -- the "unknown/all" catch-all
  is_inferred    boolean NOT NULL DEFAULT true,   -- false once confirmed from a parts book
  UNIQUE (model_year_id, config_key)
);
CREATE UNIQUE INDEX hd_configuration_one_default
  ON hd_configuration (model_year_id) WHERE is_default;

-- Open axis set, same pattern that fixed the variant system.
-- Do NOT hardcode engine/trans/abs columns — brake rotors already proved that fails.
CREATE TABLE hd_config_axis (
  id    serial PRIMARY KEY,
  name  text UNIQUE NOT NULL      -- 'Engine','Transmission','Fuel System','Frame',
);                                -- 'Front Wheel Size','ABS','Anniversary'

CREATE TABLE hd_config_option (
  id       serial PRIMARY KEY,
  axis_id  int NOT NULL REFERENCES hd_config_axis(id),
  value    text NOT NULL,          -- 'EFI','CV Carb','5-Speed','21in','ABS','No ABS'
  UNIQUE (axis_id, value)
);

CREATE TABLE hd_configuration_options (
  config_id  bigint NOT NULL REFERENCES hd_configuration(id) ON DELETE CASCADE,
  option_id  int    NOT NULL REFERENCES hd_config_option(id),
  PRIMARY KEY (config_id, option_id)
);
CREATE INDEX ON hd_configuration_options (option_id);

CREATE TABLE hd_vin_range (
  id             bigserial PRIMARY KEY,
  model_year_id  int NOT NULL REFERENCES hd_model_year(id),
  config_id      bigint REFERENCES hd_configuration(id),  -- NULL = whole model year
  vin_prefix     text,
  serial_from    text,
  serial_to      text,
  note           text
);
```

`config_key` should be `md5(string_agg(option_id::text, ',' ORDER BY option_id))` so the
same option set never produces two configuration rows across import runs.

---

## 4. Fitment

```sql
CREATE TABLE catalog_fitment_scoped (
  id              bigserial PRIMARY KEY,
  product_id      bigint NOT NULL REFERENCES catalog_unified(id),
  scope           text NOT NULL CHECK (scope IN
                    ('family','platform','generation','model','model_year','configuration')),
  family_id       int    REFERENCES harley_families(id),
  platform_id     int    REFERENCES hd_platform(id),
  generation_id   int    REFERENCES hd_generation(id),
  model_id        int    REFERENCES hd_model(id),
  model_year_id   int    REFERENCES hd_model_year(id),
  config_id       bigint REFERENCES hd_configuration(id),
  year_start      smallint,       -- denormalized for range queries
  year_end        smallint,
  is_exception    boolean NOT NULL DEFAULT false,   -- "fits all EXCEPT this"
  note            text,
  source_id       int NOT NULL REFERENCES fitment_source(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- exactly one target populated per scope
  CHECK (
    (scope='family'        AND family_id      IS NOT NULL) OR
    (scope='platform'      AND platform_id    IS NOT NULL) OR
    (scope='generation'    AND generation_id  IS NOT NULL) OR
    (scope='model'         AND model_id       IS NOT NULL) OR
    (scope='model_year'    AND model_year_id  IS NOT NULL) OR
    (scope='configuration' AND config_id      IS NOT NULL)
  )
);

CREATE TABLE fitment_source (
  id          serial PRIMARY KEY,
  code        text UNIQUE NOT NULL,   -- 'PU_FEED','WPS_FEED','VTWIN_FEED',
  description text,                   -- 'OEM_CATALOG_PDF','MANUAL','OEM_CHAIN'
  trust_rank  smallint NOT NULL       -- lower wins on conflict
);

CREATE INDEX ON catalog_fitment_scoped (product_id);
CREATE INDEX ON catalog_fitment_scoped (config_id)     WHERE config_id IS NOT NULL;
CREATE INDEX ON catalog_fitment_scoped (model_year_id) WHERE model_year_id IS NOT NULL;
CREATE INDEX ON catalog_fitment_scoped (model_id, year_start, year_end);
CREATE INDEX ON catalog_fitment_scoped (source_id);
```

`is_exception` handles the "fits all Touring 1998–2003 except FLHRCI" case without
enumerating the complement — resolution subtracts exception rows last.

**`catalog_fitment_v2` becomes a projection, not the source of truth.** It stays exactly
as-is (never truncated), refreshed by a resolver that flattens scoped rows down to
(product, year, model_code). Typesense keeps feeding off it. Nothing downstream changes
until you choose to expose config filters in the browse panel.

---

## 5. Literature: parts books, catalog pages, diagrams

```sql
CREATE TABLE hd_publication (
  id           serial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN
                 ('parts_catalog','service_manual','bulletin','owners_manual','vendor_catalog')),
  title        text NOT NULL,
  publisher    text,                    -- 'Harley-Davidson','V-Twin','Parts Unlimited'
  part_number  text,                    -- HD publication P/N, e.g. 99456-98
  edition      text,
  year_start   smallint,
  year_end     smallint,
  source_uri   text,
  UNIQUE (kind, part_number, edition)
);

-- What machines a publication actually covers. Same scoping trick.
CREATE TABLE hd_publication_coverage (
  publication_id int NOT NULL REFERENCES hd_publication(id) ON DELETE CASCADE,
  scope          text NOT NULL,
  model_id       int REFERENCES hd_model(id),
  model_year_id  int REFERENCES hd_model_year(id),
  config_id      bigint REFERENCES hd_configuration(id)
);

CREATE TABLE hd_publication_page (
  id              bigserial PRIMARY KEY,
  publication_id  int NOT NULL REFERENCES hd_publication(id) ON DELETE CASCADE,
  page_number     int NOT NULL,
  page_label      text,               -- printed label, may differ from index
  image_uri       text,
  ocr_text        text,
  UNIQUE (publication_id, page_number)
);
CREATE INDEX ON hd_publication_page USING gin (to_tsvector('english', ocr_text));

CREATE TABLE hd_diagram (
  id          bigserial PRIMARY KEY,
  page_id     bigint REFERENCES hd_publication_page(id) ON DELETE CASCADE,
  assembly    text NOT NULL,          -- 'Front Fork Assembly'
  image_uri   text NOT NULL,
  svg_uri     text,                   -- vectorized overlay if available
  UNIQUE (page_id, assembly)
);

-- The join that makes diagrams first-class: callout N on this diagram IS this OEM part.
CREATE TABLE hd_diagram_callout (
  id           bigserial PRIMARY KEY,
  diagram_id   bigint NOT NULL REFERENCES hd_diagram(id) ON DELETE CASCADE,
  callout      text NOT NULL,          -- '14', '14A'
  oem_id       bigint REFERENCES oem_number(id),
  qty          smallint,
  description  text,
  hotspot      jsonb,                  -- {"type":"polygon","points":[[x,y],...]}
  UNIQUE (diagram_id, callout)
);
CREATE INDEX ON hd_diagram_callout (oem_id);
```

### The missing dimension table

Diagrams need a stable OEM identity to point at. Right now OEM lives as text in
`catalog_oem_crossref` and as base families in `oem_part_timeline`. Promote it:

```sql
CREATE TABLE oem_number (
  id           bigserial PRIMARY KEY,
  oem_raw      text NOT NULL,
  oem_norm     text NOT NULL UNIQUE,   -- normalize_oem(oem_raw)
  base_family  text,                   -- the 7,981 families you already derived
  suffix       text,                   -- 'B' in 38775-90B
  year_hint    smallint,               -- century-aware rule applied
  is_active    boolean NOT NULL DEFAULT true
);
CREATE INDEX ON oem_number (base_family);
CREATE INDEX ON oem_number USING gin (oem_norm gin_trgm_ops);
```

Backfill from `SELECT DISTINCT` over `catalog_oem_crossref` filtered to
`oem_format IN ('hd_oem','hd_oem_nodash') AND expanded_from = FALSE`, then add a nullable
`oem_id` FK to `catalog_oem_crossref`, `oem_supersession`, and `oem_part_timeline` and
backfill on `oem_norm`. Old string columns stay; nothing breaks.

---

## 6. The five target queries

**"Every throttle cable that fits a 1998 FLHR with EFI"**

```sql
WITH target AS (
  SELECT c.id AS config_id, my.id AS model_year_id, m.id AS model_id, g.id AS generation_id
  FROM hd_configuration c
  JOIN hd_model_year my ON my.id = c.model_year_id
  JOIN hd_model m       ON m.id = my.model_id
  LEFT JOIN hd_generation g ON g.id = m.generation_id
  JOIN hd_configuration_options co ON co.config_id = c.id
  JOIN hd_config_option o  ON o.id = co.option_id
  JOIN hd_config_axis  a   ON a.id = o.axis_id
  WHERE m.model_code = 'FLHR' AND my.year = 1998
    AND a.name = 'Fuel System' AND o.value = 'EFI'
),
hits AS (
  SELECT f.product_id, f.is_exception
  FROM catalog_fitment_scoped f, target t
  WHERE f.config_id     = t.config_id
     OR f.model_year_id = t.model_year_id
     OR f.model_id      = t.model_id
     OR f.generation_id = t.generation_id
)
SELECT cu.id, cu.name, cu.brand
FROM catalog_unified cu
JOIN hits h ON h.product_id = cu.id
WHERE cu.is_active
  AND cu.display_category_v2 = 'Cables'
  AND cu.display_subcategory_v2 = 'Throttle Cables'
GROUP BY cu.id, cu.name, cu.brand
HAVING bool_and(NOT h.is_exception);
```

**"What OEM part replaced 38775-90B?"** — already answered by `oem_supersession` chain
traversal; add `JOIN oem_number` to get diagram links for free.

**"Every vendor selling replacements for this discontinued OEM"** — existing
`mv_oem_fitment_coverage` → `catalog_oem_crossref` → `product_vendors`.

**"Display the exact page from the 1998 catalog where this assembly appears"**

```sql
SELECT p.title, pg.page_number, pg.image_uri, d.assembly, dc.callout, dc.hotspot
FROM hd_diagram_callout dc
JOIN hd_diagram d          ON d.id = dc.diagram_id
JOIN hd_publication_page pg ON pg.id = d.page_id
JOIN hd_publication p       ON p.id = pg.publication_id
JOIN oem_number o           ON o.id = dc.oem_id
WHERE o.oem_norm = normalize_oem('38775-90B')
  AND p.kind = 'parts_catalog'
  AND 1998 BETWEEN p.year_start AND coalesce(p.year_end, 2035);
```

**"Highlight component on diagram + list aftermarket alternatives"** — the query above
gives the hotspot polygon; `dc.oem_id → catalog_oem_crossref → catalog_unified` gives the
alternatives. One join path, no new machinery.

---

## 7. Migration order

Each step is a separate `.mjs` in `scripts/ingest/`, dry-run first, verified before apply.

1. `build_hd_hierarchy.mjs` — platform/generation/model/model_year from
   `hd_year_model_clean.csv` + existing `harley_families`. Dry-run reports unmatched model
   codes; expect a tail of typos (FXBFS class). Hand-resolve into `hd_model_alias`.
2. `build_oem_number_dim.mjs` — populate `oem_number`, add nullable FKs, backfill.
   Report unmatched count before adding any NOT NULL.
3. `seed_default_configs.mjs` — one `is_default = true`, `is_inferred = true` config per
   model year. This guarantees step 4 is lossless.
4. `migrate_fitment_to_scoped.mjs` — project existing `catalog_fitment_v2` rows into
   `catalog_fitment_scoped` at `model_year` scope. **Read-only against v2.** Row count in
   must equal row count out (modulo dedup); report the delta before apply.
5. `build_fitment_resolver.mjs` — resolver that regenerates `catalog_fitment_v2` from
   scoped rows. Validate by diffing against the live table: must be identical on first run.
   Only after that diff is clean does the scoped table become authoritative.
6. Enrich configs from real evidence (parts books, vendor fitment notes). Flip
   `is_inferred = false` per config as it's confirmed. Never invent axis values — pull the
   real option strings from source documents first, same rule as the taxonomy work.
7. Literature tables + diagram ingest, last. Independent of everything above except
   `oem_number`.

Steps 1–5 change zero user-visible behavior. That's the point — the whole config layer can
land dark and stay dark until you decide to expose an EFI/ABS/wheel-size filter.

---

## 8. Materialized view + Typesense

```sql
CREATE MATERIALIZED VIEW mv_product_config_fitment AS
SELECT DISTINCT f.product_id, c.id AS config_id, my.year, m.model_code
FROM catalog_fitment_scoped f
JOIN hd_configuration c ON (
       f.config_id = c.id
    OR f.model_year_id = c.model_year_id
  )
JOIN hd_model_year my ON my.id = c.model_year_id
JOIN hd_model m       ON m.id = my.model_id
WHERE NOT f.is_exception;
```

Refresh `CONCURRENTLY`, same pattern as `mv_oem_fitment_coverage`. For Typesense, add one
faceted array field `config_tags` of the form `1998|FLHR|EFI` rather than a document per
config — document-per-config would multiply the index by ~25x for no query benefit.

---

## 9. Row estimates

| Table | Expected rows | Update frequency |
|---|---|---|
| `hd_platform` / `hd_generation` | ~20 / ~60 | rare |
| `hd_model` | ~1,200 | annual |
| `hd_model_year` | ~5,000 | annual |
| `hd_configuration` | ~25,000 | as books are ingested |
| `hd_configuration_options` | ~120,000 | same |
| `catalog_fitment_scoped` | 2–4M (vs 20M+ if config-only) | per vendor sync |
| `oem_number` | ~400,000 | per ingest |
| `hd_publication_page` | ~50,000 | per book scanned |
| `hd_diagram_callout` | ~500,000 | per book scanned |
