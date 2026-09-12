#!/usr/bin/env bash
# Ein Lauf, der versehentlich Gigabyte committet, ist schwerer
# rueckgaengig zu machen als einer, der hier abbricht.
set -euo pipefail

GRENZE_MB="${GRENZE_MB:-400}"

for d in quant/data/fundamentals quant/data/universe quant/data/sec; do
  [ -d "$d" ] || continue
  size=$(du -sm "$d" | cut -f1)
  echo "$d: ${size} MB"
  if [ "$size" -gt "$GRENZE_MB" ]; then
    echo "::error::$d ist ${size} MB - das gehoert nicht in ein Git-Repository."
    exit 1
  fi
done
