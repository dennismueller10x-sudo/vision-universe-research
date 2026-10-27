-- Kuendigungsbutton: Eingang, Zuordnung, Bestaetigungsstatus; nur der Server darf schreiben und Adressen aufloesen.
begin;
select tests.create_user('kai@example.test') as kai \gset

select tests.authenticate(:'kai');
select tests.throws($$select public.billing_record_cancellation('{"email":"x@example.test","kind":"ordinary"}')$$, 'permission denied');
select tests.throws($$select public.billing_user_by_email('kai@example.test')$$, 'permission denied');
select tests.throws($$select * from billing.cancellation_requests$$, 'permission denied');
reset role;
select tests.anon();
select tests.throws($$select public.billing_user_by_email('kai@example.test')$$, 'permission denied');
reset role;

select tests.service();
select tests.eq(public.billing_user_by_email(' KAI@example.test '), :'kai'::uuid, 'adresse ohne gross/klein und leerzeichen');
select tests.eq(public.billing_user_by_email('niemand@example.test'), null::uuid, 'unbekannt');
select (public.billing_record_cancellation(jsonb_build_object('email', ' Kai@Example.test ', 'full_name', 'Kai K.',
  'kind', 'extraordinary', 'reason', 'Umzug ins Ausland', 'source', 'public')) ->> 'id') as req \gset
select public.billing_update_cancellation(:'req', '{"status":"manual_review","confirmation_status":"sent"}');
select tests.throws($$select public.billing_record_cancellation('{"email":"a@b.de","kind":"sofort"}')$$, 'check');
select tests.throws($$select public.billing_update_cancellation(gen_random_uuid(), '{}')$$, 'CANCELLATION_NOT_FOUND');
select tests.throws(format($$select public.billing_update_cancellation(%L, '{"status":"erledigt"}')$$, :'req'), 'check');
reset role;

select tests.eq((select email from billing.cancellation_requests where id = :'req'), 'kai@example.test', 'adresse normalisiert');
select tests.eq((select reason from billing.cancellation_requests where id = :'req'), 'Umzug ins Ausland', 'grund gespeichert');
select tests.eq((select status from billing.cancellation_requests where id = :'req'), 'manual_review', 'status');
select tests.eq((select confirmation_sent_at is not null from billing.cancellation_requests where id = :'req'), true, 'bestaetigung zeitpunkt');
select tests.eq((select requested_at <= now() from billing.cancellation_requests where id = :'req'), true, 'eingang aus datenbankuhr');
rollback;
