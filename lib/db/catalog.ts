import { Pool } from 'pg'

let pool: Pool | null = null

export function getCatalogDb(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.CATALOG_DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: false,
    })
    pool.on('error', (err) => {
      console.error('[CatalogDB] Unexpected pool error:', err.message)
    })
  }
  return pool
}

export default getCatalogDb