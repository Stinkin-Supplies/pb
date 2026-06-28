import Link from "next/link";
import { getCatalogDb } from "@/lib/db/catalog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Categories | Stinkin' Supplies",
  description: "Browse the unified catalog by category and subcategory.",
};

const CATEGORY_META = [
  { label: "Engine", description: "Cams, pistons, gaskets, heads, and complete engines." },
  { label: "Transmission & Clutch", description: "Clutch packs, primary drive, belts, chains, and internals." },
  { label: "Exhaust", description: "Headers, mufflers, slip-ons, heat shields, and full systems." },
  { label: "Brakes", description: "Pads, rotors, lines, calipers, and master cylinders." },
  { label: "Electrical", description: "Ignition, charging, wiring, batteries, and switches." },
  { label: "Handlebar & Controls", description: "Bars, levers, grips, cables, risers, and controls." },
  { label: "Carburetion & Fuel", description: "Air cleaners, carbs, jets, fuel delivery, and intake parts." },
  { label: "Foot Controls", description: "Footpegs, shifters, floorboards, kickstands, and pegs." },
  { label: "Lighting", description: "Headlights, taillights, turn signals, bulbs, and mounts." },
  { label: "Suspension", description: "Shocks, forks, springs, triple trees, and lowering parts." },
  { label: "Wheels & Tires", description: "Wheels, hubs, spokes, bearings, tires, tubes, and axles." },
  { label: "Fenders & Body", description: "Fenders, fairings, gas tanks, trim, and bodywork." },
  { label: "Seating", description: "Seats, pads, springs, hardware, and backrests." },
  { label: "Frame & Hardware", description: "Frames, mounts, fasteners, skid plates, and protection." },
  { label: "Instrumentation", description: "Speedometers, gauges, dash trim, and mounting hardware." },
  { label: "Luggage & Racks", description: "Sissy bars, racks, saddlebags, and touring storage." },
  { label: "Security & Covers", description: "Locks, alarms, bike covers, shelters, and storage." },
  { label: "Oils & Chemicals", description: "Fluids, lubricants, cleaners, and maintenance supplies." },
  { label: "Tools & Chemicals", description: "Service tools, shop chemicals, and detailing supplies." },
  { label: "Riding Gear & Apparel", description: "Helmets, gloves, jackets, footwear, and riding gear." },
  { label: "Accessories & Misc", description: "Manuals, decals, towing, tie-downs, and misc extras." },
];

const CATEGORY_ALIASES = new Map([
  ["handlebars & controls", "Handlebar & Controls"],
  ["handlebar controls", "Handlebar & Controls"],
  ["fuel systems", "Carburetion & Fuel"],
  ["carburetion & fuel system", "Carburetion & Fuel"],
  ["body & fenders", "Fenders & Body"],
  ["fenders & body", "Fenders & Body"],
  ["seats", "Seating"],
  ["seating", "Seating"],
  ["drivetrain", "Transmission & Clutch"],
  ["frame & chassis", "Frame & Hardware"],
  ["wheels/tires", "Wheels & Tires"],
  ["wheels & wheel components", "Wheels & Tires"],
  ["tools", "Tools & Chemicals"],
  ["apparel & helmets", "Riding Gear & Apparel"],
  ["miscellaneous", "Accessories & Misc"],
]);

function canonicalCategoryLabel(label) {
  const key = String(label ?? "").trim().toLowerCase();
  return CATEGORY_ALIASES.get(key) ?? label;
}

function buildBrowseHref(category, subcategory) {
  const params = new URLSearchParams();
  params.set("display_category", category);
  if (subcategory && subcategory !== "(General)") params.set("display_subcategory", subcategory);
  return `/browse?${params.toString()}`;
}

function buildBrowseCategoryHref(category) {
  const params = new URLSearchParams({ display_category: category });
  return `/browse?${params.toString()}`;
}

async function loadCategoryData() {
  const db = getCatalogDb();

  const [statsRes, breakdownRes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(DISTINCT display_category) FILTER (WHERE COALESCE(NULLIF(TRIM(display_category), ''), '') <> '')::int AS category_count,
        COUNT(DISTINCT display_subcategory) FILTER (WHERE COALESCE(NULLIF(TRIM(display_subcategory), ''), '') <> '')::int AS subcategory_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(display_category), ''), '') = '')::int AS uncategorized_count
      FROM catalog_unified
      WHERE is_active = true
    `),
    db.query(`
      SELECT
        COALESCE(NULLIF(TRIM(display_category), ''), 'Uncategorized') AS display_category,
        COALESCE(NULLIF(TRIM(display_subcategory), ''), '(General)') AS display_subcategory,
        COUNT(*)::int AS count
      FROM catalog_unified
      WHERE is_active = true
        AND COALESCE(NULLIF(TRIM(display_category), ''), '') <> ''
      GROUP BY 1, 2
      ORDER BY 1, count DESC, 2 ASC
    `),
  ]);

  const stats = statsRes.rows[0] ?? {
    total_products: 0,
    category_count: 0,
    subcategory_count: 0,
    uncategorized_count: 0,
  };

  const buckets = new Map();
  for (const row of breakdownRes.rows) {
    const label = canonicalCategoryLabel(row.display_category);
    if (!buckets.has(label)) {
      buckets.set(label, {
        label,
        count: 0,
        subcategories: [],
      });
    }
    const bucket = buckets.get(label);
    bucket.count += Number(row.count ?? 0);
    bucket.subcategories.push({
      name: row.display_subcategory,
      count: Number(row.count ?? 0),
    });
  }

  const ordered = [];
  for (const meta of CATEGORY_META) {
    const bucket = buckets.get(meta.label);
    if (!bucket) continue;
    ordered.push({
      ...meta,
      count: bucket.count,
      subcategories: bucket.subcategories,
    });
    buckets.delete(meta.label);
  }

  const leftovers = Array.from(buckets.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  for (const bucket of leftovers) {
    ordered.push({
      label: bucket.label,
      description: "Legacy or uncategorized taxonomy bucket.",
      count: bucket.count,
      subcategories: bucket.subcategories,
    });
  }

  return { stats, categories: ordered };
}

function StatCard({ label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

function CategoryGroup({ category }) {
  const subcategories = [...(category.subcategories ?? [])].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );

  return (
    <article className="category-group">
      <div className="category-kicker">Live category</div>
      <h2 className="category-title">{category.label}</h2>
      <div className="category-summary">
        {category.count.toLocaleString()} products
      </div>
      <p className="category-description">{category.description}</p>

      <div className="subcategory-list">
        {subcategories.map((sub) => (
          <Link
            key={`${category.label}:${sub.name}`}
            href={buildBrowseHref(category.label, sub.name)}
            className="subcategory-row"
          >
            <span className="subcategory-name">{sub.name}</span>
            <span className="subcategory-count">{sub.count.toLocaleString()}</span>
          </Link>
        ))}
      </div>

      <div className="category-footer">
        <Link href={buildBrowseCategoryHref(category.label)} className="browse-link">
          Browse category
        </Link>
      </div>
    </article>
  );
}

export default async function CategoriesPage() {
  let data;
  try {
    data = await loadCategoryData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load category data";
    return (
      <main className="page">
        <style>{styles}</style>
        <section className="hero">
          <div className="hero-inner">
            <div className="eyebrow">Live catalog</div>
            <h1>Categories</h1>
            <p className="hero-copy">
              The category page could not load right now.
            </p>
            <div className="hero-error">{message}</div>
            <div className="hero-actions">
              <Link href="/browse" className="primary-link">Browse all parts</Link>
              <Link href="/" className="secondary-link">Home</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const { stats, categories } = data;

  return (
    <main className="page">
      <style>{styles}</style>

      <section className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Unified catalog</div>
          <h1>Categories</h1>
          <p className="hero-copy">
            A live breakdown of the catalog by category and subcategory. Click any
            section to jump straight into the browse grid.
          </p>

          <div className="hero-actions">
            <Link href="/browse" className="primary-link">Browse all parts</Link>
            <Link href="/models" className="secondary-link">Shop by model</Link>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Active products"
              value={Number(stats.total_products ?? 0).toLocaleString()}
              note="Pulled from catalog_unified"
            />
            <StatCard
              label="Categories"
              value={Number(stats.category_count ?? 0).toLocaleString()}
              note="Live display_category values"
            />
            <StatCard
              label="Subcategories"
              value={Number(stats.subcategory_count ?? 0).toLocaleString()}
              note="Live display_subcategory values"
            />
            <StatCard
              label="Uncategorized"
              value={Number(stats.uncategorized_count ?? 0).toLocaleString()}
              note="Products still waiting for taxonomy"
            />
          </div>
        </div>
      </section>

      <section className="content">
        <div className="section-head">
          <div>
            <div className="section-kicker">Browse by category</div>
            <div className="section-title">Category breakdown</div>
          </div>
          <div className="section-note">Click a category or subcategory to jump into the browse grid.</div>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <CategoryGroup key={category.label} category={category} />
          ))}
        </div>
      </section>
    </main>
  );
}

const styles = `
  :root {
    --gold: #b8922a;
    --gold-soft: rgba(184,146,42,0.12);
    --gold-border: rgba(184,146,42,0.25);
    --cream: #faf7f2;
    --cream-2: #f2ede4;
    --dark: #0a0909;
    --ink: #17130d;
    --muted: #7e6f56;
  }

  * { box-sizing: border-box; }

  .page {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(184,146,42,0.10), transparent 28%),
      radial-gradient(circle at top right, rgba(184,146,42,0.08), transparent 22%),
      linear-gradient(180deg, #0f0d0b 0 320px, var(--cream) 320px 100%);
    color: var(--ink);
  }

  .hero {
    padding: clamp(28px, 4vw, 48px) clamp(18px, 4vw, 40px) 28px;
  }

  .hero-inner {
    max-width: 1280px;
    margin: 0 auto;
    background: linear-gradient(180deg, rgba(18,15,12,0.98), rgba(10,9,9,0.92));
    color: #f6f0e6;
    border: 1px solid rgba(184,146,42,0.16);
    border-radius: 22px;
    padding: clamp(24px, 4vw, 40px);
    box-shadow: 0 20px 70px rgba(0,0,0,0.22);
  }

  .eyebrow,
  .section-kicker,
  .category-kicker {
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--gold);
  }

  h1 {
    margin: 12px 0 12px;
    font-family: var(--font-bespoke, serif);
    font-size: clamp(44px, 8vw, 92px);
    line-height: 0.92;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .hero-copy {
    max-width: 760px;
    margin: 0;
    font-family: var(--font-stencil, monospace);
    font-size: 11px;
    line-height: 1.8;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(246,240,230,0.72);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
  }

  .primary-link,
  .secondary-link,
  .browse-link {
    text-decoration: none;
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 11px 16px;
    transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .primary-link {
    background: var(--gold);
    border: 1px solid var(--gold);
    color: #fff;
  }

  .secondary-link {
    background: transparent;
    border: 1px solid rgba(246,240,230,0.18);
    color: rgba(246,240,230,0.78);
  }

  .browse-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(184,146,42,0.08);
    border: 1px solid rgba(184,146,42,0.22);
    color: var(--gold);
    width: 100%;
  }

  .primary-link:hover,
  .secondary-link:hover,
  .browse-link:hover {
    transform: translateY(-1px);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-top: 24px;
  }

  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(184,146,42,0.16);
    border-radius: 16px;
    padding: 16px;
    min-height: 100px;
  }

  .stat-label {
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(246,240,230,0.54);
  }

  .stat-value {
    margin-top: 10px;
    font-family: var(--font-bespoke, serif);
    font-size: clamp(28px, 4vw, 48px);
    line-height: 1;
    color: #fff;
  }

  .stat-note {
    margin-top: 10px;
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(246,240,230,0.55);
  }

  .content {
    max-width: 1280px;
    margin: 0 auto;
    padding: 10px clamp(18px, 4vw, 40px) 48px;
  }

  .section-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }

  .section-title {
    margin-top: 6px;
    font-family: var(--font-bespoke, serif);
    font-size: clamp(30px, 4vw, 46px);
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1;
  }

  .section-note {
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 26px 22px;
  }

  .category-group {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 100%;
    padding: 4px 2px 8px;
    overflow: hidden;
  }

  .category-title {
    margin: 6px 0 0;
    font-family: var(--font-bespoke, serif);
    font-size: 28px;
    line-height: 0.92;
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .category-summary {
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(23,19,13,0.52);
  }

  .category-description {
    margin: 0;
    font-family: var(--font-stencil, monospace);
    font-size: 10px;
    line-height: 1.8;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .subcategory-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .subcategory-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-decoration: none;
    color: var(--ink);
    padding: 4px 0;
    border-radius: 0;
    border-bottom: 1px solid rgba(184,146,42,0.10);
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .subcategory-row:hover {
    border-color: rgba(184,146,42,0.38);
  }

  .subcategory-name {
    font-family: var(--font-stencil, monospace);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.4;
  }

  .subcategory-count {
    flex-shrink: 0;
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(23,19,13,0.55);
  }

  .more-line {
    margin-top: -2px;
    font-family: var(--font-stencil, monospace);
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(23,19,13,0.45);
  }

  .category-footer {
    margin-top: auto;
    padding-top: 8px;
  }

  .hero-error {
    margin-top: 14px;
    font-family: var(--font-stencil, monospace);
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ffb9b9;
  }

  @media (max-width: 900px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .hero {
      padding-left: 14px;
      padding-right: 14px;
    }

    .content {
      padding-left: 14px;
      padding-right: 14px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .category-grid {
      grid-template-columns: 1fr;
    }
  }
`;
