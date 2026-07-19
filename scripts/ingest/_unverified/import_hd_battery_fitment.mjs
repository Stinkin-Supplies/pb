#!/usr/bin/env node
/**
 * import_hd_battery_fitment.mjs
 *
 * Creates hd_battery_fitment staging table and inserts H-D OEM battery
 * fitment data. Then cross-references with catalog_unified to show which
 * existing battery products can be linked.
 *
 * Source: H-D OEM Battery Reference (2026)
 *
 * Usage:
 *   node scripts/ingest/import_hd_battery_fitment.mjs            # dry run
 *   node scripts/ingest/import_hd_battery_fitment.mjs --apply    # commit
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool    = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY   = process.argv.includes('--apply');

// ── Battery definitions ───────────────────────────────────────────────────────
// Each battery has regional part numbers and an array of fitment rows.
// year_to: null means "current" (we resolve to 2026).
// Buell fitment is captured in notes only — not expanded into fitment rows.

const CURRENT_YEAR = 2026;

const BATTERIES = [
  {
    pn_us:    '65989-97E',
    pn_intl:  '66000207B',
    pn_emea:  '66000483',
    pn_chn:   '66000484',
    notes:    'Also fits Buell S1, S3/T, M2, X1 models.',
    fitment: [
      { family: 'VRSC',    model_desc: 'VRSC (except \'07 VRSCR)', year_from: 2007, year_to: 2017 },
      { family: 'Sportster', model_desc: 'XL',                     year_from: 1997, year_to: 2003 },
      { family: 'Dyna',    model_desc: 'Dyna',                     year_from: 1997, year_to: 2017 },
      { family: 'Softail', model_desc: 'Softail',                  year_from: 1997, year_to: CURRENT_YEAR },
      { family: 'Adventure Touring', model_desc: 'RA1250, RA1250S, RA1250SE', year_from: 2024, year_to: CURRENT_YEAR },
    ],
  },
  {
    pn_us:    '65958-04C',
    pn_intl:  '66000208B',
    pn_emea:  '66000485',
    pn_chn:   '66000486',
    notes:    'Also fits Buell 1125R/CR models.',
    fitment: [
      { family: 'Street',     model_desc: 'XG',                    year_from: 2015, year_to: CURRENT_YEAR },
      { family: 'RH Series',  model_desc: 'Revolution Max (RH/RA)', year_from: 2021, year_to: CURRENT_YEAR },
      { family: 'Sportster',  model_desc: 'XL',                    year_from: 2004, year_to: CURRENT_YEAR },
      { family: 'Sportster',  model_desc: 'XR',                    year_from: 2008, year_to: 2012 },
    ],
  },
  {
    pn_us:    '66010-97E',
    pn_intl:  '66000212B',
    pn_emea:  '66000481',
    pn_chn:   '66000482',
    notes:    null,
    fitment: [
      { family: 'Touring',  model_desc: 'Touring',                 year_from: 1997, year_to: CURRENT_YEAR },
      { family: 'Trike',    model_desc: 'Trike',                   year_from: 2009, year_to: CURRENT_YEAR },
    ],
  },
  {
    pn_us:    '65948-00C',
    pn_intl:  '66000206A',
    pn_emea:  '66000478',
    pn_chn:   null,
    notes:    'Also fits Buell XB and Blast models.',
    fitment: [
      { family: 'VRSC',  model_desc: 'VRSC',                       year_from: 2002, year_to: 2006 },
      { family: 'VRSC',  model_desc: 'VRSCR',                      year_from: 2007, year_to: 2007 },
    ],
  },
  {
    pn_us:    '65991-82B',
    pn_intl:  '66000209A',
    pn_emea:  null,
    pn_chn:   null,
    notes:    'Replaces P/Ns 65991-82A and 65991-75C. Also fits Buell S2/T Thunderbolt models.',
    fitment: [
      { family: 'Sportster', model_desc: 'XLCR',                   year_from: 1977, year_to: 1978 },
      { family: 'Sportster', model_desc: 'XL',                     year_from: 1979, year_to: 1996 },
      { family: 'Dyna',      model_desc: 'FX (electric start)',     year_from: 1973, year_to: 1994 },
      { family: 'Dyna',      model_desc: 'FXR',                    year_from: 1973, year_to: 1994 },
      { family: 'Dyna',      model_desc: 'FXR',                    year_from: 1999, year_to: 2000 },
      { family: 'Softail',   model_desc: 'Softail',                year_from: 1984, year_to: 1990 },
    ],
  },
  {
    pn_us:    '66010-82B',
    pn_intl:  '66000210A',
    pn_emea:  null,
    pn_chn:   null,
    notes:    null,
    fitment: [
      { family: 'Touring', model_desc: 'FLHR, FLHT, FLT Touring',  year_from: 1980, year_to: 1996 },
    ],
  },
  {
    pn_us:    '65989-90B',
    pn_intl:  '66000211A',
    pn_emea:  null,
    pn_chn:   null,
    notes:    null,
    fitment: [
      { family: 'Dyna',    model_desc: 'Dyna',                     year_from: 1991, year_to: 1996 },
      { family: 'Softail', model_desc: 'Softail',                  year_from: 1991, year_to: 1996 },
    ],
  },
];

// ── DDL ───────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS hd_battery_fitment (
  id            SERIAL PRIMARY KEY,
  pn_us         VARCHAR(20) NOT NULL,    -- canonical US OEM part number
  pn_intl       VARCHAR(20),             -- CAN/INDIA/LATAM part number
  pn_emea       VARCHAR(20),             -- APC/EMEA part number
  pn_chn        VARCHAR(20),             -- CHN part number
  hd_family     VARCHAR(50),             -- Softail, Touring, Dyna, etc.
  model_desc    TEXT        NOT NULL,    -- human-readable model description
  year_from     SMALLINT    NOT NULL,
  year_to       SMALLINT    NOT NULL,
  notes         TEXT,                    -- Buell compat, supersession notes
  source        VARCHAR(30) DEFAULT 'HD_OEM_2026',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hdb_pn_us   ON hd_battery_fitment(pn_us);
CREATE INDEX IF NOT EXISTS idx_hdb_family  ON hd_battery_fitment(hd_family);
CREATE INDEX IF NOT EXISTS idx_hdb_years   ON hd_battery_fitment(year_from, year_to);
`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  console.log(`\n=== H-D Battery Fitment Import ===`);
  console.log(`Mode: ${APPLY ? '** APPLY **' : 'DRY RUN'}\n`);

  try {
    // Build all rows
    const rows = [];
    for (const bat of BATTERIES) {
      for (const fit of bat.fitment) {
        rows.push({
          pn_us:      bat.pn_us,
          pn_intl:    bat.pn_intl ?? null,
          pn_emea:    bat.pn_emea ?? null,
          pn_chn:     bat.pn_chn ?? null,
          hd_family:  fit.family,
          model_desc: fit.model_desc,
          year_from:  fit.year_from,
          year_to:    fit.year_to,
          notes:      bat.notes ?? null,
        });
      }
    }

    console.log(`Batteries:    ${BATTERIES.length}`);
    console.log(`Fitment rows: ${rows.length}`);
    console.log('\nSummary by battery:');
    for (const bat of BATTERIES) {
      const yearRanges = bat.fitment.map(f => `${f.family} ${f.year_from}-${f.year_to}`).join(' | ');
      console.log(`  ${bat.pn_us.padEnd(14)} ${bat.fitment.length} rows  ${yearRanges}`);
    }

    // Cross-reference preview against catalog_unified
    console.log('\nChecking catalog_unified for matching battery products...');
    const allPns = BATTERIES.flatMap(b => [b.pn_us, b.pn_intl, b.pn_emea, b.pn_chn].filter(Boolean));
    const { rows: catalogMatches } = await client.query(`
      SELECT cu.id, cu.sku, cu.source_vendor, cu.brand, cu.name,
             cu.vendor_sku, cu.brand_part_number,
             coc.oem_number
      FROM catalog_unified cu
      LEFT JOIN catalog_oem_crossref coc ON coc.sku = cu.sku
      WHERE cu.is_active = true
        AND (
          cu.display_category = 'Electrical'
          OR cu.display_subcategory ILIKE '%batter%'
          OR cu.name ILIKE '%agm batter%'
          OR cu.name ILIKE '%battery%'
        )
        AND (
          cu.brand_part_number = ANY($1::text[])
          OR coc.oem_number = ANY($1::text[])
          OR cu.name ~* 'AGM|YTX20|YTX14|65989|65958|66010|65948|65991'
        )
      LIMIT 20
    `, [allPns]);

    if (catalogMatches.length > 0) {
      console.log(`Found ${catalogMatches.length} potential matches in catalog_unified:`);
      for (const m of catalogMatches) {
        console.log(`  [${m.source_vendor}] ${m.sku} "${m.name?.slice(0, 60)}" bpn=${m.brand_part_number}`);
      }
    } else {
      console.log('  No direct matches found in catalog_unified (OEM PNs not yet in crossref).');
      console.log('  Battery OEM numbers can be added to catalog_oem_crossref after product matching.');
    }

    if (!APPLY) {
      console.log('\nDry run complete. Pass --apply to create table and insert rows.\n');
      return;
    }

    // Create table
    console.log('\nCreating table...');
    await client.query(DDL);

    // Truncate + reinsert (idempotent)
    await client.query(`DELETE FROM hd_battery_fitment WHERE source = 'HD_OEM_2026'`);

    // Insert all rows
    await client.query('BEGIN');
    try {
      for (const row of rows) {
        await client.query(`
          INSERT INTO hd_battery_fitment
            (pn_us, pn_intl, pn_emea, pn_chn,
             hd_family, model_desc, year_from, year_to, notes, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'HD_OEM_2026')
        `, [
          row.pn_us, row.pn_intl, row.pn_emea, row.pn_chn,
          row.hd_family, row.model_desc, row.year_from, row.year_to, row.notes,
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Verify
    const { rows: [{ total }] } = await client.query(`SELECT COUNT(*) AS total FROM hd_battery_fitment`);
    const { rows: byBat } = await client.query(`
      SELECT pn_us, COUNT(*) AS rows
      FROM hd_battery_fitment
      GROUP BY pn_us ORDER BY pn_us
    `);

    console.log(`\n✅ Done. hd_battery_fitment: ${total} rows`);
    for (const r of byBat) {
      console.log(`  ${r.pn_us}: ${r.rows} fitment row(s)`);
    }

    // Offer to add OEM numbers to catalog_oem_crossref
    console.log(`
Next steps:
  1. Run catalog crossref to link battery products to these OEM numbers:
       SELECT pn_us, pn_intl FROM hd_battery_fitment GROUP BY pn_us, pn_intl;
  2. For any batteries found in catalog_unified, insert into catalog_oem_crossref:
       INSERT INTO catalog_oem_crossref (sku, oem_number, source, expanded_from)
       VALUES ('<product_sku>', '65989-97E', 'HD_OEM', false)
       ON CONFLICT (sku, oem_number) DO NOTHING;
`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
