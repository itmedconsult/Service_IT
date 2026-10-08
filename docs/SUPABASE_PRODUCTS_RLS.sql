-- Review in a non-production branch before applying to production.
-- The WordPress plugin requires a signed-in user whose app_metadata.role is
-- price_admin or admin. Browser clients use a publishable key, never service_role.

alter table public.products enable row level security;

revoke insert, update, delete on table public.products from anon;
revoke insert, delete on table public.products from authenticated;
grant select on table public.products to anon, authenticated;
grant update on table public.products to authenticated;

drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
on public.products
for select
to anon, authenticated
using (true);

drop policy if exists "Price admins can update products" on public.products;
create policy "Price admins can update products"
on public.products
for update
to authenticated
using (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('price_admin', 'admin')
)
with check (
  coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('price_admin', 'admin')
);
