-- Run in the Supabase SQL Editor after the existing product and price_history tables exist.
-- This migration keeps imported COG immutable and makes price changes auditable.

create table if not exists public.cost_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_at timestamptz not null default now(),
  imported_by text,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0
);

create table if not exists public.cost_import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.cost_imports(id) on delete cascade,
  product_code text not null,
  product_name text,
  product_group text,
  source_price numeric,
  cog numeric,
  row_status text not null check (row_status in ('accepted', 'invalid_cog', 'duplicate', 'product_not_found')),
  created_at timestamptz not null default now()
);

create table if not exists public.product_cost_versions (
  id bigint generated always as identity primary key,
  product_code text not null,
  cog numeric not null check (cog >= 0),
  import_id uuid not null references public.cost_imports(id) on delete restrict,
  effective_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (product_code, import_id)
);

create unique index if not exists product_cost_versions_one_current
  on public.product_cost_versions (lower(product_code)) where superseded_at is null;

alter table public.price_history
  add column if not exists cost_snapshot numeric,
  add column if not exists gross_margin_baht numeric,
  add column if not exists override_name text,
  add column if not exists override_reason text;

create or replace view public.current_product_costs
with (security_invoker = true)
as
select distinct on (lower(product_code))
  product_code, cog, import_id, effective_at
from public.product_cost_versions
where superseded_at is null
order by lower(product_code), effective_at desc, id desc;

-- The client previews first. This RPC validates again before changing the active COG.
create or replace function public.import_product_costs(
  p_file_name text,
  p_imported_by text,
  p_rows jsonb
) returns table(import_id uuid, accepted_rows integer, invalid_rows integer, duplicate_rows integer, product_not_found_rows integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import_id uuid;
  v_row jsonb;
  v_code text;
  v_cog numeric;
  v_seen text[] := '{}';
  v_accepted integer := 0;
  v_invalid integer := 0;
  v_duplicate integer := 0;
  v_missing integer := 0;
begin
  insert into cost_imports (file_name, imported_by, total_rows)
  values (p_file_name, nullif(trim(p_imported_by), ''), jsonb_array_length(p_rows))
  returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_code := nullif(trim(v_row->>'code'), '');
    v_cog := nullif(v_row->>'cog', '')::numeric;
    if v_code is null or v_cog is null or v_cog < 0 then
      v_invalid := v_invalid + 1;
      insert into cost_import_rows (import_id, product_code, product_name, product_group, source_price, cog, row_status)
      values (v_import_id, coalesce(v_code, '(missing)'), v_row->>'name', v_row->>'group', nullif(v_row->>'price', '')::numeric, v_cog, 'invalid_cog');
    elsif lower(v_code) = any(v_seen) then
      v_duplicate := v_duplicate + 1;
      insert into cost_import_rows (import_id, product_code, product_name, product_group, source_price, cog, row_status)
      values (v_import_id, v_code, v_row->>'name', v_row->>'group', nullif(v_row->>'price', '')::numeric, v_cog, 'duplicate');
    elsif not exists (select 1 from products where lower(code) = lower(v_code)) then
      v_missing := v_missing + 1;
      v_seen := array_append(v_seen, lower(v_code));
      insert into cost_import_rows (import_id, product_code, product_name, product_group, source_price, cog, row_status)
      values (v_import_id, v_code, v_row->>'name', v_row->>'group', nullif(v_row->>'price', '')::numeric, v_cog, 'product_not_found');
    else
      v_accepted := v_accepted + 1;
      v_seen := array_append(v_seen, lower(v_code));
      insert into cost_import_rows (import_id, product_code, product_name, product_group, source_price, cog, row_status)
      values (v_import_id, v_code, v_row->>'name', v_row->>'group', nullif(v_row->>'price', '')::numeric, v_cog, 'accepted');
      update product_cost_versions set superseded_at = now()
        where lower(product_code) = lower(v_code) and superseded_at is null;
      insert into product_cost_versions (product_code, cog, import_id) values (v_code, v_cog, v_import_id);
    end if;
  end loop;
  update cost_imports set accepted_rows = v_accepted where id = v_import_id;
  return query select v_import_id, v_accepted, v_invalid, v_duplicate, v_missing;
end;
$$;

create or replace function public.apply_product_price_changes(p_changes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_change jsonb;
  v_code text;
  v_new_price numeric;
  v_current_price numeric;
  v_cog numeric;
  v_override_name text;
  v_override_reason text;
begin
  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_code := trim(v_change->>'code');
    v_new_price := (v_change->>'new_price')::numeric;
    v_override_name := nullif(trim(v_change->>'override_name'), '');
    v_override_reason := nullif(trim(v_change->>'override_reason'), '');
    select price into v_current_price from products where lower(code) = lower(v_code) for update;
    if v_current_price is null then raise exception 'Product % was not found', v_code; end if;
    select cog into v_cog from current_product_costs where lower(product_code) = lower(v_code);
    if v_cog is null then raise exception 'COG is missing for product %', v_code; end if;
    if v_new_price < v_cog and (v_override_name is null or v_override_reason is null) then
      raise exception 'An approver name and reason are required below COG for %', v_code;
    end if;
    update products set price = v_new_price where lower(code) = lower(v_code);
    insert into price_history (product_code, previous_price, new_price, source, cost_snapshot, gross_margin_baht, override_name, override_reason)
    values (v_code, v_current_price, v_new_price, coalesce(v_change->>'source', 'manual_edit'), v_cog, v_new_price - v_cog, v_override_name, v_override_reason);
  end loop;
end;
$$;

alter table public.cost_imports enable row level security;
alter table public.cost_import_rows enable row level security;
alter table public.product_cost_versions enable row level security;

-- Enable these policies once the app has Supabase Auth. They deliberately do not grant anon access.
create policy "authenticated cost imports" on public.cost_imports for select to authenticated using (true);
create policy "authenticated cost import rows" on public.cost_import_rows for select to authenticated using (true);
create policy "authenticated current costs" on public.product_cost_versions for select to authenticated using (true);
create policy "authenticated write cost imports" on public.cost_imports for insert to authenticated with check (true);
create policy "authenticated write cost import rows" on public.cost_import_rows for insert to authenticated with check (true);
create policy "authenticated write cost versions" on public.product_cost_versions for insert to authenticated with check (true);
create policy "authenticated supersede cost versions" on public.product_cost_versions for update to authenticated using (true) with check (true);
grant select on public.current_product_costs to authenticated;
grant execute on function public.import_product_costs(text, text, jsonb) to authenticated;
grant execute on function public.apply_product_price_changes(jsonb) to authenticated;
