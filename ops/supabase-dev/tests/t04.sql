-- 04_watchlists.sql (in einer Transaktion, endet mit Rollback)
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

-- Watchlists: RLS und Tarifgrenzen in der Datenbank.
select set_config('vt.fritz', (tests.create_user('fritz@example.test'))::text, true);
select set_config('vt.gina', (tests.create_user('gina@example.test'))::text, true);

select tests.authenticate((current_setting('vt.gina')::uuid));
with r as (insert into public.watchlists (name) values ('Gina') returning id) select set_config('vt.gina_list', (select id from r)::text, true);
reset role;

select tests.authenticate((current_setting('vt.fritz')::uuid));
with r as (insert into public.watchlists (name) values ('Meine Liste') returning id) select set_config('vt.fritz_list', (select id from r)::text, true);
-- free: eine Liste.
select tests.throws($$insert into public.watchlists (name) values ('Zweite')$$, 'WATCHLIST_LIMIT_REACHED');
-- Fremde Liste: weder sehen noch befuellen.
select tests.eq((select count(*) from public.watchlists)::int, 1, 'nur eigene listen');
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'vu_abc123')$$, (current_setting('vt.gina_list')::uuid)), 'WATCHLIST_NOT_OWNED');
select tests.throws(format($$insert into public.watchlists (user_id, name) values (%L, 'untergeschoben')$$, (current_setting('vt.gina')::uuid)), 'WATCHLIST_NOT_OWNED');
-- Kennung muss instrumentId sein, kein Ticker.
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'NVDA')$$, (current_setting('vt.fritz_list')::uuid)), 'check');
insert into public.watchlist_items (watchlist_id, instrument_id, ticker_at_add)
  select (current_setting('vt.fritz_list')::uuid)::uuid, 'vu_' || lpad(to_hex(g), 6, '0'), 'T' || g from generate_series(1, 20) g;
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'vu_ffffff')$$, (current_setting('vt.fritz_list')::uuid)), 'WATCHLIST_ITEMS_LIMIT_REACHED');
select tests.throws($$update public.watchlist_items set user_id = gen_random_uuid()$$, 'permission denied');
reset role;

-- Mit Plus-Abo steigt die Grenze - serverseitig, ohne Zutun des Browsers.
select tests.service();
select public.billing_link_customer((current_setting('vt.fritz')::uuid), 'stripe', 'cus_fritz');
select public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_fritz','provider_customer_id','cus_fritz','provider_price_id','price_test_plus_month',
  'status','active','current_period_end', now() + interval '30 days','state_at', now()));
reset role;
select tests.authenticate((current_setting('vt.fritz')::uuid));
insert into public.watchlists (name) values ('Zweite');
insert into public.watchlist_items (watchlist_id, instrument_id) values ((current_setting('vt.fritz_list')::uuid), 'vu_ffffff');
select tests.eq((select count(*) from public.watchlist_items)::int, 21, 'plus erlaubt mehr');
reset role;

select tests.anon();
select tests.throws($$select * from public.watchlists$$, 'permission denied');
reset role;

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 04_watchlists.sql'; end $vu_end$;
