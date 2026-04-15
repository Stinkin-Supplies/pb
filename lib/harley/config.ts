// lib/harley/config.ts
// Categories derived directly from catalog_unified category values
// Models derived from fitment_hd_families in pu_fitment

export type HarleyCategory = {
  slug: string;
  label: string;       // must match catalog_unified.category exactly
  description: string;
  icon: string;
};

export type HarleyFamily = {
  name: string;        // must match fitment_hd_families values exactly
  display_name: string;
  subtitle: string;
  year_range: string;
};

// Slugs are URL-safe; labels MUST match catalog_unified.category values exactly
export const HARLEY_CATEGORIES: HarleyCategory[] = [
  { slug: "engine",           label: "Engine",                      description: "Top end, bottom end, cams, and power.",      icon: "⚙️" },
  { slug: "controls",         label: "Controls & Handlebars",       description: "Bars, levers, grips, cables, and switches.",  icon: "🖐" },
  { slug: "seats",            label: "Seats",                       description: "Saddles, pads, and long-haul comfort.",       icon: "💺" },
  { slug: "exhaust",          label: "Exhaust",                     description: "Pipes, slip-ons, headers, and heat shields.", icon: "💨" },
  { slug: "wheels-tires",     label: "Wheels & Tires",              description: "Rubber, rims, and rolling stock.",            icon: "⭕" },
  { slug: "electrical",       label: "Electrical",                  description: "Batteries, charging, wiring, and switches.",  icon: "⚡" },
  { slug: "suspension",       label: "Suspension",                  description: "Forks, shocks, and handling.",                icon: "🔩" },
  { slug: "brakes",           label: "Brakes",                      description: "Pads, rotors, lines, and calipers.",          icon: "🛑" },
  { slug: "frame-body",       label: "Frame & Body",                description: "Fenders, fairings, trim, and hardware.",      icon: "🏗" },
  { slug: "fuel-systems",     label: "Fuel Systems",                description: "Carbs, fuel delivery, and air filters.",      icon: "⛽" },
  { slug: "drivetrain",       label: "Drivetrain",                  description: "Clutch, belt, chain, and sprockets.",         icon: "🔗" },
  { slug: "gaskets-seals",    label: "Gaskets/Seals",               description: "Head gaskets, case seals, and o-rings.",      icon: "🔴" },
  { slug: "luggage",          label: "Luggage & Bags",              description: "Saddlebags, tank bags, and touring gear.",    icon: "🧳" },
  { slug: "windshields",      label: "Windshields",                 description: "Shields, fairings, and wind management.",     icon: "🔲" },
  { slug: "oils-chemicals",   label: "Oils & Chemicals",            description: "Engine oil, fluids, and treatments.",         icon: "🛢" },
];

// HD family names must match fitment_hd_families values in catalog_unified
// AND family column in hd_models table
export const HARLEY_FAMILIES: HarleyFamily[] = [
  { name: "Sportster",      display_name: "Sportster",      subtitle: "883 · 1200 · Iron · Forty-Eight",       year_range: "1986–2023" },
  { name: "Softail",        display_name: "Softail",        subtitle: "Fat Boy · Heritage · Breakout · FXST",  year_range: "1984–2024" },
  { name: "Touring",        display_name: "Touring",        subtitle: "Road King · Street Glide · Road Glide", year_range: "1980–2026" },
  { name: "Dyna",           display_name: "Dyna",           subtitle: "Low Rider · Street Bob · Wide Glide",   year_range: "1991–2017" },
  { name: "M8",             display_name: "M8",             subtitle: "Milwaukee-Eight · 2017+",               year_range: "2017–2026" },
  { name: "Twin Cam",       display_name: "Twin Cam",       subtitle: "88 · 96 · 103 · 110 · 1999–2017",       year_range: "1999–2017" },
  { name: "Evolution",      display_name: "Evolution",      subtitle: "Evo · 1340 · 1984–1999",                year_range: "1984–1999" },
  { name: "Big Twin",       display_name: "Big Twin",       subtitle: "Broad coverage · FL · FX",              year_range: "1936–2017" },
  { name: "Shovelhead",     display_name: "Shovelhead",     subtitle: "1966–1984 iron head",                   year_range: "1966–1984" },
  { name: "Panhead",        display_name: "Panhead",        subtitle: "1948–1965 classic",                     year_range: "1948–1965" },
  { name: "V-Rod",          display_name: "V-Rod",          subtitle: "VRSC · Revolution engine",              year_range: "2002–2017" },
  { name: "Trike",          display_name: "Trike",          subtitle: "Tri Glide · Freewheeler",               year_range: "2009–2026" },
  { name: "Revolution_Max", display_name: "Revolution Max", subtitle: "Pan America · Sportster S · Nightster",  year_range: "2021–2026" },
];

export const YEAR_MIN = 1948;
export const YEAR_MAX = new Date().getFullYear();

// Lookup maps
export const FAMILY_LOOKUP = Object.fromEntries(
  HARLEY_FAMILIES.map(f => [f.name.toLowerCase(), f])
);

export const CATEGORY_LOOKUP = Object.fromEntries(
  HARLEY_CATEGORIES.map(c => [c.slug, c])
);

export const CATEGORY_BY_LABEL = Object.fromEntries(
  HARLEY_CATEGORIES.map(c => [c.label.toLowerCase(), c])
);

export function getHarleyFamily(name: string | null | undefined) {
  if (!name) return null;
  return FAMILY_LOOKUP[name.toLowerCase()] ?? null;
}

export function getHarleyCategory(slug: string | null | undefined) {
  if (!slug) return null;
  return CATEGORY_LOOKUP[slug] ?? null;
}

export function getCategoryByLabel(label: string | null | undefined) {
  if (!label) return null;
  return CATEGORY_BY_LABEL[label.toLowerCase()] ?? null;
}

// Legacy exports so existing imports don't break
export type HarleyStyle = HarleyFamily & {
  style_name: string;
  accent: string;
  categories: string[];
  generic_models: string[];
};

export const HARLEY_STYLES: HarleyStyle[] = HARLEY_FAMILIES.map(f => ({
  ...f,
  style_name: f.name,
  accent: "#e8621a",
  categories: HARLEY_CATEGORIES.map(c => c.slug),
  generic_models: [f.name],
}));

export const HARLEY_STYLE_LOOKUP = FAMILY_LOOKUP;
export const getHarleyStyle = getHarleyFamily;
