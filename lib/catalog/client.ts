// lib/catalog/client.ts
// Server-side client for querying the Hetzner catalog database
// Used in SSR pages (shop, PDP) to fetch product data

import { Pool } from 'pg';

// Singleton pool for Hetzner catalog DB
let pool: Pool | null = null;

function getCatalogPool() {
  if (!pool) {
    const connectionString = process.env.CATALOG_DATABASE_URL;
    if (!connectionString) {
      throw new Error('CATALOG_DATABASE_URL environment variable not set');
    }
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export interface CatalogProduct {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  computed_price: number | null;
  msrp: number | null;
  map_price: number | null;
  stock_quantity: number;
  weight: number | null;
  is_active: boolean;
  is_discontinued: boolean;
  is_new: boolean;
  catalog_media?: CatalogMedia[];
}

export interface CatalogMedia {
  url: string;
  media_type: string;
  is_primary: boolean;
  priority: number;
}

/**
 * Fetch a single product by slug from the catalog database
 * Used in: app/shop/[slug]/page.jsx
 */
export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const pool = getCatalogPool();
  
  const productQuery = `
    SELECT 
      id, sku, slug, name, brand, category, description,
      computed_price, msrp, map_price, stock_quantity, weight,
      is_active, is_discontinued, is_new
    FROM catalog_products
    WHERE slug = $1 AND is_active = true
    LIMIT 1
  `;
  
  const mediaQuery = `
    SELECT url, media_type, is_primary, priority
    FROM catalog_media
    WHERE product_id = $1 AND media_type = 'image'
    ORDER BY 
      CASE WHEN is_primary THEN 0 ELSE 1 END,
      priority ASC
  `;
  
  try {
    const productResult = await pool.query(productQuery, [slug]);
    
    if (productResult.rows.length === 0) {
      return null;
    }
    
    const product = productResult.rows[0];
    
    // Fetch associated media
    const mediaResult = await pool.query(mediaQuery, [product.id]);
    product.catalog_media = mediaResult.rows;
    
    return product;
  } catch (error) {
    console.error('[getProductBySlug] Database error:', error);
    throw error;
  }
}

/**
 * Fetch related products by category
 * Used in: app/shop/[slug]/page.jsx
 */
export async function getRelatedProducts(
  category: string, 
  excludeId: number, 
  limit: number = 6
): Promise<CatalogProduct[]> {
  const pool = getCatalogPool();
  
  const query = `
    SELECT 
      cp.id, cp.sku, cp.slug, cp.name, cp.brand, cp.category,
      cp.computed_price, cp.stock_quantity, cp.is_active,
      (
        SELECT json_agg(
          json_build_object(
            'url', cm.url,
            'media_type', cm.media_type,
            'is_primary', cm.is_primary
          )
        )
        FROM catalog_media cm
        WHERE cm.product_id = cp.id AND cm.media_type = 'image'
        ORDER BY 
          CASE WHEN cm.is_primary THEN 0 ELSE 1 END,
          cm.priority ASC
        LIMIT 1
      ) as catalog_media
    FROM catalog_products cp
    WHERE cp.category = $1 
      AND cp.id != $2 
      AND cp.is_active = true
      AND cp.computed_price IS NOT NULL
      AND cp.stock_quantity > 0
    ORDER BY RANDOM()
    LIMIT $3
  `;
  
  try {
    const result = await pool.query(query, [category, excludeId, limit]);
    return result.rows;
  } catch (error) {
    console.error('[getRelatedProducts] Database error:', error);
    return [];
  }
}

/**
 * Close the pool (for graceful shutdown)
 */
export async function closeCatalogPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
