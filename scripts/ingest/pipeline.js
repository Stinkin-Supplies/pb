/**
 * Ingestion Pipeline Orchestrator
 * Runs Stage 0 → 1 → 2 → 3 in sequence with timing + error isolation.
 *
 * Usage:
 *   node ingest/pipeline.js             # full run
 *   node ingest/pipeline.js --from 2    # start from Stage 2 (skip 0+1)
 *   node ingest/pipeline.js --stage 3   # run only Stage 3
 *   node ingest/pipeline.js --dry       # validate config, don't write
 *
 * Cron (vercel.json or system cron):
 *   Stage 0+1 (heavy): nightly 2am
 *   Stage 2 (pricing): nightly 3am (after 0+1)
 *   Stage 3 (reindex): nightly 4am (after 2)
 */

import { importRaw }           from './stage0/raw_import.js';
import { normalizeWps }        from './stage1/normalize_wps.js';
import { normalizePu }         from './stage1/normalize_pu.js';
import { runComputedValues }   from './stage2/computed_values.js';
import { buildTypesenseIndex } from './stage3/index_assembly.js';
import { sql }                 from '../lib/db.js';

// ─── config ───────────────────────────────────────────────────────────────────

const RAW_FOLDERS = {
  raw_vendor_pu:              process.env.PU_CSV_FOLDER    ?? './data/pu',
  raw_vendor_wps_products:    process.env.WPS_PROD_FOLDER  ?? './data/wps/products',
  raw_vendor_wps_inventory:   process.env.WPS_INV_FOLDER   ?? './data/wps/inventory',
  raw_vendor_pies:            process.env.PIES_FOLDER      ?? './data/pies',
  raw_vendor_aces:            process.env.ACES_FOLDER      ?? './data/aces',
};

// ─── arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args  = process.argv.slice(2);
  const from  = args.includes('--from')  ? Number(args[args.indexOf('--from')  + 1]) : 0;
  const only  = args.includes('--stage') ? Number(args[args.indexOf('--stage') + 1]) : null;
  const dry   = args.includes('--dry');
  return { from, only, dry };
}

// ─── sync log ─────────────────────────────────────────────────────────────────

async function logSync(stage, status, details = {}) {
  try {
    await sql`
      INSERT INTO sync_log (stage, status, details, created_at)
      VALUES (${stage}, ${status}, ${JSON.stringify(details)}, NOW())
    `;
  } catch {
    // sync_log table may not exist yet — non-fatal
  }
}

// ─── stage runner ─────────────────────────────────────────────────────────────

async function runStage(name, stageNum, fn, { dry, from, only }) {
  if (only !== null && only !== stageNum) return;
  if (stageNum < from) { console.log(`[Pipeline] Skipping Stage ${stageNum} (--from ${from})`); return; }
  if (dry) { console.log(`[Pipeline] DRY RUN — would run Stage ${stageNum}: ${name}`); return; }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Pipeline] Stage ${stageNum}: ${name}`);
  console.log(`${'═'.repeat(60)}`);

  const start = Date.now();
  await logSync(`stage${stageNum}`, 'started', { name });

  try {
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Pipeline] ✓ Stage ${stageNum} complete in ${elapsed}s`, result ?? '');
    await logSync(`stage${stageNum}`, 'complete', { elapsed, ...result });
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[Pipeline] ✗ Stage ${stageNum} FAILED after ${elapsed}s: ${err.message}`);
    console.error(err.stack);
    await logSync(`stage${stageNum}`, 'failed', { elapsed, error: err.message });
    throw err; // halt pipeline on failure
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const pipelineStart = Date.now();

  console.log('\n🏁 STINKIN\' SUPPLIES — INGESTION PIPELINE');
  console.log(`   ${new Date().toISOString()}`);
  if (opts.dry)           console.log('   MODE: DRY RUN');
  if (opts.from > 0)      console.log(`   MODE: Starting from Stage ${opts.from}`);
  if (opts.only !== null) console.log(`   MODE: Running only Stage ${opts.only}`);

  // ── Stage 0: Raw vendor capture ───────────────────────────────────────────
  await runStage('Raw Vendor Capture', 0, async () => {
    const results = {};
    for (const [table, folder] of Object.entries(RAW_FOLDERS)) {
      results[table] = await importRaw(folder, table);
    }
    return results;
  }, opts);

  // ── Stage 1a: WPS normalization ───────────────────────────────────────────
  await runStage('Normalize WPS', 1, () => normalizeWps(), opts);

  // ── Stage 1b: PU normalization (CSV + PIES + ACES) ────────────────────────
  await runStage('Normalize PU (CSV + PIES + ACES)', 1, () => normalizePu(), opts);

  // ── Stage 2: Computed values ──────────────────────────────────────────────
  await runStage('Computed Values (pricing + stock + discontinued)', 2,
    () => runComputedValues(), opts);

  // ── Stage 3: Typesense index ──────────────────────────────────────────────
  await runStage('Typesense v2 Index Assembly', 3,
    () => buildTypesenseIndex({ recreate: true }), opts);

  const totalElapsed = ((Date.now() - pipelineStart) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${totalElapsed} min\n`);
}

main().catch(err => {
  console.error('[Pipeline] Fatal:', err);
  process.exit(1);
});
