"use client";

/**
 * /design-system — Visual design system preview
 * Shows all tokens, typography, and components from globals.css.
 * Dev-only reference page. Not linked from the main nav.
 */

import GlowButton from "@/components/ui/GlowButton";

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ id, label, children }) {
  return (
    <section id={id} style={{ marginBottom: 80 }}>
      <div style={{ marginBottom: 32 }}>
        <p className="section-ident" style={{ marginBottom: 10 }}>DESIGN SYSTEM · REFERENCE</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
          <span className="accent-bar" />
          <h2 className="section-title" style={{ fontSize: "var(--text-2xl)" }}>{label}</h2>
        </div>
        <hr className="rule-gold" style={{ marginTop: 16 }} />
      </div>
      {children}
    </section>
  );
}

// ── Color swatch ───────────────────────────────────────────────────────────
function Swatch({ varName, label, onDark = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 120 }}>
      <div
        style={{
          width: "100%",
          height: 64,
          background: `var(${varName})`,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
      <div>
        <p className="data-label" style={{ marginBottom: 2 }}>{label}</p>
        <p className="spec-code" style={{ fontSize: "var(--text-2xs)" }}>{varName}</p>
      </div>
    </div>
  );
}

// ── Type specimen ──────────────────────────────────────────────────────────
function TypeSpecimen({ fontClass, fontLabel, sample, size = "var(--text-xl)", weight = 400, extraStyle = {} }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid var(--steel)" }}>
      <p className="data-label" style={{ marginBottom: 10 }}>{fontLabel}</p>
      <p
        className={fontClass}
        style={{ fontSize: size, fontWeight: weight, lineHeight: "var(--leading-tight)", ...extraStyle }}
      >
        {sample}
      </p>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div style={{ background: "var(--coal)", minHeight: "100vh", paddingTop: 80, paddingBottom: 120 }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div
        className="blueprint-bg"
        style={{ padding: "64px 0 48px", marginBottom: 64, borderBottom: "1px solid var(--steel)" }}
      >
        <div className="container">
          <p className="section-ident" style={{ marginBottom: 16 }}>
            STINKIN&apos; SUPPLIES · DESIGN SYSTEM · REV 1.0 · 2026
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: "var(--text-5xl)",
              letterSpacing: "var(--tracking-tight)",
              textTransform: "uppercase",
              lineHeight: "var(--leading-tight)",
              color: "var(--cream-light)",
              marginBottom: 16,
            }}
          >
            Design<br />Reference
          </h1>
          <p
            className="font-editorial"
            style={{ fontSize: "var(--text-lg)", color: "var(--silver)", fontWeight: 300, maxWidth: 480 }}
          >
            Factory documentation · Technical manuals · Brass data plates
          </p>

          {/* TOC as spec table */}
          <div style={{ marginTop: 40, maxWidth: 480 }}>
            <dl className="spec-table">
              {[
                ["Document",  "Design System Reference"],
                ["Version",   "1.0"],
                ["Status",    "In Progress"],
                ["Sections",  "Colors · Typography · Labels · Rules · Stamps · Buttons · Forms · Receipt"],
              ].map(([label, value]) => (
                <div className="spec-row" key={label}>
                  <dt className="spec-row-label">{label}</dt>
                  <dd className="spec-row-value">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="container">

        {/* ══════════════════════════════════════════════════════════════════
            01 · COLORS
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="colors" label="01 · Colors">

          <p className="data-label" style={{ marginBottom: 16 }}>Dark Scale</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20, marginBottom: 48 }}>
            <Swatch varName="--black"  label="Black" />
            <Swatch varName="--coal"   label="Coal" />
            <Swatch varName="--iron"   label="Iron" />
            <Swatch varName="--steel"  label="Steel" />
            <Swatch varName="--steel2" label="Steel 2" />
            <Swatch varName="--oil"    label="Oil" />
          </div>

          <p className="data-label" style={{ marginBottom: 16 }}>Cream / Paper Scale</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20, marginBottom: 48 }}>
            <Swatch varName="--cream-light" label="Cream Light" />
            <Swatch varName="--cream"       label="Cream" />
            <Swatch varName="--parchment"   label="Parchment" />
            <Swatch varName="--cream-dark"  label="Cream Dark" />
          </div>

          <p className="data-label" style={{ marginBottom: 16 }}>Metal / Neutral Scale</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20, marginBottom: 48 }}>
            <Swatch varName="--silver" label="Silver" />
            <Swatch varName="--chrome" label="Chrome" />
            <Swatch varName="--fog"    label="Fog" />
          </div>

          <p className="data-label" style={{ marginBottom: 16 }}>Gold / Brass Scale</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20, marginBottom: 48 }}>
            <Swatch varName="--gold-bright" label="Gold Bright" />
            <Swatch varName="--gold"        label="Gold" />
            <Swatch varName="--gold-dim"    label="Gold Dim" />
          </div>

          <p className="data-label" style={{ marginBottom: 16 }}>Blueprint Accent (use sparingly)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20, marginBottom: 48 }}>
            <Swatch varName="--blueprint" label="Blueprint" />
          </div>

          <p className="data-label" style={{ marginBottom: 16 }}>Status</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 20 }}>
            <Swatch varName="--red"          label="Red" />
            <Swatch varName="--red-bright"   label="Red Bright" />
            <Swatch varName="--green"        label="Green" />
            <Swatch varName="--green-bright" label="Green Bright" />
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            02 · TYPOGRAPHY
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="typography" label="02 · Typography">

          <TypeSpecimen
            fontClass="font-display"
            fontLabel="Tanker — Display / Part Names / Era Headers"
            sample="KNUCKLEHEAD REBUILD"
            size="var(--text-4xl)"
            extraStyle={{ textTransform: "uppercase", letterSpacing: "var(--tracking-tight)" }}
          />
          <TypeSpecimen
            fontClass="font-display"
            fontLabel="Tanker — Section Heading"
            sample="ENGINE COMPONENTS"
            size="var(--text-3xl)"
            extraStyle={{ textTransform: "uppercase", letterSpacing: "var(--tracking-tight)" }}
          />
          <TypeSpecimen
            fontClass="font-display"
            fontLabel="Tanker — Card Title"
            sample="S&S CYCLE SUPER E CARB KIT"
            size="var(--text-xl)"
            extraStyle={{ textTransform: "uppercase" }}
          />

          <TypeSpecimen
            fontClass="font-editorial"
            fontLabel="Bespoke Serif — Editorial Callout (300)"
            sample="Precision engineered for the open road."
            size="var(--text-2xl)"
            weight={300}
          />
          <TypeSpecimen
            fontClass="font-editorial"
            fontLabel="Bespoke Serif — Section Subtitle (400)"
            sample="Complete engine rebuild components for Knucklehead, Panhead, and Shovelhead."
            size="var(--text-lg)"
            weight={400}
          />

          <TypeSpecimen
            fontClass="font-body"
            fontLabel="Barlow — Body Copy (400)"
            sample="Direct replacement for OEM part 17517-66. Fits all Big Twin models 1966–1984. Includes all necessary hardware. Machined to original factory tolerances from 4140 chromoly steel."
            size="var(--text-base)"
            weight={400}
            extraStyle={{ maxWidth: 560, lineHeight: "var(--leading-relaxed)" }}
          />
          <TypeSpecimen
            fontClass="font-body"
            fontLabel="Barlow — UI Label (600)"
            sample="Add to Cart · View Fitment · Compare"
            size="var(--text-sm)"
            weight={600}
          />

          <TypeSpecimen
            fontClass="font-mono"
            fontLabel="Share Tech Mono — SKU / OEM# / Data"
            sample="DS-196251 · OEM 17517-66 · 1966–1984"
            size="var(--text-sm)"
            extraStyle={{ color: "var(--gold)", letterSpacing: "var(--tracking-wide)" }}
          />
          <TypeSpecimen
            fontClass="font-mono"
            fontLabel="Share Tech Mono — Data Label"
            sample="PART NUMBER · YEAR RANGE · IN STOCK"
            size="var(--text-xs)"
            extraStyle={{ color: "var(--chrome)", letterSpacing: "var(--tracking-stamp)", textTransform: "uppercase" }}
          />

          {/* Type scale reference */}
          <p className="data-label" style={{ marginBottom: 20 }}>Type Scale Reference</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["--text-2xs", "9.6px",  "Micro stamps, registration marks"],
              ["--text-xs",  "11.0px", "Data labels, column headers, buttons"],
              ["--text-sm",  "13.0px", "Secondary data, captions, spec values"],
              ["--text-base","15.0px", "Body copy"],
              ["--text-md",  "17.0px", "Standard UI prose"],
              ["--text-lg",  "20.0px", "Card titles, callouts"],
              ["--text-xl",  "24.0px", "Section subheadings"],
              ["--text-2xl", "30.0px", "Section headings"],
              ["--text-3xl", "38.0px", "Page headings"],
              ["--text-4xl", "52.0px", "Hero display"],
              ["--text-5xl", "72.0px", "Large display / era headers"],
            ].map(([token, px, use]) => (
              <div
                key={token}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 60px 1fr",
                  alignItems: "baseline",
                  borderBottom: "1px solid var(--steel)",
                  paddingBottom: 10,
                  gap: 16,
                }}
              >
                <span className="spec-code" style={{ fontSize: "var(--text-xs)" }}>{token}</span>
                <span className="data-label">{px}</span>
                <span className="font-body" style={{ fontSize: `var(${token})`, lineHeight: 1.1, color: "var(--cream)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {use}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            03 · DATA LABELS & SPEC CODES
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="labels" label="03 · Data Labels &amp; Spec Codes">

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 48 }}>
            <div>
              <p className="data-label" style={{ marginBottom: 24 }}>Classes in use</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <p className="section-ident" style={{ marginBottom: 4 }}>SECTION-IDENT</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--fog)" }}>Micro registration marks, section IDs</p>
                </div>
                <div>
                  <p className="data-label" style={{ marginBottom: 4 }}>DATA-LABEL</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--fog)" }}>Field names, column headers</p>
                </div>
                <div>
                  <p className="data-value" style={{ marginBottom: 4 }}>Data Value — Barlow 500</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--fog)" }}>The answer to a data-label</p>
                </div>
                <div>
                  <p className="spec-code" style={{ marginBottom: 4 }}>DS-196251 · OEM 17517-66</p>
                  <p style={{ fontSize: "var(--text-xs)", color: "var(--fog)" }}>Part numbers, SKUs, OEM numbers</p>
                </div>
              </div>
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 24 }}>Label + Value pairs</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  ["PART NUMBER",  "DS-196251"],
                  ["BRAND",        "Drag Specialties"],
                  ["FITS",         "Big Twin 1966–1984"],
                  ["IN STOCK",     "14 Units"],
                  ["OEM REF",      "17517-66A"],
                  ["VENDOR",       "Parts Unlimited"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span className="data-label">{label}</span>
                    <span className="data-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            04 · SPECIFICATION TABLE
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="spec-table" label="04 · Specification Table">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 32, maxWidth: 520 }}>
            The primary data display pattern — modeled after technical data sheets and brass identification plates.
            Used on product detail pages, fitment charts, and order summaries.
          </p>
          <div style={{ maxWidth: 560 }}>
            <dl className="spec-table">
              {[
                ["Part Number",   "DS-196251"],
                ["OEM Reference", "17517-66A"],
                ["Brand",         "Drag Specialties"],
                ["Application",   "Big Twin 1966–1984 (Shovelhead)"],
                ["Material",      "4140 Chromoly Steel"],
                ["Finish",        "Black Powder Coat"],
                ["Quantity",      "1 per package"],
                ["Weight",        "0.8 lbs"],
                ["In Stock",      "14 units — Ships same day"],
              ].map(([label, value]) => (
                <div className="spec-row" key={label}>
                  <dt className="spec-row-label">{label}</dt>
                  <dd className="spec-row-value">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            05 · RULED LINES & DIVIDERS
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="rules" label="05 · Ruled Lines &amp; Dividers">
          <div style={{ display: "flex", flexDirection: "column", gap: 40, maxWidth: 640 }}>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.rule-gold — major section separator</p>
              <hr className="rule-gold" />
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.rule-steel — minor separator</p>
              <hr className="rule-steel" />
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.rule-label — inline labeled divider</p>
              <div className="rule-label"><span>ENGINE COMPONENTS</span></div>
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.rule-label — catalog section break</p>
              <div className="rule-label"><span>CATALOG · SECTION 04 · DRIVETRAIN</span></div>
            </div>

          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            06 · STAMPS & BADGES
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="stamps" label="06 · Stamps &amp; Badges">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 32, maxWidth: 520 }}>
            Rubber stamp / die-cut identification treatment. Used for stock status,
            classification marks, fitment flags, and special designations.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 40 }}>
            <span className="stamp stamp-green">In Stock</span>
            <span className="stamp stamp-red">Out of Stock</span>
            <span className="stamp stamp-gold">OEM Equivalent</span>
            <span className="stamp stamp-steel">Universal Fit</span>
            <span className="stamp stamp-outline">Closeout</span>
            <span className="stamp stamp-gold">Harley Fitment</span>
            <span className="stamp stamp-steel">Kit Includes Hardware</span>
            <span className="stamp stamp-green">Same-Day Ship</span>
            <span className="stamp stamp-red">Discontinued</span>
            <span className="stamp stamp-outline">Made in USA</span>
          </div>

          {/* In context on a dark card */}
          <p className="data-label" style={{ marginBottom: 16 }}>In context — product card header</p>
          <div
            style={{
              background: "var(--iron)",
              border: "1px solid var(--steel)",
              padding: "20px 24px",
              maxWidth: 400,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <span className="stamp stamp-green">In Stock</span>
              <span className="stamp stamp-gold">OEM Equiv</span>
            </div>
            <p
              className="font-display"
              style={{ fontSize: "var(--text-lg)", textTransform: "uppercase", marginBottom: 6, letterSpacing: "var(--tracking-tight)" }}
            >
              S&S Super E Carb Kit
            </p>
            <p className="spec-code" style={{ fontSize: "var(--text-xs)", marginBottom: 12 }}>SS-11-0421 · OEM 27490-71</p>
            <p className="font-body" style={{ fontSize: "var(--text-sm)", color: "var(--silver)", lineHeight: "var(--leading-normal)" }}>
              Complete carburetor kit for Shovelhead Big Twin 1971–1984. Includes all jets and hardware.
            </p>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            07 · SECTION HEADERS
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="section-headers" label="07 · Section Headers">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 48, maxWidth: 520 }}>
            The standard opening pattern for every major page section.
          </p>

          {/* Pattern A — dark background */}
          <p className="data-label" style={{ marginBottom: 24 }}>Pattern A — On dark (standard)</p>
          <div style={{ background: "var(--iron)", padding: "40px 32px", marginBottom: 40, border: "1px solid var(--steel)" }}>
            <div className="section-header">
              <p className="section-ident">CATALOG · SECTION 04 · ENGINE COMPONENTS</p>
              <span className="accent-bar" />
              <h2 className="section-title">Engine Components</h2>
              <p className="section-subtitle">Top end, bottom end, cams, and power.</p>
            </div>
          </div>

          {/* Pattern B — blueprint grid background */}
          <p className="data-label" style={{ marginBottom: 24 }}>Pattern B — Blueprint grid</p>
          <div className="blueprint-bg" style={{ padding: "40px 32px", marginBottom: 40, border: "1px solid var(--steel)" }}>
            <div className="section-header">
              <p className="section-ident">FITMENT REFERENCE · HARLEY-DAVIDSON</p>
              <span className="accent-bar" />
              <h2 className="section-title">1966–1984 Shovelhead</h2>
              <p className="section-subtitle">Big Twin models · FLH, FX, FXWG, FXEF</p>
            </div>
          </div>

          {/* Pattern C — with corner marks */}
          <p className="data-label" style={{ marginBottom: 24 }}>Pattern C — With corner marks (technical document)</p>
          <div
            className="corner-marks"
            style={{ padding: "40px 32px", marginBottom: 40, border: "1px solid var(--steel)", position: "relative" }}
          >
            <span className="cm-tr" />
            <span className="cm-bl" />
            <div className="section-header">
              <p className="section-ident">TECHNICAL SPECIFICATION SHEET · REV 3</p>
              <span className="accent-bar" />
              <h2 className="section-title">Product Overview</h2>
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            08 · BACKGROUND TEXTURES
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="backgrounds" label="08 · Background Textures">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.blueprint-bg — engineering grid</p>
              <div className="blueprint-bg" style={{ height: 180, border: "1px solid var(--steel)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="section-ident">BLUEPRINT GRID · 32PX</span>
              </div>
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.blueprint-bg-fine — dense data grid</p>
              <div className="blueprint-bg-fine" style={{ height: 180, border: "1px solid var(--steel)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="section-ident">FINE GRID · 16PX</span>
              </div>
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.paper-surface — physical document</p>
              <div className="paper-surface" style={{ height: 180, border: "1px solid var(--steel2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-stencil)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-stamp)", textTransform: "uppercase", color: "#5a4a30" }}>CREAM PAPER SURFACE</span>
              </div>
            </div>

            <div>
              <p className="data-label" style={{ marginBottom: 12 }}>.paper-surface-worn — aged document</p>
              <div className="paper-surface-worn" style={{ height: 180, border: "1px solid var(--steel2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-stencil)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-stamp)", textTransform: "uppercase", color: "#5a4a30" }}>WORN PARCHMENT SURFACE</span>
              </div>
            </div>

          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            09 · BUTTONS
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="buttons" label="09 · Buttons">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 40, maxWidth: 560 }}>
            The primary CTA button uses a brass edge-glow technique — simulating light catching
            a machined plate. The dotted halftone texture on hover references vintage printing.
            Three variants, three sizes.
          </p>

          {/* Gold variant — primary CTA */}
          <div style={{ marginBottom: 48 }}>
            <p className="data-label" style={{ marginBottom: 6 }}>Gold — primary CTA</p>
            <p className="section-ident" style={{ marginBottom: 24 }}>
              USE FOR: Add to Cart · Order Part · Submit · Confirm
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
              <GlowButton size="sm" variant="gold">View Part</GlowButton>
              <GlowButton size="md" variant="gold">Add to Cart</GlowButton>
              <GlowButton size="lg" variant="gold">Order This Part</GlowButton>
            </div>
          </div>

          {/* Steel variant — secondary */}
          <div style={{ marginBottom: 48 }}>
            <p className="data-label" style={{ marginBottom: 6 }}>Steel — secondary action</p>
            <p className="section-ident" style={{ marginBottom: 24 }}>
              USE FOR: View Fitment · Compare · Add to Wishlist · Save
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
              <GlowButton size="sm" variant="steel">Compare</GlowButton>
              <GlowButton size="md" variant="steel">View Fitment</GlowButton>
              <GlowButton size="lg" variant="steel">Add to Wishlist</GlowButton>
            </div>
          </div>

          {/* Ghost glow variant — tertiary */}
          <div style={{ marginBottom: 48 }}>
            <p className="data-label" style={{ marginBottom: 6 }}>Ghost Glow — tertiary / inline</p>
            <p className="section-ident" style={{ marginBottom: 24 }}>
              USE FOR: View All · Browse Category · Learn More
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
              <GlowButton size="sm" variant="ghost-glow">View All</GlowButton>
              <GlowButton size="md" variant="ghost-glow">Browse Category →</GlowButton>
              <GlowButton size="lg" variant="ghost-glow">See Full Catalog</GlowButton>
            </div>
          </div>

          {/* In context — product card */}
          <div>
            <p className="data-label" style={{ marginBottom: 16 }}>In context — product card</p>
            <div
              style={{
                background: "var(--iron)",
                border: "1px solid var(--steel)",
                padding: "28px 28px 32px",
                maxWidth: 400,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <span className="stamp stamp-green">In Stock</span>
                <span className="stamp stamp-gold">OEM Equiv</span>
              </div>
              <p
                className="font-display"
                style={{ fontSize: "var(--text-lg)", textTransform: "uppercase", letterSpacing: "var(--tracking-tight)", marginBottom: 4 }}
              >
                S&S Super E Carb Kit
              </p>
              <p className="spec-code" style={{ fontSize: "var(--text-xs)", marginBottom: 12 }}>SS-11-0421 · OEM 27490-71</p>
              <p
                className="font-editorial"
                style={{ fontSize: "var(--text-2xl)", fontWeight: 400, color: "var(--gold)", marginBottom: 20 }}
              >
                $189.95
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <GlowButton size="md" variant="gold" fullWidth>Add to Cart</GlowButton>
                <GlowButton size="md" variant="steel">Fitment</GlowButton>
              </div>
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            10 · FORM ELEMENTS
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="forms" label="10 · Form Elements">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 32, maxWidth: 520 }}>
            Styled as specification form / parts request slips.
          </p>

          <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <label className="form-label">Year</label>
              <input className="input-field" type="text" placeholder="e.g. 1978" />
            </div>
            <div>
              <label className="form-label">Model</label>
              <input className="input-field" type="text" placeholder="e.g. FLH Electra Glide" />
            </div>
            <div>
              <label className="form-label">OEM Part Number</label>
              <input className="input-field input-data" type="text" placeholder="e.g. 17517-66" />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Additional fitment notes or questions..."
                style={{ resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-primary" style={{ flex: 1 }}>Submit Request</button>
              <button className="btn-secondary">Clear</button>
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            11 · CARBON COPY RECEIPT
        ══════════════════════════════════════════════════════════════════ */}
        <Section id="receipt" label="11 · Carbon Copy Receipt">
          <p style={{ color: "var(--silver)", fontSize: "var(--text-sm)", marginBottom: 40, maxWidth: 520 }}>
            Cart and order confirmation treatment. Modeled after old auto shop carbon copy receipts —
            the kind you got with two copies, the top one being the customer copy.
          </p>

          {/* The receipt */}
          <div style={{ maxWidth: 420, position: "relative" }}>

            {/* Carbon shadow layer underneath */}
            <div
              className="receipt-carbon-layer"
              style={{
                position: "absolute",
                inset: 0,
                top: 8,
                left: 6,
                zIndex: 0,
              }}
            />

            {/* Main receipt */}
            <div className="receipt-paper" style={{ position: "relative", zIndex: 1 }}>

              {/* Perforated top edge */}
              <div className="receipt-perforation receipt-perforation-top" />

              {/* Shop header */}
              <div style={{ padding: "20px 20px 16px", borderBottom: "2px solid rgba(100,80,40,0.30)" }}>
                <div className="receipt-header-copy">CUSTOMER COPY</div>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                  <p style={{ fontFamily: "var(--font-tanker)", fontSize: "var(--text-xl)", color: "#1a1208", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Stinkin&apos; Supplies
                  </p>
                  <p className="receipt-type" style={{ color: "#6a5a3a" }}>AFTERMARKET HARLEY PARTS</p>
                  <p className="receipt-type" style={{ color: "#6a5a3a", letterSpacing: "0.03em", fontSize: "var(--text-2xs)" }}>
                    ORDER #SS-2026-04891 · 07/21/2026
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div style={{ padding: "12px 0 0" }}>
                <div style={{ padding: "0 20px 8px", borderBottom: "1px solid rgba(100,80,40,0.20)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <span className="receipt-type" style={{ fontSize: "var(--text-2xs)" }}>DESCRIPTION</span>
                    <span className="receipt-type" style={{ fontSize: "var(--text-2xs)" }}>AMOUNT</span>
                  </div>
                </div>

                {[
                  { qty: "1", sku: "DS-196251", desc: "S&S SUPER E CARB KIT", price: "$189.95" },
                  { qty: "2", sku: "RB-7234-K",  desc: "ROCKER BOX GASKET SET", price: "$28.90" },
                  { qty: "1", sku: "KL-88340",   desc: "KLOCK WERKS 21\" FLARE SCREEN", price: "$219.00" },
                ].map((item) => (
                  <div key={item.sku} style={{ padding: "10px 20px", borderBottom: "1px solid rgba(100,80,40,0.12)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 3 }}>
                      <span className="receipt-type-value" style={{ fontSize: "var(--text-xs)" }}>{item.desc}</span>
                      <span className="receipt-type-value" style={{ fontSize: "var(--text-xs)" }}>{item.price}</span>
                    </div>
                    <span className="receipt-type" style={{ fontSize: "var(--text-2xs)", color: "#8a7a5a" }}>
                      QTY {item.qty} · {item.sku}
                    </span>
                  </div>
                ))}

                {/* Totals */}
                <div className="receipt-totals" style={{ padding: "8px 20px 0" }}>
                  {[
                    ["SUBTOTAL",  "$437.85"],
                    ["SHIPPING",  "$12.95"],
                    ["TAX",       "$38.92"],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "7px 0", borderBottom: "1px solid rgba(100,80,40,0.15)" }}>
                      <span className="receipt-type" style={{ fontSize: "var(--text-2xs)" }}>{label}</span>
                      <span className="receipt-type" style={{ fontSize: "var(--text-2xs)" }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "10px 0", borderTop: "2px solid rgba(100,80,40,0.35)", marginTop: 4 }}>
                    <span className="receipt-type-value" style={{ letterSpacing: "0.15em" }}>TOTAL</span>
                    <span className="receipt-type-value" style={{ fontWeight: 700, fontSize: "var(--text-md)" }}>$489.72</span>
                  </div>
                </div>

                {/* Stamp + footer */}
                <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="receipt-type" style={{ fontSize: "var(--text-2xs)", color: "#8a7a5a" }}>PAYMENT</span>
                    <span className="receipt-type-value" style={{ fontSize: "var(--text-xs)" }}>VISA ···· 4821</span>
                  </div>
                  <div style={{ transform: "rotate(-8deg)", transformOrigin: "center" }}>
                    <span className="receipt-stamp receipt-stamp-paid" style={{ fontSize: "var(--text-lg)" }}>PAID</span>
                  </div>
                </div>

                <div style={{ padding: "16px 20px 8px", marginTop: 4, borderTop: "1px solid rgba(100,80,40,0.20)", textAlign: "center" }}>
                  <p className="receipt-type" style={{ fontSize: "var(--text-2xs)", color: "#8a7a5a" }}>
                    THANK YOU FOR YOUR ORDER
                  </p>
                  <p className="receipt-type" style={{ fontSize: "var(--text-2xs)", color: "#8a7a5a", marginTop: 2 }}>
                    STINKINSUPPLIES.COM · KEEP THIS COPY
                  </p>
                </div>
              </div>

              {/* Perforated bottom edge */}
              <div className="receipt-perforation receipt-perforation-bottom" />
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
