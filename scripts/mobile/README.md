# E5: reproduzierbares mobiles Labor

Node + extern installiertes Playwright, keine Root-Abhängigkeiten. Beispiel:

```sh
npm install --prefix /tmp/e5-tools playwright@1.65.0 esbuild@0.25.10
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

## Abschlussmessung exakt mit dem Paket-1-Werkzeug

Für die Abschlussmessung vom 07.11. wurde das ursprüngliche Skript unverändert
wiederverwendet. Die späteren Diagnoseoptionen in `measure.mjs` wurden dabei
nicht genutzt. Reproduktion aus dem Repository-Arbeitsverzeichnis:

```sh
mkdir -p /tmp/e5-p1-lab
git show 9e2012b6f339fd6aef80ef5df7e6eb211f1ff683:scripts/mobile/measure.mjs > /tmp/e5-p1-lab/measure.mjs
git show 9e2012b6f339fd6aef80ef5df7e6eb211f1ff683:scripts/mobile/server.mjs > /tmp/e5-p1-lab/server.mjs
sha256sum /tmp/e5-p1-lab/measure.mjs
ESBUILD_PATH=/tmp/e5-tools/node_modules/esbuild node scripts/mobile/refresh-code.mjs --root /tmp/e5-release --ref CODE_COMMIT
NODE_PATH=/tmp/e5-tools/node_modules node /tmp/e5-p1-lab/measure.mjs --root /tmp/e5-release --browser /usr/bin/chromium --runs 3 --out /tmp/e5-measurement.json
```

Erwarteter SHA-256: `75f66055c528d878e85603aedd1e0819c043d401f83481955a900ac919ac6c0a`.
Vor allen Code-Vergleichen denselben Release-Datenstand bauen und festhalten;
keine Git-Komprimierung, Tests oder weiteren Browserprüfungen parallel zu den
Zeitmessungen. Die Abschluss-Rohdaten und die tatsächlichen Code-Referenzen
stehen in `docs/mobile/e5/final/`. Ein späterer Dokumentationscommit ändert
keine gemessenen Assets. Der Kontrolllauf nutzt main-Code `9e2012b6f339`;
die abschließende Rebase auf `6464e4920` übernimmt weitere Daten-/Betriebsupdates
und ändert gegenüber `3891bf5bef8d` keinen ausgelieferten Browsercode außerhalb
der App. Der Watchlist-Vertragstest wurde an `releaseOnly` angepasst. Der feste Daten-/Logo-Snapshot bleibt in allen Läufen
identisch. Diese Werte sind keine Produktions- oder Gerätemessung.

Früher Kopf und spätere Knotenübernahme lassen sich mit blockiertem Router bzw. blockierten Technical-Engines separat prüfen:

```sh
NODE_PATH=/tmp/e5-tools/node_modules node scripts/mobile/early-head-qa.mjs --root /tmp/e5-release --out /tmp/e5-early-head.json
```

Das ist Funktions-QA ohne Drosselung; die Zeitabnahme verwendet weiterhin ausschließlich das unveränderte Paket-1-Skript.
## Weitere Diagnoseoptionen (nicht für die Abschluss-Zeitabnahme verwendet)

Code-Vergleiche gegen denselben Datenstand (ohne erneuten Datenbau):

```sh
ESBUILD_PATH=/tmp/e5-tools/node_modules/esbuild node scripts/mobile/refresh-code.mjs --root /tmp/e5-release --ref COMMIT
NODE_PATH=/tmp/e5-tools/node_modules node scripts/mobile/measure.mjs --root /tmp/e5-release --browser /usr/bin/chromium --time 2026-11-06T20:00:00Z --out /tmp/e5-comparison.json
```

`refresh-code` schreibt die konkrete Code-Revision und SHA-256-Abdrücke in
`mobile-code-overlay.json`. Ein Wechsel zurück stellt auch die zuvor
überlagerten Code-Dateien wieder her. Daten bleiben aus dem ursprünglichen
Release; insbesondere werden eingebettete FX-Beobachtungen aus diesem
Snapshot übernommen. Compiler-Version und Optionen bleiben identisch.

`--time` hält ausschließlich die fachliche Browser-Uhr fest, damit ein Vergleich
nicht über einen Börsenschluss hinweg unterschiedliche Zustände auswertet.
Animationen, Timer und `performance.now()` laufen normal weiter. Ohne Option
gilt die reale Uhr. Die Nummernbeobachtung läuft nur auf Aktien-Detailrouten.
Für reine CPU-Diagnosen: `--route /quant/#/aktie/NVDA --runs 1
--cpu-profile /tmp/quant.cpuprofile`; solche instrumentierten Läufe sind kein
LCP-Zielnachweis.

Für verlässliche Zeiten keine konkurrierenden Builds oder Rechentests laufen
lassen. Alle Browser-Prozesse brauchen dieselbe verfügbare CPU-Kapazität;
einen ganzen Mehrprozess-Browser auf einen einzelnen Kern zu beschränken ist
ein zusätzliches Profil und nicht mit der ursprünglichen Messung vergleichbar.
`cpuAffinity`, `observedUntil`, Ressourcen-Zeitpunkte und Long Tasks erlauben
es, Ausreißer und tatsächliche Ladeabhängigkeiten nachzuvollziehen.

Die separate Qualitätsprüfung benötigt zusätzlich extern installiertes
`@axe-core/playwright`:

```sh
NODE_PATH=/tmp/e5-tools/node_modules node scripts/mobile/quality.mjs /tmp/e5-release /tmp/e5-quality
```

Sie prüft elf Routen hell/dunkel, sichtbare 44-px-Bedienflächen, die ersten
16 Tab-Stopps, Bewegungsbeschriftungen, die Kopfposition beim Scrollen und das
Discover-Budget. Der Analysten-Dialog wird per Tastatur geöffnet und auf
Fokusfalle, Escape und Fokusrückgabe geprüft. Ein echter Browser-Service-Worker
prüft Offline-Navigation, Logo-Cache und verweigerte neue Datenabrufe.
Axe-`incomplete` bleibt im Bericht; automatische Kontrastprüfung ersetzt keine
Geräte-/Screenreader-Abnahme.
