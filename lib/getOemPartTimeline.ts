// lib/getOemPartTimeline.ts
//
// Server-side only. Call from your PDP page (Server Component).
// Returns the full part-family timeline for a given product,
// bucketed into older / same_year / newer / current groups.
// Returns null when no timeline exists or the product is the
// only member of its family (no point rendering the widget).

import { getCatalogDb } from '@/lib/db/catalog';

export type TimelineBucket = 'older' | 'same_year' | 'newer' | 'current';

export interface TimelineEntry {
  bucket: TimelineBucket;
  computedYear: number;
  oemNumber: string;
  productId: number;
  slug: string;
  name: string;
  brand: string | null;
  packQty: number | null;
  msrp: number | null;
  imageUrl: string | null;
}

export interface OemPartTimeline {
  baseNumber: string;
  currentOemNumbers: string[];
  older: TimelineEntry[];
  sameYear: TimelineEntry[];
  newer: TimelineEntry[];
  current: TimelineEntry[];
}

export async function getOemPartTimeline(
  productId: number
): Promise<OemPartTimeline | null> {
  const db = getCatalogDb();

  const { rows } = await db.query<{
    bucket: TimelineBucket;
    computed_year: number;
    oem_number: string;
    base_number: string;
    product_id: number;
    slug: string;
    name: string;
    brand: string | null;
    pack_qty: number | null;
    msrp: string | null;
    image_url: string | null;
  }>(
    `
    WITH current_product AS (
      SELECT opt.oem_number, opt.base_number, opt.computed_year
      FROM oem_part_timeline_sellable opt
      WHERE opt.product_id = $1
    ),
    family_members AS (
      SELECT
        opt.base_number,
        opt.oem_number,
        opt.computed_year,
        opt.product_id,
        CASE
          WHEN opt.product_id = $1 THEN 'current'
          WHEN opt.computed_year < cp.computed_year THEN 'older'
          WHEN opt.computed_year > cp.computed_year THEN 'newer'
          ELSE 'same_year'
        END AS bucket
      FROM oem_part_timeline_sellable opt
      JOIN current_product cp ON cp.base_number = opt.base_number
    )
    SELECT
      fm.bucket,
      fm.computed_year,
      fm.oem_number,
      fm.base_number,
      fm.product_id,
      cu.slug,
      cu.name,
      cu.brand,
      cu.pack_qty,
      cu.msrp,
      cm.image_url
    FROM family_members fm
    JOIN catalog_unified cu ON cu.id = fm.product_id
    LEFT JOIN LATERAL (
      SELECT url AS image_url
      FROM catalog_media
      WHERE product_id = fm.product_id
        AND media_type = 'image'
      ORDER BY priority ASC
      LIMIT 1
    ) cm ON true
    ORDER BY fm.computed_year ASC, fm.oem_number ASC
    `,
    [productId]
  );

  if (rows.length === 0) return null;

  const hasFamily = rows.some((r) => r.bucket !== 'current');
  if (!hasFamily) return null;

  const baseNumber = rows[0].base_number;
  const currentOemNumbers = [
    ...new Set(
      rows.filter((r) => r.bucket === 'current').map((r) => r.oem_number)
    ),
  ];

  const toEntry = (r: (typeof rows)[0]): TimelineEntry => ({
    bucket: r.bucket,
    computedYear: r.computed_year,
    oemNumber: r.oem_number,
    productId: r.product_id,
    slug: r.slug,
    name: r.name,
    brand: r.brand,
    packQty: r.pack_qty,
    msrp: r.msrp ? parseFloat(r.msrp) : null,
    imageUrl: r.image_url,
  });

  return {
    baseNumber,
    currentOemNumbers,
    older: rows.filter((r) => r.bucket === 'older').map(toEntry),
    sameYear: rows.filter((r) => r.bucket === 'same_year').map(toEntry),
    newer: rows.filter((r) => r.bucket === 'newer').map(toEntry),
    current: rows.filter((r) => r.bucket === 'current').map(toEntry),
  };
}
