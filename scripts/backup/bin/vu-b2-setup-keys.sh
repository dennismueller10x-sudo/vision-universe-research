#!/usr/bin/env bash
# Einmalige Einrichtung der Backblaze-Schluessel fuer den Produktions-Bucket, in EINER Wegwerf-Shell
# (Google Cloud Shell, Ephemeral Mode). Fuer den Owner, nicht fuer Runner.
#
#   bin/vu-b2-setup-keys.sh <bucket>
#
# Ablauf:
#   1. Master-Key verdeckt einlesen (read -s, kein Echo, keine History)
#   2. Bucket pruefen (nur lesen): privat, SSE, Object Lock Compliance, EU Central
#   3. vu-backup-writer (365 Tage), vu-backup-anchor, vu-backup-reader anlegen
#      (vu-b2-make-key.py, fail closed); Werte nur im RAM (/dev/shm, Rechte 600)
#   4. tatsaechliche Rechte jedes Schluessels bei Backblaze pruefen (vu-key-check.py)
#   5. jeden Schluessel EINZELN anzeigen -> Passwortmanager -> Bildschirm und Verlauf leeren
#   6. Owner erzeugt im Browser einen neuen Master-Key; das Skript prueft danach:
#      alter Master-Key abgewiesen, alle drei Schluessel weiter gueltig
#   7. alles loeschen; Abschlussbericht OHNE Geheimnisse (darf an Claude gehen)
#
# Geheimnisse stehen nie in Argumenten (ps), Dateien ausserhalb von /dev/shm, der History oder dem Bericht.
set -uo pipefail
set +o history 2>/dev/null || true
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUCKET="${1:?Bucketname angeben}"
umask 077
D=$(mktemp -d /dev/shm/vu-keys.XXXXXX 2>/dev/null || mktemp -d)
REPORT=()
wipe_screen() { [ -n "${VU_TEST_NO_CLEAR:-}" ] || printf '\033[2J\033[3J\033[H'; }
cleanup() {
  find "$D" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$D"
  unset B2_MASTER_KEY B2_MASTER_KEY_ID
}
trap cleanup EXIT
fail() { echo; echo "ABBRUCH: $*"; echo "Bereits angelegte Schluessel (falls genannt) in Backblaze unter Application Keys loeschen und neu beginnen."; exit 1; }
pause() { local _; read -r -p "$1" _ </dev/tty 2>/dev/null || read -r _; }

# Schluessel aus der RAM-Datei pruefen, ohne den Wert in Argumente oder Umgebung der Shell zu legen
key_check() {  # rolle
  python3 -c '
import json, os, subprocess, sys
d = json.load(open(sys.argv[1]))
env = dict(os.environ, AWS_ACCESS_KEY_ID=d["keyID"], AWS_SECRET_ACCESS_KEY=d["applicationKey"])
for k in ("B2_MASTER_KEY", "B2_MASTER_KEY_ID"):
    env.pop(k, None)
sys.exit(subprocess.call([sys.executable, sys.argv[2], sys.argv[3]], env=env))' "$D/$1.json" "$HERE/vu-key-check.py" "$1"
}

echo "== Vision Universe: Backblaze-Schluessel fuer $BUCKET"
echo "Master-Key aus Backblaze (Application Keys -> Generate New Master Application Key)."
read -rsp "  Master keyID (unsichtbar): " B2_MASTER_KEY_ID </dev/tty 2>/dev/null || read -rs B2_MASTER_KEY_ID; echo
read -rsp "  Master applicationKey (unsichtbar): " B2_MASTER_KEY </dev/tty 2>/dev/null || read -rs B2_MASTER_KEY; echo
[ -n "$B2_MASTER_KEY_ID" ] && [ -n "$B2_MASTER_KEY" ] || fail "Master-Key leer"
export B2_MASTER_KEY_ID B2_MASTER_KEY

echo; echo "== 1/5 Bucket pruefen (nur lesen)"
python3 "$HERE/vu-b2-make-key.py" --bucket "$BUCKET" --inspect > "$D/bucket.json" 2>&1 || { cat "$D/bucket.json"; fail "Bucket nicht wie vorgesehen eingerichtet"; }
cat "$D/bucket.json"
REPORT+=("Bucket: $(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("privat=%s SSE=%s Sperre=%s Lifecycle-Regeln=%d Endpunkt=%s" % (d["private"], d["encryption"], d["defaultRetention"], len(d["lifecycleRules"]), d["s3Endpoint"]))' "$D/bucket.json")")

echo; echo "== 2/5 Schluessel anlegen"
created=()
for spec in "writer vu-backup-writer 365" "anchor vu-backup-anchor 0" "reader vu-backup-reader 0"; do
  read -r role name days <<< "$spec"
  python3 "$HERE/vu-b2-make-key.py" --bucket "$BUCKET" --role "$role" --name "$name" --days "$days" --out "$D/$role.json" > "$D/mk.log" 2>&1 \
    || { sed 's/^/  /' "$D/mk.log" | grep -v applicationKey; fail "Anlage von $name fehlgeschlagen. Schon angelegt: ${created[*]:-keine}"; }
  created+=("$name"); echo "  angelegt: $name"
done

echo; echo "== 3/5 Rechte bei Backblaze pruefen"
for role in writer anchor reader; do
  out=$(key_check "$role" 2>&1) || fail "Schluessel $role hat nicht die vorgesehenen Rechte: $out"
  echo "  $role: OK $(echo "$out" | head -1)"
  REPORT+=("$role: $(echo "$out" | head -1)")
done

echo; echo "== 4/5 Schluessel uebernehmen (einzeln, danach wird der Bildschirm geleert)"
echo "Passwortmanager bereithalten: je Schluessel einen Eintrag (Name, keyID, applicationKey)."
for role in writer anchor reader; do
  pause "  Enter zeigt den Schluessel '$role' ... "
  wipe_screen
  python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
ziel = {"writer": "Passwortmanager UND GitHub (vision-universe-backup, Environment backup: B2_WRITER_KEY_ID / B2_WRITER_KEY)",
        "anchor": "NUR Passwortmanager (nicht GitHub)", "reader": "NUR Passwortmanager (nicht GitHub)"}[sys.argv[2]]
print("\n  Name:           %s\n  keyID:          %s\n  applicationKey: %s\n\n  Ablage: %s\n" % (d["keyName"], d["keyID"], d["applicationKey"], ziel))' "$D/$role.json" "$role"
  pause "  Kopiert? Enter leert den Bildschirm ... "
  wipe_screen
done

echo "== 5/5 Master-Key rotieren"
echo "Jetzt im Browser: Backblaze -> Application Keys -> Generate New Master Application Key."
echo "Den NEUEN Master-Key direkt in den Passwortmanager (Eintrag 'B2 Master'), NICHT hier eingeben."
pause "Erledigt? Enter prueft: alter Master-Key ungueltig, drei Schluessel weiter gueltig ... "
python3 - <<'PY' || fail "der alte Master-Key wird noch angenommen: Rotation im Browser wiederholen"
import base64, os, sys, urllib.error, urllib.request
url = os.environ.get("B2_AUTH_URL", "https://api.backblazeb2.com/b2api/v3/b2_authorize_account")
tok = base64.b64encode(f"{os.environ['B2_MASTER_KEY_ID']}:{os.environ['B2_MASTER_KEY']}".encode()).decode()
try:
    urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Basic " + tok}), timeout=30)
    sys.exit(1)
except urllib.error.HTTPError as err:
    sys.exit(0 if err.code == 401 else 1)
PY
unset B2_MASTER_KEY B2_MASTER_KEY_ID
REPORT+=("alter Master-Key: abgewiesen (401)")
for role in writer anchor reader; do
  key_check "$role" >/dev/null 2>&1 || fail "$role nach der Rotation nicht mehr gueltig"
done
REPORT+=("nach Rotation gueltig: writer anchor reader")

wipe_screen
echo "== Fertig. Bericht (ohne Geheimnisse, darf an Claude):"
for l in "${REPORT[@]}"; do echo "  $l"; done
echo
echo "Naechster Schritt: in GitHub (vision-universe-backup -> Settings -> Environments -> backup)"
echo "  Secrets  B2_WRITER_KEY_ID, B2_WRITER_KEY  (aus dem Passwortmanager)"
echo "  Variable B2_BUCKET = $BUCKET"
echo "  Variable B2_ENDPOINT = Endpunkt aus dem Bericht"
echo "Dann diese Shell schliessen."
