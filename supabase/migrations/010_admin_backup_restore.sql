-- GIS Admin-only backup retrieval and additive, transactional restore.
-- Restores merge/upsert snapshot records; they never delete current records.

drop function if exists public.admin_get_backup_path cascade;
drop function if exists public.admin_get_backup_path(text, text) cascade;
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

drop function if exists public.admin_restore_backup_payload cascade;
drop function if exists public.admin_restore_backup_payload(text, text, jsonb) cascade;
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
drop function if exists public.visible_assets_in_bbox cascade;
drop function if exists public.visible_assets_in_bbox(text, double precision, double precision, double precision, double precision, integer) cascade;
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
drop function if exists public.service_backup_page cascade;
drop function if exists public.service_backup_page(text, integer, integer) cascade;
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
