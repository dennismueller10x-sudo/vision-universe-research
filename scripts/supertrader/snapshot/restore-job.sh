#!/usr/bin/env bash
# Supertrader Research Snapshot — ein unabhaengiger Wiederherstellungsjob (Workflow supertrader-research-snapshot.yml).
# Eingaben nur ueber die Umgebung: MODE, CAPTURED_ID (leer im Restore-Modus), SNAPSHOT_JOB.
set -euo pipefail
SMOKE=""
case "$MODE" in smoke|restore-smoke) SMOKE="--smoke";; esac
# Review F8: der Zeiger gilt nur im Restore-Modus; nach einem Capture muss dessen ID ankommen.
case "$MODE" in
  restore|restore-smoke|restore-holdout|restore-paper-2027) ID="$(node scripts/supertrader/snapshot/pointer.mjs --read --mode "$MODE")";;
  *) ID="${CAPTURED_ID:-}"; if [ -z "$ID" ]; then echo "INPUT_INTEGRITY_FAILURE: SNAPSHOT_NOT_FOUND (keine Capture-ID)" >&2; exit 3; fi;;
esac
# Forward-Fenster (SF6-PAPER-2027 1.2.0): der Restore braucht dasselbe Fensterende wie der Capture (Manifest-Fenster).
if [ "$MODE" = restore-paper-2027 ] && [ -z "${ST_WINDOW_TO:-}" ]; then ST_WINDOW_TO="$(node scripts/supertrader/snapshot/pointer.mjs --read-window-to --mode "$MODE")"; export ST_WINDOW_TO; fi
node scripts/supertrader/snapshot/snapshot.mjs restore --id "$ID" --out "$RUNNER_TEMP/snap" $SMOKE
echo "result_b64=$(base64 -w0 "$RUNNER_TEMP/snap/restore-${SNAPSHOT_JOB}.json")" >> "$GITHUB_OUTPUT"
