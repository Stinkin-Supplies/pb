const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

async function deleteWps() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Deleting WPS products in batches...');
    let total = 0;
    while (true) {
      const result = await client.query(`
        DELETE FROM catalog_products 
        WHERE id IN (
          SELECT id FROM catalog_products 
          WHERE source_vendor LIKE '%wps%' 
          LIMIT 5000
        )
      `);
      total += result.rowCount;
      if (result.rowCount === 0) break;
      console.log(`Deleted ${total} so far...`);
    }
    
    await client.query('COMMIT');
    console.log(`Done! Deleted ${total} total`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

deleteWps();
