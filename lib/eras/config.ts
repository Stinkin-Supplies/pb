// lib/eras/config.ts
// Era definitions — maps era slugs to harley_families and filter logic.
// Used by app/era/[slug]/page.jsx and the homepage era cards.

import { HARLEY_CATEGORIES } from "@/lib/harley/config";

export type Era = {
  slug: string;
  display_name: string;
  subtitle: string;
  year_range: string;
  description: string;
  // harley_families.name values to filter by (empty = universal/chopper)
  families: string[];
  // If true, filter by fits_all_models / is_universal instead of families
  universal: boolean;
  // Accent color for hero
  accent: string;
};

export const ERAS: Era[] = [
  {
    slug:         "knucklehead-panhead",
    display_name: "Knucklehead & Panhead",
    subtitle:     "The originals. 1936–1965.",
    year_range:   "1936–1965",
    description:  "Where it all started. Parts for the bikes that built the legend — Knucklehead and Panhead iron.",
    families:     ["Knucklehead", "Panhead"],
    universal:    false,
    accent:       "#b8922a",
  },
  {
    slug:         "ironhead-sportster",
    display_name: "Ironhead Sportster",
    subtitle:     "The original Sportster. 1957–1985.",
    year_range:   "1957–1985",
    description:  "Raw, light, and loud. The Ironhead Sportster was built for one thing — going fast and looking mean.",
    families:     ["Sportster"],
    universal:    false,
    accent:       "#a0522d",
  },
  {
    slug:         "shovelhead",
    display_name: "Shovelhead",
    subtitle:     "Raw. Loud. American. 1966–1984.",
    year_range:   "1966–1984",
    description:  "The Shovelhead era defined outlaw culture. Parts for the bikes that built the chopper movement.",
    families:     ["Shovelhead", "FXR"],
    universal:    false,
    accent:       "#e8621a",
  },
  {
    slug:         "evolution",
    display_name: "Evolution",
    subtitle:     "The comeback. 1984–1999.",
    year_range:   "1984–1999",
    description:  "The Evo saved the company and gave a generation their first Harley. Big Twin parts for the comeback era.",
    families:     ["Evolution"],
    universal:    false,
    accent:       "#c0392b",
  },
  {
    slug:         "evo-sportster",
    display_name: "Evo Sportster",
    subtitle:     "The people's Harley. 1986–2021.",
    year_range:   "1986–2021",
    description:  "35 years of the Evolution-powered Sportster. The 883 and 1200 that introduced more riders to Harley than any other bike.",
    families:     ["Sportster"],
    universal:    false,
    accent:       "#8b4513",
  },
  {
    slug:         "twin-cam",
    display_name: "Twin Cam",
    subtitle:     "Power and refinement. 1999–2017.",
    year_range:   "1999–2017",
    description:  "More displacement, more reliability, more of everything. Dyna, Touring, and Softail parts.",
    families:     ["Twin Cam", "Dyna", "Touring", "Softail"],
    universal:    false,
    accent:       "#2980b9",
  },
  {
    slug:         "milwaukee-8",
    display_name: "Milwaukee Eight",
    subtitle:     "Modern muscle. 2017–present.",
    year_range:   "2017–present",
    description:  "The most powerful stock engine in Harley history. Touring, Softail M8, and Revolution Max parts.",
    families:     ["Touring", "Softail M8", "Revolution Max"],
    universal:    false,
    accent:       "#27ae60",
  },
  {
    slug:         "chopper",
    display_name: "Chopper",
    subtitle:     "No rules. All iron.",
    year_range:   "Universal",
    description:  "Universal parts, custom hardware, and anything that bolts to whatever you're building. No fitment required.",
    families:     [],
    universal:    true,
    accent:       "#8e44ad",
  },
];

export const ERA_LOOKUP = Object.fromEntries(ERAS.map(e => [e.slug, e]));

export function getEra(slug: string | null | undefined): Era | null {
  if (!slug) return null;
  return ERA_LOOKUP[slug] ?? null;
}

// All categories available for era filtering
export { HARLEY_CATEGORIES as ERA_CATEGORIES };