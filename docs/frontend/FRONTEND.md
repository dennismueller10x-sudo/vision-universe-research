# Frontend: technischer Zustand

Audit vom 03.10.2026. Ein Redesign war ausdrücklich **nicht** Ziel. Hier geht es nur um die technische Qualität der Oberfläche.

## Seiten und Gewicht

| Einstieg | JS | JSON beim Laden | Befund |
|---|---|---|---|
| `/discover/` | 68 Dateien, 1,3 MB (ungebündelt) | ca. 820 KB, nach Scrollen ca. 2 MB, Suche +830 KB | groß, aber gestückelt |
| `/quant/` (SPA) | 71 Dateien, 1,28 MB (Release-Bündel) | Screener/52W/Pro/Watchlist: **18,8 MB** Faktoren + 1,2 MB Capability; Aktie: 1,2 MB | P1-Performance |
| `/supertrader/**` (822 Seiten) | 146 KB | **3,6 MB** (`signals.json` 3,2 MB + `registry.json`) auf **jeder** Seite, mit `cache: no-cache` | P1-Performance |
| `/hedgefonds/` | inline | 2,15 MB | wird im Branch `claude/hedgefonds-relaunch` neu gebaut |
| `/news/`, `/morning/`, `/macro/`, `/academy/` | klein | klein | – |

Kein Service Worker, kein Manifest, keine Content-Hashes an JS/CSS (Ausnahmen: `dashboard ?v=7`, `news.js?v=3`).

## Behobene Fehler

| Fehler | Ort | Fix |
|---|---|---|
| Startseite sprang nach dem Laden nach oben (zweites Rendern durch `vu-fx-ready`); jeder Währungswechsel sprang nach oben | `discover/app.js` | Neuberechnung am Platz behält die Position. **Offen:** Zurück landet weiter oben; die Wiederherstellung passt nicht in das Budget der Discover-View-Dateien (180 KB, `browser-qa.mjs`) und gehört in ein gemeinsames Navigationsmodul | Zurück stellt die Position wieder her |
| Veraltete Kurse auf Karten ohne Kennzeichnung (AIXC −39 % vom 29.09.) | `discover/ui/cards.js` | „Stand 29.09.“, keine Tagesänderung |
| Penny-Kurse als „0,00 $“ | Karten, Aktienkopf, Chartachse | unter 1 $ vier Nachkommastellen |
| Eingefrorener Intraday-Stand als „heute“, neben einem anderen Schlusskurs | `source-state.js`, `quant/app/chart.js` | Wochentag statt „Heute“, nicht live heißt datiert |
| News: „Maximal 24 Stunden alt“ bei einem 12 Tage alten Feed | `news/news.js` | echtes Alter, Hinweis bei Veraltung |
| News: `javascript:`-URLs aus dem Feed ausführbar | `news/news.js` | nur http(s) bzw. eigener Pfad |
| 11 Supertrader-Links auf nicht erzeugte Seiten (404) | `scripts/supertrader/build.mjs` | Seiten für alle verlinkten Symbole (**PR #387**) |
| Leere Academy-Seite bei einem Ladefehler | `academy/app.js` | Hinweis mit „Neu laden“ |
| Tooltip-Absturz bei fehlendem Datum | `supertrader/assets/st-chart.js` | Guard (**PR #387**) |
| „undefined.undefined.26“ in Achsen | `quant/ui/charts.js` | Guard |
| Legacy-Chart mit Rohkursen über Splits | `quant/stock/app.js` | Split-Bereinigung (`return-series.js`) |

## Komponenten: Duplikate (nicht abstrahiert – Begründung unten)

| Baustein | Varianten |
|---|---|
| Zahlen-/Preis-/Prozentformatierung | ≥ 25 eigene Funktionen. Ein zentrales Modul existiert: `quant/engines/fx/money-format.js` |
| Datum ISO→DE | ≥ 8 |
| Aktienkarte | ca. 8 Familien |
| Horizontale Rail | 5 |
| Chart (SVG) | ca. 12 Module |
| Laden / Leer / Fehler | 7 / 9 / 7 |
| Frische-Badge | 6 |
| `esc()` | 5 Kopien |

**Entscheidung:** Ein Komponentensystem quer über alle Produkte wäre ein Umbau aller Seiten mit hohem Regressionsrisiko. Das wäre ein Redesign-Projekt, kein Härtungsprojekt.
Vereinheitlicht wurde dort, wo ein **inhaltlicher** Fehler entstand:
- Preisrundung und Preisdarstellung (eine Regel für unter 1 $),
- Frische-Beschriftung (`source-state.js`),
- Identität der Chartpfade.

Empfohlene Reihenfolge, wenn Seiten ohnehin angefasst werden:
1. `money-format.js` als einzige Formatierung (Platzhalter „–“, Minuszeichen „−“).
2. Ein `esc()` plus `safeUrl()` in `assets/`.
3. Gemeinsame Zustände Laden, Leer, Teilweise, Veraltet, Fehler, Offline mit einheitlicher Sprache (§ Fehlererfahrung).

## Fehlererfahrung (Leitlinie)

| Zustand | Sprache (Beispiel) | Nie |
|---|---|---|
| Laden | Skeleton der Zielgröße, keine Layoutverschiebung | leere Fläche |
| Keine Daten | „Für diesen Titel liegen keine Fundamentaldaten vor (keine SEC-Meldung).“ | „--“, „NaN“ |
| Teilweise | „Fundamentaldaten unvollständig · Stand 23.09.“ | stillschweigend weglassen |
| Veraltet | „Stand 29.09. · nicht der letzte Handelstag“ | als heutig zeigen |
| Fehler | „Gerade nicht erreichbar“ + Erneut-Knopf | leere Seite, Stacktrace |
| Offline | „Offline – angezeigt wird der zuletzt geladene Stand von …“ | – (heute nicht vorhanden, PWA-Stufe) |

## Mobile, Safari

- Der Viewport ist auf allen Seiten gesetzt. Touch-Listener der Rails und des Screener-Sheets sind passiv. Charts nutzen Pointer Events mit `touch-action: pan-y`.
- **Offen:**
  - `100vh` in `discover/discover.css:176`, `discover/detail.css:344`, `hedgefonds`, `etf`, `analysten`, `magazin/01`. Besser `dvh`.
  - `DecompressionStream` wird für die gzip-Artefakte vorausgesetzt (Safari < 16.4 ohne Ersatz).
  - Supertrader-Hinweise stehen nur im `title=`-Attribut und sind auf Touch-Geräten nicht sichtbar.

## Empfohlene Performance-Arbeiten (gemessen, nicht umgesetzt)

1. **Supertrader:** `signals.json` je Symbol und je Strategie sharden. Eine Aktienseite braucht nur ihr Symbol: 3,6 MB → ca. 10 KB.
   Wurde nicht umgesetzt, weil Supertrader parallel aktiv weiterentwickelt wird (R12). Konfliktrisiko.
2. **Quant-Screener:** `factors-FULL_UNIVERSE.json` (18,8 MB) durch `factor-evidence-v1/screening.json.gz` (ca. 95 KB) ersetzen.
   Vorher ist ein Ergebnisvergleich nötig (Produktlogik).
3. **Cache:** `cache: 'no-cache'` nur für Frischedaten, nicht für versionierte Artefakte. Statische Assets mit Content-Hash.
