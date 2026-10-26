-- 02_plans_catalog.sql (in einer Transaktion, endet mit Rollback)
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

-- Katalog: oeffentlich lesbar, nie vom Browser schreibbar.
select set_config('vt.carol', (tests.create_user('carol@example.test'))::text, true);

select tests.anon();
select tests.eq((select count(*) from public.plans)::int, 3, 'anon sieht tarife');
select tests.eq((select count(*) from public.plan_prices where plan_id = 'plus')::int, 2, 'anon sieht preise');
select tests.eq((select count(*) from public.plan_features where plan_id = 'pro' and feature_key = 'export.csv')::int, 1, 'features lesbar');
select tests.throws($$insert into public.plans (id, name, rank) values ('gratis', 'Gratis', 99)$$, 'permission denied');
select tests.throws($$update public.plan_prices set unit_amount = 0$$, 'permission denied');
reset role;

select tests.authenticate((current_setting('vt.carol')::uuid));
select tests.throws($$update public.plan_prices set unit_amount = 1$$, 'permission denied');
select tests.throws($$insert into public.plan_features (plan_id, feature_key) values ('free', 'export.csv')$$, 'permission denied');
select tests.throws($$delete from public.plans$$, 'permission denied');
reset role;

-- Inaktive Preise und nicht oeffentliche Tarife sind unsichtbar.
insert into public.plans (id, name, rank, is_public) values ('intern', 'Intern', 99, false);
update public.plan_prices set active = false where id = 'pro_year';
select tests.anon();
select tests.eq((select count(*) from public.plans where id = 'intern')::int, 0, 'interner tarif unsichtbar');
select tests.eq((select count(*) from public.plan_prices where id = 'pro_year')::int, 0, 'inaktiver preis unsichtbar');
reset role;

-- Ein aktiver Preis je Tarif/Anbieter/Laufzeit/Modus.
select tests.throws($$insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount)
  values ('plus_month_2', 'plus', 'stripe', 'price_test_other', 'month', 'EUR', 100)$$, 'plan_prices_one_active');

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 02_plans_catalog.sql'; end $vu_end$;
