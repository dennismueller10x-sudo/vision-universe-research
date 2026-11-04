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

  # `ls-files -c` nennt auch verfolgte Dateien, die der Erzeuger in
  # diesem Lauf geloescht hat (z. B. eine verwaiste Namens-Scherbe
  # quant/data/universe/search/name/WU.json, Laeufe 41474158720 und
  # 41650347339). Die gibt es auf der Platte nicht mehr; `stat` brach
  # daran ab, xargs meldete 123, und `2>/dev/null` verschluckte den
  # Grund. Eine Loeschung bringt 0 Byte in den Commit: sie wird
  # gezaehlt und gemeldet, aber nicht gemessen. Andere stat-Fehler
  # bleiben laut.
  geloescht=$(git ls-files -d -z -- "$d" | tr -cd '\0' | wc -c)
  bytes=$(git ls-files -c -o --exclude-standard -z -- "$d" \
    | while IFS= read -r -d '' f; do
        if [ -e "$f" ] || [ -L "$f" ]; then printf '%s\0' "$f"; fi
      done \
    | xargs -0 -r stat -c %s \
    | awk '{summe += $1} END {print summe + 0}')
  mb=$(( bytes / 1024 / 1024 ))
  if [ "$geloescht" -gt 0 ]; then
    echo "$d: ${geloescht} verfolgte Datei(en) in diesem Lauf geloescht"
  fi

  ignoriert=$(du -sm "$d" | cut -f1)
  echo "$d: ${mb} MB im Commit (${ignoriert} MB auf der Platte, Rest ignoriert)"

  if [ "$mb" -gt "$GRENZE_MB" ]; then
    echo "::error::$d brachte ${mb} MB in den Commit - das gehoert nicht in ein Git-Repository."
    exit 1
  fi
done
