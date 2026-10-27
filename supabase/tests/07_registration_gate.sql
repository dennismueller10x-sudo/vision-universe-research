-- Registrierungssperre: Auth-Hook vor dem Anlegen eines Kontos.
begin;
-- Niemand ausser Supabase Auth ruft den Hook auf oder sieht die Liste.
select tests.anon();
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.throws($$select * from public.registration_allowlist$$, 'permission denied');
select tests.throws($$select public.registration_set_allowlist(array['x@y.de'])$$, 'permission denied');
reset role;
select tests.authenticate(tests.create_user('eve@example.test'));
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.throws($$update public.registration_gate set open = true$$, 'permission denied');
reset role;

select tests.service();
select tests.throws($$select public.hook_before_user_created('{"user":{"email":"a@b.de"}}')$$, 'permission denied');
select tests.eq(public.registration_set_allowlist(array['Tester@Example.test', ' zwei@example.test ', '']), 2, 'Positivliste gesetzt');
select tests.eq(public.registration_set_allowlist(array['zwei@example.test']), 1, 'Positivliste ersetzt');
reset role;

set local role supabase_auth_admin;
select tests.eq(public.hook_before_user_created('{"user":{"email":"ZWEI@example.test"}}'), '{}'::jsonb, 'Positivliste darf');
select tests.eq(public.hook_before_user_created('{"user":{"email":"tester@example.test"}}') -> 'error' ->> 'http_code', '403', 'entfernte Adresse gesperrt');
select tests.eq(public.hook_before_user_created('{"user":{}}') -> 'error' ->> 'message', 'REGISTRATION_CLOSED', 'ohne Adresse gesperrt');
reset role;
update public.registration_gate set open = true;
set local role supabase_auth_admin;
select tests.eq(public.hook_before_user_created('{"user":{"email":"jeder@example.test"}}'), '{}'::jsonb, 'nach Freigabe offen');
reset role;
rollback;
