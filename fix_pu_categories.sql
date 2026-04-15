-- Fix PU categories using part number prefix → catalog section mapping
-- Source: PU pricefile section numbering system (20260407pu-pricefile.csv)
-- Expected coverage: ~90% of null-category PU rows
-- Safe to re-run (WHERE guards against overwriting existing categories)

UPDATE catalog_unified
SET
  category   = CASE LEFT(sku, 2)
    WHEN '01' THEN 'Helmets'
    WHEN '02' THEN 'Wheels & Tires'
    WHEN '03' THEN 'Wheels & Tires'
    WHEN '04' THEN 'Suspension'
    WHEN '05' THEN 'Frame & Body'
    WHEN '06' THEN 'Controls & Handlebars'
    WHEN '07' THEN 'Fuel Systems'
    WHEN '08' THEN 'Seats'
    WHEN '09' THEN 'Engine'
    WHEN '10' THEN 'Engine'
    WHEN '11' THEN 'Drivetrain'
    WHEN '12' THEN 'Drivetrain'
    WHEN '13' THEN 'Drivetrain'
    WHEN '14' THEN 'Fenders & Body'
    WHEN '15' THEN 'Frame & Body'
    WHEN '16' THEN 'Engine'
    WHEN '17' THEN 'Brakes'
    WHEN '18' THEN 'Exhaust'
    WHEN '19' THEN 'Mirrors'
    WHEN '20' THEN 'Lighting'
    WHEN '21' THEN 'Electrical'
    WHEN '22' THEN 'Dash & Instrumentation'
    WHEN '23' THEN 'Windshields'
    WHEN '24' THEN 'Turn Signals'
    WHEN '25' THEN 'Helmets'
    WHEN '26' THEN 'Eyewear'
    WHEN '27' THEN 'Apparel'
    WHEN '28' THEN 'Apparel'
    WHEN '29' THEN 'Apparel'
    WHEN '30' THEN 'Apparel'
    WHEN '31' THEN 'Engine'
    WHEN '32' THEN 'Suspension'
    WHEN '33' THEN 'Gloves'
    WHEN '34' THEN 'Footwear'
    WHEN '35' THEN 'Luggage & Bags'
    WHEN '36' THEN 'Oils & Fluids'
    WHEN '37' THEN 'Chemicals'
    WHEN '38' THEN 'Tools'
    WHEN '39' THEN 'Luggage & Bags'
    WHEN '40' THEN 'Accessories'
    WHEN '41' THEN 'Tools'
    WHEN '43' THEN 'Accessories'
    WHEN '44' THEN 'Accessories'
    WHEN '45' THEN 'Electrical'
    WHEN '46' THEN 'Engine'
    WHEN '47' THEN 'Wheels & Tires'
    WHEN '48' THEN 'Wheels & Tires'
    WHEN '50' THEN 'Apparel'
    WHEN '51' THEN 'Chemicals'
    WHEN '53' THEN 'Tools'
    WHEN '55' THEN 'Electrical'
    WHEN '56' THEN 'Engine'
    WHEN '78' THEN 'Electrical'
    WHEN '79' THEN 'Electrical'
    WHEN '80' THEN 'Electrical'
    WHEN '81' THEN 'Seats'
    WHEN '82' THEN 'Seats'
    WHEN '83' THEN 'Seats'
    WHEN '85' THEN 'Seats'
    WHEN '87' THEN 'Seats'
    WHEN '88' THEN 'Seats'
    WHEN '89' THEN 'Seats'
    WHEN '90' THEN 'Engine'
    WHEN '92' THEN 'Accessories'
    WHEN '93' THEN 'Engine'
    WHEN '94' THEN 'Engine'
    WHEN 'A2' THEN 'Drivetrain'
    WHEN 'C7' THEN 'Engine'
    WHEN 'C8' THEN 'Engine'
    WHEN 'D8' THEN 'Seats'
    WHEN 'DP' THEN 'Brakes'
    WHEN 'DS' THEN 'Engine'
    WHEN 'F6' THEN 'Seats'
    WHEN 'FA' THEN 'Brakes'
    WHEN 'FM' THEN 'Suspension'
    WHEN 'FX' THEN 'Suspension'
    WHEN 'H3' THEN 'Seats'
    WHEN 'H4' THEN 'Seats'
    WHEN 'HP' THEN 'Drivetrain'
    WHEN 'JT' THEN 'Drivetrain'
    WHEN 'K2' THEN 'Drivetrain'
    WHEN 'K3' THEN 'Seats'
    WHEN 'KN' THEN 'Fuel Systems'
    WHEN 'M5' THEN 'Books & Media'
    WHEN 'M7' THEN 'Suspension'
    WHEN 'M8' THEN 'Frame & Body'
    WHEN 'MP' THEN 'Controls & Handlebars'
    WHEN 'MT' THEN 'Drivetrain'
    WHEN 'NU' THEN 'Filters'
    WHEN 'S3' THEN 'Seats'
    WHEN 'TR' THEN 'Seats'
    WHEN 'XH' THEN 'Seats'
    WHEN 'Y3' THEN 'Seats'
    WHEN 'YP' THEN 'Drivetrain'
    WHEN 'ZR' THEN 'Helmets'
    ELSE NULL
  END,
  updated_at = now()
WHERE source_vendor = 'PU'
  AND (category IS NULL OR category = '')
  AND CASE LEFT(sku, 2)
    WHEN '01' THEN true WHEN '02' THEN true WHEN '03' THEN true
    WHEN '04' THEN true WHEN '05' THEN true WHEN '06' THEN true
    WHEN '07' THEN true WHEN '08' THEN true WHEN '09' THEN true
    WHEN '10' THEN true WHEN '11' THEN true WHEN '12' THEN true
    WHEN '13' THEN true WHEN '14' THEN true WHEN '15' THEN true
    WHEN '16' THEN true WHEN '17' THEN true WHEN '18' THEN true
    WHEN '19' THEN true WHEN '20' THEN true WHEN '21' THEN true
    WHEN '22' THEN true WHEN '23' THEN true WHEN '24' THEN true
    WHEN '25' THEN true WHEN '26' THEN true WHEN '27' THEN true
    WHEN '28' THEN true WHEN '29' THEN true WHEN '30' THEN true
    WHEN '31' THEN true WHEN '32' THEN true WHEN '33' THEN true
    WHEN '34' THEN true WHEN '35' THEN true WHEN '36' THEN true
    WHEN '37' THEN true WHEN '38' THEN true WHEN '39' THEN true
    WHEN '40' THEN true WHEN '41' THEN true WHEN '43' THEN true
    WHEN '44' THEN true WHEN '45' THEN true WHEN '46' THEN true
    WHEN '47' THEN true WHEN '48' THEN true WHEN '50' THEN true
    WHEN '51' THEN true WHEN '53' THEN true WHEN '55' THEN true
    WHEN '56' THEN true WHEN '78' THEN true WHEN '79' THEN true
    WHEN '80' THEN true WHEN '81' THEN true WHEN '82' THEN true
    WHEN '83' THEN true WHEN '85' THEN true WHEN '87' THEN true
    WHEN '88' THEN true WHEN '89' THEN true WHEN '90' THEN true
    WHEN '92' THEN true WHEN '93' THEN true WHEN '94' THEN true
    WHEN 'A2' THEN true WHEN 'C7' THEN true WHEN 'C8' THEN true
    WHEN 'D8' THEN true WHEN 'DP' THEN true WHEN 'DS' THEN true
    WHEN 'F6' THEN true WHEN 'FA' THEN true WHEN 'FM' THEN true
    WHEN 'FX' THEN true WHEN 'H3' THEN true WHEN 'H4' THEN true
    WHEN 'HP' THEN true WHEN 'JT' THEN true WHEN 'K2' THEN true
    WHEN 'K3' THEN true WHEN 'KN' THEN true WHEN 'M5' THEN true
    WHEN 'M7' THEN true WHEN 'M8' THEN true WHEN 'MP' THEN true
    WHEN 'MT' THEN true WHEN 'NU' THEN true WHEN 'S3' THEN true
    WHEN 'TR' THEN true WHEN 'XH' THEN true WHEN 'Y3' THEN true
    WHEN 'YP' THEN true WHEN 'ZR' THEN true
    ELSE false
  END;

-- Verify
SELECT
  COUNT(*)                                                           AS total_pu,
  COUNT(*) FILTER (WHERE category IS NULL OR category = '')         AS still_null,
  COUNT(*) FILTER (WHERE category IS NOT NULL AND category != '')   AS filled,
  ROUND(100.0 * COUNT(*) FILTER (WHERE category IS NOT NULL AND category != '') / COUNT(*), 1) AS pct_filled
FROM catalog_unified
WHERE source_vendor = 'PU';
