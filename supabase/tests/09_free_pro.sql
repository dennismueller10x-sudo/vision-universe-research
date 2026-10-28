-- Tarife Free und Pro (20261028000200): gleicher Umfang, gesperrte Funktionen, Testerrolle.
begin;
select tests.create_user('kim@example.test') as kim \gset

-- Free und Pro sind gleich; nichts Gesperrtes ist in einem Tarif.
select tests.eq((select jsonb_object_agg(feature_key, limit_value) from public.plan_features where plan_id = 'free'),
                (select jsonb_object_agg(feature_key, limit_value) from public.plan_features where plan_id = 'pro'), 'free = pro');
select tests.eq((select count(*) from public.plan_features
                  where feature_key in ('quant.screener.full', 'supertrader.signals', 'alerts.push', 'export.csv'))::int, 0, 'gesperrte funktionen in keinem tarif');
select tests.eq((public.effective_entitlements(:'kim') -> 'features' ->> 'watchlist.items')::int, 500, 'free: 500 titel');
select tests.eq((public.effective_entitlements(:'kim') -> 'features' ->> 'watchlist.lists')::int, 25, 'free: 25 listen');
select tests.eq((select active or is_public from public.plans where id = 'plus'), false, 'plus weder aktiv noch oeffentlich');

-- Testerrolle: nur der Service vergibt sie, das Konto sieht sie, kann sie aber nicht selbst setzen.
select tests.authenticate(:'kim');
select tests.throws(format($$insert into public.user_roles (user_id, role) values (%L, 'billing_tester')$$, :'kim'), 'permission denied');
select tests.eq((select count(*) from public.user_roles where role = 'billing_tester')::int, 0, 'keine testerrolle');
reset role;
insert into public.user_roles (user_id, role) values (:'kim', 'billing_tester');
select tests.authenticate(:'kim');
select tests.eq((select count(*) from public.user_roles where role = 'billing_tester')::int, 1, 'eigene testerrolle lesbar');
select tests.throws($$delete from public.user_roles$$, 'permission denied');
reset role;
rollback;
