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
Produktion und kein iPhone-/Screenreader-Nachweis. Die spätere Rebase auf main
`3891bf5bef8d` bringt keine Änderung am gemessenen E5-Ladecode; der bestehende
Watchlist-Vertragstest wurde an `releaseOnly` angepasst. Daten/Logos bleiben für
diesen Vergleich bewusst im festen Snapshot. Code-Referenzen und Zeitpunkte:
[provenance.json](e5/final/provenance.json). Die `commit`-Felder der ursprünglichen
Messberichte bezeichnen den ausführenden Arbeitsbaum; die tatsächlich
kompilierten Referenzen stehen im Provenienzbericht. Rohdaten bleiben unverändert.

LCP und CLS kommen aus PerformanceObserver. **TBT*** summiert blockierende
Long-Task-Anteile ab FCP bis zum Messende; es ist weder Feld-INP noch
Lighthouse-TBT. „Erster Kurs“ zählt ausschließlich einen sichtbaren Zahlenwert
in `.vu-shead-value` nach einem Animationsframe. `null`/„–“ heißt kein sichtbarer
Aktienkurs im Beobachtungsfenster bzw. keine Aktienroute, niemals 0 Sekunden.
Wire enthält HTTP-Header. Mediane ersetzen keine Einzelwertprüfung. Ein früher LCP-Wert
kann bereits Shell-/Footertext messen, obwohl der Kurs erst später erscheint;
deshalb Kurszeit und Layout-Stabilität separat bewerten.

## Paket 2 – Ladezeit (#1559): vorher / nachher

Mediane aus jeweils drei kalten Läufen. Vergleich `baseline` → `loading`; alle Einzelwerte, Ressourcen und Fehler: [baseline.json](e5/final/baseline.json), [loading.json](e5/final/loading.json).

| Route | LCP s vorher / nachher | CLS vorher / nachher | TBT* ms vorher / nachher | Wire KiB vorher / nachher | Requests vorher / nachher | Erster Kurs s vorher / nachher |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 1.288 / 1.200 | 0.000 / 0.000 | 149 / 128 | 72.1 / 72.1 | 9 / 9 | – / – |
| `/quant/` | 2.932 / 3.044 | 0.306 / 0.306 | 351 / 410 | 546.2 / 514.6 | 25 / 24 | – / – |
| `/quant/#/aktie/NVDA` | 6.740 / 7.852 | 0.062 / 0.058 | 1061 / 1840 | 885.2 / 885.2 | 47 / 47 | 5.837 / 6.216 |
| `/technical/#/chart/NVDA` | 2.148 / 2.312 | 0.742 / 0.742 | 865 / 1032 | 551.8 / 551.9 | 57 / 57 | 5.771 / 4.182 |
| `/fundamental/#/NVDA` | 1.768 / 1.740 | 0.361 / 0.361 | 1088 / 1124 | 1314.2 / 1314.3 | 28 / 28 | 2.689 / 2.578 |
| `/supertrader/` | 1.112 / 1.136 | 1.026 / 1.026 | 705 / 673 | 594.8 / 595.1 | 24 / 24 | – / – |
| `/supertrader/stock/NVDA/` | 1.108 / 1.132 | 0.764 / 0.764 | 125 / 163 | 305.4 / 305.7 | 32 / 32 | 2.914 / 3.122 |
| `/discover/` | 1.328 / 1.644 | 0.087 / 0.048 | 566 / 809 | 1078.9 / 996.2 | 131 / 56 | – / – |
| `/quant/musterdepots/` | 0.956 / 1.304 | 0.340 / 0.000 | 161 / 89 | 170.5 / 170.5 | 12 / 12 | – / – |
| `/analysten/` | 0.944 / 1.112 | 0.018 / 0.018 | 135 / 85 | 86.5 / 86.5 | 10 / 10 | – / – |
| `/mein-dashboard/` | 0.756 / 0.768 | 0.000 / 0.000 | 21 / 67 | 221.2 / 221.3 | 29 / 29 | – / – |

Zielprüfung der vier Aktienseiten (kein Bestehen nur aus einem günstigen Einzellauf ableiten):

| Aktienroute | Erster Kurs: Median / Spanne s | Läufe < 3 s | CLS: Median / Maximum | Läufe CLS < 0,1 |
|---|---:|---:|---:|---:|
| `/quant/#/aktie/NVDA` | 6.216 / 5.729–6.759 | 0/3 | 0.058 / 0.062 | 3/3 |
| `/technical/#/chart/NVDA` | 4.182 / 3.802–4.242 | 0/3 | 0.742 / 0.742 | 0/3 |
| `/fundamental/#/NVDA` | 2.578 / 2.466–2.722 | 3/3 | 0.361 / 0.361 | 0/3 |
| `/supertrader/stock/NVDA/` | 3.122 / 3.085–3.152 | 0/3 | 0.764 / 1.175 | 0/3 |

LCP < 2,5 s: 9/11 Routen im Median; CLS < 0,1: 6/11 im Median.

HTTP-/Netzfehler bleiben in den Rohdaten enthalten: /: http://127.0.0.1:43079/favicon.ico (404); /mein-dashboard/: https://konto.visionuniverse.de/v1/session (403), https://konto.visionuniverse.de/v1/session (net::ERR_FAILED).

Paket 2 allein erreicht das Aktienziel nicht: Quant 6,216 s, Technical 4,182 s und Supertrader 3,122 s im Median. Fundamental erreicht 2,578 s, springt aber im Layout. Die reservierten Ladeflächen und der frühe Kopf folgen in Paket 3. Discover sinkt von 131 auf 56 Requests; die Verzögerung des ersten Kurses auf der unverändert großen Quant-Route wird nicht als Verbesserung ausgegeben.

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
