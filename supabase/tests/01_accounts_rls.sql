-- Konten: Anlage per Trigger, RLS auf Profil/Einstellungen/Rollen, Spaltenrechte.
begin;
select tests.create_user('alice@example.test', 'Alice') as alice \gset
select tests.create_user('bob@example.test') as bob \gset

-- Trigger legt Profil, Einstellungen und Rolle 'user' an.
select tests.eq((select display_name from public.profiles where user_id = :'alice'), 'Alice', 'profil aus metadaten');
select tests.eq((select appearance from public.user_settings where user_id = :'bob'), 'system', 'standard-einstellungen');
select tests.eq((select count(*) from public.user_roles where user_id = :'bob' and role = 'user')::int, 1, 'rolle user');
select tests.eq((select notification_settings from public.user_settings where user_id = :'alice'), '{}'::jsonb, 'benachrichtigungen aus');

-- Alice sieht nur sich.
select tests.authenticate(:'alice');
select tests.eq((select count(*) from public.profiles)::int, 1, 'alice sieht ein profil');
select tests.eq((select count(*) from public.user_settings)::int, 1, 'alice sieht eine einstellung');
select tests.eq((select count(*) from public.profiles where user_id = :'bob')::int, 0, 'bob unsichtbar');

-- Eigene Zeile aendern: erlaubt. Fremde: wirkungslos (RLS filtert).
update public.profiles set display_name = 'Alice B.' where user_id = :'alice';
update public.profiles set display_name = 'gehackt' where user_id = :'bob';
update public.user_settings set appearance = 'dark', notification_settings = '{"EARNINGS": true}' where user_id = :'alice';

-- Verbotene Spalten und Tabellen.
select tests.throws($$update public.profiles set user_id = gen_random_uuid()$$, 'permission denied');
select tests.throws($$update public.profiles set created_at = now() - interval '1 year'$$, 'permission denied');
select tests.throws($$insert into public.profiles (user_id) values (gen_random_uuid())$$, 'permission denied');
select tests.throws($$delete from public.profiles$$, 'permission denied');
select tests.throws(format($$insert into public.user_roles (user_id, role) values (%L, 'admin')$$, :'alice'), 'permission denied');
select tests.throws($$update public.user_roles set role = 'admin'$$, 'permission denied');
select tests.throws($$update public.user_settings set notification_settings = '{"FREE_MONEY": true}'$$, 'user_settings_notifications_shape');
select tests.throws($$update public.user_settings set display_currency = 'euro'$$, 'check');
select tests.throws($$select * from auth.users$$, 'permission denied');
select tests.eq(public.is_admin(), false, 'alice ist kein admin');
reset role;

select tests.eq((select display_name from public.profiles where user_id = :'bob'), null::text, 'bob unveraendert');
select tests.eq((select display_name from public.profiles where user_id = :'alice'), 'Alice B.', 'alice geaendert');
select tests.eq((select appearance from public.user_settings where user_id = :'alice'), 'dark', 'alice einstellung');

-- Anonym: keine Nutzerdaten.
select tests.anon();
select tests.throws($$select * from public.profiles$$, 'permission denied');
select tests.throws($$select * from public.user_settings$$, 'permission denied');
select tests.throws($$select * from public.user_roles$$, 'permission denied');
reset role;

-- Admin (vom Server vergeben) sieht Profile, aber keine fremden Einstellungen.
insert into public.user_roles (user_id, role) values (:'bob', 'admin');
select tests.authenticate(:'bob');
select tests.eq(public.is_admin(), true, 'bob ist admin');
select tests.eq((select count(*) from public.profiles)::int, 2, 'admin sieht profile');
select tests.eq((select count(*) from public.user_settings)::int, 1, 'admin sieht nur eigene einstellungen');
reset role;

-- Konto loeschen: alles mit dem Konto weg.
delete from auth.users where id = :'alice';
select tests.eq((select count(*) from public.profiles where user_id = :'alice')::int, 0, 'profil geloescht');
select tests.eq((select count(*) from public.user_settings where user_id = :'alice')::int, 0, 'einstellungen geloescht');
select tests.eq((select count(*) from public.user_roles where user_id = :'alice')::int, 0, 'rollen geloescht');
rollback;
