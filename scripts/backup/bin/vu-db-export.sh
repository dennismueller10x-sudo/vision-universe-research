#!/usr/bin/env bash
# Verschluesselter Export der Konten-Datenbank direkt in das private Backup-Ziel (B2).
# Ersetzt die Ablage als Actions-Artefakt: kein Klartext auf der Platte, kein Artefakt.
#
#   vu-db-export.sh
#
# Umgebung (alle aus dem privaten Backup-Repo, Environment "backup"):
#   VU_DB_URL              Session-Pooler-URI der Leserolle (Benutzer vu_backup_ro.<ref>)
#   VU_DB_PROJECT          Projekt-Ref; die URI muss ihn enthalten
#   VU_DB_AGE_RECIPIENT    oeffentlicher age-Schluessel (age1...)
#   VU_S3_ENDPOINT, VU_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (B2-Schreibschluessel)
#   VU_DB_PREFIX           Standard db/accounts/
#   VU_DB_ROLE             Standard vu_backup_ro (Schutz: nur diese Rolle wird akzeptiert)
#   VU_PG_MIN_MAJOR        Standard 17 (Server ist Postgres 17); pg_dump/psql lokal installiert
#
# Ablauf (bricht bei jedem Fehler ab, nichts Halbes landet im Ziel):
#  1. Eingaben pruefen: Empfaenger-Format, Projekt in der URI, Benutzer = Leserolle.
#  2. Verbindung pruefen: current_user = Leserolle, Sitzung read-only, keine Schreibrechte.
#  3. pg_dump | age -> Datei (nur verschluesselt auf der Platte), SHA-256.
#  4. Upload nach <prefix>YYYY/MM/<zeit>.dump.age mit Pruefsumme; Manifest daneben.
#  5. Rueckpruefung: Objekt aus dem Ziel zuruecklesen, SHA-256 vergleichen.
# Ausgabe: nur Groessen, Zeitpunkte, Pruefsummen, Objektnamen - nie Werte der Eingaben.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLE="${VU_DB_ROLE:-vu_backup_ro}"
PREFIX="${VU_DB_PREFIX:-db/accounts/}"
MIN_MAJOR="${VU_PG_MIN_MAJOR:-17}"
export VU_SECRET_VARS="VU_DB_URL AWS_SECRET_ACCESS_KEY AWS_ACCESS_KEY_ID"
fail() { echo "FEHLER: $*" >&2; exit 1; }

for v in VU_DB_URL VU_DB_PROJECT VU_DB_AGE_RECIPIENT VU_S3_ENDPOINT VU_S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || fail "$v fehlt"
done
[[ "$VU_DB_AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]] || fail "age-Empfaenger hat kein gueltiges Format (age1...)"
[[ "$VU_DB_URL" == postgresql://* ]] || fail "Datenbank-URI muss mit postgresql:// beginnen"
[[ "$VU_DB_URL" == *"$VU_DB_PROJECT"* ]] || fail "Datenbank-URI gehoert nicht zum Projekt $VU_DB_PROJECT"
dbuser="${VU_DB_URL#postgresql://}"; dbuser="${dbuser%%[:@]*}"; dbuser="${dbuser%%.*}"
[ "$dbuser" = "$ROLE" ] || fail "Datenbank-URI nutzt nicht die Leserolle $ROLE (sondern einen anderen Benutzer)"
command -v age >/dev/null || fail "age fehlt"

# pg_dump/psql muessen mindestens die Hauptversion des Servers haben (Workflow installiert
# postgresql-client-17 aus dem PGDG-Paketarchiv).
v=$(pg_dump --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)
[ -n "$v" ] && [ "$v" -ge "$MIN_MAJOR" ] || fail "pg_dump >= $MIN_MAJOR fehlt"
pg() { "$@"; }

# ---- 2. Verbindung: nur die Leserolle, nur lesend
check=$(pg psql "$VU_DB_URL" -At -v ON_ERROR_STOP=1 -c "select current_user || '|' || current_setting('default_transaction_read_only') || '|' || (select bool_or(has_table_privilege(current_user, c.oid, 'INSERT') or has_table_privilege(current_user, c.oid, 'UPDATE') or has_table_privilege(current_user, c.oid, 'DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','billing','auth','supabase_migrations'))::text" 2>/dev/null) \
  || fail "Anmeldung mit der Leserolle fehlgeschlagen (Passwort, Pooler oder Netz)"
[ "$check" = "$ROLE|on|false" ] || fail "Verbindung ist nicht rein lesend (erwartet $ROLE|on|false, erhalten ${check%%|*}|...)"
echo "Verbindung: $ROLE, Sitzung read-only, keine Schreibrechte"

# ---- 3. Export, sofort verschluesselt
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%SZ)
key="${PREFIX}$(date -u +%Y/%m)/vu-accounts-$stamp.dump.age"
pg pg_dump --format=custom --no-owner --no-privileges \
   --schema=public --schema=billing --schema=auth --schema=supabase_migrations "$VU_DB_URL" \
  | age -r "$VU_DB_AGE_RECIPIENT" -o "$W/dump.age"
size=$(stat -c %s "$W/dump.age")
[ "$size" -gt 1000 ] || fail "Export verdaechtig klein ($size Bytes)"
head -c 21 "$W/dump.age" | grep -q 'age-encryption.org' || fail "Ausgabe ist nicht age-verschluesselt"
sha=$(sha256sum "$W/dump.age" | cut -c1-64)
echo "Export verschluesselt: $size Bytes, SHA-256 $sha"

# ---- 4./5. Upload, Manifest, Rueckpruefung
python3 "$ROOT/lib/s3_put.py" put "$W/dump.age" "$key" "$sha" \
  --meta project="$VU_DB_PROJECT" --meta role="$ROLE" --meta created="$stamp" --meta format=pg_dump-custom+age
printf '{"object":"%s","bytes":%s,"sha256":"%s","createdAt":"%s","project":"%s","role":"%s","schemas":["public","billing","auth","supabase_migrations"],"encryption":"age X25519","recipient":"%s"}\n' \
  "$key" "$size" "$sha" "$stamp" "$VU_DB_PROJECT" "$ROLE" "$VU_DB_AGE_RECIPIENT" > "$W/manifest.json"
python3 "$ROOT/lib/s3_put.py" put "$W/manifest.json" "${key%.dump.age}.json" "$(sha256sum "$W/manifest.json" | cut -c1-64)"
python3 "$ROOT/lib/s3_put.py" verify "$key" "$sha"
echo "Gesichert: $key ($size Bytes), Rueckpruefung SHA-256 in Ordnung"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '## Konten-Datenbank gesichert\n\n| Objekt | Bytes | SHA-256 |\n|---|---|---|\n| `%s` | %s | `%s` |\n' "$key" "$size" "${sha:0:16}…" >> "$GITHUB_STEP_SUMMARY"
fi
