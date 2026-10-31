-- Interne Backtest-Vorschau (20261031000100): Rollenwert vorhanden, niemandem vergeben, keine Selbstvergabe.
begin;
select tests.create_user('rita@example.test') as rita \gset
select tests.create_user('kunde2@example.test') as kunde \gset

-- 1 Der Rollenwert existiert, ist aber nach den Migrationen niemandem vergeben.
select tests.eq((select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'app_role' and e.enumlabel = 'backtest_reviewer')::int, 1, 'rollenwert vorhanden');
select tests.eq((select count(*) from public.user_roles where role = 'backtest_reviewer')::int, 0, 'niemandem vergeben');

-- 2 Kein Konto vergibt sich die Rolle selbst oder aendert/loescht sie; anonym ist nichts lesbar.
select tests.authenticate(:'rita');
select tests.throws(format($$insert into public.user_roles (user_id, role) values (%L, 'backtest_reviewer')$$, :'rita'), 'permission denied');
select tests.throws($$update public.user_roles set role = 'backtest_reviewer'$$, 'permission denied');
select tests.eq((select count(*) from public.user_roles where role = 'backtest_reviewer')::int, 0, 'konto sieht keine rolle');
reset role;
select tests.anon();
select tests.throws($$select * from public.user_roles$$, 'permission denied');
reset role;

-- 3 Vergabe nur ueber den Betrieb (hier als Superuser simuliert): eigene Rolle lesbar, nicht loeschbar, fremde unsichtbar.
insert into public.user_roles (user_id, role) values (:'rita', 'backtest_reviewer');
select tests.authenticate(:'rita');
select tests.eq((select count(*) from public.user_roles where role = 'backtest_reviewer')::int, 1, 'eigene rolle lesbar');
select tests.throws($$delete from public.user_roles where role = 'backtest_reviewer'$$, 'permission denied');
reset role;
select tests.authenticate(:'kunde');
select tests.eq((select count(*) from public.user_roles where role = 'backtest_reviewer')::int, 0, 'fremde rolle unsichtbar');
reset role;

-- 4 Die Rolle ist unabhaengig von pricing_admin und billing_tester (keine Mitberechtigung).
select tests.eq((select count(*) from public.user_roles where user_id = :'rita' and role in ('pricing_admin', 'billing_tester'))::int, 0, 'keine weiteren rollen');
rollback;
