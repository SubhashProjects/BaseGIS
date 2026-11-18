create extension if not exists postgis with schema extensions;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('GIS_ADMIN','AE','JE','CONTRACTOR');
  end if;
  if not exists (select 1 from pg_type where typname = 'asset_status') then
    create type public.asset_status as enum ('DRAFT','SUBMITTED','JE_REVIEW','AE_REVIEW','APPROVED','REJECTED','ACTIVE','RETIRED');
  end if;
end $$;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'CONTRACTOR',
  created_at timestamptz not null default now()
);

create table if not exists public.jurisdictions(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null,
  parent_id uuid references public.jurisdictions(id),
  boundary geometry(MultiPolygon,4326),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_jurisdictions(
  user_id uuid not null references public.profiles(id) on delete cascade,
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  primary key(user_id,jurisdiction_id)
);

create table if not exists public.asset_types(
  id text primary key,
  label text not null,
  geometry_type text not null,
  active boolean not null default true
);

insert into public.asset_types(id,label,geometry_type) values
  ('SUBSTATION','Substation','POINT'),
  ('EHV_LINE','EHV Line','LINESTRING'),
  ('HV_LINE','HV Line','LINESTRING'),
  ('DT','Distribution Transformer','POINT'),
  ('LT_LINE','LT Line','LINESTRING'),
  ('POLE','Pole','POINT'),
  ('SMART_METER','Smart Meter','POINT')
on conflict (id) do nothing;

create table if not exists public.assets(
  id uuid primary key default gen_random_uuid(),
  asset_no text not null unique,
  asset_type text not null references public.asset_types(id),
  status public.asset_status not null default 'DRAFT',
  geometry geometry(Geometry,4326),
  latitude double precision,
  longitude double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_jurisdictions(
  asset_id uuid not null references public.assets(id) on delete cascade,
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  relation text not null default 'SPATIAL_INTERSECTION',
  primary key(asset_id,jurisdiction_id)
);

create table if not exists public.asset_submissions(
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete set null,
  submitted_by uuid references public.profiles(id),
  stage public.asset_status not null default 'SUBMITTED',
  comments text,
  submitted_at timestamptz not null default now()
);

create table if not exists public.approval_history(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.asset_submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  from_stage public.asset_status,
  to_stage public.asset_status not null,
  comments text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jurisdictions_boundary_gix on public.jurisdictions using gist(boundary);
create index if not exists assets_geometry_gix on public.assets using gist(geometry);
create index if not exists asset_jurisdictions_jid_ix on public.asset_jurisdictions(jurisdiction_id);

create or replace function public.is_gis_admin() returns boolean language sql stable security definer set search_path=public, extensions as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='GIS_ADMIN');
$$;

create or replace function public.user_can_see_asset(aid uuid) returns boolean language sql stable security definer set search_path=public, extensions as $$
  select public.is_gis_admin() or exists(
    select 1 from public.user_jurisdictions uj
    join public.asset_jurisdictions aj on aj.jurisdiction_id=uj.jurisdiction_id
    where uj.user_id=auth.uid() and aj.asset_id=aid
  );
$$;

create or replace function public.auto_assign_asset_jurisdictions() returns trigger language plpgsql security definer set search_path=public, extensions as $$
begin
  delete from public.asset_jurisdictions where asset_id=new.id;
  insert into public.asset_jurisdictions(asset_id,jurisdiction_id)
  select new.id,j.id from public.jurisdictions j
  where j.boundary is not null and new.geometry is not null and extensions.ST_Intersects(j.boundary,new.geometry);
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_asset_jurisdictions on public.assets;
create trigger trg_auto_assign_asset_jurisdictions after insert or update of geometry on public.assets for each row execute function public.auto_assign_asset_jurisdictions();

alter table public.profiles enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.user_jurisdictions enable row level security;
alter table public.assets enable row level security;
alter table public.asset_jurisdictions enable row level security;
alter table public.asset_submissions enable row level security;
alter table public.approval_history enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_self_or_admin on public.profiles;
create policy profiles_self_or_admin on public.profiles for select using (id=auth.uid() or public.is_gis_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all using (public.is_gis_admin()) with check (public.is_gis_admin());

drop policy if exists jurisdictions_visible on public.jurisdictions;
create policy jurisdictions_visible on public.jurisdictions for select using (public.is_gis_admin() or exists(select 1 from public.user_jurisdictions uj where uj.user_id=auth.uid() and (uj.jurisdiction_id=jurisdictions.id or uj.jurisdiction_id=jurisdictions.parent_id)));

drop policy if exists jurisdictions_admin_write on public.jurisdictions;
create policy jurisdictions_admin_write on public.jurisdictions for all using(public.is_gis_admin()) with check(public.is_gis_admin());

drop policy if exists user_jurisdictions_self_or_admin on public.user_jurisdictions;
create policy user_jurisdictions_self_or_admin on public.user_jurisdictions for select using(user_id=auth.uid() or public.is_gis_admin());

drop policy if exists user_jurisdictions_admin_write on public.user_jurisdictions;
create policy user_jurisdictions_admin_write on public.user_jurisdictions for all using(public.is_gis_admin()) with check(public.is_gis_admin());

drop policy if exists assets_visible_by_jurisdiction on public.assets;
create policy assets_visible_by_jurisdiction on public.assets for select using(public.user_can_see_asset(id));

drop policy if exists assets_insert_authorized on public.assets;
create policy assets_insert_authorized on public.assets for insert with check(public.is_gis_admin() or exists(select 1 from public.user_jurisdictions uj where uj.user_id=auth.uid() and exists(select 1 from public.jurisdictions j where j.id=uj.jurisdiction_id and j.boundary is not null and geometry is not null and extensions.ST_Intersects(j.boundary,assets.geometry))));

drop policy if exists assets_update_authorized on public.assets;
create policy assets_update_authorized on public.assets for update using(public.user_can_see_asset(id)) with check(public.user_can_see_asset(id));

drop policy if exists assets_admin_delete on public.assets;
create policy assets_admin_delete on public.assets for delete using(public.is_gis_admin());

drop policy if exists asset_jurisdictions_visible on public.asset_jurisdictions;
create policy asset_jurisdictions_visible on public.asset_jurisdictions for select using(public.user_can_see_asset(asset_id));

drop policy if exists submissions_visible on public.asset_submissions;
create policy submissions_visible on public.asset_submissions for select using(public.is_gis_admin() or submitted_by=auth.uid() or (asset_id is not null and public.user_can_see_asset(asset_id)));

drop policy if exists submissions_insert on public.asset_submissions;
create policy submissions_insert on public.asset_submissions for insert with check(public.is_gis_admin() or submitted_by=auth.uid());

drop policy if exists submissions_update on public.asset_submissions;
create policy submissions_update on public.asset_submissions for update using(public.is_gis_admin() or submitted_by=auth.uid());

drop policy if exists approvals_visible on public.approval_history;
create policy approvals_visible on public.approval_history for select using(public.is_gis_admin() or actor_id=auth.uid());

drop policy if exists audit_admin_or_self on public.audit_logs;
create policy audit_admin_or_self on public.audit_logs for select using(public.is_gis_admin() or actor_id=auth.uid());
