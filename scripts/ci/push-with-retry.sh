#!/usr/bin/env bash
#
# Ein Datenlauf, der seine Daten verliert, ist kein Datenlauf.
#
# ERSTENS: DER WETTLAUF
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
# siebzig Minuten und ein erheblicher Teil des Tageskontingents.
# Abhilfe: neu holen, neu aufsetzen, noch einmal schieben.
#
# ZWEITENS: DER KONFLIKT IN ERZEUGTEN DATEIEN
#
# Gesehen am selben Tag, Lauf 35374148077, nach 68 Minuten Abruf und
# vollstaendig gruener Pruefkette:
#
#   CONFLICT (content): Merge conflict in quant/data/market/capabilities/summary.json
#   CONFLICT (content): Merge conflict in quant/data/market/freshness/health.json
#
# Beide Dateien werden von ZWEI Laeufen geschrieben: dem Intraday-Lauf
# alle fuenf Minuten und dem Marktdaten-Refresh, der siebzig Minuten
# braucht. Ein Zusammenstoss ist damit nicht die Ausnahme, sondern der
# Normalfall - und zeilenweises Zusammenfuehren von erzeugtem JSON
# ergibt ohnehin keinen Sinn.
#
# Aufgeloest wird deshalb nach ERZEUGERHOHEIT: fuer die unten genannten
# erzeugten Artefakte gilt der Stand des eigenen Laufs, denn er ist aus
# dem vollstaendigeren Datenbestand berechnet. Das ist selbstheilend:
# waehrend der Sitzung schreibt der Intraday-Lauf beide Dateien
# spaetestens fuenf Minuten spaeter neu; nach Handelsschluss ist der
# Stand des Refresh ohnehin der massgebliche.
#
# Die Liste ist bewusst kurz und wird nicht "vorsichtshalber" erweitert.
# Jeder Konflikt ausserhalb davon bricht ab - ein echter Konflikt in
# Quellcode oder in Kursdaten ist nichts, was ein Skript entscheiden
# darf.
#
# Aufruf: scripts/ci/push-with-retry.sh <branch> [versuche]
set -euo pipefail

BRANCH="${1:?Branch fehlt}"
VERSUCHE="${2:-5}"
WARTE=3

# Erzeugte Artefakte mit geteilter Schreibhoheit. Pfad-Praefixe.
#
# DRITTENS (Lauf 36078691085, 25.09.2026): Die kompakte Produkt-Projektion
# der Faehigkeiten wird aus capabilities/matrix.json abgeleitet und von
# denselben Laeufen geschrieben (Intraday-Universum, Taktgeber, Refresh).
# Die Matrix loeste das Skript schon nach Erzeugerhoheit auf, die
# Projektion nicht - nach 68 Minuten Abruf und gruenen Gates brach der
# Push ab. Beide Dateien folgen jetzt der Matrix: eigener Stand, damit
# Matrix und Projektion aus demselben Lauf stammen (Gate B prueft genau
# das: "committed projection is reproducible from the existing capability
# matrix"). Genannt sind die zwei Dateien, nicht das ganze Verzeichnis.
ERZEUGT=(
  "quant/data/market/capabilities/"
  "quant/data/market/freshness/"
  "quant/data/product/capabilities-v1.json"
  "quant/data/product/capabilities-summary-v1.json"
)

eigener_stand() {
  local datei="$1"
  local p
  for p in "${ERZEUGT[@]}"; do
    case "$datei" in "$p"*) return 0 ;; esac
  done
  return 1
}

# Loest Konflikte NUR in den genannten erzeugten Artefakten, und zwar
# zugunsten des eigenen Laufs. Gibt 1 zurueck, wenn irgendetwas anderes
# im Konflikt steht - dann wird abgebrochen.
konflikte_aufloesen() {
  local datei offen=0
  while IFS= read -r datei; do
    [ -n "$datei" ] || continue
    if eigener_stand "$datei"; then
      # Im Rebase ist --theirs der Commit, der gerade aufgespielt wird,
      # also der eigene. Die Benennung ist verwirrend, die Wirkung nicht.
      git checkout --theirs -- "$datei"
      git add -- "$datei"
      echo "  Konflikt nach Erzeugerhoheit aufgeloest (eigener Stand): $datei"
    else
      echo "  Konflikt ausserhalb erzeugter Artefakte: $datei" >&2
      offen=1
    fi
  done < <(git diff --name-only --diff-filter=U)
  return $offen
}

neu_aufsetzen() {
  git fetch origin "$BRANCH"
  # --autostash: die Regressionssuite laesst Dateien mit neuem
  # Zeitstempel ungestaged zurueck; ohne Autostash verweigert git den
  # Rebase und der Lauf verliert seinen Commit (Lauf 34987245529).
  if git rebase --autostash "origin/$BRANCH"; then
    return 0
  fi
  echo "Rebase mit Konflikten - wird geprueft:"
  if konflikte_aufloesen; then
    GIT_EDITOR=true git rebase --continue
    return 0
  fi
  echo "Konflikt, den kein Skript entscheiden darf. Abbruch." >&2
  git rebase --abort || true
  return 1
}

for ((i = 1; i <= VERSUCHE; i++)); do
  if git push origin "HEAD:${BRANCH}"; then
    echo "Push erfolgreich (Versuch ${i})."
    exit 0
  fi
  if [ "$i" -eq "$VERSUCHE" ]; then break; fi
  echo "Push abgewiesen (Versuch ${i}/${VERSUCHE}) - neu aufsetzen und in ${WARTE}s erneut versuchen."
  sleep "$WARTE"
  WARTE=$((WARTE * 2))
  neu_aufsetzen || exit 1
done

echo "Push nach ${VERSUCHE} Versuchen nicht moeglich. Die Daten dieses Laufs sind NICHT veroeffentlicht." >&2
exit 1
