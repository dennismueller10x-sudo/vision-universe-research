#!/usr/bin/env bash
# V12 INDEXPOP: full offline pipeline after the SEC fetch (inventory.py, fetch_docs.py, fates.py fetch separately).
# Usage: scripts/quant/v12/indexpop/run-pipeline.sh <private-dir>
set -euo pipefail
PRIV="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
OUT="$ROOT/docs/quant-recovery/v12/indexpop"
node "$HERE/build-snapshots.cjs" --private "$PRIV" --out "$PRIV/work/snapshots.json" --summary "$OUT/validation-1.0.0.json" > /dev/null
node "$HERE/qualify.cjs" --out "$PRIV/work/qualified.json" > /dev/null
for V in 1.1.0 1.2.0; do
  node --max-old-space-size=6000 "$HERE/map-members.cjs" --rules "$V" --private "$PRIV" --out "$PRIV/work/mapping-$V.json"
  EXTRA=""; [ "$V" = "1.1.0" ] && EXTRA="--no-register"   # 1.1.0 keeps coverage/prices only (register size budget)
  node --max-old-space-size=8000 "$HERE/build-outputs.cjs" --rules "$V" --mapping "mapping-$V.json" --private "$PRIV" --out-dir "$OUT" $EXTRA > "$PRIV/work/outputs-$V.log"
done
rm -f "$OUT/register-1.1.0.json.gz"
