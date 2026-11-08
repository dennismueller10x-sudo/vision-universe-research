#!/usr/bin/env bash
# Legt den Stand des Datenzweigs (core/registry/data-branch.json) in den Arbeitsbaum eines Laufs.
# Plan Neustart §3: Daten liegen im Datenzweig, nicht in main. Ein Erzeuger, der auf seinem
# bisherigen Stand aufbaut (Rotation, Fenster), und jeder Verbraucher, der die Daten liest,
# ruft das nach dem Checkout auf. Gleiche Regeln wie die Pages-Auslieferung
# (scripts/ci/overlay-data-branch.mjs): nur gueltige und nicht aeltere Staende ersetzen main;
# im Arbeitsbaum wird nie geloescht (--mirror false).
#
# Aufruf: scripts/ci/seed-data-branch.sh <id>[,<id>...]   (Datenarten aus data-branch.json)
#         scripts/ci/seed-data-branch.sh alle             (alle ausgelieferten Datenarten; Verbraucher wie DQ)
set -euo pipefail
ONLY="${1:?Datenarten fehlen (id, id1,id2 oder alle)}"
if [ "$ONLY" = "alle" ]; then ONLY="$(node -e 'process.stdout.write(require("./core/registry/data-branch.json").domains.map((d) => d.id).join(","))')"; fi
BRANCH="$(node -e 'process.stdout.write(require("./core/registry/data-branch.json").branch)')"
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
  git fetch --quiet --depth=1 origin "refs/heads/$BRANCH"
  git archive FETCH_HEAD | tar -x -C "$D"
else
  echo "Datenzweig $BRANCH fehlt noch: Arbeitsbaum bleibt beim Stand aus main"
fi
node scripts/ci/overlay-data-branch.mjs --data "$D" --site . --root . --only "$ONLY" --mirror false
