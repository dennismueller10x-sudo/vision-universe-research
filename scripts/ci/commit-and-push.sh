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
# EIN KONFLIKT BEIM REBASE IST KEIN "|| true".
#
# Lauf 34749245361 hat genau das gezeigt: der Rebase blieb in einem
# Konflikt stehen, das "|| true" schluckte ihn, der Push schob nichts
# (HEAD stand auf dem Upstream), und der ZWEITE Aufruf dieses Skripts
# committete den halb rebasten Arbeitsbaum - mitsamt Konfliktmarkern
# in zwei JSON-Dateien, die danach nicht mehr parsbar waren.
#
# Die Dateien, die dieses Skript committet, sind Laufergebnisse:
# gemessen, generiert, reproduzierbar. Bei einem Konflikt gewinnt
# deshalb der Lauf ("theirs" im Rebase ist der eigene Commit). Danach
# wird geprueft, dass kein Marker uebrig ist - sonst Abbruch, laut.
rebase_oder_aufloesen() {
  if git pull --rebase --autostash origin "${GITHUB_REF_NAME}"; then
    return 0
  fi
  echo "Rebase-Konflikt - Laufergebnis gewinnt fuer die betroffenen Pfade."
  while [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; do
    git diff --name-only --diff-filter=U | while IFS= read -r pfad; do
      git checkout --theirs -- "$pfad" 2>/dev/null || git rm -q -- "$pfad"
      [ -e "$pfad" ] && git add -- "$pfad"
    done
    GIT_EDITOR=true git rebase --continue || { git rebase --abort; return 1; }
  done
  if git grep -q -e '^<<<<<<< ' -e '^>>>>>>> ' HEAD -- "$@"; then
    echo "::error::Konfliktmarker nach dem Rebase. Nicht gepusht."
    return 1
  fi
  return 0
}

for i in 1 2 3 4; do
  if ! rebase_oder_aufloesen "$@"; then
    echo "::error::Rebase nicht aufloesbar. Das Ergebnis dieses Laufs ist NICHT im Zweig."
    exit 1
  fi
  if git push origin "HEAD:${GITHUB_REF_NAME}"; then
    echo "Gepusht nach ${GITHUB_REF_NAME}."
    exit 0
  fi
  echo "Push fehlgeschlagen, neuer Versuch in $((2**i))s"
  sleep $((2**i))
done

echo "::error::Vier Push-Versuche fehlgeschlagen. Das Ergebnis dieses Laufs ist NICHT im Zweig."
exit 1
