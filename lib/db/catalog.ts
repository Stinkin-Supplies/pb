import { Pool } from 'pg'

let pool: Pool | null = null

export function getCatalogDb(): Pool {
  if (!pool) {
    const connectionString = process.env.CATALOG_DATABASE_URL 
      || "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
    
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: false,
    })
    
    pool.on('error', (err) => {
      console.error('[CatalogDB] Unexpected pool error:', err.message)
    })
    
    pool.query('SELECT 1').catch(err => {
      console.error('[CatalogDB] Connection test failed:', err.message)
    })
  }
  return pool
}

export default getCatalogDb