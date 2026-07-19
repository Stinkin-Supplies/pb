#!/usr/bin/env node
// scripts/ingest/promote_wps_fitment.cjs
// Reads wps_catalog.fitment -> harley_vehicles[]
// Resolves to harley_model_years via year + model name fuzzy match
// Inserts into catalog_fitment_v2 (product_id, model_year_id, fitment_source)

'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});

async function run() {
  const client = await pool.connect();
  try {

    // ── 1. Load all harley_model_years with model name for matching ────────────
    console.log('Loading harley_model_years...');
    const { rows: myRows } = await client.query(`
      SELECT
        hmy.id           AS model_year_id,
        hmy.year,
        hm.model_code,
        lower(hm.name)   AS model_name_lower
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
    `);

    // Build lookup: "year|model_name_lower" → model_year_id
    // Also index by year → [{model_year_id, model_code, model_name_lower}] for fuzzy fallback
    const exactMap = new Map();   // "1999|flhr road king" → model_year_id
    const yearMap  = new Map();   // 1999 → [{...}]

    for (const r of myRows) {
      exactMap.set(`${r.year}|${r.model_name_lower}`, r.model_year_id);
      if (!yearMap.has(r.year)) yearMap.set(r.year, []);
      yearMap.get(r.year).push(r);
    }
    console.log(`  ${myRows.length} model-year rows loaded.`);

    // ── 1b. Load model_alias_map for WPS-style naming (e.g. "Pan America 1250"
    // → RA1250, "Sportster S" → RH1250S, "Nightster" → RH975) ──────────────────
    console.log('Loading model_alias_map...');
    const { rows: aliasRows } = await client.query(`
      SELECT lower(alias_text) AS alias_lower, model_code, priority
      FROM model_alias_map
      WHERE is_active = true AND model_code IS NOT NULL
      ORDER BY priority ASC
    `);
    // "pan america" → "RA1250" (first/highest-priority wins on dedup)
    const aliasMap = new Map();
    for (const r of aliasRows) {
      if (!aliasMap.has(r.alias_lower)) aliasMap.set(r.alias_lower, r.model_code);
    }
    console.log(`  ${aliasMap.size} active aliases loaded.`);

    // ── 2. Load WPS items that have Harley fitment, joined to catalog_unified ──
    console.log('Loading WPS items with Harley fitment...');
    const { rows: wpsItems } = await client.query(`
      SELECT
        cu.id                             AS product_id,
        wc.fitment->'harley_vehicles'     AS harley_vehicles
      FROM wps_catalog wc
      JOIN catalog_unified cu
        ON cu.vendor_sku = wc.sku
      WHERE wc.fitment IS NOT NULL
        AND jsonb_array_length(wc.fitment->'harley_vehicles') > 0
    `);
    console.log(`  ${wpsItems.length} WPS products with Harley fitment to promote.`);

    // ── 3. Resolve vehicle records → model_year_ids ────────────────────────────
    // WPS vehicle model names like "FLHR Road King" — strip model code prefix
    // harley_model_years names like "Road King" or "FLHR Road King"
    // Strategy: exact match on full name, then strip leading word (model code), then partial

    function resolveVehicle(year, rawModel) {
      const yearNum = parseInt(year);
      if (!yearMap.has(yearNum)) return null;

      const candidates = yearMap.get(yearNum);
      const needle = rawModel.toLowerCase().trim();

      // 1. Exact match
      const exact = exactMap.get(`${yearNum}|${needle}`);
      if (exact) return exact;

      // 2. Strip first word (model code like "FLHR") and try again
      const withoutCode = needle.replace(/^\S+\s+/, '');
      const withoutExact = exactMap.get(`${yearNum}|${withoutCode}`);
      if (withoutExact) return withoutExact;

      // 3. Partial — candidate name contains needle or vice versa
      for (const c of candidates) {
        if (c.model_name_lower.includes(withoutCode) || withoutCode.includes(c.model_name_lower)) {
          return c.model_year_id;
        }
      }
      // 4. model_code match (first word of needle vs model_code)
      const firstWord = needle.split(' ')[0].toUpperCase();
      for (const c of candidates) {
        if (c.model_code === firstWord) return c.model_year_id;
      }

      // 5. model_alias_map fallback — handles WPS-style naming that doesn't
      // match harley_models.name or model_code at all, e.g. "Pan America 1250"
      // → RA1250, "Sportster S" → RH1250S, "Nightster" → RH975.
      // Try longest-alias-first substring match so "pan america 1250 special"
      // doesn't get stuck matching only the shorter "pan america" alias when a
      // more specific one might exist.
      const sortedAliases = [...aliasMap.keys()].sort((a, b) => b.length - a.length);
      for (const aliasKey of sortedAliases) {
        if (needle.includes(aliasKey) || withoutCode.includes(aliasKey)) {
          const aliasCode = aliasMap.get(aliasKey);
          for (const c of candidates) {
            if (c.model_code === aliasCode) return c.model_year_id;
          }
          // Alias resolved to a model_code, but no row for this specific year —
          // stop here rather than falling through to a wrong candidate.
          break;
        }
      }

      return null;
    }

    // ── 4. Build insert rows, dedup on (product_id, model_year_id) ─────────────
    console.log('Resolving fitment rows...');
    const insertSet = new Map(); // "product_id|model_year_id" → true (dedup)
    let resolved = 0, unresolved = 0;

    for (const item of wpsItems) {
      const vehicles = item.harley_vehicles;
      for (const v of vehicles) {
        const model_year_id = resolveVehicle(v.year, v.model);
        if (!model_year_id) { unresolved++; continue; }
        const key = `${item.product_id}|${model_year_id}`;
        if (!insertSet.has(key)) {
          insertSet.set(key, { product_id: item.product_id, model_year_id });
          resolved++;
        }
      }
    }
    console.log(`  Resolved   : ${resolved} fitment pairs`);
    console.log(`  Unresolved : ${unresolved} vehicle records (no matching model_year)`);

    // ── 5. Batch insert with ON CONFLICT DO NOTHING ────────────────────────────
    console.log('Inserting into catalog_fitment_v2...');
    const rows = [...insertSet.values()];
    const BATCH = 500;
    let inserted = 0, skipped = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const vals  = batch.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(',');
      const params = batch.flatMap(r => [r.product_id, r.model_year_id, 'wps']);
      const result = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
         VALUES ${vals}
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        params
      );
      inserted += result.rowCount;
      skipped  += batch.length - result.rowCount;
      process.stdout.write(`\r  ${Math.min(i+BATCH, rows.length)}/${rows.length} processed`);
    }

    console.log('\n');
    console.log('── Summary ──────────────────────────────────');
    console.log(`  Rows inserted  : ${inserted}`);
    console.log(`  Skipped (dupe) : ${skipped}`);

    // ── 6. Final count ─────────────────────────────────────────────────────────
    const { rows: [totals] } = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE fitment_source = 'wps')  AS wps,
        COUNT(*) FILTER (WHERE fitment_source = 'pu')   AS pu,
        COUNT(*) FILTER (WHERE fitment_source = 'jwboon') AS jwboon,
        COUNT(*) FILTER (WHERE fitment_source = 'vtwin') AS vtwin,
        COUNT(*) FILTER (WHERE fitment_source = 'oem')  AS oem
      FROM catalog_fitment_v2
    `);
    console.log('\n── catalog_fitment_v2 totals ─────────────────');
    console.log(`  Total   : ${totals.total}`);
    console.log(`  WPS     : ${totals.wps}`);
    console.log(`  PU      : ${totals.pu}`);
    console.log(`  JW Boon : ${totals.jwboon}`);
    console.log(`  VTwin   : ${totals.vtwin}`);
    console.log(`  OEM     : ${totals.oem}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
