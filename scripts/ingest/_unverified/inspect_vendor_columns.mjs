import pg from 'pg';
const { Client } = pg;

const db = new Client({ connectionString: 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' });
await db.connect();

for (const table of ['wps_catalog', 'pu_catalog', 'vtwin_catalog']) {
  const r = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  console.log(`\n── ${table} (${r.rows.length} columns) ──`);
  r.rows.forEach(c => console.log(`  ${c.column_name.padEnd(35)} ${c.data_type}`));
}

await db.end();
