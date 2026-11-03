#!/usr/bin/env bash
# Vollstaendiger lokaler Release-Test (Schritte aus .github/workflows/pages-release.yml) und Nachweis,
# dass app/ nicht ausgeliefert wird. Aufruf: bash app/scripts/verify-release.sh <Ausgabeordner> [Referenzbuild]
# Referenzbuild (optional): ein frueherer Ordner von build-release.mjs; verglichen wird Datei fuer Datei.
set -euo pipefail
OUT="${1:?Ausgabeordner}"; REF="${2:-}"
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
ESB="$ROOT/app/node_modules"                      # esbuild@0.25.10 wie im Workflow
if [ "${SKIP_BUILD:-}" != "1" ]; then   # SKIP_BUILD=1: vorhandenen Rohbuild in <Ausgabeordner> weiterverwenden
  rm -rf "$OUT"
  node scripts/vu2/build-release.mjs --output="$OUT" > "$OUT.build.log"
  tail -n 3 "$OUT.build.log"
fi
# Nachweis 1: app/ fehlt im Rohbuild
if find "$OUT" -path "$OUT/app" -prune -print | grep -q .; then echo "FEHLER: app/ im Release"; exit 1; fi
echo "OK: kein app/ im Rohbuild"
# Nachweis 2: Rest ist byte-gleich zum Referenzbuild (ohne app/)
if [ -n "$REF" ]; then
  # Erwartet: nur app/ fehlt. Dateien, die sich nur im Feld generatedAt (Bauzeit) unterscheiden, zaehlen als gleich.
  diff -rq "$REF" "$OUT" | grep -v "^Only in $REF: app$" > "$OUT.diff.txt" || true
  REFDIR="$REF" OUTDIR="$OUT" node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines = readFileSync(process.env.OUTDIR + '.diff.txt', 'utf8').split('\n').filter(Boolean);
const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'generatedAt').map(([k, x]) => [k, strip(x)])) : v;
let real = 0;
for (const l of lines) {
  const m = l.match(/^Files (.+) and (.+) differ\$/);
  let same = false;
  if (m) { try { same = JSON.stringify(strip(JSON.parse(readFileSync(m[1], 'utf8')))) === JSON.stringify(strip(JSON.parse(readFileSync(m[2], 'utf8')))); } catch { same = false; } }
  if (!same) { real++; console.log('UNTERSCHIED: ' + l.slice(0, 200)); }
}
console.log('Unterschiede zur Referenz ausser app/: ' + real + ' (davon nur Bauzeit: ' + (lines.length - real) + ')');
process.exit(real ? 1 : 0);"
  echo "OK: Rohbuild gleich Referenz ausser app/ (nur Bauzeitstempel weichen ab)"
fi
"$ESB/.bin/esbuild" "$OUT/quant/release-bundle.js" --minify-whitespace --charset=utf8 --legal-comments=inline --tree-shaking=false --allow-overwrite --outfile="$OUT/quant/release-bundle.js" --log-level=warning
ESBUILD_PATH="$ESB/esbuild" node scripts/vu2/minify-release.mjs "$OUT" | tail -n 2
node scripts/vu2/release-id.mjs "$OUT" | tail -n 2
NODE_PATH="${NODE_PATH:-}" node scripts/vu2/production-smoke.mjs "$OUT" 2>&1 | tail -n 6
export RESEARCH_ACCESS_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
OUTDIR="$OUT" node --input-type=module -e "
import {protectRelease} from './scripts/access-gate/build.mjs';
console.log('Passwortsperre:', JSON.stringify(await protectRelease({output: process.env.OUTDIR})).slice(0, 160));"
if find "$OUT" -path "$OUT/app" -print -quit | grep -q .; then echo "FEHLER: app/ nach Nachbearbeitung"; exit 1; fi
node scripts/vu2/production-smoke.mjs "$OUT" --access-gate 2>&1 | tail -n 6
unset RESEARCH_ACCESS_PASSWORD
find "$OUT" -path "$OUT/app" -print -quit | grep -q . && { echo "FEHLER: app/ im Endpaket"; exit 1; }
echo "Release-Test beendet"
