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
drop function if exists public.login_users() cascade;

-- Session restoration returns only fields required by the application. Sensitive
-- source-row provenance is deliberately excluded. Disabled users lose access even
-- if an old session token has not yet expired.
drop function if exists public.session_user cascade;
drop function if exists public.session_user(text) cascade;
create or replace function public.session_user(p_session_token text)
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
drop function if exists public.admin_list_users cascade;
drop function if exists public.admin_list_users(text) cascade;
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
drop function if exists public.authenticate_user cascade;
drop function if exists public.authenticate_user(text, text) cascade;
create or replace function public.authenticate_user(p_username text, p_password text)
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
drop function if exists public.visible_assets(text) cascade;
drop function if exists public.visible_jurisdictions(text) cascade;
drop function if exists public.visible_assets(text, text) cascade;
drop function if exists public.visible_jurisdictions(text, text) cascade;

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
