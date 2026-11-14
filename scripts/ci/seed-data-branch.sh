#!/usr/bin/env bash
# Legt den Stand des Datenzweigs (core/registry/data-branch.json) in den Arbeitsbaum eines Laufs.
# Plan Neustart §3: Daten liegen im Datenzweig, nicht in main. Ein Erzeuger, der auf seinem
# bisherigen Stand aufbaut (Rotation, Fenster), und jeder Verbraucher, der die Daten liest,
# ruft das nach dem Checkout auf. Gleiche Regeln wie die Pages-Auslieferung
# (scripts/ci/overlay-data-branch.mjs): nur gueltige und nicht aeltere Staende ersetzen main;
# im Arbeitsbaum wird nie geloescht (--mirror false).
#
# Commit-sicher: eingespielte Dateien werden fuer Git unsichtbar (bekannte Dateien skip-worktree,
# neue in .git/info/exclude). Ein Lauf, der danach mit `git add -A` nach main committet, nimmt
# Datenzweig-Daten nie mit; main bleibt eingefroren (Phase BRANCH_ONLY).
#
# Aufruf: scripts/ci/seed-data-branch.sh <id>[,<id>...]   (Datenarten aus data-branch.json)
#         scripts/ci/seed-data-branch.sh alle             (alle Datenarten in Phase BRANCH_ONLY; Verbraucher wie DQ.
#                                                          DUAL_WRITE-Datenarten sind in main aktuell und bleiben, wie sie sind)
set -euo pipefail
ONLY="${1:?Datenarten fehlen (id, id1,id2 oder alle)}"
if [ "$ONLY" = "alle" ]; then ONLY="$(node -e 'process.stdout.write(require("./core/registry/data-branch.json").domains.filter((d) => d.phase === "BRANCH_ONLY" && !d.repositoryOnly).map((d) => d.id).join(","))')"; fi
BRANCH="$(node -e 'process.stdout.write(require("./core/registry/data-branch.json").branch)')"
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
  git fetch --quiet --depth=1 origin "refs/heads/$BRANCH"
  git archive FETCH_HEAD | tar -x -C "$D"
  # Stand des Datenzweigs fuer das Generationenmanifest (scripts/vu2/release-manifest.mjs); liegt im .git-Verzeichnis, nie im Arbeitsbaum.
  git rev-parse FETCH_HEAD > "$(git rev-parse --git-path vu-data-branch.sha)" || true
else
  echo "Datenzweig $BRANCH fehlt noch: Arbeitsbaum bleibt beim Stand aus main"
fi
node scripts/ci/overlay-data-branch.mjs --data "$D" --site . --root . --only "$ONLY" --mirror false --out "$D.bericht.json"
node scripts/ci/seed-hide.mjs "$D.bericht.json"
rm -f "$D.bericht.json"
