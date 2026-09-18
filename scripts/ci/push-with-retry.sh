#!/usr/bin/env bash
#
# Ein Datenlauf, der seine Daten verliert, ist kein Datenlauf.
#
# Gesehen am 18.09.2026, Lauf 35351616026: der Intraday-Lauf holte 524
# Titel, rebaste sauber - und wurde beim Push abgewiesen, weil in der
# Sekunde dazwischen ein anderer Commit auf main landete:
#
#   Rebasing (1/1)  Successfully rebased and updated refs/heads/main.
#   ! [remote rejected] main -> main (cannot lock ref 'refs/heads/main':
#     is at d6931ad0 but expected 272a559a)
#
# Fuenf Minuten Abruf waren weg. Beim Marktdaten-Refresh waeren es
# siebzig Minuten und das halbe Tageskontingent des Anbieters.
#
# Die Abhilfe ist keine neue Architektur, sondern die Schleife, die an
# dieser Stelle von Anfang an haette stehen muessen: neu holen, neu
# aufsetzen, noch einmal schieben. Mehrmals, mit wachsendem Abstand.
#
# Aufruf: scripts/ci/push-with-retry.sh <branch> [versuche]
#
# Erwartet einen bereits erstellten Commit. Schlaegt der Rebase selbst
# fehl (echter Konflikt, nicht nur ein Wettlauf), bricht das Skript ab -
# einen Konflikt loest kein Wiederholen.
set -euo pipefail

BRANCH="${1:?Branch fehlt}"
VERSUCHE="${2:-5}"
WARTE=3

for ((i = 1; i <= VERSUCHE; i++)); do
  if git push origin "HEAD:${BRANCH}"; then
    echo "Push erfolgreich (Versuch ${i})."
    exit 0
  fi
  if [ "$i" -eq "$VERSUCHE" ]; then break; fi
  echo "Push abgewiesen (Versuch ${i}/${VERSUCHE}) - neu aufsetzen und in ${WARTE}s erneut versuchen."
  sleep "$WARTE"
  WARTE=$((WARTE * 2))
  git fetch origin "$BRANCH"
  # --autostash: die Regressionssuite laesst Dateien mit neuem
  # Zeitstempel ungestaged zurueck; ohne Autostash verweigert git den
  # Rebase und der Lauf verliert seinen Commit (Lauf 34987245529).
  git pull --rebase --autostash origin "$BRANCH"
done

echo "Push nach ${VERSUCHE} Versuchen nicht moeglich. Die Daten dieses Laufs sind NICHT veroeffentlicht." >&2
exit 1
