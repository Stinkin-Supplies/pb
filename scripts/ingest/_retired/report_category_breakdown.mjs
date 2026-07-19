// report_category_breakdown.mjs
//
// Final breakdown report: every display_category and its subcategories,
// with row counts, now that the entire taxonomy rebuild project (including
// the last 5 Brakes oddballs) is closed out.
//
// Read-only. No writes.
//
// Run: node report_category_breakdown.mjs

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

async function main() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query(`SELECT COUNT(*)::int AS n FROM catalog_unified WHERE is_active = true`);
    const total = totalRes.rows[0].n;

    const catRes = await client.query(`
      SELECT display_category, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category IS NOT NULL
      GROUP BY display_category
      ORDER BY n DESC
    `);

    const nullCatRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified WHERE is_active = true AND display_category IS NULL
    `);

    const subRes = await client.query(`
      SELECT display_category, display_subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category IS NOT NULL
      GROUP BY display_category, display_subcategory
      ORDER BY display_category, n DESC
    `);

    const subByCategory = {};
    for (const row of subRes.rows) {
      if (!subByCategory[row.display_category]) subByCategory[row.display_category] = [];
      subByCategory[row.display_category].push({ subcategory: row.display_subcategory, n: row.n });
    }

    let md = `# Category & Subcategory Breakdown Report\n\n`;
    md += `Generated from live \`catalog_unified\` data, active products only.\n\n`;
    md += `**Total active products:** ${total.toLocaleString()}\n\n`;
    md += `**Products with NULL display_category:** ${nullCatRes.rows[0].n}\n\n`;
    md += `---\n\n`;
    md += `## Summary by Category\n\n`;
    md += `| Category | Products | % of Total |\n`;
    md += `|---|---|---|\n`;
    for (const r of catRes.rows) {
      const pct = ((r.n / total) * 100).toFixed(1);
      md += `| ${r.display_category} | ${r.n.toLocaleString()} | ${pct}% |\n`;
    }
    md += `\n---\n\n`;
    md += `## Detailed Breakdown (Category -> Subcategories)\n\n`;

    for (const r of catRes.rows) {
      md += `### ${r.display_category} (${r.n.toLocaleString()} total)\n\n`;
      const subs = subByCategory[r.display_category] || [];
      const nullSubs = subs.filter((s) => s.subcategory === null);
      const realSubs = subs.filter((s) => s.subcategory !== null);
      if (realSubs.length > 0) {
        md += `| Subcategory | Products |\n|---|---|\n`;
        for (const s of realSubs) {
          md += `| ${s.subcategory} | ${s.n.toLocaleString()} |\n`;
        }
      }
      if (nullSubs.length > 0) {
        md += `\n**NULL subcategory (unclassified):** ${nullSubs[0].n.toLocaleString()}\n`;
      }
      md += `\n`;
    }

    const outPath = path.resolve(__dirname, 'category_breakdown_report.md');
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`Report written to ${outPath}`);
    console.log(`\nTotal active products: ${total}`);
    console.log(`Categories: ${catRes.rows.length}`);
    console.log(`NULL category rows: ${nullCatRes.rows[0].n}`);

    console.log('\n=== Quick category summary ===');
    for (const r of catRes.rows) {
      const subs = subByCategory[r.display_category] || [];
      const nullCount = subs.find((s) => s.subcategory === null)?.n || 0;
      console.log(`  ${r.n.toString().padStart(6)}  ${r.display_category} (${subs.length - (nullCount ? 1 : 0)} subcats, ${nullCount} NULL)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Report failed:', err);
  process.exit(1);
});
