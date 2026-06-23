import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCatalogDb } from '@/lib/db/catalog';
import { getChronologicalNeighbors } from '@/lib/db/browse';
import BrowseBackButton from '@/components/browse/BrowseBackButton';
import ProductImage from '@/components/browse/ProductImage';
import OemAlternativesPanel from '@/components/browse/OemAlternativesPanel';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getProduct(slug) {
  const db = getCatalogDb();
  const { rows } = await db.query(`
    SELECT
      cu.id, cu.sku, cu.internal_sku, cu.slug, cu.name, cu.brand,
      cu.computed_price AS price,
      COALESCE(cu.image_url, cm.url) AS image_url,
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
      SELECT url FROM catalog_media
      WHERE product_id = cu.id AND media_type = 'image'
      ORDER BY priority ASC
      LIMIT 1
    ) cm ON cu.image_url IS NULL OR cu.image_url = ''
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
    // Session 50: third arg adds display_subcategory tightening
    getChronologicalNeighbors(
      unifiedId,
      productRow.category ?? '',
      productRow.display_subcategory ?? null,
    ),
    getOemAlternatives(unifiedId),
  ]);

  const hasVariants = variants.length > 1;
  const hasFitment  = fitment.length > 0;
  const hasOem      = oemRows.length > 0;

  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', color: '#2a2010' }}>

      {/* ── Back nav ── */}
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
        padding: '24px 24px 0',
        maxWidth: 1100,
        margin: '0 auto',
      }}>

        {/* Image */}
        <div style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          background: '#ffffff',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #e6dcc0',
        }}>
          <ProductImage
            src={productRow.image_url}
            alt={productRow.name}
            padding={24}
            placeholderFontSize={13}
          />
        </div>

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
                  href={`/browse?category=${encodeURIComponent(productRow.display_category)}`}
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

          {/* Thick divider */}
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

          {/* Internal SKU */}
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 10,
            color: '#8a7040',
            letterSpacing: '0.07em',
            marginBottom: 12,
          }}>
            SKU: {productRow.internal_sku || productRow.sku}
          </div>

          {/* Primary OEM number — bold display, replaces source badge */}
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

          {/* Universal / fitment badges */}
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

      {/* ── Data tabs: Fitment / OEM ── */}
      <div style={{ maxWidth: 1100, margin: '32px auto 0', padding: '0 24px' }}>
        <DataTabs fitment={fitment} oemRows={oemRows} />
      </div>

      {/* ── Product details ── */}
      <ProductDetailsSection details={productRow.product_details} />

      {/* ── OEM alternatives ── */}
      <OemAlternativesPanel alternatives={oemAlternatives} oemRows={oemRows} />

      {/* ── Chronological timeline ── */}
      {timeline.length > 0 && (
        <section style={{ maxWidth: 1100, margin: '40px auto 0', padding: '0 24px' }}>
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
        <section style={{ maxWidth: 1100, margin: '40px auto 0', padding: '0 24px 48px' }}>
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
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DataTabs({ fitment, oemRows }) {
  // Server-rendered tabs (no JS state — use CSS :target or just show both)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Fitment */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        borderRadius: 10,
        padding: '16px 20px',
      }}>
        <div style={tabHeader}>Fitment</div>
        {fitment.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-stencil)', fontSize: 11, color: '#a89878' }}>
            No fitment data on file
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflowY: 'auto' }}>
            {fitment.map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '5px 0',
                borderBottom: '1px solid #f0e8d4',
              }}>
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 11, color: '#7a5810', minWidth: 55, letterSpacing: '0.04em',
                }}>
                  {row.model_code}
                </span>
                <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 11, color: '#8a7040' }}>
                  {row.year_from === row.year_to ? row.year_from : `${row.year_from}–${row.year_to}`}
                </span>
                <span style={{ marginLeft: 'auto', color: '#3a7a3a', fontSize: 12 }}>✓</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OEM cross-reference */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        borderRadius: 10,
        padding: '16px 20px',
      }}>
        <div style={tabHeader}>OEM Numbers</div>
        {oemRows.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-stencil)', fontSize: 11, color: '#a89878' }}>
            No OEM cross-reference data
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {oemRows.map((row, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 11,
                color: row.oem_format?.startsWith('hd_oem') ? '#7a5810' : '#8a7040',
                background: '#fdf6e3',
                border: '1px solid #e6dcc0',
                borderRadius: 4,
                padding: '3px 8px',
                letterSpacing: '0.04em',
              }}>
                {row.oem_number}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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

function ProductDetailsSection({ details }) {
  if (!details) return null;

  const { description, features, attributes, tech_note } = details;
  const hasContent = description || features?.length || attributes || tech_note;
  if (!hasContent) return null;

  return (
    <section style={{ maxWidth: 1100, margin: '32px auto 0', padding: '0 24px' }}>
      <div style={{
        fontFamily: 'var(--font-tanker)',
        fontSize: 22,
        letterSpacing: '0.04em',
        color: '#1a1208',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Product Details
      </div>

      <div style={{
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        borderRadius: 10,
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: attributes ? '1fr auto' : '1fr',
        gap: 24,
        alignItems: 'start',
      }}>

        {/* Left: description + features + tech_note */}
        <div>
          {description && (
            <p style={{
              fontFamily: 'var(--font-bespoke)',
              fontSize: 14,
              color: '#2a2010',
              lineHeight: 1.65,
              margin: '0 0 16px',
            }}>
              {description}
            </p>
          )}

          {features?.length > 0 && (
            <ul style={{
              margin: description ? '0' : '0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}>
              {features.map((f, i) => (
                <li key={i} style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <span style={{
                    color: '#c9a84c',
                    fontSize: 12,
                    lineHeight: '1.6',
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    ›
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 13,
                    color: '#3a2e1a',
                    lineHeight: 1.55,
                  }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tech_note && (
            <div style={{
              marginTop: (description || features?.length) ? 16 : 0,
              padding: '10px 14px',
              background: '#fdf6e3',
              border: '1px solid #e6dcc0',
              borderLeft: '3px solid #c9a84c',
              borderRadius: 6,
            }}>
              <div style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 9,
                color: '#8a7040',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 5,
              }}>
                Tech Note
              </div>
              <div style={{
                fontFamily: 'var(--font-bespoke)',
                fontSize: 13,
                color: '#2a2010',
                lineHeight: 1.55,
              }}>
                {tech_note}
              </div>
            </div>
          )}
        </div>

        {/* Right: attributes key-value grid */}
        {attributes && Object.keys(attributes).length > 0 && (
          <div style={{
            minWidth: 180,
            borderLeft: '1px solid #e6dcc0',
            paddingLeft: 24,
          }}>
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              color: '#8a7040',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Specifications
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(attributes).map(([key, val]) => (
                <div key={key}>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: '#a89878',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}>
                    {key}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 13,
                    color: '#2a2010',
                    fontWeight: 600,
                  }}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}



const tabHeader = {
  fontFamily: 'var(--font-stencil)',
  fontSize: 10,
  color: '#8a7040',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 12,
};

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
