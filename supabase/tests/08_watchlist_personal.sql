-- Persoenliche Watchlist: Hinzufuegen/Entfernen, Isolation zwischen Nutzern, Loeschung.
begin;
select tests.create_user('hanna@example.test') as hanna \gset
select tests.create_user('ivo@example.test') as ivo \gset

-- Hanna: Standardliste entsteht beim ersten Hinzufuegen, doppelt ist idempotent.
select tests.authenticate(:'hanna');
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ADDED', 'erstes Hinzufuegen');
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ALREADY_PRESENT', 'doppelt -> idempotent');
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'kein Duplikat');
select tests.eq((select count(*) from public.watchlists)::int, 1, 'genau eine Standardliste');
select public.watchlist_default() as hanna_list \gset
select tests.eq(public.watchlist_add('vu_aaaaaa111111', null) ->> 'listId', :'hanna_list', 'Standardliste wiederverwendet');
-- Kennung muss instrumentId sein, kein Ticker; Ticker nur in gueltiger Form.
select tests.throws($$select public.watchlist_add('NVDA', 'NVDA')$$, 'INSTRUMENT_INVALID');
select tests.throws($$select public.watchlist_add('vu_abcdef12', 'nv da')$$, 'TICKER_INVALID');
-- Notiz und Benachrichtigungen.
select tests.eq(public.watchlist_update('vu_d57074b4128184', :'hanna_list',
  '{"note":"Beobachten bis Q4","alerts":{"PRICE_EVENT":true,"SUPERTRADER_SIGNAL":false}}') -> 'alerts' ->> 'PRICE_EVENT', 'true', 'alerts gesetzt');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"alerts":{"MARKET_REGIME_CHANGE":true}}')$$, :'hanna_list'), 'ALERTS_INVALID');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"alerts":{"PRICE_EVENT":"ja"}}')$$, :'hanna_list'), 'ALERTS_INVALID');
select tests.throws($$update public.watchlist_items set alerts = '{"X":1}'$$, 'watchlist_items_alerts_valid');
select tests.throws($$update public.watchlist_items set instrument_id = 'vu_bbbbbb'$$, 'permission denied');
reset role;

-- Ivo sieht und veraendert nichts von Hanna.
select tests.authenticate(:'ivo');
select tests.eq((select count(*) from public.watchlist_items)::int, 0, 'fremde Eintraege unsichtbar');
select tests.eq((select count(*) from public.watchlists)::int, 0, 'fremde Listen unsichtbar');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 0, 'fremden Eintrag nicht entfernt');
select tests.throws(format($$select public.watchlist_update('vu_d57074b4128184', %L, '{"note":"x"}')$$, :'hanna_list'), 'WATCHLIST_ITEM_NOT_FOUND');
select tests.throws(format($$select public.watchlist_add('vu_cccccc', 'X', %L)$$, :'hanna_list'), 'WATCHLIST_NOT_FOUND');
select tests.throws(format($$insert into public.watchlist_items (watchlist_id, user_id, instrument_id) values (%L, %L, 'vu_cccccc')$$, :'hanna_list', :'ivo'), 'WATCHLIST_NOT_OWNED');
select tests.eq(public.watchlist_add('vu_d57074b4128184', 'NVDA') ->> 'state', 'ADDED', 'Ivo hat eigene Liste');
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'Ivo sieht nur seinen Eintrag');
reset role;

-- Hanna: ihr Eintrag ist unveraendert, Entfernen wirkt nur bei ihr.
select tests.authenticate(:'hanna');
select tests.eq((select note from public.watchlist_items where instrument_id = 'vu_d57074b4128184'), 'Beobachten bis Q4', 'Notiz unveraendert');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 1, 'eigener Eintrag entfernt');
select tests.eq(public.watchlist_remove('vu_d57074b4128184'), 0, 'zweites Entfernen idempotent');
reset role;
select tests.authenticate(:'ivo');
select tests.eq((select count(*) from public.watchlist_items)::int, 1, 'Ivos Eintrag bleibt');
reset role;

-- Free: 20 Titel je Liste, serverseitig.
select tests.authenticate(:'hanna');
select public.watchlist_add('vu_' || lpad(to_hex(g), 8, '0'), null) from generate_series(1, 19) g;
select tests.throws($$select public.watchlist_add('vu_ffffffff', null)$$, 'WATCHLIST_ITEMS_LIMIT_REACHED');
reset role;

-- Tarifwechsel: Plus -> Free. Nichts wird geloescht; ueber der Free-Grenze darf nur nichts Neues dazukommen.
select tests.create_user('jule@example.test') as jule \gset
select tests.service();
select public.billing_link_customer(:'jule', 'stripe', 'cus_jule');
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_jule','provider_customer_id','cus_jule',
  'provider_price_id','price_test_plus_month','status','active','current_period_end', now() + interval '30 days','state_at', now()));
reset role;
select tests.authenticate(:'jule');
select tests.eq((public.watchlist_import((select jsonb_agg(jsonb_build_object('instrumentId', 'vu_' || lpad(to_hex(g), 10, '0'))) from generate_series(1, 30) g)) ->> 'added')::int,
  30, 'Plus: 30 Titel');
reset role;
select tests.service();
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_jule','provider_customer_id','cus_jule',
  'provider_price_id','price_test_plus_month','status','canceled','current_period_end', now() - interval '1 day','state_at', now() + interval '1 minute'));
reset role;
select tests.authenticate(:'jule');
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
delete from auth.users where id = :'hanna';
select tests.eq((select count(*) from public.watchlist_items where user_id = :'hanna')::int, 0, 'Eintraege geloescht');
select tests.eq((select count(*) from public.watchlists where user_id = :'hanna')::int, 0, 'Listen geloescht');
select tests.eq((select count(*) from public.watchlist_items where user_id = :'ivo')::int, 1, 'fremde Eintraege bleiben');
-- Index fuer den spaeteren Fan-out vorhanden.
select tests.eq((select count(*) from pg_indexes where indexname = 'watchlist_items_instrument')::int, 1, 'Fan-out-Index');
rollback;
