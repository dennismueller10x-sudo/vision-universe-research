#!/usr/bin/env bash
# Prueft, ob die Gruppe pages-production frei ist von Dispatch-Laeufen (Recovery, Refresh-Re-Dispatch), bevor eine Sitzung einen PR mergt,
# der pages-release ausloest (Pfade ausserhalb der Ignorierliste in .github/workflows/pages-release.yml). Warum (Steuerung 23.11.2026):
# die Gruppe hat EINEN Wartesteckplatz, ein neuer wartender Lauf verdraengt den wartenden; 05:42:29 UTC verdraengte ein Merge-Push den
# Re-Dispatch von 05:41:50 nach 40 s (Company-Intelligence-Recovery). Ein Lauf mit Ereignis workflow_dispatch, der noch nicht abgeschlossen ist
# (queued, waiting, pending, in_progress), belegt die Gruppe.
# Aufruf: scripts/ci/pages-frei.sh [max-minuten-warten, Standard 0]   (braucht gh; GH_REPO oder git-Remote)
# Exit 0 = frei (mergen), 1 = belegt (nicht mergen, spaeter wieder fragen), 2 = Fehler (API nicht lesbar: nie als frei werten).
# Nur REST und eine Abfrage je Takt (30 s), wie wait-gate.sh. Testhilfen: PAGES_FREI_SLEEP.
set -uo pipefail
max="${1:-0}"; SLEEP="${PAGES_FREI_SLEEP:-sleep}"
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
