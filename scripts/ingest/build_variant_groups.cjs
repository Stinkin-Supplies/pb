#!/usr/bin/env node
// build_variant_groups.cjs
const { Pool } = require('pg');
const DRY = process.argv.includes('--dry');
const TOKEN = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const BASE  = 'http://api.wps-inc.com';
const pool = new Pool({ host: '2a01:4ff:f0:fa6f::1', port: 5432, database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly' });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

async function main() {
  console.log(`Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);

  // First — find actual brand column name in catalog_unified
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_unified' AND column_name ILIKE '%brand%' ORDER BY column_name`);
  console.log(`catalog_unified brand columns: ${cols.map(c => c.column_name).join(', ')}`);

  // Find actual slug/name column too
  const nameCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_unified' AND column_name IN ('slug','name','product_name','title') ORDER BY column_name`);
  console.log(`catalog_unified name/slug columns: ${nameCols.map(c => c.column_name).join(', ')}`);

  const brandCol = cols[0]?.column_name ?? 'brand';

  // Groups: wps_product_id with 2+ items in catalog_unified
  const groups = await q(`
    SELECT
      w.wps_product_id,
      COUNT(DISTINCT cu.id) as item_count,
      array_agg(DISTINCT cu.id ORDER BY cu.id) as unified_ids,
      array_agg(DISTINCT cu.sku ORDER BY cu.sku) as skus,
      MIN(cu.name) as sample_name,
      MIN(cu.${brandCol}) as brand
    FROM wps_catalog w
    JOIN catalog_unified cu ON cu.vendor_sku = w.sku
    WHERE w.wps_product_id IS NOT NULL
    GROUP BY w.wps_product_id
    HAVING COUNT(DISTINCT cu.id) > 1
    ORDER BY COUNT(DISTINCT cu.id) DESC
  `);

  console.log(`\nFound ${groups.length} variant groups (2+ items each)`);
  console.log(`Total variant SKUs: ${groups.reduce((s, g) => s + parseInt(g.item_count), 0)}`);
  console.log('\nTop 20:');
  groups.slice(0, 20).forEach(g =>
    console.log(`  wps_product_id=${g.wps_product_id} — ${g.item_count} items — "${g.sample_name}" (${g.brand})`)
  );

  if (DRY) { await pool.end(); return; }

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_groups (
      id             SERIAL PRIMARY KEY,
      wps_product_id INTEGER UNIQUE,
      display_name   TEXT NOT NULL,
      source_vendor  TEXT NOT NULL DEFAULT 'WPS',
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_members (
      id             SERIAL PRIMARY KEY,
      group_id       INTEGER NOT NULL REFERENCES catalog_variant_groups(id) ON DELETE CASCADE,
      product_id     INTEGER NOT NULL REFERENCES catalog_unified(id) ON DELETE CASCADE,
      option_1_name  TEXT,
      option_1_value TEXT,
      option_2_name  TEXT,
      option_2_value TEXT,
      sort_order     INTEGER DEFAULT 0,
      UNIQUE (group_id, product_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_members_product ON catalog_variant_members(product_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_members_group   ON catalog_variant_members(group_id)`);
  console.log('\nTables ready');

  // Fetch product display names from WPS API
  const productIds = groups.map(g => g.wps_product_id);
  const productNames = {};
  console.log(`Fetching ${productIds.length} product names from WPS API...`);
  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    try {
      const res = await fetch(`${BASE}/products?filter[id]=${batch.join(',')}&page[size]=50`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.data) data.data.forEach(p => { productNames[p.id] = p.name; });
    } catch (e) { console.error(`  name fetch error at ${i}: ${e.message}`); }
    if (i % 500 === 0 && i > 0) console.log(`  ${i}/${productIds.length} names fetched`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`Got ${Object.keys(productNames).length} product names`);

  // Insert groups + members
  let groupsInserted = 0, membersInserted = 0;
  for (const g of groups) {
    const displayName = productNames[g.wps_product_id] || g.sample_name;
    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES ($1, $2, 'WPS')
      ON CONFLICT (wps_product_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `, [g.wps_product_id, displayName]);
    groupsInserted++;

    for (let idx = 0; idx < g.unified_ids.length; idx++) {
      const unifiedId = g.unified_ids[idx];
      // Try to get fitment label
      const fitRows = await q(`
        SELECT hf.name as family, MIN(hmy.year) as min_year, MAX(hmy.year) as max_year
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        JOIN harley_families hf ON hf.id = hm.family_id
        WHERE cfv.product_id = $1
        GROUP BY hf.name ORDER BY hf.name LIMIT 3
      `, [unifiedId]);

      const option1Value = fitRows.length > 0
        ? fitRows.map(r => `${r.family} ${r.min_year}–${r.max_year}`).join(', ')
        : null;

      await q(`
        INSERT INTO catalog_variant_members (group_id, product_id, option_1_name, option_1_value, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (group_id, product_id) DO UPDATE SET option_1_name = EXCLUDED.option_1_name, option_1_value = EXCLUDED.option_1_value
      `, [grp.id, unifiedId, option1Value ? 'Fits' : null, option1Value, idx]);
      membersInserted++;
    }
    if (groupsInserted % 100 === 0) console.log(`  ${groupsInserted}/${groups.length} groups, ${membersInserted} members`);
  }

  // Back-reference on catalog_unified
  await pool.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);
  await pool.query(`UPDATE catalog_unified cu SET variant_group_id = cvm.group_id FROM catalog_variant_members cvm WHERE cvm.product_id = cu.id`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cu_variant_group ON catalog_unified(variant_group_id) WHERE variant_group_id IS NOT NULL`);

  console.log(`\n═══ COMPLETE ═══`);
  console.log(`  Groups: ${groupsInserted}  Members: ${membersInserted}`);
  const [stats] = await q(`SELECT (SELECT COUNT(*) FROM catalog_variant_groups) as groups, (SELECT COUNT(*) FROM catalog_variant_members) as members, (SELECT COUNT(*) FROM catalog_unified WHERE variant_group_id IS NOT NULL) as cu_tagged`);
  console.log(`  ${JSON.stringify(stats)}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
