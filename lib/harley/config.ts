// lib/harley/config.ts
export type HarleyCategory = {
  slug: string;
  label: string;
  description: string;
  icon: string;
};

export type HarleyFamily = {
  name: string;
  display_name: string;
  subtitle: string;
  year_range: string;
};

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

// Only families with actual fitment data in catalog_fitment
export const HARLEY_FAMILIES: HarleyFamily[] = [
  { name: "Touring",   display_name: "Touring",   subtitle: "Road King · Street Glide · Road Glide · Electra Glide", year_range: "1980–2026" },
  { name: "Softail",   display_name: "Softail",   subtitle: "Fat Boy · Heritage · Breakout · Low Rider S",           year_range: "1984–2024" },
  { name: "Dyna",      display_name: "Dyna",      subtitle: "Low Rider · Street Bob · Wide Glide · Fat Bob",         year_range: "1991–2017" },
  { name: "Sportster", display_name: "Sportster", subtitle: "883 · 1200 · Iron · Forty-Eight · Nightster",           year_range: "1986–2023" },
  { name: "FXR",       display_name: "FXR",       subtitle: "Low Rider · Sport Glide · Super Glide",                 year_range: "1982–1994" },
  { name: "V-Rod",     display_name: "V-Rod",     subtitle: "VRSC · Revolution engine",                              year_range: "2002–2017" },
];

export const YEAR_MIN = 1948;
export const YEAR_MAX = new Date().getFullYear();

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

// Legacy exports
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
