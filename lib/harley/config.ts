// lib/harley/config.ts
export type HarleyCategory = {
  slug: string;
  label: string;
  description: string;
  icon: string;
  dbCategories: string[];  // exact category values in catalog_unified
};

export type HarleyFamily = {
  name: string;
  display_name: string;
  subtitle: string;
  year_range: string;
};

export const HARLEY_CATEGORIES: HarleyCategory[] = [
  { slug: "engine",         label: "Engine",               description: "Top end, bottom end, cams, and power.",      icon: "⚙️", dbCategories: ["Engine"] },
  { slug: "controls",       label: "Controls & Handlebars", description: "Bars, levers, grips, cables, and switches.", icon: "🖐",  dbCategories: ["Handlebars", "Hand Controls", "Levers", "Grips", "Cable/Hydraulic Control Lines", "Throttle", "Switches"] },
  { slug: "seats",          label: "Seats",                description: "Saddles, pads, and long-haul comfort.",       icon: "💺", dbCategories: ["Seat"] },
  { slug: "exhaust",        label: "Exhaust",              description: "Pipes, slip-ons, headers, and heat shields.", icon: "💨", dbCategories: ["Exhaust"] },
  { slug: "wheels-tires",   label: "Wheels & Tires",       description: "Rubber, rims, and rolling stock.",            icon: "⭕", dbCategories: ["Tire & Wheel", "Tires", "Wheels", "Tubes", "Tire/Wheel Accessories", "Wheel Components"] },
  { slug: "electrical",     label: "Electrical",           description: "Batteries, charging, wiring, and switches.",  icon: "⚡", dbCategories: ["Electrical", "Batteries", "Illumination", "Starters"] },
  { slug: "suspension",     label: "Suspension",           description: "Forks, shocks, and handling.",                icon: "🔩", dbCategories: ["Suspension", "Steering"] },
  { slug: "brakes",         label: "Brakes",               description: "Pads, rotors, lines, and calipers.",          icon: "🛑", dbCategories: ["Brakes"] },
  { slug: "frame-body",     label: "Frame & Body",         description: "Fenders, fairings, trim, and hardware.",      icon: "🏗",  dbCategories: ["Body", "Mirrors", "Mounts/Brackets", "Hardware/Fasteners/Fittings", "Guards/Braces", "Clamps"] },
  { slug: "fuel-systems",   label: "Fuel Systems",         description: "Carbs, fuel delivery, and air filters.",      icon: "⛽", dbCategories: ["Intake/Carb/Fuel System", "Air Filters", "Jets"] },
  { slug: "drivetrain",     label: "Drivetrain",           description: "Clutch, belt, chain, and sprockets.",         icon: "🔗", dbCategories: ["Clutch", "Drive", "Sprockets", "Chains", "Belts", "Foot Controls"] },
  { slug: "gaskets-seals",  label: "Gaskets/Seals",        description: "Head gaskets, case seals, and o-rings.",      icon: "🔴", dbCategories: ["Gaskets/Seals"] },
  { slug: "luggage",        label: "Luggage & Bags",       description: "Saddlebags, tank bags, and touring gear.",    icon: "🧳", dbCategories: ["Luggage", "Accessories", "Straps/Tie-Downs"] },
  { slug: "windshields",    label: "Windshields",          description: "Shields, fairings, and wind management.",     icon: "🔲", dbCategories: ["Windshield/Windscreen"] },
  { slug: "oils-chemicals", label: "Oils & Chemicals",     description: "Engine oil, fluids, and treatments.",         icon: "🛢",  dbCategories: ["Oils & Chemicals", "Chemicals", "Oil Filters"] },
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
