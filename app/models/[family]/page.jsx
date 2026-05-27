/**
 * app/models/[family]/page.jsx
 * Parts catalog page — model-first navigation.
 * Server component: fetches catalog data, renders via ModelCatalogClient.
 */

import { notFound } from 'next/navigation';
import ModelCatalogClient from './ModelCatalogClient';

const VALID_FAMILIES = ['touring','softail','dyna','sportster','fxr','shovelhead','vintage','trike','v-rod','street'];

const FAMILY_META = {
  touring:    { label: 'Touring',    sub: 'Electra · Road · Street Glide · Ultra Classic',  years: '1980–2026' },
  softail:    { label: 'Softail',    sub: 'Fat Boy · Heritage · Breakout · Slim · Deuce',   years: '1984–2026' },
  dyna:       { label: 'Dyna',       sub: 'Fat Bob · Wide Glide · Street Bob · Super Glide', years: '1991–2017' },
  sportster:  { label: 'Sportster',  sub: 'Iron 883 · Forty-Eight · Nightster · XL Series', years: '1957–2022' },
  fxr:        { label: 'FXR',        sub: 'Super Glide II · FXRS · FXRT · Sport Glide',     years: '1982–1994' },
  shovelhead: { label: 'Shovelhead', sub: 'FL · FLH · FX · FXWG · Low Rider · Electra Glide', years: '1966–1986' },
  vintage:    { label: 'Vintage',    sub: 'Panhead · Knucklehead · Flathead',               years: 'Pre-1966'  },
  trike:      { label: 'Trike',      sub: 'Freewheeler · Tri Glide Ultra',                  years: '2009–2026' },
  'v-rod':    { label: 'V-Rod',      sub: 'VRSC · Night Rod · Muscle · Street Rod',         years: '2002–2017' },
  street:     { label: 'Street',     sub: 'Street 500 · Street 750 · Street Rod',           years: '2015–2020' },
};

export async function generateMetadata({ params }) {
  const { family } = await params;
  const meta = FAMILY_META[family.toLowerCase()];
  if (!meta) return { title: 'Parts Catalog | Stinkin\' Supplies' };
  return {
    title: `${meta.label} Parts Catalog | Stinkin' Supplies`,
    description: `Shop ${meta.label} parts by era — ${meta.sub}. ${meta.years}.`,
  };
}

export default async function ModelFamilyPage({ params }) {
  const { family } = await params;
  const slug = family.toLowerCase();

  if (!VALID_FAMILIES.includes(slug)) notFound();

  const meta = FAMILY_META[slug];

  return (
    <ModelCatalogClient
      family={slug}
      meta={meta}
    />
  );
}
