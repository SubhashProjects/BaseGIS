-- PowerGIS scalability layer.
-- Keeps large authorised GIS reads paginated and moves dashboard aggregation to PostgreSQL.
-- Apply after 006_authentication_hardening.sql.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create index if not exists gis_assets_created_id_ix
  on public.gis_assets(created_at desc, id desc);
create index if not exists gis_assets_type_status_ix
  on public.gis_assets(asset_type, status);
create index if not exists gis_assets_shared_created_ix
  on public.gis_assets(shared_boundary, created_at desc, id desc);
create index if not exists organization_users_role_scope_ix
  on public.organization_users(role, scope_field, scope_value);
create index if not exists organization_users_jurisdictions_gin
  on public.organization_users using gin(jurisdiction_ids);
create index if not exists powergis_sessions_expires_ix
  on public.powergis_sessions(expires_at);
create index if not exists powergis_sessions_user_ix
  on public.powergis_sessions(user_id, expires_at);

drop function if exists public.visible_assets_page cascade;
drop function if exists public.visible_assets_page(text, integer, timestamptz, text) cascade;
create or replace function public.visible_assets_page(
  p_session_token text,
  p_limit integer default 1000,
  p_after_created_at timestamptz default null,
  p_after_id text default null
)
returns table(
  total_count bigint,
  id text, asset_no text, asset_type text, status text,
  latitude double precision, longitude double precision, geometry jsonb,
  jurisdiction_ids text[], owner_je_ids text[], shared_boundary boolean, metadata jsonb,
  created_at timestamptz
)
language sql stable security definer set search_path = public, extensions
as $$
  with u as (
    select o.*
    from public.organization_users o
    join public.powergis_sessions s on s.user_id = o.id
    where s.token_hash = encode(digest(convert_to(coalesce(p_session_token, ''), 'UTF8'), 'sha256'), 'hex')
      and s.expires_at > now()
    limit 1
  ),
  allowed_je as (
    select j.id
    from public.organization_users j
    cross join u
    where j.role = 'JE' and (
      u.role = 'GIS_ADMIN'
      or (u.role = 'JE' and j.id = u.id)
      or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
      or (u.scope_field = 'division' and j.division = u.scope_value)
      or (u.scope_field = 'circle' and j.circle = u.scope_value)
      or (u.scope_field = 'department' and j.department = u.scope_value)
    )
  ),
  authorised as (
    select a.*
    from public.gis_assets a
    cross join u
    where u.role = 'GIS_ADMIN'
       or a.shared_boundary = true
       or a.owner_je_ids && array(select id from allowed_je)
  ),
  totals as (select count(*)::bigint as total_count from authorised),
  page as (
    select a.*
    from authorised a
    where (
      p_after_created_at is null
      or a.created_at < p_after_created_at
      or (a.created_at = p_after_created_at and a.id < coalesce(p_after_id, ''))
    )
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 1000), 5000))
  )
  select totals.total_count, page.id, page.asset_no, page.asset_type, page.status, page.latitude, page.longitude,
         ST_AsGeoJSON(page.geometry)::jsonb, page.jurisdiction_ids, page.owner_je_ids,
         page.shared_boundary, page.metadata, page.created_at
  from page cross join totals;
$$;

create or replace function public.visible_asset_stats(p_session_token text)
returns table(
  total_count bigint,
  active_count bigint,
  pending_count bigint,
  retired_count bigint,
  other_count bigint,
  by_type jsonb
)
language sql stable security definer set search_path = public, extensions
as $$
  with u as (
    select o.*
    from public.organization_users o
    join public.powergis_sessions s on s.user_id = o.id
    where s.token_hash = encode(digest(convert_to(coalesce(p_session_token, ''), 'UTF8'), 'sha256'), 'hex')
      and s.expires_at > now()
    limit 1
  ),
  allowed_je as (
    select j.id
    from public.organization_users j
    cross join u
    where j.role = 'JE' and (
      u.role = 'GIS_ADMIN'
      or (u.role = 'JE' and j.id = u.id)
      or (u.scope_field = 'subdivision' and j.subdivision = u.scope_value)
      or (u.scope_field = 'division' and j.division = u.scope_value)
      or (u.scope_field = 'circle' and j.circle = u.scope_value)
      or (u.scope_field = 'department' and j.department = u.scope_value)
    )
  ),
  authorised as (
    select a.asset_type, a.status
    from public.gis_assets a
    cross join u
    where u.role = 'GIS_ADMIN'
       or a.shared_boundary = true
       or a.owner_je_ids && array(select id from allowed_je)
  ),
  typed as (
    select asset_type, count(*)::bigint as count
    from authorised
    group by asset_type
  )
  select
    count(*)::bigint,
    count(*) filter (where status = 'ACTIVE')::bigint,
    count(*) filter (where status in ('DRAFT','SUBMITTED','JE_REVIEW','AE_REVIEW'))::bigint,
    count(*) filter (where status = 'RETIRED')::bigint,
    count(*) filter (where status not in ('ACTIVE','DRAFT','SUBMITTED','JE_REVIEW','AE_REVIEW','RETIRED'))::bigint,
    coalesce((select jsonb_object_agg(asset_type, count) from typed), '{}'::jsonb)
  from authorised;
$$;

revoke all on function public.visible_assets_page(text, integer, timestamptz, text) from public;
revoke all on function public.visible_asset_stats(text) from public;
grant execute on function public.visible_assets_page(text, integer, timestamptz, text) to anon, authenticated;
grant execute on function public.visible_asset_stats(text) to anon, authenticated;
