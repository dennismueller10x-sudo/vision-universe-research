#!/usr/bin/env bash
# Isolierter Test der Konten-Datenbanksicherung (.github/workflows/account-backup.yml)
# mit synthetischen Daten. Keine Verbindung zu Supabase, kein echter Schluessel.
#
#   scripts/backup/tests/account-backup-restore-test.sh
#
# Ablauf:
#  1. Wegwerf-Postgres (lokal, eigener Port) mit den Schemata der Konten-Datenbank
#     (public, billing, auth, supabase_migrations) und erfundenen Zeilen.
#  2. Den Schritt "Sichern und verschluesseln" UNVERAENDERT aus dem Workflow lesen;
#     einzig `docker run ... postgres:17 sh -c` wird durch `sh -c` ersetzt (lokales pg_dump).
#  3. Wegwerf-age-Schluessel nur fuer diesen Test (nie ausgegeben, am Ende geloescht).
#  4. Entschluesseln, in eine zweite, leere Datenbank zurueckspielen, Zeilen vergleichen.
#  5. Gegenproben: fehlender Empfaenger, falsches Projekt, unverschluesselte Ausgabe.
#
# Voraussetzungen: postgresql (initdb, pg_ctl, pg_dump, pg_restore, psql), age, python3 mit yaml.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WF="${VU_TEST_WORKFLOW:-$ROOT/.github/workflows/account-backup.yml}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
# Eigenes Verzeichnis unter /tmp: der Datenbankdienst laeuft als Benutzer postgres und
# braucht Zugriff (Arbeitsverzeichnisse von Sitzungen sind oft nur fuer root lesbar).
T="$(mktemp -d /tmp/vu-account-backup-test.XXXXXX)"; chmod 755 "$T"
PORT="${VU_TEST_PG_PORT:-55432}" REF="qiytbnpoqvldsatpfkeh"
PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ local n="$1"; shift; if "$@"; then ok "$n"; else bad "$n"; fi; }
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -m immediate stop >/dev/null 2>&1; rm -rf "$T"; }
trap cleanup EXIT

[ -f "$WF" ] || { echo "Workflow nicht gefunden: $WF"; exit 2; }
mkdir -p "$T/pgdata" "$T/run" && [ "$(id -u)" = 0 ] && chown postgres "$T/pgdata" "$T/run"
as_pg "$PGBIN/initdb" -D "$T/pgdata" -U vu --auth=trust >/dev/null 2>&1 || { echo "initdb fehlgeschlagen"; exit 2; }
as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -o "-p $PORT -k $T/run -c listen_addresses=127.0.0.1" -l "$T/run/pg.log" -w start >/dev/null \
  || { echo "Testdatenbank startet nicht"; tail -5 "$T/run/pg.log"; exit 2; }
PSQL=("$PGBIN/psql" -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U vu)
"${PSQL[@]}" -d postgres -c "create database ${REF}_synthetic" -c "create database restore_target"

# ---- 1. synthetische Konten-Datenbank (Struktur angelehnt, Inhalte erfunden)
"${PSQL[@]}" -d "${REF}_synthetic" <<'SQL'
create schema auth; create schema billing; create schema supabase_migrations;
create table auth.users (id uuid primary key, email text not null, created_at timestamptz default now());
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id), provider text);
create table public.profiles (id uuid primary key references auth.users(id), display_name text, prefs jsonb);
create table public.watchlists (id bigserial primary key, user_id uuid references auth.users(id), tickers text[]);
alter table public.profiles enable row level security;
create table billing.subscriptions (id text primary key, user_id uuid references auth.users(id), plan text, status text);
create table billing.events (id bigserial primary key, payload jsonb, received_at timestamptz default now());
create table supabase_migrations.schema_migrations (version text primary key, name text);
insert into auth.users select md5(i::text)::uuid, 'person'||i||'@example.invalid' from generate_series(1,500) i;
insert into auth.identities select md5('id'||i)::uuid, md5(i::text)::uuid, 'email' from generate_series(1,500) i;
insert into public.profiles select md5(i::text)::uuid, 'Synth '||i, jsonb_build_object('theme','dark') from generate_series(1,500) i;
insert into public.watchlists (user_id, tickers) select md5(((i % 500) + 1)::text)::uuid, array['SYN1','SYN2'] from generate_series(1,800) i;
insert into billing.subscriptions select 'sub_synth_'||i, md5(i::text)::uuid, 'pro', 'active' from generate_series(1,120) i;
insert into billing.events (payload) select jsonb_build_object('type','synthetic.event','n',i) from generate_series(1,300) i;
insert into supabase_migrations.schema_migrations values ('20261025000000','accounts');
create table public.should_not_matter (x int); -- weiteres Objekt, wird mitgesichert (Schema public)
SQL

counts() {  # db -> "schema.table=rows" je Zeile, sortiert
  "${PSQL[@]}" -d "$1" -At -c "select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','billing','auth','supabase_migrations') order by 1" \
  | while read -r t; do echo "$t=$("${PSQL[@]}" -d "$1" -At -c "select count(*) from $t")"; done
}
counts "${REF}_synthetic" > "$T/before.txt"
[ "$(wc -l < "$T/before.txt")" -eq 8 ] || { echo "synthetische Datenbank unvollstaendig"; exit 2; }

# ---- 2. Schritt aus dem Workflow, lokal ausfuehrbar gemacht
python3 - "$WF" "$T/step.sh" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
step = next(s for s in wf["jobs"]["backup"]["steps"] if s.get("name") == "Sichern und verschluesseln")
script = step["run"]
assert "docker run --rm -e DB_URL postgres:17 sh -c" in script, "Workflow-Schritt hat sich geaendert"
script = script.replace("docker run --rm -e DB_URL postgres:17 sh -c", "sh -c")
script = script.replace("sudo apt-get install -y -qq age > /dev/null", "command -v age >/dev/null")
open(sys.argv[2], "w").write(script)
PY

# ---- 3. Wegwerf-Schluessel
age-keygen -o "$T/test.key" 2>/dev/null; chmod 600 "$T/test.key"
RECIPIENT=$(age-keygen -y "$T/test.key")
DBURL="postgresql://vu@127.0.0.1:$PORT/${REF}_synthetic"
run_step() { : > "$T/github_env"; (cd "$T" && env -i PATH="$PGBIN:$PATH" HOME="$T" RUNNER_TEMP="$T/rt" GITHUB_ENV="$T/github_env" DB_URL="$1" RECIPIENT="$2" bash -e "$T/step.sh") > "$T/step.out" 2>&1; }
mkdir -p "$T/rt"

run_step "$DBURL" "$RECIPIENT"; rc=$?
check "A01 Workflow-Schritt sichert und verschluesselt (Exit 0)" test "$rc" -eq 0
FILE=$(sed -n 's/^FILE=//p' "$T/github_env")
check "A02 Ausgabedatei ist age-verschluesselt" bash -c "head -c 21 '$FILE' | grep -q 'age-encryption.org'"
check "A03 kein Klartext der Daten in der Sicherung" bash -c "[ -s '$FILE' ] && ! grep -aq 'example.invalid' '$FILE'"
check "A04 kein Schluesselmaterial in der Ausgabe des Schritts" bash -c "! grep -q 'AGE-SECRET-KEY' '$T/step.out'"

# ---- 4. isolierte Wiederherstellung
[ -n "$FILE" ] && [ -f "$FILE" ] && age -d -i "$T/test.key" -o "$T/restore.dump" "$FILE" </dev/null
[ "$rc" -eq 0 ] || { echo "Schritt-Ausgabe:"; sed 's/^/  /' "$T/step.out" | tail -20; }
check "A05 Entschluesseln mit dem privaten Schluessel" test -s "$T/restore.dump"
check "A06 Dump lesbar (pg_restore --list)" bash -c "'$PGBIN/pg_restore' --list '$T/restore.dump' >/dev/null"
"$PGBIN/pg_restore" --no-owner -h 127.0.0.1 -p "$PORT" -U vu -d restore_target "$T/restore.dump" > "$T/restore.log" 2>&1
counts restore_target > "$T/after.txt"
check "A07 Zieldatenbank enthaelt alle Tabellen mit gleicher Zeilenzahl" diff -q "$T/before.txt" "$T/after.txt"
counts "${REF}_synthetic" > "$T/source-after.txt"
check "A08 Quelle unveraendert (Sicherung liest nur)" diff -q "$T/before.txt" "$T/source-after.txt"
# Variante aus docs/accounts/PRODUCTION.md: Schema zuerst (Migrationen), dann --data-only
"${PSQL[@]}" -d postgres -c "create database restore_dataonly"
"$PGBIN/pg_restore" --no-owner --schema-only -h 127.0.0.1 -p "$PORT" -U vu -d restore_dataonly "$T/restore.dump" >/dev/null 2>&1
"$PGBIN/pg_restore" --no-owner --data-only --disable-triggers -h 127.0.0.1 -p "$PORT" -U vu -d restore_dataonly "$T/restore.dump" >/dev/null 2>&1
counts restore_dataonly > "$T/dataonly.txt"
check "A09 Variante Schema + --data-only stellt alle Zeilen her" diff -q "$T/before.txt" "$T/dataonly.txt"

# Restore-Probe-Werkzeug (bin/vu-db-restore-drill.sh) im lokalen Modus mit Erwartungsdatei
VU_DRILL_MODE=local PGBIN="$PGBIN" VU_AGE_KEY_FILE="$T/test.key" \
  "$ROOT/scripts/backup/bin/vu-db-restore-drill.sh" "$FILE" "$T/before.txt" > "$T/drill.out" 2>&1; rc=$?
check "A14 vu-db-restore-drill: Wegwerf-DB, Zeilenzahlen gleich der Erwartung" bash -c "[ $rc -eq 0 ] && grep -q 'OK: Zeilenzahlen' '$T/drill.out'"
check "A15 vu-db-restore-drill: kein Schluesselmaterial in der Ausgabe" bash -c "! grep -q 'AGE-SECRET-KEY' '$T/drill.out'"
printf 'public.profiles=1\n' > "$T/wrong.txt"
VU_DRILL_MODE=local PGBIN="$PGBIN" VU_AGE_KEY_FILE="$T/test.key" \
  "$ROOT/scripts/backup/bin/vu-db-restore-drill.sh" "$FILE" "$T/wrong.txt" > /dev/null 2>&1; rc=$?
check "A16 vu-db-restore-drill: Abweichung zur Erwartung wird rot" test "$rc" -ne 0

# ---- 5. Gegenproben (muessen fail-closed sein)
run_step "$DBURL" ""; rc=$?
check "A10 ohne age-Empfaenger: Abbruch, keine Datei" bash -c "[ $rc -ne 0 ] && grep -q 'VU_ACCOUNT_BACKUP_AGE_RECIPIENT fehlt' '$T/step.out'"
run_step "postgresql://vu@127.0.0.1:$PORT/restore_target" "$RECIPIENT"; rc=$?
check "A11 Datenbank-URL eines anderen Projekts: Abbruch" bash -c "[ $rc -ne 0 ] && grep -q 'gehoert nicht zum Produktionsprojekt' '$T/step.out'"
run_step "$DBURL" "age1kurz"; rc=$?
check "A12 ungueltiger Empfaenger: Abbruch" test "$rc" -ne 0
run_step "postgresql://vu@127.0.0.1:1/${REF}_synthetic" "$RECIPIENT"; rc=$?
check "A13 Datenbank nicht erreichbar: Abbruch (pipefail), keine Datei zum Hochladen gemeldet" bash -c "[ $rc -ne 0 ] && ! grep -q '^FILE=' '$T/github_env'"

echo; echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen (Postgres $("$PGBIN/pg_dump" --version | awk '{print $3}'))"
[ "$FAIL" -eq 0 ]
