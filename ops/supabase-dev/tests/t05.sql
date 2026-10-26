-- 05_cancellation.sql (in einer Transaktion, endet mit Rollback)
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

-- Kuendigungsbutton: Eingang, Zuordnung, Bestaetigungsstatus; nur der Server darf schreiben und Adressen aufloesen.
select set_config('vt.kai', (tests.create_user('kai@example.test'))::text, true);

select tests.authenticate((current_setting('vt.kai')::uuid));
select tests.throws($$select public.billing_record_cancellation('{"email":"x@example.test","kind":"ordinary"}')$$, 'permission denied');
select tests.throws($$select public.billing_user_by_email('kai@example.test')$$, 'permission denied');
select tests.throws($$select * from billing.cancellation_requests$$, 'permission denied');
reset role;
select tests.anon();
select tests.throws($$select public.billing_user_by_email('kai@example.test')$$, 'permission denied');
reset role;

select tests.service();
select tests.eq(public.billing_user_by_email(' KAI@example.test '), (current_setting('vt.kai')::uuid)::uuid, 'adresse ohne gross/klein und leerzeichen');
select tests.eq(public.billing_user_by_email('niemand@example.test'), null::uuid, 'unbekannt');
select set_config('vt.req', ((public.billing_record_cancellation(jsonb_build_object('email', ' Kai@Example.test ', 'full_name', 'Kai K.',
  'kind', 'extraordinary', 'reason', 'Umzug ins Ausland', 'source', 'public')) ->> 'id'))::text, true);
select public.billing_update_cancellation((current_setting('vt.req')::uuid), '{"status":"manual_review","confirmation_status":"sent"}');
select tests.throws($$select public.billing_record_cancellation('{"email":"a@b.de","kind":"sofort"}')$$, 'check');
select tests.throws($$select public.billing_update_cancellation(gen_random_uuid(), '{}')$$, 'CANCELLATION_NOT_FOUND');
select tests.throws(format($$select public.billing_update_cancellation(%L, '{"status":"erledigt"}')$$, (current_setting('vt.req')::uuid)), 'check');
reset role;

select tests.eq((select email from billing.cancellation_requests where id = (current_setting('vt.req')::uuid)), 'kai@example.test', 'adresse normalisiert');
select tests.eq((select reason from billing.cancellation_requests where id = (current_setting('vt.req')::uuid)), 'Umzug ins Ausland', 'grund gespeichert');
select tests.eq((select status from billing.cancellation_requests where id = (current_setting('vt.req')::uuid)), 'manual_review', 'status');
select tests.eq((select confirmation_sent_at is not null from billing.cancellation_requests where id = (current_setting('vt.req')::uuid)), true, 'bestaetigung zeitpunkt');
select tests.eq((select requested_at <= now() from billing.cancellation_requests where id = (current_setting('vt.req')::uuid)), true, 'eingang aus datenbankuhr');

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 05_cancellation.sql'; end $vu_end$;
