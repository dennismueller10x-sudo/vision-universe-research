-- Kuendigungen: Zuordnungsvorschlag, Postausgang mit Wiederholung, Ueberwachung.
begin;
select tests.create_user('olga@example.test') as olga \gset
select tests.create_user('paul@example.test') as paul \gset

-- Nur der Server.
select tests.authenticate(:'olga');
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
select public.billing_link_customer(:'olga', 'stripe', 'cus_olga');
select public.billing_apply_subscription(jsonb_build_object('provider','stripe','provider_subscription_id','sub_olga',
  'provider_customer_id','cus_olga','provider_price_id','price_test_plus_month','status','active',
  'current_period_end', now() + interval '20 days','state_at', now()));
select public.billing_apply_invoice(jsonb_build_object('provider','stripe','provider_invoice_id','in_olga','provider_customer_id','cus_olga',
  'provider_subscription_id','sub_olga','number','VU-0007','status','paid','currency','EUR','state_at', now()));

select (public.billing_record_cancellation('{"email":"OLGA@example.test","full_name":"Olga","kind":"ordinary"}') ->> 'id') as c_email \gset
select (public.billing_record_cancellation('{"email":"olga@example.test","full_name":"Olga","kind":"ordinary","reference":"VU-0007"}') ->> 'id') as c_ref \gset
select (public.billing_record_cancellation('{"email":"olga@example.test","full_name":"Olga","kind":"extraordinary","reason":"Umzug"}') ->> 'id') as c_extra \gset
select (public.billing_record_cancellation('{"email":"paul@example.test","full_name":"Paul","kind":"ordinary"}') ->> 'id') as c_paul \gset
select (public.billing_record_cancellation('{"email":"fremd@example.test","full_name":"X","kind":"ordinary"}') ->> 'id') as c_unknown \gset

select tests.eq(public.billing_propose_cancellation_match(:'c_email') ->> 'status', 'pending_assignment', 'adresse -> vorschlag');
select tests.eq(public.billing_propose_cancellation_match(:'c_ref') ->> 'method', 'email_and_reference', 'adresse + rechnungsnummer');
select tests.eq(public.billing_propose_cancellation_match(:'c_extra') ->> 'status', 'manual_review', 'ausserordentlich -> pruefung');
select tests.eq(public.billing_propose_cancellation_match(:'c_paul') ->> 'status', 'no_contract', 'konto ohne abo');
select tests.eq(public.billing_propose_cancellation_match(:'c_unknown') ->> 'status', 'no_contract', 'unbekannte adresse');
-- Ein zweiter Vorschlag aendert nichts (nur fuer neue Eingaenge).
select tests.eq(public.billing_propose_cancellation_match(:'c_email') ->> 'status', 'pending_assignment', 'idempotent');
-- Der Vorschlag aendert das Abo nicht.
select tests.eq((select cancel_at_period_end from public.subscriptions where provider_subscription_id = 'sub_olga'), false, 'abo unveraendert');
select tests.eq((select match_subscription_ref from billing.cancellation_requests where id = :'c_email'), 'sub_olga', 'vorschlag abo');
select tests.eq(jsonb_array_length(public.billing_cancellation_queue()), 3, 'arbeitsliste: zwei vorschlaege + pruefung');

-- Postausgang: Doppelte vermeiden, belegen, wiederholen, aufgeben.
select public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', :'c_email',
  'to_email','olga@example.test','dedupe_key','receipt:' || :'c_email')) as m1 \gset
select tests.eq(public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', :'c_email',
  'to_email','olga@example.test','dedupe_key','receipt:' || :'c_email')), :'m1'::uuid, 'dedupe');
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 1, 'faellig und belegt');
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 0, 'belegt -> kein zweiter versand');
select tests.eq(public.billing_mail_result(:'m1', 'failed', 'HTTP 500'), 'failed', 'fehlschlag');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = :'c_email'), 'failed', 'status gespiegelt');
select tests.eq((select next_attempt_at > now() + interval '50 seconds' from billing.mail_outbox where id = :'m1'), true, 'abstand');
update billing.mail_outbox set next_attempt_at = now() - interval '1 second' where id = :'m1';
select tests.eq(jsonb_array_length(public.billing_claim_due_mails(10)), 1, 'nach abstand wieder faellig');
select tests.eq(public.billing_mail_result(:'m1', 'sent'), 'sent', 'zugestellt');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = :'c_email'), 'sent', 'bestaetigt');

select public.billing_enqueue_mail(jsonb_build_object('kind','cancellation_receipt','cancellation_id', :'c_paul','to_email','paul@example.test')) as m2 \gset
update billing.mail_outbox set attempts = 7 where id = :'m2';
select tests.eq(public.billing_mail_result(:'m2', 'failed', 'down'), 'dead', 'nach 8 versuchen dead');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = :'c_paul'), 'dead', 'dead gespiegelt');
select tests.throws($$select public.billing_mail_result(gen_random_uuid(), 'sent')$$, 'MAIL_NOT_FOUND');
select tests.throws(format($$select public.billing_mail_result(%L, 'egal')$$, :'m2'), 'MAIL_RESULT_INVALID');

-- Zuordnung von Hand und Lesen eines Vorgangs
select tests.throws(format($$select public.billing_set_cancellation_match(%L, %L, '')$$, :'c_unknown', :'olga'), 'OPERATOR_REQUIRED');
select tests.throws(format($$select public.billing_set_cancellation_match(%L, %L, 'ops')$$, :'c_unknown', :'paul'), 'NO_ACTIVE_SUBSCRIPTION');
select tests.eq(public.billing_set_cancellation_match(:'c_unknown', :'olga', 'ops') ->> 'subscription_ref', 'sub_olga', 'manuell');
select tests.eq(public.billing_cancellation_get(:'c_unknown') ->> 'status', 'pending_assignment', 'jetzt bearbeitbar');
select tests.eq(public.billing_cancellation_get(:'c_unknown') ->> 'match_plan_id', 'plus', 'tarif im vorgang');
select tests.eq(public.billing_cancellation_get(:'c_unknown') ->> 'match_method', 'manual', 'methode');

-- Ueberwachung
update billing.cancellation_requests set due_at = now() - interval '1 minute' where id = :'c_ref';
select tests.eq((public.billing_cancellation_health() ->> 'overdue')::int, 1, 'ueberfaellig erkannt');
select tests.eq((public.billing_cancellation_health() ->> 'mails_dead')::int, 1, 'dead erkannt');
select tests.eq((public.billing_cancellation_health() ->> 'open')::int, 4, 'offen');
select tests.throws($$select public.billing_resolve_mails(null, 'retry', '')$$, 'OPERATOR_REQUIRED');
select tests.throws($$select public.billing_resolve_mails(null, 'drop', 'op')$$, 'NOTE_REQUIRED');
select tests.throws($$select public.billing_resolve_mails(null, 'delete', 'op')$$, 'ACTION_INVALID');
select tests.eq(public.billing_resolve_mails(null, 'drop', 'op', 'Bounce'), 1, 'dead aufgegeben');
select tests.eq((public.billing_cancellation_health() ->> 'mails_dead')::int, 0, 'aufgegeben zaehlt nicht mehr');
reset role;
rollback;
