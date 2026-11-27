-- PowerGIS authentication hardening.
-- Apply after 004_secure_test_sessions.sql. Existing test passwords are migrated
-- to bcrypt hashes; plaintext values are not retained.
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

alter table public.organization_users
  add column if not exists password text not null default '';

update public.organization_users
set password = crypt(password, gen_salt('bf', 12))
where coalesce(password, '') <> ''
  and password !~ '^\$2[aby]\$';

drop function if exists public.authenticate_user cascade;
drop function if exists public.authenticate_user(text, text) cascade;
create or replace function public.authenticate_user(p_username text, p_password text)
returns table(
  id text, username text, display_name text, role text,
  subdivision text, division text, circle text, department text,
  admin_name text, region text, scope_field text, scope_value text,
  source_rows jsonb, jurisdiction_ids text[], session_token text
)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u public.organization_users%rowtype;
  raw_token text;
  hash_token text;
begin
  if coalesce(trim(p_username), '') = '' or coalesce(p_password, '') = '' then
    return;
  end if;

  select o.* into u
  from public.organization_users o
  where lower(trim(o.username)) = lower(trim(p_username))
    and coalesce(o.password, '') <> ''
    and o.password = crypt(p_password, o.password)
  limit 1;

  if not found then return; end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  hash_token := encode(digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex');

  delete from public.powergis_sessions ps where ps.expires_at < now();
  insert into public.powergis_sessions(token_hash, user_id, expires_at)
  values(hash_token, u.id, now() + interval '8 hours');

  return query select
    u.id, u.username, u.display_name, u.role, u.subdivision, u.division,
    u.circle, u.department, u.admin_name, u.region, u.scope_field,
    u.scope_value, u.source_rows, u.jurisdiction_ids, raw_token;
end;
$$;

revoke all on function public.authenticate_user(text, text) from public;
grant execute on function public.authenticate_user(text, text) to anon, authenticated;

-- Session lookup is the only supported way for the browser to restore a user.
revoke all on function public.session_user(text) from public;
grant execute on function public.session_user(text) to anon, authenticated;
revoke all on function public.logout_user(text) from public;
grant execute on function public.logout_user(text) to anon, authenticated;

-- The earlier test RPCs also accepted a raw user ID as an identity token.
-- These replacements require a valid, unexpired session token exclusively.
create or replace function public.visible_assets(
  p_user_id text default null,
  p_session_token text default null
)
returns table(
  id text, asset_no text, asset_type text, status text,
  latitude double precision, longitude double precision, geometry jsonb,
  jurisdiction_ids text[], owner_je_ids text[], shared_boundary boolean, metadata jsonb
)
language sql stable security definer set search_path = public, extensions
as $$
  with u as (
    select o.* from public.organization_users o
    join public.powergis_sessions s on s.user_id = o.id
    where s.token_hash = encode(digest(convert_to(coalesce(p_session_token, ''), 'UTF8'), 'sha256'), 'hex')
      and s.expires_at > now()
    limit 1
  ),
  allowed_je as (
    select j.id from public.organization_users j cross join u
    where j.role = 'JE' and (
      u.role = 'GIS_ADMIN' or (u.role = 'JE' and j.id = u.id)
      or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
      or (u.scope_field = 'division' and j.division = u.scope_value)
      or (u.scope_field = 'circle' and j.circle = u.scope_value)
      or (u.scope_field = 'department' and j.department = u.scope_value)
    )
  )
  select a.id, a.asset_no, a.asset_type, a.status, a.latitude, a.longitude,
    ST_AsGeoJSON(a.geometry)::jsonb, a.jurisdiction_ids, a.owner_je_ids,
    a.shared_boundary, a.metadata
  from public.gis_assets a cross join u
  where u.role = 'GIS_ADMIN' or a.owner_je_ids && array(select id from allowed_je);
$$;

create or replace function public.visible_jurisdictions(
  p_user_id text default null,
  p_session_token text default null
)
returns table(
  id text, name text, region text, subdivision text, division text,
  circle text, department text, geometry jsonb
)
language sql stable security definer set search_path = public, extensions
as $$
  with u as (
    select o.* from public.organization_users o
    join public.powergis_sessions s on s.user_id = o.id
    where s.token_hash = encode(digest(convert_to(coalesce(p_session_token, ''), 'UTF8'), 'sha256'), 'hex')
      and s.expires_at > now()
    limit 1
  ),
  allowed_je as (
    select j.id from public.organization_users j cross join u
    where j.role = 'JE' and (
      u.role = 'GIS_ADMIN' or (u.role = 'JE' and j.id = u.id)
      or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
      or (u.scope_field = 'division' and j.division = u.scope_value)
      or (u.scope_field = 'circle' and j.circle = u.scope_value)
      or (u.scope_field = 'department' and j.department = u.scope_value)
    )
  )
  select d.id, d.name, d.region, d.subdivision, d.division, d.circle,
    d.department, ST_AsGeoJSON(d.boundary)::jsonb
  from public.gis_jurisdictions d cross join u
  where u.role = 'GIS_ADMIN' or d.id in (select id from allowed_je);
$$;

revoke all on function public.visible_assets(text, text) from public;
revoke all on function public.visible_jurisdictions(text, text) from public;
grant execute on function public.visible_assets(text, text) to anon, authenticated;
grant execute on function public.visible_jurisdictions(text, text) to anon, authenticated;
