-- =============================================================================
-- VISION UNIVERSE — supabase/local/platform-stub.sql
--
-- NUR FUER TESTS. Bildet in einer leeren PostgreSQL-Datenbank den Teil der
-- Supabase-Plattform nach, auf den unsere Migrationen bauen:
--   * die Rollen anon, authenticated, service_role (service_role mit BYPASSRLS)
--   * auth.users (nur die Spalten, die wir lesen) und auth.uid()/auth.jwt()
--     wie bei Supabase: aus der Einstellung request.jwt.claims, die PostgREST
--     je Anfrage setzt
--   * die Standardrechte, die Supabase im Schema public vergibt (ALLES an
--     anon und authenticated). Die Migrationen muessen sie selbst
--     zuruecknehmen - genau das pruefen die Tests.
--
-- In einem echten Supabase-Projekt wird diese Datei NIE ausgefuehrt.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create extension if not exists pgcrypto;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase-Standard: alles im Schema public gehoert zunaechst allen API-Rollen.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
