// ============================================================
// app/admin/catalog/page.jsx — SERVER COMPONENT
// Category editor — view and fix miscategorized products
// ============================================================

import Link from "next/link";
import { getCatalogDb } from "@/lib/db/catalog";
import CatalogTable from "./CatalogTable";

const CATEGORIES = [
  "General","Engine","Exhaust","Brakes","Suspension","Electrical",
  "Lighting","Handlebars","Hand Controls","Foot Controls","Intake/Carb/Fuel System",
  "Clutch","Drive","Wheels/Tires","Body","Cable/Hydraulic Control Lines",
  "Hardware/Fasteners/Fittings","Chemicals","Apparel/Helmets","Luggage",
  "Gaskets/Seals","Tools","Windshield/Windscreen","Seat","Maintenance",
  "Chopper",
];

const VENDORS = ["PU","WPS","VTWIN"];

const css = `
  .cm-body {
    padding: 24px 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
  }

  .cm-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .cm-title {
    font-family: var(--font-caesar), sans-serif;
    letter-spacing: 0.08em;
    font-size: 18px;
    color: #f0ebe3;
  }
  .cm-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: #8a8784;
    text-transform: uppercase;
  }

  .cm-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    border: 1px solid #2a2828;
    background: rgba(16,15,15,0.85);
    border-radius: 2px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .cm-toolbar input[type=text] {
    flex: 1;
    min-width: 200px;
    background: #111010;
    border: 1px solid #2a2828;
    color: #f0ebe3;
    padding: 7px 10px;
    border-radius: 2px;
    font-size: 12px;
    outline: none;
  }
  .cm-toolbar input[type=text]:focus { border-color: rgba(232,98,26,0.65); }
  .cm-toolbar select {
    background: #111010;
    border: 1px solid #2a2828;
    color: #8a8784;
    padding: 7px 8px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    outline: none;
    cursor: pointer;
  }
  .cm-toolbar select:focus { border-color: rgba(232,98,26,0.65); }

  .btn {
    border: 1px solid rgba(232,98,26,0.35);
    background: transparent;
    color: #f0ebe3;
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
    gap: 6px;
  }
  .btn:hover { border-color: rgba(232,98,26,0.85); color: #e8621a; }
  .btn-ghost { border-color: #2a2828; color: #8a8784; }
  .btn-ghost:hover { border-color: #444; color: #f0ebe3; }
  .btn-danger { border-color: rgba(255,90,90,0.3); color: #ff7a7a; }
  .btn-danger:hover { border-color: rgba(255,90,90,0.7); }

  /* stat chips */
  .cm-stats {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .cm-stat {
    border: 1px solid #2a2828;
    border-radius: 2px;
    padding: 6px 12px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    color: #8a8784;
    text-transform: uppercase;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
  }
  .cm-stat:hover { border-color: #e8621a; color: #e8621a; }
  .cm-stat.active { border-color: #e8621a; color: #e8621a; background: rgba(232,98,26,0.06); }
  .cm-stat-count {
    font-family: var(--font-caesar), sans-serif;
    font-size: 14px;
    display: block;
    color: #f0ebe3;
    margin-bottom: 1px;
  }
  .cm-stat.active .cm-stat-count { color: #e8621a; }

  /* table */
  .cm-table-wrap {
    border: 1px solid #2a2828;
    background: rgba(16,15,15,0.85);
    border-radius: 2px;
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    color: #8a8784;
    text-transform: uppercase;
    text-align: left;
    padding: 9px 12px;
    border-bottom: 1px solid #2a2828;
    background: rgba(10,9,9,0.65);
    white-space: nowrap;
  }
  tbody td {
    padding: 8px 12px;
    border-bottom: 1px solid #1a1919;
    color: #f0ebe3;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: rgba(232,98,26,0.04); }

  .muted { color: #8a8784; font-size: 10px; }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2a2828;
    border-radius: 2px;
    padding: 1px 6px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a8784;
  }
  .pill-pu    { border-color: rgba(139,92,246,0.4); color: #a78bfa; }
  .pill-wps   { border-color: rgba(59,130,246,0.4); color: #60a5fa; }
  .pill-vtwin { border-color: rgba(232,98,26,0.4);  color: #e8621a; }
  .pill-general { border-color: rgba(245,158,11,0.4); color: #f59e0b; }

  /* inline category select */
  .cat-select {
    background: #111010;
    border: 1px solid #2a2828;
    color: #f0ebe3;
    padding: 4px 6px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    outline: none;
    cursor: pointer;
    width: 100%;
    max-width: 180px;
  }
  .cat-select:focus { border-color: rgba(232,98,26,0.65); }
  .cat-select.changed { border-color: rgba(232,98,26,0.65); color: #e8621a; }

  .save-btn {
    border: 1px solid rgba(232,98,26,0.35);
    background: transparent;
    color: #e8621a;
    padding: 4px 8px;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    display: none;
    transition: all 0.15s;
  }
  .save-btn.visible { display: inline-flex; }
  .save-btn:hover { background: rgba(232,98,26,0.1); }

  /* pager */
  .cm-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .cm-pager-sides { display: flex; align-items: center; gap: 6px; }

  /* bulk bar */
  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(232,98,26,0.06);
    border: 1px solid rgba(232,98,26,0.2);
    border-radius: 2px;
    margin-bottom: 10px;
  }
  .bulk-bar-label {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    color: #e8621a;
    flex: 1;
  }
  .bulk-select {
    background: #111010;
    border: 1px solid rgba(232,98,26,0.3);
    color: #f0ebe3;
    padding: 5px 8px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    outline: none;
    cursor: pointer;
  }

  .product-name {
    font-size: 12px;
    color: #f0ebe3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .product-sku {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    color: #555;
    margin-top: 1px;
  }

  input[type=checkbox] {
    accent-color: #e8621a;
    width: 13px;
    height: 13px;
    cursor: pointer;
  }
`;

function toInt(v, fb) {
  const n = parseInt(String(v ?? ""), 10);
  return isFinite(n) ? n : fb;
}

function buildHref(base, params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) p.set(k, String(v));
  });
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

function vendorClass(v) {
  if (v === "PU") return "pill-pu";
  if (v === "WPS") return "pill-wps";
  if (v === "VTWIN") return "pill-vtwin";
  return "";
}

export default async function AdminCatalogPage({ searchParams }) {
  const sp       = await searchParams;
  const q        = String(sp?.q        ?? "").trim();
  const category = String(sp?.category ?? "General").trim();
  const vendor   = String(sp?.vendor   ?? "").trim().toUpperCase();
  const page     = Math.max(0, toInt(sp?.page, 0));
  const pageSize = 75;
  const offset   = page * pageSize;

  const db = getCatalogDb();

  // Category distribution for stat chips
  const distRes = await db.query(`
    SELECT 
      COALESCE(NULLIF(TRIM(category), ''), '(blank)') AS cat,
      COUNT(*)::int AS count
    FROM catalog_unified
    WHERE is_active = true
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  `);
  const dist = distRes.rows ?? [];

  // Main query
  const where = [];
  const values = [];
  let idx = 1;

  if (category === "(blank)") {
    where.push(`(cu.category IS NULL OR TRIM(cu.category) = '')`);
  } else {
    where.push(`cu.category = $${idx}`);
    values.push(category);
    idx++;
  }

  if (q) {
    where.push(`(cu.name ILIKE $${idx} OR cu.sku ILIKE $${idx} OR cu.brand ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }
  if (vendor) {
    where.push(`cu.source_vendor = $${idx}`);
    values.push(vendor);
    idx++;
  }

  where.push(`cu.is_active = true`);
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [countRes, rowsRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count FROM catalog_unified cu ${whereSql}`,
      values
    ),
    db.query(
      `SELECT
         cu.id, cu.sku, cu.internal_sku, cu.slug,
         cu.name, cu.brand, cu.category, cu.source_vendor,
         cu.stock_quantity, cu.in_stock
       FROM catalog_unified cu
       ${whereSql}
       ORDER BY cu.brand ASC, cu.name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset]
    ),
  ]);

  const total     = countRes.rows[0]?.count ?? 0;
  const items     = rowsRes.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const baseParams = { q, category, vendor };

  return (
    <div className="cm-body">
      <style>{css}</style>

      {/* Header */}
      <div className="cm-head">
        <div>
          <div className="cm-title">Catalog Editor</div>
          <div className="cm-sub">
            Category management · {total.toLocaleString()} products in <strong style={{color:"#e8621a"}}>{category}</strong>
          </div>
        </div>
        <Link className="btn btn-ghost" href="/admin/products">↖ Products</Link>
      </div>

      {/* Category stat chips */}
      <div className="cm-stats">
        {dist.map(row => (
          <Link
            key={row.cat}
            href={buildHref("/admin/catalog", { category: row.cat })}
            className={`cm-stat ${category === row.cat ? "active" : ""}`}
          >
            <span className="cm-stat-count">{Number(row.count).toLocaleString()}</span>
            {row.cat}
          </Link>
        ))}
      </div>

      {/* Toolbar */}
      <form className="cm-toolbar" method="get">
        <input type="hidden" name="category" value={category} />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search name, SKU, brand…"
        />
        <select name="vendor" defaultValue={vendor}>
          <option value="">All Vendors</option>
          {VENDORS.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button className="btn" type="submit">Filter</button>
        {(q || vendor) && (
          <Link className="btn btn-ghost" href={buildHref("/admin/catalog", { category })}>
            Clear
          </Link>
        )}
      </form>

      {/* Interactive table — client component handles checkboxes, dropdowns, saves */}
      <CatalogTable initialItems={items} />

      {/* Pager */}
      <div className="cm-pager">
        <div className="cm-pager-sides">
          <Link className="btn btn-ghost" href={buildHref("/admin/catalog", {...baseParams, page: 0})}>First</Link>
          <Link className="btn btn-ghost" href={buildHref("/admin/catalog", {...baseParams, page: Math.max(0, page-1)})}>Prev</Link>
        </div>
        <div className="cm-sub">Page {(page+1).toLocaleString()} / {pageCount.toLocaleString()}</div>
        <div className="cm-pager-sides">
          <Link className="btn btn-ghost" href={buildHref("/admin/catalog", {...baseParams, page: Math.min(pageCount-1, page+1)})}>Next</Link>
          <Link className="btn btn-ghost" href={buildHref("/admin/catalog", {...baseParams, page: pageCount-1})}>Last</Link>
        </div>
      </div>
    </div>
  );
}
