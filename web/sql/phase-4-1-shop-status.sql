-- PREPARED ONLY. NOT applied. Review/test separately before deploying Phase 4.1.
begin;
create table public.shop_settings (
  id boolean primary key default true check (id = true),
  is_open boolean not null default true
);
insert into public.shop_settings (id, is_open) values (true, true);
alter table public.shop_settings enable row level security;
revoke all on table public.shop_settings from public, anon, authenticated, service_role;
grant select on table public.shop_settings to service_role, authenticated;
grant update (is_open) on table public.shop_settings to authenticated;
create policy shop_settings_admin_read on public.shop_settings
  for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy shop_settings_admin_update on public.shop_settings
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
-- Public clients read only the status through GET /api/shop-status.
-- No unrelated tables, policies, functions, grants or cron are changed.
commit;
