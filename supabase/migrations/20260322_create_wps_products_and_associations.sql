create table if not exists public.wps_products (
  id             integer primary key,
  sku            text null,
  name           text null,
  slug           text null,
  brand_id       integer null,
  status         text null,
  wps_created_at timestamptz null,
  wps_updated_at timestamptz null,
  raw            jsonb not null default '{}'::jsonb,
  inserted_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists wps_products_sku_idx
  on public.wps_products (sku);

create index if not exists wps_products_slug_idx
  on public.wps_products (slug);

create table if not exists public.wps_product_associations (
  product_id   integer not null,
  assoc_type   text not null,
  items        jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (product_id, assoc_type)
);

create index if not exists wps_product_associations_type_idx
  on public.wps_product_associations (assoc_type);
