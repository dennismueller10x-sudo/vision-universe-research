#!/usr/bin/env bash
# vu-backup: ein Sicherungslauf ueber alle freigegebenen Quellen.
#
#   vu-backup.sh [--tier2] [--only quelle,quelle] [--dry-run]
#   vu-backup.sh --init        legt das restic-Repository an (verweigert, wenn es existiert)
#
# Quellen: git, github-meta, gh-artifacts, r2, cf-kv, cf-config, brevo, supabase
# Konfiguration ausschliesslich ueber Umgebungsvariablen (siehe config/backup.env.example).
#
# Ablauf:
#  1. Vorpruefung: Werkzeuge, Ziel erreichbar, Repository-Passwort korrekt.
#     Schlaegt sie fehl, wird nichts gelesen und nichts geschrieben (Exit 2).
#  2. Jede Quelle einzeln: lesen, Manifest, Vergleich mit dem letzten Stand,
#     verschluesselt hochladen (restic). Fehler einer Quelle stoppen die anderen nicht.
#  3. restic check (Struktur) und Stichprobe der Daten (VU_CHECK_SUBSET, Standard 2%).
#  4. Statusbericht (Markdown + JSON), optional Benachrichtigung.
#
# Exit: 0 alles ok · 1 mindestens eine Quelle fehlgeschlagen oder Pruefung rot ·
#       2 Vorpruefung fehlgeschlagen (nichts gesichert)
set -uo pipefail
VU_BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/common.sh
source "$VU_BACKUP_ROOT/lib/common.sh"
for f in "$VU_BACKUP_ROOT"/sources/*.sh; do source "$f"; done

VU_TIER2=false ONLY="" DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --tier2) VU_TIER2=true ;;
    --only) ONLY="$2"; shift ;;
    --dry-run) DRY_RUN=true ;;
    --init)
      require_env RESTIC_REPOSITORY RESTIC_PASSWORD || exit 2
      if restic cat config >/dev/null 2>&1; then log "Repository existiert bereits, nichts geaendert"; exit 0; fi
      restic init 2>&1 | redact; exit "${PIPESTATUS[0]}" ;;
    *) die "unbekannte Option $1" ;;
  esac
  shift
done
export VU_TIER2

ALL_SOURCES="git github-meta gh-artifacts r2 cf-kv cf-config brevo supabase"
SOURCES="${VU_SOURCES:-$ALL_SOURCES}"
[ -n "$ONLY" ] && SOURCES="${ONLY//,/ }"

umask 077
export VU_RUN_TAG="${VU_RUN_TAG:-$(date -u +%Y%m%dT%H%MZ)}"
rm -rf "$VU_STATUS_DIR"; mkdir -p "$VU_WORK" "$VU_STATUS_DIR"
START=$(date +%s)

# ---- 1. Vorpruefung
for tool in restic git python3; do command -v "$tool" >/dev/null || die "$tool fehlt"; done
case " $SOURCES " in *" r2 "*) command -v rclone >/dev/null || die "rclone fehlt" ;; esac
require_env RESTIC_REPOSITORY RESTIC_PASSWORD || exit 2
if ! restic cat config >/dev/null 2> >(redact >&2); then
  record preflight failed "Backup-Ziel nicht erreichbar oder Passwort falsch"
  python3 "$VU_BACKUP_ROOT/bin/vu-status.py" "$VU_STATUS_DIR" --title "Sicherung NICHT gestartet"
  exit 2
fi
# Verwaiste Sperren eines abgebrochenen Laufs entfernen (restic entfernt nur Sperren,
# deren Prozess nicht mehr laeuft oder die aelter als 30 Minuten sind).
restic unlock >/dev/null 2>&1 || true
log "Ziel erreichbar, Quellen: $SOURCES (Stufe 2: $VU_TIER2)"
if [ "$DRY_RUN" = true ]; then
  record preflight ok "Trockenlauf: Ziel und Zugangsdaten geprueft, nichts gesichert"
  python3 "$VU_BACKUP_ROOT/bin/vu-status.py" "$VU_STATUS_DIR" --title "Trockenlauf"
  exit 0
fi
record preflight ok "Ziel erreichbar"

# ---- 2. Quellen
rc=0
for src in $SOURCES; do
  case "$src" in
    git) backup_git ;;
    github-meta) backup_github_meta ;;
    gh-artifacts) backup_gh_artifacts ;;
    r2) backup_r2 ;;
    cf-kv) backup_cf_kv ;;
    cf-config) backup_cf_config ;;
    brevo) backup_brevo ;;
    supabase) backup_supabase ;;
    *) record "$src" failed "unbekannte Quelle" ; false ;;
  esac || rc=1
  VU_SOURCE=main
done

# Werkzeuge mitsichern: Wiederherstellung soll ohne GitHub moeglich sein.
VU_SOURCE=tooling
if summary=$(restic_backup_source tooling "$VU_BACKUP_ROOT"); then
  record tooling ok "Backup-Werkzeuge und Anleitungen mitgesichert" "{\"summary\": $summary}"
else
  record tooling warn "Werkzeuge nicht mitgesichert"
fi
VU_SOURCE=main

# ---- 3. Pruefung des Repositorys (liest nur)
if restic check --read-data-subset="${VU_CHECK_SUBSET:-2%}" >/dev/null 2> >(redact >&2); then
  record check ok "Repository-Struktur und Stichprobe ${VU_CHECK_SUBSET:-2%} in Ordnung"
else
  record check failed "restic check meldet Fehler, bitte vu-verify.sh full ausfuehren"; rc=1
fi

# Alter der letzten erfolgreichen Sicherung je Quelle (aus dem Repository, nicht aus diesem Lauf)
restic snapshots --json --host "$VU_HOST" > "$VU_STATUS_DIR/.snapshots.json" 2>/dev/null || true

# ---- 4. Bericht
python3 "$VU_BACKUP_ROOT/bin/vu-status.py" "$VU_STATUS_DIR" --title "Sicherung $VU_RUN_TAG" --duration $(( $(date +%s) - START ))
if [ -n "${VU_HEALTHCHECK_URL:-}" ]; then
  # Totmannschalter: Erfolg -> URL, Fehler -> URL/fail. Inhalt: nur die Kurzzeile ohne Details.
  suffix=""; [ "$rc" -ne 0 ] && suffix="/fail"
  head -c 2000 "$VU_STATUS_DIR/summary.txt" | curl -fsS -m 20 --retry 3 --data-binary @- "${VU_HEALTHCHECK_URL}${suffix}" >/dev/null 2>&1 \
    || log "Benachrichtigung nicht zustellbar"
fi
exit "$rc"
