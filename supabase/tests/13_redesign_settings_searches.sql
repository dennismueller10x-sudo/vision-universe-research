-- Redesign Z1 (Erfahrung Profi, Ziel, erster Start) und Z3 (gespeicherte Suchen):
-- Pruefregeln, Spaltenrechte, RLS, Grenze 50, Loeschung mit dem Konto.
begin;
select tests.create_user('karla@example.test') as karla \gset
select tests.create_user('lars@example.test') as lars \gset

-- ---------------------------------------------------------------- Z1
select tests.eq((select goal from public.user_settings where user_id = :'karla'), null::text, 'Ziel standardmaessig leer');
select tests.eq((select onboarded_at from public.user_settings where user_id = :'karla'), null::timestamptz, 'erster Start offen');

select tests.authenticate(:'karla');
update public.user_settings set experience_level = 'pro', goal = 'strategien' where user_id = :'karla';
select tests.eq((select experience_level from public.user_settings), 'pro', 'Profi erlaubt');
update public.user_settings set experience_level = 'advanced' where user_id = :'karla';
update public.user_settings set experience_level = 'beginner' where user_id = :'karla';
select tests.eq((select experience_level from public.user_settings), 'beginner', 'alte Werte bleiben gueltig');
select tests.throws($$update public.user_settings set experience_level = 'expert'$$, 'user_settings_experience_level_check');
select tests.throws($$update public.user_settings set goal = 'reich_werden'$$, 'user_settings_goal_check');
update public.user_settings set goal = 'vorsorge';
update public.user_settings set goal = 'aktie';
update public.user_settings set goal = 'ideen';
update public.user_settings set goal = null;
select tests.eq((select goal from public.user_settings), null::text, 'Ziel zuruecksetzbar');
update public.user_settings set goal = 'ideen';

-- Zeitpunkt kommt von der Datenbank, nicht vom Client; der erste bleibt bestehen.
update public.user_settings set onboarded_at = '2000-01-01T00:00:00Z' where user_id = :'karla';
select tests.eq((select onboarded_at from public.user_settings), now(), 'onboarded_at = now() (Transaktionszeit)');
update public.user_settings set onboarded_at = '2099-01-01T00:00:00Z';
select tests.eq((select onboarded_at from public.user_settings), now(), 'einmal gesetzt: unveraendert');
update public.user_settings set onboarded_at = null;
select tests.eq((select onboarded_at is not null from public.user_settings), true, 'kein Zuruecksetzen durch den Nutzer');
-- Andere Spalten bleiben gesperrt, fremde Zeilen unberuehrt.
select tests.throws($$update public.user_settings set user_id = gen_random_uuid()$$, 'permission denied');
select tests.throws($$update public.user_settings set updated_at = now()$$, 'permission denied');
update public.user_settings set goal = 'aktie', experience_level = 'pro' where user_id = :'lars';
reset role;
select tests.eq((select goal from public.user_settings where user_id = :'lars'), null::text, 'fremdes Ziel unveraendert');
select tests.eq((select experience_level from public.user_settings where user_id = :'lars'), 'beginner', 'fremde Erfahrung unveraendert');
select tests.eq((select goal from public.user_settings where user_id = :'karla'), 'ideen', 'eigenes Ziel gespeichert');

-- Spaltenrechte: genau die freigegebenen Spalten.
select tests.eq(has_column_privilege('authenticated', 'public.user_settings', 'goal', 'UPDATE'), true, 'goal schreibbar');
select tests.eq(has_column_privilege('authenticated', 'public.user_settings', 'onboarded_at', 'UPDATE'), true, 'onboarded_at schreibbar');
select tests.eq(has_column_privilege('authenticated', 'public.user_settings', 'user_id', 'UPDATE'), false, 'user_id gesperrt');
select tests.eq(has_column_privilege('anon', 'public.user_settings', 'goal', 'SELECT'), false, 'anon liest nichts');

-- ---------------------------------------------------------------- Z3
select tests.authenticate(:'karla');
select public.saved_search_create('quant', 'Qualitaet > 80', '{"minScore":80,"sort":"score"}') ->> 'id' as k1 \gset
select tests.eq((public.saved_search_create('discover', '  Dividenden  ', '{}') ->> 'name'), 'Dividenden', 'Name getrimmt');
select tests.throws($$select public.saved_search_create('krypto', 'x', '{}')$$, 'WORLD_INVALID');
select tests.throws($$select public.saved_search_create('quant', '', '{}')$$, 'NAME_INVALID');
select tests.throws(format($$select public.saved_search_create('quant', %L, '{}')$$, repeat('n', 81)), 'NAME_INVALID');
select tests.throws($$select public.saved_search_create('quant', 'x', '[1,2]')$$, 'QUERY_INVALID');
select tests.throws($$select public.saved_search_create('quant', 'x', null)$$, 'QUERY_INVALID');
select tests.throws(format($$select public.saved_search_create('quant', 'x', %L)$$, jsonb_build_object('q', repeat('a', 4100))), 'QUERY_TOO_LARGE');
-- Direkter Zugriff: Pruefregeln greifen auch ohne Funktion.
select tests.throws(format($$insert into public.saved_searches (user_id, world, name, query) values (%L, 'quant', 'x', '"text"')$$, :'karla'), 'saved_searches_query_valid');
select tests.throws(format($$insert into public.saved_searches (user_id, world, name, query) values (%L, 'quant', 'x', '{}')$$, :'lars'), 'SAVED_SEARCH_NOT_OWNED');
select tests.throws($$update public.saved_searches set world = 'screener'$$, 'permission denied');
select tests.throws($$update public.saved_searches set user_id = gen_random_uuid()$$, 'permission denied');
-- Aendern.
select tests.eq(public.saved_search_update(:'k1', '{"name":"Qualitaet > 85","query":{"minScore":85}}') -> 'query' ->> 'minScore', '85', 'Suche geaendert');
select tests.eq(public.saved_search_update(:'k1', '{"name":"Nur Name"}') -> 'query' ->> 'minScore', '85', 'Abfrage bleibt bei Namensaenderung');
select tests.throws(format($$select public.saved_search_update(%L, '{}')$$, :'k1'), 'NOTHING_TO_UPDATE');
select tests.throws(format($$select public.saved_search_update(%L, '{"name":7}')$$, :'k1'), 'NAME_INVALID');
select tests.throws(format($$select public.saved_search_update(%L, '{"query":"x"}')$$, :'k1'), 'QUERY_INVALID');
select tests.eq((select count(*) from public.saved_searches)::int, 2, 'Karla sieht ihre zwei Suchen');
reset role;

-- Lars sieht und veraendert nichts von Karla.
select tests.authenticate(:'lars');
select tests.eq((select count(*) from public.saved_searches)::int, 0, 'fremde Suchen unsichtbar');
select tests.throws(format($$select public.saved_search_update(%L, '{"name":"fremd"}')$$, :'k1'), 'SAVED_SEARCH_NOT_FOUND');
select tests.eq(public.saved_search_remove(:'k1'), 0, 'fremde Suche nicht entfernt');
delete from public.saved_searches;
select public.saved_search_create('screener', 'Lars', '{"pe":{"max":15}}') ->> 'id' as l1 \gset
reset role;
select tests.eq((select name from public.saved_searches where id = :'k1'), 'Nur Name', 'Karlas Suche unberuehrt');

-- Grenze 50 je Konto (Karla hat 2).
select tests.authenticate(:'karla');
select public.saved_search_create('technical', 'Suche ' || g, jsonb_build_object('n', g)) from generate_series(1, 48) g;
select tests.eq((select count(*) from public.saved_searches)::int, 50, '50 Suchen');
select tests.throws($$select public.saved_search_create('quant', 'zu viel', '{}')$$, 'SAVED_SEARCHES_LIMIT_REACHED');
select tests.throws(format($$insert into public.saved_searches (user_id, world, name) values (%L, 'quant', 'direkt')$$, :'karla'), 'SAVED_SEARCHES_LIMIT_REACHED');
select tests.eq(public.saved_search_remove(:'k1'), 1, 'eigene Suche entfernt');
select tests.eq(public.saved_search_remove(:'k1'), 0, 'zweites Entfernen idempotent');
select tests.eq((public.saved_search_create('quant', 'wieder Platz', '{}') ->> 'world'), 'quant', 'nach Entfernen wieder Platz');
reset role;
select tests.authenticate(:'lars');
select tests.eq((select count(*) from public.saved_searches)::int, 1, 'Grenze gilt je Konto');
reset role;

-- Anonym: keine Tabelle, keine Funktion.
select tests.anon();
select tests.throws($$select * from public.saved_searches$$, 'permission denied');
select tests.throws($$select public.saved_search_create('quant', 'x', '{}')$$, 'permission denied');
select tests.throws($$select public.saved_search_remove(gen_random_uuid())$$, 'permission denied');
reset role;
select tests.eq((select relrowsecurity from pg_class where oid = 'public.saved_searches'::regclass), true, 'RLS an');

-- Kontoloeschung entfernt Suchen (cascade), andere Konten bleiben.
delete from auth.users where id = :'karla';
select tests.eq((select count(*) from public.saved_searches where user_id = :'karla')::int, 0, 'Suchen mit dem Konto geloescht');
select tests.eq((select count(*) from public.saved_searches where user_id = :'lars')::int, 1, 'fremde Suchen bleiben');
rollback;
