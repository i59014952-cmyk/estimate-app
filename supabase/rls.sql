-- ============================================================================
--  Kub·House — Row Level Security + capability RPCs
-- ----------------------------------------------------------------------------
--  Run this in the Supabase SQL editor. It locks every table so the anonymous
--  publishable key can no longer read or write directly, and exposes the few
--  flows the public pages need (client.html, vendor.html) through narrow
--  SECURITY DEFINER functions keyed by a secret token/slug.
--
--  ROLLOUT ORDER (important — do not run this first):
--    1. Auth > Users > "Add user": create your estimator login (email+password).
--    2. Deploy the new frontend (it sends your JWT after login).
--    3. Log in at the site and confirm the app works (RLS still off here).
--    4. Run THIS script. Now anon is blocked; you (authenticated) keep working.
--    5. Open a client.html?token=… and vendor.html?token=… link and verify
--       they still load and save.
--  If anything breaks, you can re-open access by running: the DISABLE block at
--  the bottom (commented out).
-- ============================================================================

-- 1) Enable RLS and DROP ALL pre-existing policies, then add only ours -------
--    These tables already carried permissive "allow everyone" policies from
--    when the base was fully open; just enabling RLS leaves those in force
--    (policies are OR-combined). So wipe every existing policy first.
do $$
declare t text; r record;
begin
  foreach t in array array[
    'kh_objects','kh_user_catalog','kh_events','kh_hidden',
    'kh_contractors','kh_vendor_prices','kh_client_estimates'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- 2) Authenticated operator (logged-in estimator) — full access everywhere ---
do $$
declare t text;
begin
  foreach t in array array[
    'kh_objects','kh_user_catalog','kh_events','kh_hidden',
    'kh_contractors','kh_vendor_prices','kh_client_estimates'
  ]
  loop
    execute format(
      'create policy auth_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 3) Anonymous capability access for the vendor price page -------------------
--    kh_vendor_prices is the vendor's own list, reached via a secret slug in
--    the URL. Direct table access stays open to anon (its columns are not
--    introspectable yet — table is empty). See note (5) for hardening.
drop policy if exists vp_anon_sel on public.kh_vendor_prices;
drop policy if exists vp_anon_ins on public.kh_vendor_prices;
drop policy if exists vp_anon_upd on public.kh_vendor_prices;
drop policy if exists vp_anon_del on public.kh_vendor_prices;
create policy vp_anon_sel on public.kh_vendor_prices for select to anon using (true);
create policy vp_anon_ins on public.kh_vendor_prices for insert to anon with check (true);
create policy vp_anon_upd on public.kh_vendor_prices for update to anon using (true) with check (true);
create policy vp_anon_del on public.kh_vendor_prices for delete to anon using (true);

-- 4) Narrow RPCs for the public pages (run as owner, bypass RLS) -------------

-- Vendor profile by slug (vendor.html). Returns only this vendor's fields,
-- so the kh_contractors table itself stays fully private.
create or replace function public.kh_vendor_get(p_slug text)
returns table (name text, email text, org text)
language sql stable security definer set search_path = public as $$
  select name, email, org from public.kh_contractors where slug = p_slug limit 1;
$$;

-- Client estimate read by token (client.html). NULL = link not found.
create or replace function public.kh_client_estimate_get(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(rows, '[]'::jsonb) from public.kh_client_estimates where token = p_token limit 1;
$$;

-- Client estimate save by token (client.html).
create or replace function public.kh_client_estimate_save(p_token text, p_rows jsonb)
returns void
language sql security definer set search_path = public as $$
  update public.kh_client_estimates set rows = p_rows, updated_at = now() where token = p_token;
$$;

revoke all on function public.kh_vendor_get(text)              from public;
revoke all on function public.kh_client_estimate_get(text)     from public;
revoke all on function public.kh_client_estimate_save(text, jsonb) from public;
grant execute on function public.kh_vendor_get(text)              to anon, authenticated;
grant execute on function public.kh_client_estimate_get(text)     to anon, authenticated;
grant execute on function public.kh_client_estimate_save(text, jsonb) to anon, authenticated;

-- 5) OPTIONAL HARDENING (do after verifying kh_vendor_prices columns) --------
--    To also close kh_vendor_prices to direct anon access, drop the vp_anon_*
--    policies above and route vendor.html through SECURITY DEFINER RPCs keyed
--    by slug (list / upsert / update-by-id-and-slug / delete-by-id-and-slug),
--    mirroring the client RPCs. This needs the real column list, so confirm it
--    first:  select column_name from information_schema.columns
--            where table_name = 'kh_vendor_prices';

-- ----------------------------------------------------------------------------
-- ROLLBACK (re-open everything — emergency use only):
--   alter table public.kh_objects disable row level security;
--   ... repeat for each table ...
-- ============================================================================
