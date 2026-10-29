# shellcheck shell=bash
# Quellen ueber HTTP-APIs: GitHub-Metadaten, ausgewaehlte Actions-Artefakte,
# Cloudflare KV, Cloudflare-Konfiguration (DNS, Worker-Bindings), Brevo.
# Jede Quelle: Export in ein frisches Verzeichnis, Vergleich mit dem letzten
# Stand, restic backup, Verzeichnis loeschen.

backup_api_source() {
  local source="$1" kind="$2"
  local dir="$VU_WORK/api/$source" manifest
  VU_SOURCE="$source"
  rm -rf "$dir"; mkdir -p "$dir"
  manifest="$dir/export.json"

  local out rc=0 prev
  if [ "$kind" = github-meta ] && prev=$(latest_snapshot_id "$source") && [ -n "$prev" ]; then
    rm -rf "$VU_WORK/prev"
    restic restore "$prev" --target "$VU_WORK/prev" --include "$dir/export.json" --include "$dir/*/reviews.json" >/dev/null 2>&1 \
      && export VU_GITHUB_META_PREV_DIR="$VU_WORK/prev$dir"
  fi
  out=$(python3 "$VU_BACKUP_ROOT/sources/api_export.py" "$kind" "$dir" 2> >(redact >&2)) || rc=$?
  if [ "$rc" -ne 0 ]; then
    case "$rc" in
      3) record "$source" failed "Konfiguration unvollstaendig" ;;
      4) record "$source" failed "Rechte fehlen fuer einen Pflicht-Endpunkt" ;;
      *) record "$source" failed "Export fehlgeschlagen (Exit $rc)" ;;
    esac
    rm -rf "$dir"; return 1
  fi

  local drift summary
  drift=$(compare_with_previous "$source" "$manifest")
  summary=$(restic_backup_source "$source" "$dir") \
    || { record "$source" failed "restic backup fehlgeschlagen"; rm -rf "$dir"; return 1; }

  local status=ok msg="Export gesichert"
  if [ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["unavailable"])' "$out")" -gt 0 ]; then
    status=warn; msg="Export gesichert, einzelne optionale Endpunkte ohne Zugriff"
  fi
  if [ "$(drift_has_findings "$drift")" = yes ]; then status=warn; msg="Quelle deutlich geschrumpft, bitte pruefen"; fi
  record "$source" "$status" "$msg" "$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(json.dumps({"summary": json.loads(sys.argv[2]), "manifest": {k: m[k] for k in ("records","counts","unavailable")}, "drift": json.loads(sys.argv[3])}))' "$manifest" "$summary" "$drift")"
  rm -rf "$dir"
}

backup_github_meta() {
  require_env VU_GITHUB_TOKEN VU_GITHUB_REPOS || { record github-meta failed "Token oder Repo-Liste fehlt"; return 1; }
  backup_api_source github-meta github-meta
}
backup_gh_artifacts() {
  [ -n "${VU_ARTIFACT_ALLOWLIST:-}" ] || { record gh-artifacts skipped "keine Artefakte freigegeben"; return 0; }
  backup_api_source gh-artifacts gh-artifacts
}
backup_cf_kv() {
  require_env VU_CF_API_TOKEN VU_CF_ACCOUNT_ID VU_CF_KV_NAMESPACES || { record cf-kv failed "Cloudflare-Zugang fehlt"; return 1; }
  backup_api_source cf-kv cf-kv
}
backup_cf_config() {
  require_env VU_CF_API_TOKEN VU_CF_ACCOUNT_ID || { record cf-config failed "Cloudflare-Zugang fehlt"; return 1; }
  backup_api_source cf-config cf-config
}
backup_brevo() {
  # Personenbezogen: nur mit ausdruecklicher Owner-Freigabe (VU_BREVO_ENABLED=true).
  [ "${VU_BREVO_ENABLED:-false}" = true ] || { record brevo skipped "nicht freigegeben (Datenschutz)"; return 0; }
  require_env VU_BREVO_API_KEY || { record brevo failed "Brevo-Schluessel fehlt"; return 1; }
  backup_api_source brevo brevo
}
