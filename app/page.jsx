import Link from "next/link";
import NavBar from "@/components/NavBar";

const css = `
  .home-wrap {
    min-height: 100vh;
    background: #0a0909;
    color: #f0ebe3;
    font-family: var(--font-stencil), sans-serif;
  }
  .home-hero {
    max-width: 1100px;
    margin: 0 auto;
    padding: 72px 24px 48px;
  }
  .home-eyebrow {
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: #e8621a;
    margin-bottom: 14px;
  }
  .home-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: clamp(52px, 7vw, 92px);
    line-height: 0.95;
    letter-spacing: 0.03em;
    margin-bottom: 14px;
  }
  .home-sub {
    color: #8a8784;
    max-width: 60ch;
    line-height: 1.5;
    margin-bottom: 26px;
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 46px;
    padding: 0 22px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 0.1em;
    font-family: var(--font-caesar), sans-serif;
    font-size: 18px;
    transition: all 0.2s;
  }
  .btn-primary {
    background: #e8621a;
    color: #0a0909;
    box-shadow: 0 4px 24px rgba(232, 98, 26, 0.25);
  }
  .btn-primary:hover {
    background: #c94f0f;
    transform: translateY(-1px);
  }
  .btn-outline {
    border: 1px solid #2a2828;
    color: #f0ebe3;
    background: transparent;
  }
  .btn-outline:hover {
    border-color: rgba(232, 98, 26, 0.5);
    color: #e8621a;
  }
  .home-grid {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px 72px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tile {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 2px;
    padding: 18px;
    text-decoration: none;
    color: #f0ebe3;
    transition: border-color 0.2s, background 0.2s;
  }
  .tile:hover {
    border-color: rgba(232, 98, 26, 0.5);
    background: rgba(232, 98, 26, 0.05);
  }
  .tile-kicker {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.18em;
    color: #8a8784;
    margin-bottom: 8px;
  }
  .tile-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 18px;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }
  .tile-body {
    font-size: 13px;
    line-height: 1.45;
    color: #8a8784;
  }
  @media (max-width: 900px) {
    .home-grid { grid-template-columns: 1fr; }
  }
`;

export default function HomePage() {
  return (
    <div className="home-wrap">
      <style>{css}</style>
      <NavBar activePage="home" />

      <section className="home-hero">
        <div className="home-eyebrow">PARTS & ACCESSORIES</div>
        <h1 className="home-title">STINKIN&apos; SUPPLIES</h1>
        <p className="home-sub">
          Shop curated parts, gear, and upgrades. Find what fits, check stock, and get it shipped fast.
        </p>
        <div className="home-actions">
          <Link className="btn btn-primary" href="/shop">SHOP NOW</Link>
          <Link className="btn btn-outline" href="/brands">BROWSE BRANDS</Link>
        </div>
      </section>

      <section className="home-grid">
        <Link className="tile" href="/shop">
          <div className="tile-kicker">CATALOG</div>
          <div className="tile-title">Shop All Products</div>
          <div className="tile-body">Search by category, brand, and availability.</div>
        </Link>
        <Link className="tile" href="/search">
          <div className="tile-kicker">SEARCH</div>
          <div className="tile-title">Find By Keyword</div>
          <div className="tile-body">Quick search across the catalog.</div>
        </Link>
        <Link className="tile" href="/garage">
          <div className="tile-kicker">FITMENT</div>
          <div className="tile-title">Your Garage</div>
          <div className="tile-body">Save vehicles and check compatibility.</div>
        </Link>
      </section>
    </div>
  );
}

