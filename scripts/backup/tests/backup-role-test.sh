#!/usr/bin/env bash
# Prueft sql/vu_backup_ro.sql in einer Wegwerf-Postgres-Instanz, die die Supabase-
# Eigentuemerverhaeltnisse nachbildet (synthetische Daten, keine Verbindung zu Supabase):
#   - "postgres"-Ersatz ohne Superuser, mit CREATEROLE, BYPASSRLS, ADMIN auf pg_read_all_data
#   - Schema auth gehoert einer anderen Rolle, Tabellen ohne GRANT OPTION fuer postgres
#   - Tabellen mit RLS und Richtlinie
# Erwartet: Rolle laesst sich als postgres-Ersatz anlegen, pg_dump der vier Schemata gelingt
# vollstaendig, jede Schreibart scheitert - auch nach Abschalten von default_transaction_read_only.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
T="$(mktemp -d /tmp/vu-backup-role-test.XXXXXX)"; chmod 755 "$T"
PORT="${VU_TEST_PG_PORT:-55434}"
PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ local n="$1"; shift; if "$@"; then ok "$n"; else bad "$n"; fi; }
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -m immediate stop >/dev/null 2>&1; rm -rf "$T"; }
trap cleanup EXIT

mkdir -p "$T/pgdata" && [ "$(id -u)" = 0 ] && chown postgres "$T/pgdata"
echo boot-synthetic > "$T/pw"; chmod 644 "$T/pw"
as_pg "$PGBIN/initdb" -D "$T/pgdata" -U boot --auth-local=trust --auth-host=scram-sha-256 --pwfile="$T/pw" >/dev/null 2>&1 || { echo "initdb fehlgeschlagen"; exit 2; }
as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -o "-p $PORT -k $T/pgdata -c listen_addresses=127.0.0.1" -l "$T/pgdata/pg.log" -w start >/dev/null || exit 2
export PGHOST=127.0.0.1 PGPORT=$PORT PGDATABASE=postgres
SU() { PGPASSWORD=boot-synthetic "$PGBIN/psql" -q -v ON_ERROR_STOP=1 -U boot "$@"; }

SU <<'SQL'
create role sbpostgres login password 'pg-synthetic' nosuperuser createrole bypassrls;
grant pg_read_all_data to sbpostgres with admin option;
create role sb_auth_admin nologin;
create schema auth authorization sb_auth_admin;
create table auth.users (id int primary key, email text);
create table auth.mfa_recovery_codes (id int primary key, code_hash text);
alter table auth.users owner to sb_auth_admin; alter table auth.mfa_recovery_codes owner to sb_auth_admin;
grant usage on schema auth to sbpostgres;
grant select on auth.users to sbpostgres with grant option;   -- wie Supabase: nur ein Teil weitergebbar
insert into auth.users select i, 'p'||i||'@example.invalid' from generate_series(1,40) i;
insert into auth.mfa_recovery_codes select i, md5(i::text) from generate_series(1,15) i;
create schema billing authorization sbpostgres; create schema supabase_migrations authorization sbpostgres;
alter schema public owner to sbpostgres;   -- wie Supabase (pg_database_owner, postgres hat CREATE)
SQL
PGPASSWORD=pg-synthetic "$PGBIN/psql" -q -v ON_ERROR_STOP=1 -U sbpostgres <<'SQL'
create table public.profiles (id int primary key, name text);
alter table public.profiles enable row level security; alter table public.profiles force row level security;
create policy nobody on public.profiles using (false);
insert into public.profiles select i, 'synth' from generate_series(1,25) i;
create table billing.payment_events (id int primary key, payload jsonb);
insert into billing.payment_events select i, '{"synthetic":true}' from generate_series(1,10) i;
create table supabase_migrations.schema_migrations (version text primary key);
insert into supabase_migrations.schema_migrations values ('1'),('2');
SQL
[ $? -eq 0 ] || { echo "synthetische Datenbank unvollstaendig"; exit 2; }

# ---- Rolle anlegen wie in Produktion: als postgres-Ersatz, Datei unveraendert
PGPASSWORD=pg-synthetic "$PGBIN/psql" -q -v ON_ERROR_STOP=1 -U sbpostgres -f "$ROOT/sql/vu_backup_ro.sql" > "$T/create.log" 2>&1; rc=$?
check "R01 sql/vu_backup_ro.sql laeuft als Nicht-Superuser (postgres-Ersatz) fehlerfrei" test "$rc" -eq 0
SU -c "alter role vu_backup_ro password 'ro-synthetic'"   # in Produktion: \password vu_backup_ro
RO() { PGPASSWORD=ro-synthetic "$PGBIN/psql" -At -U vu_backup_ro "$@"; }

# ---- pg_dump wie im Workflow
PGPASSWORD=ro-synthetic "$PGBIN/pg_dump" --format=custom --no-owner --no-privileges \
  --schema=public --schema=billing --schema=auth --schema=supabase_migrations -U vu_backup_ro -f "$T/ro.dump" > "$T/dump.log" 2>&1; rc=$?
check "R02 pg_dump als vu_backup_ro gelingt (RLS-Tabellen, fremde auth-Tabellen)" test "$rc" -eq 0
"$PGBIN/pg_restore" -f "$T/ro.sql" "$T/ro.dump" 2>/dev/null
check "R03 Dump enthaelt auch die nicht weitergebbare Tabelle auth.mfa_recovery_codes mit Daten" \
  bash -c "grep -q 'COPY auth.mfa_recovery_codes' '$T/ro.sql' && [ \$(awk '/^COPY auth.mfa_recovery_codes/{f=1;next} /^\\\\\\./{f=0} f' '$T/ro.sql' | wc -l) -eq 15 ]"
check "R04 Dump enthaelt alle 25 Zeilen der RLS-Tabelle (BYPASSRLS wirkt)" \
  bash -c "[ \$(awk '/^COPY public.profiles/{f=1;next} /^\\\\\\./{f=0} f' '$T/ro.sql' | wc -l) -eq 25 ]"

# ---- Schreiben muss scheitern
check "R05 INSERT verweigert" bash -c "! PGPASSWORD=ro-synthetic '$PGBIN/psql' -U vu_backup_ro -c \"insert into billing.payment_events values (99,'{}')\" >/dev/null 2>&1"
check "R06 INSERT auch nach Abschalten von read_only verweigert (keine Schreibrechte)" \
  bash -c "! PGPASSWORD=ro-synthetic '$PGBIN/psql' -U vu_backup_ro -c \"set default_transaction_read_only=off; insert into billing.payment_events values (99,'{}')\" >/dev/null 2>&1"
writes_ok=0
for q in 'update public.profiles set name=1' 'delete from auth.users' 'truncate billing.payment_events' 'update auth.mfa_recovery_codes set code_hash=1'; do
  PGPASSWORD=ro-synthetic "$PGBIN/psql" -v ON_ERROR_STOP=1 -U vu_backup_ro -c "set default_transaction_read_only=off; $q" >/dev/null 2>&1 && writes_ok=$((writes_ok+1))
done
check "R07 UPDATE/DELETE/TRUNCATE verweigert (auch ohne read_only)" test "$writes_ok" -eq 0
check "R08 CREATE TABLE verweigert" bash -c "! PGPASSWORD=ro-synthetic '$PGBIN/psql' -U vu_backup_ro -c 'set default_transaction_read_only=off; create table public.x(i int)' >/dev/null 2>&1"
check "R09 Rolle hat kein CREATEROLE/CREATEDB/SUPERUSER, Verbindungsgrenze 2" \
  bash -c "[ \"\$(PGPASSWORD=boot-synthetic '$PGBIN/psql' -At -U boot -c \"select rolsuper::text||rolcreaterole::text||rolcreatedb::text||rolconnlimit from pg_roles where rolname='vu_backup_ro'\")\" = 'falsefalsefalse2' ]"
check "R10 Daten unveraendert nach allen Versuchen" \
  bash -c "[ \"\$(PGPASSWORD=boot-synthetic '$PGBIN/psql' -At -U boot -c 'select (select count(*) from billing.payment_events)::text||(select count(*) from auth.users)::text||(select count(*) from public.profiles)::text')\" = '104025' ]"

echo; echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen (Postgres $("$PGBIN/pg_dump" --version | awk '{print $3}'))"
[ "$FAIL" -eq 0 ]
