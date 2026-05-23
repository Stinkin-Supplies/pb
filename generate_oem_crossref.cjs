#!/usr/bin/env node
/**
 * generate_oem_crossref.cjs
 *
 * Builds OEM cross-reference JSON using all three crossref sources:
 *   1. vtwin_oem_crossref    — direct HD OEM → VTwin part number mapping
 *   2. catalog_oem_crossref  — FatBook/PU DS SKU → HD OEM mapping
 *   3. catalog_unified.oem_numbers array — all vendors
 *
 * Combined with:
 *   v_oem_fitment            — OEM description, section, year range, model codes
 *   catalog_fitment_readable — full year×model×family fitment per product
 *
 * Run: node generate_oem_crossref.cjs > oem_crossref.json
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
});

function collapseYears(years) {
  if (!years.length) return '—';
  const sorted = [...new Set(years)].map(Number).sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { ranges.push(start === end ? `${start}` : `${start}–${end}`); start = end = sorted[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return ranges.join(', ');
}

// Valid HD OEM formats: 63731-99A / 17042-92 / 11002 / 11133A
function isHdOem(s) {
  if (!s) return false;
  const t = s.trim();
  return /^[0-9]{4,5}-[0-9]{2}[A-Z]{0,2}$/.test(t) || /^[0-9]{4,6}[A-Z]{0,2}$/.test(t);
}

async function main() {
  const client = await pool.connect();
  try {

    // ── 1. Build OEM → { vtwin[], wps[], pu[], product_ids[] } ──────────────
    process.stderr.write('Fetching OEM × vendor SKUs from all sources...\n');
    const { rows: skuRows } = await client.query(`
      SELECT oem, vendor_sku, source_vendor, product_id
      FROM (
        -- Source 1: vtwin_oem_crossref
        SELECT
          v.hd_oem_number       AS oem,
          cu.vendor_sku,
          cu.source_vendor,
          cu.id                 AS product_id
        FROM vtwin_oem_crossref v
        JOIN catalog_unified cu ON cu.vendor_sku = v.vt_part_number
        WHERE cu.is_active = true

        UNION ALL

        -- Source 2: catalog_oem_crossref (FatBook / DS / PU)
        SELECT
          c.oem_number          AS oem,
          cu.vendor_sku,
          cu.source_vendor,
          cu.id                 AS product_id
        FROM catalog_oem_crossref c
        JOIN catalog_unified cu ON cu.vendor_sku = c.sku
        WHERE cu.is_active = true

        UNION ALL

        -- Source 3: oem_numbers array on catalog_unified
        SELECT
          unnest(cu.oem_numbers) AS oem,
          cu.vendor_sku,
          cu.source_vendor,
          cu.id                  AS product_id
        FROM catalog_unified cu
        WHERE cu.is_active = true
          AND cu.oem_numbers IS NOT NULL
          AND array_length(cu.oem_numbers, 1) > 0
      ) combined
      WHERE oem ~ '^[0-9]{4,5}-[0-9]{2}[A-Z]{0,2}$'
         OR oem ~ '^[0-9]{4,6}[A-Z]{0,2}$'
      ORDER BY oem, source_vendor
    `);
    process.stderr.write(`Got ${skuRows.length} oem×sku rows\n`);

    // ── 2. OEM metadata from v_oem_fitment ──────────────────────────────────
    process.stderr.write('Fetching OEM metadata...\n');
    const { rows: metaRows } = await client.query(`
      SELECT
        oem_part_no,
        description,
        primary_section  AS section,
        first_catalog_year,
        last_catalog_year,
        all_model_codes,
        fits_all_models
      FROM v_oem_fitment
      ORDER BY oem_part_no
    `);
    const metaIndex = {};
    for (const r of metaRows) metaIndex[r.oem_part_no] = r;
    process.stderr.write(`Got ${metaRows.length} OEM metadata rows\n`);

    // ── 3. Fitment from catalog_fitment_readable ─────────────────────────────
    process.stderr.write('Fetching fitment...\n');
    const { rows: fitRows } = await client.query(`
      SELECT product_id, family, model, model_code, year
      FROM catalog_fitment_readable
      ORDER BY product_id, family, model_code, year
    `);
    process.stderr.write(`Got ${fitRows.length} fitment rows\n`);

    // Index fitment by product_id
    const fitIndex = {};
    for (const r of fitRows) {
      if (!fitIndex[r.product_id]) fitIndex[r.product_id] = {};
      const key = `${r.family}||${r.model_code}||${r.model}`;
      if (!fitIndex[r.product_id][key]) fitIndex[r.product_id][key] = new Set();
      fitIndex[r.product_id][key].add(r.year);
    }

    // ── 4. Assemble cross-reference ──────────────────────────────────────────
    process.stderr.write('Assembling...\n');
    const xref = {};

    for (const row of skuRows) {
      const oem = row.oem.trim();
      if (!xref[oem]) {
        const meta = metaIndex[oem] || {};
        xref[oem] = {
          oem,
          description:  meta.description      || '',
          section:      meta.section           || '',
          first_year:   meta.first_catalog_year || null,
          last_year:    meta.last_catalog_year  || null,
          model_codes:  meta.all_model_codes    || [],
          fits_all:     meta.fits_all_models    || false,
          vtwin: new Set(),
          wps:   new Set(),
          pu:    new Set(),
          product_ids: new Set(),
        };
      }

      const e = xref[oem];
      const v = (row.source_vendor || '').toUpperCase();
      if (row.vendor_sku) {
        if (v === 'VTWIN') e.vtwin.add(row.vendor_sku);
        else if (v === 'WPS') e.wps.add(row.vendor_sku);
        else if (v === 'PU')  e.pu.add(row.vendor_sku);
      }
      if (row.product_id) e.product_ids.add(row.product_id);
    }

    // Also add OEM numbers that exist in v_oem_fitment but have no vendor match yet
    for (const meta of metaRows) {
      const oem = meta.oem_part_no;
      if (!xref[oem]) {
        xref[oem] = {
          oem,
          description: meta.description       || '',
          section:     meta.section            || '',
          first_year:  meta.first_catalog_year || null,
          last_year:   meta.last_catalog_year  || null,
          model_codes: meta.all_model_codes    || [],
          fits_all:    meta.fits_all_models    || false,
          vtwin: new Set(),
          wps:   new Set(),
          pu:    new Set(),
          product_ids: new Set(),
        };
      }
    }

    // ── 5. Attach fitment + serialise ────────────────────────────────────────
    process.stderr.write('Attaching fitment and serialising...\n');
    const output = {};

    for (const [oem, e] of Object.entries(xref)) {
      // Merge fitment across all matched product_ids
      const merged = {};
      for (const pid of e.product_ids) {
        const pf = fitIndex[pid];
        if (!pf) continue;
        for (const [key, years] of Object.entries(pf)) {
          if (!merged[key]) merged[key] = new Set();
          for (const y of years) merged[key].add(y);
        }
      }

      const fitment = Object.entries(merged).map(([key, years]) => {
        const [family, model_code, model_name] = key.split('||');
        return { family, model_code, model_name, years: collapseYears([...years]) };
      }).sort((a, b) => a.family.localeCompare(b.family) || a.model_code.localeCompare(b.model_code));

      output[oem] = {
        oem,
        description: e.description,
        section:     e.section,
        first_year:  e.first_year,
        last_year:   e.last_year,
        model_codes: e.model_codes,
        fits_all:    e.fits_all,
        vtwin:       [...e.vtwin].sort(),
        wps:         [...e.wps].sort(),
        pu:          [...e.pu].sort(),
        fitment,
      };
    }

    const total   = Object.keys(output).length;
    const matched = Object.values(output).filter(e => e.vtwin.length || e.wps.length || e.pu.length).length;
    const multi   = Object.values(output).filter(e => (!!e.vtwin.length + !!e.wps.length + !!e.pu.length) > 1).length;
    process.stderr.write(`Total: ${total} OEM numbers\n`);
    process.stderr.write(`Matched to at least one vendor: ${matched}\n`);
    process.stderr.write(`Cross-vendor (2+ vendors): ${multi}\n`);

    process.stdout.write(JSON.stringify(output, null, 2));
    process.stderr.write('\nDone.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write('Error: ' + err.message + '\n');
  process.exit(1);
});
