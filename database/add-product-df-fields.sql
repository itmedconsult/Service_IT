-- Run once in the Supabase SQL Editor before deploying the DF form changes.
alter table public.products
  add column if not exists df_enabled boolean not null default false,
  add column if not exists df_percent numeric(5, 2);

-- Earlier versions of the table made this column NOT NULL while also using
-- NULL to mean that the product has no DF. Restore the intended model before
-- validating the data below.
alter table public.products
  alter column df_percent drop not null;

-- Preserve valid legacy DF values and clear inconsistent values before applying
-- the constraint. The original table used has_df; some interim rows have
-- df_enabled=true with a placeholder 0, which must not mark them as DF items.
update public.products
set
  df_enabled = coalesce(has_df, false) or (coalesce(df_enabled, false) and df_percent > 0),
  df_percent = case
    when coalesce(has_df, false) or (coalesce(df_enabled, false) and df_percent > 0)
      then df_percent
    else null
  end;

alter table public.products
  drop constraint if exists products_df_percent_check;

alter table public.products
  add constraint products_df_percent_check
  check (
    (df_enabled = false and df_percent is null)
    or (df_enabled = true and df_percent between 0 and 100)
  );
