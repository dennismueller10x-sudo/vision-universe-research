-- Tarifverwaltung (20261030000100): Rolle, Audit-Log, neuer Preis fuer neue Abos, bestehende Abos unveraendert.
begin;
select tests.create_user('paula@example.test') as paula \gset
select tests.create_user('kunde@example.test') as kunde \gset

-- 1 Niemand vergibt sich die Rolle selbst; Konten sehen weder Audit-Log noch Verwaltungsfunktionen.
select tests.authenticate(:'paula');
select tests.throws(format($$insert into public.user_roles (user_id, role) values (%L, 'pricing_admin')$$, :'paula'), 'permission denied');
select tests.throws($$select * from billing.price_changes$$, 'permission denied');
select tests.throws($$select public.billing_pricing_overview(false)$$, 'permission denied');
select tests.throws($$select public.billing_price_change_begin('pc_' || repeat('a', 32), null, 'pro_month', 'price_test_pro_month', 2490)$$, 'permission denied');
select tests.throws($$select public.billing_price_change_apply('pc_' || repeat('a', 32))$$, 'permission denied');
reset role;
insert into public.user_roles (user_id, role) values (:'paula', 'pricing_admin');
select tests.authenticate(:'paula');
select tests.eq((select count(*) from public.user_roles where role = 'pricing_admin')::int, 1, 'eigene rolle lesbar');
select tests.throws($$delete from public.user_roles where role = 'pricing_admin'$$, 'permission denied');
reset role;

-- 2 Ein bestehendes Abo auf dem alten Preis.
insert into public.subscriptions (user_id, plan_id, price_id, provider, provider_subscription_id, provider_customer_id, status, billing_interval,
  current_period_start, current_period_end, livemode, provider_state_at)
values (:'kunde', 'pro', 'pro_month', 'stripe', 'sub_alt', 'cus_alt', 'active', 'month', now(), now() + interval '30 days', false, now());
select tests.eq((select (e ->> 'subscribers')::int from jsonb_array_elements(public.billing_pricing_overview(false) -> 'prices') e where e ->> 'id' = 'pro_month'), 1, 'uebersicht: ein abo auf dem preis');

-- 3 Anmelden: veralteter Preis, unveraenderter Betrag und Mindestbetrag werden abgelehnt.
select tests.throws($$select public.billing_price_change_begin('pc_' || repeat('1', 32), null, 'pro_month', 'price_veraltet', 2490)$$, 'PRICE_CHANGED');
select tests.throws($$select public.billing_price_change_begin('pc_' || repeat('2', 32), null, 'pro_month', 'price_test_pro_month', 1990)$$, 'PRICE_UNCHANGED');
select tests.throws($$select public.billing_price_change_begin('pc_' || repeat('3', 32), null, 'pro_month', 'price_test_pro_month', 10)$$, 'price_changes_new_amount_check');

-- 4 Ablauf: anmelden (idempotent), Stripe-Preis vermerken, aktivieren.
select public.billing_price_change_begin('pc_' || repeat('a', 32), :'paula', 'pro_month', 'price_test_pro_month', 2490) ->> 'status' as s1 \gset
select tests.eq(:'s1'::text, 'started', 'angemeldet');
select tests.eq(public.billing_price_change_begin('pc_' || repeat('a', 32), :'paula', 'pro_month', 'price_test_pro_month', 2490) ->> 'status', 'started', 'zweiter aufruf: derselbe vorgang');
select tests.throws(format($$select public.billing_price_change_begin('pc_' || repeat('a', 32), %L, 'pro_month', 'price_test_pro_month', 2990)$$, :'paula'), 'CHANGE_ID_REUSED');
select tests.throws($$select public.billing_price_change_begin('pc_' || repeat('b', 32), null, 'pro_month', 'price_test_pro_month', 2990)$$, 'CHANGE_IN_PROGRESS');
select tests.throws($$select public.billing_price_change_apply('pc_' || repeat('a', 32))$$, 'CHANGE_NOT_READY');
select public.billing_price_change_stripe('pc_' || repeat('a', 32), 'price_test_pro_month_neu');
select public.billing_price_change_apply('pc_' || repeat('a', 32)) ->> 'new_plan_price_id' as neu \gset
select tests.eq(public.billing_price_change_apply('pc_' || repeat('a', 32)) ->> 'status', 'applied', 'zweites aktivieren: nichts doppelt');

-- 5 Ergebnis: genau ein aktiver Pro-Monatspreis (neu), alter Preis inaktiv, bestehendes Abo unveraendert.
select tests.eq((select count(*) from public.plan_prices where plan_id = 'pro' and billing_interval = 'month' and active and not livemode)::int, 1, 'ein aktiver preis');
select tests.eq((select unit_amount from public.plan_prices where id = :'neu'), 2490, 'neuer preis aktiv');
select tests.eq((select active from public.plan_prices where id = 'pro_month'), false, 'alter preis inaktiv, bleibt erhalten');
select tests.eq((select price_id from public.subscriptions where provider_subscription_id = 'sub_alt'), 'pro_month', 'bestandsabo unveraendert');
select tests.eq((select provider_price_id from public.plan_prices where id = 'pro_month'), 'price_test_pro_month', 'alte stripe-zuordnung bleibt');
select tests.eq((select status from billing.price_changes where change_id = 'pc_' || repeat('a', 32)), 'applied', 'audit: angewendet');
select tests.eq((select admin_user_id from billing.price_changes where change_id = 'pc_' || repeat('a', 32)), :'paula'::uuid, 'audit: wer');
select tests.eq((select count(*) from public.plan_prices where id = :'neu' and provider_price_id = 'price_test_pro_month_neu')::int, 1, 'neue zuordnung');

-- 6 Oeffentliche Preisliste zeigt nur den neuen Preis.
select tests.authenticate(:'kunde');
select tests.eq((select count(*) from public.plan_prices where plan_id = 'pro' and billing_interval = 'month')::int, 1, 'konto sieht nur den aktiven preis');
reset role;

-- 7 Fehler vor Stripe: als fehlgeschlagen vermerkt; Fehler nach Stripe: wiederholbar.
select public.billing_price_change_begin('pc_' || repeat('c', 32), :'paula', :'neu', 'price_test_pro_month_neu', 2990);
select public.billing_price_change_failed('pc_' || repeat('c', 32), 'STRIPE_DOWN');
select tests.eq((select status from billing.price_changes where change_id = 'pc_' || repeat('c', 32)), 'failed', 'fehler vor stripe: failed');
select public.billing_price_change_begin('pc_' || repeat('d', 32), :'paula', :'neu', 'price_test_pro_month_neu', 2990);
select public.billing_price_change_stripe('pc_' || repeat('d', 32), 'price_test_pro_month_d');
select public.billing_price_change_failed('pc_' || repeat('d', 32), 'DB_TIMEOUT');
select tests.eq((select status from billing.price_changes where change_id = 'pc_' || repeat('d', 32)), 'stripe_created', 'fehler nach stripe: wiederholbar');
select tests.eq(public.billing_price_change_apply('pc_' || repeat('d', 32)) ->> 'status', 'applied', 'wiederholung schliesst ab');
rollback;
