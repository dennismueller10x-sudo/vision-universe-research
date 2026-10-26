-- 06_cancellation_processing.sql (in einer Transaktion, endet mit Rollback)
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

-- Kuendigungen: Zuordnungsvorschlag, Postausgang mit Wiederholung, Ueberwachung.
select set_config('vt.olga', (tests.create_user('olga@example.test'))::text, true);
select set_config('vt.paul', (tests.create_user('paul@example.test'))::text, true);

-- Nur der Server.
select tests.authenticate((current_setting('vt.olga')::uuid));
select tests.throws($$select public.billing_cancellation_queue()$$, 'permission denied');
select tests.throws($$select public.billing_cancellation_health()$$, 'permission denied');
select tests.throws($$select public.billing_enqueue_mail('{"kind":"ops_alert","to_email":"x@y.de"}')$$, 'permission denied');
select tests.throws($$select * from billing.mail_outbox$$, 'permission denied');
select tests.throws($$select public.billing_resolve_mails(null, 'retry', 'x')$$, 'permission denied');
reset role;
select tests.anon();
select tests.throws($$select public.billing_claim_due_mails()$$, 'permission denied');
reset role;

select tests.service();
-- Olga hat ein Plus-Abo mit Rechnung VU-0007, Paul hat ein Konto ohne Abo.
select public.billing_link_customer((current_setting('vt.olga')::uuid), 'stripe', 'cus_olga');
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_olga',
  'provider_customer_id','cus_olga','provider_price_id','price_test_plus_month','status','active',
  'current_period_end', now() + interval '20 days','state_at', now()));
select public.billing_apply_invoice(jsonb_build_object('provider','stripe','provider_invoice_id','in_olga','provider_customer_id','cus_olga',
  'provider_subscription_id','sub_olga','number','VU-0007','status','paid','currency','EUR','state_at', now()));

select set_config('vt.c_email', ((public.billing_record_cancellation('{"email":"OLGA@example.test","full_name":"Olga","kind":"ordinary"}') ->> 'id'))::text, true);
select set_config('vt.c_ref', ((public.billing_record_cancellation('{"email":"olga@example.test","full_name":"Olga","kind":"ordinary","reference":"VU-0007"}') ->> 'id'))::text, true);
select set_config('vt.c_extra', ((public.billing_record_cancellation('{"email":"olga@example.test","full_name":"Olga","kind":"extraordinary","reason":"Umzug"}') ->> 'id'))::text, true);
select set_config('vt.c_paul', ((public.billing_record_cancellation('{"email":"paul@example.test","full_name":"Paul","kind":"ordinary"}') ->> 'id'))::text, true);
select set_config('vt.c_unknown', ((public.billing_record_cancellation('{"email":"fremd@example.test","full_name":"X","kind":"ordinary"}') ->> 'id'))::text, true);

select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_email')::uuid)) ->> 'status', 'pending_assignment', 'adresse -> vorschlag');
select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_ref')::uuid)) ->> 'method', 'email_and_reference', 'adresse + rechnungsnummer');
select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_extra')::uuid)) ->> 'status', 'manual_review', 'ausserordentlich -> pruefung');
select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_paul')::uuid)) ->> 'status', 'no_contract', 'konto ohne abo');
select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_unknown')::uuid)) ->> 'status', 'no_contract', 'unbekannte adresse');
-- Ein zweiter Vorschlag aendert nichts (nur fuer neue Eingaenge).
select tests.eq(public.billing_propose_cancellation_match((current_setting('vt.c_email')::uuid)) ->> 'status', 'pending_assignment', 'idempotent');
-- Der Vorschlag aendert das Abo nicht.
select tests.eq((select cancel_at_period_end from public.subscriptions where provider_subscription_id = 'sub_olga'), false, 'abo unveraendert');
select tests.eq((select match_subscription_ref from billing.cancellation_requests where id = (current_setting('vt.c_email')::uuid)), 'sub_olga', 'vorschlag abo');
select tests.eq(jsonb_array_length(public.billing_cancellation_queue()), 3, 'arbeitsliste: zwei vorschlaege + pruefung');

-- Postausgang: Doppelte vermeiden, belegen, wiederholen, aufgeben.
select set_config('vt.m1', (public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', (current_setting('vt.c_email')::uuid),
  'to_email','olga@example.test','dedupe_key','receipt:' || (current_setting('vt.c_email')::uuid))))::text, true);
select tests.eq(public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', (current_setting('vt.c_email')::uuid),
  'to_email','olga@example.test','dedupe_key','receipt:' || (current_setting('vt.c_email')::uuid))), (current_setting('vt.m1')::uuid)::uuid, 'dedupe');
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 1, 'faellig und belegt');
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 0, 'belegt -> kein zweiter versand');
select tests.eq(public.billing_mail_result((current_setting('vt.m1')::uuid), 'failed', 'HTTP 500'), 'failed', 'fehlschlag');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = (current_setting('vt.c_email')::uuid)), 'failed', 'status gespiegelt');
select tests.eq((select next_attempt_at > now() + interval '50 seconds' from billing.mail_outbox where id = (current_setting('vt.m1')::uuid)), true, 'abstand');
update billing.mail_outbox set next_attempt_at = now() - interval '1 second' where id = (current_setting('vt.m1')::uuid);
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 1, 'nach abstand wieder faellig');
select tests.eq(public.billing_mail_result((current_setting('vt.m1')::uuid), 'sent'), 'sent', 'zugestellt');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = (current_setting('vt.c_email')::uuid)), 'sent', 'bestaetigt');

select set_config('vt.m2', (public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', (current_setting('vt.c_paul')::uuid),'to_email','paul@example.test')))::text, true);
update billing.mail_outbox set attempts = 7 where id = (current_setting('vt.m2')::uuid);
select tests.eq(public.billing_mail_result((current_setting('vt.m2')::uuid), 'failed', 'down'), 'dead', 'nach 8 versuchen dead');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = (current_setting('vt.c_paul')::uuid)), 'dead', 'dead gespiegelt');
select tests.throws($$select public.billing_mail_result(gen_random_uuid(), 'sent')$$, 'MAIL_NOT_FOUND');
select tests.throws(format($$select public.billing_mail_result(%L, 'egal')$$, (current_setting('vt.m2')::uuid)), 'MAIL_RESULT_INVALID');

-- Zuordnung von Hand und Lesen eines Vorgangs
select tests.throws(format($$select public.billing_set_cancellation_match(%L, %L, '')$$, (current_setting('vt.c_unknown')::uuid), (current_setting('vt.olga')::uuid)), 'OPERATOR_REQUIRED');
select tests.throws(format($$select public.billing_set_cancellation_match(%L, %L, 'ops')$$, (current_setting('vt.c_unknown')::uuid), (current_setting('vt.paul')::uuid)), 'NO_ACTIVE_SUBSCRIPTION');
select tests.eq(public.billing_set_cancellation_match((current_setting('vt.c_unknown')::uuid), (current_setting('vt.olga')::uuid), 'ops') ->> 'subscription_ref', 'sub_olga', 'manuell');
select tests.eq(public.billing_cancellation_get((current_setting('vt.c_unknown')::uuid)) ->> 'status', 'pending_assignment', 'jetzt bearbeitbar');
select tests.eq(public.billing_cancellation_get((current_setting('vt.c_unknown')::uuid)) ->> 'match_plan_id', 'plus', 'tarif im vorgang');
select tests.eq(public.billing_cancellation_get((current_setting('vt.c_unknown')::uuid)) ->> 'match_method', 'manual', 'methode');

-- Ueberwachung
update billing.cancellation_requests set due_at = now() - interval '1 minute' where id = (current_setting('vt.c_ref')::uuid);
select tests.eq((public.billing_cancellation_health() ->> 'overdue')::int, 1, 'ueberfaellig erkannt');
select tests.eq((public.billing_cancellation_health() ->> 'mails_dead')::int, 1, 'dead erkannt');
select tests.eq((public.billing_cancellation_health() ->> 'open')::int, 4, 'offen');
select tests.throws($$select public.billing_resolve_mails(null, 'retry', '')$$, 'OPERATOR_REQUIRED');
select tests.throws($$select public.billing_resolve_mails(null, 'drop', 'op')$$, 'NOTE_REQUIRED');
select tests.throws($$select public.billing_resolve_mails(null, 'delete', 'op')$$, 'ACTION_INVALID');
select tests.eq(public.billing_resolve_mails(null, 'drop', 'op', 'Bounce'), 1, 'dead aufgegeben');
select tests.eq((public.billing_cancellation_health() ->> 'mails_dead')::int, 0, 'aufgegeben zaehlt nicht mehr');
reset role;

do $vu_end$ begin raise exception 'VU_TEST_PASSED_ROLLBACK 06_cancellation_processing.sql'; end $vu_end$;
