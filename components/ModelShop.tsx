'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useRef } from 'react';

const DURATION = 0.28;
const STAGGER = 0.022;

const FAMILIES: { label: string; slug: string; offset: string }[] = [
  { label: 'Touring',        slug: 'touring',        offset: '3%'  },
  { label: 'Softail',        slug: 'softail',        offset: '11%' },
  { label: 'Sportster',      slug: 'sportster',      offset: '6%'  },
  { label: 'Dyna',           slug: 'dyna',           offset: '15%' },
  { label: 'FXR',            slug: 'fxr',            offset: '2%'  },
  { label: 'Vintage',        slug: 'vintage',        offset: '9%'  },
  { label: 'Revolution Max', slug: 'revolution-max', offset: '4%'  },
];

function FlipLink({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  const letters = children.split('');

  return (
    <motion.button
      initial="initial"
      whileHover="hovered"
      onClick={onClick}
      className="group relative block w-full overflow-hidden whitespace-nowrap text-left py-[0.15em] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
      style={{ lineHeight: 0.9 }}
      aria-label={`Shop ${children}`}
    >
      {/* Top row — cream, slides up on hover */}
      <div aria-hidden="true">
        {letters.map((l, i) => (
          <motion.span
            key={i}
            variants={{ initial: { y: 0 }, hovered: { y: '-100%' } }}
            transition={{ duration: DURATION, ease: [0.76, 0, 0.24, 1], delay: STAGGER * i }}
            className="inline-block font-black uppercase text-[#f0ebe3]"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {l === ' ' ? '\u00A0' : l}
          </motion.span>
        ))}
      </div>

      {/* Bottom row — gold, slides up from below */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center">
        {letters.map((l, i) => (
          <motion.span
            key={i}
            variants={{ initial: { y: '100%' }, hovered: { y: 0 } }}
            transition={{ duration: DURATION, ease: [0.76, 0, 0.24, 1], delay: STAGGER * i }}
            className="inline-block font-black uppercase text-[#c9a84c]"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {l === ' ' ? '\u00A0' : l}
          </motion.span>
        ))}
      </div>

      {/* Arrow — fades in on hover */}
      <motion.span
        variants={{ initial: { opacity: 0, x: -8 }, hovered: { opacity: 1, x: 0 } }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="absolute right-0 top-1/2 -translate-y-1/2 text-[#c9a84c] text-2xl"
        aria-hidden="true"
      >
        →
      </motion.span>
    </motion.button>
  );
}

export default function ModelShop() {
  const router = useRouter();

  return (
    <main
      className="relative min-h-screen flex flex-col justify-center px-[6vw] overflow-hidden"
      style={{ background: '#080706' }}
    >
      {/* Grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* Page label */}
      <p
        className="mb-10 text-[11px] tracking-[0.25em] uppercase opacity-70"
        style={{ fontFamily: "'Barlow', sans-serif", color: '#c9a84c' }}
      >
        Shop by family
      </p>

      {/* Flip links */}
      <ul className="list-none p-0 m-0">
        {FAMILIES.map(({ label, slug, offset }, i) => (
          <motion.li
            key={slug}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 + i * 0.06 }}
            className="overflow-hidden"
          style={{ paddingLeft: offset }}
          >
            <FlipLink onClick={() => router.push(`/harley/${slug}`)}>
              {label}
            </FlipLink>
          </motion.li>
        ))}
      </ul>

      {/* Bottom rule */}
      <div className="mt-12 flex items-center gap-4">
        <div className="flex-1 h-px bg-[rgba(201,168,76,0.1)]" />
        <span
          className="text-[11px] tracking-[0.2em] uppercase whitespace-nowrap"
          style={{ fontFamily: "'Barlow', sans-serif", color: 'rgba(240,235,227,0.25)' }}
        >
          Stinkin&apos; Supplies
        </span>
        <div className="flex-1 h-px bg-[rgba(201,168,76,0.1)]" />
      </div>
    </main>
  );
}
