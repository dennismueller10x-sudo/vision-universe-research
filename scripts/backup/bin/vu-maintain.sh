#!/usr/bin/env bash
# vu-maintain: Aufbewahrungsregeln anwenden (forget) und optional aufraeumen (prune).
# Getrennt vom Sicherungslauf, manuell, hoechstens einmal pro Woche.
#
#   vu-maintain.sh plan            zeigt, welche Snapshots entfallen wuerden (Standard)
#   vu-maintain.sh apply           forget + prune
#
# Aufbewahrung (Kalenderfenster relativ zum NEUESTEN Snapshot je Quelle; faellt
# eine Sicherung aus, entfaellt dadurch kein alter Stand):
#   --keep-within-daily   14d   je Kalendertag mit Sicherung der letzte Stand, 14 Tage
#   --keep-within-weekly  8w    je Woche der letzte Stand, 8 Wochen
#   --keep-within-monthly 12m   je Monat der letzte Stand, 12 Monate
#   --keep-tag anchor           die geschuetzte Erstsicherung bleibt immer
#   --keep-last 3               mindestens drei Staende je Quelle, auch bei langer Pause
#
# Was "loeschen" hier bedeutet: Der Schreibschluessel kann bei Backblaze nur
# VERBERGEN (hide). Verborgene Versionen entfernt erst die Lifecycle-Regel des Buckets
# nach VU_HIDE_TO_DELETE_DAYS Tagen; Object Lock verhindert das vor Ablauf der Sperre,
# Legal Hold (Erstsicherung) verhindert es dauerhaft. Bis dahin ist jeder verborgene
# Stand mit vu-pit-recover.py wiederherstellbar.
#
# Sicherheitsregel: Vor apply muss vu-verify.sh quick gruen sein. Ist das Repository
# beschaedigt, wird nichts entfernt.
set -uo pipefail
VU_BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$VU_BACKUP_ROOT/lib/common.sh"
mode="${1:-plan}"
require_env RESTIC_REPOSITORY RESTIC_PASSWORD || exit 2

policy=(--host "$VU_HOST" --group-by host,tags
        --keep-within-daily "${VU_KEEP_DAILY:-14d}"
        --keep-within-weekly "${VU_KEEP_WEEKLY:-56d}"
        --keep-within-monthly "${VU_KEEP_MONTHLY:-1y}"
        --keep-last "${VU_KEEP_LAST:-3}"
        --keep-tag anchor)

"$VU_BACKUP_ROOT/bin/vu-verify.sh" quick >/dev/null || { log "Repository nicht in Ordnung, Wartung abgebrochen"; exit 1; }

case "$mode" in
  plan)
    restic forget --dry-run "${policy[@]}" 2>&1 | redact ;;
  apply)
    restic forget "${policy[@]}" 2>&1 | redact || exit 1
    # Nur Packs entfernen, die ganz ungenutzt sind, und kaum umpacken: haelt die Zahl
    # neuer Uploads und damit gesperrter Kopien klein.
    restic prune --max-unused "${VU_PRUNE_MAX_UNUSED:-25%}" 2>&1 | redact || exit 1
    "$VU_BACKUP_ROOT/bin/vu-verify.sh" quick ;;
  *) die "plan|apply" ;;
esac
