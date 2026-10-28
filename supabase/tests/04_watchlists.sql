-- Watchlists: RLS und Tarifgrenzen in der Datenbank.
begin;
-- Variante A (eingeschraenktes Free) nur in dieser Transaktion: prueft Grenzen und Hochstufung.
update public.plan_features set limit_value = 1 where plan_id = 'free' and feature_key = 'watchlist.lists';
update public.plan_features set limit_value = 20 where plan_id = 'free' and feature_key = 'watchlist.items';
select tests.create_user('fritz@example.test') as fritz \gset
select tests.create_user('gina@example.test') as gina \gset

select tests.authenticate(:'gina');
insert into public.watchlists (name) values ('Gina') returning id as gina_list \gset
reset role;

select tests.authenticate(:'fritz');
insert into public.watchlists (name) values ('Meine Liste') returning id as fritz_list \gset
-- free: eine Liste.
select tests.throws($$insert into public.watchlists (name) values ('Zweite')$$, 'WATCHLIST_LIMIT_REACHED');
-- Fremde Liste: weder sehen noch befuellen.
select tests.eq((select count(*) from public.watchlists)::int, 1, 'nur eigene listen');
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'vu_abc123')$$, :'gina_list'), 'WATCHLIST_NOT_OWNED');
select tests.throws(format($$insert into public.watchlists (user_id, name) values (%L, 'untergeschoben')$$, :'gina'), 'WATCHLIST_NOT_OWNED');
-- Kennung muss instrumentId sein, kein Ticker.
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'NVDA')$$, :'fritz_list'), 'check');
insert into public.watchlist_items (watchlist_id, instrument_id, ticker_at_add)
  select :'fritz_list'::uuid, 'vu_' || lpad(to_hex(g), 6, '0'), 'T' || g from generate_series(1, 20) g;
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, instrument_id) values (%L, 'vu_ffffff')$$, :'fritz_list'), 'WATCHLIST_ITEMS_LIMIT_REACHED');
select tests.throws($$update public.watchlist_items set user_id = gen_random_uuid()$$, 'permission denied');
reset role;

-- Mit Plus-Abo steigt die Grenze - serverseitig, ohne Zutun des Browsers.
select tests.service();
select public.billing_link_customer(:'fritz', 'stripe', 'cus_fritz');
select public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_fritz','provider_customer_id','cus_fritz','provider_price_id','price_test_plus_month',
  'status','active','current_period_end', now() + interval '30 days','state_at', now()));
reset role;
select tests.authenticate(:'fritz');
insert into public.watchlists (name) values ('Zweite');
insert into public.watchlist_items (watchlist_id, instrument_id) values (:'fritz_list', 'vu_ffffff');
select tests.eq((select count(*) from public.watchlist_items)::int, 21, 'plus erlaubt mehr');
reset role;

select tests.anon();
select tests.throws($$select * from public.watchlists$$, 'permission denied');
reset role;
rollback;
