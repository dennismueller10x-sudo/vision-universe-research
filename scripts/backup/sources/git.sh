# shellcheck shell=bash
# Quelle: Git-Repositories als vollstaendiger Mirror (alle Branches, Tags, refs/pull/*).
#
# VU_GIT_REPOS   Leerzeichen-getrennt, Form name=https://github.com/owner/repo.git
# VU_GIT_MODE    bundle (Standard): frischer Klon von GitHub (kostenlos), hochgeladen wird
#                nur ein Git-Bundle mit den Objekten, die seit der letzten Sicherung
#                neu sind; aus dem Backup-Ziel wird nur die kleine Ref-Liste gelesen.
#                Wiederherstellung = alle Bundles der Kette in Reihenfolge + Refs des
#                gewuenschten Stands (vu-restore.sh). Quelle heisst gitb-<name>.
#                incremental: letzten Mirror aus restic zuruecklesen und nachholen.
#                Einfach wiederherzustellen, liest aber je Lauf den ganzen Mirror aus
#                dem Ziel (Egress-Kosten bei B2 ab ~3x gespeicherter Menge je Monat).
#                fresh: frischer Klon als Mirror; jeder serverseitige Repack bei
#                GitHub erzeugt einen neuen Voll-Upload.
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
  if [ "${VU_GIT_MODE:-bundle}" = "incremental" ]; then
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

# Bundle-Kette: je Lauf ein Bundle mit den neuen Objekten.
#   $VU_WORK/gitb/<name>/<run>-full|inc.bundle   nur das NEUE Bundle dieses Laufs
#   $VU_WORK/gitb/<name>/refs.txt                alle Refs dieses Stands (sha refname)
#   $VU_WORK/gitb/<name>/chain.txt               alle Bundles der Kette in Reihenfolge (sha256 datei)
#   $VU_WORK/gitb/<name>/manifest.json
backup_git_bundle_one() {
  local name="$1" url="$2"
  local source="gitb-$name" mirror="$VU_WORK/git/$name.git" dir="$VU_WORK/gitb/$name"
  local manifest="$dir/manifest.json"
  VU_SOURCE="$source"
  rm -rf "$mirror" "$dir"; mkdir -p "$VU_WORK/git" "$dir"

  retry git clone --quiet --mirror "$url" "$mirror" 2> >(redact >&2) \
    || { record "$source" failed "git clone fehlgeschlagen"; return 1; }
  git -C "$mirror" fsck --connectivity-only --no-progress >/dev/null 2>&1 \
    || { record "$source" failed "git fsck meldet fehlende Objekte"; rm -rf "$mirror" "$dir"; return 1; }
  git -C "$mirror" for-each-ref --format='%(objectname) %(refname)' > "$dir/refs.txt"

  local prev full=false
  prev=$(latest_snapshot_id "$source")
  if [ -n "$prev" ] && restic dump "$prev" "$dir/chain.txt" > "$VU_WORK/gitb-$name.prev-chain" 2>/dev/null \
       && restic dump "$prev" "$dir/refs.txt" > "$VU_WORK/gitb-$name.prev-refs" 2>/dev/null \
       && [ -s "$VU_WORK/gitb-$name.prev-chain" ] && [ "${VU_GIT_FULL:-false}" != true ]; then
    cp "$VU_WORK/gitb-$name.prev-chain" "$dir/chain.txt"
  else
    full=true; : > "$dir/chain.txt"
  fi

  local bundle="" kind=inc
  [ "$full" = true ] && kind=full
  bundle="$dir/$VU_RUN_TAG-$kind.bundle"
  if [ "$full" = true ]; then
    git -C "$mirror" bundle create "$bundle" --all 2> >(redact >&2) >/dev/null \
      || { record "$source" failed "Voll-Bundle fehlgeschlagen"; rm -rf "$mirror" "$dir"; return 1; }
  else
    # Ausschliessen, was der letzte Stand schon hatte (nur Objekte, die im frischen Klon noch existieren).
    awk '{print $1}' "$VU_WORK/gitb-$name.prev-refs" | sort -u | while read -r sha; do
      git -C "$mirror" cat-file -e "$sha^{commit}" 2>/dev/null && echo "^$sha"
    done > "$VU_WORK/gitb-$name.exclude"
    if ! git -C "$mirror" bundle create "$bundle" --all --stdin < "$VU_WORK/gitb-$name.exclude" > "$VU_WORK/gitb-$name.bundle.log" 2>&1; then
      if grep -q 'empty bundle' "$VU_WORK/gitb-$name.bundle.log"; then bundle=""   # keine neuen Objekte, nur Refs
      else record "$source" failed "Bundle fehlgeschlagen"; rm -rf "$mirror" "$dir"; return 1; fi
    fi
  fi
  if [ -n "$bundle" ]; then
    git -C "$mirror" bundle verify "$bundle" >/dev/null 2>&1 || { record "$source" failed "Bundle-Pruefung fehlgeschlagen"; rm -rf "$mirror" "$dir"; return 1; }
    # Eindeutiger Name (Zeit + Inhalt): zwei Laeufe in derselben Minute duerfen sich nicht ueberschreiben.
    local sum final
    sum=$(sha256sum "$bundle" | cut -c1-64)
    final="$dir/$(date -u +%Y%m%dT%H%M%SZ)-$kind-${sum:0:12}.bundle"
    mv "$bundle" "$final"; bundle="$final"
    echo "$sum  $(basename "$bundle")" >> "$dir/chain.txt"
  fi

  local remote_refs local_refs
  remote_refs=$(git ls-remote "$url" 2>/dev/null | awk '$2 != "HEAD" && $2 !~ /\^\{\}$/' | wc -l || true)
  local_refs=$(wc -l < "$dir/refs.txt")
  python3 "$VU_BACKUP_ROOT/lib/manifest.py" git "$mirror" "$remote_refs" "$local_refs" > "$manifest"
  python3 - "$manifest" "$kind" "${bundle:+$(stat -c %s "$bundle")}" "$(wc -l < "$dir/chain.txt")" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m.update(mode="bundle", bundleKind=sys.argv[2] if sys.argv[3] else "none",
    bundleBytes=int(sys.argv[3] or 0), chainLength=int(sys.argv[4])); json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
  rm -rf "$mirror"

  local drift summary
  drift=$(compare_with_previous "$source" "$manifest")
  # Tag "chain": jeder Snapshot der Kette wird fuer die Wiederherstellung spaeterer Staende gebraucht
  # und darf von der Aufbewahrungsregel nicht entfernt werden (vu-maintain.sh: --keep-tag chain).
  summary=$(VU_SNAPSHOT_EXTRA_TAGS=chain restic_backup_source "$source" "$dir") || { record "$source" failed "restic backup fehlgeschlagen"; rm -rf "$dir"; return 1; }
  local status=ok msg="Bundle ($kind) gesichert"
  [ -z "$bundle" ] && msg="keine neuen Objekte, Refs gesichert"
  if [ "$(drift_has_findings "$drift")" = yes ]; then status=warn; msg="Quelle deutlich geschrumpft, bitte pruefen"; fi
  if [ "$remote_refs" -gt 0 ] && [ "$local_refs" -lt "$remote_refs" ]; then
    status=warn; msg="lokal $local_refs Refs, Server $remote_refs (Push waehrend der Sicherung?)"
  fi
  record "$source" "$status" "$msg" "$(python3 -c 'import json,sys; print(json.dumps({"summary": json.loads(sys.argv[1]), "manifest": json.load(open(sys.argv[2])), "drift": json.loads(sys.argv[3])}))' "$summary" "$manifest" "$drift")"
  rm -rf "$dir"
}

backup_git() {
  git_auth_env
  local rc=0 entry
  for entry in ${VU_GIT_REPOS:-}; do
    if [ "${VU_GIT_MODE:-bundle}" = bundle ]; then
      backup_git_bundle_one "${entry%%=*}" "${entry#*=}" || rc=1
    else
      backup_git_one "${entry%%=*}" "${entry#*=}" || rc=1
    fi
  done
  return "$rc"
}
