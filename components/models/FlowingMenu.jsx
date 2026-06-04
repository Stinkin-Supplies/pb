'use client';
/**
 * components/models/FlowingMenu.jsx
 */

import { useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';

function sr(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}
function pick(arr, seed) {
  return arr[Math.floor(sr(seed) * arr.length)];
}

// Row height — generous so even the largest font never clips
const HEIGHTS = [
  'clamp(160px, 22vh, 260px)',
  'clamp(180px, 24vh, 290px)',
  'clamp(200px, 26vh, 320px)',
  'clamp(150px, 21vh, 250px)',
  'clamp(190px, 25vh, 300px)',
];

// Font sizes — all safely smaller than the smallest row height
const FONTS = [
  'clamp(80px,  12vw, 180px)',
  'clamp(90px,  13vw, 200px)',
  'clamp(100px, 14vw, 220px)',
  'clamp(85px,  12vw, 190px)',
  'clamp(95px,  13vw, 210px)',
];

// Horizontal justification of the label within the row
const JUSTIFIES = [
  'center',
  'center',
  'center',
  'center',
  'center',
];

export default function FlowingMenu({
  items            = [],
  speed            = 60,
  textColor        = '#f5f0e8',
  bgColor          = '#1a1208',
  marqueeBgColor   = '#ffffff',
  marqueeTextColor = '#1a1208',
  borderColor      = 'rgba(201,150,10,0.22)',
}) {
  const configs = useMemo(() => items.map((_, i) => {
    const s = i * 9;
    return {
      height:    pick(HEIGHTS,   s + 1),
      fontSize:  pick(FONTS,     s + 2),
      justify:   pick(JUSTIFIES, s + 3),
      direction: sr(s + 5) > 0.5 ? 1 : -1,
      entryY:    sr(s + 6) > 0.5 ? 100 : -100,
      speed:     speed * (0.8 + sr(s + 7) * 0.4),
    };
  }), [items, speed]);

  return (
    <nav style={{
      display:       'flex',
      flexDirection: 'column',
      width:         '100%',
      height:        '100%',
      overflowY:     'auto',
      overflowX:     'hidden',
      background:    bgColor,
    }}>
      {items.map((item, i) => (
        <MenuItem
          key={i}
          item={item}
          config={configs[i]}
          textColor={textColor}
          bgColor={bgColor}
          marqueeBgColor={marqueeBgColor}
          marqueeTextColor={marqueeTextColor}
          borderColor={borderColor}
          isLast={i === items.length - 1}
        />
      ))}
    </nav>
  );
}

function MenuItem({
  item, config,
  textColor, bgColor,
  marqueeBgColor, marqueeTextColor, borderColor,
  isLast,
}) {
  const router     = useRouter();
  const rowRef     = useRef(null);
  const overlayRef = useRef(null);
  const innerRef   = useRef(null);
  const animRef    = useRef(null);

  const UNITS = 7;

  useEffect(() => {
    const row     = rowRef.current;
    const overlay = overlayRef.current;
    const inner   = innerRef.current;
    if (!row || !overlay || !inner) return;

    const init = () => {
      const half = inner.scrollWidth / 2;
      if (half === 0) { setTimeout(init, 50); return; }

      gsap.set(overlay, { yPercent: config.entryY });
      gsap.set(inner,   { x: config.direction === 1 ? 0 : -half });

      animRef.current?.kill();
      animRef.current = gsap.to(inner, {
        x:        config.direction === 1 ? -half : 0,
        duration: config.speed,
        ease:     'none',
        repeat:   -1,
      });
    };

    const t = setTimeout(init, 120);

    const enter = () => {
      gsap.killTweensOf(overlay);
      gsap.to(overlay, { yPercent: 0, duration: 0.48, ease: 'power3.out' });
    };

    const leave = (e) => {
      const rect = row.getBoundingClientRect();
      const down = e.clientY > rect.top + rect.height / 2;
      gsap.killTweensOf(overlay);
      gsap.to(overlay, {
        yPercent:   down ? 100 : -100,
        duration:   0.4,
        ease:       'power3.in',
        onComplete: () => gsap.set(overlay, { yPercent: config.entryY }),
      });
    };

    row.addEventListener('mouseenter', enter);
    row.addEventListener('mouseleave', leave);
    return () => {
      clearTimeout(t);
      row.removeEventListener('mouseenter', enter);
      row.removeEventListener('mouseleave', leave);
      animRef.current?.kill();
    };
  }, [config]);

  return (
    <div
      ref={rowRef}
      onClick={() => item.link && router.push(item.link)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && item.link && router.push(item.link)}
      style={{
        position:     'relative',
        height:       config.height,
        flexShrink:   0,
        overflow:     'hidden',
        cursor:       'pointer',
        borderBottom: isLast ? 'none' : `1px solid ${borderColor}`,
        background:   bgColor,
        // Center content vertically, justify horizontally per config
        display:        'flex',
        alignItems:     'center',
        justifyContent: config.justify,
      }}
    >
      {/* ── Idle label ── */}
      <div style={{
        position:      'relative',
        zIndex:        1,
        display:       'flex',
        flexDirection: 'column',
        gap:           4,
        padding:       '0 clamp(24px, 4vw, 60px)',
        pointerEvents: 'none',
        userSelect:    'none',
      }}>
        <span style={{
          fontFamily:    "var(--font-tanker, 'Barlow Condensed', sans-serif)",
          fontSize:      config.fontSize,
          color:         textColor,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          lineHeight:    1,
          whiteSpace:    'nowrap',
        }}>
          {item.text}
        </span>
        {item.sub && (
          <span style={{
            fontFamily:    "var(--font-stencil, 'Barlow Condensed', monospace)",
            fontSize:      'clamp(9px, 0.9vw, 11px)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color:         'rgba(201,150,10,0.45)',
          }}>
            {item.sub}
          </span>
        )}
      </div>

      {/* Years — always pinned right */}
      {item.years && (
        <span style={{
          position:      'absolute',
          right:         'clamp(16px, 3vw, 44px)',
          top:           '50%',
          transform:     'translateY(-50%)',
          zIndex:        1,
          fontFamily:    "var(--font-stencil, 'Barlow Condensed', monospace)",
          fontSize:      'clamp(9px, 0.9vw, 11px)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color:         'rgba(201,150,10,0.28)',
          whiteSpace:    'nowrap',
          pointerEvents: 'none',
        }}>
          {item.years}
        </span>
      )}

      {/* ── Marquee overlay ── */}
      <div
        ref={overlayRef}
        style={{
          position:      'absolute',
          inset:         0,
          zIndex:        2,
          background:    marqueeBgColor,
          display:       'flex',
          alignItems:    'stretch',
          overflow:      'hidden',
          willChange:    'transform',
          pointerEvents: 'none',
        }}
      >
        <div ref={innerRef} style={{
          display:    'flex',
          alignItems: 'stretch',
          height:     '100%',
          willChange: 'transform',
          flexShrink: 0,
        }}>
          {[0, 1].map(copy => (
            <div key={copy} style={{
              display:    'flex',
              alignItems: 'center',
              height:     '100%',
              flexShrink: 0,
            }}>
              {Array.from({ length: UNITS }).map((_, j) => (
                <div key={j} style={{
                  display:    'flex',
                  alignItems: 'center',
                  height:     '100%',
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontFamily:    "var(--font-tanker, 'Barlow Condensed', sans-serif)",
                    fontSize:      config.fontSize,
                    color:         marqueeTextColor,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    lineHeight:    1,
                    whiteSpace:    'nowrap',
                    padding:       '0 clamp(20px, 2.5vw, 44px)',
                    alignSelf:     'center',
                    flexShrink:    0,
                  }}>
                    {item.text}
                  </span>
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      style={{
                        height:     '100%',
                        width:      'auto',
                        display:    'block',
                        objectFit:  'cover',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
