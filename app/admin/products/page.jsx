// ============================================================
// app/admin/products/page.jsx  —  SERVER COMPONENT
// Simple catalog viewer for admins (prevents /admin/products 404)
// ============================================================

import Link from "next/link";
import { getCatalogDb } from "@/lib/db/catalog";

const css = `
  .products-body {
    padding: 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
  }

  .products-heading {
    display:flex; align-items:baseline; justify-content:space-between;
    gap: 12px; margin-bottom: 14px;
  }
  .products-title {
    font-family: var(--font-caesar), sans-serif;
    letter-spacing: 0.08em;
    font-size: 18px;
    color: #f0ebe3;
  }
  .products-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: #8a8784;
    text-transform: uppercase;
  }

  .products-toolbar {
    display:flex; align-items:center; justify-content:space-between;
    gap: 12px;
    border: 1px solid #2a2828;
    background: rgba(16, 15, 15, 0.85);
    border-radius: 2px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .search {
    display:flex; align-items:center; gap: 10px;
    flex: 1;
  }
  .search input {
    width: min(560px, 100%);
    background: #111010;
    border: 1px solid #2a2828;
    color: #f0ebe3;
    padding: 8px 10px;
    border-radius: 2px;
    font-size: 12px;
    outline: none;
  }
  .search input:focus { border-color: rgba(232,98,26,0.65); }
  .btn {
    border: 1px solid rgba(232,98,26,0.35);
    background: transparent;
    color: #f0ebe3;
    padding: 8px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    text-decoration: none;
    display:inline-flex; align-items:center; justify-content:center;
  }
  .btn:hover { border-color: rgba(232,98,26,0.85); color: #e8621a; }

  .table-wrap {
    border: 1px solid #2a2828;
    background: rgba(16, 15, 15, 0.85);
    border-radius: 2px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead th {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    color: #8a8784;
    text-transform: uppercase;
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid #2a2828;
    background: rgba(10, 9, 9, 0.65);
  }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid #1f1e1e;
    color: #f0ebe3;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody tr:hover td { background: rgba(232,98,26,0.06); }

  .muted { color: #8a8784; }
  .pill {
    display:inline-flex; align-items:center; justify-content:center;
    border: 1px solid #2a2828;
    border-radius: 999px;
    padding: 2px 8px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a8784;
  }
  .pill.on { border-color: rgba(60, 190, 120, 0.35); color: #62d18c; }
  .pill.off { border-color: rgba(255, 90, 90, 0.3); color: #ff7a7a; }

  .pager {
    display:flex; align-items:center; justify-content:space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .pager-left, .pager-right { display:flex; align-items:center; gap: 8px; }
  .pager-meta {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    color: #8a8784;
    text-transform: uppercase;
  }

  @media (max-width: 900px) {
    thead { display:none; }
    table, tbody, tr, td { display:block; width:100%; }
    tbody td { border-bottom: 0; padding: 8px 12px; }
    tbody tr { border-bottom: 1px solid #1f1e1e; }
    .col-hide { display:none; }
  }
`;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHref(basePath, q, page) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page && page > 0) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function formatUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

export default async function AdminProductsPage({ searchParams }) {
  const q = String(searchParams?.q ?? "").trim();
  const page = Math.max(0, toInt(searchParams?.page, 0));
  const pageSize = 50;
  const offset = page * pageSize;

  const catalogDb = getCatalogDb();

  const where = [];
  const values = [];
  let idx = 1;

  if (q) {
    where.push(
      `(cu.sku ILIKE $${idx} OR cu.slug ILIKE $${idx} OR cu.name ILIKE $${idx} OR cu.brand ILIKE $${idx})`
    );
    values.push(`%${q}%`);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await catalogDb.query(
    `SELECT COUNT(*)::int AS count FROM public.catalog_unified cu ${whereSql}`,
    values
  );
  const total = countRes.rows[0]?.count ?? 0;

  const rowsRes = await catalogDb.query(
    `
      SELECT
        cu.sku,
        cu.slug,
        cu.name,
        cu.brand,
        COALESCE(cu.computed_price, cu.msrp) AS price,
        cu.map_price,
        cu.cost,
        cu.is_active
      FROM public.catalog_unified cu
      ${whereSql}
      ORDER BY cu.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `,
    [...values, pageSize, offset]
  );

  const items = rowsRes.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const prevPage = Math.max(0, page - 1);
  const nextPage = Math.min(pageCount - 1, page + 1);

  return (
    <div className="products-body">
      <style>{css}</style>

      <div className="products-heading">
        <div>
          <div className="products-title">Products</div>
          <div className="products-sub">Catalog viewer (SKU, slug, pricing)</div>
        </div>
        <div className="products-sub">{total.toLocaleString()} total</div>
      </div>

      <div className="products-toolbar">
        <form className="search" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by SKU, slug, name, or brand…"
            aria-label="Search products"
          />
          <button className="btn" type="submit">Search</button>
          {q ? (
            <Link className="btn" href={buildHref("/admin/products", "", 0)}>Clear</Link>
          ) : null}
        </form>

        <Link className="btn" href="/browse">View Store</Link>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: "16%" }}>SKU</th>
              <th style={{ width: "30%" }}>Name</th>
              <th style={{ width: "16%" }}>Brand</th>
              <th style={{ width: "14%" }}>Price</th>
              <th className="col-hide" style={{ width: "14%" }}>MAP</th>
              <th className="col-hide" style={{ width: "10%" }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((p) => (
                <tr key={p.sku ?? p.slug}>
                  <td>
                    <div>{p.slug?.match(/([A-Z]{3}-\d{6})$/i)?.[1] ?? p.sku ?? <span className="muted">—</span>}</div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      <Link href={`/browse/${p.slug}`} className="muted" style={{ textDecoration: "none" }}>
                        /shop/{p.slug}
                      </Link>
                    </div>
                  </td>
                  <td title={p.name ?? ""}>{p.name ?? <span className="muted">—</span>}</td>
                  <td title={p.brand ?? ""}>{p.brand ?? <span className="muted">—</span>}</td>
                  <td>{p.price != null ? formatUsd(p.price) : <span className="muted">—</span>}</td>
                  <td className="col-hide">
                    {p.map_price != null ? formatUsd(p.map_price) : <span className="muted">—</span>}
                  </td>
                  <td className="col-hide">
                    <span className={`pill ${p.is_active ? "on" : "off"}`}>{p.is_active ? "on" : "off"}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="muted">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="pager-left">
          <Link className="btn" href={buildHref("/admin/products", q, 0)} aria-disabled={page === 0}>
            First
          </Link>
          <Link className="btn" href={buildHref("/admin/products", q, prevPage)} aria-disabled={page === 0}>
            Prev
          </Link>
        </div>
        <div className="pager-meta">
          Page {(page + 1).toLocaleString()} / {pageCount.toLocaleString()}
        </div>
        <div className="pager-right">
          <Link
            className="btn"
            href={buildHref("/admin/products", q, nextPage)}
            aria-disabled={page >= pageCount - 1}
          >
            Next
          </Link>
          <Link className="btn" href={buildHref("/admin/products", q, pageCount - 1)} aria-disabled={page >= pageCount - 1}>
            Last
          </Link>
        </div>
      </div>
    </div>
  );
}
