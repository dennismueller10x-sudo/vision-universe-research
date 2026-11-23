#!/usr/bin/env bash
# Prueft, ob die Gruppe pages-production frei ist von Dispatch-Laeufen (Recovery, Refresh-Re-Dispatch), bevor eine Sitzung einen PR mergt,
# der pages-release ausloest (Pfade ausserhalb der Ignorierliste in .github/workflows/pages-release.yml). Warum (Steuerung 23.11.2026):
# die Gruppe hat EINEN Wartesteckplatz, ein neuer wartender Lauf verdraengt den wartenden; 05:42:29 UTC verdraengte ein Merge-Push den
# Re-Dispatch von 05:41:50 nach 40 s (Company-Intelligence-Recovery). Ein Lauf mit Ereignis workflow_dispatch, der noch nicht abgeschlossen ist
# (queued, waiting, pending, in_progress), belegt die Gruppe.
# BOERSENFENSTER (Steuerung 23.11.2026): Mo-Fr 13:30 <= UTC < 21:00 liefert ein Merge, der pages-release ausloest, Exit 1 "Boersenfenster"
# (14:24 UTC mergte ein Produkt-PR, der Voll-Release hielt die Gruppe 23 min und liess die Takte 14:25-14:43 ausfallen). Ob ein PR pages-release
# ausloest, entscheidet der push-Pfadfilter aus pages-release.yml (pages-release-pfade.mjs): Doku-, Test- und scripts/ci-Pfade loesen nichts aus.
# Ohne --pr ist der Inhalt unbekannt: im Fenster gilt das als "loest aus". Es gibt keinen Schalter zum Umgehen.
# Aufruf: scripts/ci/pages-frei.sh [--pr <nummer>] [max-minuten-warten, Standard 0]   (braucht gh, node; GH_REPO oder git-Remote)
# Exit 0 = frei (mergen), 1 = belegt oder Boersenfenster (nicht mergen, spaeter wieder fragen), 2 = Fehler (API nicht lesbar: nie als frei werten).
# Nur REST und eine Abfrage je Takt (30 s), wie wait-gate.sh. Testhilfen: PAGES_FREI_SLEEP.
set -uo pipefail
pr=""; if [ "${1:-}" = "--pr" ]; then pr="${2:?PR-Nummer nach --pr}"; shift 2; fi
max="${1:-0}"; SLEEP="${PAGES_FREI_SLEEP:-sleep}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Boersenfenster: Mo-Fr 13:30 <= UTC < 21:00 (muss zu imBoersenfenster() in pages-release-pfade.mjs passen, Test PF-9)
dow="$(date -u +%u)"; hm="$(date -u +%H%M)"
if [ "$dow" -ge 1 ] && [ "$dow" -le 5 ] && [ "$((10#$hm))" -ge 1330 ] && [ "$((10#$hm))" -lt 2100 ]; then
  if [ -z "$pr" ]; then echo "Boersenfenster (Mo-Fr 13:30-21:00 UTC): PR-Nummer fehlt (--pr N), Inhalt unbekannt: kein Merge, der pages-release ausloest" >&2; exit 1; fi
  if ! dateien="$(gh api --paginate "repos/{owner}/{repo}/pulls/$pr/files?per_page=100" --jq '.[]|.filename, (.previous_filename // empty)' 2>/dev/null)"; then echo "pages-frei: Dateiliste von PR $pr nicht lesbar" >&2; exit 2; fi
  [ -n "$dateien" ] || { echo "pages-frei: PR $pr ohne Dateien (nicht lesbar?)" >&2; exit 2; }
  if ! ergebnis="$(printf '%s\n' "$dateien" | node "$HIER/pages-release-pfade.mjs" 2>/dev/null)"; then echo "pages-frei: Pfadfilter nicht lesbar" >&2; exit 2; fi
  if [ "$(printf '%s' "$ergebnis" | head -n1 | cut -d' ' -f1)" = "ja" ]; then
    echo "Boersenfenster (Mo-Fr 13:30-21:00 UTC): PR $pr aendert Pfade, die pages-release ausloesen; nach 21:00 UTC mergen: $(printf '%s' "$ergebnis" | tail -n +2 | head -3 | tr '\n' ' ')" >&2; exit 1
  fi
fi
end=$(( $(date +%s) + max * 60 )); fehler=0
while :; do
  if out="$(gh api "repos/{owner}/{repo}/actions/workflows/pages-release.yml/runs?event=workflow_dispatch&per_page=30" 2>/dev/null)"; then
    fehler=0
    belegt="$(printf '%s' "$out" | jq -r '[.workflow_runs[]|select(.status != "completed")|"\(.id) \(.status) seit \(.created_at)"]|join("; ")' 2>/dev/null)"
    rc=$?
    if [ $rc -eq 0 ]; then
      if [ -z "$belegt" ]; then echo "pages-production frei (kein Dispatch-Lauf offen)"; exit 0; fi
      echo "pages-production belegt durch Dispatch: $belegt" >&2
      [ "$(date +%s)" -ge "$end" ] && exit 1
    else fehler=$((fehler + 1)); fi
  else fehler=$((fehler + 1)); fi
  if [ "$fehler" -ge 3 ]; then echo "pages-frei: API nicht lesbar" >&2; exit 2; fi
  [ "$fehler" -eq 0 ] || echo "pages-frei: Abruf fehlgeschlagen ($fehler)" >&2
  [ "$(date +%s)" -ge "$end" ] && { [ "$fehler" -gt 0 ] && exit 2; exit 1; }
  "$SLEEP" 30
done
