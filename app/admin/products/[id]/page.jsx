// ============================================================
// app/admin/products/[id]/page.jsx  —  SERVER COMPONENT
// Full product detail view + inline edit form
// ============================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogDb } from "@/lib/db/catalog";
import { updateProduct } from "./actions";

const css = `
  .pd-body {
    padding: 28px 32px;
    background: #f5f0e8;
    min-height: calc(100vh - 46px);
    color: #170f04;
  }

  /* ── breadcrumb / head ── */
  .pd-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9c8a6a;
  }
  .pd-nav a { color: #7a6a4f; text-decoration: none; }
  .pd-nav a:hover { color: #c9a84c; }
  .pd-nav-sep { color: #d8cab0; }

  .pd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }
  .pd-title {
    font-family: var(--font-caesar), sans-serif;
    letter-spacing: 0.04em;
    font-size: 30px;
    color: #170f04;
    line-height: 1.25;
  }
  .pd-sku-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .pd-prefix {
    background: rgba(201,168,76,0.14);
    border: 1px solid rgba(201,168,76,0.4);
    border-radius: 3px;
    padding: 3px 9px;
    font-family: var(--font-stencil), monospace;
    font-size: 12px;
    letter-spacing: 0.1em;
    color: #a3822c;
    font-weight: 600;
  }
  .pd-sku-num {
    font-family: var(--font-stencil), monospace;
    font-size: 14px;
    letter-spacing: 0.08em;
    color: #8a7a60;
  }

  /* ── layout ── */
  .pd-grid {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 18px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .pd-grid { grid-template-columns: 1fr; }
  }

  /* ── card ── */
  .pd-card {
    border: 1px solid #e3d6bd;
    background: #fffdf8;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(23,15,4,0.04);
  }
  .pd-card-head {
    padding: 13px 16px;
    border-bottom: 1px solid #e3d6bd;
    background: #f0e6d2;
    font-family: var(--font-stencil), monospace;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8a7540;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pd-card-body { padding: 18px; }

  /* ── form fields ── */
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }
  .field-row.full { grid-template-columns: 1fr; }
  .field-row.thirds { grid-template-columns: 1fr 1fr 1fr; }
  .field-row.fourths { grid-template-columns: 1fr 1fr 1fr 1fr; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field label {
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9c8a6a;
    font-weight: 600;
  }
  .field input[type=text],
  .field input[type=number],
  .field textarea,
  .field select {
    background: #ffffff;
    border: 1px solid #ddd0b8;
    color: #170f04;
    padding: 10px 12px;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
  }
  .field input:focus,
  .field textarea:focus,
  .field select:focus { border-color: #c9a84c; box-shadow: 0 0 0 2px rgba(201,168,76,0.18); }
  .field textarea { resize: vertical; min-height: 90px; line-height: 1.6; }
  .field input[readonly] { color: #a3987f; background: #f7f1e6; cursor: not-allowed; }

  /* ── toggle ── */
  .toggle-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 13px;
    border: 1px solid #e3d6bd;
    border-radius: 4px;
    background: #fbf6ec;
  }
  .toggle-label {
    font-family: var(--font-stencil), monospace;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #5a4f3a;
    font-weight: 600;
  }
  .toggle-item input[type=checkbox] {
    width: 18px;
    height: 18px;
    accent-color: #c9a84c;
    cursor: pointer;
  }

  /* ── image preview ── */
  .pd-img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    background: #ffffff;
    border: 1px solid #e3d6bd;
    border-radius: 4px;
    margin-bottom: 12px;
    padding: 14px;
    box-sizing: border-box;
  }
  .pd-img-placeholder {
    width: 100%;
    aspect-ratio: 1;
    background: #fbf6ec;
    border: 1px solid #e3d6bd;
    border-radius: 4px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c4b896;
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── read-only info ── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: #fbf6ec;
    border: 1px solid #ece1cc;
    border-radius: 4px;
  }
  .info-item-label {
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ad9c7c;
    font-weight: 600;
  }
  .info-item-val {
    font-size: 14px;
    color: #170f04;
  }
  .info-item-val.muted { color: #b3a890; }

  /* ── pills ── */
  .pill {
    display: inline-flex;
    align-items: center;
    border: 1px solid #ddd0b8;
    border-radius: 3px;
    padding: 2px 8px;
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a7a60;
    font-weight: 600;
  }
  .pill-on  { border-color: rgba(60,150,90,0.4);   background: rgba(60,150,90,0.08);  color: #2f8552; }
  .pill-off { border-color: rgba(200,70,70,0.35);  background: rgba(200,70,70,0.06);  color: #c0453f; }
  .pill-pu    { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.07); color: #7c5fd6; }
  .pill-wps   { border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.07); color: #3b78d8; }
  .pill-vtwin { border-color: rgba(201,168,76,0.5); background: rgba(201,168,76,0.12); color: #a3822c; }

  /* ── fitment tags ── */
  .fitment-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .fitment-tag {
    background: rgba(201,168,76,0.10);
    border: 1px solid rgba(201,168,76,0.3);
    border-radius: 3px;
    padding: 3px 8px;
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: #8a7540;
    font-weight: 600;
  }

  /* ── action bar ── */
  .pd-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 18px;
    border-top: 1px solid #e3d6bd;
    background: #f0e6d2;
  }
  .btn {
    border: 1px solid #c9a84c;
    background: transparent;
    color: #170f04;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    white-space: nowrap;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .btn:hover { background: rgba(201,168,76,0.12); }
  .btn-primary {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #1a1306;
  }
  .btn-primary:hover { background: #d9bc66; }
  .btn-ghost { border-color: #ddd0b8; color: #8a7a60; }
  .btn-ghost:hover { border-color: #c9a84c; color: #8a7540; background: rgba(201,168,76,0.08); }

  /* ── warehouse grid ── */
  .wh-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-top: 10px;
  }
  .wh-item {
    background: #fbf6ec;
    border: 1px solid #ece1cc;
    border-radius: 4px;
    padding: 9px 10px;
    text-align: center;
  }
  .wh-label {
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ad9c7c;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .wh-val {
    font-family: var(--font-stencil), monospace;
    font-size: 16px;
    letter-spacing: 0.04em;
    color: #170f04;
    font-weight: 600;
  }
  .wh-val.zero { color: #c4b896; }

  .divider {
    border: none;
    border-top: 1px solid #ece1cc;
    margin: 14px 0;
  }
`;

function usd(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

function vendorPillClass(v) {
  if (v === "PU") return "pill-pu";
  if (v === "WPS") return "pill-wps";
  if (v === "VTWIN") return "pill-vtwin";
  return "";
}

export default async function ProductDetailPage({ params }) {
  const { id: rawId } = await params;
  const id = toInt(rawId, null);

  const db = getCatalogDb();
  const res = await db.query(
    `SELECT * FROM public.catalog_unified WHERE id = $1`,
    [id]
  );
  const p = res.rows[0];
  if (!p) notFound();

  const pfx = p.internal_sku?.substring(0, 3) ?? "";
  const skuNum = p.internal_sku?.substring(4) ?? "";

  async function handleUpdate(formData) {
    "use server";
    await updateProduct(id, formData);
  }

  return (
    <div className="pd-body">
      <style>{css}</style>

      {/* Breadcrumb */}
      <div className="pd-nav">
        <Link href="/admin/products">Products</Link>
        <span className="pd-nav-sep">›</span>
        <span>{p.internal_sku}</span>
      </div>

      {/* Header */}
      <div className="pd-head">
        <div>
          <div className="pd-title">{p.name}</div>
          <div className="pd-sku-badge">
            <span className="pd-prefix">{pfx}</span>
            <span className="pd-sku-num">{skuNum}</span>
            <span className={`pill ${vendorPillClass(p.source_vendor)}`} style={{marginLeft:6}}>
              {p.source_vendor}
            </span>
            <span className={`pill ${p.is_active ? "pill-on" : "pill-off"}`} style={{marginLeft:4}}>
              {p.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <Link className="btn btn-ghost" href={`/browse/${p.slug}`} target="_blank">
          View on Store ↗
        </Link>
      </div>

      <form action={handleUpdate}>
        <div className="pd-grid">

          {/* ── LEFT COLUMN ── */}
          <div style={{display:"flex", flexDirection:"column", gap:16}}>

            {/* Identity */}
            <div className="pd-card">
              <div className="pd-card-head">Identity</div>
              <div className="pd-card-body">
                <div className="field-row">
                  <div className="field">
                    <label>Internal SKU</label>
                    <input type="text" name="internal_sku" defaultValue={p.internal_sku ?? ""} />
                  </div>
                  <div className="field">
                    <label>Vendor SKU (read-only)</label>
                    <input type="text" value={p.sku ?? ""} readOnly />
                  </div>
                </div>
                <div className="field-row full">
                  <div className="field">
                    <label>Product Name</label>
                    <input type="text" name="name" defaultValue={p.name ?? ""} />
                  </div>
                </div>
                <div className="field-row full">
                  <div className="field">
                    <label>Brand</label>
                    <input type="text" name="brand" defaultValue={p.brand ?? ""} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Category</label>
                    <input type="text" name="category" defaultValue={p.category ?? ""} />
                  </div>
                  <div className="field">
                    <label>Subcategory</label>
                    <input type="text" name="subcategory" defaultValue={p.subcategory ?? ""} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Slug</label>
                    <input type="text" name="slug" defaultValue={p.slug ?? ""} />
                  </div>
                  <div className="field">
                    <label>UPC</label>
                    <input type="text" name="upc" defaultValue={p.upc ?? ""} />
                  </div>
                </div>
                <div className="field-row full">
                  <div className="field">
                    <label>Description</label>
                    <textarea name="description" defaultValue={p.description ?? ""} rows={4} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="pd-card">
              <div className="pd-card-head">Pricing</div>
              <div className="pd-card-body">
                <div className="field-row fourths">
                  <div className="field">
                    <label>MSRP</label>
                    <input type="number" step="0.01" name="msrp" defaultValue={p.msrp ?? ""} />
                  </div>
                  <div className="field">
                    <label>Cost</label>
                    <input type="number" step="0.01" name="cost" defaultValue={p.cost ?? ""} />
                  </div>
                  <div className="field">
                    <label>MAP Price</label>
                    <input type="number" step="0.01" name="map_price" defaultValue={p.map_price ?? ""} />
                  </div>
                  <div className="field">
                    <label>Computed Price</label>
                    <input type="number" step="0.01" name="computed_price" defaultValue={p.computed_price ?? ""} />
                  </div>
                </div>
              </div>
            </div>

            {/* Inventory */}
            <div className="pd-card">
              <div className="pd-card-head">Inventory</div>
              <div className="pd-card-body">
                <div className="info-grid" style={{marginBottom:12}}>
                  <div className="info-item">
                    <div className="info-item-label">Total Stock</div>
                    <div className="info-item-val">{p.stock_quantity ?? 0}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">In Stock</div>
                    <div className="info-item-val">
                      <span className={`pill ${p.in_stock ? "pill-on" : "pill-off"}`}>
                        {p.in_stock ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="wh-label">Warehouse Breakdown</div>
                <div className="wh-grid">
                  {[
                    ["WI", p.warehouse_wi],
                    ["NY", p.warehouse_ny],
                    ["TX", p.warehouse_tx],
                    ["NV", p.warehouse_nv],
                    ["NC", p.warehouse_nc],
                  ].map(([label, qty]) => (
                    <div className="wh-item" key={label}>
                      <div className="wh-label">{label}</div>
                      <div className={`wh-val ${!qty ? "zero" : ""}`}>{qty ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Fitment */}
            <div className="pd-card">
              <div className="pd-card-head">Fitment</div>
              <div className="pd-card-body">
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-item-label">Year Range</div>
                    <div className="info-item-val">
                      {p.fitment_year_start && p.fitment_year_end
                        ? `${p.fitment_year_start} – ${p.fitment_year_end}`
                        : <span className="muted">—</span>}
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Harley Fitment</div>
                    <div className="info-item-val">
                      <span className={`pill ${p.is_harley_fitment ? "pill-on" : "pill-off"}`}>
                        {p.is_harley_fitment ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Universal</div>
                    <div className="info-item-val">
                      <span className={`pill ${p.is_universal ? "pill-on" : "pill-off"}`}>
                        {p.is_universal ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Other Makes</div>
                    <div className="info-item-val">
                      {p.fitment_other_makes?.length
                        ? p.fitment_other_makes.join(", ")
                        : <span className="muted">—</span>}
                    </div>
                  </div>
                </div>
                {p.fitment_hd_families?.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div className="info-item-label" style={{marginBottom:4}}>HD Families</div>
                    <div className="fitment-tags">
                      {p.fitment_hd_families.map(f => (
                        <span key={f} className="fitment-tag">{f}</span>
                      ))}
                    </div>
                  </>
                )}
                {p.fitment_hd_models?.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div className="info-item-label" style={{marginBottom:4}}>HD Models</div>
                    <div className="fitment-tags">
                      {p.fitment_hd_models.map(m => (
                        <span key={m} className="fitment-tag">{m}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Physical */}
            <div className="pd-card">
              <div className="pd-card-head">Physical / Shipping</div>
              <div className="pd-card-body">
                <div className="field-row fourths">
                  <div className="field">
                    <label>Weight (lbs)</label>
                    <input type="number" step="0.001" name="weight" defaultValue={p.weight ?? ""} />
                  </div>
                  <div className="field">
                    <label>Length (in)</label>
                    <input type="number" step="0.001" value={p.length_in ?? ""} readOnly />
                  </div>
                  <div className="field">
                    <label>Width (in)</label>
                    <input type="number" step="0.001" value={p.width_in ?? ""} readOnly />
                  </div>
                  <div className="field">
                    <label>Height (in)</label>
                    <input type="number" step="0.001" value={p.height_in ?? ""} readOnly />
                  </div>
                </div>
                <div className="info-grid" style={{marginTop:8}}>
                  <div className="info-item">
                    <div className="info-item-label">Country of Origin</div>
                    <div className="info-item-val">{p.country_of_origin || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Truck Only</div>
                    <div className="info-item-val">
                      <span className={`pill ${p.truck_only ? "pill-on" : "pill-off"}`}>
                        {p.truck_only ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">No Ship CA</div>
                    <div className="info-item-val">
                      <span className={`pill ${p.no_ship_ca ? "pill-on" : "pill-off"}`}>
                        {p.no_ship_ca ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Hazardous</div>
                    <div className="info-item-val">{p.hazardous_code || <span className="muted">—</span>}</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{display:"flex", flexDirection:"column", gap:16}}>

            {/* Image */}
            <div className="pd-card">
              <div className="pd-card-head">Image</div>
              <div className="pd-card-body">
                {p.image_url
                  ? <img className="pd-img" src={`/api/image-proxy?url=${encodeURIComponent(p.image_url)}`} alt={p.name} />
                  : <div className="pd-img-placeholder">No Image</div>
                }
                <div className="field">
                  <label>Image URL</label>
                  <input type="text" name="image_url" defaultValue={p.image_url ?? ""} />
                </div>
              </div>
            </div>

            {/* Flags */}
            <div className="pd-card">
              <div className="pd-card-head">Flags</div>
              <div className="pd-card-body">
                <div className="toggle-row">
                  {[
                    ["is_active",          "Active",           p.is_active],
                    ["is_discontinued",    "Discontinued",     p.is_discontinued],
                    ["has_map_policy",     "MAP Policy",       p.has_map_policy],
                    ["is_universal",       "Universal Fit",    p.is_universal],
                    ["is_harley_fitment",  "Harley Fitment",   p.is_harley_fitment],

                    ["drag_part",          "Drag Part",        p.drag_part],
                    ["closeout",           "Closeout",         p.closeout],
                  ].map(([name, label, val]) => (
                    <div className="toggle-item" key={name}>
                      <span className="toggle-label">{label}</span>
                      <input
                        type="checkbox"
                        name={name}
                        value="true"
                        defaultChecked={!!val}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Read-only metadata */}
            <div className="pd-card">
              <div className="pd-card-head">Metadata</div>
              <div className="pd-card-body">
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-item-label">Source Vendor</div>
                    <div className="info-item-val">
                      <span className={`pill ${vendorPillClass(p.source_vendor)}`}>{p.source_vendor}</span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Product Code</div>
                    <div className="info-item-val">{p.product_code || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Brand Part #</div>
                    <div className="info-item-val" style={{fontSize:13}}>{p.brand_part_number || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">OEM Part #</div>
                    <div className="info-item-val" style={{fontSize:13}}>{p.oem_numbers?.[0] || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Dropship Fee</div>
                    <div className="info-item-val">{usd(p.dropship_fee)}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">UOM</div>
                    <div className="info-item-val">{p.uom || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Added</div>
                    <div className="info-item-val" style={{fontSize:12}}>
                      {p.part_add_date ? new Date(p.part_add_date).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Updated</div>
                    <div className="info-item-val" style={{fontSize:12}}>
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Save bar */}
        <div className="pd-card" style={{marginTop:16}}>
          <div className="pd-actions">
            <Link className="btn btn-ghost" href="/admin/products">← Back</Link>
            <button className="btn btn-primary" type="submit">Save Changes</button>
          </div>
        </div>

      </form>
    </div>
  );
}

function toInt(v, fb) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fb;
}
