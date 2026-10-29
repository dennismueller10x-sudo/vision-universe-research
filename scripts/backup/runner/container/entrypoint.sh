#!/usr/bin/env bash
# Einstieg im Container. Secrets kommen als Umgebungsvariablen (Secret Manager).
set -uo pipefail
B=/opt/vu-backup/bin
python3 "$B/vu-key-check.py" writer || exit $?
case "${1:-backup}" in
  backup)       exec "$B/vu-backup.sh" ;;
  backup-tier2) exec "$B/vu-backup.sh" --tier2 ;;
  dry-run)      exec "$B/vu-backup.sh" --dry-run ;;
  verify)       exec "$B/vu-verify.sh" "${2:-sample}" ;;
  maintain)     exec "$B/vu-maintain.sh" "${2:-plan}" ;;
  drill)        exec "$B/vu-restore.sh" drill "$VU_WORK/drill" ;;
  *) echo "Aktion: backup|backup-tier2|dry-run|verify|maintain|drill" >&2; exit 2 ;;
esac
