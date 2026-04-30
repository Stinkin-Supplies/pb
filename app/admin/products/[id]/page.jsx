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
    padding: 24px 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
  }

  /* ── breadcrumb / head ── */
  .pd-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #555;
  }
  .pd-nav a { color: #8a8784; text-decoration: none; }
  .pd-nav a:hover { color: #e8621a; }
  .pd-nav-sep { color: #333; }

  .pd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .pd-title {
    font-family: var(--font-caesar), sans-serif;
    letter-spacing: 0.06em;
    font-size: 20px;
    color: #f0ebe3;
    line-height: 1.2;
  }
  .pd-sku-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .pd-prefix {
    background: rgba(232,98,26,0.1);
    border: 1px solid rgba(232,98,26,0.25);
    border-radius: 2px;
    padding: 2px 7px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    color: #e8621a;
  }
  .pd-sku-num {
    font-family: var(--font-stencil), monospace;
    font-size: 12px;
    letter-spacing: 0.08em;
    color: #8a8784;
  }

  /* ── layout ── */
  .pd-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .pd-grid { grid-template-columns: 1fr; }
  }

  /* ── card ── */
  .pd-card {
    border: 1px solid #2a2828;
    background: rgba(16,15,15,0.85);
    border-radius: 2px;
    overflow: hidden;
  }
  .pd-card-head {
    padding: 10px 14px;
    border-bottom: 1px solid #2a2828;
    background: rgba(10,9,9,0.5);
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8a8784;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pd-card-body { padding: 14px; }

  /* ── form fields ── */
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }
  .field-row.full { grid-template-columns: 1fr; }
  .field-row.thirds { grid-template-columns: 1fr 1fr 1fr; }
  .field-row.fourths { grid-template-columns: 1fr 1fr 1fr 1fr; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #555;
  }
  .field input[type=text],
  .field input[type=number],
  .field textarea,
  .field select {
    background: #0e0d0d;
    border: 1px solid #252424;
    color: #f0ebe3;
    padding: 7px 9px;
    border-radius: 2px;
    font-size: 12px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
  }
  .field input:focus,
  .field textarea:focus,
  .field select:focus { border-color: rgba(232,98,26,0.55); }
  .field textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
  .field input[readonly] { color: #555; cursor: not-allowed; }

  /* ── toggle ── */
  .toggle-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }
  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border: 1px solid #1f1e1e;
    border-radius: 2px;
    background: #0e0d0d;
  }
  .toggle-label {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a8784;
  }
  .toggle-item input[type=checkbox] {
    width: 14px;
    height: 14px;
    accent-color: #e8621a;
    cursor: pointer;
  }

  /* ── image preview ── */
  .pd-img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    background: #0e0d0d;
    border: 1px solid #1f1e1e;
    border-radius: 2px;
    margin-bottom: 10px;
    padding: 12px;
    box-sizing: border-box;
  }
  .pd-img-placeholder {
    width: 100%;
    aspect-ratio: 1;
    background: #0e0d0d;
    border: 1px solid #1f1e1e;
    border-radius: 2px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── read-only info ── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    background: #0e0d0d;
    border: 1px solid #1a1919;
    border-radius: 2px;
  }
  .info-item-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #444;
  }
  .info-item-val {
    font-size: 12px;
    color: #f0ebe3;
  }
  .info-item-val.muted { color: #555; }

  /* ── pills ── */
  .pill {
    display: inline-flex;
    align-items: center;
    border: 1px solid #2a2828;
    border-radius: 2px;
    padding: 1px 6px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a8784;
  }
  .pill-on  { border-color: rgba(60,190,120,0.3);  color: #62d18c; }
  .pill-off { border-color: rgba(255,90,90,0.25);  color: #ff7a7a; }
  .pill-pu    { border-color: rgba(139,92,246,0.4); color: #a78bfa; }
  .pill-wps   { border-color: rgba(59,130,246,0.4); color: #60a5fa; }
  .pill-vtwin { border-color: rgba(232,98,26,0.4);  color: #e8621a; }

  /* ── fitment tags ── */
  .fitment-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .fitment-tag {
    background: rgba(232,98,26,0.06);
    border: 1px solid rgba(232,98,26,0.15);
    border-radius: 2px;
    padding: 2px 6px;
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.08em;
    color: #8a8784;
  }

  /* ── action bar ── */
  .pd-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid #2a2828;
    background: rgba(10,9,9,0.5);
  }
  .btn {
    border: 1px solid rgba(232,98,26,0.35);
    background: transparent;
    color: #f0ebe3;
    padding: 7px 14px;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn:hover { border-color: rgba(232,98,26,0.85); color: #e8621a; }
  .btn-primary {
    background: rgba(232,98,26,0.15);
    border-color: rgba(232,98,26,0.6);
  }
  .btn-primary:hover { background: rgba(232,98,26,0.25); }
  .btn-ghost { border-color: #2a2828; color: #8a8784; }
  .btn-ghost:hover { border-color: #444; color: #f0ebe3; }

  /* ── warehouse grid ── */
  .wh-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin-top: 8px;
  }
  .wh-item {
    background: #0e0d0d;
    border: 1px solid #1a1919;
    border-radius: 2px;
    padding: 6px 8px;
    text-align: center;
  }
  .wh-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #444;
    margin-bottom: 3px;
  }
  .wh-val {
    font-family: var(--font-stencil), monospace;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: #f0ebe3;
  }
  .wh-val.zero { color: #333; }

  .divider {
    border: none;
    border-top: 1px solid #1a1919;
    margin: 12px 0;
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
  const id = toInt(params?.id, null);
  if (!id) notFound();

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
                <div className="field-row">
                  <div className="field">
                    <label>Brand</label>
                    <input type="text" name="brand" defaultValue={p.brand ?? ""} />
                  </div>
                  <div className="field">
                    <label>Display Brand</label>
                    <input type="text" name="display_brand" defaultValue={p.display_brand ?? ""} />
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
                    ["in_oldbook",         "In Old Book",      p.in_oldbook],
                    ["in_fatbook",         "In Fat Book",      p.in_fatbook],
                    ["in_harddrive",       "In Hard Drive",    p.in_harddrive],
                    ["in_street",          "In Street",        p.in_street],
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
                    <div className="info-item-val" style={{fontSize:11}}>{p.brand_part_number || <span className="muted">—</span>}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">OEM Part #</div>
                    <div className="info-item-val" style={{fontSize:11}}>{p.oem_part_number || <span className="muted">—</span>}</div>
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
                    <div className="info-item-val" style={{fontSize:10}}>
                      {p.part_add_date ? new Date(p.part_add_date).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Updated</div>
                    <div className="info-item-val" style={{fontSize:10}}>
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