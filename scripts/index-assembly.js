// scripts/index-assembly.js
// Convenience wrapper: `node scripts/index-assembly.js --recreate`
import { buildTypesenseIndex } from './ingest/index_assembly.js';

const args = process.argv.slice(2);
const recreate = args.includes('--no-recreate') ? false : true;

buildTypesenseIndex({ recreate }).catch((err) => {
  console.error('❌ Stage 3 failed:', err?.message ?? err);
  process.exit(1);
});
