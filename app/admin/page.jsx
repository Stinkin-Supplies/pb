import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import getCatalogDb from '@/lib/db/catalog';
import ProductManager from './products/ProductManager';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth?next=/admin/products');

  const db = getCatalogDb();

  // Initial data: brands, categories, counts per vendor
  const [brandsRes, catsRes, vendorRes] = await Promise.all([
    db.query(`SELECT DISTINCT brand FROM catalog_unified WHERE brand IS NOT NULL ORDER BY brand LIMIT 500`),
    db.query(`SELECT DISTINCT category FROM catalog_unified WHERE category IS NOT NULL ORDER BY category LIMIT 500`),
    db.query(`SELECT source_vendor, COUNT(*) as count FROM catalog_unified GROUP BY source_vendor ORDER BY source_vendor`),
  ]);

  const brands     = brandsRes.rows.map(r => r.brand);
  const categories = catsRes.rows.map(r => r.category);
  const vendorCounts = vendorRes.rows;

  // Harley families for fitment modal
  const familiesRes = await db.query(
    `SELECT id, name FROM harley_families ORDER BY name`
  );
  const families = familiesRes.rows;

  return (
    <ProductManager
      brands={brands}
      categories={categories}
      vendorCounts={vendorCounts}
      families={families}
    />
  );
}
