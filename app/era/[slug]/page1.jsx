import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCatalogDb } from '@/lib/db/catalog';
import { getChronologicalNeighbors } from '@/lib/db/browse';
import BrowseBackButton from '@/components/browse/BrowseBackButton';
import ProductImage from '@/components/browse/ProductImage';
import ProductImageGallery from '@/components/browse/ProductImageGallery';
import PDPTabs from '@/components/browse/PDPTabs';

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
      cu.is_universal, cu.is_kit, cu.pack_qty,
      cu.variant_group_id, cu.oem_numbers,
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
      hf.name                  AS family_name,
      MIN(hmy.year)            AS year_from,
      MAX(hmy.year)            AS year_to,
      COUNT(DISTINCT hmy.year) AS year_count
    FROM catalog_fitment_v2 cf
    JOIN harley_model_years hmy ON hmy.id  = cf.model_year_id
    JOIN harley_models hm       ON hm.id   = hmy.model_id
    JOIN harley_families hf     ON hf.id   = hm.family_id
    WHERE cf.product_id = $1
    GROUP BY hm.model_code, hf.name
    ORDER BY hf.name, hm.model_code
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

async function getVariantMembers(variantGroupId, currentProductId) {
  if (!variantGroupId) return [];
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT
      cvm.product_id,
      cvm.option_1_name,
      cvm.option_1_value,
      cvm.sort_order,
      cu.name, cu.slug, cu.computed_price AS price, cu.is_active
    FROM catalog_variant_members cvm
    JOIN catalog_unified cu ON cu.id = cvm.product_id
    WHERE cvm.group_id = $1
      AND cu.is_active = true
    ORDER BY cvm.sort_order, cvm.option_1_value
  `, [variantGroupId]);
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
  const [fitment, oemRows, variants, related, timeline, oemAlternatives] = await Promise.all([
    getFitmentRows(unifiedId),
    getOemRows(unifiedId),
    getVariantMembers(productRow.variant_group_id, unifiedId),
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
  ]);

  const hasSidebar = oemAlternatives.length > 0;
  const hasVariants = variants.length > 1;
  const firstOem = oemRows.find(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from)?.oem_number ?? null;

  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', display: 'flex' }}>

      {/* ── Left sidebar: OEM alternatives ── */}
      {hasSidebar && (
        <aside style={{
          width: 320,
          flexShrink: 0,
          display: 'flex',
          position: 'sticky',
          top: 0,
          height: '100vh',
          borderRight: '1px solid #e6dcc0',
          zIndex: 10,
          background: '#faf6ee',
        }}>

          {/* Gold accent strip */}
          <div style={{
            width: 30,
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
              fontSize: 10,
              letterSpacing: '0.14em',
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

            {/* Sticky header */}
            <div style={{
              padding: '14px 14px 12px',
              borderBottom: '1px solid #e6dcc0',
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: 'var(--font-tanker)',
                fontSize: 14,
                letterSpacing: '0.06em',
                color: '#1a1208',
                textTransform: 'uppercase',
                marginBottom: firstOem ? 8 : 0,
              }}>
                Same OEM Slot
              </div>
              {firstOem && (
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 9,
                  color: '#7a5810',
                  background: '#fdf6e3',
                  border: '1px solid #c9a84c',
                  borderRadius: 4,
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
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', color: '#2a2010' }}>

        {/* Back nav */}
        <div style={{ padding: '16px 24px 0' }}>
          <div className="pdp-back-wrap">
            <BrowseBackButton />
          </div>
        </div>
        <style>{`
          .pdp-back-wrap a,
          .pdp-back-wrap button {
            color: #c9a84c !important;
            border: 1px solid #c9a84c !important;
            border-radius: 6px !important;
            padding: 6px 14px !important;
            font-family: var(--font-stencil) !important;
            font-size: 11px !important;
            letter-spacing: 0.08em !important;
            text-transform: uppercase !important;
            background: transparent !important;
            box-shadow: 0 0 10px rgba(201,168,76,0.25), inset 0 0 0 0 rgba(201,168,76,0) !important;
            transition: background 0.18s, box-shadow 0.18s, transform 0.12s !important;
            cursor: pointer !important;
            text-decoration: none !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          .pdp-back-wrap a:hover,
          .pdp-back-wrap button:hover {
            background: rgba(201,168,76,0.12) !important;
            box-shadow: 0 0 18px rgba(201,168,76,0.45) !important;
            transform: translateX(-2px) !important;
          }
          .pdp-back-wrap a:active,
          .pdp-back-wrap button:active {
            transform: translateX(-5px) scale(0.96) !important;
            box-shadow: 0 0 8px rgba(201,168,76,0.2) !important;
          }
        `}</style>

        {/* ── Product hero ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          padding: '20px 28px 0',
        }}>
          {/* Image gallery */}
          <ProductImageGallery
            primaryUrl={productRow.image_url}
            imageUrls={productRow.image_urls}
            alt={productRow.name}
          />

          {/* Info panel */}
          <div>
            {/* Breadcrumb */}
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#8a7040',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              marginBottom: 12,
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
              fontSize: 11,
              color: '#8a7040',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              {productRow.brand}
            </div>

            {/* Name */}
            <h1 style={{
              fontFamily: 'var(--font-bespoke)',
              fontSize: 26,
              fontWeight: 600,
              color: '#1a1208',
              lineHeight: 1.25,
              margin: '0 0 10px',
            }}>
              {productRow.name}
            </h1>

            {/* Divider */}
            <div style={{
              height: 3,
              background: 'linear-gradient(90deg, #c9a84c 0%, rgba(201,168,76,0.15) 100%)',
              borderRadius: 2,
              marginBottom: 18,
            }} />

            {/* Price */}
            <div style={{
              fontFamily: 'var(--font-bespoke)',
              fontSize: 30,
              fontWeight: 700,
              color: '#c9a84c',
              marginBottom: 20,
            }}>
              ${Number(productRow.price).toFixed(2)}
            </div>

            {/* SKU */}
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#8a7040',
              letterSpacing: '0.07em',
              marginBottom: 12,
            }}>
              SKU: {productRow.internal_sku || productRow.sku}
            </div>

            {/* Primary OEM number */}
            {oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from).slice(0, 1).map(oem => (
              <div key={oem.oem_number} style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 20,
              }}>
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 9,
                  color: '#8a7040',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  OEM#
                </span>
                <span style={{
                  fontFamily: 'var(--font-tanker)',
                  fontSize: 28,
                  color: '#1a1208',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}>
                  {oem.oem_number}
                </span>
              </div>
            ))}
            {oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from).length === 0 && (
              <div style={{ marginBottom: 20 }} />
            )}

            {/* Variant selector */}
            {hasVariants && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 10,
                  color: '#8a7040',
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  {variants[0]?.option_1_name ?? 'Options'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {variants.map(v => {
                    const isCurrent = v.product_id === unifiedId;
                    return (
                      <Link
                        key={v.product_id}
                        href={`/browse/${v.slug}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          background: isCurrent ? '#fdf6e3' : '#ffffff',
                          border: `1px solid ${isCurrent ? '#c9a84c' : '#e6dcc0'}`,
                          borderRadius: 6,
                          fontFamily: 'var(--font-stencil)',
                          fontSize: 11,
                          color: isCurrent ? '#7a5810' : '#5a4a2a',
                          textDecoration: 'none',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {isCurrent && (
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#c9a84c' }} />
                        )}
                        {v.option_1_value ?? v.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add to cart */}
            <button style={{
              width: '100%',
              padding: '14px 24px',
              background: '#c9a84c',
              border: 'none',
              borderRadius: 8,
              fontFamily: 'var(--font-tanker)',
              fontSize: 18,
              letterSpacing: '0.06em',
              color: '#1a1208',
              cursor: 'pointer',
              marginBottom: 12,
            }}>
              ADD TO CART
            </button>

            {/* Fitment / kit badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {productRow.is_universal && (
                <span style={badge('#eaf3ea', '#3a7a3a')}>UNIVERSAL FIT</span>
              )}
              {productRow.is_kit && (
                <span style={badge('#eaeaf5', '#5a5ab0')}>KIT</span>
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

        {/* ── Chronological timeline ── */}
        {timeline.length > 0 && (
          <section style={{ margin: '40px 28px 0' }}>
            <SectionHeader>Part Timeline</SectionHeader>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {timeline.map(p => (
                <MiniProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* ── Related products ── */}
        {related.length > 0 && (
          <section style={{ margin: '40px 28px 48px' }}>
            <SectionHeader>
              {productRow.display_subcategory ?? productRow.display_category}
            </SectionHeader>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {related.map(p => (
                <MiniProductCard key={p.id} product={p} />
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
  const vendorColor = { PU: '#2a4a7a', WPS: '#7a3810', VTWIN: '#2a5a2a' }[product.source_vendor] ?? '#5a4a2a';
  const vendorLabel = { PU: 'PU', WPS: 'WPS', VTWIN: 'VTwin' }[product.source_vendor] ?? product.source_vendor;

  return (
    <Link
      href={`/browse/${product.slug}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid #ede5d0',
        textDecoration: 'none',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#ede8df'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        borderRadius: 6,
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {src ? (
          <img
            src={src}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
          />
        ) : (
          <div style={{ fontFamily: 'var(--font-stencil)', fontSize: 6, color: '#c9a84c', letterSpacing: '0.06em' }}>
            NO IMG
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 8,
          color: vendorColor,
          letterSpacing: '0.06em',
          marginBottom: 2,
        }}>
          {vendorLabel}{product.brand ? ` · ${product.brand}` : ''}
          {product.via_chain && (
            <span style={{ marginLeft: 4, color: '#8a7040' }}>· SUPERSESSION</span>
          )}
        </div>
        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 12,
          color: '#1a1208',
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
        fontSize: 15,
        color: '#c9a84c',
        flexShrink: 0,
        letterSpacing: '0.03em',
      }}>
        ${Number(product.price ?? 0).toFixed(2)}
      </div>
    </Link>
  );
}

function MiniProductCard({ product }) {
  return (
    <Link
      href={`/browse/${product.slug}`}
      style={{
        display: 'block',
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        borderRadius: 8,
        overflow: 'hidden',
        textDecoration: 'none',
        transition: 'border-color 0.15s',
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
          fontSize: 12,
          color: '#2a2010',
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
          fontFamily: 'var(--font-bespoke)',
          fontSize: 13,
          fontWeight: 600,
          color: '#c9a84c',
        }}>
          ${Number(product.price ?? 0).toFixed(2)}
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-tanker)',
      fontSize: 22,
      letterSpacing: '0.04em',
      color: '#1a1208',
      marginBottom: 14,
      textTransform: 'uppercase',
    }}>
      {children}
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
  borderRadius: 4,
  padding: '3px 8px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});
