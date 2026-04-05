-- Admin documents + folders for the /admin/documents UI.
-- Uses Supabase Storage for the PDF bytes; this just stores metadata.

create table if not exists public.admin_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_documents (
  id uuid primary key,
  folder_id uuid null references public.admin_folders(id) on delete set null,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_documents_folder_id on public.admin_documents(folder_id);
create index if not exists idx_admin_documents_created_at on public.admin_documents(created_at desc);

