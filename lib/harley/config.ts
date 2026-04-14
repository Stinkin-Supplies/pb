export type HarleyCategory = {
  slug: string;
  label: string;
  description: string;
};

export type HarleyStyle = {
  style_name: string;
  display_name: string;
  subtitle: string;
  accent: string;
  generic_models: string[];
  categories: string[];
};

export const HARLEY_CATEGORIES: HarleyCategory[] = [
  { slug: "engine-performance", label: "Engine & Performance", description: "Intake, fueling, top end, and torque parts." },
  { slug: "exhaust-systems", label: "Exhaust Systems", description: "Headers, slip-ons, gaskets, and heat shields." },
  { slug: "lighting-electrical", label: "Lighting & Electrical", description: "Batteries, charging, lighting, and switches." },
  { slug: "handlebars-controls", label: "Handlebars & Controls", description: "Bars, levers, grips, switches, and cables." },
  { slug: "brakes-wheels", label: "Brakes & Wheels", description: "Pads, rotors, wheels, and stopping power." },
  { slug: "seats-comfort", label: "Seats & Comfort", description: "Seats, backrests, floorboards, and long-haul comfort." },
  { slug: "body-fenders", label: "Body & Fenders", description: "Fairings, fenders, trim, and body hardware." },
  { slug: "tires-tubes", label: "Tires & Tubes", description: "Rubber, tubes, and wheel service parts." },
];

export const HARLEY_STYLES: HarleyStyle[] = [
  {
    style_name: "Chopper",
    display_name: "Chopper",
    subtitle: "lean, long, and custom-built",
    accent: "#e8621a",
    generic_models: ["Softail", "FXR", "Dyna", "Sportster"],
    categories: ["handlebars-controls", "engine-performance", "exhaust-systems", "body-fenders", "lighting-electrical"],
  },
  {
    style_name: "Touring",
    display_name: "Touring",
    subtitle: "distance parts for big miles",
    accent: "#c9a84c",
    generic_models: ["Road King", "Road Glide", "Street Glide", "Electra Glide"],
    categories: ["seats-comfort", "body-fenders", "lighting-electrical", "brakes-wheels", "exhaust-systems"],
  },
  {
    style_name: "Evo",
    display_name: "Evo",
    subtitle: "late-80s to mid-90s Harley era",
    accent: "#22c55e",
    generic_models: ["Softail", "Sportster", "Dyna", "FXR"],
    categories: ["engine-performance", "exhaust-systems", "handlebars-controls", "lighting-electrical"],
  },
  {
    style_name: "Shovelhead",
    display_name: "Shovelhead",
    subtitle: "classic iron, mechanical and raw",
    accent: "#b91c1c",
    generic_models: ["FL", "FX", "Big Twin"],
    categories: ["engine-performance", "exhaust-systems", "body-fenders", "brakes-wheels"],
  },
  {
    style_name: "Panhead",
    display_name: "Panhead",
    subtitle: "pre-60s old metal",
    accent: "#8a8784",
    generic_models: ["FL", "EL"],
    categories: ["engine-performance", "body-fenders", "handlebars-controls", "lighting-electrical"],
  },
  {
    style_name: "Softail",
    display_name: "Softail",
    subtitle: "modern cruiser backbone",
    accent: "#f0ebe3",
    generic_models: ["Softail", "Fat Boy", "Heritage", "Breakout"],
    categories: ["engine-performance", "brakes-wheels", "seats-comfort", "handlebars-controls", "lighting-electrical"],
  },
  {
    style_name: "Sportster",
    display_name: "Sportster",
    subtitle: "small twin, big aftermarket",
    accent: "#e8621a",
    generic_models: ["Sportster", "Iron 883", "Iron 1200", "Forty-Eight", "Nightster"],
    categories: ["engine-performance", "exhaust-systems", "handlebars-controls", "lighting-electrical", "tires-tubes"],
  },
  {
    style_name: "Dyna",
    display_name: "Dyna",
    subtitle: "rubber-mounted torque and stance",
    accent: "#c9a84c",
    generic_models: ["Dyna", "Low Rider", "Low Rider S", "Street Bob"],
    categories: ["engine-performance", "brakes-wheels", "handlebars-controls", "seats-comfort"],
  },
  {
    style_name: "FXR",
    display_name: "FXR",
    subtitle: "balanced chassis, cult-following parts",
    accent: "#22c55e",
    generic_models: ["FXR"],
    categories: ["engine-performance", "exhaust-systems", "handlebars-controls", "body-fenders"],
  },
  {
    style_name: "M8",
    display_name: "M8",
    subtitle: "new-school Harley fitment",
    accent: "#c4c0bc",
    generic_models: ["Softail", "Touring", "Pan America", "Sportster S", "Nightster"],
    categories: ["engine-performance", "exhaust-systems", "seats-comfort", "lighting-electrical", "brakes-wheels"],
  },
  {
    style_name: "Big Twin",
    display_name: "Big Twin",
    subtitle: "broad aftermarket coverage",
    accent: "#e8621a",
    generic_models: ["Big Twin", "FL", "FX", "Softail", "Dyna"],
    categories: ["engine-performance", "exhaust-systems", "body-fenders", "handlebars-controls", "brakes-wheels"],
  },
];

export const HARLEY_STYLE_LOOKUP = Object.fromEntries(
  HARLEY_STYLES.map(style => [style.style_name.toLowerCase(), style])
);

export const HARLEY_CATEGORY_LOOKUP = Object.fromEntries(
  HARLEY_CATEGORIES.map(category => [category.slug, category])
);

export function getHarleyStyle(styleName: string | null | undefined) {
  if (!styleName) return null;
  return HARLEY_STYLE_LOOKUP[styleName.toLowerCase()] ?? null;
}

export function getHarleyCategory(slug: string | null | undefined) {
  if (!slug) return null;
  return HARLEY_CATEGORY_LOOKUP[slug] ?? null;
}
