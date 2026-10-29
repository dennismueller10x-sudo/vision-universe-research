-- Lese-Rolle fuer die Konten-Datenbanksicherung (pg_dump in account-backup.yml).
-- Ausfuehren als postgres (Supabase) in einer psql-Sitzung; danach Passwort setzen mit
--   \password vu_backup_ro
-- (psql fragt verdeckt; das Passwort steht so nirgends im Klartext, auch nicht im
-- SQL-Verlauf des Dashboards). Enthaelt keine Zugangsdaten.
--
-- Warum pg_read_all_data: 12 Tabellen im Schema auth gehoeren supabase_auth_admin und
-- duerfen von postgres nicht weitergegeben werden (kein GRANT OPTION). postgres ist aber
-- ADMIN der eingebauten Rolle pg_read_all_data (SELECT auf alle Tabellen, Sichten,
-- Sequenzen; USAGE auf alle Schemata) - das deckt sie ab, ohne Schreibrechte.
-- BYPASSRLS: pg_dump liest mit row_security=off und bricht bei RLS-Tabellen sonst ab.
-- default_transaction_read_only: zweite Sperre; schreiben kann die Rolle ohnehin nicht.

begin;

create role vu_backup_ro
  login
  nosuperuser nocreatedb nocreaterole noreplication
  inherit
  bypassrls
  connection limit 2;

grant pg_read_all_data to vu_backup_ro;

alter role vu_backup_ro set default_transaction_read_only = on;
alter role vu_backup_ro set statement_timeout = '15min';
alter role vu_backup_ro set idle_in_transaction_session_timeout = '5min';

comment on role vu_backup_ro is 'Nur lesend: verschluesselte Sicherung der Konten-Datenbank (account-backup.yml)';

commit;

-- Kontrolle (muss "t" fuer select und "f" fuer insert zeigen):
-- select has_table_privilege('vu_backup_ro','public.profiles','SELECT') as darf_lesen,
--        has_table_privilege('vu_backup_ro','public.profiles','INSERT') as darf_schreiben;
--
-- Ruecknahme (falls gewuenscht):
--   revoke pg_read_all_data from vu_backup_ro; drop role vu_backup_ro;
