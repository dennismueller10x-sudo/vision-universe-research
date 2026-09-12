#!/usr/bin/env bash
# Ergebnis eines Laufs in den Zweig bringen - oder laut scheitern.
#
# Liegt als Skript vor, weil es ZWEIMAL gebraucht wird. Der dritte
# Produktivlauf (34712221410) hat die Coverage erfolgreich gemessen und
# das Ergebnis trotzdem verloren: der naechste, optionale Schritt hat
# den Runner umgebracht, und der Commit stand dahinter. Was teuer
# erkauft und nicht wiederherstellbar ist, wird committet, BEVOR etwas
# Optionales laeuft.
#
# Aufruf: commit-and-push.sh "<Commit-Nachricht>" <pfad> [pfad ...]
set -euo pipefail

nachricht="$1"
shift

git config user.name "vision-universe-bot"
git config user.email "actions@users.noreply.github.com"
git add "$@"

if git diff --cached --quiet; then
  echo "Nichts geaendert."
  exit 0
fi

git commit -m "$nachricht"

# Vier Versuche, und DANACH ein Fehler.
#
# Die erste Fassung brach nach dem vierten Versuch einfach aus der
# Schleife - der Schritt meldete Erfolg, und das Ergebnis eines
# mehrstuendigen Laufs war weg, ohne dass irgendwo etwas rot wurde.
# Zwischen Checkout und Push koennen Stunden liegen; dass der Zweig
# sich bewegt hat, ist der Normalfall und kein Ausnahmezustand.
# Deshalb vor jedem Versuch rebasen.
for i in 1 2 3 4; do
  git pull --rebase --autostash origin "${GITHUB_REF_NAME}" || true
  if git push origin "HEAD:${GITHUB_REF_NAME}"; then
    echo "Gepusht nach ${GITHUB_REF_NAME}."
    exit 0
  fi
  echo "Push fehlgeschlagen, neuer Versuch in $((2**i))s"
  sleep $((2**i))
done

echo "::error::Vier Push-Versuche fehlgeschlagen. Das Ergebnis dieses Laufs ist NICHT im Zweig."
exit 1
