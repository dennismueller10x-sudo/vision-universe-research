# shellcheck shell=bash
# Gemeinsame Funktionen fuer vu-backup. Wird von bin/*.sh per `source` geladen.
#
# Grundsaetze:
# - Kein Secret erscheint in Logs, Status oder Dateinamen. Alle Ausgaben von
#   Fremdwerkzeugen laufen durch `redact` (maskiert die Werte aller Variablen
#   aus VU_SECRET_VARS).
# - Jede Quelle ist unabhaengig. Ein Fehler in einer Quelle beendet die anderen nicht.
# - restic schreibt einen Snapshot erst, wenn alle Daten oben sind. Ein Abbruch
#   hinterlaesst hoechstens unreferenzierte Packs, nie einen beschaedigten Stand.

VU_BACKUP_ROOT="${VU_BACKUP_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
VU_WORK="${VU_WORK:-/tmp/vu-backup-work}"     # fester absoluter Pfad: restic-Pfade bleiben gleich
VU_HOST="${VU_HOST:-vu-backup}"               # feste Host-Kennung: Runner haben wechselnde Namen
VU_STATUS_DIR="${VU_STATUS_DIR:-$VU_WORK/status}"

# Namen der Variablen, deren Werte nie ausgegeben werden duerfen.
VU_SECRET_VARS="${VU_SECRET_VARS:-RESTIC_PASSWORD AWS_SECRET_ACCESS_KEY AWS_ACCESS_KEY_ID VU_GITHUB_TOKEN VU_R2_SECRET_ACCESS_KEY VU_R2_ACCESS_KEY_ID VU_CF_API_TOKEN VU_BREVO_API_KEY VU_SUPABASE_DB_URL VU_NOTIFY_URL VU_HEALTHCHECK_URL}"

log() { printf '%s [%s] %s\n' "$(date -u +%H:%M:%S)" "${VU_SOURCE:-main}" "$*" | redact >&2; }
die() { log "FEHLER: $*"; exit 2; }

redact() { python3 "$VU_BACKUP_ROOT/lib/redact.py"; }

# Wiederholt einen Befehl mit Wartezeit 5 s, 20 s, 60 s (VU_RETRY_DELAYS). Nur fuer
# Netzwerkschritte, die idempotent sind (Lesen an der Quelle, Zuruecklesen).
retry() {
  local n=0 delays
  read -r -a delays <<< "${VU_RETRY_DELAYS:-5 20 60}"
  until "$@"; do
    local rc=$?
    if [ "$n" -ge "${#delays[@]}" ]; then return "$rc"; fi
    log "Versuch $((n + 1)) fehlgeschlagen (Exit $rc), neuer Versuch in ${delays[$n]} s"
    sleep "${delays[$n]}"; n=$((n + 1))
  done
}

require_env() {
  local missing=()
  for v in "$@"; do [ -n "${!v:-}" ] || missing+=("$v"); done
  [ "${#missing[@]}" -eq 0 ] || { log "fehlende Konfiguration: ${missing[*]}"; return 3; }
}

# Ergebnis einer Quelle festhalten (wird von bin/vu-status.py gelesen).
# status: ok | warn | failed | skipped
record() {
  local source="$1" status="$2" message="$3" extra="${4:-{\}}"
  mkdir -p "$VU_STATUS_DIR"
  python3 - "$VU_STATUS_DIR/$source.json" "$source" "$status" "$message" "$extra" <<'PY'
import json, sys, time
path, source, status, message, extra = sys.argv[1:6]
data = {"source": source, "status": status, "message": message, "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
data.update(json.loads(extra or "{}"))
open(path, "w").write(json.dumps(data, indent=2, sort_keys=True))
PY
}

# Sichert einen Pfad als Snapshot der Quelle. Gibt die JSON-Zusammenfassung von restic aus.
restic_backup_source() {
  local source="$1"; shift
  local extra=() t
  for t in ${VU_SNAPSHOT_EXTRA_TAGS:-}; do extra+=(--tag "$t"); done
  restic backup --json --host "$VU_HOST" --tag vu --tag "src:$source" ${VU_RUN_TAG:+--tag "run:$VU_RUN_TAG"} "${extra[@]}" "$@" \
    2> >(redact >&2) | python3 -c '
import json, sys
summary = {}
for line in sys.stdin:
    try:
        msg = json.loads(line)
    except ValueError:
        continue
    if msg.get("message_type") == "summary":
        summary = {k: msg.get(k) for k in ("snapshot_id", "files_new", "files_changed", "files_unmodified", "data_added", "total_bytes_processed", "total_duration")}
print(json.dumps(summary))'
}

latest_snapshot_id() {
  restic snapshots --json --host "$VU_HOST" --tag "src:$1" --latest 1 2>/dev/null \
    | python3 -c 'import json,sys; s=json.load(sys.stdin) or []; print(s[-1]["short_id"] if s else "")'
}

# Vergleicht das neue Manifest mit dem im letzten Snapshot der Quelle.
# Ausgabe: {"compared": bool, "drops": [...]}. Schwelle: VU_MAX_DROP_PERCENT (Standard 10).
compare_with_previous() {
  local source="$1" manifest="$2" prev old
  prev=$(latest_snapshot_id "$source")
  if [ -z "$prev" ]; then echo '{"compared": false}'; return 0; fi
  old="$VU_WORK/manifests/.previous-$source.json"
  if restic dump "$prev" "$manifest" > "$old" 2>/dev/null; then
    python3 "$VU_BACKUP_ROOT/lib/manifest.py" compare "$old" "$manifest" "${VU_MAX_DROP_PERCENT:-10}"
  else
    echo '{"compared": false}'
  fi
}

drift_has_findings() {
  python3 -c 'import json,sys; print("yes" if json.loads(sys.argv[1]).get("drops") else "no")' "$1"
}
