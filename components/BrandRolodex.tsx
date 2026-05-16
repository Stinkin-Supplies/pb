"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

// Add to next.config.js images.remotePatterns:
// { protocol: 'https', hostname: 'img.logo.dev' }
// Add to .env.local + Vercel:
// NEXT_PUBLIC_LOGO_DEV_KEY=pk_GeqZ-lyAQ2WMTK_UuoxgIg

const LOGO_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_KEY;

const BRANDS = [
  { name: "Drag Specialties",    domain: "dragspecialties.com",  count: "6,486 parts" },
  { name: "Arlen Ness",          domain: "arlenness.com",        count: "1,444 parts" },
  { name: "S&S Cycle",           domain: "sscycle.com",          count: "1,307 parts" },
  { name: "Saddlemen",           domain: "saddlemen.com",        count: "1,405 parts" },
  { name: "James Gaskets",       domain: "jamesgaskets.com",     count: "1,948 parts" },
  { name: "Custom Dynamics",     domain: "customdynamics.com",   count: "950 parts"   },
  { name: "Vance & Hines",       domain: "vanceandhines.com",    count: "612 parts"   },
  { name: "Motion Pro",          domain: "motionpro.com",        count: "922 parts"   },
  { name: "Barnett",             domain: "barnettclutches.com",  count: "779 parts"   },
  { name: "Cobra",               domain: "cobrausa.com",         count: "712 parts"   },
  { name: "Burly Brand",         domain: "burlybrand.com",       count: "872 parts"   },
  { name: "Cometic",             domain: "cometic.com",          count: "1,093 parts" },
  { name: "Highway 21",          domain: "highway21.com",        count: "772 parts"   },
  { name: "Goodridge",           domain: "goodridge.net",        count: "747 parts"   },
  { name: "Kuryakyn",            domain: "kuryakyn.com",         count: "580 parts"   },
];

const DELAY_IN_MS = 2800;
const TRANSITION_DURATION_IN_SECS = 1.4;

function logoUrl(domain: string) {
  return `https://img.logo.dev/${domain}?token=${LOGO_KEY}&format=png&size=128`;
}

function BrandFace({ brand }: { brand: typeof BRANDS[0] }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex h-36 w-52 flex-col items-center justify-center gap-2 rounded-lg bg-neutral-800">
      {!imgFailed ? (
        <Image
          src={logoUrl(brand.domain)}
          alt={brand.name}
          width={100}
          height={40}
          className="h-10 w-auto object-contain brightness-0 invert opacity-80"
          onError={() => setImgFailed(true)}
          unoptimized
        />
      ) : (
        <span className="px-3 text-center text-sm font-medium text-neutral-200">
          {brand.name}
        </span>
      )}
      <span className="text-xs tracking-wider text-teal-500">{brand.count}</span>
    </div>
  );
}

function LogoRolodex({ items }: { items: React.ReactNode[] }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setIndex((pv) => pv + 1);
    }, DELAY_IN_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div
      style={{ transform: "rotateY(-20deg)", transformStyle: "preserve-3d" }}
      className="relative z-0 h-44 w-60 shrink-0 rounded-xl border border-neutral-700 bg-neutral-800"
    >
      <AnimatePresence mode="sync">
        <motion.div
          style={{
            y: "-50%", x: "-50%",
            clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
            zIndex: -index,
            backfaceVisibility: "hidden",
          }}
          key={index}
          transition={{ duration: TRANSITION_DURATION_IN_SECS, ease: "easeInOut" }}
          initial={{ rotateX: "0deg" }}
          animate={{ rotateX: "0deg" }}
          exit={{ rotateX: "-180deg" }}
          className="absolute left-1/2 top-1/2"
        >
          {items[index % items.length]}
        </motion.div>
        <motion.div
          style={{
            y: "-50%", x: "-50%",
            clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)",
            zIndex: index,
            backfaceVisibility: "hidden",
          }}
          key={(index + 1) * 2}
          initial={{ rotateX: "180deg" }}
          animate={{ rotateX: "0deg" }}
          exit={{ rotateX: "0deg" }}
          transition={{ duration: TRANSITION_DURATION_IN_SECS, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2"
        >
          {items[index % items.length]}
        </motion.div>
      </AnimatePresence>
      <hr
        style={{ transform: "translateZ(1px)" }}
        className="absolute left-0 right-0 top-1/2 z-[999] -translate-y-1/2 border-t-2 border-neutral-900"
      />
    </div>
  );
}

export function BrandRolodex() {
  return (
    <section className="flex flex-col items-center gap-10 bg-neutral-950 px-6 py-20">

      {/* Label */}
      <p className="text-xs uppercase tracking-[0.15em] text-teal-600">
        507 brands · trusted aftermarket parts
      </p>

      {/* Rolodex */}
      <LogoRolodex
        items={BRANDS.map((brand) => (
          <BrandFace key={brand.domain} brand={brand} />
        ))}
      />

      {/* Static chip row */}
      <div className="flex flex-wrap justify-center gap-3">
        {BRANDS.slice(0, 8).map((brand) => (
          <BrandChip key={brand.domain} brand={brand} />
        ))}
      </div>
    </section>
  );
}

function BrandChip({ brand }: { brand: typeof BRANDS[0] }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-4 py-2">
      {!imgFailed && (
        <Image
          src={logoUrl(brand.domain)}
          alt={brand.name}
          width={48}
          height={20}
          className="h-5 w-auto object-contain brightness-0 invert opacity-60"
          onError={() => setImgFailed(true)}
          unoptimized
        />
      )}
      <span className="text-xs text-neutral-400">{brand.name}</span>
    </div>
  );
}