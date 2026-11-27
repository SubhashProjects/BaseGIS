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

drop function if exists public.admin_update_asset cascade;
drop function if exists public.admin_update_asset(text,text,integer,text,text,text,jsonb,jsonb,text[],boolean) cascade;
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

drop function if exists public.admin_archive_asset cascade;
drop function if exists public.admin_archive_asset(text,text,integer,text) cascade;
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

drop function if exists public.admin_restore_asset cascade;
drop function if exists public.admin_restore_asset(text,text,integer) cascade;
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
drop function if exists public.review_asset_submission cascade;
drop function if exists public.review_asset_submission(text,text,integer,text,text) cascade;
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

drop function if exists public.list_operational_audit cascade;
drop function if exists public.list_operational_audit(text,integer) cascade;
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

drop function if exists public.visible_assets_page_v2 cascade;
drop function if exists public.visible_assets_page_v2(text, integer, timestamptz, text) cascade;
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

drop function if exists public.admin_asset_version cascade;
drop function if exists public.admin_asset_version(text,text) cascade;
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

drop function if exists public.visible_asset_stats cascade;
drop function if exists public.visible_asset_stats(text) cascade;
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

drop function if exists public.export_assets cascade;
drop function if exists public.export_assets(text) cascade;
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
drop function if exists public.admin_archive_assets cascade;
drop function if exists public.admin_archive_assets(text,text[]) cascade;
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
drop function if exists public.claim_next_backup_run cascade;
drop function if exists public.claim_next_backup_run() cascade;
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
