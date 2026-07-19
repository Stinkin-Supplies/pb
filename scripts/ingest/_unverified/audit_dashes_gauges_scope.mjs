// audit_dashes_gauges_scope.mjs
// READ-ONLY scoping audit for the Dashes & Gauges category rebuild.
// No writes. No classification rules applied. Just counts + samples so Laken
// can see real numbers before fix_dashes_gauges_taxonomy.mjs gets written.
//
// Pattern: same as audit_tanks_body_scope.mjs (Tanks & Body, session 79).
//
// Laken's spec for Dashes & Gauges (verbatim buckets, grouped by rough theme):
//   Dash:        DASH, DASH INSERTS, DECAL, DIVIDER, DASH PANEL, DASH ASSEMBLY,
//                HOUSING, FUEL DOOR, CHAPS
//   Speedo:      SPEEDOMETER, GAUGE SETS, SPEEDOMETER DRIVES, SENSORS, BEZEL,
//                KNOBS, TIN FACES
//   Tach:        TACHOMETER
//   Gauge misc:  GAUGE MOUNTS, GAUGE ACCENTS, INDICATOR LIGHTS, ACCESSORIES
//   Oil:         OIL PRESSURE GAUGES
//
// Run: node audit_dashes_gauges_scope.mjs > dashes_gauges_audit.txt 2>&1

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

// Proven pattern (build_canonical_products.mjs / fix_product_vendors_drift.mjs):
// .env.local / .env live at the PROJECT ROOT, two levels up from scripts/ingest/.
// Try .env.local first, fall back to .env.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const db = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
// Per standing rule: this script owns its own pool — never call .end() on
// getCatalogDb()'s shared pool, but this IS our own pool, so we DO call
// db.end() at the end of main() below to let the process exit cleanly.

// Keyword buckets as ILIKE patterns. Deliberately loose at this stage —
// audit is for visibility, not for deciding true/false membership yet.
const KEYWORD_BUCKETS = {
  'Dash / Panel / Assembly':      [`%DASH%`, `%DASH INSERT%`, `%DASH PANEL%`, `%DASH ASSEMBL%`],
  'Decal':                        [`%DECAL%`],
  'Divider':                      [`%DIVIDER%`],
  'Housing':                      [`%HOUSING%`],
  'Fuel Door':                    [`%FUEL DOOR%`],
  'Chaps (?)':                    [`%CHAPS%`], // flagged — odd fit for this category, verify not apparel bleed
  'Speedometer / Gauge Sets':     [`%SPEEDOMETER%`, `%GAUGE SET%`],
  'Speedometer Drives':           [`%SPEEDOMETER DRIVE%`, `%SPEEDO DRIVE%`],
  'Sensors':                      [`%SENSOR%`],
  'Bezel':                        [`%BEZEL%`],
  'Knobs':                        [`%KNOB%`],
  'Tin Faces':                    [`%TIN FACE%`],
  'Tachometer':                   [`%TACHOMETER%`, `%TACH%`],
  'Gauge Mounts':                 [`%GAUGE MOUNT%`],
  'Gauge Accents':                [`%GAUGE ACCENT%`],
  'Indicator Lights':             [`%INDICATOR LIGHT%`],
  'Gauge Accessories':            [`%GAUGE ACCESSOR%`],
  'Oil Pressure Gauges':          [`%OIL PRESSURE GAUGE%`],
};

// Source categories to check. Instrumentation is the obvious primary source.
// Fenders & Body is included per the handoff-log flag: it was just cut from
// 3,078 -> 137 rows this session (Tanks & Body), so any dash-panel rows that
// might live there need a fresh count, not the stale pre-session assumption.
// Accessories & Misc included because it's the known VTWIN COMMON MISC dumping
// ground per handoff log — worth checking for stray gauge/dash rows.
const SOURCE_CATEGORIES = [
  'Instrumentation',
  'Fenders & Body',
  'Accessories & Misc',
  'Handlebar & Controls', // bezels/knobs sometimes live adjacent to controls — worth a check
];

async function main() {
  console.log('=== DASHES & GAUGES — SCOPING AUDIT (read-only) ===');
  console.log(new Date().toISOString());
  console.log('');

  // 1. Current Instrumentation breakdown (baseline)
  console.log('--- 1. Current Instrumentation category (baseline) ---');
  const instrBreakdown = await db.query(`
    SELECT display_subcategory, COUNT(*) AS n
    FROM catalog_unified
    WHERE display_category = 'Instrumentation'
      AND is_active = true
    GROUP BY display_subcategory
    ORDER BY n DESC
  `);
  console.table(instrBreakdown.rows);
  const instrTotal = instrBreakdown.rows.reduce((s, r) => s + Number(r.n), 0);
  console.log(`Instrumentation total (active): ${instrTotal}`);
  console.log('');

  // 2. Per-source, per-keyword-bucket counts
  for (const source of SOURCE_CATEGORIES) {
    console.log(`--- 2. Source category: ${source} ---`);

    const totalRes = await db.query(
      `SELECT COUNT(*) AS n FROM catalog_unified WHERE display_category = $1 AND is_active = true`,
      [source]
    );
    console.log(`${source} total (active): ${totalRes.rows[0].n}`);

    const nullRes = await db.query(
      `SELECT COUNT(*) AS n FROM catalog_unified WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true`,
      [source]
    );
    console.log(`${source} NULL subcategory: ${nullRes.rows[0].n}`);
    console.log('');

    for (const [bucketName, patterns] of Object.entries(KEYWORD_BUCKETS)) {
      const orClauses = patterns.map((_, i) => `name ILIKE $${i + 2}`).join(' OR ');
      const res = await db.query(
        `SELECT COUNT(*) AS n
         FROM catalog_unified
         WHERE display_category = $1
           AND is_active = true
           AND (${orClauses})`,
        [source, ...patterns]
      );
      const n = Number(res.rows[0].n);
      if (n > 0) {
        console.log(`  ${bucketName}: ${n}`);
      }
    }
    console.log('');
  }

  // 3. Overlap check: any row matching MULTIPLE keyword buckets at once
  // (helps spot ambiguous rows before writing classification order-of-precedence)
  console.log('--- 3. Cross-bucket overlap sample (Instrumentation only, first pass) ---');
  const allPatterns = Object.values(KEYWORD_BUCKETS).flat();
  const overlapRes = await db.query(
    `
    SELECT source_vendor, name, display_subcategory, COUNT(*) OVER () AS total_matches
    FROM catalog_unified
    WHERE display_category = 'Instrumentation'
      AND is_active = true
      AND (
        ${allPatterns.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ')}
      )
    ORDER BY name
    LIMIT 25
    `,
    allPatterns
  );
  console.table(overlapRes.rows);
  console.log('');

  // 4. Sample of Fenders & Body rows matching dash/panel keywords specifically
  // (this is the "did dash panels leak into Fenders & Body" check flagged in
  // the handoff log — recount needed after Tanks & Body cut it to 137 rows)
  console.log('--- 4. Fenders & Body: dash/panel-specific sample (post Tanks & Body cut) ---');
  const fendersDashRes = await db.query(`
    SELECT source_vendor, name, display_subcategory
    FROM catalog_unified
    WHERE display_category = 'Fenders & Body'
      AND is_active = true
      AND (name ILIKE '%DASH%' OR name ILIKE '%FUEL DOOR%')
    ORDER BY name
    LIMIT 50
  `);
  console.table(fendersDashRes.rows);
  console.log(`Fenders & Body dash/fuel-door matches: ${fendersDashRes.rows.length} (limit 50, check total separately if this hits the cap)`);
  console.log('');

  // 5. "Chaps" sanity check — flagged as an odd keyword for this category.
  // Confirm these are actually gauge/dash-related and not Riding Gear & Apparel bleed.
  console.log('--- 5. "CHAPS" sanity check (flagged — verify not apparel bleed) ---');
  const chapsRes = await db.query(`
    SELECT source_vendor, display_category, display_subcategory, name, COUNT(*) OVER (PARTITION BY display_category) AS cat_count
    FROM catalog_unified
    WHERE name ILIKE '%CHAPS%'
      AND is_active = true
    ORDER BY display_category, name
    LIMIT 50
  `);
  console.table(chapsRes.rows);
  console.log('');

  // 6. Null-subcategory rows in Instrumentation that DON'T match any keyword bucket
  // (these would remain unclassified even after the rebuild — surfacing early)
  console.log('--- 6. Instrumentation NULL-subcategory rows matching NO keyword bucket ---');
  const unmatchedRes = await db.query(
    `
    SELECT source_vendor, name
    FROM catalog_unified
    WHERE display_category = 'Instrumentation'
      AND is_active = true
      AND display_subcategory IS NULL
      AND NOT (${allPatterns.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ')})
    ORDER BY name
    LIMIT 50
    `,
    allPatterns
  );
  console.table(unmatchedRes.rows);
  console.log('');

  console.log('=== AUDIT COMPLETE — no writes performed ===');
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('AUDIT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
