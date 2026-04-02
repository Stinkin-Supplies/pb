const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const PIES_DIR = process.argv[2] || path.resolve(__dirname, '../../data/pies');

function listXmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.xml'))
    .map((file) => path.join(dir, file));
}

function toPayload(raw) {
  return JSON.stringify(raw);
}

async function main() {
  const files = listXmlFiles(PIES_DIR);

  if (!files.length) {
    console.log(`[Stage0-PIES] No XML files found in ${PIES_DIR}`);
    return;
  }

  console.log(`[Stage0-PIES] Importing ${files.length} file(s) from ${PIES_DIR}`);

  const client = await pool.connect();
  let imported = 0;
  let failed = 0;

  try {
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const size = Buffer.byteLength(raw, 'utf8');

        await client.query(
          `
            INSERT INTO raw_vendor_pies (payload, source_file, imported_at)
            VALUES ($1::jsonb, $2, NOW())
            ON CONFLICT (source_file) DO UPDATE
              SET payload = EXCLUDED.payload,
                  imported_at = NOW()
          `,
          [toPayload(raw), fileName]
        );

        imported++;
        console.log(`[Stage0-PIES] ✓ ${fileName}`);
      } catch (err) {
        failed++;
        console.error(`[Stage0-PIES] ✗ ${fileName}: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`[Stage0-PIES] Complete — imported: ${imported}, failed: ${failed}`);
}

main().catch((err) => {
  console.error('[Stage0-PIES] Fatal:', err);
  process.exit(1);
});
