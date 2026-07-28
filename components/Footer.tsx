import Link from "next/link";

// ── Corner registration mark ──────────────────────────────────────────────────
// L-shaped bracket in each corner — blueprint / technical drawing aesthetic
function CornerMark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const SIZE = 18;
  const WEIGHT = 1.5;
  const COLOR = "rgba(197,167,34,0.30)";

  const style: React.CSSProperties = {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    pointerEvents: "none",
    borderColor: COLOR,
    borderStyle: "solid",
    borderWidth: 0,
  };

  if (pos === "tl") { style.top = 20; style.left = 20; style.borderTopWidth = WEIGHT; style.borderLeftWidth = WEIGHT; }
  if (pos === "tr") { style.top = 20; style.right = 20; style.borderTopWidth = WEIGHT; style.borderRightWidth = WEIGHT; }
  if (pos === "bl") { style.bottom = 20; style.left = 20; style.borderBottomWidth = WEIGHT; style.borderLeftWidth = WEIGHT; }
  if (pos === "br") { style.bottom = 20; style.right = 20; style.borderBottomWidth = WEIGHT; style.borderRightWidth = WEIGHT; }

  return <span aria-hidden="true" style={style} />;
}

// ── Link column ───────────────────────────────────────────────────────────────
function FooterCol({ title, links }: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      {/* Column header */}
      <div style={{
        fontFamily: "var(--font-stencil), monospace",
        fontSize: 9,
        letterSpacing: "0.18em",
        color: "rgba(197,167,34,0.55)",
        textTransform: "uppercase",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ width: 4, height: 4, background: "rgba(197,167,34,0.40)", flexShrink: 0, display: "inline-block" }} />
        {title}
      </div>

      {/* Links */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {links.map(({ label, href, external }) => (
          <li key={label}>
            {external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-body), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#a09890",
                  textDecoration: "none",
                  transition: "color 0.12s",
                  display: "inline-block",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f0e8d8"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#a09890"; }}
              >
                {label}
              </a>
            ) : (
              <Link
                href={href}
                style={{
                  fontFamily: "var(--font-body), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#a09890",
                  textDecoration: "none",
                  transition: "color 0.12s",
                  display: "inline-block",
                }}
              >
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Footer() {
  const year = new Date().getFullYear();
  const rev  = `${year}.${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <footer style={{ background: "var(--coal)", position: "relative" }}>

      {/* ── Blueprint grid texture ── */}
      <div aria-hidden="true" style={{
        position: "absolute",
        inset: 0,
        backgroundImage: [
          "linear-gradient(rgba(61,90,122,0.04) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(61,90,122,0.04) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }} />

      {/* ── Top rule ── */}
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(197,167,34,0.35) 20%, rgba(197,167,34,0.35) 80%, transparent)" }} />

      {/* ── Corner registration marks ── */}
      <CornerMark pos="tl" />
      <CornerMark pos="tr" />
      <CornerMark pos="bl" />
      <CornerMark pos="br" />

      {/* ── Main body ── */}
      <div style={{
        position: "relative",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "56px clamp(20px, 4vw, 48px) 48px",
      }}>

        {/* ── Section ident ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 48,
        }}>
          <span style={{ flex: 1, height: 1, background: "rgba(197,167,34,0.15)" }} />
          <span style={{
            fontFamily: "var(--font-stencil), monospace",
            fontSize: 8,
            letterSpacing: "0.18em",
            color: "rgba(197,167,34,0.30)",
            textTransform: "uppercase",
          }}>
            STINKIN&apos; SUPPLIES · INDEX OF SECTIONS
          </span>
          <span style={{ flex: 1, height: 1, background: "rgba(197,167,34,0.15)" }} />
        </div>

        {/* ── 5-column grid: brand + 4 link cols ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.6fr repeat(4, 1fr)",
          gap: "0 32px",
        }}>

          {/* ── Brand / identity column ── */}
          <div style={{ paddingRight: 32, borderRight: "1px solid rgba(197,167,34,0.10)" }}>

            {/* Logo mark */}
            <div style={{
              fontFamily: "var(--font-tanker), sans-serif",
              fontSize: "clamp(28px, 3vw, 42px)",
              fontWeight: 400,
              color: "#f5f0e8",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              lineHeight: 0.92,
              marginBottom: 14,
              textShadow: "0 1px 0 rgba(255,255,255,0.05), 0 -1px 0 rgba(0,0,0,0.30)",
            }}>
              Stinkin&apos;<br />Supplies
            </div>

            {/* Sub-ident */}
            <div style={{
              fontFamily: "var(--font-stencil), monospace",
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "#8a7040",
              textTransform: "uppercase",
              lineHeight: 1.8,
              marginBottom: 20,
            }}>
              Authorized H-D Aftermarket Parts<br />
              Daytona Beach, FL 32114<br />
              (386) 555-0148
            </div>

            {/* Thin rule */}
            <div style={{ height: 1, background: "rgba(197,167,34,0.14)", marginBottom: 20 }} />

            {/* Tagline */}
            <div style={{
              fontFamily: "var(--font-tanker), sans-serif",
              fontSize: 14,
              color: "rgba(197,167,34,0.45)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              lineHeight: 1.3,
            }}>
              The Right<br />Stinkin&apos; Parts.
            </div>
          </div>

          {/* ── SHOP ── */}
          <FooterCol
            title="Shop"
            links={[
              { label: "Browse Parts",    href: "/browse" },
              { label: "Parts Index",     href: "/#parts-index" },
              { label: "Brands",          href: "/brands" },
              { label: "Deals",           href: "/deals" },
              { label: "Model Shop",      href: "/modelshop" },
            ]}
          />

          {/* ── ACCOUNT ── */}
          <FooterCol
            title="Account"
            links={[
              { label: "My Orders",       href: "/garage?tab=ORDERS" },
              { label: "Points & Rewards",href: "/garage?tab=POINTS" },
              { label: "My Garage",       href: "/garage" },
              { label: "Wishlist",        href: "/garage?tab=WISHLIST" },
              { label: "Sign In",         href: "/auth" },
            ]}
          />

          {/* ── SUPPORT ── */}
          <FooterCol
            title="Support"
            links={[
              { label: "Shipping Policy", href: "/shipping" },
              { label: "Returns",         href: "/returns" },
              { label: "FAQ",             href: "/faq" },
              { label: "Contact Us",      href: "/contact" },
            ]}
          />

          {/* ── COMPANY ── */}
          <FooterCol
            title="Company"
            links={[
              { label: "About",           href: "/about" },
              { label: "Privacy Policy",  href: "/privacy" },
              { label: "Terms of Use",    href: "/terms" },
            ]}
          />
        </div>
      </div>

      {/* ── Colophon divider ── */}
      <div style={{ height: 1, background: "rgba(197,167,34,0.12)", position: "relative" }}>
        {/* Center publication ident — sits on the divider */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "var(--coal)",
          padding: "0 16px",
          fontFamily: "var(--font-stencil), monospace",
          fontSize: 8,
          letterSpacing: "0.16em",
          color: "rgba(197,167,34,0.25)",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        }}>
          PUB. NO. SS-CAT-{year} · REV {rev}
        </div>
      </div>

      {/* ── Colophon strip ── */}
      <div style={{
        position: "relative",
        background: "#080604",
        padding: "16px clamp(20px, 4vw, 48px)",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}>

        {/* SecurityMetrics badge */}
        <a
          href="https://www.securitymetrics.com/site_certificate?id=2500510&tk=b568b8b0ca06df558e9c061cf1b9e540"
          target="_blank"
          rel="noopener noreferrer"
          style={{ flexShrink: 0 }}
        >
          <img
            src="https://www.securitymetrics.com/portal/app/ngsm/assets/img/GreyContent_Credit_Card_Safe_White_Rec.png"
            alt="SecurityMetrics card safe certification"
            style={{ height: 32, width: "auto", background: "#ffffff", padding: "3px 6px" }}
          />
        </a>

        <div style={{ width: 1, height: 24, background: "rgba(197,167,34,0.12)", flexShrink: 0 }} />

        {/* Copyright */}
        <div style={{
          fontFamily: "var(--font-stencil), monospace",
          fontSize: 9,
          letterSpacing: "0.10em",
          color: "#504838",
          textTransform: "uppercase",
          lineHeight: 1.6,
        }}>
          © {year} Stinkin&apos; Supplies LLC · All Rights Reserved
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: 0 }} />

        {/* Trademark disclaimer */}
        <div style={{
          fontFamily: "var(--font-stencil), monospace",
          fontSize: 8,
          letterSpacing: "0.06em",
          color: "#3a3028",
          textTransform: "uppercase",
          lineHeight: 1.6,
          textAlign: "right",
        }}>
          All product names &amp; trademarks are property of their respective owners.<br />
          Used for fitment identification purposes only.
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 900px) {
          footer .ft-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 560px) {
          footer .ft-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
