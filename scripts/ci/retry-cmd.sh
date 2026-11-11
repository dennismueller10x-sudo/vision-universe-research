#!/usr/bin/env bash
# Fuehrt einen Setup-Befehl bis zu dreimal aus (Pause 15 s, 45 s). NUR fuer Installationsschritte (apt-DNS, Spiegel,
# Netz): "playwright install --with-deps", apt-get. Nie fuer Tests - ein echter Fehler soll sofort rot sein.
# Aufruf: bash scripts/ci/retry-cmd.sh <befehl> [argumente...]
set -uo pipefail
for versuch in 1 2 3; do
  "$@" && exit 0
  status=$?
  [ "$versuch" -lt 3 ] || exit "$status"
  pause=$(( versuch == 1 ? 15 : 45 ))
  echo "::warning::Setup-Schritt fehlgeschlagen (Versuch $versuch/3, Status $status), neuer Versuch in ${pause}s: $*"
  sleep "$pause"
done
