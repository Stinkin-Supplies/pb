import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCatalogDb } from '@/lib/db/catalog';
import { getChronologicalNeighbors } from '@/lib/db/browse';
import BrowseBackButton from '@/components/browse/BrowseBackButton';
import ProductImage from '@/components/browse/ProductImage';
import ProductImageGallery from '@/components/browse/ProductImageGallery';
import PDPTabs from '@/components/browse/PDPTabs';
import VariantSelector from '@/components/browse/VariantSelector';
import AdminEditPanel from '@/components/admin/AdminEditPanel';
import { getOemPartTimeline } from '@/lib/getOemPartTimeline';
import OemPartTimeline from '@/components/pdp/OemPartTimeline';

// Routes LeMans/PU images through local proxy
function resolveImageSrc(url) {
  if (!url) return null;
  if (url.includes('asset.lemansnet.com') || url.includes('lemans')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getProduct(slug) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT
      cu.id, cu.sku, cu.internal_sku, cu.slug, cu.name, cu.brand,
      cu.computed_price AS price,
      COALESCE(cu.image_url, cm.primary_url) AS image_url,
      CASE
        WHEN array_length(cu.image_urls, 1) > 0 THEN cu.image_urls
        ELSE cm.all_urls
      END AS image_urls,
      cu.vendor_sku, cu.source_vendor,
      cu.display_category, cu.display_subcategory, cu.category,
      cu.is_universal, cu.fits_all_models, cu.is_kit, cu.pack_qty,
      cu.canonical_product_id, cu.brand_part_number,
      cu.variant_group_id, cu.oem_numbers,
      cp.canonical_sku,
      cu.product_details,
      COALESCE(vcnt.cnt, 0)::int AS variant_count
    FROM catalog_unified cu
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM catalog_variant_members
      WHERE group_id = cu.variant_group_id
    ) vcnt ON true
    LEFT JOIN LATERAL (
      SELECT urls[1] AS primary_url, urls AS all_urls
      FROM (
        SELECT array_agg(url ORDER BY priority ASC) AS urls
        FROM catalog_media
        WHERE product_id = cu.id AND media_type = 'image'
      ) _cm
    ) cm ON true
    LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id
    WHERE cu.slug = $1
      AND cu.is_active = true
    LIMIT 1
  `, [slug]);
  return rows[0] ?? null;
}

async function getFitmentRows(productId) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT
      hm.model_code,
      hm.name                   AS model_name,
      hf.name                   AS family_name,
      MIN(hmy.year)            AS year_from,
      MAX(hmy.year)            AS year_to,
      COUNT(DISTINCT hmy.year) AS year_count
    FROM catalog_fitment_v2 cf
    JOIN harley_model_years hmy ON hmy.id  = cf.model_year_id
    JOIN harley_models hm       ON hm.id   = hmy.model_id
    JOIN harley_families hf     ON hf.id   = hm.family_id
    WHERE cf.product_id = $1
    -- grouped by model_name too: some codes (e.g. FLHX) were reused for a
    -- different model name in an earlier era, and those eras should list
    -- separately rather than being merged under one name
    GROUP BY hm.model_code, hm.name, hf.name
    ORDER BY hf.name, hm.model_code, year_from
  `, [productId]);
  return rows;
}

async function getOemRows(productId) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT oem_number, oem_manufacturer, oem_format, expanded_from
    FROM catalog_oem_crossref
    WHERE product_id = $1
    ORDER BY oem_format, oem_number
  `, [productId]);
  return rows;
}

/** All other active products that share at least one HD OEM number with this product,
 *  plus one-hop supersession chain products. Excludes the current product. */
async function getOemAlternatives(productId) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    WITH my_oems AS (
      SELECT oem_number
      FROM catalog_oem_crossref
      WHERE product_id = $1
        AND oem_format IN ('hd_oem', 'hd_oem_nodash')
        AND expanded_from = FALSE
    ),
    direct AS (
      SELECT DISTINCT ON (cu.id)
        cu.id, cu.name, cu.slug, cu.brand,
        cu.computed_price::numeric AS price,
        cu.source_vendor, cu.is_kit,
        cu.image_url,
        cu.product_details,
        coc.oem_number,
        FALSE AS via_chain
      FROM my_oems mo
      JOIN catalog_oem_crossref coc
        ON coc.oem_number = mo.oem_number
        AND coc.oem_format IN ('hd_oem', 'hd_oem_nodash')
        AND coc.expanded_from = FALSE
      JOIN catalog_unified cu ON cu.id = coc.product_id
      WHERE coc.product_id <> $1 AND cu.is_active = true
      ORDER BY cu.id, cu.computed_price ASC
      LIMIT 16
    ),
    chain AS (
      SELECT DISTINCT ON (cu.id)
        cu.id, cu.name, cu.slug, cu.brand,
        cu.computed_price::numeric AS price,
        cu.source_vendor, cu.is_kit,
        cu.image_url,
        cu.product_details,
        coc.oem_number,
        TRUE AS via_chain
      FROM my_oems mo
      JOIN oem_supersession os
        ON os.from_oem_norm = normalize_oem(mo.oem_number)
        OR os.to_oem_norm   = normalize_oem(mo.oem_number)
      JOIN catalog_oem_crossref coc
        ON normalize_oem(coc.oem_number) IN (os.from_oem_norm, os.to_oem_norm)
        AND coc.oem_format IN ('hd_oem', 'hd_oem_nodash')
        AND coc.expanded_from = FALSE
      JOIN catalog_unified cu ON cu.id = coc.product_id
      WHERE cu.is_active = true
        AND coc.product_id <> $1
        AND cu.id NOT IN (SELECT id FROM direct)
      ORDER BY cu.id, cu.computed_price ASC
      LIMIT 8
    )
    SELECT id, name, slug, brand, price, source_vendor, is_kit,
           image_url, product_details, oem_number, via_chain
    FROM direct
    UNION ALL
    SELECT id, name, slug, brand, price, source_vendor, is_kit,
           image_url, product_details, oem_number, via_chain
    FROM chain
    ORDER BY via_chain, price ASC
  `, [productId]);
  return rows;
}

/** Related products — same display_subcategory, with category fallback (session 50).
 *  Params: [$1=category, $2=currentSlug, $3=displaySubcategory] */
async function getRelatedProducts(category, slug, displaySubcategory) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT DISTINCT ON (cp.slug)
      cp.id, cp.slug, cp.name, cp.brand, cp.computed_price AS price,
      COALESCE(cp.image_url, cm.url) AS image_url,
      cp.display_category, cp.display_subcategory
    FROM catalog_unified cp
    LEFT JOIN LATERAL (
      SELECT url FROM catalog_media
      WHERE product_id = cp.id AND media_type = 'image'
      ORDER BY priority ASC
      LIMIT 1
    ) cm ON cp.image_url IS NULL OR cp.image_url = ''
    WHERE (
      ($3::text IS NOT NULL AND cp.display_subcategory = $3)
      OR ($3::text IS NULL  AND cp.category = $1)
    )
      AND cp.slug <> $2
      AND cp.is_active = true
    ORDER BY cp.slug, cp.computed_price ASC
    LIMIT 8
  `, [category, slug, displaySubcategory ?? null]);
  return rows;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProductDetailPage({ params }) {
  // Next.js 15 — params is a Promise
  const { slug } = await params;

  const productRow = await getProduct(slug);
  if (!productRow) notFound();

  const unifiedId = productRow.id;

  // Parallel fetches
  const [fitment, oemRows, related, timeline, oemAlternatives, oemTimeline] = await Promise.all([
    getFitmentRows(unifiedId),
    getOemRows(unifiedId),
    getRelatedProducts(
      productRow.category,
      slug,
      productRow.display_subcategory ?? null,
    ),
    getChronologicalNeighbors(
      unifiedId,
      productRow.category ?? '',
      productRow.display_subcategory ?? null,
    ),
    getOemAlternatives(unifiedId),
    getOemPartTimeline(unifiedId).catch(() => null),
  ]);

  const hasSidebar = oemAlternatives.length > 0;
  const firstOem = oemRows.find(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from)?.oem_number ?? null;
  const primaryOems = oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from);

  return (
    <div style={{ background: 'var(--coal)', minHeight: '100vh', display: 'flex', color: '#f5f0e8' }}>

      {/* ── Left sidebar: OEM alternatives ── */}
      {hasSidebar && (
        <aside style={{
          width: 290,
          flexShrink: 0,
          display: 'flex',
          position: 'sticky',
          top: 0,
          height: '100vh',
          borderRight: '1px solid rgba(197,167,34,0.18)',
          background: '#080604',
        }}>

          {/* Gold accent strip */}
          <div style={{
            width: 28,
            background: '#c9a84c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontFamily: 'var(--font-tanker)',
              fontSize: 9,
              letterSpacing: '0.16em',
              color: '#1a1208',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}>
              OEM Alternatives
            </span>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{
              padding: '14px 14px 12px',
              borderBottom: '1px solid rgba(197,167,34,0.12)',
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: 'var(--font-tanker)',
                fontSize: 13,
                letterSpacing: '0.08em',
                color: '#f5f0e8',
                textTransform: 'uppercase',
                marginBottom: firstOem ? 8 : 0,
              }}>
                Same OEM Slot
              </div>
              {firstOem && (
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 9,
                  color: '#c9a84c',
                  background: 'rgba(201,168,76,0.08)',
                  border: '1px solid rgba(201,168,76,0.35)',
                  padding: '3px 8px',
                  letterSpacing: '0.08em',
                  display: 'inline-block',
                }}>
                  OEM {firstOem}
                </span>
              )}
            </div>

            {/* Scrollable rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Current product — highlighted at top */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderBottom: '1px solid rgba(197,167,34,0.10)',
                borderLeft: '3px solid #c9a84c',
                background: 'rgba(201,168,76,0.05)',
              }}>
                <div style={{
                  width: 48, height: 48, flexShrink: 0,
                  background: '#ffffff',
                  border: '1px solid rgba(197,167,34,0.20)',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <ProductImage
                    src={productRow.image_url}
                    alt={productRow.name}
                    padding={4}
                    placeholderFontSize={6}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 8,
                    color: '#c9a84c',
                    background: 'rgba(201,168,76,0.10)',
                    border: '1px solid rgba(201,168,76,0.30)',
                    padding: '1px 5px',
                    display: 'inline-block',
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}>
                    VIEWING
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 11,
                    color: '#f5f0e8',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {productRow.name}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-tanker)',
                  fontSize: 14,
                  color: '#c9a84c',
                  flexShrink: 0,
                  letterSpacing: '0.02em',
                }}>
                  ${Number(productRow.price ?? 0).toFixed(2)}
                </div>
              </div>

              {/* Alternatives */}
              {oemAlternatives.map((alt, i) => (
                <SidebarProductRow
                  key={alt.id}
                  product={alt}
                  isLast={i === oemAlternatives.length - 1}
                />
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>

        {/* ── Page ident header ── */}
        <div style={{
          padding: '18px 28px',
          borderBottom: '1px solid rgba(197,167,34,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Blueprint grid texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: [
              'linear-gradient(rgba(61,90,122,0.04) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(61,90,122,0.04) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '48px 48px',
          }} />

          <div className="pdp-back-wrap" style={{ position: 'relative', flexShrink: 0 }}>
            <BrowseBackButton />
          </div>

          <span style={{ flex: 1, height: 1, background: 'rgba(197,167,34,0.18)', position: 'relative' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <span style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'rgba(197,167,34,0.55)',
              textTransform: 'uppercase',
            }}>
              STINKIN&apos; SUPPLIES
            </span>
            <span style={{ width: 1, height: 10, background: 'rgba(197,167,34,0.20)' }} />
            <span style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              letterSpacing: '0.14em',
              color: 'rgba(197,167,34,0.35)',
              textTransform: 'uppercase',
            }}>
              PRODUCT SPECIFICATION
            </span>
          </div>
        </div>

        <style>{`
          .pdp-back-wrap a,
          .pdp-back-wrap button {
            color: #c9a84c !important;
            border: 1px solid rgba(201,168,76,0.35) !important;
            border-radius: 0 !important;
            padding: 6px 14px !important;
            font-family: var(--font-stencil) !important;
            font-size: 10px !important;
            letter-spacing: 0.10em !important;
            text-transform: uppercase !important;
            background: transparent !important;
            transition: background 0.15s, border-color 0.15s !important;
            cursor: pointer !important;
            text-decoration: none !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          .pdp-back-wrap a:hover,
          .pdp-back-wrap button:hover {
            background: rgba(201,168,76,0.08) !important;
            border-color: #c9a84c !important;
          }
          .pdp-sidebar-row { transition: background 0.12s; }
          .pdp-sidebar-row:hover { background: rgba(201,168,76,0.05); }
          .pdp-mini-card { transition: border-color 0.15s; }
          .pdp-mini-card:hover { border-color: rgba(201,168,76,0.45) !important; }
        `}</style>

        {/* ── Product hero ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          borderBottom: '1px solid rgba(197,167,34,0.12)',
        }}>

          {/* Left: Image gallery */}
          <div style={{
            padding: '36px 32px',
            borderRight: '1px solid rgba(197,167,34,0.12)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Blueprint grid */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: [
                'linear-gradient(rgba(61,90,122,0.04) 1px, transparent 1px)',
                'linear-gradient(90deg, rgba(61,90,122,0.04) 1px, transparent 1px)',
              ].join(', '),
              backgroundSize: '48px 48px',
            }} />
            <div style={{ position: 'relative' }}>
              <ProductImageGallery
                primaryUrl={productRow.image_url}
                imageUrls={productRow.image_urls}
                alt={productRow.name}
              />
            </div>
          </div>

          {/* Right: Info panel */}
          <div style={{ padding: '36px 36px 36px' }}>

            {/* Breadcrumb */}
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              color: 'rgba(197,167,34,0.45)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 18,
            }}>
              <Link href="/browse" style={{ color: 'inherit', textDecoration: 'none' }}>Browse</Link>
              {productRow.display_category && (
                <>
                  {' / '}
                  <Link
                    href={`/browse?display_category=${encodeURIComponent(productRow.display_category)}`}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {productRow.display_category}
                  </Link>
                </>
              )}
              {productRow.display_subcategory && (
                <>{' / '}{productRow.display_subcategory}</>
              )}
            </div>

            {/* Brand */}
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#8a7040',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              {productRow.brand}
            </div>

            {/* Product name */}
            <h1 style={{
              fontFamily: 'var(--font-tanker)',
              fontSize: 'clamp(28px, 3vw, 52px)',
              fontWeight: 400,
              color: '#f5f0e8',
              lineHeight: 0.92,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              margin: '0 0 18px',
            }}>
              {productRow.name}
            </h1>

            {/* Gold rule */}
            <div style={{
              height: 2,
              background: 'linear-gradient(90deg, #c9a84c 0%, rgba(201,168,76,0.10) 100%)',
              marginBottom: 22,
            }} />

            {/* OEM number — large Tanker display */}
            {primaryOems.slice(0, 1).map(oem => (
              <div key={oem.oem_number} style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 10,
                marginBottom: 18,
                padding: '8px 14px',
                border: '1px solid rgba(197,167,34,0.20)',
                background: 'rgba(197,167,34,0.04)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 8,
                  color: 'rgba(197,167,34,0.45)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}>
                  OEM#
                </span>
                <span style={{
                  fontFamily: 'var(--font-tanker)',
                  fontSize: 28,
                  color: '#c9a84c',
                  letterSpacing: '0.05em',
                  lineHeight: 1,
                }}>
                  {oem.oem_number}
                </span>
              </div>
            ))}
            {primaryOems.length === 0 && <div style={{ marginBottom: 18 }} />}

            {/* Price */}
            <div style={{
              fontFamily: 'var(--font-tanker)',
              fontSize: 'clamp(40px, 5vw, 64px)',
              fontWeight: 400,
              color: '#c9a84c',
              letterSpacing: '0.02em',
              lineHeight: 1,
              marginBottom: 22,
            }}>
              ${Number(productRow.price).toFixed(2)}
            </div>

            {/* SKU / Part# data row */}
            <div style={{
              display: 'flex',
              gap: 24,
              marginBottom: 20,
              flexWrap: 'wrap',
              paddingBottom: 20,
              borderBottom: '1px solid rgba(197,167,34,0.10)',
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 8,
                  color: 'rgba(197,167,34,0.35)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}>SKU</div>
                <div style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 11,
                  color: '#a09890',
                  letterSpacing: '0.06em',
                }}>
                  {productRow.internal_sku || productRow.sku}
                </div>
              </div>
              {productRow.brand_part_number && (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 8,
                    color: 'rgba(197,167,34,0.35)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    marginBottom: 3,
                  }}>PART#</div>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 11,
                    color: '#a09890',
                    letterSpacing: '0.06em',
                  }}>
                    {productRow.brand_part_number}
                  </div>
                </div>
              )}
              {productRow.pack_qty > 1 && (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 8,
                    color: 'rgba(197,167,34,0.35)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    marginBottom: 3,
                  }}>QTY</div>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 11,
                    color: '#a09890',
                    letterSpacing: '0.06em',
                  }}>
                    {productRow.pack_qty} pack
                  </div>
                </div>
              )}
            </div>

            {/* Variant selector */}
            <VariantSelector productId={unifiedId} />

            {/* Add to cart */}
            <button style={{
              width: '100%',
              padding: '16px 24px',
              background: '#c9a84c',
              border: '2px solid #b8963a',
              borderRadius: 0,
              fontFamily: 'var(--font-tanker)',
              fontSize: 20,
              letterSpacing: '0.10em',
              color: '#1a1208',
              cursor: 'pointer',
              marginBottom: 14,
              textTransform: 'uppercase',
              transition: 'background 0.15s',
            }}>
              ADD TO CART
            </button>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {productRow.is_universal && !fitment?.length && (
                <span style={badge('rgba(58,122,58,0.12)', '#5a9a5a')}>UNIVERSAL FIT</span>
              )}
              {productRow.is_kit && (
                <span style={badge('rgba(90,90,176,0.12)', '#8888cc')}>KIT</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs: Details / OEM / Fitment ── */}
        <PDPTabs
          fitment={fitment}
          oemRows={oemRows}
          details={productRow.product_details}
        />

        {oemTimeline && (
          <OemPartTimeline timeline={oemTimeline} currentProductId={unifiedId} />
        )}

        <AdminEditPanel
          product={{
            id: productRow.id,
            sku: productRow.sku,
            name: productRow.name,
            sourceVendor: productRow.source_vendor,
            displayCategory: productRow.display_category,
            displaySubcategory: productRow.display_subcategory,
            fitsAllModels: productRow.fits_all_models ?? productRow.is_universal ?? false,
            packQty: productRow.pack_qty,
            vendorSku: productRow.vendor_sku,
            brandPartNumber: productRow.brand_part_number,
            oemNumbers: productRow.oem_numbers ?? [],
            canonicalProductId: productRow.canonical_product_id,
            canonicalSku: productRow.canonical_sku,
            category: productRow.category,
            subcategory: productRow.display_subcategory,
            image_url: productRow.image_url,
            image_urls: productRow.image_urls ?? [],
          }}
        />

        {/* ── Chronological timeline ── */}
        {timeline.length > 0 && (
          <section style={{ margin: '48px 28px 0' }}>
            <DarkSectionHeader>Part Timeline</DarkSectionHeader>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 1,
              background: 'rgba(197,167,34,0.15)',
              outline: '1px solid rgba(197,167,34,0.15)',
            }}>
              {timeline.map(p => (
                <DarkMiniProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* ── Related products ── */}
        {related.length > 0 && (
          <section style={{ margin: '48px 28px 72px' }}>
            <DarkSectionHeader>
              {productRow.display_subcategory ?? productRow.display_category}
            </DarkSectionHeader>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 1,
              background: 'rgba(197,167,34,0.15)',
              outline: '1px solid rgba(197,167,34,0.15)',
            }}>
              {related.map(p => (
                <DarkMiniProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Sidebar row — links directly to the alternative product's PDP */
function SidebarProductRow({ product, isLast }) {
  const src = resolveImageSrc(product.image_url);

  return (
    <Link
      href={`/browse/${product.slug}`}
      className="pdp-sidebar-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid rgba(197,167,34,0.08)',
        textDecoration: 'none',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        position: 'relative',
        background: '#ffffff',
        border: '1px solid rgba(197,167,34,0.18)',
        overflow: 'hidden',
      }}>
        <ProductImage
          src={src}
          alt={product.name}
          padding={4}
          placeholderFontSize={6}
        />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 8,
          color: '#7a6840',
          letterSpacing: '0.06em',
          marginBottom: 2,
        }}>
          {product.brand ?? ''}
          {product.via_chain && (
            <span style={{ marginLeft: 4, color: 'rgba(197,167,34,0.40)' }}>· SUPERSESSION</span>
          )}
        </div>
        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 11,
          color: '#d8d0c0',
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {product.name}
        </div>
      </div>

      {/* Price */}
      <div style={{
        fontFamily: 'var(--font-tanker)',
        fontSize: 14,
        color: '#c9a84c',
        flexShrink: 0,
        letterSpacing: '0.02em',
      }}>
        ${Number(product.price ?? 0).toFixed(2)}
      </div>
    </Link>
  );
}

function DarkMiniProductCard({ product }) {
  return (
    <Link
      href={`/browse/${product.slug}`}
      className="pdp-mini-card"
      style={{
        display: 'block',
        background: '#0e0b06',
        border: '1px solid transparent',
        overflow: 'hidden',
        textDecoration: 'none',
      }}
    >
      <div style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: '#ffffff',
        overflow: 'hidden',
      }}>
        <ProductImage
          src={product.image_url}
          alt={product.name}
          padding={8}
          placeholderFontSize={9}
        />
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 11,
          color: '#c8c0b0',
          lineHeight: 1.3,
          marginBottom: 6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {product.name}
        </div>
        <div style={{
          fontFamily: 'var(--font-tanker)',
          fontSize: 13,
          color: '#c9a84c',
          letterSpacing: '0.02em',
        }}>
          ${Number(product.price ?? 0).toFixed(2)}
        </div>
      </div>
    </Link>
  );
}

function DarkSectionHeader({ children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--font-tanker)',
        fontSize: 'clamp(20px, 2.5vw, 32px)',
        letterSpacing: '0.03em',
        color: '#f5f0e8',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {children}
      </div>
      <div style={{ flex: 1, height: 1, background: 'rgba(197,167,34,0.18)' }} />
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const badge = (bg, color) => ({
  fontFamily: 'var(--font-stencil)',
  fontSize: 9,
  color,
  background: bg,
  border: `1px solid ${color}`,
  borderRadius: 0,
  padding: '3px 8px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});
