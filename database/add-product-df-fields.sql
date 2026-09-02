-- Run once in the Supabase SQL Editor before deploying the DF form changes.
alter table public.products
  add column if not exists df_enabled boolean not null default false,
  add column if not exists df_percent numeric(5, 2);

-- Preserve valid legacy DF percentages and clear inconsistent values before
-- applying the constraint. Older rows had no df_enabled flag.
update public.products
set
  df_enabled = df_percent between 0 and 100,
  df_percent = case when df_percent between 0 and 100 then df_percent else null end;

alter table public.products
  drop constraint if exists products_df_percent_check;

alter table public.products
  add constraint products_df_percent_check
  check (
    (df_enabled = false and df_percent is null)
    or (df_enabled = true and df_percent between 0 and 100)
  );
