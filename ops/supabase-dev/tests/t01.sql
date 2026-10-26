-- 01_accounts_rls.sql (in einer Transaktion, endet mit Rollback)
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

create or replace function tests.assert_auth_admin_privileges() returns void language plpgsql as $$
declare t text;
begin
  perform tests.eq(has_schema_privilege('supabase_auth_admin', 'public', 'usage'), true, 'auth admin: schema public');
  perform tests.eq(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), true, 'auth admin: hook ausfuehrbar');
  perform tests.eq((select prosecdef from pg_proc where oid = 'public.hook_before_user_created(jsonb)'::regprocedure), false, 'hook laeuft mit Rechten des Aufrufers');
  perform tests.eq((select rolsuper or rolbypassrls from pg_roles where rolname = 'supabase_auth_admin'), false, 'auth admin ohne Sonderrechte');
  foreach t in array array['anon', 'authenticated', 'service_role'] loop
    perform tests.eq(has_function_privilege(t, 'public.hook_before_user_created(jsonb)', 'execute'), false, 'hook nicht ausfuehrbar fuer ' || t);
  end loop;
  foreach t in array array['public.registration_gate', 'public.registration_allowlist'] loop
    perform tests.eq(has_table_privilege('supabase_auth_admin', t, 'select'), true, 'auth admin liest ' || t);
    perform tests.eq(has_table_privilege('supabase_auth_admin', t, 'insert, update, delete, truncate'), false, 'auth admin schreibt nicht ' || t);
    perform tests.eq((select relrowsecurity from pg_class where oid = t::regclass), true, 'RLS an ' || t);
    perform tests.eq((select count(*) from pg_policies p where format('%I.%I', p.schemaname, p.tablename) = t
                        and p.cmd = 'SELECT' and 'supabase_auth_admin' = any (p.roles) and p.qual = 'true')::int, 1, 'Leserichtlinie ' || t);
  end loop;
end $$;

create or replace function tests.as_auth_admin() returns void language plpgsql as $$
begin
  perform tests.assert_auth_admin_privileges();
  if pg_has_role(current_user, 'supabase_auth_admin', 'member')
     and coalesce(current_setting('vu.test_hosted_mode', true), '') <> 'on' then
    execute 'set local role supabase_auth_admin';
  end if;
end $$;

-- Konten: Anlage per Trigger, RLS auf Profil/Einstellungen/Rollen, Spaltenrechte.
select set_config('vt.alice', (tests.create_user('alice@example.test', 'Alice'))::text, true);
select set_config('vt.bob', (tests.create_user('bob@example.test'))::text, true);

-- Trigger legt Profil, Einstellungen und Rolle 'user' an.
select tests.eq((select display_name from public.profiles where user_id = (current_setting('vt.alice')::uuid)), 'Alice', 'profil aus metadaten');
select tests.eq((select appearance from public.user_settings where user_id = (current_setting('vt.bob')::uuid)), 'system', 'standard-einstellungen');
select tests.eq((select count(*) from public.user_roles where user_id = (current_setting('vt.bob')::uuid) and role = 'user')::int, 1, 'rolle user');
select tests.eq((select notification_settings from public.user_settings where user_id = (current_setting('vt.alice')::uuid)), '{}'::jsonb, 'benachrichtigungen aus');

-- Alice sieht nur sich.
select tests.authenticate((current_setting('vt.alice')::uuid));
select tests.eq((select count(*) from public.profiles)::int, 1, 'alice sieht ein profil');
select tests.eq((select count(*) from public.user_settings)::int, 1, 'alice sieht eine einstellung');
select tests.eq((select count(*) from public.profiles where user_id = (current_setting('vt.bob')::uuid))::int, 0, 'bob unsichtbar');

-- Eigene Zeile aendern: erlaubt. Fremde: wirkungslos (RLS filtert).
update public.profiles set display_name = 'Alice B.' where user_id = (current_setting('vt.alice')::uuid);
update public.profiles set display_name = 'gehackt' where user_id = (current_setting('vt.bob')::uuid);
update public.user_settings set appearance = 'dark', notification_settings = '{"EARNINGS": true}' where user_id = (current_setting('vt.alice')::uuid);

-- Verbotene Spalten und Tabellen.
select tests.throws($$update public.profiles set user_id = gen_random_uuid()$$, 'permission denied');
select tests.throws($$update public.profiles set created_at = now() - interval '1 year'$$, 'permission denied');
select tests.throws($$insert into public.profiles (user_id) values (gen_random_uuid())$$, 'permission denied');
select tests.throws($$delete from public.profiles$$, 'permission denied');
select tests.throws(format($$insert into public.user_roles (user_id, role) values (%L, 'admin')$$, (current_setting('vt.alice')::uuid)), 'permission denied');
select tests.throws($$update public.user_roles set role = 'admin'$$, 'permission denied');
select tests.throws($$update public.user_settings set notification_settings = '{"FREE_MONEY": true}'$$, 'user_settings_notifications_shape');
select tests.throws($$update public.user_settings set display_currency = 'euro'$$, 'check');
select tests.throws($$select * from auth.users$$, 'permission denied');
select tests.eq(public.is_admin(), false, 'alice ist kein admin');
reset role;

select tests.eq((select display_name from public.profiles where user_id = (current_setting('vt.bob')::uuid)), null::text, 'bob unveraendert');
select tests.eq((select display_name from public.profiles where user_id = (current_setting('vt.alice')::uuid)), 'Alice B.', 'alice geaendert');
select tests.eq((select appearance from public.user_settings where user_id = (current_setting('vt.alice')::uuid)), 'dark', 'alice einstellung');

-- Anonym: keine Nutzerdaten.
select tests.anon();
select tests.throws($$select * from public.profiles$$, 'permission denied');
select tests.throws($$select * from public.user_settings$$, 'permission denied');
select tests.throws($$select * from public.user_roles$$, 'permission denied');
reset role;

-- Admin (vom Server vergeben) sieht Profile, aber keine fremden Einstellungen.
insert into public.user_roles (user_id, role) values ((current_setting('vt.bob')::uuid), 'admin');
select tests.authenticate((current_setting('vt.bob')::uuid));
select tests.eq(public.is_admin(), true, 'bob ist admin');
select tests.eq((select count(*) from public.profiles)::int, 2, 'admin sieht profile');
select tests.eq((select count(*) from public.user_settings)::int, 1, 'admin sieht nur eigene einstellungen');
reset role;

-- Konto loeschen: alles mit dem Konto weg.
delete from auth.users where id = (current_setting('vt.alice')::uuid);
select tests.eq((select count(*) from public.profiles where user_id = (current_setting('vt.alice')::uuid))::int, 0, 'profil geloescht');
select tests.eq((select count(*) from public.user_settings where user_id = (current_setting('vt.alice')::uuid))::int, 0, 'einstellungen geloescht');
select tests.eq((select count(*) from public.user_roles where user_id = (current_setting('vt.alice')::uuid))::int, 0, 'rollen geloescht');

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 01_accounts_rls.sql'; end $vu_end$;
