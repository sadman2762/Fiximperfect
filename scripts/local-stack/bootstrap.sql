-- Local development bootstrap that reproduces the parts of a Supabase Postgres
-- instance Fiximperfect depends on (roles, auth schema, default grants).
-- NOT used against a real Supabase project, which already provides all of this.
do $$
begin
  -- Supabase Auth migrations reference the postgres role.
  if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres superuser login; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'local-authenticator';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login createrole password 'local-auth-admin';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant all on schema auth to supabase_auth_admin;
grant create on database fiximperfect to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

