-- PREPARED ONLY. Review/apply separately before deploying Phase 3. NOT applied by Codex.
-- Requires the existing public.admin_users(user_id) table and its working self-read policy.
begin;

create table public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  request_type text not null check (request_type in ('game_request', 'feedback')),
  game_name text check (game_name is null or char_length(btrim(game_name)) between 1 and 120),
  requested_item text check (requested_item is null or char_length(btrim(requested_item)) between 1 and 160),
  feedback_category text check (feedback_category is null or feedback_category in ('General', 'Storefront', 'Checkout', 'Product Request', 'Other')),
  message text check (message is null or char_length(btrim(message)) between 1 and 2000),
  contact text check (contact is null or char_length(btrim(contact)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'added', 'rejected')),
  created_at timestamptz not null default now(),
  constraint customer_requests_fields check (
    (request_type = 'game_request' and game_name is not null and feedback_category is null)
    or (request_type = 'feedback' and game_name is null and requested_item is null and feedback_category is not null and message is not null)
  ),
  constraint customer_requests_plain_text check (
    coalesce(game_name, '') !~ '[<>]' and coalesce(requested_item, '') !~ '[<>]'
    and coalesce(message, '') !~ '[<>]' and coalesce(contact, '') !~ '[<>]'
  )
);

create index customer_requests_created_at_idx on public.customer_requests (created_at desc, id);
alter table public.customer_requests enable row level security;

-- Clear inherited default grants on THIS new table only.
revoke all on table public.customer_requests from public, anon, authenticated, service_role;
grant select on table public.customer_requests to authenticated;
grant update (status) on table public.customer_requests to authenticated;
grant insert, select on table public.customer_requests to service_role;

-- Anonymous customers submit through POST /api/requests. Direct anonymous INSERT
-- is intentionally denied so validation/honeypot/throttle cannot be bypassed via REST.
-- There is no public read policy, and authenticated non-admins receive no visible rows.
create policy customer_requests_admin_read on public.customer_requests
  for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy customer_requests_admin_status on public.customer_requests
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

commit;
