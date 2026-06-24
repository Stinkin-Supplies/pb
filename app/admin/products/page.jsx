// ============================================================
// app/admin/products/page.jsx  —  SERVER COMPONENT
// Full catalog manager with filters, internal_sku display, and edit links
// ============================================================

import Link from "next/link";
import { getCatalogDb } from "@/lib/db/catalog";

const PREFIXES = [
  "ACC","BDY","BRK","DRV","ELC","ENG","EXH","FTR","FUL",
  "HBR","HRD","LIG","LUG","SEA","SUS","SWG","WHL"
];
const VENDORS = ["PU","WPS","VTWIN"];

const css = `
  .pm-body {
    padding: 24px 28px;
    background: #f5f0e8;
    min-height: calc(100vh - 46px);
  }

  /* ── heading ── */
  .pm-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .pm-title {
    font-family: var(--font-caesar), sans-serif;
    letter-spacing: 0.08em;
    font-size: 18px;
    color: #1a1208;
  }
  .pm-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: #7a6a4f;
    text-transform: uppercase;
  }

  /* ── toolbar ── */
  .pm-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    border: 1px solid #ddd0b8;
    background: #ffffff;
    border-radius: 2px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .pm-toolbar input[type=text] {
    flex: 1;
    min-width: 200px;
    background: #fbf6ec;
    border: 1px solid #ddd0b8;
    color: #1a1208;
    padding: 7px 10px;
    border-radius: 2px;
    font-size: 12px;
    outline: none;
  }
  .pm-toolbar input[type=text]:focus { border-color: rgba(201,168,76,0.65); }
  .pm-toolbar select {
    background: #fbf6ec;
    border: 1px solid #ddd0b8;
    color: #7a6a4f;
    padding: 7px 8px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    outline: none;
    cursor: pointer;
  }
  .pm-toolbar select:focus { border-color: rgba(201,168,76,0.65); }

  /* ── buttons ── */
  .btn {
    border: 1px solid rgba(201,168,76,0.35);
    background: transparent;
    color: #1a1208;
    padding: 7px 12px;
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
  .btn:hover { border-color: rgba(201,168,76,0.85); color: #a3822c; }
  .btn-ghost {
    border-color: #ddd0b8;
    color: #7a6a4f;
  }
  .btn-ghost:hover { border-color: #9c8a6a; color: #1a1208; }

  /* ── table ── */
  .pm-table-wrap {
    border: 1px solid #ddd0b8;
    background: #ffffff;
    border-radius: 2px;
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    color: #7a6a4f;
    text-transform: uppercase;
    text-align: left;
    padding: 9px 12px;
    border-bottom: 1px solid #ddd0b8;
    background: #fbf6ec;
    white-space: nowrap;
  }
  tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid #e6dcc0;
    color: #1a1208;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: rgba(201,168,76,0.05); }

  .muted { color: #7a6a4f; font-size: 10px; }

  /* ── pills ── */
  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ddd0b8;
    border-radius: 2px;
    padding: 1px 6px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7a6a4f;
  }
  .pill-on  { border-color: rgba(47,133,82,0.3); color: #2f8552; }
  .pill-off { border-color: rgba(192,57,43,0.25); color: #c0392b; }
  .pill-pu    { border-color: rgba(124,95,214,0.4); color: #7c5fd6; }
  .pill-wps   { border-color: rgba(59,120,216,0.4); color: #3b78d8; }
  .pill-vtwin { border-color: rgba(201,168,76,0.4);  color: #a3822c; }

  /* ── prefix badge ── */
  .prefix-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(201,168,76,0.1);
    border: 1px solid rgba(201,168,76,0.3);
    border-radius: 2px;
    padding: 1px 5px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: #a3822c;
    margin-right: 5px;
  }

  /* ── sku cell ── */
  .sku-main {
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: #1a1208;
  }
  .sku-vendor {
    font-size: 9px;
    color: #8a7a60;
    margin-top: 1px;
  }

  /* ── edit link ── */
  .edit-link {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a7a60;
    text-decoration: none;
    border: 1px solid #ddd0b8;
    border-radius: 2px;
    padding: 3px 8px;
    white-space: nowrap;
  }
  .edit-link:hover { color: #a3822c; border-color: rgba(201,168,76,0.4); }

  /* ── pager ── */
  .pm-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .pm-pager-sides { display: flex; align-items: center; gap: 6px; }

  /* ── stock ── */
  .stock-num {
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
  }
  .stock-ok  { color: #2f8552; }
  .stock-low { color: #9a5a0c; }
  .stock-out { color: #8a7a60; }
`;

function toInt(v, fb) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fb;
}

function buildHref(base, params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) p.set(k, String(v));
  });
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

function usd(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

function vendorClass(v) {
  if (v === "PU") return "pill-pu";
  if (v === "WPS") return "pill-wps";
  if (v === "VTWIN") return "pill-vtwin";
  return "";
}

export default async function AdminProductsPage({ searchParams }) {
  const sp      = await searchParams;
  const q       = String(sp?.q       ?? "").trim();
  const prefix  = String(sp?.prefix  ?? "").trim().toUpperCase();
  const vendor  = String(sp?.vendor  ?? "").trim().toUpperCase();
  const active  = String(sp?.active  ?? "").trim();
  const page    = Math.max(0, toInt(sp?.page, 0));
  const pageSize = 50;
  const offset   = page * pageSize;

  const catalogDb = getCatalogDb();
  const where = [];
  const values = [];
  let idx = 1;

  if (q) {
    where.push(`(cu.internal_sku ILIKE $${idx} OR cu.sku ILIKE $${idx} OR cu.name ILIKE $${idx} OR cu.brand ILIKE $${idx} OR cu.upc ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }
  if (prefix) {
    where.push(`SUBSTRING(cu.internal_sku, 1, 3) = $${idx}`);
    values.push(prefix);
    idx++;
  }
  if (vendor) {
    where.push(`cu.source_vendor = $${idx}`);
    values.push(vendor);
    idx++;
  }
  if (active === "1") {
    where.push(`cu.is_active = true`);
  } else if (active === "0") {
    where.push(`cu.is_active = false`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRes, rowsRes] = await Promise.all([
    catalogDb.query(
      `SELECT COUNT(*)::int AS count FROM public.catalog_unified cu ${whereSql}`,
      values
    ),
    catalogDb.query(
      `SELECT
         cu.id,
         cu.internal_sku,
         cu.sku,
         cu.slug,
         cu.name,
         cu.brand,
         cu.category,
         cu.source_vendor,
         cu.stock_quantity,
         cu.in_stock,
         COALESCE(cu.computed_price, cu.msrp) AS price,
         cu.map_price,
         cu.cost,
         cu.msrp,
         cu.is_active,
         cu.is_discontinued,
         cu.image_url
       FROM public.catalog_unified cu
       ${whereSql}
       ORDER BY cu.internal_sku ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset]
    )
  ]);

  const total     = countRes.rows[0]?.count ?? 0;
  const items     = rowsRes.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const prevPage  = Math.max(0, page - 1);
  const nextPage  = Math.min(pageCount - 1, page + 1);

  const baseParams = { q, prefix, vendor, active };

  return (
    <div className="pm-body">
      <style>{css}</style>

      <div className="pm-head">
        <div>
          <div className="pm-title">Products</div>
          <div className="pm-sub">Catalog manager · {total.toLocaleString()} results</div>
        </div>
        <Link className="btn btn-ghost" href="/browse">View Store</Link>
      </div>

      {/* Toolbar / filters */}
      <form className="pm-toolbar" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search SKU, name, brand, UPC…"
        />

        <select name="prefix" defaultValue={prefix}>
          <option value="">All Prefixes</option>
          {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select name="vendor" defaultValue={vendor}>
          <option value="">All Vendors</option>
          {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select name="active" defaultValue={active}>
          <option value="">Any Status</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>

        <button className="btn" type="submit">Filter</button>
        {(q || prefix || vendor || active) && (
          <Link className="btn btn-ghost" href="/admin/products">Clear</Link>
        )}
      </form>

      {/* Table */}
      <div className="pm-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width:"14%"}}>Internal SKU</th>
              <th style={{width:"28%"}}>Name</th>
              <th style={{width:"14%"}}>Brand</th>
              <th style={{width:"10%"}}>Category</th>
              <th style={{width:"8%"}}>Vendor</th>
              <th style={{width:"8%"}}>Price</th>
              <th style={{width:"6%"}}>Stock</th>
              <th style={{width:"6%"}}>Status</th>
              <th style={{width:"6%"}}></th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((p) => {
              const pfx = p.internal_sku?.substring(0, 3) ?? "";
              const stock = p.stock_quantity ?? 0;
              const stockClass = stock > 10 ? "stock-ok" : stock > 0 ? "stock-low" : "stock-out";
              return (
                <tr key={p.id}>
                  <td>
                    <div className="sku-main">
                      <span className="prefix-badge">{pfx}</span>
                      {p.internal_sku?.substring(4) ?? "—"}
                    </div>
                    <div className="sku-vendor muted">{p.sku}</div>
                  </td>
                  <td title={p.name ?? ""}>{p.name ?? <span className="muted">—</span>}</td>
                  <td title={p.brand ?? ""}>{p.brand ?? <span className="muted">—</span>}</td>
                  <td title={p.category ?? ""} className="muted">{p.category ?? "—"}</td>
                  <td>
                    <span className={`pill ${vendorClass(p.source_vendor)}`}>
                      {p.source_vendor ?? "—"}
                    </span>
                  </td>
                  <td>{usd(p.price)}</td>
                  <td>
                    <span className={`stock-num ${stockClass}`}>{stock}</span>
                  </td>
                  <td>
                    <span className={`pill ${p.is_active ? "pill-on" : "pill-off"}`}>
                      {p.is_active ? "On" : "Off"}
                    </span>
                  </td>
                  <td>
                    <Link className="edit-link" href={`/admin/products/${p.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={9} className="muted" style={{textAlign:"center", padding:"32px"}}>
                  No products match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="pm-pager">
        <div className="pm-pager-sides">
          <Link className="btn btn-ghost" href={buildHref("/admin/products", {...baseParams, page: 0})}>First</Link>
          <Link className="btn btn-ghost" href={buildHref("/admin/products", {...baseParams, page: prevPage})}>Prev</Link>
        </div>
        <div className="pm-sub">Page {(page+1).toLocaleString()} / {pageCount.toLocaleString()}</div>
        <div className="pm-pager-sides">
          <Link className="btn btn-ghost" href={buildHref("/admin/products", {...baseParams, page: nextPage})}>Next</Link>
          <Link className="btn btn-ghost" href={buildHref("/admin/products", {...baseParams, page: pageCount-1})}>Last</Link>
        </div>
      </div>
    </div>
  );
}
