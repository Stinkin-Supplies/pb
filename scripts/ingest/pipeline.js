/**
 * Master Pipeline: Run all 4 stages of catalog ingestion
 * Usage: node pipeline.js [--from N] [--stage N] [--dry]
 */

import { normalizePu } from './normalize_pu.js';
import { runComputedValues } from './computed_values.js';
import { buildTypesenseIndex } from './index_assembly.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const args = process.argv.slice(2);

const options = {
  fromStage: parseInt(args.find((_, i) => args[i - 1] === '--from') || '0'),
  onlyStage: parseInt(args.find((_, i) => args[i - 1] === '--stage') || '0'),
  dryRun: args.includes('--dry'),
  recreate: args.includes('--recreate')
};

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('❌ Missing CATALOG_DATABASE_URL. Check .env.local');
  process.exit(1);
}

async function runStage0() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STAGE 0: Raw Vendor Import');
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log('Stage 0 imports raw CSV data.');
  console.log('Run: npx dotenv -e .env.local -- node scripts/ingest/stage0-pu-dealerprice.cjs');
  console.log('\n✓ Stage 0 should be run separately before the pipeline.\n');
}

async function runStage1() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STAGE 1: Normalization');
  console.log('═══════════════════════════════════════════════════\n');
  
  await normalizePu();
}

async function runStage2() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STAGE 2: Computed Values');
  console.log('═══════════════════════════════════════════════════\n');
  
  await runComputedValues();
}

async function runStage3() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STAGE 3: Typesense Index Assembly');
  console.log('═══════════════════════════════════════════════════\n');
  
  await buildTypesenseIndex({ 
    recreate: options.recreate,
    resume: true 
  });
}

async function runPipeline() {
  console.log('🏍️  STINKIN\' SUPPLIES - Catalog Pipeline');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Options: from=${options.fromStage}, stage=${options.onlyStage}, dry=${options.dryRun}`);
  console.log('═══════════════════════════════════════════════════');

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  const startTime = Date.now();

  try {
    // Determine which stages to run
    const stages = [];
    
    if (options.onlyStage > 0) {
      stages.push(options.onlyStage);
    } else {
      for (let i = Math.max(0, options.fromStage); i <= 3; i++) {
        stages.push(i);
      }
    }

    console.log(`\nRunning stages: ${stages.join(', ')}\n`);

    for (const stage of stages) {
      switch (stage) {
        case 0:
          await runStage0();
          break;
        case 1:
          await runStage1();
          break;
        case 2:
          await runStage2();
          break;
        case 3:
          await runStage3();
          break;
        default:
          console.log(`Unknown stage: ${stage}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  ✅ PIPELINE COMPLETE!');
    console.log(`  Total time: ${duration}s`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runPipeline();
