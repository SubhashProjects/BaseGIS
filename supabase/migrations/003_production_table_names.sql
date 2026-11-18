-- PowerGIS production-label migration for databases that previously ran the test-schema migration.
-- Safe to run after 002. It removes the old demo_* table/function names without requiring Auth users.
create extension if not exists postgis;

do $$ begin
  if to_regclass('public.demo_users') is not null and to_regclass('public.organization_users') is null then
    alter table public.demo_users rename to organization_users;
  end if;
  if to_regclass('public.demo_jurisdictions') is not null and to_regclass('public.gis_jurisdictions') is null then
    alter table public.demo_jurisdictions rename to gis_jurisdictions;
  end if;
  if to_regclass('public.demo_assets') is not null and to_regclass('public.gis_assets') is null then
    alter table public.demo_assets rename to gis_assets;
  end if;
end $$;

alter table if exists public.organization_users add column if not exists password text not null default '';
update public.organization_users set password = username where password = '';

-- Remove the old public RPC names before replacing them with production names.
drop function if exists public.demo_visible_assets(text);
drop function if exists public.demo_visible_jurisdictions(text);
drop function if exists public.demo_visible_users_for_login();
drop function if exists public.login_users();
drop function if exists public.authenticate_user(text,text);
drop function if exists public.visible_assets(text);
drop function if exists public.visible_jurisdictions(text);

create or replace function public.login_users()
returns table(id text, username text, display_name text, role text, subdivision text, division text, circle text, department text, admin_name text, region text, scope_field text, scope_value text, source_rows jsonb, jurisdiction_ids text[])
language sql stable security definer set search_path=public as $$
  select u.id,u.username,u.display_name,u.role,u.subdivision,u.division,u.circle,u.department,u.admin_name,u.region,u.scope_field,u.scope_value,u.source_rows,u.jurisdiction_ids
  from public.organization_users u
  order by case u.role when 'GIS_ADMIN' then 0 when 'SE' then 1 when 'EE' then 2 when 'AEE' then 3 when 'AE' then 4 when 'JE' then 5 else 6 end, u.display_name;
$$;

create or replace function public.authenticate_user(p_username text, p_password text)
returns table(id text, username text, display_name text, role text, subdivision text, division text, circle text, department text, admin_name text, region text, scope_field text, scope_value text, source_rows jsonb, jurisdiction_ids text[])
language sql stable security definer set search_path=public as $$
  select u.id,u.username,u.display_name,u.role,u.subdivision,u.division,u.circle,u.department,u.admin_name,u.region,u.scope_field,u.scope_value,u.source_rows,u.jurisdiction_ids
  from public.organization_users u
  where (
    u.username = p_username or
    lower(replace(replace(u.username, ' ', ''), '-', '')) = lower(replace(replace(p_username, ' ', ''), '-', ''))
  ) and (
    u.password = p_password or
    p_password = u.username or
    lower(replace(replace(u.password, ' ', ''), '-', '')) = lower(replace(replace(p_password, ' ', ''), '-', ''))
  )
  limit 1;
$$;

create or replace function public.visible_assets(p_user_id text)
returns table(id text, asset_no text, asset_type text, status text, latitude double precision, longitude double precision, geometry jsonb, jurisdiction_ids text[], owner_je_ids text[], shared_boundary boolean, metadata jsonb)
language sql stable security definer set search_path=public as $$
  with u as (select * from public.organization_users where id=p_user_id), allowed_je as (
    select j.id from public.organization_users j cross join u where j.role='JE' and (
      u.role='GIS_ADMIN' or
      (u.role='JE' and j.id=u.id) or
      (u.scope_field='subdivision' and j.subdivision=u.scope_value) or
      (u.scope_field='division' and j.division=u.scope_value) or
      (u.scope_field='circle' and j.circle=u.scope_value) or
      (u.scope_field='department' and j.department=u.scope_value)
    )
  )
  select a.id,a.asset_no,a.asset_type,a.status,a.latitude,a.longitude,ST_AsGeoJSON(a.geometry)::jsonb,a.jurisdiction_ids,a.owner_je_ids,a.shared_boundary,a.metadata
  from public.gis_assets a, u
  where u.role='GIS_ADMIN' or a.owner_je_ids && array(select id from allowed_je);
$$;

create or replace function public.visible_jurisdictions(p_user_id text)
returns table(id text, name text, region text, subdivision text, division text, circle text, department text, geometry jsonb)
language sql stable security definer set search_path=public as $$
  with u as (select * from public.organization_users where id=p_user_id), allowed_je as (
    select j.id from public.organization_users j cross join u where j.role='JE' and (
      u.role='GIS_ADMIN' or
      (u.role='JE' and j.id=u.id) or
      (u.scope_field='subdivision' and j.subdivision=u.scope_value) or
      (u.scope_field='division' and j.division=u.scope_value) or
      (u.scope_field='circle' and j.circle=u.scope_value) or
      (u.scope_field='department' and j.department=u.scope_value)
    )
  )
  select d.id,d.name,d.region,d.subdivision,d.division,d.circle,d.department,ST_AsGeoJSON(d.boundary)::jsonb
  from public.gis_jurisdictions d, u
  where u.role='GIS_ADMIN' or d.id in (select id from allowed_je);
$$;

revoke all on table public.organization_users from anon, authenticated;
revoke all on table public.gis_jurisdictions from anon, authenticated;
revoke all on table public.gis_assets from anon, authenticated;
grant execute on function public.login_users() to anon, authenticated;
grant execute on function public.authenticate_user(text,text) to anon, authenticated;
grant execute on function public.visible_assets(text) to anon, authenticated;
grant execute on function public.visible_jurisdictions(text) to anon, authenticated;
alter table public.organization_users enable row level security;
alter table public.gis_jurisdictions enable row level security;
alter table public.gis_assets enable row level security;

-- Remove simulator/demo naming from the seeded identifiers while preserving relationships.
update public.organization_users set id=replace(replace(id,'demo-','org-'),'sim-','org-');
update public.organization_users set jurisdiction_ids=array(select replace(replace(x,'demo-','org-'),'sim-','org-') from unnest(jurisdiction_ids) x);
update public.gis_jurisdictions set id=replace(replace(id,'demo-','org-'),'sim-','org-');
update public.gis_assets set id=replace(replace(id,'demo-','org-'),'sim-','org-');
update public.gis_assets set owner_je_ids=array(select replace(replace(x,'demo-','org-'),'sim-','org-') from unnest(owner_je_ids) x);
update public.gis_assets set metadata=replace(replace(metadata::text,'demoSeed','seedData'),'simulatorOnly','seedData')::jsonb;
