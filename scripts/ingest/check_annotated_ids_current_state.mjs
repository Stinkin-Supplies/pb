// check_annotated_ids_current_state.mjs
//
// Laken annotated change_to values on accessories_misc_remaining.csv (the
// OLDER 686-row export), but several rows in that file may have already
// been moved out of Accessories & Misc by the wave-4b, wrong-category-65,
// remaining-cleanup, or final-two fix scripts that ran afterward. This
// checks the CURRENT state of every id with a filled change_to value, so
// we only act on rows that are still actually sitting in Accessories &
// Misc with NULL subcategory.
//
// Read-only. No writes.
//
// Run: node check_annotated_ids_current_state.mjs

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const CSV_PATH = path.resolve(__dirname, 'accessories_misc_remaining.csv');

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const text = content.replace(/\r\n/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1 || r[0] !== '').map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });
}

async function main() {
  const client = await pool.connect();
  try {
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const csvRows = parseCsv(csvContent);
    const filled = csvRows.filter((r) => r.change_to && r.change_to.trim());

    console.log(`Total rows with change_to filled: ${filled.length}`);

    const stillInAccMisc = [];
    const alreadyMoved = [];

    for (const r of filled) {
      const id = Number(r.id);
      const res = await client.query(
        `SELECT id, name, display_category, display_subcategory, is_active FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (res.rows.length === 0) {
        alreadyMoved.push({ ...r, currentState: 'NOT FOUND' });
        continue;
      }
      const cur = res.rows[0];
      if (cur.display_category === 'Accessories & Misc' && cur.display_subcategory === null && cur.is_active) {
        stillInAccMisc.push(r);
      } else {
        alreadyMoved.push({
          ...r,
          currentState: `${cur.display_category}/${cur.display_subcategory ?? 'NULL'}${cur.is_active ? '' : ' (INACTIVE)'}`,
        });
      }
    }

    console.log(`\nStill in Accessories & Misc (NULL subcat, active) -- actionable: ${stillInAccMisc.length}`);
    console.log(`Already moved/changed since annotation -- NOT actionable via this file: ${alreadyMoved.length}`);

    console.log(`\n=== Already-moved rows (current state shown) ===`);
    for (const r of alreadyMoved) {
      console.log(`  [${r.id}] ${r.name} | annotated change_to: "${r.change_to}" | current: ${r.currentState}`);
    }

    console.log(`\n=== Still-actionable rows ===`);
    for (const r of stillInAccMisc) {
      console.log(`  [${r.id}] ${r.name} | change_to: "${r.change_to}"`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
