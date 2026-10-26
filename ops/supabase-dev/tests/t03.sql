-- 03_billing.sql (in einer Transaktion, endet mit Rollback)
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

-- Abrechnung: Schreibschutz, Zuordnung, Idempotenz, Reihenfolge, Berechtigungen.
select set_config('vt.dora', (tests.create_user('dora@example.test'))::text, true);
select set_config('vt.eve', (tests.create_user('eve@example.test'))::text, true);

-- ---------------------------------------------------------------- Zugriffsregel
select tests.eq(public.subscription_grants_access('active', now() + interval '1 day', null, now()), true, 'active');
select tests.eq(public.subscription_grants_access('active', now() - interval '1 day', null, now()), true, 'active, webhook-verzug');
select tests.eq(public.subscription_grants_access('active', now() - interval '3 days', null, now()), false, 'active, laengst abgelaufen');
select tests.eq(public.subscription_grants_access('active', null, null, now()), false, 'active ohne periode');
select tests.eq(public.subscription_grants_access('trialing', now() + interval '5 days', null, now()), true, 'trialing');
select tests.eq(public.subscription_grants_access('past_due', now() - interval '3 days', null, now()), true, 'past_due in kulanz');
select tests.eq(public.subscription_grants_access('past_due', now() - interval '8 days', null, now()), false, 'past_due nach kulanz');
select tests.eq(public.subscription_grants_access('in_grace_period', now() - interval '1 day', now() + interval '1 day', now()), true, 'grace_until');
select tests.eq(public.subscription_grants_access('canceled', now() + interval '10 days', null, now()), false, 'canceled');
select tests.eq(public.subscription_grants_access('unpaid', now() + interval '10 days', null, now()), false, 'unpaid');
select tests.eq(public.subscription_grants_access('incomplete', now() + interval '10 days', null, now()), false, 'incomplete');
select tests.eq(public.subscription_grants_access('paused', now() + interval '10 days', null, now()), false, 'paused');
select tests.eq(public.subscription_grants_access('revoked', now() + interval '10 days', null, now()), false, 'revoked');

-- ---------------------------------------------------------------- Browser darf nichts schreiben
select tests.authenticate((current_setting('vt.dora')::uuid));
select tests.throws($$select * from billing.customers$$, 'permission denied');
select tests.throws($$select * from billing.payment_events$$, 'permission denied');
select tests.throws(format($$insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, provider_state_at)
  values (%L, 'pro', 'stripe', 'sub_fake', 'active', now())$$, (current_setting('vt.dora')::uuid)), 'permission denied');
select tests.throws($$update public.subscriptions set status = 'active'$$, 'permission denied');
select tests.throws($$select public.billing_apply_subscription('{}'::jsonb)$$, 'permission denied');
select tests.throws($$select public.billing_claim_event('stripe', 'evt_x', 't', false, null)$$, 'permission denied');
select tests.throws(format($$select public.billing_link_customer(%L, 'stripe', 'cus_fake')$$, (current_setting('vt.dora')::uuid)), 'permission denied');
select tests.throws(format($$select public.effective_entitlements(%L)$$, (current_setting('vt.eve')::uuid)), 'permission denied');
select tests.eq(public.my_entitlements() ->> 'plan_id', 'free', 'neues konto: free');
reset role;
select tests.anon();
select tests.throws($$select * from public.subscriptions$$, 'permission denied');
select tests.throws($$select * from public.invoices$$, 'permission denied');
select tests.throws($$select public.my_entitlements()$$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- Server (service_role)
select tests.service();
select public.billing_link_customer((current_setting('vt.dora')::uuid), 'stripe', 'cus_dora');
select public.billing_link_customer((current_setting('vt.dora')::uuid), 'stripe', 'cus_dora'); -- wiederholbar
select tests.throws(format($$select public.billing_link_customer(%L, 'stripe', 'cus_dora')$$, (current_setting('vt.eve')::uuid)), 'CUSTOMER_USER_MISMATCH');
select tests.throws(format($$select public.billing_link_customer(%L, 'stripe', 'cus_dora_2')$$, (current_setting('vt.dora')::uuid)), 'USER_HAS_OTHER_CUSTOMER');
select tests.eq(public.billing_customer_for_user((current_setting('vt.dora')::uuid), 'stripe'), 'cus_dora', 'kunde zu nutzer');

-- Unbekannter Kunde, unbekannter Preis, falscher Modus, falscher Nutzer.
select tests.throws($$select public.billing_apply_subscription('{"provider":"stripe","provider_subscription_id":"sub_1","provider_customer_id":"cus_unknown","provider_price_id":"price_test_plus_month","status":"active","state_at":"2026-10-01T00:00:00Z"}')$$, 'CUSTOMER_NOT_LINKED');
select tests.throws($$select public.billing_apply_subscription('{"provider":"stripe","provider_subscription_id":"sub_1","provider_customer_id":"cus_dora","provider_price_id":"price_live_attack","status":"active","state_at":"2026-10-01T00:00:00Z"}')$$, 'UNKNOWN_PRICE');
select tests.throws($$select public.billing_apply_subscription('{"provider":"stripe","provider_subscription_id":"sub_1","provider_customer_id":"cus_dora","provider_price_id":"price_test_plus_month","status":"active","livemode":true,"state_at":"2026-10-01T00:00:00Z"}')$$, 'LIVEMODE_MISMATCH');
select tests.throws(format($$select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_plus_month','status','active','state_at','2026-10-01T00:00:00Z','claimed_user_id',%L))$$, (current_setting('vt.eve')::uuid)), 'SUBSCRIPTION_USER_MISMATCH');

-- Gueltiges Plus-Abo.
select tests.eq((public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_plus_month',
  'status','active','current_period_start', now() - interval '1 day','current_period_end', now() + interval '29 days',
  'state_at', now() - interval '10 minutes','claimed_user_id', (current_setting('vt.dora')::uuid))) ->> 'plan_id'), 'plus', 'abo angelegt');
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) ->> 'plan_id', 'plus', 'dora hat plus');
select tests.eq((public.effective_entitlements((current_setting('vt.dora')::uuid)) -> 'features' ->> 'watchlist.items')::int, 100, 'plus-grenze');
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) -> 'features' -> 'quant.screener.full', 'true'::jsonb, 'plus-funktion');
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) -> 'features' ? 'export.csv', false, 'pro-funktion fehlt');

-- Aelterer Zustand ueberschreibt nie den neueren (Webhooks in falscher Reihenfolge).
select tests.eq((public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_plus_month',
  'status','canceled','current_period_end', now() + interval '29 days','state_at', now() - interval '1 hour')) ->> 'stale')::boolean,
  true, 'veraltet ignoriert');
select tests.eq((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'active', 'status bleibt');

-- Tarifwechsel plus -> pro auf demselben Abo.
select public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_pro_year',
  'status','active','current_period_end', now() + interval '365 days','state_at', now() - interval '5 minutes'));
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) ->> 'plan_id', 'pro', 'upgrade auf pro');
select tests.eq((select billing_interval::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'year', 'laufzeit jahr');

-- Fehlgeschlagene Zahlung: Kulanz, danach kein Zugang.
select public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_pro_year',
  'status','past_due','current_period_end', now() - interval '2 days','state_at', now() - interval '4 minutes'));
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) ->> 'plan_id', 'pro', 'past_due in kulanz behaelt pro');
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid), now() + interval '6 days') ->> 'plan_id', 'free', 'nach kulanz free');

-- Blockierendes Abo verhindert Doppel-Checkout.
select tests.eq(public.billing_blocking_subscription((current_setting('vt.dora')::uuid)) ->> 'provider_subscription_id', 'sub_1', 'checkout blockiert');
select tests.eq(public.billing_blocking_subscription((current_setting('vt.eve')::uuid)), null::jsonb, 'eve frei');

-- Zweites gueltiges Abo (z. B. App Store) wird erkannt, Berechtigung bleibt eindeutig (hoechster Tarif).
insert into public.plan_prices (id, plan_id, provider, provider_price_id, billing_interval, currency, unit_amount)
  values ('plus_month_ios', 'plus', 'apple', 'de.visionuniverse.plus.monthly', 'month', 'EUR', 1099);
select public.billing_link_customer((current_setting('vt.dora')::uuid), 'apple', 'apple:000123');
select tests.eq((public.billing_apply_subscription(jsonb_build_object(
  'provider','apple','provider_subscription_id','2000000123','provider_customer_id','apple:000123',
  'provider_price_id','de.visionuniverse.plus.monthly','status','active','current_period_end', now() + interval '20 days',
  'state_at', now())) ->> 'duplicate_entitling')::boolean, true, 'doppelabo erkannt');
select tests.eq((select entitling_subscriptions from billing.entitlement_conflicts where user_id = (current_setting('vt.dora')::uuid))::int, 2, 'konfliktliste');
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) ->> 'plan_id', 'pro', 'hoechster tarif gewinnt');

-- Kuendigung zum Periodenende: Zugang bis Ende, danach free.
select public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_pro_year',
  'status','canceled','current_period_end', now() - interval '1 day','ended_at', now(),'state_at', now()));
select tests.eq(public.effective_entitlements((current_setting('vt.dora')::uuid)) ->> 'plan_id', 'plus', 'stripe beendet, apple-plus bleibt');

-- Manuelle Freigabe.
insert into billing.entitlement_overrides (user_id, plan_id, reason, valid_until) values ((current_setting('vt.eve')::uuid), 'pro', 'Pressezugang', now() + interval '7 days');
select tests.eq(public.effective_entitlements((current_setting('vt.eve')::uuid)) ->> 'source', 'override', 'freigabe');
select tests.eq(public.effective_entitlements((current_setting('vt.eve')::uuid), now() + interval '8 days') ->> 'plan_id', 'free', 'freigabe abgelaufen');

-- ---------------------------------------------------------------- Idempotenz
select tests.eq(public.billing_claim_event('stripe', 'evt_1', 'invoice.paid', false, 'in_1'), 'process', 'neu');
select tests.eq(public.billing_claim_event('stripe', 'evt_1', 'invoice.paid', false, 'in_1'), 'in_progress', 'parallel');
select public.billing_finish_event('stripe', 'evt_1', 'processed', null, (current_setting('vt.dora')::uuid));
select tests.eq(public.billing_claim_event('stripe', 'evt_1', 'invoice.paid', false, 'in_1'), 'duplicate', 'doppelt');
select tests.eq(public.billing_claim_event('stripe', 'evt_2', 'invoice.paid', false, 'in_2'), 'process', 'zweites');
select public.billing_finish_event('stripe', 'evt_2', 'failed', 'UPSTREAM_TIMEOUT');
select tests.eq(public.billing_claim_event('stripe', 'evt_2', 'invoice.paid', false, 'in_2'), 'process', 'nach fehler erneut');
select tests.eq((select attempts from billing.payment_events where provider_event_id = 'evt_2'), 2, 'versuche gezaehlt');
select tests.throws($$select public.billing_finish_event('stripe', 'evt_unknown', 'processed')$$, 'EVENT_NOT_CLAIMED');

-- ---------------------------------------------------------------- Rechnungen
select public.billing_apply_invoice(jsonb_build_object(
  'provider','stripe','provider_invoice_id','in_1','provider_customer_id','cus_dora','provider_subscription_id','sub_1',
  'number','VU-0001','status','open','currency','eur','amount_due',19900,'amount_paid',0,
  'hosted_invoice_url','https://invoice.stripe.com/i/test','issued_at', now(),'state_at', now() - interval '1 minute'));
select public.billing_apply_invoice(jsonb_build_object(
  'provider','stripe','provider_invoice_id','in_1','provider_customer_id','cus_dora','provider_subscription_id','sub_1',
  'number','VU-0001','status','paid','currency','eur','amount_due',19900,'amount_paid',19900,'paid_at', now(),'state_at', now()));
select tests.throws($$select public.billing_apply_invoice(jsonb_build_object('provider','stripe','provider_invoice_id','in_x','provider_customer_id','cus_dora','status','paid','currency','EUR','hosted_invoice_url','javascript:alert(1)','state_at','2026-10-01T00:00:00Z'))$$, 'check');
reset role;

select tests.authenticate((current_setting('vt.dora')::uuid));
select tests.eq((select count(*) from public.subscriptions)::int, 2, 'dora sieht ihre abos');
select tests.eq((select status from public.invoices where provider_invoice_id = 'in_1'), 'paid', 'rechnung bezahlt');
select tests.eq(public.my_entitlements() ->> 'plan_id', 'plus', 'my_entitlements');
reset role;
select tests.authenticate((current_setting('vt.eve')::uuid));
select tests.eq((select count(*) from public.subscriptions)::int, 0, 'eve sieht keine fremden abos');
select tests.eq((select count(*) from public.invoices)::int, 0, 'eve sieht keine fremden rechnungen');
reset role;

-- ---------------------------------------------------------------- Kontoloeschung
select tests.service();
select public.billing_record_deletion((current_setting('vt.dora')::uuid), 1);
reset role;
delete from auth.users where id = (current_setting('vt.dora')::uuid);
select tests.eq((select count(*) from public.subscriptions where user_id is null)::int, 2, 'abos pseudonymisiert');
select tests.eq((select count(*) from public.invoices where user_id is null and provider_invoice_id = 'in_1')::int, 1, 'rechnung aufbewahrt, pseudonym');
select tests.eq((select count(*) from billing.customers where provider_customer_id = 'cus_dora' and user_id is null)::int, 1, 'kunde entkoppelt');
select tests.eq((select count(*) from billing.account_deletions where user_ref_hash = encode(sha256(convert_to(current_setting('vt.dora'), 'UTF8')), 'hex'))::int, 1, 'loeschnachweis');
-- Spaete Webhooks fuer den geloeschten Kunden ordnen niemandem Zugang zu.
select tests.service();
select tests.eq((public.billing_apply_subscription(jsonb_build_object(
  'provider','stripe','provider_subscription_id','sub_1','provider_customer_id','cus_dora','provider_price_id','price_test_pro_year',
  'status','canceled','current_period_end', now(),'state_at', now() + interval '1 minute')) ->> 'user_id'), null::text, 'kein nutzer nach loeschung');
reset role;

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 03_billing.sql'; end $vu_end$;
