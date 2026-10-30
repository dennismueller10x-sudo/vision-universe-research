#!/usr/bin/env bash
# Ende-zu-Ende-Test von bin/vu-b2-setup-keys.sh gegen den lokalen B2-Emulator (tests/fake_api.py).
# Keine Verbindung zu Backblaze; alle Schluessel sind erfunden.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/vu-setup-test.XXXXXX")"
PORT="${VU_TEST_API_PORT:-5066}" PASS=0 FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
unset AWS_CA_BUNDLE REQUESTS_CA_BUNDLE CURL_CA_BUNDLE SSL_CERT_FILE
export NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"
python3 "$HERE/fake_api.py" "$PORT" > "$T/api.log" 2>&1 & API=$!
trap 'kill $API 2>/dev/null; rm -rf "$T"' EXIT
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/gh/x" >/dev/null 2>&1; [ $? -ne 7 ] && break; sleep 0.1; done
export B2_AUTH_URL="http://127.0.0.1:$PORT/b2auth/key" VU_TEST_NO_CLEAR=1

run_setup() {  # ausgabe rotieren(yes|no)
  local out="$1" rotate="$2"
  mkfifo "$T/in.$out"
  ( printf 'm\nk\n'; for _ in 1 2 3 4 5 6; do echo; done
    for _ in $(seq 100); do grep -q '5/5 Master-Key' "$T/$out" 2>/dev/null && break; sleep 0.1; done
    [ "$rotate" = yes ] && curl -fs -X POST -d '{}' "http://127.0.0.1:$PORT/b2/rotate-master" >/dev/null
    echo ) > "$T/in.$out" &
  setsid "$ROOT/bin/vu-b2-setup-keys.sh" vu-backup-production-2026 < "$T/in.$out" > "$T/$out" 2>&1
}

# Fall 1: Rotation unterlassen -> Abbruch, alter Master noch gueltig
run_setup norot.txt no; rc=$?
check "S01 ohne Rotation: Abbruch mit Hinweis" bash -c "[ $rc -ne 0 ] && grep -q 'alte Master-Key wird noch angenommen' '$T/norot.txt'"

# Fall 2: vollstaendiger Ablauf mit Rotation
run_setup full.txt yes; rc=$?
report=$(sed -n '/Bericht (ohne Geheimnisse/,$p' "$T/full.txt")
check "S02 vollstaendiger Ablauf: Exit 0, drei Schluessel angelegt und geprueft" bash -c "[ $rc -eq 0 ] && [ \$(grep -c '^  angelegt: vu-backup-' '$T/full.txt') -eq 3 ] && [ \$(grep -cE '^  (writer|anchor|reader): OK' '$T/full.txt') -eq 3 ]"
check "S03 Bucket geprueft: privat, SSE, Compliance, EU-Endpunkt im Bericht" bash -c "echo \"\$0\" | grep -q 'privat=True SSE=SSE-B2 Sperre=compliance 30 days' && echo \"\$0\" | grep -q 'eu-central'" "$report"
check "S04 Rotation nachgewiesen: alter Master abgewiesen, Schluessel weiter gueltig" bash -c "echo \"\$0\" | grep -q 'alter Master-Key: abgewiesen' && echo \"\$0\" | grep -q 'nach Rotation gueltig: writer anchor reader'" "$report"
check "S05 Bericht enthaelt keine Geheimnisse (applicationKey, Master)" bash -c "! echo \"\$0\" | grep -qE 'synthetic-app-key|applicationKey|keyID'" "$report"
check "S06 Master-Key nie in der Ausgabe" bash -c "! grep -qE '(^|[^a-z])k$|Master applicationKey.*[^)]k\b' '$T/full.txt'"
check "S07 Writer-Rechte genau listBuckets/listFiles/readFiles/writeFiles, ohne deleteFiles" bash -c "grep -E '^  writer: OK' '$T/full.txt' | grep -q '\"capabilities\": \[\"listBuckets\", \"listFiles\", \"readFiles\", \"writeFiles\"\]' && ! grep -E '^  writer: OK' '$T/full.txt' | grep -q deleteFiles"
check "S08 keine Schluesseldateien zurueckgelassen" bash -c "! ls /dev/shm/vu-keys.* >/dev/null 2>&1"

echo; echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen"
[ "$FAIL" -eq 0 ]
