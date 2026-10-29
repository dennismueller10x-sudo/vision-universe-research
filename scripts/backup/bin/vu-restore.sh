#!/usr/bin/env bash
# vu-restore: Wiederherstellen aus dem Backup-Repository. Schreibt nie in Produktion,
# ausser ein Unterbefehl bekommt ausdruecklich ein Ziel UND --yes.
#
#   vu-restore.sh list                                  Snapshots je Quelle
#   vu-restore.sh drill <leeres-verzeichnis>            Restore-Probe aller Quellen + Pruefung
#   vu-restore.sh get <quelle> <leeres-verzeichnis> [snapshot]
#                                                       eine Quelle zuruecklesen (Standard: latest)
#   vu-restore.sh git-branch <mirror.git> <branch> <ausgabe.bundle>
#                                                       einzelnen Branch als Bundle (Szenario A)
#   vu-restore.sh git-push <mirror.git> <neue-remote-url> --yes [--with-pull-refs]
#                                                       Mirror in ein NEUES Repository schieben
#   vu-restore.sh r2-upload <dir> <rclone-ziel> --yes [--last muster]
#                                                       Dateien in einen NEUEN Bucket; Dateien,
#                                                       die auf muster passen (Pointer), zuletzt
set -uo pipefail
VU_BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$VU_BACKUP_ROOT/lib/common.sh"
cmd="${1:-}"; shift || true

need_empty_dir() {
  [ -n "${1:-}" ] || die "Zielverzeichnis fehlt"
  mkdir -p "$1"
  [ -z "$(ls -A "$1")" ] || die "Zielverzeichnis $1 ist nicht leer"
}

restore_source() {   # quelle ziel [snapshot]
  local src="$1" target="$2" snap="${3:-}"
  [ -n "$snap" ] || snap=$(latest_snapshot_id "$src")
  [ -n "$snap" ] || { log "keine Sicherung fuer $src"; return 1; }
  restic restore "$snap" --target "$target" --verify 2> >(redact >&2) >/dev/null || return 1
  echo "$snap"
}

verify_restored() {  # quelle wurzel -> Zeile mit Ergebnis
  local src="$1" root="$2" base="$2$VU_WORK"
  case "$src" in
    git-*)
      local name="${src#git-}" dir="$base/git/${src#git-}.git"
      git -C "$dir" fsck --connectivity-only --no-progress >/dev/null 2>&1 || { echo "$src FEHLER fsck"; return 1; }
      local want have
      want=$(sort "$base/manifests/$src.refs" | sha256sum | cut -c1-16)
      have=$(git -C "$dir" for-each-ref --format='%(objectname) %(refname)' | sort | sha256sum | cut -c1-16)
      [ "$want" = "$have" ] || { echo "$src FEHLER Refs weichen vom Manifest ab"; return 1; }
      # Arbeitskopie aus dem Mirror muss sich auschecken lassen
      git clone --quiet "$dir" "$root/.checkout-$name" 2>/dev/null && rm -rf "$root/.checkout-$name" \
        || { echo "$src FEHLER Klon aus Mirror"; return 1; }
      echo "$src OK $(wc -l < "$base/manifests/$src.refs") Refs, fsck und Klon in Ordnung" ;;
    r2-*)
      local name="${src#r2-}"
      (cd "$base/r2/$name" && sha256sum --quiet -c "../$name.sha256") >/dev/null 2>&1 \
        || { echo "$src FEHLER Pruefsummen"; return 1; }
      echo "$src OK $(wc -l < "$base/r2/$name.sha256") Dateien, Pruefsummen stimmen" ;;
    supabase-*)
      local dump="$base/db/db.dump"
      if command -v pg_restore >/dev/null; then
        pg_restore --list "$dump" >/dev/null 2>&1 || { echo "$src FEHLER Dump unlesbar"; return 1; }
        echo "$src OK Dump lesbar ($(pg_restore --list "$dump" | grep -c ' TABLE DATA ') Tabellen mit Daten)"
      else
        head -c 5 "$dump" | grep -q PGDMP || { echo "$src FEHLER kein pg_dump-Format"; return 1; }
        echo "$src OK Dump-Kopf gueltig (pg_restore fehlt fuer Volltest)"
      fi ;;
    *)
      local f bad=0
      while IFS= read -r -d '' f; do
        case "$f" in *.json) python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>/dev/null || bad=$((bad+1)) ;;
                     *.jsonl) python3 -c 'import json,sys; [json.loads(l) for l in open(sys.argv[1])]' "$f" 2>/dev/null || bad=$((bad+1)) ;; esac
      done < <(find "$root" -type f \( -name '*.json' -o -name '*.jsonl' \) -print0)
      [ "$bad" -eq 0 ] || { echo "$src FEHLER $bad unlesbare JSON-Dateien"; return 1; }
      echo "$src OK JSON lesbar" ;;
  esac
}

case "$cmd" in
  list)
    restic snapshots --host "$VU_HOST" --compact 2>&1 | redact ;;
  get)
    src="${1:?quelle}"; target="${2:?ziel}"; need_empty_dir "$target"
    snap=$(restore_source "$src" "$target" "${3:-}") || die "Wiederherstellung von $src fehlgeschlagen"
    log "$src aus Snapshot $snap nach $target$VU_WORK zurueckgelesen"
    verify_restored "$src" "$target" ;;
  drill)
    target="${1:?ziel}"; need_empty_dir "$target"
    report="$target/drill-report.txt"; rc=0
    sources=$(restic snapshots --json --host "$VU_HOST" | python3 -c 'import json,sys; print(" ".join(sorted({t[4:] for s in json.load(sys.stdin) or [] for t in s.get("tags",[]) if t.startswith("src:")})))')
    for src in $sources; do
      d="$target/$src"; mkdir -p "$d"
      if snap=$(restore_source "$src" "$d"); then
        line=$(verify_restored "$src" "$d") || rc=1
        echo "$line (Snapshot $snap)" | tee -a "$report"
      else
        echo "$src FEHLER Zuruecklesen" | tee -a "$report"; rc=1
      fi
    done
    [ -n "$sources" ] || { echo "keine Snapshots" | tee -a "$report"; rc=1; }
    log "Bericht: $report"; exit "$rc" ;;
  git-branch)
    mirror="${1:?mirror}"; branch="${2:?branch}"; out="${3:?ausgabe}"
    git -C "$mirror" bundle create "$out" "refs/heads/$branch" 2>&1 | redact
    git -C "$mirror" bundle verify "$out" >/dev/null 2>&1 && log "Bundle $out geprueft. Einspielen: git fetch $out refs/heads/$branch:refs/heads/$branch" ;;
  git-push)
    mirror="${1:?mirror}"; url="${2:?neue-remote-url}"
    [ "${3:-}" = --yes ] || die "git-push schreibt in ein Remote. Erst pruefen, dann mit --yes wiederholen"
    refspecs=('+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*')
    [ "${4:-}" = --with-pull-refs ] && refspecs+=('+refs/pull/*/head:refs/archive/pull/*')
    git_auth_env
    git -C "$mirror" push --quiet "$url" "${refspecs[@]}" 2>&1 | redact ;;
  r2-upload)
    dir="${1:?verzeichnis}"; dest="${2:?rclone-ziel}"
    [ "${3:-}" = --yes ] || die "r2-upload schreibt in einen Bucket. Erst pruefen, dann mit --yes wiederholen"
    last="${5:-index.json}"
    rclone copy "$dir" "$dest" --exclude "**/$last" --checksum 2>&1 | redact || exit 1
    rclone copy "$dir" "$dest" --include "**/$last" --checksum 2>&1 | redact ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
