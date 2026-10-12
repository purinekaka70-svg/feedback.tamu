-- Existing Supabase tables may have bigint IDs without the sequence defaults
-- declared in the original schema. Restore defaults without replacing data.
do $$
declare
  target_table text;
  sequence_name text;
  sequence_ref text;
begin
  foreach target_table in array array[
    'users',
    'businesses',
    'categories',
    'products',
    'cart',
    'orders',
    'order_items',
    'order_route_breakdown',
    'payments',
    'deliveries',
    'employees',
    'app_realtime_events'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    if not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and information_schema.columns.table_name = target_table
         and column_name = 'id'
    ) then
      continue;
    end if;

    sequence_ref := pg_get_serial_sequence(format('public.%I', target_table), 'id');
    if sequence_ref is null then
      sequence_name := target_table || '_id_seq';
      execute format('create sequence if not exists public.%I', sequence_name);
      execute format('alter sequence public.%I owned by public.%I.id', sequence_name, target_table);
      execute format(
        'alter table public.%I alter column id set default nextval(%L::regclass)',
        target_table,
        'public.' || sequence_name
      );
      sequence_ref := 'public.' || sequence_name;
    end if;

    execute format(
      'select setval(%L, coalesce(max(id), 0) + 1, false) from public.%I',
      sequence_ref,
      target_table
    );
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage, select, update on all sequences in schema public to service_role;
  end if;
end;
$$;
