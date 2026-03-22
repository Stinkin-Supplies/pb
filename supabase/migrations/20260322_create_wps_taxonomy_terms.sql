create table if not exists public.wps_taxonomy_terms (
  id                 integer primary key,
  vocabulary_id      integer not null,
  parent_id          integer null,
  name               text not null,
  slug               text not null,
  description        text null,
  link               text null,
  link_target_blank  boolean not null default false,
  "left"             integer null,
  "right"            integer null,
  depth              integer null,
  wps_created_at     timestamptz null,
  wps_updated_at     timestamptz null,
  raw                jsonb not null default '{}'::jsonb,
  inserted_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists wps_taxonomy_terms_parent_id_idx
  on public.wps_taxonomy_terms (parent_id);

create index if not exists wps_taxonomy_terms_slug_idx
  on public.wps_taxonomy_terms (slug);
