/**
 * Stage 0: Import ACES XML into raw_vendor_aces
 *
 * Stores each ACES XML file as a JSON string in the `payload` JSONB column.
 * (Matches how `stage0-pies.cjs` stores XML.)
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-aces.cjs [acesDir]
 *
 * Default dir:
 *   /Users/home/Desktop/Stinkin-Supplies/data/aces
 *
 * Requires:
 *   CATALOG_DATABASE_URL
 */

'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('❌ Missing CATALOG_DATABASE_URL. Check .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const ACES_DIR = process.argv[2] || path.resolve(__dirname, '../../data/aces');

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.xml', '.txt'].includes(ext);
    })
    .map((file) => path.join(dir, file));
}

function toPayload(raw) {
  // Store as a JSON string so it fits in JSONB without lossy escaping.
  return JSON.stringify(raw);
}

async function main() {
  const files = listFiles(ACES_DIR);

  if (!files.length) {
    console.log(`[Stage0-ACES] No ACES files found in ${ACES_DIR}`);
    return;
  }

  console.log(`[Stage0-ACES] Importing ${files.length} file(s) from ${ACES_DIR}`);

  const client = await pool.connect();
  let imported = 0;
  let failed = 0;

  try {
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');

        await client.query(
          `
            INSERT INTO raw_vendor_aces (payload, source_file, imported_at)
            VALUES ($1::jsonb, $2, NOW())
            ON CONFLICT (source_file) DO UPDATE
              SET payload = EXCLUDED.payload,
                  imported_at = NOW()
          `,
          [toPayload(raw), fileName]
        );

        imported++;
        console.log(`[Stage0-ACES] ✓ ${fileName}`);
      } catch (err) {
        failed++;
        console.error(`[Stage0-ACES] ✗ ${fileName}: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`[Stage0-ACES] Complete — imported: ${imported}, failed: ${failed}`);
}

main().catch((err) => {
  console.error('[Stage0-ACES] Fatal:', err);
  process.exit(1);
});

