'use client';

/**
 * ScrollVelocity — magicui-style scroll-based velocity marquee.
 * Loops two rows of text in opposite directions, accelerating with
 * scroll speed. Tuned for medium height + slightly slower base speed.
 *
 * Docs: https://magicui.design/docs/components/scroll-based-velocity
 */

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

// Wrap helper (framer-motion's `wrap` import path moved around between
// versions, so we ship our own to avoid runtime errors).
const wrap = (min, max, v) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

function ParallaxRow({ children, baseVelocity = 3, className = '' }) {
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

  // Compute how many copies of the string we need to fill the viewport
  // (and then some, so the loop feels seamless).
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
  text = 'BUY THE RIGHT PART THE FIRST TIME · LESS WRENCHING · MORE RIDING ·',
  defaultVelocity = 3, // "slightly slower" — magicui default is 5
}) {
  return (
    <section className="scroll-velocity-band" aria-hidden="true">
      <ParallaxRow baseVelocity={defaultVelocity}>{text}</ParallaxRow>
      <ParallaxRow baseVelocity={-defaultVelocity} className="sv-row--dim">
        {text}
      </ParallaxRow>

      <style>{`
        .scroll-velocity-band {
          position: relative;
          width: 100%;
          padding: 14px 0;
          /* Sit above the bento grid; clear the floating nav above */
          margin-top: 96px;
          margin-bottom: 24px;
          z-index: 2;
          pointer-events: none;
          /* Soft fade on the edges so words don't hard-clip */
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
          font-family: 'Barlow Condensed', sans-serif;
          /* Medium height — between the docs' small and huge demos */
          font-size: clamp(42px, 7vw, 88px);
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #F5F0E8;
          will-change: transform;
        }

        /* Second row: gold outline for that two-tone marquee feel */
        .sv-row--dim {
          color: transparent;
          -webkit-text-stroke: 1px rgba(201, 168, 76, 0.55);
          text-stroke: 1px rgba(201, 168, 76, 0.55);
          margin-top: 4px;
        }

        .sv-chunk {
          display: inline-block;
          padding-right: 0.6em;
        }

        @media (max-width: 768px) {
          .scroll-velocity-band {
            margin-top: 80px;
            margin-bottom: 16px;
            padding: 10px 0;
          }
          .sv-row { font-size: clamp(34px, 9vw, 64px); }
        }

        @media (max-width: 480px) {
          .scroll-velocity-band {
            margin-top: 72px;
          }
          .sv-row { font-size: clamp(28px, 10vw, 52px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sv-row { animation: none; transform: none !important; }
        }
      `}</style>
    </section>
  );
}
