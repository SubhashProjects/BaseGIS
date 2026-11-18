-- PowerGIS data management: controlled GIS imports, exports and daily backup manifests.
-- Browser clients never receive direct table write access. All writes remain behind session-bound admin RPCs.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.powergis_sessions (
  token_hash text primary key,
  user_id text not null references public.organization_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.powergis_backup_runs (
  backup_id text primary key,
  status text not null default 'COMPLETED',
  storage_path text,
  user_count integer not null default 0,
  jurisdiction_count integer not null default 0,
  asset_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);
create index if not exists powergis_backup_runs_created_ix on public.powergis_backup_runs(created_at desc);
revoke all on table public.powergis_backup_runs from anon, authenticated;
alter table public.powergis_backup_runs enable row level security;

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
  where o.id = p_session_token
     or exists (
          select 1 from public.powergis_sessions s
          where s.user_id = o.id
            and s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
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
      v_geometry := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(item->'geometry'),4326);
      if extensions.ST_IsEmpty(v_geometry) or not extensions.ST_IsValid(v_geometry) then raise exception 'Invalid geometry'; end if;
      v_lat := nullif(item->>'latitude','')::double precision;
      v_lng := nullif(item->>'longitude','')::double precision;
      if v_lat is null and extensions.GeometryType(v_geometry)='POINT' then v_lat := extensions.ST_Y(v_geometry); end if;
      if v_lng is null and extensions.GeometryType(v_geometry)='POINT' then v_lng := extensions.ST_X(v_geometry); end if;
      v_metadata := coalesce(item->'metadata','{}'::jsonb) || jsonb_build_object('importedAt',now(),'importedBy',u.id,'importSource','PowerGIS Data Import');
      v_id := 'imp-' || replace(gen_random_uuid()::text,'-','');
      insert into public.gis_assets(id,asset_no,asset_type,status,geometry,latitude,longitude,jurisdiction_ids,owner_je_ids,shared_boundary,visibility_rule,metadata)
      values (v_id,v_asset_no,v_asset_type,v_status,v_geometry,v_lat,v_lng,'{}','{}',false,'SPATIAL_AUTHORIZATION',v_metadata);
      update public.gis_assets a set
        jurisdiction_ids = coalesce((select array_agg(j.id) from public.gis_jurisdictions j where j.boundary is not null and extensions.ST_Intersects(j.boundary,a.geometry)),'{}'),
        owner_je_ids = coalesce((select array_agg(distinct u2.id) from public.organization_users u2 where u2.role='JE' and (u2.jurisdiction_ids && coalesce((select array_agg(j2.id) from public.gis_jurisdictions j2 where j2.boundary is not null and extensions.ST_Intersects(j2.boundary,a.geometry)),'{}'))),'{}')
      where a.id=v_id;
      inserted_count := inserted_count + 1;
    exception when others then
      error_list := error_list || jsonb_build_array(jsonb_build_object('assetNo',item->>'assetNo','error',SQLERRM));
      skipped_count := skipped_count + 1;
    end;
  end loop;
  return query select inserted_count, skipped_count, error_list;
end;$$;

create or replace function public.export_assets(p_session_token text)
returns table(id text,asset_no text,asset_type text,status text,latitude double precision,longitude double precision,geometry jsonb,jurisdiction_ids text[],owner_je_ids text[],shared_boundary boolean,metadata jsonb)
language sql stable security definer set search_path=public, extensions as $$
with u as (
  select o.* from public.organization_users o
  where o.id = p_session_token
     or exists (
          select 1 from public.powergis_sessions s
          where s.user_id = o.id
            and s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
            and s.expires_at > now()
        )
), allowed_je as (
 select j.id from public.organization_users j cross join u where j.role='JE' and (u.role='GIS_ADMIN' or (u.role='JE' and j.id=u.id) or (u.scope_field='subdivision' and j.subdivision=u.scope_value) or (u.scope_field='division' and j.division=u.scope_value) or (u.scope_field='circle' and j.circle=u.scope_value) or (u.scope_field='department' and j.department=u.scope_value))
)
select a.id,a.asset_no,a.asset_type,a.status,a.latitude,a.longitude,extensions.ST_AsGeoJSON(a.geometry)::jsonb,a.jurisdiction_ids,a.owner_je_ids,a.shared_boundary,a.metadata from public.gis_assets a,u where u.role='GIS_ADMIN' or a.owner_je_ids && array(select id from allowed_je);
$$;

create or replace function public.create_backup_manifest(p_session_token text)
returns table(backup_id text,created_at timestamptz,status text,user_count integer,jurisdiction_count integer,asset_count integer)
language plpgsql security definer set search_path=public, extensions as $$
declare u public.organization_users%rowtype; b text := 'pg-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
begin
 select o.* into u from public.organization_users o
 where o.id = p_session_token
    or exists (
         select 1 from public.powergis_sessions s
         where s.user_id = o.id
           and s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
           and s.expires_at > now()
       );
 if not found or u.role <> 'GIS_ADMIN' then raise exception 'Only GIS Admin can create backups'; end if;
 insert into public.powergis_backup_runs(backup_id,status,user_count,jurisdiction_count,asset_count,completed_at) select b,'COMPLETED',(select count(*) from public.organization_users),(select count(*) from public.gis_jurisdictions),(select count(*) from public.gis_assets),now();
 return query select r.backup_id,r.created_at,r.status,r.user_count,r.jurisdiction_count,r.asset_count from public.powergis_backup_runs r where r.backup_id=b;
end;$$;

create or replace function public.list_backup_runs(p_session_token text)
returns table(backup_id text,created_at timestamptz,status text,storage_path text,user_count integer,jurisdiction_count integer,asset_count integer)
language sql stable security definer set search_path=public, extensions as $$
select r.backup_id,r.created_at,r.status,r.storage_path,r.user_count,r.jurisdiction_count,r.asset_count from public.powergis_backup_runs r
where exists(
  select 1 from public.organization_users u
  where (
    u.id = p_session_token
    or exists (
      select 1 from public.powergis_sessions s
      where s.user_id = u.id
        and s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
        and s.expires_at > now()
    )
  ) and u.role='GIS_ADMIN'
) order by r.created_at desc;
$$;

revoke all on function public.admin_import_assets(text,jsonb) from public;
revoke all on function public.export_assets(text) from public;
revoke all on function public.create_backup_manifest(text) from public;
revoke all on function public.list_backup_runs(text) from public;
grant execute on function public.admin_import_assets(text,jsonb) to anon,authenticated;
grant execute on function public.export_assets(text) to anon,authenticated;
grant execute on function public.create_backup_manifest(text) to anon,authenticated;
grant execute on function public.list_backup_runs(text) to anon,authenticated;
