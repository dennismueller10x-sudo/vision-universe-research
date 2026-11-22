#!/usr/bin/env bash
# Wartet, bis der Sammel-Check ci-gate eines PRs fertig ist. Exit 0 = gruen (jetzt mergen), 1 = rot, 2 = Zeitlimit.
# Aufruf: scripts/ci/wait-gate.sh <pr-nummer> [max-minuten] [erwarteter-head-sha]   (braucht gh; GH_REPO oder git-Remote)
# Ohne dritten Parameter gilt der Head des PRs zum Zeitpunkt der Abfrage; nach einem Push den sha angeben (git rev-parse HEAD):
# die PR-API liefert kurz nach dem Push noch den alten Head, dessen gruener ci-gate sonst als Ergebnis zaehlt (22.11.2026, #2228).
#
# Sparsam mit dem GitHub-Limit (5.000/h, von allen Sitzungen geteilt; 22.11.2026):
#   - nur REST (kein `gh pr view`: GraphQL ist in Sitzungen gesperrt, die alte Schleife schlief dann endlos);
#   - bedingte Abfragen (ETag/If-None-Match): ein 304 zaehlt nicht gegen das Limit;
#   - nur der Check ci-gate (check_name=ci-gate, filter=latest, per_page=1), nicht alle Check-Runs;
#   - Takt waechst von 30 s auf 120 s, solange sich nichts aendert; ein neuer Stand setzt ihn zurueck;
#   - unter 300 verbleibenden Aufrufen oder bei 403/429 wartet sie bis zum Reset bzw. Retry-After (hoechstens 10 min je Pause).
# Testhilfen: WAIT_GATE_SLEEP (Sleep-Programm), WAIT_GATE_MIN/WAIT_GATE_MAX (Takt in s).
set -uo pipefail
pr="${1:?PR-Nummer}"; max="${2:-90}"; want="${3:-}"
SLEEP="${WAIT_GATE_SLEEP:-sleep}"; MIN="${WAIT_GATE_MIN:-30}"; MAXI="${WAIT_GATE_MAX:-120}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
end=$(( $(date +%s) + ${WAIT_GATE_MAX_S:-$(( max * 60 ))} ))

# get <schluessel> <pfad> -> $tmp/<schluessel>.body; Rueckgabe 0 neu, 3 unveraendert (304), 4 Limit, 5 sonstiger Fehler
get() {
  local key="$1" path="$2" etag="" args=()
  [ -f "$tmp/$key.etag" ] && etag="$(cat "$tmp/$key.etag")"
  [ -n "$etag" ] && args=(-H "If-None-Match: $etag")
  gh api -i "$path" "${args[@]}" >"$tmp/$key.raw" 2>"$tmp/$key.err"
  local status; status="$(head -n1 "$tmp/$key.raw" | tr -d '\r' | awk '{print $2}')"
  [ -z "$status" ] && status="$(grep -o 'HTTP [0-9]*' "$tmp/$key.err" | head -n1 | awk '{print $2}')"
  hdr() { tr -d '\r' <"$tmp/$key.raw" | awk -v k="$1" 'BEGIN{IGNORECASE=1} tolower($1)==tolower(k":"){print $2; exit}'; }
  remaining="$(hdr x-ratelimit-remaining)"; reset="$(hdr x-ratelimit-reset)"; retry="$(hdr retry-after)"
  case "$status" in
    200) tr -d '\r' <"$tmp/$key.raw" | awk 'tolower($1)=="etag:"{sub(/^[^:]*: */,""); print; exit}' >"$tmp/$key.etag"
         tr -d '\r' <"$tmp/$key.raw" | awk 'f{print} /^$/{f=1}' >"$tmp/$key.body"; return 0 ;;
    304) return 3 ;;
    403|429) if [ "${remaining:-1}" = "0" ] || [ -n "${retry:-}" ] || [ "$status" = "429" ]; then return 4; fi; return 5 ;;
    *) return 5 ;;
  esac
}

pause_for_limit() {
  local now wait; now="$(date +%s)"; wait=60
  if [ -n "${retry:-}" ]; then wait="$retry"
  elif [ -n "${reset:-}" ] && [ "$reset" -gt "$now" ] 2>/dev/null; then wait=$(( reset - now + 2 )); fi
  [ "$wait" -gt 600 ] && wait=600
  echo "GitHub-Limit: warte ${wait}s" >&2; "$SLEEP" "$wait"
}

interval="$MIN"; last=""; fehler=0
while [ "$(date +%s)" -lt "$end" ]; do
  get pr "repos/{owner}/{repo}/pulls/$pr"; rc=$?
  if [ $rc -eq 4 ]; then pause_for_limit; continue; fi
  if [ $rc -eq 0 ]; then sha="$(jq -r '.head.sha' "$tmp/pr.body" 2>/dev/null)"; fi
  if [ -n "$want" ] && [ "${sha:-}" != "$want" ]; then "$SLEEP" "$MIN"; continue; fi
  if [ $rc -ge 5 ] || [ -z "${sha:-}" ]; then
    fehler=$((fehler + 1)); [ "$fehler" -ge 8 ] && { echo "PR $pr nicht lesbar: $(head -c 200 "$tmp/pr.err")" >&2; exit 2; }
    "$SLEEP" "$interval"; continue
  fi
  get gate "repos/{owner}/{repo}/commits/$sha/check-runs?check_name=ci-gate&filter=latest&per_page=1"; rc=$?
  if [ $rc -eq 4 ]; then pause_for_limit; continue; fi
  [ $rc -ge 5 ] && { fehler=$((fehler + 1)); [ "$fehler" -ge 8 ] && { echo "ci-gate nicht lesbar: $(head -c 200 "$tmp/gate.err")" >&2; exit 2; }; "$SLEEP" "$interval"; continue; }
  fehler=0
  if [ $rc -eq 0 ]; then
    res="$(jq -r '[.check_runs[]]|sort_by(.id)|last|(.conclusion // .status // "keiner")' "$tmp/gate.body" 2>/dev/null)"
    [ -z "$res" ] || [ "$res" = "null" ] && res="keiner"
    case "$res" in
      success) echo "ci-gate gruen ($sha)"; exit 0 ;;
      failure|cancelled|timed_out) echo "ci-gate $res ($sha)"; exit 1 ;;
    esac
    # Ein neuer Stand (anderer Commit oder anderer Zustand) setzt den Takt zurueck.
    [ "$sha:$res" != "$last" ] && interval="$MIN"; last="$sha:$res"
  elif [ $rc -eq 3 ]; then
    interval=$(( interval * 3 / 2 )); [ "$interval" -gt "$MAXI" ] && interval="$MAXI"
  fi
  # wenig Limit uebrig: lieber langsamer als alle Sitzungen blockieren
  if [ -n "${remaining:-}" ] && [ "$remaining" -lt 300 ] 2>/dev/null; then pause_for_limit; continue; fi
  "$SLEEP" "$interval"
done
echo "Zeitlimit"; exit 2
