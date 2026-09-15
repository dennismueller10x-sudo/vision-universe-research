#!/usr/bin/env bash
# Jede committete JSON-Datei unter quant/ muss parsbar sein - und frei
# von Konfliktmarkern.
#
# Lauf 34749345361 hat cik-resolution.json und issuer-manifest.json mit
# "<<<<<<< HEAD" in den Zweig gebracht. Kein Test hat es gemerkt, weil
# die Pruefung beide Dateien vorher neu erzeugt. Diese Pruefung liest,
# was im Zweig steht - nicht, was ein Schritt daraus macht.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fehler=0
while IFS= read -r pfad; do
  if grep -q -e '^<<<<<<< ' -e '^>>>>>>> ' -e '^=======$' "$pfad"; then
    echo "::error file=$pfad::Konfliktmarker in einer committeten Datei."
    fehler=1
    continue
  fi
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$pfad" 2>/dev/null; then
    echo "::error file=$pfad::Kein gueltiges JSON."
    fehler=1
  fi
done < <(git ls-files -- 'quant/**/*.json' 'quant/*.json')

if [ "$fehler" -ne 0 ]; then
  echo "::error::Mindestens eine committete JSON-Datei ist kaputt. Nicht mergen, nicht darauf bauen."
  exit 1
fi
echo "Alle committeten JSON-Dateien unter quant/ sind gueltig und markerfrei."
