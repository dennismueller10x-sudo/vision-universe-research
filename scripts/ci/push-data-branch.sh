#!/usr/bin/env bash
# Schreibt erzeugte Dateien in den Datenzweig (core/registry/data-branch.json), nicht nach main.
# Plan Neustart §3: Daten raus aus main. Pilot News (Phase DUAL_WRITE).
#
# Aufruf: scripts/ci/push-data-branch.sh <branch> <pfad>...
# - Jeder Pfad wird aus dem Arbeitsbaum des Laufs in denselben Pfad des Datenzweigs kopiert.
# - Der Zweig traegt nur Daten (verwaiste Historie, kein Code); fehlt er, wird er angelegt.
# - Schreibhoheit je Pfad liegt beim Erzeuger: bei einem Wettlauf wird neu geholt und der eigene
#   Stand erneut eingesetzt, nie zeilenweise zusammengefuehrt.
set -euo pipefail

BRANCH="${1:?Branch fehlt}"; shift
[ "$#" -gt 0 ] || { echo "keine Pfade" >&2; exit 2; }
case "$BRANCH" in main|master) echo "Datenzweig darf nicht $BRANCH sein" >&2; exit 2;; esac
for p in "$@"; do
  case "$p" in /*|*..*) echo "unzulaessiger Pfad: $p" >&2; exit 2;; esac
  [ -f "$p" ] || { echo "Datei fehlt: $p" >&2; exit 2; }
done

SRC="$(pwd)"
WORK="$(mktemp -d)"
trap 'git -C "$SRC" worktree remove --force "$WORK" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

for versuch in 1 2 3 4 5; do
  git -C "$SRC" worktree remove --force "$WORK" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  if git -C "$SRC" fetch --quiet --depth=1 origin "refs/heads/$BRANCH" 2>/dev/null; then
    git -C "$SRC" worktree add --quiet --detach "$WORK" FETCH_HEAD
  else
    git -C "$SRC" worktree add --quiet --detach "$WORK"
    git -C "$WORK" checkout --quiet --orphan "tmp-data-$$"
    git -C "$WORK" rm -rq --cached . >/dev/null 2>&1 || true
    find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  fi
  for p in "$@"; do mkdir -p "$WORK/$(dirname "$p")"; cp "$SRC/$p" "$WORK/$p"; done
  git -C "$WORK" add -- "$@"
  if git -C "$WORK" diff --cached --quiet; then echo "Datenzweig $BRANCH unveraendert"; exit 0; fi
  git -C "$WORK" -c user.name="${GIT_AUTHOR_NAME:-vision-universe-bot}" -c user.email="${GIT_AUTHOR_EMAIL:-actions@users.noreply.github.com}" \
    commit --quiet -m "Daten: $* (${GITHUB_WORKFLOW:-lokal}, Lauf ${GITHUB_RUN_ID:-0})"
  if git -C "$WORK" push --quiet origin "HEAD:refs/heads/$BRANCH"; then echo "Datenzweig $BRANCH aktualisiert ($versuch. Versuch)"; exit 0; fi
  echo "Push abgewiesen, neuer Versuch ($versuch)" >&2; sleep $((versuch * 3))
done
echo "Datenzweig $BRANCH: Push nach 5 Versuchen gescheitert" >&2
exit 1
