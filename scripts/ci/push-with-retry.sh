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
# Umgebung (optional): PUSH_OWNED_PATHS, PUSH_REGENERATE_PATHS + PUSH_REGENERATE
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

# SIEBTENS (Lauf 41490082062, 02.11.2026): der SEC-Consumer-Montagslauf
# verwarf nach 43 Minuten seine Fundamentaldaten an einem Konflikt in
# discover/data/meta.json. Die Datei schreibt build-discover-data.mjs, und
# den rufen fuenf Workflows auf (Erzeugerregister: market-data-refresh,
# index-membership, long-series, company-names, sec-consumer). Zwei davon
# waren 13 Minuten auseinander gelaufen: "Lange Kursreihen" (17:32 UTC)
# und der Consumer (Start 17:19 UTC statt 07:30 - GitHub verschiebt
# Zeitplaene um Stunden).
#
# Hier ist "eigener Stand" FALSCH: jede Seite hat Eingaben, die die andere
# nicht hat (der eine Lauf neue Wochenreihen, der andere neue
# Fundamentaldaten). Weder der eine noch der andere Stand ist richtig, nur
# ein Neubau aus den zusammengefuehrten Eingaben. Ein Aufrufer, der den
# Erzeuger selbst ausfuehrt, nennt deshalb
#
#   PUSH_REGENERATE_PATHS="discover/data/ !discover/data/europe/"
#   PUSH_REGENERATE="node scripts/discover/build-discover-data.mjs && node scripts/discover/verify-discover-data.mjs"
#
# Ein Konflikt in diesen Pfaden wird nur VORLAEUFIG mit dem Stand von
# origin aufgeloest, damit der Rebase zu Ende kommt. Danach - nach JEDEM
# Neuaufsetzen, auch ohne Konflikt, denn auch dann koennen sich die
# Eingaben geaendert haben - laeuft der Erzeuger auf dem rebasten Baum, und
# sein Ergebnis wird in den eigenen Commit genommen. Scheitert der Neubau
# oder seine Pruefung, wird NICHTS geschoben. Ein vorlaeufiger Stand
# verlaesst den Runner also nie. Welcher Workflow welche Pfade nennen darf,
# prueft quant/tests/push-with-retry.test.mjs gegen das Erzeugerregister.
read -r -a NEU_ERZEUGBAR <<< "${PUSH_REGENERATE_PATHS:-}"
NEUBAU="${PUSH_REGENERATE:-}"
if [ "${#NEU_ERZEUGBAR[@]}" -gt 0 ] && [ -z "$NEUBAU" ]; then
  echo "PUSH_REGENERATE_PATHS ohne PUSH_REGENERATE: kein Erzeuger fuer den Neubau genannt. Abbruch." >&2
  exit 1
fi

neu_erzeugbar() {
  local datei="$1"
  local p
  for p in "${NEU_ERZEUGBAR[@]}"; do
    case "$p" in "!"*) case "$datei" in "${p#!}"*) return 1 ;; esac ;; esac
  done
  for p in "${NEU_ERZEUGBAR[@]}"; do
    case "$p" in "!"*) continue ;; esac
    case "$datei" in "$p"*) return 0 ;; esac
  done
  return 1
}

# Pfadangabe fuer git add: die Praefixe, "!"-Ausnahmen als :(exclude).
neubau_pfadangabe() {
  local p
  for p in "${NEU_ERZEUGBAR[@]}"; do
    case "$p" in "!"*) printf '%s\0' ":(exclude)${p#!}" ;; *) printf '%s\0' "$p" ;; esac
  done
}

# Erzeuger auf dem rebasten Baum ausfuehren und sein Ergebnis in den
# obersten eigenen Commit nehmen. Rueckgabe 1: nichts schieben.
neu_erzeugen() {
  [ -n "$NEUBAU" ] || return 0
  echo "Neubau der erzeugten Pfade (${NEU_ERZEUGBAR[*]}) auf dem neuen Stand: $NEUBAU"
  if ! bash -c "$NEUBAU"; then
    echo "Neubau gescheitert - die Daten dieses Laufs werden NICHT geschoben." >&2
    return 1
  fi
  local pfade=()
  while IFS= read -r -d '' p; do pfade+=("$p"); done < <(neubau_pfadangabe)
  git add -A -- "${pfade[@]}"
  if git diff --cached --quiet; then
    echo "Neubau ergibt denselben Stand."
  else
    git commit -q --amend --no-edit
    echo "Neubau in den eigenen Commit uebernommen."
  fi
  return 0
}

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
    elif neu_erzeugbar "$datei"; then
      # Vorlaeufig: Stand von origin (im Rebase --ours, Stufe 2). Fehlt
      # Stufe 2, hat origin die Datei geloescht. Der Neubau nach dem
      # Rebase ueberschreibt beides; ohne erfolgreichen Neubau kein Push.
      if git ls-files -u -- "$datei" | awk '{print $3}' | grep -qx 2; then
        git checkout --ours -- "$datei"
        git add -- "$datei"
      else
        git rm -q --cached -- "$datei" >/dev/null 2>&1 || true
        rm -f -- "$datei"
      fi
      echo "  Konflikt in erzeugter Datei, wird nach dem Rebase neu gebaut: $datei"
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
  git fetch origin "$BRANCH" || return 1
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
  if git push origin "HEAD:${BRANCH}"; then
    echo "Push erfolgreich (Versuch ${i})."
    exit 0
  fi
  if [ "$i" -eq "$VERSUCHE" ]; then break; fi
  echo "Push abgewiesen (Versuch ${i}/${VERSUCHE}) - neu aufsetzen und in ${WARTE}s erneut versuchen."
  sleep "$WARTE"
  WARTE=$((WARTE * 2))
  neu_aufsetzen || exit 1
  neu_erzeugen || exit 1
done

echo "Push nach ${VERSUCHE} Versuchen nicht moeglich. Die Daten dieses Laufs sind NICHT veroeffentlicht." >&2
exit 1
