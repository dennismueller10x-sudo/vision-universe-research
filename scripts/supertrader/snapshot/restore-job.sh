#!/usr/bin/env bash
# Supertrader Research Snapshot — ein unabhaengiger Wiederherstellungsjob (Workflow supertrader-research-snapshot.yml).
# Eingaben nur ueber die Umgebung: MODE, CAPTURED_ID (leer im Restore-Modus), SNAPSHOT_JOB.
set -euo pipefail
SMOKE=""
case "$MODE" in smoke|restore-smoke) SMOKE="--smoke";; esac
ID="${CAPTURED_ID:-}"
if [ -z "$ID" ]; then ID="$(node scripts/supertrader/snapshot/pointer.mjs --read --mode "$MODE")"; fi
node scripts/supertrader/snapshot/snapshot.mjs restore --id "$ID" --out "$RUNNER_TEMP/snap" $SMOKE
echo "result_b64=$(base64 -w0 "$RUNNER_TEMP/snap/restore-${SNAPSHOT_JOB}.json")" >> "$GITHUB_OUTPUT"
