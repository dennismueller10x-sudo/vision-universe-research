#!/usr/bin/env bash
# Einmalige Einrichtung der Backblaze-Schluessel fuer den Produktions-Bucket, in EINER Wegwerf-Shell
# (Google Cloud Shell, Ephemeral Mode). Fuer den Owner, nicht fuer Runner.
#
#   bin/vu-b2-setup-keys.sh <bucket>
#
# Ablauf:
#   1. Master-Key verdeckt von /dev/tty lesen (kein Echo, keine History), Format pruefen, bei Backblaze
#      als Master bestaetigen; vorhandene vu-backup-* Schluessel -> Abbruch ohne Aenderung
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
STAGE=input   # input | created
# Ein- und Ausgabe fuer Fragen: direkt das Terminal (/dev/tty). Nur Tests lesen von stdin (VU_TEST_STDIN=1).
if [ -n "${VU_TEST_STDIN:-}" ]; then IN=/dev/stdin; exec 3>&2
elif { : </dev/tty; } 2>/dev/null; then IN=/dev/tty; exec 3>/dev/tty
else echo "ABBRUCH: kein Terminal. Bitte direkt in der Cloud Shell starten (nicht ueber eine Pipe)."; exit 1; fi
say() { printf '%s' "$*" >&3; }
wipe_screen() { [ -n "${VU_TEST_NO_CLEAR:-}" ] || printf '\033[2J\033[3J\033[H' >&3; }
cleanup() {
  [ "$IN" = /dev/tty ] && stty echo < /dev/tty 2>/dev/null
  find "$D" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$D"
  unset B2_MASTER_KEY B2_MASTER_KEY_ID
}
trap cleanup EXIT
trap 'echo; echo "Abgebrochen (Strg-C)."; exit 130' INT
fail() {
  echo; echo "ABBRUCH: $*"
  if [ "$STAGE" = created ]; then echo "In Backblaze unter Application Keys pruefen, ob vu-backup-* Schluessel angelegt wurden, diese loeschen und neu beginnen."
  else echo "Es wurde kein Schluessel angelegt und nichts veraendert."; fi
  exit 1
}
# Tastatur-Puffer leeren: z. B. ein Zeilenumbruch, der beim Einfuegen des Startbefehls mitkam
drain() { [ "$IN" = /dev/tty ] || return 0; local _; while IFS= read -r -s -t 0.3 -n 4096 _ < "$IN"; do :; done; }
pause() { local _; drain; say "$1"; IFS= read -r _ < "$IN"; }
# Eingefuegten Text bereinigen: Klammer-Einfuegecodes, CR, Leerraum am Rand
clean() { local v="$1"; v="${v//$'\e[200~'/}"; v="${v//$'\e[201~'/}"; v="${v//$'\r'/}"
  v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"; printf '%s' "$v"; }

# ask_secret VAR "Frage" id|key : verdeckt lesen, pruefen, nur Laenge bestaetigen. 3 Versuche.
ask_secret() {
  local var="$1" label="$2" kind="$3" v n
  for n in 1 2 3; do
    drain
    say "  $label (unsichtbar; einfuegen, dann Enter): "
    IFS= read -r -s v < "$IN"; say $'\n'
    v=$(clean "$v")
    if [ -z "$v" ]; then say "    nichts angekommen. Bitte erneut einfuegen."$'\n'; continue; fi
    if [[ "$v" =~ [[:space:]] ]]; then say "    enthaelt Leerzeichen oder Zeilenumbruch. Nur den Wert kopieren."$'\n'; v=""; continue; fi
    case "$kind" in
      id)
        if [[ "$v" =~ ^[0-9a-f]{12}$ ]]; then :
        elif [[ "$v" =~ ^[0-9a-f]{25}$ ]]; then say "    das ist die keyID eines normalen Schluessels, nicht des Master-Keys (12 Zeichen)."$'\n'; v=""; continue
        elif [[ "$v" =~ ^K ]]; then say "    sieht aus wie der applicationKey. Zuerst die keyID (12 Zeichen) einfuegen."$'\n'; v=""; continue
        elif [[ "$v" =~ ^[0-9a-f]{8,40}$ ]]; then say "    Hinweis: ${#v} Zeichen (Master-keyIDs haben meist 12). Backblaze prueft gleich."$'\n'
        else say "    unerwartetes Format (erwartet: keyID aus 0-9 und a-f, meist 12 Zeichen)."$'\n'; v=""; continue; fi ;;
      key)
        if [[ "$v" =~ ^[A-Za-z0-9+/=_-]{20,80}$ ]] && [ "$v" != "$B2_MASTER_KEY_ID" ]; then :
        else say "    unerwartetes Format (erwartet: der applicationKey, eine Zeile ohne Leerzeichen)."$'\n'; v=""; continue; fi ;;
    esac
    say "    erhalten: ${#v} Zeichen"$'\n'
    printf -v "$var" '%s' "$v"; v=""
    return 0
  done
  return 1
}

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
echo "Die Eingabe bleibt unsichtbar. Nach dem Einfuegen erscheint 'erhalten: N Zeichen'."
ok=false
for attempt in 1 2; do
  B2_MASTER_KEY_ID="" B2_MASTER_KEY=""
  ask_secret B2_MASTER_KEY_ID "Master keyID" id || fail "keine gueltige keyID erhalten"
  ask_secret B2_MASTER_KEY "Master applicationKey" key || fail "keinen gueltigen applicationKey erhalten"
  export B2_MASTER_KEY_ID B2_MASTER_KEY
  # Erst Backblaze fragen: ist es wirklich der Master-Key? Gibt es schon vu-backup-* Schluessel? (nur lesen)
  if out=$(python3 "$HERE/vu-b2-make-key.py" --bucket "$BUCKET" --check-master 2>&1); then ok=true; break; fi
  case "$out" in
    *'"master": true'*) fail "es gibt bereits Schluessel mit diesen Namen: $(echo "$out" | python3 -c 'import json,sys; print(", ".join(json.load(sys.stdin)["existingVuBackupKeys"]))' 2>/dev/null). Bestehende Schluessel werden nicht veraendert. In Backblaze pruefen und bei Bedarf selbst loeschen." ;;
    *'"master": false'*) echo "  Backblaze kennt den Schluessel, aber es ist NICHT der Master-Key (kein Recht, Schluessel anzulegen)." ;;
    *401*) echo "  Backblaze lehnt den Schluessel ab (falsch, vertauscht oder schon durch einen neueren ersetzt)." ;;
    *) echo "  Pruefung bei Backblaze fehlgeschlagen: $(echo "$out" | tail -1 | cut -c1-120)" ;;
  esac
  unset B2_MASTER_KEY B2_MASTER_KEY_ID
  [ "$attempt" = 1 ] && echo "  Noch ein Versuch."
done
[ "$ok" = true ] || fail "Master-Key nicht bestaetigt"
echo "  Master-Key von Backblaze bestaetigt; keine vorhandenen vu-backup-Schluessel."

echo; echo "== 1/5 Bucket pruefen (nur lesen)"
python3 "$HERE/vu-b2-make-key.py" --bucket "$BUCKET" --inspect > "$D/bucket.json" 2>&1 || { cat "$D/bucket.json"; fail "Bucket nicht wie vorgesehen eingerichtet"; }
cat "$D/bucket.json"
REPORT+=("Bucket: $(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("privat=%s SSE=%s Sperre=%s Lifecycle-Regeln=%d Endpunkt=%s" % (d["private"], d["encryption"], d["defaultRetention"], len(d["lifecycleRules"]), d["s3Endpoint"]))' "$D/bucket.json")")

echo; echo "== 2/5 Schluessel anlegen"
created=()
STAGE=created   # ab hier kann ein Schluessel existieren
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
