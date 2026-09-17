#!/usr/bin/env bash
# Wie gross ist, was in den Commit ginge?
#
# Ein Lauf, der versehentlich Gigabyte committet, ist schwerer
# rueckgaengig zu machen als einer, der hier abbricht.
#
# ABER: `du` misst die Platte, nicht den Commit. Lauf 34713330734 ist
# genau daran gescheitert - quant/data/sec lag mit 589 MB auf der
# Platte, weil dort der Faktenspeicher liegt, und der ist in
# .gitignore. Git haette 18 Dateien gesehen. Der Schritt hat einen
# fertigen, gemessenen Lauf abgebrochen wegen Daten, die er nie
# angefasst haette.
#
# Gezaehlt wird deshalb, was git sieht: verfolgte Dateien plus
# unverfolgte, die nicht ignoriert sind.
set -euo pipefail

GRENZE_MB="${GRENZE_MB:-400}"

for d in quant/data/fundamentals quant/data/universe quant/data/sec; do
  [ -d "$d" ] || continue

  bytes=$(git ls-files -c -o --exclude-standard -z -- "$d" \
    | xargs -0 -r stat -c %s 2>/dev/null \
    | awk '{summe += $1} END {print summe + 0}')
  mb=$(( bytes / 1024 / 1024 ))

  ignoriert=$(du -sm "$d" | cut -f1)
  echo "$d: ${mb} MB im Commit (${ignoriert} MB auf der Platte, Rest ignoriert)"

  if [ "$mb" -gt "$GRENZE_MB" ]; then
    echo "::error::$d brachte ${mb} MB in den Commit - das gehoert nicht in ein Git-Repository."
    exit 1
  fi
done
