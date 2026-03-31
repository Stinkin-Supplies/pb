// scripts/indexTypesense.ts
// ─────────────────────────────────────────────────────────────
// Full re-index of catalog_products → Typesense
// Run: npx ts-node -r tsconfig-paths/register scripts/indexTypesense.ts
// Or via Vercel cron — exports run() for programmatic use
// ─────────────────────────────────────────────────────────────

import 'dotenv/config'
import { Pool } from 'pg'
import { getAdminClient, COLLECTION, SCHEMA, ProductDocument } from '../lib/typesense/client.js'

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL })
const BATCH = 250

async function run() {
  const client = getAdminClient()
  const db     = await pool.connect()

  console.log('▶  Typesense full index\n')
  console.log(`   Collection: ${COLLECTION}`)
  console.log(`   Host:       ${process.env.TYPESENSE_HOST}\n`)

  // ── 1. Recreate collection ──────────────────────────────────
  try {
    await client.collections(COLLECTION).delete()
    console.log('   Dropped existing collection')
  } catch {
    console.log('   No existing collection — creating fresh')
  }

  await client.collections().create(SCHEMA)
  console.log('   Collection created ✓\n')

  // ── 2. Count active products ────────────────────────────────
  const { rows: [{ total }] } = await db.query(
    `SELECT COUNT(*) AS total FROM public.catalog_products WHERE is_active = true`
  )
  const totalNum = Number(total)
  console.log(`   Products to index: ${totalNum.toLocaleString()}\n`)

  // ── 3. Paginate + bulk import ───────────────────────────────
  let offset  = 0
  let indexed = 0
  let failed  = 0
  const startedAt = Date.now()

  while (true) {
    const { rows } = await db.query(`
      SELECT
        cp.id::text          AS id,
        cp.sku,
        cp.slug,
        cp.name,
        COALESCE(cp.brand, 'Unknown')      AS brand,
        COALESCE(cp.category, 'Other')     AS category,
        COALESCE(cp.price, 0)::float       AS price,
        cp.map_price::float                AS map_price,
        cp.msrp::float                     AS msrp,
        cp.is_active,
        cp.description,
        cp.weight::float                   AS weight,
        EXTRACT(EPOCH FROM cp.created_at)::bigint AS created_at,
        -- Primary image
        (SELECT ci.url FROM public.catalog_images ci
         WHERE ci.catalog_product_id = cp.id
           AND ci.is_primary = true
         LIMIT 1) AS image,
        -- Vendor codes
        ARRAY(SELECT vo.vendor_code FROM public.vendor_offers vo
              WHERE vo.catalog_product_id = cp.id
                AND vo.is_active = true) AS vendor_codes
      FROM public.catalog_products cp
      WHERE cp.is_active = true
      ORDER BY cp.id
      LIMIT $1 OFFSET $2
    `, [BATCH, offset])

    if (rows.length === 0) break

    // Map to Typesense document shape
    const docs: ProductDocument[] = rows.map(r => ({
      id:           r.id,
      sku:          r.sku          ?? '',
      slug:         r.slug         ?? '',
      name:         r.name         ?? '',
      brand:        r.brand,
      category:     r.category,
      price:        Number(r.price ?? 0),
      ...(r.map_price != null ? { map_price: Number(r.map_price) } : {}),
      ...(r.msrp      != null ? { msrp:      Number(r.msrp)      } : {}),
      is_active:    Boolean(r.is_active),
      ...(r.image       ? { image:       r.image       } : {}),
      ...(r.description ? { description: r.description } : {}),
      ...(r.weight != null ? { weight: Number(r.weight) } : {}),
      vendor_codes: r.vendor_codes ?? [],
      created_at:   Number(r.created_at ?? 0),
    }))

    try {
      const results = await client
        .collections(COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' })

      // Count successes/failures
      for (const result of results) {
        if (result.success) indexed++
        else {
          failed++
          if (failed <= 3) console.error('  ❌ ', (result as any).error, (result as any).document?.id)
        }
      }
    } catch (err: any) {
      console.error(`\n  ❌  Batch at offset ${offset} failed:`, err.message)
      failed += rows.length
    }

    offset += rows.length

    const pct     = Math.round((offset / totalNum) * 100)
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0)
    process.stdout.write(
      `\r  Progress: ${offset.toLocaleString()} / ${totalNum.toLocaleString()} (${pct}%) | indexed: ${indexed.toLocaleString()} | failed: ${failed} | ${elapsed}s`
    )
  }

  console.log(`\n\n✅  Index complete!`)
  console.log(`   Indexed: ${indexed.toLocaleString()}`)
  console.log(`   Failed:  ${failed}`)
  console.log(`   Time:    ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)

  // ── 4. Verify ───────────────────────────────────────────────
  const info = await client.collections(COLLECTION).retrieve()
  console.log(`\n   Collection doc count: ${(info as any).num_documents?.toLocaleString()}`)

  db.release()
  await pool.end()
}

run().catch(err => {
  console.error('❌  Fatal:', err.message)
  process.exit(1)
})
