-- Compatibility migration: if the original schema used `storage_path` / `size_bytes`,
-- rename to `file_path` / `file_size` so the API can query consistently.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_documents'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'admin_documents'
        and column_name = 'storage_path'
    ) and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'admin_documents'
        and column_name = 'file_path'
    ) then
      alter table public.admin_documents rename column storage_path to file_path;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'admin_documents'
        and column_name = 'size_bytes'
    ) and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'admin_documents'
        and column_name = 'file_size'
    ) then
      alter table public.admin_documents rename column size_bytes to file_size;
    end if;
  end if;
end
$$;

