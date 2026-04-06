-- Nested folders support for /admin/documents.
-- Adds `parent_id` and changes uniqueness from global (name) to per-parent (parent_id, name).

alter table public.admin_folders
  add column if not exists parent_id uuid null references public.admin_folders(id) on delete set null;

create index if not exists idx_admin_folders_parent_id on public.admin_folders(parent_id);

-- Drop the original global unique constraint on name (created by `name text not null unique`).
alter table public.admin_folders drop constraint if exists admin_folders_name_key;

-- Enforce sibling-unique names (case-insensitive). Roots share a virtual parent.
create unique index if not exists idx_admin_folders_sibling_name_unique
  on public.admin_folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

