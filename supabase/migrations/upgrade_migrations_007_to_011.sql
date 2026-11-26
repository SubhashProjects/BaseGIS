
-- ==================================================================
-- MIGRATION: 007_scale_read_paths.sql
-- ==================================================================

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

-- ==================================================================
-- MIGRATION: 008_operational_security.sql
-- ==================================================================

-- Operational hardening: require a live opaque session token for every
-- data-management RPC. Raw user IDs are never accepted as credentials.
-- Backup manifests are REQUESTED until the trusted backup worker confirms storage.
create extension if not exists pgcrypto;
create table if not exists public.powergis_audit_events (
  id bigint generated always as identity primary key,
  actor_id text not null references public.organization_users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists powergis_audit_events_created_ix on public.powergis_audit_events(created_at desc);
create index if not exists powergis_audit_events_actor_ix on public.powergis_audit_events(actor_id, created_at desc);
revoke all on public.powergis_audit_events from anon, authenticated;
alter table public.powergis_audit_events enable row level security;

create or replace function public.admin_import_assets(p_session_token text, p_assets jsonb)
returns table(inserted integer, skipped integer, errors jsonb)
language plpgsql security definer set search_path=public, extensions as $$
declare
  u public.organization_users%rowtype;
  item jsonb;
  inserted_count integer := 0;
  skipped_count integer := 0;
  error_list jsonb := '[]'::jsonb;
  v_id text;
  v_asset_no text;
  v_asset_type text;
  v_status text;
  v_geometry geometry;
  v_lat double precision;
  v_lng double precision;
  v_metadata jsonb;
begin
  select o.* into u from public.organization_users o
  where exists (
          select 1 from public.powergis_sessions s
          where s.user_id = o.id
            and s.token_hash = encode(digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
            and s.expires_at > now()
        );
  if not found or u.role <> 'GIS_ADMIN' then raise exception 'Only GIS Admin can import GIS data'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_assets,'[]'::jsonb)) loop
    begin
      v_asset_no := nullif(trim(item->>'assetNo'),'');
      v_asset_type := nullif(trim(item->>'assetType'),'');
      v_status := coalesce(nullif(trim(item->>'status'),''),'ACTIVE');
      if v_asset_no is null then raise exception 'Missing asset number'; end if;
      if not exists(select 1 from public.asset_types where id=v_asset_type) then raise exception 'Unsupported asset type: %',v_asset_type; end if;
      if exists(select 1 from public.gis_assets where asset_no=v_asset_no) then
        skipped_count := skipped_count + 1;
        continue;
      end if;
      if item->'geometry' is null then raise exception 'Missing geometry'; end if;
      v_geometry := ST_SetSRID(ST_GeomFromGeoJSON(item->'geometry'),4326);
      if ST_IsEmpty(v_geometry) or not ST_IsValid(v_geometry) then raise exception 'Invalid geometry'; end if;
      v_lat := nullif(item->>'latitude','')::double precision;
      v_lng := nullif(item->>'longitude','')::double precision;
      if v_lat is null and GeometryType(v_geometry)='POINT' then v_lat := ST_Y(v_geometry); end if;
      if v_lng is null and GeometryType(v_geometry)='POINT' then v_lng := ST_X(v_geometry); end if;
      v_metadata := coalesce(item->'metadata','{}'::jsonb) || jsonb_build_object('importedAt',now(),'importedBy',u.id,'importSource','PowerGIS Data Import');
      v_id := 'imp-' || replace(gen_random_uuid()::text,'-','');
      insert into public.gis_assets(id,asset_no,asset_type,status,geometry,latitude,longitude,jurisdiction_ids,owner_je_ids,shared_boundary,visibility_rule,metadata)
      values (v_id,v_asset_no,v_asset_type,v_status,v_geometry,v_lat,v_lng,'{}','{}',false,'SPATIAL_AUTHORIZATION',v_metadata);
      update public.gis_assets a set
        jurisdiction_ids = coalesce((select array_agg(j.id) from public.gis_jurisdictions j where j.boundary is not null and ST_Intersects(j.boundary,a.geometry)),'{}'),
        owner_je_ids = coalesce((select array_agg(distinct u2.id) from public.organization_users u2 where u2.role='JE' and (u2.jurisdiction_ids && coalesce((select array_agg(j2.id) from public.gis_jurisdictions j2 where j2.boundary is not null and ST_Intersects(j2.boundary,a.geometry)),'{}'))),'{}')
      where a.id=v_id;
      inserted_count := inserted_count + 1;
    exception when others then
      error_list := error_list || jsonb_build_array(jsonb_build_object('assetNo',item->>'assetNo','error',SQLERRM));
      skipped_count := skipped_count + 1;
    end;
  end loop;
  insert into public.powergis_audit_events(actor_id, action, entity_type, details) values (u.id, 'IMPORT', 'GIS_ASSET_BATCH', jsonb_build_object('inserted', inserted_count, 'skipped', skipped_count, 'errors', jsonb_array_length(error_list)));
  return query select inserted_count, skipped_count, error_list;
end;$$;

create or replace function public.export_assets(p_session_token text)
returns table(id text,asset_no text,asset_type text,status text,latitude double precision,longitude double precision,geometry jsonb,jurisdiction_ids text[],owner_je_ids text[],shared_boundary boolean,metadata jsonb)
language sql stable security definer set search_path=public, extensions as $$
with u as (
  select o.* from public.organization_users o
  where exists (
          select 1 from public.powergis_sessions s
          where s.user_id = o.id
            and s.token_hash = encode(digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
            and s.expires_at > now()
        )
), allowed_je as (
 select j.id from public.organization_users j cross join u where j.role='JE' and (u.role='GIS_ADMIN' or (u.role='JE' and j.id=u.id) or (u.scope_field='subdivision' and j.subdivision=u.scope_value) or (u.scope_field='division' and j.division=u.scope_value) or (u.scope_field='circle' and j.circle=u.scope_value) or (u.scope_field='department' and j.department=u.scope_value))
)
select a.id,a.asset_no,a.asset_type,a.status,a.latitude,a.longitude,ST_AsGeoJSON(a.geometry)::jsonb,a.jurisdiction_ids,a.owner_je_ids,a.shared_boundary,a.metadata from public.gis_assets a,u where u.role='GIS_ADMIN' or a.shared_boundary = true or a.owner_je_ids && array(select id from allowed_je);
$$;

create or replace function public.create_backup_manifest(p_session_token text)
returns table(backup_id text,created_at timestamptz,status text,user_count integer,jurisdiction_count integer,asset_count integer)
language plpgsql security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype; b text := 'pg-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
begin
 select o.* into u from public.organization_users o
 where exists (
         select 1 from public.powergis_sessions s
         where s.user_id = o.id
           and s.token_hash = encode(digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
           and s.expires_at > now()
       );
 if not found or u.role <> 'GIS_ADMIN' then raise exception 'Only GIS Admin can create backups'; end if;
 insert into public.powergis_backup_runs(backup_id,status,user_count,jurisdiction_count,asset_count,completed_at) select b,'REQUESTED',(select count(*) from public.organization_users),(select count(*) from public.gis_jurisdictions),(select count(*) from public.gis_assets),null;
 return query select r.backup_id,r.created_at,r.status,r.user_count,r.jurisdiction_count,r.asset_count from public.powergis_backup_runs r where r.backup_id=b;
end;$$;

create or replace function public.list_backup_runs(p_session_token text)
returns table(backup_id text,created_at timestamptz,status text,storage_path text,user_count integer,jurisdiction_count integer,asset_count integer)
language sql stable security definer set search_path=public, extensions as $$
select r.backup_id,r.created_at,r.status,r.storage_path,r.user_count,r.jurisdiction_count,r.asset_count from public.powergis_backup_runs r
where exists(
  select 1 from public.organization_users u
  where (
    exists (
      select 1 from public.powergis_sessions s
      where s.user_id = u.id
        and s.token_hash = encode(digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
        and s.expires_at > now()
    )
  ) and u.role='GIS_ADMIN'
) order by r.created_at desc;
$$;
revoke all on function public.admin_import_assets(text,jsonb) from public;
revoke all on function public.export_assets(text) from public;
revoke all on function public.create_backup_manifest(text) from public;
revoke all on function public.list_backup_runs(text) from public;
grant execute on function public.admin_import_assets(text,jsonb) to anon, authenticated;
grant execute on function public.export_assets(text) to anon, authenticated;
grant execute on function public.create_backup_manifest(text) to anon, authenticated;
grant execute on function public.list_backup_runs(text) to anon, authenticated;

-- ==================================================================
-- MIGRATION: 009_operational_workflows.sql
-- ==================================================================

-- Operational workflows: optimistic concurrency, recoverable asset archive,
-- role-checked review transitions, and auditable mutations.
-- Apply after 008_operational_security.sql.

alter table public.gis_assets
  add column if not exists version integer not null default 1,
  add column if not exists archived_at timestamptz;

create index if not exists gis_assets_active_created_ix
  on public.gis_assets(created_at desc, id desc) where archived_at is null;
create index if not exists gis_assets_active_asset_no_ix
  on public.gis_assets(asset_no) where archived_at is null;

-- Keep browser roles read-only; all mutation is performed through session-bound RPCs.
revoke insert, update, delete on public.gis_assets from anon, authenticated;

create or replace function public.admin_update_asset(
  p_session_token text,
  p_asset_id text,
  p_expected_version integer,
  p_asset_no text,
  p_asset_type text,
  p_status text,
  p_geometry jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_jurisdiction_ids text[] default null,
  p_shared_boundary boolean default null
)
returns table(asset_id text, new_version integer, updated_at timestamptz)
language plpgsql security definer set search_path=public, extensions as $$
declare
  u public.organization_users%rowtype;
  a public.gis_assets%rowtype;
  g geometry;
begin
  select o.* into u
  from public.organization_users o
  join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
    and s.expires_at>now()
  limit 1;
  if not found or u.role <> 'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  if coalesce(trim(p_asset_no),'')='' or length(trim(p_asset_no))>120 then raise exception 'Asset number is required and must be 120 characters or fewer'; end if;
  if coalesce(trim(p_status),'') not in ('DRAFT','SUBMITTED','JE_REVIEW','AE_REVIEW','APPROVED','REJECTED','ACTIVE','RETIRED') then raise exception 'Unsupported asset status'; end if;
  if octet_length(coalesce(p_metadata,'{}'::jsonb)::text)>1048576 then raise exception 'Asset metadata exceeds the 1 MB limit'; end if;
  if not exists(select 1 from public.asset_types t where t.id=p_asset_type) then raise exception 'Unsupported asset type'; end if;
  if p_geometry is not null then
    g := ST_SetSRID(ST_GeomFromGeoJSON(p_geometry),4326);
    if g is null or ST_IsEmpty(g) or not ST_IsValid(g) then raise exception 'Invalid geometry'; end if;
    if ST_NPoints(g)>50000 then raise exception 'Geometry exceeds the 50000 vertex safety limit'; end if;
    if ST_XMin(Box3D(g)) < -180 or ST_XMax(Box3D(g)) > 180 or ST_YMin(Box3D(g)) < -90 or ST_YMax(Box3D(g)) > 90 then
      raise exception 'Geometry coordinates must be WGS84 longitude/latitude';
    end if;
  end if;
  select * into a from public.gis_assets where id=p_asset_id and archived_at is null for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.version <> p_expected_version then raise exception 'Asset was changed by another user; reload before editing' using errcode='40001'; end if;
  update public.gis_assets set
    asset_no=trim(p_asset_no), asset_type=p_asset_type, status=coalesce(nullif(trim(p_status),''),status),
    geometry=coalesce(g,geometry),
    latitude=case when g is not null and GeometryType(g)='POINT' then ST_Y(g) else latitude end,
    longitude=case when g is not null and GeometryType(g)='POINT' then ST_X(g) else longitude end,
    jurisdiction_ids=coalesce(p_jurisdiction_ids,jurisdiction_ids),
    shared_boundary=coalesce(p_shared_boundary,shared_boundary),
    metadata=coalesce(p_metadata,metadata), version=version+1
  where id=p_asset_id
  returning * into a;
  insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details)
  values(u.id,'UPDATE','GIS_ASSET',a.id,jsonb_build_object('version',a.version));
  return query select a.id,a.version,now();
end;$$;

create or replace function public.admin_archive_asset(
  p_session_token text, p_asset_id text, p_expected_version integer, p_reason text
)
returns table(asset_id text, archived_at timestamptz, new_version integer)
language plpgsql security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype; a public.gis_assets%rowtype;
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found or u.role<>'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  select * into a from public.gis_assets where id=p_asset_id and archived_at is null for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.version<>p_expected_version then raise exception 'Asset was changed by another user; reload before archiving' using errcode='40001'; end if;
  update public.gis_assets set archived_at=now(),version=version+1 where id=p_asset_id returning * into a;
  insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details)
  values(u.id,'ARCHIVE','GIS_ASSET',a.id,jsonb_build_object('reason',left(coalesce(p_reason,''),500),'version',a.version));
  return query select a.id,a.archived_at,a.version;
end;$$;

create or replace function public.admin_restore_asset(
  p_session_token text, p_asset_id text, p_expected_version integer
)
returns table(asset_id text, new_version integer)
language plpgsql security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype; a public.gis_assets%rowtype;
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found or u.role<>'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  select * into a from public.gis_assets where id=p_asset_id and archived_at is not null for update;
  if not found then raise exception 'Archived asset not found'; end if;
  if a.version<>p_expected_version then raise exception 'Asset was changed by another user; reload before restoring' using errcode='40001'; end if;
  if exists(select 1 from public.gis_assets x where x.asset_no=a.asset_no and x.archived_at is null and x.id<>a.id) then raise exception 'An active asset already uses this asset number'; end if;
  update public.gis_assets set archived_at=null,version=version+1 where id=p_asset_id returning * into a;
  insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details)
  values(u.id,'RESTORE','GIS_ASSET',a.id,jsonb_build_object('version',a.version));
  return query select a.id,a.version;
end;$$;

-- Controlled review state machine. No client can directly write status.
create or replace function public.review_asset_submission(
  p_session_token text,
  p_asset_id text,
  p_expected_version integer,
  p_decision text,
  p_comment text default null
)
returns table(asset_id text, status text, new_version integer)
language plpgsql security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype; a public.gis_assets%rowtype; next_status text; previous_status text; allowed boolean:=false;
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found then raise exception 'Valid session required' using errcode='42501'; end if;
  if lower(coalesce(p_decision,'')) not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;
  if lower(p_decision)='reject' and length(trim(coalesce(p_comment,'')))<3 then raise exception 'A rejection reason is required'; end if;
  select * into a from public.gis_assets where id=p_asset_id and archived_at is null for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.version<>p_expected_version then raise exception 'Submission changed; reload before reviewing' using errcode='40001'; end if;
  previous_status := a.status;
  if a.status='SUBMITTED' then
    allowed := u.role in ('GIS_ADMIN','JE') and (u.role='GIS_ADMIN' or a.owner_je_ids @> array[u.id]);
    next_status := case when lower(p_decision)='reject' then 'REJECTED' else 'JE_REVIEW' end;
  elsif a.status='JE_REVIEW' then
    allowed := u.role in ('GIS_ADMIN','AE','AEE','EE','SE') and (u.role='GIS_ADMIN' or a.jurisdiction_ids && coalesce(u.jurisdiction_ids,'{}'));
    next_status := case when lower(p_decision)='reject' then 'REJECTED' else 'AE_REVIEW' end;
  elsif a.status='AE_REVIEW' then
    allowed := u.role in ('GIS_ADMIN','AE','AEE','EE','SE') and (u.role='GIS_ADMIN' or a.jurisdiction_ids && coalesce(u.jurisdiction_ids,'{}'));
    next_status := case when lower(p_decision)='reject' then 'REJECTED' else 'APPROVED' end;
  else
    raise exception 'Asset is not in a reviewable stage';
  end if;
  if not allowed then raise exception 'You are not authorised to perform this review transition' using errcode='42501'; end if;
  update public.gis_assets set status=next_status,version=version+1 where id=p_asset_id returning * into a;
  insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details)
  values(u.id,upper(p_decision),'GIS_ASSET',a.id,jsonb_build_object('from',previous_status,'to',next_status,'comment',left(coalesce(p_comment,''),2000),'version',a.version));
  return query select a.id,a.status,a.version;
end;$$;

create or replace function public.list_operational_audit(p_session_token text,p_limit integer default 100)
returns table(id bigint,actor_id text,action text,entity_type text,entity_id text,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype;
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found or u.role<>'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  return query select e.id,e.actor_id,e.action,e.entity_type,e.entity_id,e.details,e.created_at
  from public.powergis_audit_events e order by e.created_at desc,e.id desc limit greatest(1,least(coalesce(p_limit,100),500));
end;$$;

revoke all on function public.admin_update_asset(text,text,integer,text,text,text,jsonb,jsonb,text[],boolean) from public;
revoke all on function public.admin_archive_asset(text,text,integer,text) from public;
revoke all on function public.admin_restore_asset(text,text,integer) from public;
revoke all on function public.review_asset_submission(text,text,integer,text,text) from public;
revoke all on function public.list_operational_audit(text,integer) from public;
grant execute on function public.admin_update_asset(text,text,integer,text,text,text,jsonb,jsonb,text[],boolean) to anon,authenticated;
grant execute on function public.admin_archive_asset(text,text,integer,text) to anon,authenticated;
grant execute on function public.admin_restore_asset(text,text,integer) to anon,authenticated;
grant execute on function public.review_asset_submission(text,text,integer,text,text) to anon,authenticated;
grant execute on function public.list_operational_audit(text,integer) to anon,authenticated;

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
    where a.archived_at is null
      and (u.role = 'GIS_ADMIN'
       or a.shared_boundary = true
       or a.owner_je_ids && array(select id from allowed_je))
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


create or replace function public.visible_assets_page_v2(
  p_session_token text, p_limit integer default 1000,
  p_after_created_at timestamptz default null, p_after_id text default null
)
returns table(
  total_count bigint, id text, asset_no text, asset_type text, status text,
  latitude double precision, longitude double precision, geometry jsonb,
  jurisdiction_ids text[], owner_je_ids text[], shared_boundary boolean, metadata jsonb,
  created_at timestamptz, version integer
)
language sql stable security definer set search_path=public, extensions as $$
  select p.total_count,p.id,p.asset_no,p.asset_type,p.status,p.latitude,p.longitude,p.geometry,
    p.jurisdiction_ids,p.owner_je_ids,p.shared_boundary,p.metadata,p.created_at,a.version
  from public.visible_assets_page(p_session_token,p_limit,p_after_created_at,p_after_id) p
  join public.gis_assets a on a.id=p.id and a.archived_at is null;
$$;
revoke all on function public.visible_assets_page_v2(text,integer,timestamptz,text) from public;
grant execute on function public.visible_assets_page_v2(text,integer,timestamptz,text) to anon,authenticated;


create or replace function public.admin_asset_version(p_session_token text,p_asset_id text)
returns integer language plpgsql stable security definer set search_path=public,extensions as $$
declare u public.organization_users%rowtype; v integer;
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found or u.role<>'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  select version into v from public.gis_assets where id=p_asset_id and archived_at is null;
  if v is null then raise exception 'Active asset not found'; end if;
  return v;
end;$$;
revoke all on function public.admin_asset_version(text,text) from public;
grant execute on function public.admin_asset_version(text,text) to anon,authenticated;

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
    where a.archived_at is null
      and (u.role = 'GIS_ADMIN'
       or a.shared_boundary = true
       or a.owner_je_ids && array(select id from allowed_je))
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


create or replace function public.export_assets(p_session_token text)
returns table(id text,asset_no text,asset_type text,status text,latitude double precision,longitude double precision,geometry jsonb,jurisdiction_ids text[],owner_je_ids text[],shared_boundary boolean,metadata jsonb)
language sql stable security definer set search_path=public, extensions as $$
with u as (
  select o.* from public.organization_users o
  where exists (
          select 1 from public.powergis_sessions s
          where s.user_id = o.id
            and s.token_hash = encode(digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
            and s.expires_at > now()
        )
), allowed_je as (
 select j.id from public.organization_users j cross join u where j.role='JE' and (u.role='GIS_ADMIN' or (u.role='JE' and j.id=u.id) or (u.scope_field='subdivision' and j.subdivision=u.scope_value) or (u.scope_field='division' and j.division=u.scope_value) or (u.scope_field='circle' and j.circle=u.scope_value) or (u.scope_field='department' and j.department=u.scope_value))
)
select a.id,a.asset_no,a.asset_type,a.status,a.latitude,a.longitude,ST_AsGeoJSON(a.geometry)::jsonb,a.jurisdiction_ids,a.owner_je_ids,a.shared_boundary,a.metadata from public.gis_assets a,u where a.archived_at is null and (u.role='GIS_ADMIN' or a.shared_boundary = true or a.owner_je_ids && array(select id from allowed_je));
$$;


-- Atomic bulk archive: either every selected active record is archived or none is.
create or replace function public.admin_archive_assets(p_session_token text,p_asset_ids text[])
returns integer language plpgsql security definer set search_path=public,extensions as $$
declare u public.organization_users%rowtype; n integer:=0; ids text[];
begin
  select o.* into u from public.organization_users o join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex') and s.expires_at>now() limit 1;
  if not found or u.role<>'GIS_ADMIN' then raise exception 'GIS Admin permission required' using errcode='42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_asset_ids,'{}'::text[])) x where nullif(trim(x),'') is not null);
  if cardinality(ids)=0 then return 0; end if;
  perform 1 from public.gis_assets where id=any(ids) and archived_at is null for update;
  if (select count(*) from public.gis_assets where id=any(ids) and archived_at is null) <> cardinality(ids) then
    raise exception 'One or more selected assets no longer exist or are already archived; refresh and retry';
  end if;
  update public.gis_assets set archived_at=now(),version=version+1 where id=any(ids) and archived_at is null;
  get diagnostics n = row_count;
  insert into public.powergis_audit_events(actor_id,action,entity_type,details)
  values(u.id,'BULK_ARCHIVE','GIS_ASSET_BATCH',jsonb_build_object('asset_ids',ids,'count',n));
  return n;
end;$$;
revoke all on function public.admin_archive_assets(text,text[]) from public;
grant execute on function public.admin_archive_assets(text,text[]) to anon,authenticated;

-- Claim a single requested backup atomically so concurrent workers cannot process it twice.
create or replace function public.claim_next_backup_run()
returns text language plpgsql security definer set search_path=public,extensions as $$
declare claimed_id text;
begin
  update public.powergis_backup_runs r set status='RUNNING',error_message=null
  where r.backup_id=(
    select q.backup_id from public.powergis_backup_runs q
    where q.status='REQUESTED'
    order by q.created_at asc
    for update skip locked
    limit 1
  )
  returning r.backup_id into claimed_id;
  return claimed_id;
end;$$;
revoke all on function public.claim_next_backup_run() from public,anon,authenticated;
grant execute on function public.claim_next_backup_run() to service_role;

-- ==================================================================
-- MIGRATION: 010_admin_backup_restore.sql
-- ==================================================================

-- GIS Admin-only backup retrieval and additive, transactional restore.
-- Restores merge/upsert snapshot records; they never delete current records.

create or replace function public.admin_get_backup_path(
  p_session_token text,
  p_backup_id text
)
returns text
language plpgsql
stable
security definer
set search_path=public, extensions
as $$
declare
  v_role text;
  v_path text;
begin
  select u.role into v_role
  from public.organization_users u
  join public.powergis_sessions s on s.user_id=u.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
    and s.expires_at>now()
  limit 1;
  if v_role is distinct from 'GIS_ADMIN' then
    raise exception 'GIS Admin permission required' using errcode='42501';
  end if;
  select r.storage_path into v_path
  from public.powergis_backup_runs r
  where r.backup_id=p_backup_id and r.status='COMPLETED'
    and r.storage_path is not null;
  if v_path is null then raise exception 'Completed backup not found'; end if;
  return v_path;
end;
$$;

create or replace function public.admin_restore_backup_payload(
  p_session_token text,
  p_backup_id text,
  p_payload jsonb
)
returns table(users_restored integer,jurisdictions_restored integer,assets_restored integer,audit_events_imported integer)
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  u public.organization_users%rowtype;
  item jsonb;
  v_geom geometry;
  v_users integer:=0;
  v_jurisdictions integer:=0;
  v_assets integer:=0;
  v_audit integer:=0;
  v_total integer;
  v_geo jsonb;
begin
  select o.* into u
  from public.organization_users o
  join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
    and s.expires_at>now()
  limit 1;
  if not found or u.role<>'GIS_ADMIN' then
    raise exception 'GIS Admin permission required' using errcode='42501';
  end if;
  if coalesce(p_payload->>'schemaVersion','') not in ('2','3') then
    raise exception 'Unsupported backup schema version';
  end if;
  if coalesce(p_payload->>'backupId','')<>p_backup_id then
    raise exception 'Backup identity does not match the selected manifest';
  end if;
  if octet_length(p_payload::text)>268435456 then raise exception 'Backup exceeds the 256 MB restore limit'; end if;

  v_total := jsonb_array_length(coalesce(p_payload->'users','[]'::jsonb))
    + jsonb_array_length(coalesce(p_payload->'jurisdictions','[]'::jsonb))
    + jsonb_array_length(coalesce(p_payload->'assets','[]'::jsonb))
    + jsonb_array_length(coalesce(p_payload->'auditEvents','[]'::jsonb));
  if v_total>1000000 then raise exception 'Backup exceeds the one-million-row restore safety limit'; end if;

  -- Preserve current credential hashes. A backup never contains passwords or sessions.
  for item in select value from jsonb_array_elements(coalesce(p_payload->'users','[]'::jsonb)) loop
    insert into public.organization_users(
      id,username,display_name,role,subdivision,division,circle,department,admin_name,region,
      scope_field,scope_value,source_rows,jurisdiction_ids,created_at
    ) values (
      item->>'id',item->>'username',coalesce(item->>'display_name',item->>'username'),item->>'role',
      item->>'subdivision',item->>'division',item->>'circle',item->>'department',item->>'admin_name',
      coalesce(item->>'region',''),item->>'scope_field',item->>'scope_value',
      coalesce(item->'source_rows','[]'::jsonb),
      array(select jsonb_array_elements_text(coalesce(item->'jurisdiction_ids','[]'::jsonb))),
      coalesce((item->>'created_at')::timestamptz,now())
    ) on conflict(id) do update set
      username=excluded.username,display_name=excluded.display_name,role=excluded.role,
      subdivision=excluded.subdivision,division=excluded.division,circle=excluded.circle,
      department=excluded.department,admin_name=excluded.admin_name,region=excluded.region,
      scope_field=excluded.scope_field,scope_value=excluded.scope_value,
      source_rows=excluded.source_rows,jurisdiction_ids=excluded.jurisdiction_ids;
    v_users:=v_users+1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_payload->'jurisdictions','[]'::jsonb)) loop
    v_geo:=item->'boundary';
    v_geom:=null;
    if v_geo is not null and v_geo<>'null'::jsonb then
      v_geom:=ST_SetSRID(ST_GeomFromGeoJSON(case when jsonb_typeof(v_geo)='string' then v_geo#>>'{}' else v_geo::text end),4326);
      if ST_IsEmpty(v_geom) or not ST_IsValid(v_geom) then raise exception 'Invalid jurisdiction geometry in backup: %',item->>'id'; end if;
    end if;
    insert into public.gis_jurisdictions(
      id,name,region,subdivision,division,circle,department,boundary,created_at
    ) values (
      item->>'id',item->>'name',coalesce(item->>'region',''),item->>'subdivision',item->>'division',
      item->>'circle',item->>'department',v_geom,coalesce((item->>'created_at')::timestamptz,now())
    ) on conflict(id) do update set
      name=excluded.name,region=excluded.region,subdivision=excluded.subdivision,
      division=excluded.division,circle=excluded.circle,department=excluded.department,
      boundary=excluded.boundary;
    v_jurisdictions:=v_jurisdictions+1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_payload->'assets','[]'::jsonb)) loop
    v_geo:=item->'geometry';
    v_geom:=null;
    if v_geo is not null and v_geo<>'null'::jsonb then
      v_geom:=ST_SetSRID(ST_GeomFromGeoJSON(case when jsonb_typeof(v_geo)='string' then v_geo#>>'{}' else v_geo::text end),4326);
      if ST_IsEmpty(v_geom) or not ST_IsValid(v_geom) or ST_NPoints(v_geom)>50000 then
        raise exception 'Invalid or oversized asset geometry in backup: %',item->>'id';
      end if;
    end if;
    if not exists(select 1 from public.asset_types t where t.id=item->>'asset_type') then
      raise exception 'Unknown asset type in backup: %',item->>'asset_type';
    end if;
    insert into public.gis_assets(
      id,asset_no,asset_type,status,geometry,latitude,longitude,jurisdiction_ids,owner_je_ids,
      shared_boundary,visibility_rule,metadata,created_at,version,archived_at
    ) values (
      item->>'id',item->>'asset_no',item->>'asset_type',coalesce(item->>'status','ACTIVE'),v_geom,
      nullif(item->>'latitude','')::double precision,nullif(item->>'longitude','')::double precision,
      array(select jsonb_array_elements_text(coalesce(item->'jurisdiction_ids','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(item->'owner_je_ids','[]'::jsonb))),
      coalesce((item->>'shared_boundary')::boolean,false),item->>'visibility_rule',
      coalesce(item->'metadata','{}'::jsonb),coalesce((item->>'created_at')::timestamptz,now()),
      greatest(1,coalesce((item->>'version')::integer,1)),nullif(item->>'archived_at','')::timestamptz
    ) on conflict(id) do update set
      asset_no=excluded.asset_no,asset_type=excluded.asset_type,status=excluded.status,
      geometry=excluded.geometry,latitude=excluded.latitude,longitude=excluded.longitude,
      jurisdiction_ids=excluded.jurisdiction_ids,owner_je_ids=excluded.owner_je_ids,
      shared_boundary=excluded.shared_boundary,visibility_rule=excluded.visibility_rule,
      metadata=excluded.metadata,archived_at=excluded.archived_at,
      version=greatest(public.gis_assets.version,excluded.version)+1;
    v_assets:=v_assets+1;
  end loop;

  -- Imported audit history is appended; existing audit history is never overwritten.
  for item in select value from jsonb_array_elements(coalesce(p_payload->'auditEvents','[]'::jsonb)) loop
    if exists(select 1 from public.organization_users x where x.id=item->>'actor_id') then
      insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details,created_at)
      values(item->>'actor_id','BACKUP_IMPORT:'||left(coalesce(item->>'action','UNKNOWN'),80),
        coalesce(item->>'entity_type','UNKNOWN'),item->>'entity_id',
        jsonb_build_object('sourceBackup',p_backup_id,'originalEventId',item->>'id','originalDetails',coalesce(item->'details','{}'::jsonb)),
        coalesce((item->>'created_at')::timestamptz,now()));
      v_audit:=v_audit+1;
    end if;
  end loop;

  insert into public.powergis_audit_events(actor_id,action,entity_type,entity_id,details)
  values(u.id,'BACKUP_RESTORE','DATABASE',p_backup_id,jsonb_build_object(
    'users',v_users,'jurisdictions',v_jurisdictions,'assets',v_assets,'auditEventsImported',v_audit,
    'mode','additive-upsert','schemaVersion',p_payload->>'schemaVersion'
  ));
  return query select v_users,v_jurisdictions,v_assets,v_audit;
end;
$$;

revoke all on function public.admin_get_backup_path(text,text) from public;
revoke all on function public.admin_restore_backup_payload(text,text,jsonb) from public;
grant execute on function public.admin_get_backup_path(text,text) to anon,authenticated,service_role;
grant execute on function public.admin_restore_backup_payload(text,text,jsonb) to service_role;


-- Viewport-based authorised asset delivery: the GIS browser fetches only the
-- current map extent rather than downloading the full organisation inventory.
create or replace function public.visible_assets_in_bbox(
  p_session_token text,
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 5000
)
returns table(
  total_count bigint,id text,asset_no text,asset_type text,status text,
  latitude double precision,longitude double precision,geometry jsonb,
  jurisdiction_ids text[],owner_je_ids text[],shared_boundary boolean,metadata jsonb,
  created_at timestamptz,version integer
)
language plpgsql
stable
security definer
set search_path=public, extensions
as $$
begin
  if p_west < -180 or p_west > 180 or p_east < -180 or p_east > 180
    or p_south < -90 or p_south > 90 or p_north < -90 or p_north > 90
    or p_south >= p_north then
    raise exception 'Invalid WGS84 viewport bounds';
  end if;
  return query
  with u as (
    select o.* from public.organization_users o
    join public.powergis_sessions s on s.user_id=o.id
    where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
      and s.expires_at>now() limit 1
  ), allowed_je as (
    select j.id from public.organization_users j cross join u
    where j.role='JE' and (
      u.role='GIS_ADMIN' or (u.role='JE' and j.id=u.id)
      or (u.scope_field='subdivision' and j.subdivision=u.scope_value)
      or (u.scope_field='division' and j.division=u.scope_value)
      or (u.scope_field='circle' and j.circle=u.scope_value)
      or (u.scope_field='department' and j.department=u.scope_value)
    )
  ), visible as (
    select a.* from public.gis_assets a cross join u
    where a.archived_at is null and a.geometry is not null
      and (u.role='GIS_ADMIN' or a.shared_boundary=true or a.owner_je_ids && array(select id from allowed_je))
      and (
        (p_west <= p_east and ST_Intersects(a.geometry,ST_MakeEnvelope(p_west,p_south,p_east,p_north,4326)))
        or (p_west > p_east and (
          ST_Intersects(a.geometry,ST_MakeEnvelope(p_west,p_south,180,p_north,4326))
          or ST_Intersects(a.geometry,ST_MakeEnvelope(-180,p_south,p_east,p_north,4326))
        ))
      )
  )
  select count(*) over()::bigint,a.id,a.asset_no,a.asset_type,a.status,a.latitude,a.longitude,
    ST_AsGeoJSON(a.geometry)::jsonb,a.jurisdiction_ids,a.owner_je_ids,a.shared_boundary,
    a.metadata,a.created_at,a.version
  from visible a order by a.created_at desc,a.id desc
  limit greatest(1,least(coalesce(p_limit,5000),10000));
end;
$$;
revoke all on function public.visible_assets_in_bbox(text,double precision,double precision,double precision,double precision,integer) from public;
grant execute on function public.visible_assets_in_bbox(text,double precision,double precision,double precision,double precision,integer) to anon,authenticated;

-- Service-role-only snapshot paging with explicit GeoJSON conversion. This
-- avoids backing up PostGIS's internal binary representation by accident.
create or replace function public.service_backup_page(
  p_entity text,p_offset integer default 0,p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public, extensions
as $$
declare result jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_offset<0 or p_limit<1 or p_limit>1000 then raise exception 'Invalid backup page bounds'; end if;
  case p_entity
    when 'users' then
      select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
        select id,username,display_name,role,subdivision,division,circle,department,admin_name,region,
          scope_field,scope_value,source_rows,jurisdiction_ids,created_at
        from public.organization_users order by id offset p_offset limit p_limit
      ) q;
    when 'jurisdictions' then
      select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
        select id,name,region,subdivision,division,circle,department,
          case when boundary is null then null else ST_AsGeoJSON(boundary)::jsonb end as boundary,created_at
        from public.gis_jurisdictions order by id offset p_offset limit p_limit
      ) q;
    when 'assets' then
      select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
        select id,asset_no,asset_type,status,
          case when geometry is null then null else ST_AsGeoJSON(geometry)::jsonb end as geometry,
          latitude,longitude,jurisdiction_ids,owner_je_ids,shared_boundary,visibility_rule,metadata,
          created_at,version,archived_at
        from public.gis_assets order by id offset p_offset limit p_limit
      ) q;
    when 'auditEvents' then
      select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
        select id,actor_id,action,entity_type,entity_id,details,created_at
        from public.powergis_audit_events order by id offset p_offset limit p_limit
      ) q;
    else raise exception 'Unsupported backup entity';
  end case;
  return result;
end;
$$;
revoke all on function public.service_backup_page(text,integer,integer) from public,anon,authenticated;
grant execute on function public.service_backup_page(text,integer,integer) to service_role;

-- ==================================================================
-- MIGRATION: 011_security_perimeter.sql
-- ==================================================================

-- PowerGIS security perimeter hardening.
-- Apply after 010_admin_backup_restore.sql.
-- The login directory must never be enumerable by unauthenticated clients.

set search_path = public, extensions;

-- Account lifecycle controls. Existing accounts remain active so this migration
-- does not unexpectedly lock a deployed environment; administrators can disable
-- accounts explicitly through a future server-side user-management workflow.
alter table public.organization_users
  add column if not exists is_active boolean not null default true,
  add column if not exists password_changed_at timestamptz,
  add column if not exists last_login_at timestamptz;

-- Known seeded/test credentials are not acceptable for a sensitive deployment.
-- Accounts whose current bcrypt hash still verifies against their username are
-- disabled until a trusted provisioning workflow sets a unique password.
update public.organization_users
set is_active=false
where coalesce(password,'')<>''
  and password=crypt(username,password)
  and password_changed_at is null;

create index if not exists organization_users_active_role_ix
  on public.organization_users(is_active, role);

-- Failed-login throttling keyed by username. This is deliberately separate from
-- the user table so authentication failures do not mutate account records.
create table if not exists public.powergis_auth_throttle (
  username_key text primary key,
  failed_count integer not null default 0,
  first_failed_at timestamptz,
  last_failed_at timestamptz,
  locked_until timestamptz
);
revoke all on public.powergis_auth_throttle from anon, authenticated;
alter table public.powergis_auth_throttle enable row level security;

-- The old login_users RPC was an unauthenticated directory enumeration surface.
-- It is no longer callable by anon/authenticated clients.
revoke all on function public.login_users() from public;
drop function if exists public.login_users();

-- Session restoration returns only fields required by the application. Sensitive
-- source-row provenance is deliberately excluded. Disabled users lose access even
-- if an old session token has not yet expired.
drop function if exists public.session_user(text);
create function public.session_user(p_session_token text)
returns table(
  id text, username text, display_name text, role text, subdivision text, division text,
  circle text, department text, admin_name text, region text, scope_field text,
  scope_value text, jurisdiction_ids text[]
)
language sql stable security definer set search_path=public, extensions as $$
  select u.id,u.username,u.display_name,u.role,u.subdivision,u.division,u.circle,u.department,
         u.admin_name,u.region,u.scope_field,u.scope_value,u.jurisdiction_ids
  from public.organization_users u
  join public.powergis_sessions s on s.user_id=u.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
    and s.expires_at>now() and u.is_active=true
  limit 1;
$$;
revoke all on function public.session_user(text) from public;
grant execute on function public.session_user(text) to anon, authenticated;

-- Authenticated admin directory only. Sensitive credential material is never
-- returned: no password, session token or source-row payload is exposed.
create or replace function public.admin_list_users(p_session_token text)
returns table(
  id text, username text, display_name text, role text,
  subdivision text, division text, circle text, department text,
  admin_name text, region text, scope_field text, scope_value text,
  jurisdiction_ids text[], is_active boolean, password_changed_at timestamptz,
  last_login_at timestamptz
)
language plpgsql security definer set search_path=public, extensions as $$
declare
  v_actor public.organization_users%rowtype;
begin
  select o.* into v_actor
  from public.organization_users o
  join public.powergis_sessions s on s.user_id=o.id
  where s.token_hash=encode(digest(convert_to(coalesce(p_session_token,''),'UTF8'),'sha256'),'hex')
    and s.expires_at>now()
    and o.is_active=true
  limit 1;
  if not found or v_actor.role <> 'GIS_ADMIN' then
    raise exception 'GIS Admin permission required' using errcode='42501';
  end if;

  return query
  select u.id,u.username,u.display_name,u.role,u.subdivision,u.division,u.circle,u.department,
         u.admin_name,u.region,u.scope_field,u.scope_value,u.jurisdiction_ids,
         u.is_active,u.password_changed_at,u.last_login_at
  from public.organization_users u
  order by case u.role when 'GIS_ADMIN' then 0 when 'SE' then 1 when 'EE' then 2
                    when 'AEE' then 3 when 'AE' then 4 when 'JE' then 5 else 6 end,
           u.display_name;
end;
$$;
revoke all on function public.admin_list_users(text) from public;
grant execute on function public.admin_list_users(text) to anon, authenticated;

-- Replace the authentication RPC with a generic-failure, active-account,
-- throttled implementation. Password hashes, source rows and session tokens
-- are never returned except for the one opaque token needed to establish the session.
drop function if exists public.authenticate_user(text,text);
create function public.authenticate_user(p_username text, p_password text)
returns table(
  id text, username text, display_name text, role text,
  subdivision text, division text, circle text, department text,
  admin_name text, region text, scope_field text, scope_value text,
  jurisdiction_ids text[], session_token text
)
language plpgsql security definer
set search_path=public, extensions
as $$
declare
  u public.organization_users%rowtype;
  raw_token text;
  hash_token text;
  v_key text := lower(trim(coalesce(p_username,'')));
  v_throttle public.powergis_auth_throttle%rowtype;
begin
  if v_key='' or coalesce(p_password,'')='' or length(p_password)>512 or length(v_key)>160 then
    return;
  end if;

  select * into v_throttle from public.powergis_auth_throttle where username_key=v_key;
  if v_throttle.locked_until is not null and v_throttle.locked_until>now() then
    return;
  end if;

  select o.* into u
  from public.organization_users o
  where lower(trim(o.username))=v_key
    and o.is_active=true
    and coalesce(o.password,'')<>''
    and o.password=crypt(p_password,o.password)
  limit 1;

  if not found then
    insert into public.powergis_auth_throttle(username_key,failed_count,first_failed_at,last_failed_at,locked_until)
    values(v_key,1,now(),now(),null)
    on conflict(username_key) do update set
      failed_count=case
        when public.powergis_auth_throttle.first_failed_at is null
          or public.powergis_auth_throttle.first_failed_at < now()-interval '15 minutes'
        then 1 else public.powergis_auth_throttle.failed_count+1 end,
      first_failed_at=case
        when public.powergis_auth_throttle.first_failed_at is null
          or public.powergis_auth_throttle.first_failed_at < now()-interval '15 minutes'
        then now() else public.powergis_auth_throttle.first_failed_at end,
      last_failed_at=now(),
      locked_until=case
        when public.powergis_auth_throttle.failed_count+1 >= 5 then now()+interval '15 minutes'
        else public.powergis_auth_throttle.locked_until end;
    perform pg_sleep(0.15);
    return;
  end if;

  delete from public.powergis_auth_throttle where username_key=v_key;
  raw_token:=encode(gen_random_bytes(32),'hex');
  hash_token:=encode(digest(convert_to(raw_token,'UTF8'),'sha256'),'hex');
  delete from public.powergis_sessions where expires_at<now();
  insert into public.powergis_sessions(token_hash,user_id,expires_at)
  values(hash_token,u.id,now()+interval '8 hours');
  update public.organization_users set last_login_at=now() where id=u.id;

  return query select u.id,u.username,u.display_name,u.role,u.subdivision,u.division,u.circle,
    u.department,u.admin_name,u.region,u.scope_field,u.scope_value,u.jurisdiction_ids,raw_token;
end;
$$;
revoke all on function public.authenticate_user(text,text) from public;
grant execute on function public.authenticate_user(text,text) to anon, authenticated;

-- Prevent the browser from reading session/user tables directly.
revoke all on table public.powergis_sessions from anon, authenticated;
revoke all on table public.organization_users from anon, authenticated;
revoke all on table public.powergis_auth_throttle from anon, authenticated;

-- Ensure sensitive source-row provenance is never returned to unauthenticated
-- callers through an obsolete function signature.
revoke all on function public.visible_assets(text) from public;
revoke all on function public.visible_jurisdictions(text) from public;

comment on table public.organization_users is
  'Authoritative PowerGIS identity directory. Direct browser table access is prohibited; use server-side authenticated RPCs.';


-- Server-only bootstrap password setter. The bootstrap secret is supplied only by
-- the Edge Function environment and is never shipped to the browser. A single-use
-- database state prevents accidental repeated bootstrap activation.
create table if not exists public.powergis_bootstrap_state (
  id boolean primary key default true,
  used_at timestamptz,
  used_for_username text
);
insert into public.powergis_bootstrap_state(id) values(true) on conflict(id) do nothing;
revoke all on public.powergis_bootstrap_state from anon, authenticated;
alter table public.powergis_bootstrap_state enable row level security;

create or replace function public.bootstrap_set_admin(
  p_bootstrap_secret text,
  p_expected_secret text,
  p_username text,
  p_password text
)
returns void
language plpgsql security definer set search_path=public, extensions as $$
declare
  v_user public.organization_users%rowtype;
  v_used timestamptz;
begin
  select used_at into v_used from public.powergis_bootstrap_state where id=true;
  if v_used is not null then raise exception 'Bootstrap already completed' using errcode='42501'; end if;
  if coalesce(p_bootstrap_secret,'')='' or coalesce(p_expected_secret,'')='' or p_bootstrap_secret<>p_expected_secret then
    raise exception 'Bootstrap denied' using errcode='42501';
  end if;
  if length(trim(coalesce(p_username,'')))<3 or length(coalesce(p_password,''))<14 then
    raise exception 'Bootstrap credentials do not meet minimum requirements';
  end if;
  if p_password = p_username then raise exception 'Password must not equal username'; end if;
  select * into v_user from public.organization_users where lower(username)=lower(trim(p_username)) limit 1;
  if not found or v_user.role<>'GIS_ADMIN' then raise exception 'GIS Admin account not found'; end if;
  update public.organization_users
    set password=crypt(p_password,gen_salt('bf',12)), is_active=true,
        password_changed_at=now(), last_login_at=null
  where id=v_user.id;
  update public.powergis_bootstrap_state set used_at=now(), used_for_username=v_user.username where id=true;
end;
$$;
revoke all on function public.bootstrap_set_admin(text,text,text,text) from public;
