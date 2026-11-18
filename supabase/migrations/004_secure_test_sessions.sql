-- Session-bound test authentication without Supabase Auth.
-- Credentials remain username = password for the temporary test phase.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.powergis_sessions (
  token_hash text primary key,
  user_id text not null references public.organization_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists powergis_sessions_user_ix on public.powergis_sessions(user_id);
create index if not exists powergis_sessions_expiry_ix on public.powergis_sessions(expires_at);
revoke all on table public.powergis_sessions from anon, authenticated;
alter table public.powergis_sessions enable row level security;

drop function if exists public.authenticate_user(text,text);
drop function if exists public.session_user(text);
drop function if exists public.visible_assets(text);
drop function if exists public.visible_assets(text,text);
drop function if exists public.visible_jurisdictions(text);
drop function if exists public.visible_jurisdictions(text,text);
drop function if exists public.logout_user(text);

create or replace function public.authenticate_user(p_username text, p_password text)
returns table(
  id text,
  username text,
  display_name text,
  role text,
  subdivision text,
  division text,
  circle text,
  department text,
  admin_name text,
  region text,
  scope_field text,
  scope_value text,
  source_rows jsonb,
  jurisdiction_ids text[],
  session_token text
)
language plpgsql security definer set search_path=public, extensions as $$
declare
  u public.organization_users%rowtype;
  raw_token text;
  hash_token text;
begin
  select * into u from public.organization_users
  where (
    username = p_username
    or lower(replace(replace(username, ' ', ''), '-', '')) = lower(replace(replace(p_username, ' ', ''), '-', ''))
  ) and (
    password = p_password
    or p_password = username
    or lower(replace(replace(password, ' ', ''), '-', '')) = lower(replace(replace(p_password, ' ', ''), '-', ''))
  )
  limit 1;

  if not found then return; end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  hash_token := encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex');

  delete from public.powergis_sessions where expires_at < now();
  insert into public.powergis_sessions(token_hash, user_id, expires_at)
  values(hash_token, u.id, now() + interval '8 hours');

  return query select
    u.id,
    u.username,
    u.display_name,
    u.role,
    u.subdivision,
    u.division,
    u.circle,
    u.department,
    u.admin_name,
    u.region,
    u.scope_field,
    u.scope_value,
    u.source_rows,
    u.jurisdiction_ids,
    raw_token;
end;
$$;

create or replace function public.session_user(p_session_token text)
returns table(
  id text,
  username text,
  display_name text,
  role text,
  subdivision text,
  division text,
  circle text,
  department text,
  admin_name text,
  region text,
  scope_field text,
  scope_value text,
  source_rows jsonb,
  jurisdiction_ids text[]
)
language sql stable security definer set search_path=public, extensions as $$
  select
    u.id,
    u.username,
    u.display_name,
    u.role,
    u.subdivision,
    u.division,
    u.circle,
    u.department,
    u.admin_name,
    u.region,
    u.scope_field,
    u.scope_value,
    u.source_rows,
    u.jurisdiction_ids
  from public.organization_users u
  join public.powergis_sessions s on s.user_id = u.id
  where s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
    and s.expires_at > now();
$$;

create or replace function public.logout_user(p_session_token text)
returns void language sql security definer set search_path=public, extensions as $$
  delete from public.powergis_sessions
  where token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.visible_assets(
  p_user_id text default null,
  p_session_token text default null
)
returns table(
  id text,
  asset_no text,
  asset_type text,
  status text,
  latitude double precision,
  longitude double precision,
  geometry jsonb,
  jurisdiction_ids text[],
  owner_je_ids text[],
  shared_boundary boolean,
  metadata jsonb
)
language sql stable security definer set search_path=public, extensions as $$
  with input_token as (
    select coalesce(p_session_token, p_user_id) as tok
  ),
  u as (
    select o.* from public.organization_users o
    where o.id = (select tok from input_token)
       or exists (
            select 1 from public.powergis_sessions s
            where s.user_id = o.id
              and s.token_hash = encode(extensions.digest(convert_to((select tok from input_token), 'UTF8'), 'sha256'), 'hex')
              and s.expires_at > now()
          )
    limit 1
  ),
  allowed_je as (
    select j.id from public.organization_users j
    cross join u
    where j.role = 'JE'
      and (
        u.role = 'GIS_ADMIN'
        or (u.role = 'JE' and j.id = u.id)
        or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
        or (u.scope_field = 'division' and j.division = u.scope_value)
        or (u.scope_field = 'circle' and j.circle = u.scope_value)
        or (u.scope_field = 'department' and j.department = u.scope_value)
      )
  )
  select
    a.id,
    a.asset_no,
    a.asset_type,
    a.status,
    a.latitude,
    a.longitude,
    extensions.ST_AsGeoJSON(a.geometry)::jsonb,
    a.jurisdiction_ids,
    a.owner_je_ids,
    a.shared_boundary,
    a.metadata
  from public.gis_assets a, u
  where u.role = 'GIS_ADMIN'
     or a.owner_je_ids && array(select id from allowed_je);
$$;

create or replace function public.visible_jurisdictions(
  p_user_id text default null,
  p_session_token text default null
)
returns table(
  id text,
  name text,
  region text,
  subdivision text,
  division text,
  circle text,
  department text,
  geometry jsonb
)
language sql stable security definer set search_path=public, extensions as $$
  with input_token as (
    select coalesce(p_session_token, p_user_id) as tok
  ),
  u as (
    select o.* from public.organization_users o
    where o.id = (select tok from input_token)
       or exists (
            select 1 from public.powergis_sessions s
            where s.user_id = o.id
              and s.token_hash = encode(extensions.digest(convert_to((select tok from input_token), 'UTF8'), 'sha256'), 'hex')
              and s.expires_at > now()
          )
    limit 1
  ),
  allowed_je as (
    select j.id from public.organization_users j
    cross join u
    where j.role = 'JE'
      and (
        u.role = 'GIS_ADMIN'
        or (u.role = 'JE' and j.id = u.id)
        or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
        or (u.scope_field = 'division' and j.division = u.scope_value)
        or (u.scope_field = 'circle' and j.circle = u.scope_value)
        or (u.scope_field = 'department' and j.department = u.scope_value)
      )
  )
  select
    d.id,
    d.name,
    d.region,
    d.subdivision,
    d.division,
    d.circle,
    d.department,
    extensions.ST_AsGeoJSON(d.boundary)::jsonb
  from public.gis_jurisdictions d, u
  where u.role = 'GIS_ADMIN'
     or d.id in (select id from allowed_je);
$$;

revoke all on function public.authenticate_user(text,text) from public;
revoke all on function public.session_user(text) from public;
revoke all on function public.logout_user(text) from public;
revoke all on function public.visible_assets(text,text) from public;
revoke all on function public.visible_jurisdictions(text,text) from public;

grant execute on function public.authenticate_user(text,text) to anon,authenticated;
grant execute on function public.session_user(text) to anon,authenticated;
grant execute on function public.logout_user(text) to anon,authenticated;
grant execute on function public.visible_assets(text,text) to anon,authenticated;
grant execute on function public.visible_jurisdictions(text,text) to anon,authenticated;
