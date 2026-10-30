#!/usr/bin/env bash
# Ende-zu-Ende-Test des neuen DB-Backup-Wegs (Option B) mit synthetischen Daten:
# Wegwerf-Postgres + Leserolle aus sql/vu_backup_ro.sql -> bin/vu-db-export.sh -> lokaler
# S3-Emulator mit Object Lock -> bin/vu-db-restore-drill.sh --from-s3 (ohne GitHub).
#
#   VU_TEST_PYTHON=/pfad/venv/bin/python scripts/backup/tests/db-export-test.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${VU_TEST_PYTHON:-python3}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
T="$(mktemp -d /tmp/vu-db-export-test.XXXXXX)"; chmod 755 "$T"
PORT=55435 S3PORT=5095 PASS=0 FAIL=0 PIDS=()
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ local n="$1"; shift; if "$@"; then ok "$n"; else bad "$n"; fi; }
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -m immediate stop >/dev/null 2>&1; kill "${PIDS[@]}" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT
unset AWS_CA_BUNDLE REQUESTS_CA_BUNDLE CURL_CA_BUNDLE SSL_CERT_FILE
export NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"
# python3 im PATH soll boto3 haben (venv zuerst)
export PATH="$(dirname "$PY"):$PATH"

# ---- Emulator mit Object Lock
"$PY" -m moto.server -H 127.0.0.1 -p "$S3PORT" >"$T/moto.log" 2>&1 & PIDS+=($!)
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$S3PORT/" >/dev/null 2>&1 && break; sleep 0.2; done
export AWS_ACCESS_KEY_ID=synthetic-writer AWS_SECRET_ACCESS_KEY=synthetic-secret-123456 AWS_DEFAULT_REGION=us-east-1
export VU_S3_ENDPOINT="http://127.0.0.1:$S3PORT" VU_S3_BUCKET=vu-backup-test-db
"$PY" - <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
s3.create_bucket(Bucket="vu-backup-test-db", ObjectLockEnabledForBucket=True)
s3.put_object_lock_configuration(Bucket="vu-backup-test-db", ObjectLockConfiguration={
    "ObjectLockEnabled": "Enabled", "Rule": {"DefaultRetention": {"Mode": "COMPLIANCE", "Days": 1}}})
PY

# ---- Wegwerf-Postgres mit synthetischen Daten und Leserolle
mkdir -p "$T/pgdata" && [ "$(id -u)" = 0 ] && chown postgres "$T/pgdata"
echo boot-synthetic > "$T/pw"; chmod 644 "$T/pw"
as_pg "$PGBIN/initdb" -D "$T/pgdata" -U boot --auth-local=trust --auth-host=scram-sha-256 --pwfile="$T/pw" >/dev/null 2>&1 || { echo "initdb fehlgeschlagen"; exit 2; }
as_pg "$PGBIN/pg_ctl" -D "$T/pgdata" -o "-p $PORT -k $T/pgdata -c listen_addresses=127.0.0.1" -l "$T/pgdata/pg.log" -w start >/dev/null || exit 2
SU() { PGPASSWORD=boot-synthetic "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U boot -q -v ON_ERROR_STOP=1 "$@"; }
SU -d postgres -c "create database synth_qiytest0000"
SU -d synth_qiytest0000 <<'SQL'
create schema auth; create schema billing; create schema supabase_migrations;
create table auth.users (id int primary key, email text); insert into auth.users select i, 'person'||i||'@example.invalid' from generate_series(1,60) i;
create table public.profiles (id int primary key, name text); alter table public.profiles enable row level security;
insert into public.profiles select i, 'synth' from generate_series(1,60) i;
create table billing.payment_events (id int primary key); insert into billing.payment_events select generate_series(1,7);
create table supabase_migrations.schema_migrations (version text primary key); insert into supabase_migrations.schema_migrations values ('1'),('2');
create role writer_role login password 'writer-synthetic'; grant all on all tables in schema public to writer_role; grant usage on schema public to writer_role;
SQL
SU -d synth_qiytest0000 -f "$ROOT/sql/vu_backup_ro.sql" >/dev/null
SU -d postgres -c "alter role vu_backup_ro password 'ro-synthetic-0000'"
printf 'auth.users=60\nbilling.payment_events=7\npublic.profiles=60\nsupabase_migrations.schema_migrations=2\n' > "$T/expected.txt"

age-keygen -o "$T/test.key" 2>/dev/null; chmod 600 "$T/test.key"
export VU_DB_AGE_RECIPIENT=$(age-keygen -y "$T/test.key")
export VU_DB_PROJECT=qiytest0000 VU_PG_MIN_MAJOR=$("$PGBIN/pg_dump" --version | grep -oE '[0-9]+' | head -1) PATH="$PGBIN:$PATH"
URL="postgresql://vu_backup_ro:ro-synthetic-0000@127.0.0.1:$PORT/synth_qiytest0000"

# ---- Export
VU_DB_URL="$URL" "$ROOT/bin/vu-db-export.sh" > "$T/export.out" 2>&1; rc=$?
check "D01 Export mit Leserolle in den gesperrten Bucket gelingt" test "$rc" -eq 0
check "D02 Ausgabe enthaelt keine Zugangsdaten" bash -c "! grep -qE 'ro-synthetic-0000|synthetic-secret-123456|AGE-SECRET' '$T/export.out'"
"$PY" - "$T" <<'PY' > "$T/objects.txt"
import boto3, os, sys
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
for o in s3.list_objects_v2(Bucket="vu-backup-test-db").get("Contents", []):
    h = s3.head_object(Bucket="vu-backup-test-db", Key=o["Key"])
    print(o["Key"], o["Size"], h.get("ObjectLockMode", "NONE"), h.get("Metadata", {}).get("sha256", "-")[:12])
key = [o["Key"] for o in s3.list_objects_v2(Bucket="vu-backup-test-db")["Contents"] if o["Key"].endswith(".dump.age")][0]
s3.download_file("vu-backup-test-db", key, sys.argv[1] + "/stored.dump.age")
PY
check "D03 Objekt und Manifest liegen im Ziel, beide mit Object Lock (COMPLIANCE)" \
  bash -c "grep -c 'COMPLIANCE' '$T/objects.txt' | grep -qx 2 && grep -q '^db/accounts/.*\.dump\.age ' '$T/objects.txt' && grep -q '^db/accounts/.*\.json ' '$T/objects.txt'"
check "D04 gespeichertes Objekt ist age-verschluesselt, kein Klartext" \
  bash -c "head -c 21 '$T/stored.dump.age' | grep -q age-encryption.org && ! grep -aq 'example.invalid' '$T/stored.dump.age'"

# ---- Schutzpruefungen (muessen abbrechen, nichts hochladen)
before=$(wc -l < "$T/objects.txt")
VU_DB_URL="postgresql://boot:boot-synthetic@127.0.0.1:$PORT/synth_qiytest0000" "$ROOT/bin/vu-db-export.sh" > "$T/neg1.out" 2>&1; rc=$?
check "D05 privilegierter Benutzer statt Leserolle wird abgewiesen" bash -c "[ $rc -ne 0 ] && grep -q 'nicht die Leserolle' '$T/neg1.out'"
SU -d postgres -c "create role vu_backup_rw login password 'rw-synthetic'" ; SU -d synth_qiytest0000 -c "grant all on all tables in schema public to vu_backup_rw; grant usage on schema public to vu_backup_rw"
VU_DB_ROLE=vu_backup_rw VU_DB_URL="postgresql://vu_backup_rw:rw-synthetic@127.0.0.1:$PORT/synth_qiytest0000" "$ROOT/bin/vu-db-export.sh" > "$T/neg2.out" 2>&1; rc=$?
check "D06 Rolle mit Schreibrechten wird erkannt und abgewiesen" bash -c "[ $rc -ne 0 ] && grep -q 'nicht rein lesend' '$T/neg2.out'"
VU_DB_URL="${URL/synth_qiytest0000/postgres}" "$ROOT/bin/vu-db-export.sh" > "$T/neg3.out" 2>&1; rc=$?
check "D07 Datenbank eines anderen Projekts wird abgewiesen" bash -c "[ $rc -ne 0 ] && grep -q 'gehoert nicht zum Projekt' '$T/neg3.out'"
VU_DB_AGE_RECIPIENT=age1kaputt VU_DB_URL="$URL" "$ROOT/bin/vu-db-export.sh" > /dev/null 2>&1; rc=$?
check "D08 ungueltiger age-Empfaenger: Abbruch vor jedem Export" test "$rc" -ne 0
after=$("$PY" -c 'import boto3,os; print(len(boto3.client("s3",endpoint_url=os.environ["VU_S3_ENDPOINT"]).list_objects_v2(Bucket="vu-backup-test-db").get("Contents",[])))')
check "D09 abgewiesene Laeufe haben nichts hochgeladen" test "$after" -eq "$before"

# ---- Wiederherstellung direkt aus dem Ziel, ohne GitHub (Leseschluessel genuegt)
VU_DRILL_MODE=local PGBIN="$PGBIN" VU_AGE_KEY_FILE="$T/test.key" VU_DRILL_PORT=55436 \
  "$ROOT/bin/vu-db-restore-drill.sh" --from-s3 latest "$T/expected.txt" > "$T/drill.out" 2>&1; rc=$?
check "D10 Restore-Probe aus dem Ziel: Pruefsumme = Manifest, Zeilenzahlen = Erwartung" \
  bash -c "[ $rc -eq 0 ] && grep -q 'SHA-256 wie im Manifest' '$T/drill.out' && grep -q 'OK: Zeilenzahlen' '$T/drill.out'"
check "D11 Quelle unveraendert" \
  bash -c "[ \"\$(PGPASSWORD=boot-synthetic '$PGBIN/psql' -h 127.0.0.1 -p $PORT -U boot -d synth_qiytest0000 -At -c 'select count(*) from auth.users')\" = 60 ]"

python3 "$ROOT/lib/s3_put.py" check-latest db/accounts/ 26 > "$T/check.json" 2>&1; rc=$?
check "D12 Taegliche Pruefung: juengste Sicherung < 26 h, SHA-256 = Manifest, age-Format" bash -c "[ $rc -eq 0 ] && grep -q '\"problems\": \[\]' '$T/check.json'"
python3 "$ROOT/lib/s3_put.py" check-latest db/accounts/ 0 > /dev/null 2>&1; rc=$?
check "D13 Taegliche Pruefung meldet veraltete Sicherung (Grenze 0 h)" test "$rc" -ne 0

echo; echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen (Postgres $("$PGBIN/pg_dump" --version | awk '{print $3}'))"
[ "$FAIL" -eq 0 ]
