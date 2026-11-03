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

# SIEBTENS (Lauf 41666053466, 03.11.2026): ZEITLIMITS FUER NETZWERKBEFEHLE.
# Der Chartbild-Neubau (v3) lief 76 Minuten, der Push wurde abgewiesen, und der
# anschliessende `git fetch` hing 61 Minuten bis "early EOF" (GitHub-Uebertragung
# abgerissen). Ohne Zeitlimit blockiert ein einziger haengender Befehl den ganzen
# Lauf, und der fertige Neubau ging verloren. Jetzt hat jeder fetch und push ein
# Zeitlimit, und ein abgebrochener oder fehlgeschlagener fetch wird begrenzt und
# mit Wartezeit wiederholt. Ein abgewiesener Push (Wettlauf) bleibt das, was er
# war: Rebase und neuer Versuch (Schleife unten). Standardwerte lassen normale
# Laeufe unberuehrt (ein fetch dauert Sekunden, ein Push mit tausenden Dateien
# unter einer Minute); sie sind per Umgebung einstellbar.
#   PUSH_FETCH_TIMEOUT   Sekunden je fetch-Versuch          (Standard 300)
#   PUSH_PUSH_TIMEOUT    Sekunden je push-Versuch           (Standard 600)
#   PUSH_FETCH_TRIES     Versuche je fetch                  (Standard 3)
FETCH_TIMEOUT="${PUSH_FETCH_TIMEOUT:-300}"
PUSH_TIMEOUT="${PUSH_PUSH_TIMEOUT:-600}"
FETCH_TRIES="${PUSH_FETCH_TRIES:-3}"
for wert in "$FETCH_TIMEOUT" "$PUSH_TIMEOUT" "$FETCH_TRIES"; do
  [[ "$wert" =~ ^[1-9][0-9]*$ ]] || { echo "Ungueltiger Zeitlimit- oder Versuchswert: '$wert'" >&2; exit 2; }
done

# Fuehrt einen Befehl mit Zeitlimit aus (Exit 124 = Zeitlimit; danach hartes Ende nach 10 s).
# Ohne `timeout` (z. B. macOS ohne coreutils) laeuft der Befehl wie bisher, mit Warnung.
mit_zeitlimit() {
  local sek="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout --kill-after=10 "$sek" "$@"
  else
    echo "Hinweis: 'timeout' fehlt, kein Zeitlimit fuer: $*" >&2
    "$@"
  fi
}

# Holt den Branch begrenzt und mit Wiederholung (Zeitlimit oder Uebertragungsfehler).
holen() {
  local n rc
  for ((n = 1; n <= FETCH_TRIES; n++)); do
    rc=0
    mit_zeitlimit "$FETCH_TIMEOUT" git fetch origin "$BRANCH" || rc=$?
    if [ "$rc" -eq 0 ]; then return 0; fi
    if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
      echo "fetch nach ${FETCH_TIMEOUT}s abgebrochen (Zeitlimit, Versuch ${n}/${FETCH_TRIES})." >&2
    else
      echo "fetch fehlgeschlagen (Exit ${rc}, Versuch ${n}/${FETCH_TRIES})." >&2
    fi
    if [ "$n" -lt "$FETCH_TRIES" ]; then sleep $((5 * n)); fi
  done
  return 1
}

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
#
# FUENFTENS (Lauf 37083168221, 03.10.2026): der Universumslauf nach
# Schluss hatte 6.876 Anfragen gestellt und 5.237 Tagesverlaeufe
# geschrieben - und verwarf alles an einem Konflikt in
# intraday/index.json. Den hatte kein zweiter Datenlauf erzeugt, sondern
# ein Feature-PR (#366), der die erzeugte Datei mit nach main brachte. Das
# Verzeichnis (und status/Ledger daneben) wird in JEDEM Lauf aus den
# Sitzungsordnern neu gebaut; der eigene Stand ist richtig, und der
# naechste Takt heilt jede Luecke. Die Sitzungsordner selbst (die
# Kursverlaeufe) stehen weiterhin NICHT unter Erzeugerhoheit.
ERZEUGT=(
  "quant/data/market/capabilities/"
  "quant/data/market/freshness/"
  "quant/data/product/capabilities-v1.json"
  "quant/data/product/capabilities-summary-v1.json"
  "quant/data/market/intraday/index.json"
  "quant/data/market/intraday/status.json"
  "quant/data/market/intraday/pacemaker-ledger.json"
)

# SECHSTENS (Laeufe 37085599297, 37120824516, 38063088760, Okt. 2026):
# der Marktdaten-Refresh verwarf nach 70 Minuten Abruf und gruenen Gates
# dreimal alles an Konflikten in Dateien, deren eingetragener Erzeuger er
# selbst ist (core/registry/domains.json: discover/data, quant/data/technical,
# Faktoren, Kursreihen) - mitgebracht von Feature-PRs oder einem parallelen
# Handlauf. Ein Aufrufer darf deshalb SEINE Erzeugerpfade nennen:
#
#   PUSH_OWNED_PATHS="discover/data/ quant/data/technical/ !discover/data/europe/"
#
# Praefixe, durch Leerraum getrennt; "!" schliesst einen Unterpfad aus.
# Diese Pfade loest NUR dieser Aufruf nach eigenem Stand auf; die Liste
# oben bleibt fuer alle anderen Aufrufer unveraendert. Welcher Workflow
# welchen Pfad nennen darf, prueft quant/tests/push-with-retry.test.mjs
# gegen das Erzeugerregister.
read -r -a EIGENE <<< "${PUSH_OWNED_PATHS:-}"

eigener_stand() {
  local datei="$1"
  local p
  for p in "${ERZEUGT[@]}"; do
    case "$datei" in "$p"*) return 0 ;; esac
  done
  for p in "${EIGENE[@]}"; do
    case "$p" in "!"*) case "$datei" in "${p#!}"*) return 1 ;; esac ;; esac
  done
  for p in "${EIGENE[@]}"; do
    case "$p" in "!"*) continue ;; esac
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
      # Fehlt Stufe 3, hat der eigene Lauf die Datei geloescht
      # (modify/delete, Lauf 38063088760): dann gilt die Loeschung.
      if git ls-files -u -- "$datei" | awk '{print $3}' | grep -qx 3; then
        git checkout --theirs -- "$datei"
        git add -- "$datei"
      else
        git rm -q --cached -- "$datei" >/dev/null 2>&1 || true
        rm -f -- "$datei"
      fi
      echo "  Konflikt nach Erzeugerhoheit aufgeloest (eigener Stand): $datei"
    else
      echo "  Konflikt ausserhalb erzeugter Artefakte: $datei" >&2
      offen=1
    fi
  done < <(git diff --name-only --diff-filter=U)
  return $offen
}

rebase_laeuft() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

# VIERTENS (Plattform-Audit 03.10.2026): MEHRERE EIGENE COMMITS.
# Der Taktgeber committet je Zyklus; ein fehlgeschlagener Push ist dort
# nicht fatal, also koennen mehrere eigene Commits anstehen - und der
# Rebase haelt dann mehrmals. Die erste Fassung loeste nur den ersten
# Halt, rief `rebase --continue` und meldete Erfolg, auch wenn der Rebase
# am naechsten Commit wieder im Konflikt stand (die Funktion laeuft unter
# `|| exit 1`, also ohne errexit). Geschoben wurde ein halb rebaster HEAD.
# Jetzt wird JEDER Halt geprueft, bis kein Rebase mehr offen ist, und vor
# dem Push steht fest: kein offener Rebase, keine ungeloesten Pfade.
neu_aufsetzen() {
  holen || return 1
  # --autostash: die Regressionssuite laesst Dateien mit neuem
  # Zeitstempel ungestaged zurueck; ohne Autostash verweigert git den
  # Rebase und der Lauf verliert seinen Commit (Lauf 34987245529).
  if git rebase --autostash "origin/$BRANCH"; then
    return 0
  fi
  local halte=0
  while rebase_laeuft; do
    halte=$((halte + 1))
    if [ "$halte" -gt 200 ]; then
      echo "Rebase kommt nicht zum Ende. Abbruch." >&2
      git rebase --abort || true
      return 1
    fi
    echo "Rebase mit Konflikten (Halt ${halte}) - wird geprueft:"
    if ! konflikte_aufloesen; then
      echo "Konflikt, den kein Skript entscheiden darf. Abbruch." >&2
      git rebase --abort || true
      return 1
    fi
    if ! GIT_EDITOR=true git rebase --continue; then
      # Ein neuer Halt mit Konflikten wird in der naechsten Runde geprueft.
      # Haelt der Rebase OHNE ungeloeste Pfade, ist es kein Konflikt, den
      # dieses Skript versteht.
      if rebase_laeuft && [ -z "$(git diff --name-only --diff-filter=U)" ]; then
        echo "Rebase haelt ohne erkennbaren Konflikt. Abbruch." >&2
        git rebase --abort || true
        return 1
      fi
    fi
  done
  if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
    echo "Ungeloeste Pfade nach dem Rebase. Abbruch." >&2
    return 1
  fi
  return 0
}

for ((i = 1; i <= VERSUCHE; i++)); do
  if mit_zeitlimit "$PUSH_TIMEOUT" git push origin "HEAD:${BRANCH}"; then
    echo "Push erfolgreich (Versuch ${i})."
    exit 0
  fi
  if [ "$i" -eq "$VERSUCHE" ]; then break; fi
  echo "Push abgewiesen (Versuch ${i}/${VERSUCHE}) - neu aufsetzen und in ${WARTE}s erneut versuchen."
  sleep "$WARTE"
  WARTE=$((WARTE * 2))
  neu_aufsetzen || {
    echo "Neu aufsetzen nicht moeglich (fetch oder Rebase). Die Daten dieses Laufs sind NICHT veroeffentlicht." >&2
    exit 1
  }
done

echo "Push nach ${VERSUCHE} Versuchen nicht moeglich. Die Daten dieses Laufs sind NICHT veroeffentlicht." >&2
exit 1
