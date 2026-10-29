#!/usr/bin/env bash
# vu-verify: Pruefung des Backup-Repositorys, nur lesend.
#
#   vu-verify.sh quick     Struktur (Index, Snapshots, Baeume)
#   vu-verify.sh sample    Struktur + 5 % der Daten-Packs herunterladen und pruefen
#   vu-verify.sh full      Struktur + alle Daten (monatlich; laedt das ganze Repository)
#
# Exit 0 in Ordnung, 1 Fehler gefunden, 2 Ziel nicht erreichbar.
set -uo pipefail
VU_BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$VU_BACKUP_ROOT/lib/common.sh"
level="${1:-quick}"
require_env RESTIC_REPOSITORY RESTIC_PASSWORD || exit 2
restic cat config >/dev/null 2> >(redact >&2) || { log "Ziel nicht erreichbar oder Passwort falsch"; exit 2; }
case "$level" in
  quick) args=() ;;
  sample) args=(--read-data-subset=5%) ;;
  full) args=(--read-data) ;;
  *) die "Stufe quick|sample|full" ;;
esac
log "restic check ${args[*]:-}"
if restic check "${args[@]}" 2>&1 | redact; then
  log "Repository in Ordnung"
  restic snapshots --compact --host "$VU_HOST" 2>/dev/null | redact
  exit 0
fi
log "Pruefung meldet Fehler. Keine Wartung (forget/prune) ausfuehren, bevor die Ursache geklaert ist."
exit 1
