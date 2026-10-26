-- 08_watchlist_personal.sql (in einer Transaktion, endet mit Rollback)
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

-- Persoenliche Watchlist: Hinzufuegen/Entfernen, Isolation zwischen Nutzern, Loeschung.
select set_config('vt.hanna', (tests.create_user('hanna@example.test'))::text, true);
select set_config('vt.ivo', (tests.create_user('ivo@example.test'))::text, true);

-- Hanna: Standardliste entsteht beim ersten Hinzufuegen, doppelt ist idempotent.
select tests.authenticate((current_setting('vt.hanna')::uuid));
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ADDED', 'erstes Hinzufuegen');
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ALREADY_PRESENT', 'doppelt -> idempotent');
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'kein Duplikat');
select tests.eq((select count(*) from public.watchlists)::int, 1, 'genau eine Standardliste');
select set_config('vt.hanna_list', (public.watchlist_default())::text, true);
select tests.eq(public.watchlist_add('vu_aaaaaa111111', null) ->> 'listId', current_setting('vt.hanna_list'), 'Standardliste wiederverwendet');
-- Kennung muss instrumentId sein, kein Ticker; Ticker nur in gueltiger Form.
select tests.throws($$select public.watchlist_add('NVDA', 'NVDA')$$, 'INSTRUMENT_INVALID');
select tests.throws($$select public.watchlist_add('vu_abcdef12', 'nv da')$$, 'TICKER_INVALID');
-- Notiz und Benachrichtigungen.
select tests.eq(public.watchlist_update('vu_d57074b4128184', (current_setting('vt.hanna_list')::uuid),
  '{"note":"Beobachten bis Q4","alerts":{"PRICE_EVENT":true,"SUPERTRADER_SIGNAL":false}}') -> 'alerts' ->> 'PRICE_EVENT', 'true', 'alerts gesetzt');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"alerts":{"MARKET_REGIME_CHANGE":true}}')$$, (current_setting('vt.hanna_list')::uuid)), 'ALERTS_INVALID');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"alerts":{"PRICE_EVENT":"ja"}}')$$, (current_setting('vt.hanna_list')::uuid)), 'ALERTS_INVALID');
select tests.throws($$update public.watchlist_items set alerts = '{"X":1}'$$, 'watchlist_items_alerts_valid');
select tests.throws($$update public.watchlist_items set instrument_id = 'vu_bbbbbb'$$, 'permission denied');
reset role;

-- Ivo sieht und veraendert nichts von Hanna.
select tests.authenticate((current_setting('vt.ivo')::uuid));
select tests.eq((select count(*) from public.watchlist_items)::int, 0, 'fremde Eintraege unsichtbar');
select tests.eq((select count(*) from public.watchlists)::int, 0, 'fremde Listen unsichtbar');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 0, 'fremden Eintrag nicht entfernt');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"note":"x"}')$$, (current_setting('vt.hanna_list')::uuid)), 'WATCHLIST_ITEM_NOT_FOUND');
select tests.throws(format($$select public.watchlist_add('vu_cccccc', 'X', %L)$$, (current_setting('vt.hanna_list')::uuid)), 'WATCHLIST_NOT_FOUND');
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, user_id, instrument_id) values (%L, %L, 'vu_cccccc')$$, (current_setting('vt.hanna_list')::uuid), (current_setting('vt.ivo')::uuid)), 'WATCHLIST_NOT_OWNED');
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ADDED', 'Ivo hat eigene Liste');
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'Ivo sieht nur seinen Eintrag');
reset role;

-- Hanna: ihr Eintrag ist unveraendert, Entfernen wirkt nur bei ihr.
select tests.authenticate((current_setting('vt.hanna')::uuid));
select tests.eq((select note from public.watchlist_items where instrument_id = 'vu_d57074b4128184'), 'Beobachten bis Q4', 'Notiz unveraendert');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 1, 'eigener Eintrag entfernt');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 0, 'zweites Entfernen idempotent');
reset role;
select tests.authenticate((current_setting('vt.ivo')::uuid));
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'Ivos Eintrag bleibt');
reset role;

-- Free: 20 Titel je Liste, serverseitig.
select tests.authenticate((current_setting('vt.hanna')::uuid));
select public.watchlist_add('vu_' || lpad(to_hex(g), 8, '0'), null) from generate_series(1, 19) g;
select tests.throws($$select public.watchlist_add('vu_ffffffff', null)$$, 'WATCHLIST_ITEMS_LIMIT_REACHED');
reset role;

-- Tarifwechsel: Plus -> Free. Nichts wird geloescht; ueber der Free-Grenze darf nur nichts Neues dazukommen.
select set_config('vt.jule', (tests.create_user('jule@example.test'))::text, true);
select tests.service();
select public.billing_link_customer((current_setting('vt.jule')::uuid), 'stripe', 'cus_jule');
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_jule','provider_customer_id','cus_jule',
  'provider_price_id','price_test_plus_month','status','active','current_period_end', now() + interval '30 days','state_at', now()));
reset role;
select tests.authenticate((current_setting('vt.jule')::uuid));
select tests.eq((public.watchlist_import((select jsonb_agg(jsonb_build_object('instrumentId', 'vu_' || lpad(to_hex(g), 10, '0'))) from generate_series(1, 30) g)) ->> 'added')::int,
  30, 'Plus: 30 Titel');
reset role;
select tests.service();
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_jule','provider_customer_id','cus_jule',
  'provider_price_id','price_test_plus_month','status','canceled','current_period_end', now() - interval '1 day','state_at', now() + interval '1 minute'));
reset role;
select tests.authenticate((current_setting('vt.jule')::uuid));
select tests.eq((select count(*) from public.watchlist_items)::int, 30, 'nach Kuendigung bleibt alles lesbar');
select tests.throws($$select public.watchlist_add('vu_ffffffff01', null)$$, 'WATCHLIST_ITEMS_LIMIT_REACHED');
select tests.eq(public.watchlist_remove('vu_' || lpad(to_hex(1), 10, '0')), 1, 'Entfernen bleibt moeglich');
select tests.eq((public.watchlist_import('[{"instrumentId":"vu_ffffffff02"}]') ->> 'limitReached')::boolean, true, 'Uebernahme stoppt an der Free-Grenze');
reset role;

-- Anonym: keine Funktion, keine Tabelle.
select tests.anon();
select tests.throws($$select public.watchlist_add('vu_d57074b4128184', 'NVDA')$$, 'permission denied');
select tests.throws($$select public.watchlist_default()$$, 'permission denied');
select tests.throws($$select * from public.watchlist_items$$, 'permission denied');
reset role;

-- Kontoloeschung entfernt Listen und Eintraege (Cascade), andere Konten bleiben.
delete from auth.users where id = (current_setting('vt.hanna')::uuid);
select tests.eq((select count(*) from public.watchlist_items where user_id = (current_setting('vt.hanna')::uuid))::int, 0, 'Eintraege geloescht');
select tests.eq((select count(*) from public.watchlists where user_id = (current_setting('vt.hanna')::uuid))::int, 0, 'Listen geloescht');
select tests.eq((select count(*) from public.watchlist_items where user_id = (current_setting('vt.ivo')::uuid))::int, 1, 'fremde Eintraege bleiben');
-- Index fuer den spaeteren Fan-out vorhanden.
select tests.eq((select count(*) from pg_indexes where indexname = 'watchlist_items_instrument')::int, 1, 'Fan-out-Index');

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 08_watchlist_personal.sql'; end $vu_end$;
