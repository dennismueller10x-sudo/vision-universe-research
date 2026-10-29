# shellcheck shell=bash
# Quelle: Git-Repositories als vollstaendiger Mirror (alle Branches, Tags, refs/pull/*).
#
# VU_GIT_REPOS   Leerzeichen-getrennt, Form name=https://github.com/owner/repo.git
# VU_GIT_MODE    incremental (Standard): letzten Mirror aus restic zuruecklesen, dann
#                nur neue Objekte holen. Die Pack-Dateien bleiben byte-gleich, restic
#                laedt nur die neuen Packs hoch.
#                fresh: frischer Klon. Einfacher, aber jeder serverseitige Repack bei
#                GitHub erzeugt einen vollstaendig neuen Upload.
# VU_GITHUB_TOKEN  optional (privates Repo); nur Leserecht. Wird per Umgebung an git
#                gegeben und nie in .git/config geschrieben.

git_auth_env() {
  # Kopfzeile nur fuer github.com und nur im Prozess-Environment, nicht in argv/config.
  if [ -n "${VU_GITHUB_TOKEN:-}" ]; then
    local basic
    basic=$(printf 'x-access-token:%s' "$VU_GITHUB_TOKEN" | base64 -w0)
    export GIT_CONFIG_COUNT=1
    export GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
    export GIT_CONFIG_VALUE_0="Authorization: Basic $basic"
    VU_SECRET_VARS="$VU_SECRET_VARS GIT_CONFIG_VALUE_0"; export VU_SECRET_VARS
  fi
  export GIT_TERMINAL_PROMPT=0
}

backup_git_one() {
  local name="$1" url="$2"
  local source="git-$name" dir="$VU_WORK/git/$name.git"
  local manifest="$VU_WORK/manifests/$source.json"
  VU_SOURCE="$source"
  mkdir -p "$VU_WORK/git" "$VU_WORK/manifests"
  rm -rf "$dir"

  local previous=""
  if [ "${VU_GIT_MODE:-incremental}" = "incremental" ]; then
    previous=$(latest_snapshot_id "$source")
    if [ -n "$previous" ]; then
      log "Mirror aus Snapshot $previous zuruecklesen"
      if ! retry restic restore "$previous" --target / --include "$dir" 2> >(redact >&2) >/dev/null; then
        log "Zuruecklesen fehlgeschlagen, falle auf frischen Klon zurueck"
        rm -rf "$dir"; previous=""
      fi
    fi
  fi

  if [ -d "$dir" ]; then
    git -C "$dir" remote set-url origin "$url"
    retry git -C "$dir" fetch --quiet --prune --no-auto-gc origin '+refs/*:refs/*' 2> >(redact >&2) \
      || { record "$source" failed "git fetch fehlgeschlagen"; return 1; }
  else
    retry git clone --quiet --mirror "$url" "$dir" 2> >(redact >&2) \
      || { record "$source" failed "git clone fehlgeschlagen"; return 1; }
  fi
  git -C "$dir" config gc.auto 0
  git -C "$dir" config fetch.writeCommitGraph false

  if ! git -C "$dir" fsck --connectivity-only --no-progress >/dev/null 2> >(redact >&2); then
    record "$source" failed "git fsck meldet fehlende Objekte"; return 1
  fi

  # Vollstaendigkeit: lokale Refs gegen den Server.
  local remote_refs local_refs
  remote_refs=$(git ls-remote "$url" 2>/dev/null | awk '$2 != "HEAD" && $2 !~ /\^\{\}$/' | wc -l || true)
  local_refs=$(git -C "$dir" for-each-ref | wc -l)
  git -C "$dir" for-each-ref --format='%(objectname) %(refname)' > "$VU_WORK/manifests/$source.refs"
  python3 "$VU_BACKUP_ROOT/lib/manifest.py" git "$dir" "$remote_refs" "$local_refs" > "$manifest"

  local drift summary
  drift=$(compare_with_previous "$source" "$manifest")
  summary=$(restic_backup_source "$source" "$dir" "$manifest" "$VU_WORK/manifests/$source.refs") \
    || { record "$source" failed "restic backup fehlgeschlagen"; return 1; }

  local status=ok msg="Mirror gesichert"
  if [ "$(drift_has_findings "$drift")" = yes ]; then status=warn; msg="Quelle deutlich geschrumpft, bitte pruefen"; fi
  if [ "$remote_refs" -gt 0 ] && [ "$local_refs" -lt "$remote_refs" ]; then
    status=warn; msg="lokal $local_refs Refs, Server $remote_refs (Push waehrend der Sicherung?)"
  fi
  record "$source" "$status" "$msg" "$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); s=json.loads(sys.argv[2]); print(json.dumps({"summary": s, "manifest": m, "incrementalFrom": sys.argv[3] or None, "drift": json.loads(sys.argv[4])}))' "$manifest" "$summary" "$previous" "$drift")"
}

backup_git() {
  git_auth_env
  local rc=0 entry
  for entry in ${VU_GIT_REPOS:-}; do
    backup_git_one "${entry%%=*}" "${entry#*=}" || rc=1
  done
  return "$rc"
}
