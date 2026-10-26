-- 07_registration_gate.sql (in einer Transaktion, endet mit Rollback)
-- Testhelfer (nur in der Testdatenbank). Simuliert, was PostgREST je Anfrage
-- tut: die JWT-Claims setzen und in die Rolle des Tokens wechseln.
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role, supabase_auth_admin;

create or replace function tests.create_user(p_email text, p_name text default null)
returns uuid language sql as $$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (gen_random_uuid(), p_email, now(), case when p_name is null then '{}'::jsonb else jsonb_build_object('display_name', p_name) end)
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

-- Registrierungssperre: Auth-Hook vor dem Anlegen eines Kontos.
-- Niemand ausser Supabase Auth ruft den Hook auf oder sieht die Liste.
select tests.anon();
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.throws($$select * from public.registration_allowlist$$, 'permission denied');
select tests.throws($$select public.registration_set_allowlist(array['x@y.de'])$$, 'permission denied');
reset role;
select tests.authenticate(tests.create_user('eve@example.test'));
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.throws($$update public.registration_gate set open = true$$, 'permission denied');
reset role;

select tests.service();
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.eq(public.registration_set_allowlist(array['Tester@Example.test', ' zwei@example.test ', '']), 2, 'Positivliste gesetzt');
select tests.eq(public.registration_set_allowlist(array['zwei@example.test']), 1, 'Positivliste ersetzt');
reset role;

set local role supabase_auth_admin;
select tests.eq(public.hook_before_user_created('{"user":{"email":"ZWEI@example.test"}}'), '{}'::jsonb, 'Positivliste darf');
select tests.eq(public.hook_before_user_created('{"user":{"email":"tester@example.test"}}') -> 'error' ->> 'http_code', '403', 'entfernte Adresse gesperrt');
select tests.eq(public.hook_before_user_created('{"user":{}}') -> 'error' ->> 'message', 'REGISTRATION_CLOSED', 'ohne Adresse gesperrt');
reset role;
update public.registration_gate set open = true;
set local role supabase_auth_admin;
select tests.eq(public.hook_before_user_created('{"user":{"email":"jeder@example.test"}}'), '{}'::jsonb, 'nach Freigabe offen');
reset role;

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 07_registration_gate.sql'; end $vu_end$;
