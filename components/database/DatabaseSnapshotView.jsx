import Link from "next/link";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0909;
    --panel: rgba(17,16,16,0.88);
    --panel-strong: #111010;
    --line: #2a2828;
    --line-soft: rgba(255,255,255,0.05);
    --text: #f0ebe3;
    --muted: #8a8784;
    --orange: #e8621a;
    --orange-deep: #c94f0f;
    --gold: #c9a84c;
    --green: #22c55e;
    --blue: #3b82f6;
    --surface-tint: rgba(255,255,255,0.02);
    --surface-tint-strong: rgba(255,255,255,0.06);
    --track-tint: rgba(255,255,255,0.05);
    --ring-track: rgba(255,255,255,0.07);
    --ring-border: rgba(255,255,255,0.04);
    --hero-grad-1: rgba(255,255,255,0.032);
    --hero-grad-2: rgba(255,255,255,0.014);
    --gauge-inner-1: rgba(17,16,16,0.96);
    --gauge-inner-2: rgba(10,9,9,0.96);
    --page-grad:
      radial-gradient(circle at top left, rgba(232,98,26,0.14), transparent 28%),
      radial-gradient(circle at 88% 4%, rgba(201,168,76,0.10), transparent 22%),
      linear-gradient(180deg, #0c0b0b 0%, #090808 100%);
    --bar-blue-grad: linear-gradient(90deg, rgba(59,130,246,0.9), rgba(34,197,94,0.9));
    --bar-gold-grad: linear-gradient(90deg, rgba(201,168,76,0.95), rgba(232,98,26,0.9));
    --bar-orange-grad: linear-gradient(90deg, rgba(232,98,26,0.95), rgba(201,168,76,0.85));
    --card-shadow: rgba(0,0,0,0.28);
  }

  .db-wrap.db-admin {
    --bg: #f5f0e8;
    --panel: rgba(255,255,255,0.92);
    --panel-strong: #ffffff;
    --line: #ddd0b8;
    --line-soft: rgba(26,18,8,0.05);
    --text: #1a1208;
    --muted: #7a6a4f;
    --orange: #a3822c;
    --orange-deep: #a3822c;
    --gold: #a3822c;
    --green: #2f8552;
    --blue: #3b78d8;
    --surface-tint: rgba(26,18,8,0.035);
    --surface-tint-strong: rgba(26,18,8,0.08);
    --track-tint: rgba(26,18,8,0.07);
    --ring-track: rgba(26,18,8,0.1);
    --ring-border: rgba(26,18,8,0.08);
    --hero-grad-1: rgba(26,18,8,0.05);
    --hero-grad-2: rgba(26,18,8,0.02);
    --gauge-inner-1: rgba(255,255,255,0.98);
    --gauge-inner-2: rgba(251,246,236,0.98);
    --page-grad:
      radial-gradient(circle at top left, rgba(201,168,76,0.16), transparent 28%),
      radial-gradient(circle at 88% 4%, rgba(163,130,44,0.1), transparent 22%),
      linear-gradient(180deg, #f5f0e8 0%, #efe7d6 100%);
    --bar-blue-grad: linear-gradient(90deg, rgba(59,120,216,0.9), rgba(47,133,82,0.9));
    --bar-gold-grad: linear-gradient(90deg, rgba(201,168,76,0.95), rgba(163,130,44,0.9));
    --bar-orange-grad: linear-gradient(90deg, rgba(163,130,44,0.95), rgba(201,168,76,0.85));
    --card-shadow: rgba(26,18,8,0.12);
  }

  .db-wrap {
    min-height: 100vh;
    background: var(--page-grad);
    color: var(--text);
    font-family: var(--font-stencil), sans-serif;
    position: relative;
    overflow: hidden;
  }

  .db-wrap::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    pointer-events: none;
    opacity: 0.35;
    z-index: 0;
  }

  .db-shell {
    position: relative;
    z-index: 1;
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px 24px 220px;
  }

  .db-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
    gap: 20px;
    align-items: stretch;
    padding: 24px;
    border: 1px solid var(--line);
    background: linear-gradient(180deg, var(--hero-grad-1), var(--hero-grad-2));
    border-radius: 6px;
    box-shadow: 0 30px 90px var(--card-shadow);
    margin-bottom: 18px;
  }

  .db-kicker {
    font-size: 8px;
    letter-spacing: 0.24em;
    color: var(--gold);
    margin-bottom: 8px;
  }

  .db-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(34px, 4.8vw, 62px);
    line-height: 0.92;
    letter-spacing: 0.04em;
  }

  .db-title span { color: var(--orange); }

  .db-subtitle {
    margin-top: 12px;
    max-width: 760px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.8;
    letter-spacing: 0.08em;
  }

  .db-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .db-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--line);
    background: var(--surface-tint);
    color: var(--text);
    padding: 10px 14px;
    border-radius: 3px;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-decoration: none;
    transition: all 0.16s ease;
    white-space: nowrap;
  }

  .db-btn:hover {
    border-color: var(--orange);
    color: var(--orange);
    transform: translateY(-1px);
  }

  .hero-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hero-card {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface-tint);
    padding: 16px;
  }

  .gauge {
    position: relative;
    display: grid;
    place-items: center;
    width: min(100%, 250px);
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 50%;
    background: conic-gradient(var(--gold) 0 var(--pct), var(--ring-track) var(--pct) 100%);
    padding: 14px;
  }

  .gauge::before {
    content: "";
    position: absolute;
    inset: 14px;
    border-radius: 50%;
    background: linear-gradient(180deg, var(--gauge-inner-1), var(--gauge-inner-2));
    border: 1px solid var(--ring-border);
  }

  .gauge-inner {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    gap: 6px;
    text-align: center;
    padding: 18px;
  }

  .gauge-value {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(40px, 5vw, 54px);
    line-height: 0.9;
    letter-spacing: 0.03em;
  }

  .gauge-label {
    font-size: 8px;
    color: var(--gold);
    letter-spacing: 0.18em;
  }

  .gauge-note {
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.1em;
    line-height: 1.6;
  }

  .gauge-metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .mini-metric {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface-tint);
  }

  .mini-label {
    font-size: 8px;
    color: var(--muted);
    letter-spacing: 0.18em;
    margin-bottom: 8px;
  }

  .mini-value {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px;
    line-height: 0.95;
    letter-spacing: 0.03em;
  }

  .mini-note {
    margin-top: 6px;
    font-size: 8px;
    color: var(--muted);
    letter-spacing: 0.08em;
    line-height: 1.5;
  }

  .db-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }

  .metric-card,
  .panel {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 6px;
    overflow: hidden;
  }

  .metric-card {
    grid-column: span 3;
    padding: 16px;
  }

  .metric-label {
    color: var(--muted);
    font-size: 8px;
    letter-spacing: 0.18em;
    margin-bottom: 10px;
  }

  .metric-value {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(28px, 3vw, 42px);
    line-height: 0.95;
    letter-spacing: 0.04em;
  }

  .metric-note {
    margin-top: 8px;
    color: var(--muted);
    font-size: 9px;
    letter-spacing: 0.1em;
    line-height: 1.5;
  }

  .panel {
    padding: 18px;
  }

  .panel-wide {
    grid-column: span 12;
  }

  .panel-half {
    grid-column: span 6;
  }

  .panel-third {
    grid-column: span 4;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .panel-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 22px;
    letter-spacing: 0.05em;
    line-height: 1;
  }

  .panel-title span { color: var(--orange); }

  .panel-subtitle {
    margin-top: 5px;
    color: var(--muted);
    font-size: 9px;
    letter-spacing: 0.16em;
    line-height: 1.55;
  }

  .panel-meta {
    font-size: 8px;
    letter-spacing: 0.16em;
    color: var(--gold);
    text-align: right;
    line-height: 1.6;
  }

  .fitment-board {
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: 16px;
    align-items: stretch;
  }

  .fitment-card {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface-tint);
    padding: 16px;
  }

  .source-stack {
    display: flex;
    overflow: hidden;
    height: 12px;
    border-radius: 999px;
    background: var(--surface-tint-strong);
  }

  .source-segment {
    height: 100%;
  }

  .source-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin-top: 10px;
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.1em;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .detail-chip {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--surface-tint);
  }

  .detail-chip-label {
    font-size: 8px;
    color: var(--muted);
    letter-spacing: 0.18em;
    margin-bottom: 8px;
  }

  .detail-chip-value {
    font-family: var(--font-caesar), sans-serif;
    font-size: 30px;
    line-height: 0.95;
    letter-spacing: 0.03em;
  }

  .detail-chip-note {
    margin-top: 6px;
    font-size: 8px;
    color: var(--muted);
    letter-spacing: 0.08em;
    line-height: 1.5;
  }

  .bar-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: minmax(120px, 220px) 1fr auto;
    gap: 12px;
    align-items: center;
  }

  .bar-label {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    position: relative;
    height: 12px;
    border-radius: 999px;
    background: var(--track-tint);
    overflow: hidden;
  }

  .bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--orange), var(--gold));
  }

  .bar-fill.blue {
    background: var(--bar-blue-grad);
  }

  .bar-fill.gold {
    background: var(--bar-gold-grad);
  }

  .bar-fill.orange {
    background: var(--bar-orange-grad);
  }

  .bar-value {
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.1em;
    min-width: 92px;
    text-align: right;
  }

  .footnote {
    margin-top: 10px;
    color: var(--muted);
    font-size: 8px;
    letter-spacing: 0.12em;
    line-height: 1.6;
  }

  .admin-footprint {
    margin-top: 4px;
  }

  .admin-footprint .panel {
    padding-bottom: 16px;
  }

  .vendor-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .vendor-card {
    padding: 14px;
    border: 1px solid var(--line);
    background: var(--surface-tint);
    border-radius: 4px;
  }

  .vendor-name {
    font-size: 8px;
    letter-spacing: 0.18em;
    color: var(--gold);
    margin-bottom: 10px;
  }

  .vendor-value {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px;
    line-height: 1;
  }

  .vendor-note {
    margin-top: 8px;
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.1em;
  }

  .small-print {
    margin-top: 12px;
    font-size: 8px;
    letter-spacing: 0.1em;
    color: var(--muted);
    line-height: 1.7;
  }

  @media (max-width: 1120px) {
    .db-hero { grid-template-columns: 1fr; }
    .metric-card { grid-column: span 6; }
    .panel-half, .panel-third { grid-column: span 12; }
    .fitment-board { grid-template-columns: 1fr; }
  }

  @media (max-width: 760px) {
    .db-shell { padding: 18px 14px 220px; }
    .metric-card { grid-column: span 12; }
    .bar-row { grid-template-columns: 1fr; gap: 8px; }
    .bar-value { text-align: left; }
    .vendor-grid, .detail-grid { grid-template-columns: 1fr; }
  }
`;

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

function formatBytes(bytes) {
  const n = Number(bytes ?? 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

function percent(value, total, digits = 1) {
  if (!total) return "0.0";
  return ((Number(value ?? 0) / Number(total)) * 100).toFixed(digits);
}

function BarRow({ label, value, total, note, tone = "orange" }) {
  const width = total ? Math.max(4, (Number(value ?? 0) / Number(total)) * 100) : 0;
  return (
    <div className="bar-row">
      <div className="bar-label" title={label}>{label}</div>
      <div className="bar-track" aria-hidden="true">
        <div className={`bar-fill ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <div className="bar-value">{note ?? formatNumber(value)}</div>
    </div>
  );
}

function MetricCard({ label, value, note }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

function SourceStack({ rows, total }) {
  return (
    <div>
      <div className="source-stack">
        {rows.map((row, index) => {
          const width = total ? Math.max(8, (row.rows / total) * 100) : 0;
          const palette = ["var(--orange)", "var(--gold)", "var(--blue)"];
          return (
            <div
              key={String(row.vendor ?? index)}
              className="source-segment"
              style={{ width: `${width}%`, background: palette[index % palette.length] }}
              title={`${row.vendor ?? "Unknown"}: ${formatNumber(row.rows)}`}
            />
          );
        })}
      </div>
      <div className="source-row">
        {rows.map((row) => (
          <span key={String(row.vendor ?? "")}>
            {row.vendor ?? "UNKNOWN"} · {formatNumber(row.rows)} · {percent(row.rows, total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function Gauge({ value, label, note }) {
  const pct = `${value}%`;
  return (
    <div className="hero-card">
      <div className="gauge" style={{ ["--pct"]: pct }}>
        <div className="gauge-inner">
          <div className="gauge-value">{pct}</div>
          <div className="gauge-label">{label}</div>
          <div className="gauge-note">{note}</div>
        </div>
      </div>
    </div>
  );
}

export default function DatabaseSnapshotView({ snapshot, variant = "public" }) {
  const totalProducts = Number(snapshot?.overview?.total_products ?? 0);
  const activeProducts = Number(snapshot?.overview?.active_products ?? 0);
  const productsWithFitment = Number(snapshot?.overview?.products_with_fitment ?? 0);
  const productsWithOem = Number(snapshot?.overview?.products_with_oem_crossref ?? 0);
  const fitmentRows = Number(snapshot?.fitmentTotals?.fitment_rows ?? 0);
  const fitmentCoverage = totalProducts ? (productsWithFitment / totalProducts) * 100 : 0;
  const avgRowsPerFitmentProduct = productsWithFitment ? fitmentRows / productsWithFitment : 0;
  const maxTableBytes = Math.max(0, ...(snapshot?.tableStats ?? []).map((row) => Number(row.bytes ?? 0)));
  const maxFamilyRows = Math.max(0, ...(snapshot?.familyRows ?? []).map((row) => Number(row.rows ?? 0)));
  const maxYearRows = Math.max(0, ...(snapshot?.yearRows ?? []).map((row) => Number(row.rows ?? 0)));
  const maxModelRows = Math.max(0, ...(snapshot?.modelRows ?? []).map((row) => Number(row.rows ?? 0)));
  const minYear = snapshot?.yearsRange?.min_year ?? "—";
  const maxYear = snapshot?.yearsRange?.max_year ?? "—";
  const yearSpanText = `${minYear}–${maxYear}`;

  const heroActions = variant === "admin" ? (
    <>
      <Link className="db-btn" href="/admin/fitment">OPEN FITMENT EDITOR</Link>
      <Link className="db-btn" href="/admin/products">OPEN PRODUCTS</Link>
      <Link className="db-btn" href="/admin/catalog">OPEN CATALOG</Link>
    </>
  ) : (
    <>
      <Link className="db-btn" href="/browse">BROWSE CATALOG</Link>
      <Link className="db-btn" href="/models">MODEL PAGES</Link>
    </>
  );

  return (
    <div className={variant === "admin" ? "db-wrap db-admin" : "db-wrap"}>
      <style>{css}</style>
      <div className="db-shell">
        <section className="db-hero">
          <div>
            <div className="db-kicker">
              {variant === "admin" ? "LIVE DATABASE SNAPSHOT · HETZNER POSTGRES" : "PUBLIC CATALOG SNAPSHOT"}
            </div>
            <div className="db-title">
              {variant === "admin" ? <>DATABASE <span>BREAKDOWN</span></> : <>CATALOG <span>SNAPSHOT</span></>}
            </div>
            <div className="db-subtitle">
              {variant === "admin"
                ? "A concise view of the live catalog with fitment treated as the primary signal. The layout emphasizes what has coverage, what dominates the rebuild, and where the internal data footprint lives."
                : "A public-friendly view of the live catalog, centered on fitment coverage, source mix, and the model-year ranges that matter to riders browsing the store."}
            </div>
            <div className="db-actions">
              {heroActions}
            </div>
          </div>

          <div className="hero-side">
            <Gauge
              value={fitmentCoverage.toFixed(1)}
              label="FITMENT COVERAGE"
              note={`${formatNumber(productsWithFitment)} of ${formatNumber(totalProducts)} products carry fitment`}
            />
            <div className="gauge-metadata">
              <div className="mini-metric">
                <div className="mini-label">FITMENT ROWS</div>
                <div className="mini-value">{formatNumber(fitmentRows)}</div>
                <div className="mini-note">Rows currently linked through catalog_fitment_v2</div>
              </div>
              <div className="mini-metric">
                <div className="mini-label">YEAR RANGE</div>
                <div className="mini-value">{yearSpanText}</div>
                <div className="mini-note">Coverage span across Harley model years</div>
              </div>
            </div>
          </div>
        </section>

        <div className="db-grid">
          <MetricCard
            label="TOTAL PRODUCTS"
            value={formatNumber(totalProducts)}
            note={`${formatNumber(activeProducts)} active`}
          />
          <MetricCard
            label="FITMENT ROWS"
            value={formatNumber(fitmentRows)}
            note={`${formatNumber(productsWithFitment)} products with fitment`}
          />
          <MetricCard
            label="FITMENT COVERAGE"
            value={`${fitmentCoverage.toFixed(1)}%`}
            note="Products with at least one fitment row"
          />
          <MetricCard
            label="OEM CROSSREF"
            value={formatNumber(productsWithOem)}
            note="Products with OEM reference data"
          />
        </div>

        <div className="db-grid">
          <section className="panel panel-wide">
            <div className="panel-head">
              <div>
                <div className="panel-title">FITMENT <span>OVERVIEW</span></div>
                <div className="panel-subtitle">
                  The fitment signal is easier to read as a coverage chart than as a table of rows.
                </div>
              </div>
              <div className="panel-meta">
                {formatNumber(productsWithFitment)} PRODUCTS<br />
                {formatNumber(fitmentRows)} ROWS
              </div>
            </div>

            <div className="fitment-board">
              <div className="fitment-card">
                <div className="detail-grid">
                  <div className="detail-chip">
                    <div className="detail-chip-label">PRODUCT COVERAGE</div>
                    <div className="detail-chip-value">{fitmentCoverage.toFixed(1)}%</div>
                    <div className="detail-chip-note">Share of the live catalog with at least one fitment row.</div>
                  </div>
                  <div className="detail-chip">
                    <div className="detail-chip-label">FITMENT DENSITY</div>
                    <div className="detail-chip-value">{avgRowsPerFitmentProduct.toFixed(1)}</div>
                    <div className="detail-chip-note">Average fitment rows per fitted product.</div>
                  </div>
                  <div className="detail-chip">
                    <div className="detail-chip-label">YEAR SPAN</div>
                    <div className="detail-chip-value">{yearSpanText}</div>
                    <div className="detail-chip-note">Earliest to latest model year represented.</div>
                  </div>
                  <div className="detail-chip">
                    <div className="detail-chip-label">SOURCE MIX</div>
                    <div className="detail-chip-value">{snapshot?.vendorRows?.length ?? 0}</div>
                    <div className="detail-chip-note">Active vendor sources in the live catalog.</div>
                  </div>
                </div>
                <div className="footnote">
                  This page intentionally favors aggregate visualization over row-level detail so the fitment signal is easier to scan.
                </div>
              </div>

              <div className="fitment-card">
                <SourceStack rows={snapshot?.vendorRows ?? []} total={totalProducts} />
                <div className="small-print">
                  WPS, PU, and VTWIN make up the live source mix. The bar below shows each source&apos;s share of the current catalog.
                </div>
                <div style={{ marginTop: 16 }} className="bar-list">
                  <BarRow
                    label="Fitment coverage"
                    value={fitmentCoverage}
                    total={100}
                    note={`${fitmentCoverage.toFixed(1)}% of catalog`}
                    tone="gold"
                  />
                  <BarRow
                    label="Products with OEM crossref"
                    value={productsWithOem}
                    total={totalProducts}
                    note={`${percent(productsWithOem, totalProducts)}% of catalog`}
                    tone="blue"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="db-grid">
          <section className="panel panel-half">
            <div className="panel-head">
              <div>
                <div className="panel-title">TOP <span>FAMILIES</span></div>
                <div className="panel-subtitle">
                  Fitment rows grouped by Harley family.
                </div>
              </div>
              <div className="panel-meta">
                TOP 10<br />
                BY FITMENT ROWS
              </div>
            </div>
            <div className="bar-list">
              {(snapshot?.familyRows ?? []).map((row) => (
                <BarRow
                  key={row.family}
                  label={row.family}
                  value={Number(row.rows)}
                  total={maxFamilyRows}
                  note={`${formatNumber(row.rows)} rows · ${formatNumber(row.products)} products`}
                  tone="gold"
                />
              ))}
            </div>
          </section>

          <section className="panel panel-half">
            <div className="panel-head">
              <div>
                <div className="panel-title">TOP <span>MODELS</span></div>
                <div className="panel-subtitle">
                  The model codes that account for the most fitment rows.
                </div>
              </div>
              <div className="panel-meta">
                TOP 10<br />
                BY ROW COUNT
              </div>
            </div>
            <div className="bar-list">
              {(snapshot?.modelRows ?? []).map((row) => (
                <BarRow
                  key={`${row.family}-${row.model_code}`}
                  label={`${row.model_code} · ${row.family}`}
                  value={Number(row.rows)}
                  total={maxModelRows}
                  note={`${formatNumber(row.rows)} rows`}
                  tone="orange"
                />
              ))}
            </div>
          </section>
        </div>

        <div className="db-grid">
          <section className="panel panel-wide">
            <div className="panel-head">
              <div>
                <div className="panel-title">MODEL <span>YEARS</span></div>
                <div className="panel-subtitle">
                  Newest years first. This acts like a histogram of where the fitment data is concentrated.
                </div>
              </div>
              <div className="panel-meta">
                {minYear} → {maxYear}<br />
                TOP 20 YEARS
              </div>
            </div>
            <div className="bar-list">
              {(snapshot?.yearRows ?? []).map((row) => (
                <BarRow
                  key={row.year}
                  label={String(row.year)}
                  value={Number(row.rows)}
                  total={maxYearRows}
                  note={`${formatNumber(row.rows)} rows`}
                  tone="blue"
                />
              ))}
            </div>
          </section>
        </div>

        {variant === "admin" && Array.isArray(snapshot?.tableStats) && snapshot.tableStats.length > 0 && (
          <div className="admin-footprint">
            <div className="db-grid">
              <section className="panel panel-wide">
                <div className="panel-head">
                  <div>
                    <div className="panel-title">DATABASE <span>FOOTPRINT</span></div>
                    <div className="panel-subtitle">
                      Internal table footprint, sorted by disk usage.
                    </div>
                  </div>
                  <div className="panel-meta">
                    {formatNumber(snapshot.tableStats.length)} TABLES<br />
                    INTERNAL VIEW
                  </div>
                </div>
                <div className="bar-list">
                  {snapshot.tableStats.slice(0, 10).map((row) => (
                    <BarRow
                      key={row.table}
                      label={row.table}
                      value={Number(row.bytes)}
                      total={maxTableBytes}
                      note={`${formatNumber(row.rows)} rows · ${formatBytes(row.bytes)}`}
                      tone={row.table === "catalog_fitment_v2" ? "gold" : "orange"}
                    />
                  ))}
                </div>
                <div className="footnote">
                  This panel remains internal-only. The public page intentionally omits table names and disk sizes.
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
