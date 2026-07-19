-- Complete Database Structure Audit for Stinkin' Supplies
-- Run: psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" -f audit_database.sql

-- Row counts for each table
SELECT 
  'catalog_products' as table_name,
  COUNT(*)::text as row_count,
  pg_size_pretty(pg_total_relation_size('catalog_products')) as size
FROM catalog_products
UNION ALL
SELECT 'catalog_media', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_media'))
FROM catalog_media
UNION ALL
SELECT 'catalog_inventory', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_inventory'))
FROM catalog_inventory
UNION ALL
SELECT 'catalog_brands', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_brands'))
FROM catalog_brands
UNION ALL
SELECT 'catalog_attribute_keys', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_attribute_keys'))
FROM catalog_attribute_keys
UNION ALL
SELECT 'catalog_attribute_values', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_attribute_values'))
FROM catalog_attribute_values
UNION ALL
SELECT 'catalog_product_enrichment', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_product_enrichment'))
FROM catalog_product_enrichment
UNION ALL
SELECT 'catalog_pricing', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('catalog_pricing'))
FROM catalog_pricing
UNION ALL
SELECT 'raw_vendor_wps_products', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('raw_vendor_wps_products'))
FROM raw_vendor_wps_products
UNION ALL
SELECT 'raw_vendor_pu', COUNT(*)::text, pg_size_pretty(pg_total_relation_size('raw_vendor_pu'))
FROM raw_vendor_pu
ORDER BY table_name;

-- Data coverage statistics
SELECT 
  'Products Total' as metric,
  COUNT(*)::text as value
FROM catalog_products
UNION ALL
SELECT 'Products Active', COUNT(*)::text
FROM catalog_products WHERE is_active = true
UNION ALL
SELECT 'With Brands', COUNT(*)::text
FROM catalog_products WHERE brand IS NOT NULL
UNION ALL
SELECT 'With Images', COUNT(DISTINCT product_id)::text
FROM catalog_media
UNION ALL
SELECT 'With Inventory', COUNT(DISTINCT sku)::text
FROM catalog_inventory WHERE quantity > 0
UNION ALL
SELECT 'With Pricing', COUNT(DISTINCT sku)::text
FROM catalog_pricing
UNION ALL
SELECT 'With Enrichment', COUNT(*)::text
FROM catalog_product_enrichment
UNION ALL
SELECT 'Total Inventory Records', COUNT(*)::text
FROM catalog_inventory
UNION ALL
SELECT 'Total Brands', COUNT(*)::text
FROM catalog_brands
UNION ALL
SELECT 'Attribute Keys', COUNT(*)::text
FROM catalog_attribute_keys;

-- Source vendor breakdown
SELECT 
  source_vendor,
  COUNT(*) as product_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count
FROM catalog_products
WHERE source_vendor IS NOT NULL
GROUP BY source_vendor
ORDER BY product_count DESC;

-- Brand distribution (top 20)
SELECT 
  brand,
  COUNT(*) as product_count
FROM catalog_products
WHERE brand IS NOT NULL
GROUP BY brand
ORDER BY product_count DESC
LIMIT 20;
