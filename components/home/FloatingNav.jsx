'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Inline SVG — HD bar & shield with metallic S (menubutton.svg v2) ─────────
const ShieldSVG = ({ className }) => (
  <svg
    className={className}
    width="100%"
    height="100%"
    viewBox="0 0 179.83711 133.72017"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <filter x="-0.16533962" width="1.3536087" y="-0.075816642" height="1.1306941"
        style={{colorInterpolationFilters:'sRGB'}} id="sb-filter68">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6.009 2.184" result="result8" />
        <feComposite in2="result8" operator="xor" result="result19" />
        <feComposite k2="1" operator="arithmetic" result="result17" in2="result8" k1="0" k3="0" k4="0" />
        <feOffset result="result18" in="result8" dx="2" dy="-2" />
        <feDisplacementMap in2="result17" in="result18" xChannelSelector="A" yChannelSelector="A" scale="31" result="result4" />
        <feComposite in2="result4" result="result2" operator="arithmetic" in="SourceGraphic" k1="0" k3="1" k2="0" k4="0" />
        <feComposite in2="SourceGraphic" result="fbSourceGraphic" in="result2" operator="in" />
        <feComposite in2="SourceGraphic" operator="in" result="result15" />
        <feComposite result="result16" in2="SourceGraphic" operator="in" in="result15" />
      </filter>
    </defs>

    <g transform="translate(68.808883,-6.5206048)">
      {/* Shield outline — dark fill, original gold stroke */}
      <path
        id="sb-shield"
        d="M 20.147494,7.1219051 C 2.5522939,18.818715 -18.361155,24.609085 -39.24578,26.526925 c -1.190163,7.20085 -1.087214,14.09053 5.729984,17.88892 4.465865,8.95735 -8.854132,4.05611 -13.562381,5.27274 -6.820111,0.0158 -13.642923,-0.029 -20.459415,0.23404 -0.729356,14.50717 -1.062609,29.0479 -0.456705,43.5661 10.773762,1.33789 21.775641,-1.30104 32.462153,0.88917 7.410526,3.74718 -10.862087,9.131695 -1.326084,13.123605 16.664659,12.2286 34.7167329,22.69538 53.733423,30.793 10.592292,4.41554 21.032685,-2.13824 29.556201,-7.90421 7.820168,-4.90723 15.810978,-9.51279 22.780628,-15.63086 4.00754,-5.25867 15.973268,-7.23705 14.054088,-14.65578 -3.30737,-2.642905 -8.933268,-7.875315 -0.72691,-6.535765 9.31216,-0.34087 18.634138,-0.0692 27.946938,-0.38538 -0.84994,-10.14998 -0.47107,-20.40154 -1.09636,-30.58665 -0.0848,-6.69003 1.12227,-15.57711 -8.21864,-13.90103 -9.462208,-0.85929 -18.964178,-0.1666 -28.443696,-0.16663 -1.64481,-7.57542 11.266288,-9.32472 7.708428,-17.52207 -3.181638,-10.20096 -17.213818,-6.08563 -25.193738,-9.65404 -12.357065,-2.78889 -24.522261,-7.13311 -35.09464,-14.2301799 z"
        style={{opacity:0.84, fill:'#000000', fillOpacity:1, stroke:'#947600', strokeOpacity:1}}
      />

      {/* Metallic S — updated positioning from v2 */}
      <g transform="translate(-5.7434334,9.7183081)">
        <g transform="matrix(0.85184826,0.10114425,-0.10114425,0.85184826,24.128586,-69.943268)"
           style={{strokeWidth:'1.34991', strokeDasharray:'none'}}>
          <path
            d="m -41.494602,144.59696 c -2.79974,-1.39987 -14.34626,-4.10487 -15.046195,-8.30448 -0.979909,-6.29941 3.760367,-10.66125 7.400029,-8.70144 6.99935,3.49968 13.018791,11.19896 17.358388,17.77835 3.919636,5.87946 16.79844,4.75956 14.698635,-4.19961 -1.819831,-7.41931 -0.699935,-15.53855 1.119896,-22.81788 2.239792,-9.09915 -12.458843,-13.71872 -14.698635,-5.03953 -0.419961,1.53986 -0.699935,3.07971 -0.979909,4.61957 -0.160131,2.39226 -0.217868,1.59632 -0.839922,3.77965 -5.459493,-5.87945 -12.878804,-9.51912 -20.438102,-10.49902 -13.858713,-1.67985 -28.990174,21.13834 -19.191084,35.557 3.966335,8.19336 26.742725,14.29791 32.25581,20.10601 10.19217,7.06316 10.722621,15.61314 -7.872271,14.70695 -9.70211,-0.99769 -7.616738,0.26131 -19.729868,-2.15537 -10.492861,-5.48917 -46.23777,-51.60615 -27.295431,-13.22971 3.866991,7.83437 4.746896,9.74729 2.547864,23.35155 -1.912558,11.832 4.010752,7.73314 25.819291,8.8386 20.069237,1.01729 25.646394,3.62263 39.626732,-1.46849 8.123334,-5.93281 10.634458,-7.97264 11.231957,-16.11909 -2.864016,-18.77464 -9.615852,-23.81401 -25.967185,-36.20306 z"
            style={{fill:'#b3b3b3', stroke:'#cccccc', strokeWidth:'2.39907', strokeDasharray:'none'}}
            transform="rotate(-9.2845699,-5.4443177,-320.13514)"
          />
          <path
            d="m 22.006899,153.06562 c -2.930481,-1.10021 -14.6961628,-2.58611 -15.8303165,-6.6898 -1.6316184,-6.16285 2.6278438,-10.99532 6.4520695,-9.42584 7.326202,2.75053 14.115877,9.77997 19.11806,15.87083 4.511508,5.43856 17.203254,2.98145 14.180424,-5.70983 -2.583769,-7.18903 -2.316851,-15.38079 -1.266211,-22.81023 1.278497,-9.28314 -13.821804,-12.34438 -15.144104,-3.47891 -0.257056,1.57526 -0.374891,3.13591 -0.492724,4.69658 0.09026,2.39591 -0.05018,1.61034 -0.441107,3.84664 -6.042965,-5.27793 -13.801439,-8.12389 -21.4217125,-8.30998 -13.9583352,-0.22516 -26.6272305,24.04684 -15.3776644,37.36477 4.7993015,7.73496 28.0881859,11.43054 34.1770079,16.63192 10.873293,5.96155 12.292649,14.40957 -6.295336,15.44784 -9.7532522,0.0197 -7.547936,1.05435 -19.84706405,-0.0857 C -11.189949,186.04913 -51.550076,143.91203 -28.708239,180.10338 c 4.663055,7.3883 5.737686,9.19901 4.969629,22.95843 -0.668,11.96695 4.795474,7.27262 26.6003608,6.09733 20.0658762,-1.08156 25.8843592,0.92785 39.2574162,-5.59371 7.460209,-6.74775 9.744873,-9.03837 9.489405,-17.20271 -4.806666,-18.3735 -12.047301,-22.68114 -29.601673,-33.2971 z"
            style={{fill:'#4d4d4d', stroke:'#b3b3b3', strokeWidth:0, strokeDasharray:'none', strokeOpacity:1, filter:'url(#sb-filter68)'}}
            transform="rotate(-3.2974956,-123.85136,-58.880968)"
          />
        </g>
      </g>
    </g>
  </svg>
);

// ─── Floating Nav ─────────────────────────────────────────────────────────────
function FloatingNav() {
  const [mounted, setMounted]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const [minimized, setMinimized]   = useState(false);
  const [lastY, setLastY]           = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [clicking, setClicking]     = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const fn = () => {
      const y = window.scrollY;
      const scrollingDown = y > lastY;
      if (y > 80 && scrollingDown) {
        setMinimized(true);
        setManualOpen(false);
      } else if (y < lastY) {
        setMinimized(false);
        setManualOpen(false);
      }
      setScrolled(y > 40);
      setLastY(y);
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [lastY]);

  const isOpen   = !minimized || manualOpen;
  const showMini = mounted && minimized && !manualOpen;
  const showFull = !mounted || isOpen;

  const handleShieldClick = () => {
    setClicking(true);
    setTimeout(() => setClicking(false), 500);
    setManualOpen(true);
  };

  return (
    <>
      <style>{`
        /* ── Shield button ─────────────────────────────────── */
        .nav-mini-wrap {
          position: fixed;
          top: 14px;
          left: 16px;
          z-index: 300;
          width: 140px;
          height: 104px;
          cursor: pointer;
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22,1,0.36,1);
        }

        .nav-mini-btn {
          position: absolute;
          inset: 0;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
        }

        /* The SVG fills the button area */
        .nav-mini-svg {
          width: 100%;
          height: 100%;
          transition: filter 0.2s;
          /* Default: gold cloud glow underneath */
          filter:
            drop-shadow(0 6px 14px rgba(201,168,76,0.45))
            drop-shadow(0 2px 4px rgba(0,0,0,0.85));
        }
        .nav-mini-wrap:hover .nav-mini-svg {
          filter:
            drop-shadow(0 8px 20px rgba(212,175,55,0.75))
            drop-shadow(0 2px 6px rgba(0,0,0,0.9))
            brightness(1.15);
        }

        /* Gold stroke on the shield path brightens on hover */
        .nav-mini-wrap:hover #sb-shield {
          stroke: #e8c43a;
        }

        /* ── Click animations */
        @keyframes shieldPulse {
          0%   { transform: scale(1); }
          25%  { transform: scale(1.1); }
          60%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes glowBurst {
          0%   { filter: drop-shadow(0 6px 14px rgba(201,168,76,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.85)); }
          30%  { filter: drop-shadow(0 0 28px rgba(255,220,60,1)) drop-shadow(0 0 12px rgba(255,200,30,0.9)) brightness(1.3); }
          100% { filter: drop-shadow(0 6px 14px rgba(201,168,76,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.85)); }
        }
        .nav-mini-wrap--clicking {
          animation: shieldPulse 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .nav-mini-wrap--clicking .nav-mini-svg {
          animation: glowBurst 0.45s ease forwards;
        }

        /* ══════════════════════════════════════════════════════
           FULL NAV — dark glass pill on a gold cloud
           ══════════════════════════════════════════════════════ */
        .nav-cloud-wrap {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 300;
          width: min(860px, calc(100vw - 32px));
          transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        .nav-cloud-wrap::before {
          content: '';
          position: absolute;
          inset: 8px 20px -4px;
          border-radius: 999px;
          background: radial-gradient(
            ellipse 80% 60% at 50% 100%,
            rgba(201,168,76,0.55) 0%,
            rgba(180,140,20,0.28) 45%,
            transparent 75%
          );
          filter: blur(14px);
          z-index: 0;
          pointer-events: none;
          transition: opacity 0.3s;
        }
        .nav-cloud-wrap.scrolled::before {
          background: radial-gradient(
            ellipse 80% 60% at 50% 100%,
            rgba(212,175,55,0.7) 0%,
            rgba(180,140,20,0.38) 45%,
            transparent 75%
          );
          filter: blur(18px);
        }
        .float-nav {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          padding: 10px 20px 10px 14px;
          background: rgba(8, 8, 8, 0.78);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          border: 1px solid rgba(201,168,76,0.22);
          border-radius: 999px;
          box-shadow:
            0 1px 0 rgba(201,168,76,0.18) inset,
            0 -1px 0 rgba(201,168,76,0.08) inset,
            0 2px 12px rgba(0,0,0,0.6);
          transition: background 0.3s, border-color 0.3s;
        }
        .nav-cloud-wrap.scrolled .float-nav {
          background: rgba(6, 6, 6, 0.9);
          border-color: rgba(201,168,76,0.35);
        }
        .nav-logo img { display: block; }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nav-links a {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-dim);
          text-decoration: none;
          padding: 6px 12px;
          border-radius: 999px;
          transition: color 0.2s, background 0.2s;
        }
        .nav-links a:hover { color: var(--white); background: rgba(255,255,255,0.07); }
        .nav-close {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 50%;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(245,240,232,0.5);
          cursor: pointer;
          transition: color 0.2s, background 0.2s;
          margin-left: 4px;
          flex-shrink: 0;
        }
        .nav-close:hover { color: #fff; background: rgba(255,255,255,0.12); }
      `}</style>

      {/* ── HD Shield button — only visible when menu is minimized */}
      <div
        className={`nav-mini-wrap ${clicking ? 'nav-mini-wrap--clicking' : ''}`}
        style={{
          opacity:       showMini ? 1 : 0,
          pointerEvents: showMini ? 'auto' : 'none',
          transform:     showMini ? 'scale(1)' : 'scale(0.6)',
        }}
      >
        <button
          className="nav-mini-btn"
          onClick={handleShieldClick}
          aria-label="Open navigation"
        >
          <ShieldSVG className="nav-mini-svg" />
        </button>
      </div>

      {/* ── Gold cloud wrapper + dark glass pill */}
      <div
        className={`nav-cloud-wrap ${scrolled ? 'scrolled' : ''}`}
        style={{
          opacity:       showFull ? 1 : 0,
          pointerEvents: showFull ? 'auto' : 'none',
          transform:     showFull
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(-14px) scale(0.95)',
        }}
      >
        <nav className="float-nav">
          <Link href="/" className="nav-logo">
            <img src="/LOGO.svg" alt="Stinkin' Supplies" style={{ height: '88px', width: 'auto', objectFit: 'contain' }} />
          </Link>
          <div className="nav-links">
            <Link href="/browse">Browse</Link>
            <Link href="/eras">Eras</Link>
            <Link href="/browse?category=all">Categories</Link>
            <Link href="/browse?deals=true">Deals</Link>
            <Link href="/admin/products">Admin</Link>
            <button
              className="nav-close"
              style={{
                opacity:       manualOpen ? 1 : 0,
                pointerEvents: manualOpen ? 'auto' : 'none',
                width:         manualOpen ? '30px' : '0',
              }}
              onClick={() => { setManualOpen(false); setMinimized(true); }}
              aria-label="Close navigation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}

export default FloatingNav;
