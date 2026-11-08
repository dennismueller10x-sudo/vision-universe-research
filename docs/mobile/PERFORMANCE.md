# Mobile Performance – E5 Abschlussmessung (07.11.2026)

Die Tabellen unten verwenden **genau das unveränderte Messskript aus Paket 1**,
`main:scripts/mobile/measure.mjs` (SHA-256
`75f66055c528d878e85603aedd1e0819c043d401f83481955a900ac919ac6c0a`).
Node 22.23.4, Chromium 156.0.8078.79, esbuild 0.25.10; 390 × 844,
DPR 2, Touch, Download 1,6 Mbit/s, Upload 0,75 Mbit/s, Latenz 150 ms,
CPU ×4, kalter Browser-Kontext pro Lauf, HTTP-Cache aus, Service Worker blockiert.
Drei Läufe je Route, jeweils 20 Sekunden ab Navigation-Commit; keine
CPU-Profile, feste Browser-Uhr oder konkurrierenden lokalen Rechentests/Builds.

Kontrollierter Vergleich: main-Code `9e2012b6f339` gegen die drei E5-Pakete,
alle auf **demselben gebauten Daten-Snapshot `bbe59a3ca48e`**. Keine Live-/privaten
Consumer-Overlays. Das ist ein lokales Chromium-Labor, keine Messung der aktuellen
Produktion und kein iPhone-/Screenreader-Nachweis. Die Abschluss-Rebase auf main
`6464e4920` übernimmt weitere Daten-/Betriebsupdates; gegenüber `3891bf5bef8d`
ändert sie keine ausgelieferte Browser-JS-/CSS-/HTML-Datei außerhalb der
ausgeschlossenen App. Der Watchlist-Vertragstest wurde an `releaseOnly` angepasst. Daten/Logos bleiben für
diesen Vergleich bewusst im festen Snapshot. Code-Referenzen und Zeitpunkte:
[provenance.json](e5/final/provenance.json). Die `commit`-Felder der ursprünglichen
Messberichte bezeichnen den ausführenden Arbeitsbaum; die tatsächlich
kompilierten Referenzen stehen im Provenienzbericht. Rohdaten bleiben unverändert.

LCP und CLS kommen aus PerformanceObserver. **TBT*** summiert blockierende
Long-Task-Anteile ab FCP bis zum Messende; es ist weder Feld-INP noch
Lighthouse-TBT. „Erster Kurs“ zählt ausschließlich einen sichtbaren Zahlenwert
in `.vu-shead-value` nach einem Animationsframe. `null`/„–“ heißt kein sichtbarer
Aktienkurs im Beobachtungsfenster bzw. keine Aktienroute, niemals 0 Sekunden.
Wire enthält HTTP-Header und das Hauptdokument. Der separate Quant-Ressourcengrenzwert zählt PerformanceResourceTiming-Einträge ohne Hauptdokument; seine 46 Ressourcen sind daher nicht dieselbe Zählung wie CDP-Requests. Mediane ersetzen keine Einzelwertprüfung. Ein früher LCP-Wert
kann bereits Shell-/Footertext messen, obwohl der Kurs erst später erscheint;
deshalb Kurszeit und Layout-Stabilität separat bewerten.

## Paket 2 – Ladezeit (#1559): vorher / nachher

Mediane aus jeweils drei kalten Läufen. Vergleich `baseline` → `loading`; alle Einzelwerte, Ressourcen und Fehler: [baseline.json](e5/final/baseline.json), [loading.json](e5/final/loading.json).

| Route | LCP s vorher / nachher | CLS vorher / nachher | TBT* ms vorher / nachher | Wire KiB vorher / nachher | Requests vorher / nachher | Erster Kurs s vorher / nachher |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.288 / 1.176 | 0.000 / 0.000 | 149 / 0 | 72.1 / 72.1 | 9 / 9 | – / – |
| `/quant/` | 2.932 / 2.976 | 0.306 / 0.306 | 351 / 367 | 546.2 / 514.6 | 25 / 24 | – / – |
| `/quant/#/aktie/NVDA` | 6.740 / 7.048 | 0.062 / 0.062 | 1061 / 1129 | 885.2 / 885.2 | 47 / 47 | 5.837 / 6.167 |
| `/technical/#/chart/NVDA` | 2.148 / 2.316 | 0.742 / 0.742 | 865 / 823 | 551.8 / 551.9 | 57 / 57 | 5.771 / 3.953 |
| `/fundamental/#/NVDA` | 1.768 / 1.616 | 0.361 / 0.361 | 1088 / 988 | 1314.2 / 1314.3 | 28 / 28 | 2.689 / 2.434 |
| `/supertrader/` | 1.112 / 1.040 | 1.026 / 1.026 | 705 / 846 | 594.8 / 595.1 | 24 / 24 | – / – |
| `/supertrader/stock/NVDA/` | 1.108 / 1.044 | 0.764 / 1.175 | 125 / 153 | 305.4 / 305.7 | 32 / 32 | 2.914 / 3.131 |
| `/discover/` | 1.328 / 1.460 | 0.087 / 0.087 | 566 / 269 | 1078.9 / 996.2 | 131 / 56 | – / – |
| `/quant/musterdepots/` | 0.956 / 3.832 | 0.340 / 0.361 | 161 / 1503 | 170.5 / 170.5 | 12 / 12 | – / – |
| `/analysten/` | 0.944 / 1.204 | 0.018 / 0.018 | 135 / 114 | 86.5 / 86.5 | 10 / 10 | – / – |
| `/mein-dashboard/` | 0.756 / 0.752 | 0.000 / 0.000 | 21 / 47 | 221.2 / 221.3 | 29 / 29 | – / – |

Zielprüfung der vier Aktienseiten (kein Bestehen nur aus einem günstigen Einzellauf ableiten):

| Aktienroute | Erster Kurs: Median / Spanne s | Läufe < 3 s | CLS: Median / Maximum | Läufe CLS < 0,1 |
|---|---:|---:|---:|---:|
| `/quant/#/aktie/NVDA` | 6.167 / 5.808–6.708 | 0/3 | 0.062 / 0.062 | 3/3 |
| `/technical/#/chart/NVDA` | 3.953 / 3.812–3.960 | 0/3 | 0.742 / 0.742 | 0/3 |
| `/fundamental/#/NVDA` | 2.434 / 2.421–2.532 | 3/3 | 0.361 / 0.361 | 0/3 |
| `/supertrader/stock/NVDA/` | 3.131 / 3.025–3.515 | 0/3 | 1.175 / 1.175 | 0/3 |

LCP < 2,5 s: 8/11 Routen im Median; CLS < 0,1: 5/11 im Median.

HTTP-/Netzfehler bleiben in den Rohdaten enthalten: /: http://127.0.0.1:42149/favicon.ico (404); /mein-dashboard/: https://konto.visionuniverse.de/v1/session (403), https://konto.visionuniverse.de/v1/session (net::ERR_FAILED).

Paket 2 allein erreicht das Aktienziel nicht: Quant 6,167 s, Technical 3,953 s und Supertrader 3,131 s im Median. Fundamental liegt bei 2,434 s, springt jedoch im Layout. Discover sinkt von 131 auf 56 Requests. Die frühen Köpfe und reservierten Flächen folgen in Paket 3; aus schwankenden Zeiten unveränderter Ladepfade wird keine kausale Beschleunigung behauptet.

## Paket 3 – App-Verhalten (#1562): vorher / nachher

Mediane aus jeweils drei kalten Läufen. Vergleich `loading` → `app-feel`; alle Einzelwerte, Ressourcen und Fehler: [loading.json](e5/final/loading.json), [app-feel.json](e5/final/app-feel.json).

| Route | LCP s vorher / nachher | CLS vorher / nachher | TBT* ms vorher / nachher | Wire KiB vorher / nachher | Requests vorher / nachher | Erster Kurs s vorher / nachher |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.176 / 1.244 | 0.000 / 0.000 | 0 / 142 | 72.1 / 72.5 | 9 / 9 | – / – |
| `/quant/` | 2.976 / 2.252 | 0.306 / 0.006 | 367 / 598 | 514.6 / 530.8 | 24 / 23 | – / – |
| `/quant/#/aktie/NVDA` | 7.048 / 2.772 | 0.062 / 0.055 | 1129 / 1674 | 885.2 / 903.0 | 47 / 47 | 6.167 / 1.630 |
| `/technical/#/chart/NVDA` | 2.316 / 3.576 | 0.742 / 0.052 | 823 / 677 | 551.9 / 553.6 | 57 / 57 | 3.953 / 3.562 |
| `/fundamental/#/NVDA` | 1.616 / 2.600 | 0.361 / 0.000 | 988 / 1046 | 1314.3 / 1315.8 | 28 / 28 | 2.434 / 2.521 |
| `/supertrader/` | 1.040 / 2.252 | 1.026 / 0.013 | 846 / 84 | 595.1 / 219.7 | 24 / 19 | – / – |
| `/supertrader/stock/NVDA/` | 1.044 / 2.912 | 1.175 / 0.085 | 153 / 127 | 305.7 / 307.8 | 32 / 32 | 3.131 / 3.049 |
| `/discover/` | 1.460 / 1.520 | 0.087 / 0.086 | 269 / 332 | 996.2 / 997.7 | 56 / 56 | – / – |
| `/quant/musterdepots/` | 3.832 / 1.508 | 0.361 / 0.000 | 1503 / 61 | 170.5 / 171.6 | 12 / 12 | – / – |
| `/analysten/` | 1.204 / 1.128 | 0.018 / 0.018 | 114 / 88 | 86.5 / 86.6 | 10 / 10 | – / – |
| `/mein-dashboard/` | 0.752 / 1.216 | 0.000 / 0.000 | 47 / 36 | 221.3 / 222.7 | 29 / 29 | – / – |

Zielprüfung der vier Aktienseiten (kein Bestehen nur aus einem günstigen Einzellauf ableiten):

| Aktienroute | Erster Kurs: Median / Spanne s | Läufe < 3 s | CLS: Median / Maximum | Läufe CLS < 0,1 |
|---|---:|---:|---:|---:|
| `/quant/#/aktie/NVDA` | 1.630 / 1.592–2.725 | 3/3 | 0.055 / 0.073 | 3/3 |
| `/technical/#/chart/NVDA` | 3.562 / 3.178–6.933 | 0/3 | 0.052 / 0.052 | 3/3 |
| `/fundamental/#/NVDA` | 2.521 / 2.498–2.598 | 3/3 | 0.000 / 0.001 | 3/3 |
| `/supertrader/stock/NVDA/` | 3.049 / 2.975–3.058 | 1/3 | 0.085 / 0.085 | 3/3 |

LCP < 2,5 s: 7/11 Routen im Median; CLS < 0,1: 11/11 im Median.

HTTP-/Netzfehler bleiben in den Rohdaten enthalten: /: http://127.0.0.1:45827/favicon.ico (404); /mein-dashboard/: https://konto.visionuniverse.de/v1/session (403), https://konto.visionuniverse.de/v1/session (net::ERR_FAILED).

Paket 3 erreicht den ersten Kurs unter drei Sekunden in allen Quant- und Fundamental-Läufen. Technical (3,562 s Median) und Supertrader (3,049 s Median, zwei Läufe ≥ 3 s) verfehlen das Ziel. CLS bleibt auf allen elf Routen im Median unter 0,1; die abschließende Einzelwertprüfung folgt in Paket 4.

Der Kopf-Erzeuger kopiert nur die kanonisch verfügbaren, erlaubten Werte. Der abschließende Daten-Overlay darf alte Kopfscherben nicht zurücklassen: ein zuvor verfügbarer, danach zurückgehaltener Wert ist durch einen echten Regressionstest abgedeckt. Die Tests laufen über die bestehenden Quant-/Supertrader-Suiten; kein Workflow wird ergänzt.

## Paket 4 – Barrierefreiheit und Dark Mode (#1565): vorher / nachher

Mediane aus jeweils drei kalten Läufen. Vergleich `app-feel` → `accessibility`; alle Einzelwerte, Ressourcen und Fehler: [app-feel.json](e5/final/app-feel.json), [accessibility.json](e5/final/accessibility.json).

| Route | LCP s vorher / nachher | CLS vorher / nachher | TBT* ms vorher / nachher | Wire KiB vorher / nachher | Requests vorher / nachher | Erster Kurs s vorher / nachher |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.244 / 1.044 | 0.000 / 0.000 | 142 / 120 | 72.5 / 72.7 | 9 / 9 | – / – |
| `/quant/` | 2.252 / 1.488 | 0.006 / 0.006 | 598 / 240 | 530.8 / 531.2 | 23 / 23 | – / – |
| `/quant/#/aktie/NVDA` | 2.772 / 7.616 | 0.055 / 0.055 | 1674 / 1096 | 903.0 / 903.5 | 47 / 47 | 1.630 / 1.524 |
| `/technical/#/chart/NVDA` | 3.576 / 3.272 | 0.052 / 0.052 | 677 / 500 | 553.6 / 553.9 | 57 / 57 | 3.562 / 3.259 |
| `/fundamental/#/NVDA` | 2.600 / 2.452 | 0.000 / 0.000 | 1046 / 970 | 1315.8 / 1316.2 | 28 / 28 | 2.521 / 2.408 |
| `/supertrader/` | 2.252 / 2.248 | 0.013 / 0.013 | 84 / 68 | 219.7 / 219.9 | 19 / 19 | – / – |
| `/supertrader/stock/NVDA/` | 2.912 / 2.820 | 0.085 / 0.085 | 127 / 100 | 307.8 / 308.2 | 32 / 32 | 3.049 / 2.947 |
| `/discover/` | 1.520 / 1.428 | 0.086 / 0.088 | 332 / 369 | 997.7 / 998.1 | 56 / 56 | – / – |
| `/quant/musterdepots/` | 1.508 / 1.516 | 0.000 / 0.000 | 61 / 64 | 171.6 / 171.9 | 12 / 12 | – / – |
| `/analysten/` | 1.128 / 1.076 | 0.018 / 0.000 | 88 / 59 | 86.6 / 88.1 | 10 / 10 | – / – |
| `/mein-dashboard/` | 1.216 / 0.844 | 0.000 / 0.000 | 36 / 35 | 222.7 / 223.1 | 29 / 29 | – / – |

Zielprüfung der vier Aktienseiten (kein Bestehen nur aus einem günstigen Einzellauf ableiten):

| Aktienroute | Erster Kurs: Median / Spanne s | Läufe < 3 s | CLS: Median / Maximum | Läufe CLS < 0,1 |
|---|---:|---:|---:|---:|
| `/quant/#/aktie/NVDA` | 1.524 / 1.464–1.573 | 3/3 | 0.055 / 0.055 | 3/3 |
| `/technical/#/chart/NVDA` | 3.259 / 3.255–3.270 | 0/3 | 0.052 / 0.052 | 3/3 |
| `/fundamental/#/NVDA` | 2.408 / 2.366–2.422 | 3/3 | 0.000 / 0.001 | 3/3 |
| `/supertrader/stock/NVDA/` | 2.947 / 2.928–3.559 | 2/3 | 0.085 / 0.085 | 3/3 |

LCP < 2,5 s: 8/11 Routen im Median; CLS < 0,1: 11/11 im Median.

HTTP-/Netzfehler bleiben in den Rohdaten enthalten: /: http://127.0.0.1:45681/favicon.ico (404); /mein-dashboard/: https://konto.visionuniverse.de/v1/session (403), https://konto.visionuniverse.de/v1/session (net::ERR_FAILED).

## Gesamtergebnis: kontrollierter main-Ausgangscode / Paket 4

Derselbe Datenstand und dasselbe Paket-1-Labor. Jede Zelle zeigt **vorher / nachher**, jeweils drei kalte Läufe im Median.

| Route | LCP s vorher / nachher | CLS vorher / nachher | TBT* ms vorher / nachher | Wire KiB vorher / nachher | Requests vorher / nachher | Erster Kurs s vorher / nachher |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.288 / 1.044 | 0.000 / 0.000 | 149 / 120 | 72.1 / 72.7 | 9 / 9 | – / – |
| `/quant/` | 2.932 / 1.488 | 0.306 / 0.006 | 351 / 240 | 546.2 / 531.2 | 25 / 23 | – / – |
| `/quant/#/aktie/NVDA` | 6.740 / 7.616 | 0.062 / 0.055 | 1061 / 1096 | 885.2 / 903.5 | 47 / 47 | 5.837 / 1.524 |
| `/technical/#/chart/NVDA` | 2.148 / 3.272 | 0.742 / 0.052 | 865 / 500 | 551.8 / 553.9 | 57 / 57 | 5.771 / 3.259 |
| `/fundamental/#/NVDA` | 1.768 / 2.452 | 0.361 / 0.000 | 1088 / 970 | 1314.2 / 1316.2 | 28 / 28 | 2.689 / 2.408 |
| `/supertrader/` | 1.112 / 2.248 | 1.026 / 0.013 | 705 / 68 | 594.8 / 219.9 | 24 / 19 | – / – |
| `/supertrader/stock/NVDA/` | 1.108 / 2.820 | 0.764 / 0.085 | 125 / 100 | 305.4 / 308.2 | 32 / 32 | 2.914 / 2.947 |
| `/discover/` | 1.328 / 1.428 | 0.087 / 0.088 | 566 / 369 | 1078.9 / 998.1 | 131 / 56 | – / – |
| `/quant/musterdepots/` | 0.956 / 1.516 | 0.340 / 0.000 | 161 / 64 | 170.5 / 171.9 | 12 / 12 | – / – |
| `/analysten/` | 0.944 / 1.076 | 0.018 / 0.000 | 135 / 59 | 86.5 / 88.1 | 10 / 10 | – / – |
| `/mein-dashboard/` | 0.756 / 0.844 | 0.000 / 0.000 | 21 / 35 | 221.2 / 223.1 | 29 / 29 | – / – |


**Kursziel:** Quant (1,524 s) und Fundamental (2,408 s) bleiben in allen drei Läufen unter 3 s. Technical verfehlt die Grenze in allen drei Läufen (Median 3,259 s, Spanne 3,255–3,270 s). Supertrader erreicht 2,947 s im Median, aber nur zwei von drei Läufen unter 3 s; der Ausreißer liegt bei 3,559 s. Deshalb keine vollständige Kurszeit-Abnahme aller vier Aktienseiten. **CLS < 0,1 ist in allen 33 Abschlussläufen erreicht.**

LCP < 2,5 s erreichen acht von elf Routen im Median. Nicht erreicht: Quant NVDA 7,616 s, Technical NVDA 3,272 s und Supertrader NVDA 2,820 s. Ein früher Kurs bedeutet keine vollständig geladene Analyse.

Was noch fehlt:

- **Technical:** Instrument-/Namensdaten und parallel geladene Engine-Skripte bleiben Teil des Starts. Die Kursdaten brauchen Vorrang vor Downloads/Parsing der Engines (z. B. Engines erst nach dem ersten Kurs-Paint) oder eine kleinere, ausschließlich kanonisch projizierte Kopfantwort. Die Fachrechnungen bleiben unverändert.
- **Supertrader:** Der Kopf wartet auf den restlichen Seitenstart. Eine getrennte frühe Anzeige aus dem bestehenden kanonischen Stock-Shard braucht mehr Abstand zur 3-s-Grenze; der jetzige Median reicht wegen des Ausreißers nicht als stabile Abnahme.
- **Quant/LCP:** Der frühe Kopf entkoppelt den ersten Kurs, die vollständige Initialisierung mit Bundle, Stock-Paket, Daten und Renderarbeit bleibt groß. Weitere Aufteilung bzw. Arbeit nach dem ersten Viewport ist nötig. Inlining verschiebt Code ins HTML und spart Roundtrips; die gesamten Wire-Bytes einschließlich HTML stehen oben. Kein großer Gesamt-Bytegewinn wird behauptet.

**Qualität:** 24 Hell-/Dunkel-Ansichten einschließlich Analysten-Dialoge: 0 axe-Kontrastverstöße, 0 beanstandete geprüfte Tippflächen, 0 JavaScript-Seitenfehler; Fokusfalle/Escape/Rückgabe und feste Kopfposition bestanden. Axe-`incomplete` bleibt im Bericht und ersetzt keine manuelle Kontrast-/Screenreader-Abnahme. Discover: 129.698 decoded Bytes / 7 Budget-Ressourcen. Quant: 46 Ressourcen ohne Hauptdokument / 3.061.032 decoded Bytes; das ist eine andere Zählung als die CDP-Requestspalte. Beide unveränderten Budgets eingehalten. Offline-Hinweis, Logo-Cache und verweigerter neuer Datenabruf bestanden.

[QA-Rohdaten](e5/final/quality.json), [Zusammenfassung](e5/final/quality-summary.json), [früher Kopf bei blockiertem Router/Engines](e5/final/early-head.json), [Quant-Smoke](e5/final/quant-smoke.json). Die Browser-Asset-Hashes der letzten Messung und der Abschluss-QA sind identisch. Danach ändern sich nur Dokumentation, Testeinbindung und Akademie-Test-Synchronisation; die abschließende main-Rebase bringt keinen anderen ausgelieferten Browsercode außerhalb der App. Aktuelle CI-Ergebnisse stehen in den PRs. Strang A prüft und mergt.


## Historische Messung aus Paket 1 (06.11.; andere Ausgangsrevision)


Messung **vor Produktänderungen**, lokaler main-Release `bbe59a3ca48e`, Chromium 156.0.8078.79.
Build mit `scripts/vu2/build-release.mjs`, danach dieselbe Minifizierung wie
Pages (esbuild 0.25.10). Kein Overlay von `data/live` oder privaten
Consumer-Daten; dies ist **keine Produktions-/Gerätemessung**.

390 × 844, DPR 2, Touch; 4G: 1,6 Mbit/s Down, 0,75 Mbit/s Up, 150 ms;
CPU-Faktor 4. Kalter Kontext je Route, HTTP-Cache aus, SW blockiert. Ein
Ausgangslauf je Route, 20 s Beobachtung nach Navigation-Commit. Einzelwerte,
keine statistisch abgesicherten Mediane. LCP und CLS aus PerformanceObserver;
TBT* ist der Labor-Ersatz aus Long Tasks ab FCP bis Messende, kein Feld-INP
und kein Lighthouse-TBT. Details und Wiederholung: [Messskript](../../scripts/mobile/README.md).
Rohdaten mit jeder Ressource und jedem Fehler: [before.json](e5/before.json).

| Route | LCP s | CLS | TBT* ms | Wire KiB | Requests | Erster sichtbarer Aktienkurs s |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 2.456 | 0.000 | 0 | 72.2 | 10 | – |
| `/quant/` | 3.416 | 0.306 | 634 | 543.4 | 25 | – |
| `/quant/#/aktie/NVDA` | 14.596 | 0.058 | 4050 | 882.4 | 47 | 12.586 |
| `/technical/#/chart/NVDA` | 12.984 | 0.058 | 5544 | 548.5 | 56 | 12.855 |
| `/fundamental/#/NVDA` | 7.964 | 0.001 | 3272 | 1313.9 | 28 | 7.841 |
| `/supertrader/` | 12.416 | 0.662 | 7189 | 594.5 | 24 | – |
| `/supertrader/stock/NVDA/` | 7.480 | 0.826 | 1410 | 304.9 | 32 | 7.911 |
| `/discover/` | 2.968 | 0.039 | 3270 | 1078.4 | 131 | – |
| `/quant/musterdepots/` | 3.556 | 0.000 | 1618 | 170.1 | 12 | – |
| `/analysten/` | 2.768 | 0.294 | 734 | 86.2 | 10 | – |
| `/mein-dashboard/` | 1.884 | 0.051 | 46 | 219.4 | 29 | – |

„Erster Kurs“ zählt ausschließlich einen sichtbaren Zahlenwert im gemeinsamen
Aktienkopf (`.vu-shead-value`), nach einem Animationsframe; Datum und
Navigationszähler zählen nicht. „–“ bedeutet innerhalb des Fensters nicht
sichtbar bzw. keine Aktien-Detailroute. Wire enthält HTTP-Header.

Befunde: Startseite und Dashboard erreichen in diesem Ausgangslauf LCP < 2,5 s;
neun Routen verfehlen es. CLS ist auf Quant-Start, beiden Supertrader-Routen
und Analysten ≥ 0,1. Quant/Technical/Fundamental warten lange auf den ersten
sichtbaren Kurs. Discover startet 131 Requests. Keine offenen Requests am
Messende auf zehn Routen; Dashboard zählt einen fehlgeschlagenen Abruf als
nicht abgeschlossen. Kein JavaScript-Seitenfehler. Startseite: optionales `favicon.ico`
404. Dashboard: Konto-Session-Endpunkt mit HTTP 403/CORS (siehe Rohdaten);
kein authentifizierter Watchlist-Test. Diese Fehler nicht als bestandene
Funktionsprüfung auslegen.

Paket 1 änderte nur Messwerkzeug und Dokumentation. Dieser historische Einzelstand
ist nicht die Vergleichsbasis der Abschlussmessung oben; ein echter Gerätetest bleibt offen.


Frühere Paket-2-Diagnose mit zeitweiser Git-CPU-Last: [baseline-repeat.json](e5/baseline-repeat.json), [loading-repeat.json](e5/loading-repeat.json). Keine Zielabnahme; maßgeblich ist die kontrollierte Abschlussmessung oben.

---

## Historischer Befund vom 03.11.2026


# Mobile Performance: Messung gegen den gebauten Release, Maßnahmen

**Stand:** 03.11.2026 (Phase 2) · Werkzeug: `app/scripts/measure-payload.mjs [--root <Release>] [--slow]`
Chromium, iPhone-Viewport 390×844, gzip wie GitHub Pages. Nicht WKWebView, nicht auf dem Gerät [offen].

## Korrektur an Phase 1

Der Phase-1-Bericht nannte `factors-FULL_UNIVERSE.json` (19,1 MB entpackt) als größten Befund der Quant-Aktienseite. Das war eine **Fehlmessung**: Ich habe den **Quelltext** des Repositorys ausgeliefert. Produktion liefert den **gebauten Release** aus, und dieser erzeugt die Faktor-Shards selbst (`scripts/vu2/build-release.mjs`, nicht committet):

- `quant/api/product-services.js` (`factorsFor`) lädt zuerst `/quant/data/market/factors/product-shards/<shardKey>.json`. Nur ohne Shard fällt es auf `factors-FULL_UNIVERSE-product.json` und zuletzt auf die volle Datei zurück.
- Im Quelltext gibt es diese Shards nicht (Ordner fehlt, 404). Deshalb lud meine Messung die 19 MB.
- Auch die Technical-Signale sind im Release feiner geteilt (`technical-signals-v1/by-ticker/NVDA.json.gz`, 55 KB statt des 741-KB-Buckets `NV`).

Konsequenz: Phase 1 hat Quant-Aktie um etwa das Dreifache (Übertragung) bzw. Siebenfache (entpackt) überschätzt. Die Messung unten gilt für den gebauten Release.

## Messung (gebauter Release, lokal ohne Drosselung)

| Bereich | Anfragen | Wire | Dekodiert | JSON | JS-Heap | 404 |
|---|---:|---:|---:|---|---:|---:|
| Discover Start | 127 | 1,15 MB | 3,7 MB | 17 / 229 KB | 6,5 MB | 0 |
| Discover Aktie (NVDA) | 119 | 1,26 MB | 5,0 MB | 18 / 649 KB | 7,7 MB | 0 |
| Quant Start | 25 | 0,76 MB | 2,1 MB | 4 / 54 KB | 5,5 MB | 0 |
| **Quant Aktie (NVDA)** | **47** | **1,07 MB** | **3,6 MB** | 23 / 195 KB | **10,8 MB** | 0 |
| Technical | 25 | 0,22 MB | 0,68 MB | 2 / 60 KB | 2,2 MB | 0 |
| Supertrader | 20 | 0,61 MB | 5,1 MB | 8 / 449 KB | 7,1 MB | 0 |
| Konto (Web) | 16 | 0,10 MB | 0,30 MB | 0 | 2,0 MB | 0 |

Gedrosselt (1,6 Mbit/s, 150 ms Latenz), gebauter Release:

| Bereich | Anfragen | Wire | Zeit bis ruhig | JS-Heap |
|---|---:|---:|---:|---:|
| Discover Start | 126 | 1.12 MB | 24.3 s* | 6 MB |
| Discover Aktie | 119 | 1.23 MB | 8.8 s | 7.8 MB |
| Quant Start | 24 | 0.74 MB | 5.3 s | 5 MB |
| Quant Aktie | 47 | 1.05 MB | 7.2 s | 9.1 MB |
| Technical | 25 | 0.22 MB | 2.2 s | 2.2 MB |
| Supertrader | 20 | 0.59 MB | 4.4 s | 7.1 MB |
| Konto (Web) | 16 | 0.10 MB | 2.4 s | 2 MB |

\* Discover Start erreicht in 20 s keinen ruhigen Netzzustand (Maß ist die Wartegrenze, kein Ladeende). Quant Aktie braucht im Release 7,2 s statt 21,8 s im Quelltext (Phase 1).
Zeit bis ruhig ist nicht „bedienbar“; auf dem Gerät zu messen [offen].

Quelltext-Messung (Phase 1) bleibt als Vergleich für die Frage „was passiert ohne Shards“: Quant Aktie 3,55 MB Wire, 25,7 MB entpackt.

## Rangliste der tatsächlichen Probleme (Release)

| # | Bereich | Befund | Maßnahme (eigener Produkt-PR, hier nicht umgesetzt) | Erwarteter Effekt |
|---|---|---|---|---|
| 1 | Supertrader | `supertrader/data/signals-core.json`: 336 KB Wire, **4,2 MB entpackt** beim Start. Parsen und Heap auf dem Telefon. | Startseite aus einem kleinen Index (Zähler, Kopfzeilen); Details je Aktie aus den vorhandenen Shards unter `supertrader/data/stock/`; Feldliste je Ansicht wie bei der Quant-Projektion | entpackt unter 1 MB |
| 2 | Discover Start | 127 Anfragen, 91 Skripte in der Seite; erreicht in 20 s keinen ruhigen Netzzustand. Zwei Themenbilder 86–105 KB. | Skripte bündeln (wie `release-bundle.js` bei Quant); Bilder verzögert laden und kleiner (≤ 40 KB); Ursache des Dauerverkehrs klären (Live-Abruf/Polling) | Anfragen < 40; „ruhig“ nach wenigen Sekunden |
| 3 | Discover Aktie | `discover/logos/credits.json` 324 KB Wire, 1,7 MB entpackt, für eine Aktie | Nachweise nur bei Bedarf laden oder je Wertpapier teilen | −1,7 MB entpackt |
| 4 | Discover Aktie | `quant/data/technical/instruments/NVDA.json` 112 KB / 547 KB | Nur bei geöffnetem Chartbild laden, Zeitraum begrenzen | −0,5 MB beim Start |
| 5 | Alle | `quant/data/market/intraday/index.json` 47 KB / 473 KB auf jeder Seite | Nur die gebrauchten Tickers (Index je Shard) | −0,4 MB entpackt |
| 6 | Quant Aktie | `release-bundle.js` 365 KB Wire / 1,2 MB entpackt + `pack-stock.js` 161 KB / 568 KB | Ist bereits nach Ansicht geteilt (Pakete); weiteres Aufteilen nur bei Gerätemessung | gering |
| 7 | Quelltext/Entwicklung | Ohne Release-Build lädt die Quant-Aktie die volle 19-MB-Datei. Nur lokal relevant. | Entwicklungsserver mit Release-Projektion, oder die App immer gegen einen Release testen | nur Entwicklung |

Die `factors-FULL_UNIVERSE.json` selbst bleibt als Quelle der Shards unverändert. Für die **App** gilt: Sie lädt dieselben Release-Dateien wie die Webseite. Es gibt **keine** zweite Datenform.

## Bedarfsgerechtes Nachladen: Entwurf für die App (nicht umgesetzt)

1. **Auf dem Gerät messen vor weiterer Arbeit.** Die Zahlen oben sind Chromium. Erst Zeit bis „bedienbar“ (Interaction to first paint) und Speicher in Instruments auf einem iPhone mit Mobilfunk messen. Danach Rang 1 bis 3 gezielt angehen.
2. **Je Ansicht eine Datenzusage:** Jede Produktansicht nennt ihre Dateien und ein Byte-Budget (wie das bestehende Discover-Budget in `scripts/discover/browser-qa.mjs`). Ein Gate je Produkt, nicht in diesem PR.
3. **Listen mit Index, Detail mit Shard:** Muster ist bereits vorhanden (Faktoren, Technical je Ticker, Supertrader `stock/`). Übertragen auf Supertrader-Start und Discover-Nachweise.
4. **HTTP-Cache für die App:** GitHub Pages sendet `cache-control: max-age=600`. Für die App reicht das nicht als Offline-Ersatz. Ein Cache für **Marktdaten** wäre fachlich falsch (veraltete Kurse), siehe `sw.js`. Offline bleibt deshalb ein Hinweis, kein Datenstand.
5. **Prefetch nur im WLAN** (Network-Plugin liefert Verbindungsart), nie für Marktdaten.

## K3: Hauptseiten nach E5 + K2 (07.11.2026, Strang K)

Werkzeug `scripts/mobile/measure.mjs` (E5-Labor: Chromium 390×844, DPR 2, Touch, 1,6 Mbit/s, 150 ms, CPU×4, kalt, SW blockiert, 3 Läufe, Median), lokaler Release aus `claude/k2-page-transitions` (E5-Stapel + K2). Kein echtes iOS-WebKit verfügbar (nur Chromium installiert); Laborwerte, keine Produktions- oder Gerätemessung.

| Route | LCP s | erster Kurs s | CLS | Requests |
|---|---:|---:|---:|---:|
| `/mein-dashboard/` | 0,72 | – | 0,000 | 33 |
| `/quant/musterdepots/` | 1,10 | – | 0,000 | 16 |
| `/quant/#/aktie/NVDA` | 1,42 | 1,40 | 0,055 | 51 |
| `/supertrader/stock/NVDA/` | 1,88 | 2,59 | 0,054 | 36 |
| `/supertrader/` | 2,05 | – | 0,013 | 23 |
| `/technical/#/chart/NVDA` vorher | 3,08 | 3,08 | 0,052 | 61 |
| `/technical/#/chart/NVDA` nach K3 | **2,43** | **2,42** | 0,055 | 61 |

Größte Bremse war der Technical-Kurs: das Instrument (`technical-signals-v1/by-ticker/<T>.json.gz`) wurde erst nach 18 Seitenskripten angefragt. K3 fordert es per Preload im `<head>` an (Adresse geprüft gegen `technicalPaths()[0]`, `technical/tests/early-instrument.test.mjs`).

Supertrader-Aktie (Strang L3, 08.11.2026): Der Kurs wartete auf eine Kette aus Nachlade-Skripten (`st-redesign.js`, dann `identity.js` → `stock-context.js` → `stock-navigator.js` nacheinander) und erst danach auf `discover-series/<securityId>.json`. Der Seitengenerator (`scripts/supertrader/build.mjs#stockPreloads`) kündigt jetzt die fünf Skripte und die Kursreihe im `<head>` an; die Kennung bildet `core/identity.js` (ADR-001), `loadScript` übernimmt den Preload samt Release-Stempel (`scripts/supertrader/tests/stock-preload.test.mjs`). Lokal gemessen (`scripts/mobile/measure.mjs`, 4G/CPU×4, je 6 Läufe, NVDA): Kurs im Kopf 2,88 s → 2,28 s (Median), gleiche 36 Anfragen, LCP 2,09 → 2,17 s. Zusätzlich `registry-core.json` und `stock/<SYM>.json` vorzuladen war langsamer (2,35 s, teilen sich die Leitung) und ist bewusst weggelassen. Die ~1.500 Aktienseiten übernimmt der nächste Lauf von `supertrader-signals.yml` (Erzeuger), nicht der PR. Ziel „Erstaufruf < 2 s“ erreichen damit 4 der 6 Hauptseiten (LCP); Technical und Supertrader-Start liegen knapp darüber. Produktwechsel mit vorgeladenem Ziel (K2, TTFB ≈ 2 ms): erster Inhalt Quant → Supertrader 0,12 s, Discover → Quant 1,17 s (Quant lädt viele eigene Skripte). Untertabs innerhalb eines Produkts sind SPA-Routen ohne Dokumentwechsel.
