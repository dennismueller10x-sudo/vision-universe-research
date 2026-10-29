# shellcheck shell=bash
# Quelle: S3-kompatibler Objektspeicher (Cloudflare R2), je Praefix ein Snapshot.
#
# VU_R2_ENDPOINT, VU_R2_BUCKET, VU_R2_ACCESS_KEY_ID, VU_R2_SECRET_ACCESS_KEY
#   Token mit "Object Read only", beschraenkt auf diesen Bucket. Nie den Schreib-
#   schluessel der Datenlaeufe verwenden.
# VU_R2_PREFIXES_TIER1  taeglich, nicht neu erzeugbar. Form name=praefix/
# VU_R2_PREFIXES_TIER2  nur mit --tier2 (neu erzeugbar, gross)
#
# Ablauf je Praefix: rclone copy (nur lesend) in ein lokales Verzeichnis, Manifest
# (Dateien, Bytes, SHA-256), Vergleich mit dem letzten Manifest, restic backup,
# Verzeichnis loeschen (Plattenplatz). Objekte, die nach dem Listing entstehen,
# landen im naechsten Lauf.

r2_env() {
  export RCLONE_CONFIG_VUR2_TYPE=s3
  export RCLONE_CONFIG_VUR2_PROVIDER="${VU_R2_PROVIDER:-Cloudflare}"
  export RCLONE_CONFIG_VUR2_ENDPOINT="$VU_R2_ENDPOINT"
  export RCLONE_CONFIG_VUR2_ACCESS_KEY_ID="$VU_R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_VUR2_SECRET_ACCESS_KEY="$VU_R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_VUR2_REGION="${VU_R2_REGION:-auto}"
  export RCLONE_CONFIG_VUR2_NO_CHECK_BUCKET=true
  VU_SECRET_VARS="$VU_SECRET_VARS RCLONE_CONFIG_VUR2_SECRET_ACCESS_KEY RCLONE_CONFIG_VUR2_ACCESS_KEY_ID"; export VU_SECRET_VARS
}

backup_r2_prefix() {
  local name="$1" prefix="$2"
  local source="r2-$name" dir="$VU_WORK/r2/$name" manifest="$VU_WORK/manifests/r2-$name.json"
  VU_SOURCE="$source"
  rm -rf "$dir"; mkdir -p "$dir" "$VU_WORK/manifests"

  if ! retry rclone copy "vur2:$VU_R2_BUCKET/$prefix" "$dir" --fast-list --checkers 16 --transfers 16 \
        --retries 3 --low-level-retries 10 --stats 0 2> >(redact >&2); then
    record "$source" failed "Lesen aus dem Objektspeicher fehlgeschlagen (Rechte? Netz?)"; rm -rf "$dir"; return 1
  fi
  # Listing getrennt: so faellt ein unvollstaendiger Download auf.
  local listed
  listed=$(rclone lsf -R --files-only --fast-list "vur2:$VU_R2_BUCKET/$prefix" 2>/dev/null | wc -l || echo -1)
  python3 "$VU_BACKUP_ROOT/lib/manifest.py" dir "$dir" > "$manifest"
  python3 - "$manifest" "$listed" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m["listedObjects"] = int(sys.argv[2]); json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
  local drift summary
  drift=$(compare_with_previous "$source" "$manifest")
  summary=$(restic_backup_source "$source" "$dir" "$manifest" "$VU_WORK/r2/$name.sha256") \
    || { record "$source" failed "restic backup fehlgeschlagen"; rm -rf "$dir"; return 1; }

  local status=ok msg="Praefix gesichert" files
  files=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["files"])' "$manifest")
  if [ "$listed" -ge 0 ] && [ "$files" -lt "$listed" ]; then status=warn; msg="$files von $listed Objekten gesichert"; fi
  if [ "$(drift_has_findings "$drift")" = yes ]; then status=warn; msg="Praefix deutlich geschrumpft, bitte pruefen"; fi
  record "$source" "$status" "$msg" "$(python3 -c 'import json,sys; print(json.dumps({"summary": json.loads(sys.argv[1]), "manifest": json.load(open(sys.argv[2])), "drift": json.loads(sys.argv[3])}))' "$summary" "$manifest" "$drift")"
  rm -rf "$dir"
}

backup_r2() {
  require_env VU_R2_ENDPOINT VU_R2_BUCKET VU_R2_ACCESS_KEY_ID VU_R2_SECRET_ACCESS_KEY \
    || { record r2 failed "Zugangsdaten fuer den Objektspeicher fehlen"; return 1; }
  r2_env
  local rc=0 entry list="${VU_R2_PREFIXES_TIER1:-}"
  [ "${VU_TIER2:-false}" = true ] && list="$list ${VU_R2_PREFIXES_TIER2:-}"
  for entry in $list; do
    backup_r2_prefix "${entry%%=*}" "${entry#*=}" || rc=1
  done
  return "$rc"
}
