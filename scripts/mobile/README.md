# E5: reproduzierbares mobiles Labor

Node + extern installiertes Playwright, keine Root-Abhängigkeiten. Beispiel:

```sh
npm install --prefix /tmp/e5-tools playwright esbuild@0.25.10
node scripts/vu2/build-release.mjs --output=/tmp/e5-release
/tmp/e5-tools/node_modules/.bin/esbuild /tmp/e5-release/quant/release-bundle.js --minify-whitespace --charset=utf8 --legal-comments=inline --tree-shaking=false --allow-overwrite --outfile=/tmp/e5-release/quant/release-bundle.js
ESBUILD_PATH=/tmp/e5-tools/node_modules/esbuild node scripts/vu2/minify-release.mjs /tmp/e5-release
NODE_PATH=/tmp/e5-tools/node_modules node scripts/mobile/measure.mjs --root /tmp/e5-release --browser /usr/bin/chromium --out /tmp/e5-before.json
```

Der Release-Ordner muss beim Build leer sein und außerhalb des Repos liegen.
Die Pages-Auslieferung kann zusätzlich `data/live` und freigegebene private
Consumer-Daten überlagern. Ein lokaler main-Release ist daher keine Messung
der aktuellen Produktion. Datenstand, Commit und Compiler für Vorher/Nachher
festhalten. Kein Quelltext-Server als Ersatz für den Release.

Standard: alle elf Routen, drei Wiederholungen, je 20 Sekunden nach Navigation-
Commit; Chromium 390×844, DPR 2, Touch, Download 1,6 Mbit/s, Upload 0,75 Mbit/s,
150 ms Latenz, CPU-Faktor 4. Frischer Kontext je Versuch, HTTP-Cache deaktiviert,
Service Worker blockiert. Kein Scrollen und kein Klick; zunächst nur initialer
Viewport. `--runs 1`, `--route /quant/`, `--window 30000` für Diagnosen.
`--base-url https://…` für einen separat gestarteten Server; der lokale Server
unterstützt gzip wie Pages (vorhandene `.json.gz` bleiben komprimierte Dateien).

LCP aus PerformanceObserver, CLS als größtes Session-Fenster (1 s Abstand,
maximal 5 s). TBT-Ersatz summiert `max(0, duration − 50 ms)` der Long Tasks ab
FCP bis Messende. Das ist weder Feld-INP noch Lighthouse-TBT (kein TTI-Modell).
CDP zählt HTTP(S)-Requests und tatsächliche Wire-Bytes einschließlich Headern;
laufende Antworten nur teilweise. Rohdaten enthalten Fehler und offene Requests.
Die erste sinnvolle Aktienzahl ist der **sichtbare Kurs im gemeinsamen
Aktienkopf** (`.vu-shead-value`), nach einem Animationsframe; Datum und
Navigationszähler zählen nicht. `null` bedeutet innerhalb des Fensters nicht
sichtbar, niemals 0 ms. Wiederholungen mit Fehlern nicht als Erfolg bewerten.
Medians dienen der Übersicht, Einzelwerte bleiben im JSON.

Das Skript verändert keine Produktionsdateien. `--out` schreibt ausschließlich
den angegebenen Bericht (Standard `/tmp/e5-measurement.json`). Kalte Messungen
prüfen keinen SW-Cache-Gewinn; Offline/Warm-Cache separat testen.
