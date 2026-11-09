-- Produktivstart (20261029000100): Widerruf, Postausgang, Newsletter-Einwilligung, Brevo-Abgleich.
begin;
select tests.create_user('wanda@example.test') as wanda \gset
select tests.create_user('nils@example.test') as nils \gset
insert into auth.users (email, raw_user_meta_data) values ('offen@example.test', '{"newsletter_requested_at":"2026-10-29T10:00:00Z","newsletter_version":"vu-newsletter-v1"}');

-- 1 Widerruf ist ein eigener Vorgangstyp und geht immer in die Pruefung.
select (public.billing_record_cancellation(jsonb_build_object('email', 'wanda@example.test', 'full_name', 'Wanda', 'kind', 'withdrawal')) ->> 'id') as w \gset
select tests.eq(public.billing_propose_cancellation_match(:'w') ->> 'status', 'manual_review', 'widerruf ohne abo: pruefung, nicht no_contract');
select tests.throws($$select public.billing_record_cancellation('{"email":"x@example.test","kind":"irgendwas"}')$$, 'cancellation_requests_kind_check');

-- 2 Postausgang: neue Arten, Eingangsbestaetigung des Widerrufs wird am Vorgang vermerkt.
select public.billing_enqueue_mail(jsonb_build_object('kind', 'withdrawal_receipt', 'cancellation_id', :'w', 'to_email', 'wanda@example.test', 'dedupe_key', 'wr:' || :'w')) as m \gset
select tests.eq(public.billing_mail_result(:'m', 'sent'), 'sent', 'widerruf-bestaetigung gesendet');
select tests.eq((select confirmation_status from billing.cancellation_requests where id = :'w'), 'sent', 'am vorgang vermerkt');
select public.billing_enqueue_mail(jsonb_build_object('kind', 'contract_confirmation', 'to_email', 'wanda@example.test', 'dedupe_key', 'contract:sub_x')) as c1 \gset
select public.billing_enqueue_mail(jsonb_build_object('kind', 'contract_confirmation', 'to_email', 'wanda@example.test', 'dedupe_key', 'contract:sub_x')) as c2 \gset
select tests.eq(:'c1'::uuid, :'c2'::uuid, 'vertragsbestaetigung je abo nur einmal');
select tests.eq(public.billing_account_email(:'wanda'), 'wanda@example.test', 'kontoadresse fuer den versand');

-- 3 Newsletter: niemand ist ohne Anforderung Abonnent; Haken nicht selbst setzbar.
select tests.eq((select count(*) from billing.marketing_consents)::int, 0, 'keine einwilligungen von selbst');
select tests.authenticate(:'wanda');
select tests.throws(format($$update public.user_settings set marketing_emails = true where user_id = %L$$, :'wanda'), 'permission denied');
select tests.throws($$select * from billing.marketing_consents$$, 'permission denied');
select tests.throws(format($$select public.billing_newsletter_request(%L, 'settings', 'v', repeat('a', 64))$$, :'wanda'), 'permission denied');
select tests.throws(format($$select public.billing_newsletter_status(%L)$$, :'nils'), 'permission denied');
reset role;
select tests.eq(public.billing_newsletter_status(:'wanda') ->> 'status', 'none', 'ohne anforderung: none');
select (public.billing_newsletter_request(:'wanda', 'settings', 'vu-newsletter-v1', repeat('a', 64)) ->> 'id') as n \gset
select tests.eq((public.billing_newsletter_request(:'wanda', 'settings', 'vu-newsletter-v1', repeat('a', 64)) ->> 'id'), :'n', 'zweite anforderung: dieselbe');
select tests.eq((select marketing_emails from public.user_settings where user_id = :'wanda'), false, 'angefordert ist nicht bestaetigt');
select public.billing_newsletter_update(:'n', 'pending');
select tests.eq((select marketing_emails from public.user_settings where user_id = :'wanda'), false, 'doi gesendet ist nicht bestaetigt');
select public.billing_newsletter_update(:'n', 'confirmed');
select tests.eq((select marketing_emails from public.user_settings where user_id = :'wanda'), true, 'nur bestaetigt setzt den haken');
select public.billing_newsletter_update(:'n', 'withdrawn');
select tests.eq((select marketing_emails from public.user_settings where user_id = :'wanda'), false, 'abmeldung nimmt den haken');
select tests.eq(public.billing_newsletter_status(:'wanda') ->> 'status', 'withdrawn', 'status abgemeldet');
-- Anforderung aus der Registrierung: erst nach bestaetigter Adresse, nur mit passender Textfassung.
select tests.eq(jsonb_array_length(public.billing_newsletter_due(25, 'vu-newsletter-v1', repeat('b', 64))), 0, 'unbestaetigte adresse: nichts');
update auth.users set email_confirmed_at = now() where email = 'offen@example.test';
select tests.eq((select count(*) from jsonb_array_elements(public.billing_newsletter_due(25, 'vu-newsletter-v2', repeat('b', 64))) e
                  where e ->> 'email' = 'offen@example.test')::int, 0, 'andere textfassung: nichts');
select tests.eq((select count(*) from jsonb_array_elements(public.billing_newsletter_due(25, 'vu-newsletter-v1', repeat('b', 64))) e
                  where e ->> 'email' = 'offen@example.test' and e ->> 'status' = 'requested')::int, 1, 'bestaetigte adresse: angefordert');
select tests.eq((select count(*) from billing.marketing_consents where email = 'offen@example.test')::int, 1, 'nur einmal');
select public.billing_newsletter_due(25, 'vu-newsletter-v1', repeat('b', 64));
select tests.eq((select count(*) from billing.marketing_consents where email = 'offen@example.test')::int, 1, 'wiederholt: nicht doppelt');

-- 4 Brevo: Stand je Konto, Tarif im Zustand, Loeschung und Adresswechsel erzeugen Entfernungsauftraege.
select tests.eq((select count(*) from jsonb_array_elements(public.billing_brevo_pending(50)) e where e ->> 'email' = 'wanda@example.test' and e ->> 'plan' = 'free')::int, 1, 'wanda ausstehend, free');
select public.billing_brevo_mark(:'wanda', 'wanda@example.test', 'wanda@example.test|free');
select tests.eq((select count(*) from jsonb_array_elements(public.billing_brevo_pending(50)) e where e ->> 'email' = 'wanda@example.test')::int, 0, 'abgeglichen');
update auth.users set email = 'wanda.neu@example.test' where id = :'wanda';
select tests.eq((select count(*) from billing.brevo_jobs where kind = 'remove' and email = 'wanda@example.test')::int, 1, 'alte adresse wird entfernt');
select tests.eq((select count(*) from jsonb_array_elements(public.billing_brevo_pending(50)) e where e ->> 'email' = 'wanda.neu@example.test')::int, 1, 'neue adresse ausstehend');
delete from auth.users where id = :'nils';
select tests.eq((select count(*) from billing.brevo_jobs where email = 'nils@example.test')::int, 1, 'geloeschtes konto wird entfernt');
select (select id from billing.brevo_jobs where email = 'nils@example.test') as j \gset
select public.billing_brevo_job_done(:'j', 'TEMP');
select tests.eq((select attempts from billing.brevo_jobs where id = :'j'), 1, 'fehler zaehlt');
select public.billing_brevo_job_done(:'j');
select tests.eq((select count(*) from billing.brevo_jobs where id = :'j')::int, 0, 'erledigt');
select tests.authenticate(:'wanda');
select tests.throws($$select * from billing.brevo_contacts$$, 'permission denied');
select tests.throws($$select public.billing_brevo_pending(5)$$, 'permission denied');
reset role;
select tests.anon();
select tests.throws($$select public.billing_account_email(gen_random_uuid())$$, 'permission denied');
reset role;
rollback;
