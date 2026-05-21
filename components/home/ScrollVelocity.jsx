'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';

const wrap = (min, max, v) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

function ParallaxRow({ children, baseVelocity = 1.5, className = '' }) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400,
  });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], {
    clamp: false,
  });

  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [repetitions, setRepetitions] = useState(4);

  useEffect(() => {
    const recalc = () => {
      if (containerRef.current && textRef.current) {
        const containerW = containerRef.current.offsetWidth;
        const textW = textRef.current.offsetWidth;
        if (textW > 0) {
          setRepetitions(Math.ceil(containerW / textW) + 2);
        }
      }
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [children]);

  const x = useTransform(baseX, (v) => `${wrap(-100 / repetitions, 0, v)}%`);

  const directionFactor = useRef(1);
  useAnimationFrame((_t, delta) => {
    let moveBy = directionFactor.current * baseVelocity * (delta / 1000);
    if (velocityFactor.get() < 0) directionFactor.current = -1;
    else if (velocityFactor.get() > 0) directionFactor.current = 1;
    moveBy += directionFactor.current * moveBy * velocityFactor.get();
    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div className="sv-track" ref={containerRef}>
      <motion.div className={`sv-row ${className}`} style={{ x }}>
        {Array.from({ length: repetitions }).map((_, i) => (
          <span key={i} ref={i === 0 ? textRef : null} className="sv-chunk">
            {children}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export default function ScrollVelocity({
  text = 'THE RIGHT STINKIN PARTS',
  defaultVelocity = 1.5,
}) {
  return (
    <section className="scroll-velocity-band" aria-hidden="true">
      <ParallaxRow baseVelocity={defaultVelocity}>{text}</ParallaxRow>
      <ParallaxRow baseVelocity={-defaultVelocity} className="sv-row--dim">
        {text}
      </ParallaxRow>

      <style>{`
        @font-face {
          font-family: 'New Sailor';
          src: url('/fonts/New_Sailor.ttf') format('truetype');
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }

        .scroll-velocity-band {
          position: relative;
          width: 100%;
          /* tall enough for 2 rows of max font (140px each) + gap + padding */
          min-height: 340px;
          padding: 32px 0;
          margin-top: 60px;
          margin-bottom: 60px;
          z-index: 2;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
                  mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 8%,
            #000 92%,
            transparent 100%
          );
        }

        .sv-track {
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }

        .sv-row {
          display: inline-flex;
          white-space: nowrap;
          font-family: 'New Sailor', 'Barlow Condensed', sans-serif;
          /* bumped max from 112px → 140px */
          font-size: clamp(72px, 10vw, 140px);
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #1a1610;
          will-change: transform;
        }

        .sv-row--dim {
          color: transparent;
          -webkit-text-stroke: 1.5px rgba(201, 168, 76, 0.85);
          text-stroke: 1.5px rgba(201, 168, 76, 0.85);
          margin-top: 0;
        }

        .sv-chunk {
          display: inline-block;
          padding-right: 0.6em;
        }

        @media (max-width: 768px) {
          .scroll-velocity-band {
            min-height: 260px;
            margin-top: 120px;
            margin-bottom: 16px;
            padding: 20px 0;
            gap: 6px;
          }
          .sv-row { font-size: clamp(56px, 12vw, 100px); }
        }

        @media (max-width: 480px) {
          .scroll-velocity-band {
            min-height: 200px;
            margin-top: 108px;
            gap: 4px;
          }
          .sv-row { font-size: clamp(44px, 13vw, 72px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sv-row { animation: none; transform: none !important; }
        }
      `}</style>
    </section>
  );
}
