-- Testhelfer (nur in der Testdatenbank). Simuliert, was PostgREST je Anfrage
-- tut: die JWT-Claims setzen und in die Rolle des Tokens wechseln.
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.create_user(p_email text, p_name text default null)
returns uuid language sql as $$
  insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
  values (p_email, now(), case when p_name is null then '{}'::jsonb else jsonb_build_object('display_name', p_name) end)
  returning id
$$;

create or replace function tests.authenticate(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function tests.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;

-- Erwartet, dass sql mit einer Meldung scheitert, die pattern enthaelt.
create or replace function tests.throws(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then return; end if;
    raise exception 'EXPECTED_ERROR "%" BUT GOT "%" FOR: %', p_pattern, sqlerrm, p_sql;
  end;
  raise exception 'EXPECTED_ERROR "%" BUT STATEMENT SUCCEEDED: %', p_pattern, p_sql;
end $$;

create or replace function tests.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERT % : expected %, got %', p_label, p_expected, p_actual;
  end if;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
