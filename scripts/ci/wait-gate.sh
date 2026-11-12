#!/usr/bin/env bash
# Wartet, bis der Sammel-Check ci-gate eines PRs fertig ist. Exit 0 = gruen (jetzt mergen), 1 = rot, 2 = Zeitlimit.
# Aufruf: scripts/ci/wait-gate.sh <pr-nummer> [max-minuten]   (braucht gh; GH_REPO oder git-Remote)
set -uo pipefail
pr="${1:?PR-Nummer}"; max="${2:-90}"
end=$(( $(date +%s) + max * 60 ))
while [ "$(date +%s)" -lt "$end" ]; do
  sha="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)" || { sleep 30; continue; }
  res="$(gh api "repos/{owner}/{repo}/commits/$sha/check-runs?per_page=100" --jq '[.check_runs[]|select(.name=="ci-gate")]|sort_by(.id)|last|(.conclusion // .status // "keiner")')" || { sleep 30; continue; }
  case "$res" in
    success) echo "ci-gate gruen ($sha)"; exit 0 ;;
    failure|cancelled|timed_out) echo "ci-gate $res ($sha)"; exit 1 ;;
  esac
  sleep 30
done
echo "Zeitlimit"; exit 2
