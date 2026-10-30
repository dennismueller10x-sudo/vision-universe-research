#!/usr/bin/env bash
# vu-verify: Pruefung des Backup-Repositorys, nur lesend.
#
#   vu-verify.sh quick     Struktur (Index, Snapshots, Baeume)
#   vu-verify.sh sample    Struktur + 5 % der Daten-Packs herunterladen und pruefen
#   vu-verify.sh full      Struktur + alle Daten (monatlich; laedt das ganze Repository)
#   vu-verify.sh chain     Git-Bundle-Ketten vollstaendig? Nur Metadaten (kein Daten-Download):
#                          jedes Bundle aus chain.txt des neuesten Stands muss in einem Snapshot
#                          der Kette liegen, mit passender Groesse.
#
# Exit 0 in Ordnung, 1 Fehler gefunden, 2 Ziel nicht erreichbar.
set -uo pipefail
VU_BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$VU_BACKUP_ROOT/lib/common.sh"
level="${1:-quick}"
require_env RESTIC_REPOSITORY RESTIC_PASSWORD || exit 2
restic cat config >/dev/null 2> >(redact >&2) || { log "Ziel nicht erreichbar oder Passwort falsch"; exit 2; }
if [ "$level" = chain ]; then
  rc=0
  for src in $(restic snapshots --json --host "$VU_HOST" --tag chain | python3 -c 'import json,sys; print(" ".join(sorted({t[4:] for s in json.load(sys.stdin) or [] for t in s.get("tags",[]) if t.startswith("src:gitb-")})))'); do
    name="${src#gitb-}"
    latest=$(latest_snapshot_id "$src")
    chain=$(restic dump "$latest" "$VU_WORK/gitb/$name/chain.txt" 2>/dev/null) || { log "$src: chain.txt im neuesten Stand fehlt"; rc=1; continue; }
    have=$(restic snapshots --json --host "$VU_HOST" --tag "src:$src" | python3 -c 'import json,sys; print(" ".join(s["short_id"] for s in json.load(sys.stdin) or []))' \
      | tr ' ' '\n' | while read -r id; do [ -n "$id" ] && restic ls --json "$id" "$VU_WORK/gitb/$name" 2>/dev/null; done | python3 -c '
import json, sys
seen = {}
for line in sys.stdin:
    try:
        n = json.loads(line)
    except ValueError:
        continue
    if n.get("type") == "file" and n.get("name", "").endswith(".bundle"):
        seen[n["name"]] = n.get("size")
print(json.dumps(seen))')
    missing=$(printf '%s\n' "$chain" | python3 -c 'import json,sys; seen=json.loads(sys.argv[1]); m=[l.split()[1] for l in sys.stdin if l.strip() and l.split()[1] not in seen]; print(" ".join(m))' "$have")
    count=$(printf '%s\n' "$chain" | grep -c . || true)
    if [ -n "$missing" ]; then log "$src: Kette UNVOLLSTAENDIG, fehlend: $missing"; rc=1
    else log "$src: Kette vollstaendig ($count Bundles)"; fi
  done
  exit "$rc"
fi
case "$level" in
  quick) args=() ;;
  sample) args=(--read-data-subset=5%) ;;
  full) args=(--read-data) ;;
  *) die "Stufe quick|sample|full|chain" ;;
esac
log "restic check ${args[*]:-}"
if restic check "${args[@]}" 2>&1 | redact; then
  log "Repository in Ordnung"
  restic snapshots --compact --host "$VU_HOST" 2>/dev/null | redact
  exit 0
fi
log "Pruefung meldet Fehler. Keine Wartung (forget/prune) ausfuehren, bevor die Ursache geklaert ist."
exit 1
