#!/usr/bin/env bash
# Ende-zu-Ende-Test mit ausschliesslich synthetischen Daten und lokalen Emulatoren.
# Keine Verbindung zu echten Diensten: S3 = moto (lokal), APIs = tests/fake_api.py.
#
#   VU_TEST_PYTHON=/pfad/zu/venv/bin/python tests/synthetic-test.sh
#
# Voraussetzungen: restic, rclone, git, python3; im venv: moto[server], boto3.
# Die Emulatoren bilden S3-Semantik nach (Versionierung, Object Lock, Legal Hold).
# Backblaze-spezifisches Verhalten (Capabilities, Lifecycle) prueft der Abnahmetest
# in Phase 2 gegen einen echten Test-Bucket (docs/TESTPLAN.md, T-B2-*).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PY="${VU_TEST_PYTHON:-python3}"
T="$(mktemp -d "${TMPDIR:-/tmp}/vu-backup-test.XXXXXX")"
S3_PORT="${VU_TEST_S3_PORT:-5055}" API_PORT="${VU_TEST_API_PORT:-5056}"
PASS=0 FAIL=0 RESULTS=()

ok()   { PASS=$((PASS+1)); RESULTS+=("PASS  $1"); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); RESULTS+=("FAIL  $1"); echo "FAIL  $1"; }
check(){ local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }

cleanup() { kill "${PIDS[@]}" 2>/dev/null; wait 2>/dev/null; [ -n "${VU_TEST_KEEP:-}" ] && echo "Testverzeichnis: $T" || rm -rf "$T"; }
trap cleanup EXIT
PIDS=()

# ---------------------------------------------------------------- Emulatoren
"$PY" -m moto.server -H 127.0.0.1 -p "$S3_PORT" >"$T/moto.log" 2>&1 & PIDS+=($!)
"$PY" "$HERE/fake_api.py" "$API_PORT" >"$T/api.log" 2>&1 & PIDS+=($!)
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$S3_PORT/" >/dev/null 2>&1 && break; sleep 0.2; done

# Lokale Emulatoren: keine Proxy-CA-Kette, kurze Wiederholungen.
unset AWS_CA_BUNDLE REQUESTS_CA_BUNDLE CURL_CA_BUNDLE SSL_CERT_FILE
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
export VU_RETRY_DELAYS="1 1"
export AWS_ACCESS_KEY_ID=synthetic-writer AWS_SECRET_ACCESS_KEY=synthetic-secret-value-123 AWS_DEFAULT_REGION=us-east-1
export VU_S3_ENDPOINT="http://127.0.0.1:$S3_PORT"
s3py() { "$PY" - "$@"; }

s3py <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
s3.create_bucket(Bucket="vu-backup-test", ObjectLockEnabledForBucket=True)
s3.put_object_lock_configuration(Bucket="vu-backup-test", ObjectLockConfiguration={
    "ObjectLockEnabled": "Enabled", "Rule": {"DefaultRetention": {"Mode": "COMPLIANCE", "Days": 1}}})
s3.create_bucket(Bucket="legal-test", ObjectLockEnabledForBucket=True)
s3.create_bucket(Bucket="fake-r2")
for i in range(40):
    s3.put_object(Bucket="fake-r2", Key=f"state/ns1/obj-{i:03d}.bin", Body=os.urandom(20000))
s3.put_object(Bucket="fake-r2", Key="state/ns1/index.json", Body=b'{"pointer": 1}')
for i in range(30):
    s3.put_object(Bucket="fake-r2", Key=f"snapshots/sts1/objects/{i:03d}", Body=os.urandom(50000))
PY

# ---------------------------------------------------------------- synthetische Quellen
mkdir -p "$T/src" && cd "$T/src"
git init -q --bare remote.git
git init -q work && cd work
git config user.email synth@example.invalid; git config user.name synth
for i in $(seq 30); do head -c 20000 /dev/urandom > "f$i.bin"; git add .; git commit -qm "c$i"; done
git branch -M main; git push -q ../remote.git main
for b in feature/a feature/b data/state; do git checkout -qb "$b"; echo "$b" > b.txt; git add b.txt; git commit -qm "$b"; git push -q ../remote.git "$b"; git checkout -q main; done
git tag v1; git push -q ../remote.git v1
cd "$T"

export RESTIC_REPOSITORY="s3:$VU_S3_ENDPOINT/vu-backup-test/restic"
export RESTIC_PASSWORD="synthetic-restic-password-xyz"
export VU_WORK="$T/work" VU_STATUS_DIR="$T/work/status"
export VU_GIT_REPOS="demo=file://$T/src/remote.git"
export VU_GITHUB_API="http://127.0.0.1:$API_PORT/gh" VU_GITHUB_TOKEN="ghp_syntheticTOKENvalue1234567890" VU_GITHUB_REPOS="synth/demo"
export VU_CF_API="http://127.0.0.1:$API_PORT/cf" VU_CF_API_TOKEN="synthetic-cf-token-abcdef" VU_CF_ACCOUNT_ID=acc1 VU_CF_KV_NAMESPACES="social=ns1" VU_CF_ZONE_IDS="example=z1"
export VU_BREVO_API="http://127.0.0.1:$API_PORT/brevo" VU_BREVO_API_KEY="xkeysib-synthetic-key-000000" VU_BREVO_ENABLED=true
export VU_R2_PROVIDER=Other VU_R2_ENDPOINT="$VU_S3_ENDPOINT" VU_R2_BUCKET=fake-r2 VU_R2_ACCESS_KEY_ID=synthetic-writer VU_R2_SECRET_ACCESS_KEY=synthetic-secret-value-123
export VU_R2_PREFIXES_TIER1="ci-state=state/ns1/ snapshots=snapshots/sts1/" VU_R2_PREFIXES_TIER2=""
export VU_SOURCES="git github-meta r2 cf-kv cf-config brevo supabase"

restic init >/dev/null 2>&1
check "T01 restic init auf Bucket mit Object Lock (Compliance)" bash -c "restic cat config >/dev/null"

# ---------------------------------------------------------------- Lauf 1
"$ROOT/bin/vu-backup.sh" > "$T/run1.md" 2> "$T/run1.err"; rc=$?
check "T02 erster Lauf: alle Quellen ok (Exit 0)" test "$rc" -eq 0
check "T03 Statusbericht enthaelt jede Quelle" bash -c "for s in gitb-demo github-meta r2-ci-state r2-snapshots cf-kv cf-config brevo; do grep -q \"| \$s |\" '$T/run1.md' || exit 1; done"
check "T04 kein Secret-Wert in Ausgabe oder Bericht" bash -c "! grep -rqE 'ghp_syntheticTOKEN|synthetic-cf-token|xkeysib-synthetic|synthetic-restic-password|synthetic-secret-value' '$T/run1.md' '$T/run1.err' '$VU_STATUS_DIR'"
check "T05 Supabase ohne Konfiguration: uebersprungen, kein Fehler" grep -q 'supabase-db | uebersprungen' "$T/run1.md"
restic tag --add anchor --host vu-backup >/dev/null 2>&1
check "T06 Erstsicherung als anchor markiert" bash -c "[ \$(restic snapshots --json --tag anchor | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))') -ge 7 ]"

# ---------------------------------------------------------------- Lauf 2 (Bundle-Kette, inkrementell)
cd "$T/src/work" && for i in 31 32; do head -c 20000 /dev/urandom > "f$i.bin"; git add .; git commit -qm "c$i"; done && git push -q ../remote.git main && cd "$T"
"$ROOT/bin/vu-backup.sh" --only git > "$T/run2.md" 2> "$T/run2.err"; rc=$?
kind=$(python3 -c 'import json; print(json.load(open("'"$VU_STATUS_DIR"'/gitb-demo.json"))["manifest"]["bundleKind"])')
bbytes=$(python3 -c 'import json; print(json.load(open("'"$VU_STATUS_DIR"'/gitb-demo.json"))["manifest"]["bundleBytes"])')
check "T07 zweiter Lauf erzeugt ein inkrementelles Bundle" test "$kind" = inc
check "T08 inkrementelles Bundle enthaelt nur neue Objekte (<200 KB statt ~600 KB)" test "$bbytes" -lt 200000
SNAP2=$(restic snapshots --json --tag src:gitb-demo --latest 1 | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["short_id"])')
REF2=$(git -C "$T/src/remote.git" rev-parse refs/heads/feature/a)
# Force-Push: feature/a wird umgeschrieben (alter Stand verschwindet bei GitHub), dann Lauf 3
cd "$T/src/work" && git checkout -q feature/a && git reset -q --hard HEAD~1 && echo rewritten > r.txt && git add r.txt && git commit -qm rewrite \
  && git push -q -f ../remote.git feature/a && git checkout -q main && cd "$T"
"$ROOT/bin/vu-backup.sh" --only git > "$T/run3.md" 2> "$T/run3.err"
"$ROOT/bin/vu-restore.sh" get gitb-demo "$T/pit2" "$SNAP2" > /dev/null 2>&1
check "T40 Stand vor dem Force-Push aus der Bundle-Kette wiederherstellbar" \
  test "$(git -C "$T/pit2$VU_WORK/git/demo.git" rev-parse refs/heads/feature/a 2>/dev/null)" = "$REF2"
"$ROOT/bin/vu-verify.sh" chain > "$T/chain.out" 2>&1; rc=$?
check "T42 Kettenpruefung (nur Metadaten): Bundle-Kette vollstaendig" bash -c "[ $rc -eq 0 ] && grep -q 'gitb-demo: Kette vollstaendig (3 Bundles)' '$T/chain.out'"
VU_GIT_MODE=incremental "$ROOT/bin/vu-backup.sh" --only git > "$T/run-inc.md" 2>&1
check "T41 Modus incremental (Mirror) bleibt nutzbar" grep -q '| git-demo | OK' "$T/run-inc.md"

# ---------------------------------------------------------------- Restore-Probe
VU_DRILL_KEEP=true "$ROOT/bin/vu-restore.sh" drill "$T/drill" > "$T/drill.out" 2>&1; rc=$?
check "T09 Restore-Probe aller Quellen gruen" test "$rc" -eq 0
check "T10 Restore-Probe baut die Bundle-Kette und prueft Refs gegen Manifest" grep -q 'gitb-demo OK' "$T/drill/drill-report.txt"
check "T11 Restore-Probe prueft R2-Pruefsummen" grep -q 'r2-snapshots OK' "$T/drill/drill-report.txt"
mirror="$T/drill/gitb-demo$VU_WORK/git/demo.git"
"$ROOT/bin/vu-restore.sh" git-branch "$mirror" feature/a "$T/feature-a.bundle" >/dev/null 2>&1
check "T12 einzelner Branch als Bundle wiederherstellbar (Szenario A)" bash -c "git -C '$mirror' bundle verify '$T/feature-a.bundle' >/dev/null 2>&1"
git init -q --bare "$T/newhome.git"
"$ROOT/bin/vu-restore.sh" git-push "$mirror" "$T/newhome.git" >/dev/null 2>&1; rc=$?
check "T13 git-push ohne --yes verweigert" test "$rc" -ne 0
"$ROOT/bin/vu-restore.sh" git-push "$mirror" "$T/newhome.git" --yes >/dev/null 2>&1
check "T14 Mirror in neues Repository geschoben, alle Branches da (Szenario D)" test "$(git -C "$T/newhome.git" branch | wc -l)" -eq 4

# ---------------------------------------------------------------- Abbruch darf nichts beschaedigen
before=$(restic snapshots --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
head -c 250000000 /dev/urandom > "$T/big.bin"
restic backup "$T/big.bin" --tag src:interrupted >/dev/null 2>&1 & rpid=$!
sleep 1; kill -9 "$rpid" 2>/dev/null; wait "$rpid" 2>/dev/null
restic unlock >/dev/null 2>&1      # entfernt nur verwaiste Sperren (Prozess tot)
after=$(restic snapshots --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
check "T15 abgebrochener Upload: keine neue/halbe Sicherung, alte unveraendert" test "$before" -eq "$after"
check "T16 Repository nach Abbruch fehlerfrei (restic check)" restic check --read-data
"$ROOT/bin/vu-backup.sh" --only cf-kv > /dev/null 2>&1
check "T17 naechster Lauf nach Abbruch erfolgreich" test $? -eq 0

# ---------------------------------------------------------------- Fehlerfaelle
RESTIC_PASSWORD=falsch "$ROOT/bin/vu-backup.sh" > "$T/wrongpw.md" 2>/dev/null; rc=$?
check "T18 falsches Passwort: Vorpruefung stoppt, Exit 2, nichts gelesen" bash -c "[ $rc -eq 2 ] && grep -q 'NICHT gestartet' '$T/wrongpw.md'"
VU_BREVO_API_KEY= "$ROOT/bin/vu-backup.sh" --only brevo,cf-kv > "$T/partial.md" 2>/dev/null; rc=$?
check "T19 fehlende Zugangsdaten einer Quelle: Quelle rot, andere gesichert, Exit 1" bash -c "[ $rc -eq 1 ] && grep -q '| brevo | FEHLER' '$T/partial.md' && grep -q '| cf-kv | OK' '$T/partial.md'"
VU_GITHUB_API="http://127.0.0.1:1/gh" "$ROOT/bin/vu-backup.sh" --only github-meta > "$T/neterr.md" 2>/dev/null; rc=$?
check "T20 Quelle nicht erreichbar: nach Wiederholungen rot, Exit 1" bash -c "[ $rc -eq 1 ] && grep -q '| github-meta | FEHLER' '$T/neterr.md'"
"$PY" - <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
keys = [o["Key"] for o in s3.list_objects_v2(Bucket="fake-r2", Prefix="snapshots/sts1/")["Contents"]][:20]
for k in keys: s3.delete_object(Bucket="fake-r2", Key=k)
PY
"$ROOT/bin/vu-backup.sh" --only r2 > "$T/drift.md" 2>/dev/null
check "T21 Massenloeschung an der Quelle wird als Warnung gemeldet" grep -q '| r2-snapshots | WARNUNG' "$T/drift.md"

# ---------------------------------------------------------------- Aufbewahrung und Wartung
"$ROOT/bin/vu-maintain.sh" plan > "$T/plan.txt" 2>&1
check "T22 Wartung plan: anchor-Snapshots bleiben" bash -c "! grep -A50 'remove' '$T/plan.txt' | grep -q anchor"
versions_before=$(s3py <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
n = sum(len(p.get("Versions", [])) for p in s3.get_paginator("list_object_versions").paginate(Bucket="vu-backup-test"))
print(n)
PY
)
restic forget --host vu-backup --group-by host,tags --keep-last 1 --keep-tag anchor --keep-tag chain >/dev/null 2>&1
restic prune >/dev/null 2>&1; rc=$?
check "T23 prune auf gesperrtem Bucket laeuft durch (Loeschen = Delete-Marker)" test "$rc" -eq 0
versions_after=$(s3py <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
n = sum(len(p.get("Versions", [])) for p in s3.get_paginator("list_object_versions").paginate(Bucket="vu-backup-test"))
print(n)
PY
)
check "T24 nach prune sind alle Objektversionen physisch noch vorhanden" test "$versions_after" -ge "$versions_before"
check "T25 Repository nach Wartung fehlerfrei" restic check

# ---------------------------------------------------------------- Angriff mit Schreibschluessel
ATTACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ); sleep 2
s3py > "$T/attack.json" <<'PY'
import boto3, os, json
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
hidden = locked = deleted = 0
for page in s3.get_paginator("list_objects_v2").paginate(Bucket="vu-backup-test"):
    for o in page.get("Contents", []):
        s3.delete_object(Bucket="vu-backup-test", Key=o["Key"]); hidden += 1
for page in s3.get_paginator("list_object_versions").paginate(Bucket="vu-backup-test"):
    for v in page.get("Versions", [])[:25]:
        try:
            s3.delete_object(Bucket="vu-backup-test", Key=v["Key"], VersionId=v["VersionId"]); deleted += 1
        except Exception:
            locked += 1
    break
print(json.dumps({"hidden": hidden, "versionDeleteDenied": locked, "versionDeleted": deleted}))
PY
check "T26 Angreifer kann alles verbergen (restic sieht leeres Repository)" bash -c "! restic snapshots >/dev/null 2>&1 || [ \$(restic snapshots --json 2>/dev/null | python3 -c 'import json,sys;print(len(json.load(sys.stdin) or []))') -eq 0 ]"
check "T27 Loeschen gesperrter Versionen wird verweigert (Object Lock)" python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d["versionDeleteDenied"]>0 and d["versionDeleted"]==0 else 1)' "$T/attack.json"
VU_S3_BUCKET=vu-backup-test VU_S3_PREFIX=restic/ "$PY" "$ROOT/bin/vu-pit-recover.py" --at "$ATTACK_AT" --to-dir "$T/recovered" > "$T/pit.json" 2>&1
check "T28 Point-in-Time-Wiederherstellung in neues Verzeichnis" test -f "$T/recovered/config"
RESTIC_REPOSITORY="$T/recovered" restic unlock --remove-all >/dev/null 2>&1
check "T29 wiederhergestelltes Repository vollstaendig lesbar (check --read-data)" bash -c "RESTIC_REPOSITORY='$T/recovered' restic check --read-data > '$T/t29.log' 2>&1"
VU_DRILL_KEEP=true RESTIC_REPOSITORY="$T/recovered" "$ROOT/bin/vu-restore.sh" drill "$T/drill2" > /dev/null 2>&1
check "T30 Restore-Probe aus wiederhergestelltem Repository gruen" test $? -eq 0

# ---------------------------------------------------------------- Legal Hold (Anker)
s3py > "$T/legal.json" <<'PY'
import boto3, os, json
s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"])
r = s3.put_object(Bucket="legal-test", Key="anchor/config", Body=b"anchor")
v = r["VersionId"]
s3.put_object_legal_hold(Bucket="legal-test", Key="anchor/config", VersionId=v, LegalHold={"Status": "ON"})
try:
    s3.delete_object(Bucket="legal-test", Key="anchor/config", VersionId=v); denied = False
except Exception:
    denied = True
s3.put_object_legal_hold(Bucket="legal-test", Key="anchor/config", VersionId=v, LegalHold={"Status": "OFF"})
s3.delete_object(Bucket="legal-test", Key="anchor/config", VersionId=v)
print(json.dumps({"deniedWhileHeld": denied}))
PY
check "T31 Legal Hold verhindert Loeschen ohne Ablaufdatum" python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["deniedWhileHeld"] else 1)' "$T/legal.json"
VU_S3_BUCKET=legal-test "$PY" "$ROOT/bin/vu-anchor-lock.py" plan > /dev/null 2>&1
check "T32 vu-anchor-lock plan laeuft" test $? -eq 0

# ---------------------------------------------------------------- Schluesselpruefung
for role in writer writer-with-delete unrestricted; do
  B2_AUTH_URL="http://127.0.0.1:$API_PORT/b2auth/$role" "$PY" "$ROOT/bin/vu-key-check.py" writer >/dev/null 2>&1; echo $? > "$T/key-$role"
done
check "T33 Schreibschluessel ohne Loeschrecht wird akzeptiert" test "$(cat "$T/key-writer")" -eq 0
check "T34 Schluessel mit deleteFiles wird abgelehnt (fail closed)" test "$(cat "$T/key-writer-with-delete")" -eq 5
check "T35 Schluessel ohne Bucket-Beschraenkung wird abgelehnt" test "$(cat "$T/key-unrestricted")" -eq 5

for role in writer anchor; do
  B2_AUTH_URL="http://127.0.0.1:$API_PORT/b2auth/master" B2_MASTER_KEY_ID=m B2_MASTER_KEY=k \
    "$PY" "$ROOT/bin/vu-b2-make-key.py" --bucket vu-backup-test --role "$role" --name "t-$role" > "$T/mk-$role.json" 2>&1
done
check "T37 Schluessel-Anlage: writer bekommt genau list/read/write, kein deleteFiles" python3 -c 'import json,sys; t=open(sys.argv[1]).read(); d=json.loads(t[:t.rindex("}")+1]); sys.exit(0 if d["capabilities"]==["listBuckets","listFiles","readFiles","writeFiles"] else 1)' "$T/mk-writer.json"
B2_AUTH_URL="http://127.0.0.1:$API_PORT/b2auth/master" B2_MASTER_KEY_ID=m B2_MASTER_KEY=k "$PY" "$ROOT/bin/vu-b2-make-key.py" --bucket vu-backup-prod --role test-deleter --name x >/dev/null 2>&1; rc=$?
check "T38 Loeschschluessel fuer Nicht-Test-Bucket verweigert" test "$rc" -ne 0
B2_AUTH_URL="http://127.0.0.1:$API_PORT/b2auth/master" B2_MASTER_KEY_ID=m B2_MASTER_KEY=k "$PY" "$ROOT/bin/vu-b2-make-key.py" --bucket unlocked-test --role writer --name x >/dev/null 2>&1; rc=$?
check "T39 Schreibschluessel nur fuer Bucket mit Object Lock" test "$rc" -ne 0

# ---------------------------------------------------------------- Redaktion
out=$(VU_SECRET_VARS="MYSECRET" MYSECRET="super-secret-value" bash -c 'echo "url https://u:pw@host token super-secret-value Authorization: Bearer abcdef ghp_abcdefghijklmnop1234" | python3 '"$ROOT"'/lib/redact.py')
check "T36 Redaktion maskiert Werte, URL-Zugaenge, Bearer und PATs" bash -c "! echo '$out' | grep -qE 'super-secret|u:pw|abcdef$|ghp_abcdefghijklmnop1234'"

echo
echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen"
printf '%s\n' "${RESULTS[@]}" > "${VU_TEST_REPORT:-/dev/null}"
[ "$FAIL" -eq 0 ]
