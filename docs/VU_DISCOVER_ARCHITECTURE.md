# VISION UNIVERSE® DISCOVER — Architektur

Stand: 2026-09-11 · Modul `discover-1.0.0` · Methodik `discover-v1.0.0` ·
Contract `discover-contract-1.0.0`

## 1. Was Discover ist

Die visuelle Entdeckungsschicht von Vision Universe. Statt eines Screener-
Formulars zeigt `/discover/` horizontale Reihen von Karten: neue
52-Wochen-Hochs, Marktfuehrer, Momentum, Ausbrueche, relative Staerke,
intakte Trends und Sektorfuehrer. Ein Klick fuehrt auf eine Detailseite mit
Chart, technischen Ueberlagerungen und der Herleitung jedes Scores.

## 2. Abgrenzung: EXTEND, DO NOT MODIFY

Discover liegt vollstaendig in `discover/` und `scripts/discover/` und
schreibt ausschliesslich nach `discover/data/**`.

**Wiederverwendet (gelesen, nicht veraendert):**

| Baustein | Datei | Rolle in Discover |
|---|---|---|
| Faktorenengine | `quant/engines/market-factors.js` | Alle Kennzahlen beider Universen — eine Definition, nicht zwei |
| Anzeigerichtlinie | `quant/engines/display-policy.js` | Entscheidet je Titel, ob eine Kursreihe ausgeliefert werden darf |
| Feature-Gates | `quant/config/feature-gates.json` | Intraday/Realtime bleiben aus, solange die Gates aus sind |
| Freigabe-Allowlist | `quant/config/development-preview.json` | Die fuenf Titel mit Kursanzeige |
| Chart-Engine | `quant/ui/technical-chart.js`, `quant/ui/charts.js` | Der grosse Chart und alle Panels |
| Zeitraumlogik | `quant/engines/chart-ranges.js` | 1D/5D sind ohne Intraday-Freigabe abgeblendet, nicht erfunden |
| Sitzungskalender | `quant/engines/realtime/market-hours.js` | MARKET OPEN / PRE-MARKET / AFTER HOURS / CLOSED |
| Technical Intelligence | `quant/data/technical/instruments/*.json` | Bars, S/R-Zonen, Fibonacci, Elliott-Befund |
| Produktschicht | `quant/ui/shell.js`, `quant/ui/quant.css` | DOM-Hilfen, Laden, Design-Tokens |
| Marktdaten | `quant/data/market/**`, `quant/data/securities.json` | Universen und Faktoren |
| Modelluniversum | `quant/engines/mock-generator.js`, `mock-provider.js` | Synthetische Kursreihen |

**Veraendert:** ausschliesslich `assets/site-navigation.js`, in zwei
Schritten und beide Male ausdruecklich beauftragt:

1. Der Menueeintrag `Discover`. Ohne ihn waere das Modul nur ueber die
   direkte URL erreichbar; die Datei ist laut `scripts/NAVIGATION.md`
   genau der vorgesehene Ort dafuer.
2. Ein isolierter Theme-Zustand: `THEMES.light` (unveraenderte Werte,
   Standard fuer jede Seite) und `THEMES.dark`, das ausschliesslich greift,
   wenn `theme="dark"` am Element steht — gesetzt wird das an einer
   einzigen Stelle, in `discover/index.html`. Geaendert wurden nur
   Farbwerte; Menue, Links, Markup und Logik sind fuer alle Seiten
   identisch geblieben. Nachgewiesen von
   `discover/tests/navigation-theme.test.mjs` (Quelle) und der Browser-QA
   (fuenf fremde Seiten im Browser).

Sonst keine bestehende Datei.

## 3. Zwei Universen, getrennt gerechnet

| | `US_REAL` | `VU_MODEL` |
|---|---|---|
| Titel | 498 reale US-Werte | 482 synthetische Titel |
| Quelle | Tiingo-Faktoren (`factors-GATE_500.json`) | Mock-Generator (Seed) |
| Kurse | **nicht ausgeliefert** (Redistribution) — ausser AAPL, MSFT, NVDA, JPM, XOM | vollstaendig |
| Sparkline | nur die fuenf freigegebenen Titel | alle |
| Chart | Golden Five aus dem Technical-Bundle | 2 Jahre taeglich + 10 Jahre woechentlich |
| Sektor | 100 kuratiert, 398 ohne Zuordnung | alle |

Ranglisten, Perzentile und Scores werden **ausschliesslich innerhalb eines
Universums** gerechnet. Ein "Top 3 %" aus einem halb erfundenen Universum
waere eine Falschaussage.

## 4. Datenfluss

```
quant/data/market/factors/factors-GATE_500.json   (real, Tiingo)
quant/data/market/scale/universe-GATE_500.json    (Sektor/Boerse)
quant/data/market/golden-preview/daily/*.json     (Bars der Golden Five)
quant/data/technical/instruments/*.json           (Bundles inkl. Elliott)
quant/engines/mock-generator.js                   (Modelluniversum)
        │
        ▼  scripts/discover/build-discover-data.mjs
        │  · market-factors.js fuer beide Universen
        │  · Leadership/Momentum/RS/Breakout aus discover/methodology
        │  · Perzentile je Universum, Signale, Badges
        │  · display-policy.js entscheidet ueber jede Kursreihe
        ▼
discover/data/
  meta.json                       Gates, Universen, Realtime-Zustand
  rows/<UNIVERSE>/<row>.json      fertige Zeilen-Payloads (24 Karten)
  sectors → rows/.../sector-leaders.json
  search/<UNIVERSE>.json          Suchindex (ein Abruf)
  stocks/<UNIVERSE>/<SYM>.json    Detailseiten
        │
        ▼  discover/app.js (Hash-Router, statisch)
   Startseite = 1 Abruf meta + 1 Abruf je Zeile. Nie ein Abruf je Titel.
```

Die statische Entsprechung der im Auftrag genannten Endpunkte:

| Auftrag | Auslieferung |
|---|---|
| `GET /api/discover/52-week-highs` | `discover/data/rows/US_REAL/new-52-week-highs.json` |
| `GET /api/discover/market-leaders` | `discover/data/rows/US_REAL/market-leaders.json` |
| `GET /api/discover/momentum` | `discover/data/rows/US_REAL/momentum-leaders.json` |
| `GET /api/discover/breakouts` | `discover/data/rows/US_REAL/breakout-watch.json` |

## 4a. Experience-Schicht (Redesign)

Discover trägt eine eigene, dunkle Oberfläche — die einzige im Repository.
Sie liegt vollständig in `discover/` und ist an `body.dx` und `.dx-*`
gebunden; keine bestehende Vision-Universe-Seite kann davon betroffen sein.

| Baustein | Datei | Rolle |
|---|---|---|
| Experience-Tokens | `discover/discover.css` | `--discover-bg/-surface/-text/-radius/-card-width/-hero-height/-motion-*` |
| Eingangsfläche | `discover/ui/hero.js` | Featured-Titel mit Signal, Kennzahlen, Datenbild, Wechsel |
| Poster | `discover/ui/cards.js` | vier Formen: Rang, Landschaft, Standard, kompakt |
| Sektorkachel | `discover/ui/cards.js` | kleine Rangliste je Sektor statt Kartenstapel |
| Suche | `discover/ui/search.js` | Vollbild-Overlay, Tastatur (`/`, ↑↓, Enter, Esc) |
| Begründung | `discover/engines/narrative.js` | „Warum steht dieser Titel hier?" — deterministisch |
| Renditepfad | `scripts/discover/build-discover-data.mjs` | `performancePath`: fünf Stützstellen aus r12/r6/r3/r1 |
| Stock-Artwork | `discover/ui/artwork.js` | Das Datenbild je Titel — Verlauf, Volatilitätsband, Spannenlage, Hochmarke, Wasserzeichen |
| Farbwelten | `discover/methodology/discover-v1.json`, `discover/discover.css` | `data-world` → `--w/-2/-glow/-soft`; Atmosphäre statt gefärbter Kacheln |
| Firmennamen | `discover/config/company-names.json` | 188 kuratierte Schreibweisen, `CURATED_EDITORIAL`, nachrangig zu den vier Repository-Quellen |
| Dunkler Header | `assets/site-navigation.js` | `theme="dark"`, ausschließlich von `discover/index.html` gesetzt |

**Der Renditepfad** ist die Antwort auf die Redistributionsgrenze: aus den
freigegebenen Renditen lässt sich der Kursstand relativ zu heute
zurückrechnen (`P(-12M)/P(heute) = 1/(1+r12)`). Damit bekommt **jeder**
reale Titel einen sichtbaren Verlauf — ohne ein einziges absolutes
Kursniveau. Die Stützstellen sind markiert; zwischen ihnen wird nichts
interpoliert.

**Mehrfachnennungen** (Regeln in `discover/app.js`, `DEDUP`): die
stärksten Titel stehen naturgemäß in mehreren Ranglisten, und dass ein
Marktführer zugleich ein neues Jahreshoch macht, ist der Befund, den man
sehen will. Ein Titel darf deshalb zweimal auf der Startseite stehen, eine
Reihe verträgt höchstens drei Zweitnennungen, und derselbe Titel steht nie
in zwei gleichartigen Reihen direkt untereinander. Jede Zweitnennung sagt
als Text, woher man den Titel kennt. Sortiert wird nie um — es wird nur
entfernt, und TOP 10 wird gar nicht gefiltert. Die vollständigen
Ranglisten bleiben über „Alle anzeigen" erreichbar.

**Bewegung** folgt drei Tokens (150 / 260 / 520 ms) und respektiert
`prefers-reduced-motion` vollständig: keine Einblendungen, kein
automatischer Wechsel der Eingangsfläche, keine Hover-Skalierung.

## 5. Engines

| Engine | Datei | Aufgabe |
|---|---|---|
| Contract | `discover/engines/contract.js` | Jedes Feld traegt Wert **und** Status |
| 52-Wochen-Hoch | `discover/engines/high52w.js` | Referenz vorberechnet, Laufzeit vergleicht eine Zahl |
| Scoring | `discover/engines/scoring.js` | Leadership/Momentum/RS/Breakout, Perzentile |
| Indikatoren | `discover/engines/indicators.js` | EMA, SMA, RSI, MACD, Bollinger, ATR, rel. Volumen |
| Technical Intelligence | `discover/engines/technical-intelligence.js` | Uebersetzt den Elliott-Befund, erzeugt keinen |
| Begründung | `discover/engines/narrative.js` | Befunde und Gegenargumente aus festen Schwellen |
| Realtime | `discover/engines/realtime-source.js` | Sitzung, Aktualitaet, Tick-Anwendung |

### Market Leadership Score

0–100, deterministisch, konfigurierbar in
`discover/methodology/discover-v1.json`:

| Komponente | Gewicht | Spanne (0 → 1) |
|---|---|---|
| Abstand zum 52-Wochen-Hoch | 0.20 | −30 % → 0 % |
| Momentum 3M | 0.10 | −20 % → +40 % |
| Momentum 6M | 0.12 | −25 % → +60 % |
| Momentum 12-1M | 0.15 | −30 % → +80 % |
| Relative Staerke 12M | 0.15 | −20 % → +40 % |
| Relative Staerke 3M | 0.08 | −10 % → +20 % |
| Trendqualitaet (MA-Struktur) | 0.12 | 0 → 4 von 4 |
| Volumenbestaetigung | 0.04 | 0.7× → 1.3× |
| Drawdown-Resilienz | 0.04 | −50 % → −5 % |

Eine fehlende Komponente wird **nicht mit 0 bewertet**, sondern aus der
Gewichtung genommen; die Abdeckung steht im Ergebnis. Unter 60 % Abdeckung
gibt es keinen Score, sondern `INCOMPLETE`.

### 52-Wochen-Hoch

Vorberechnetes rollierendes Hoch (Vergleichsfenster **ohne** den aktuellen
Tag), zur Laufzeit ein Vergleich gegen eine Zahl. Beruecksichtigt:
Split-Bereinigung (`SPLIT_ADJUSTED`), Handelstage, zu kurze Historie,
veraltete Kurse (`stale` statt `false`), verschiedene Kursarten
(`priceSeriesMismatch`) und zurueckgehaltene Referenzniveaus. Beide Lesarten
der bestehenden Faktorenengine bleiben unterscheidbar: Tageshoch auf dem
Jahresmaximum (`touchedHigh`) und Schlusskurs darauf (`closeAtHigh`).

## 6. Realtime vs. periodisch (§11)

| Realtime (bei einem Tick) | Periodisch (im Build) |
|---|---|
| Kurs | Leadership Score |
| Tagesveraenderung | Momentum Score |
| Neues 52-Wochen-Hoch | Relative Staerke |
| Intraday-Ausbruch | Perzentile, gleitende Durchschnitte |

**Heute liefert Discover keine Echtzeitkurse.**
`ENABLE_PUBLIC_LIVE_MARKET_DATA` ist `false` und fuer Realtime liegt keine
Anzeigeerlaubnis vor. Die Oberflaeche zeigt deshalb `SCHLUSSKURS` mit Datum
und den tatsaechlichen Sitzungszustand — nie einen LIVE-Punkt ohne
Live-Daten. Die Schicht ist verdrahtet und getestet: sobald Gate und
Erlaubnis stehen und eine Kursquelle verbunden ist, meldet
`realtime-source.js` `live` und `applyTick` aktualisiert genau die vier
Realtime-Felder.

## 7. Elliott Wave / Technical Intelligence (§7)

Discover erzeugt **keine** Wellenzaehlung. Es liest den Befund der
bestehenden Beta-Engine aus dem Technical-Bundle und uebersetzt ihn in vier
Zustaende: `unavailable`, `calculating`, `available`, `lowConfidence`.
`AMBIGUOUS` wird nicht zu einem Ergebnis geschoent, eine Konfidenz unter 50
wird herabgestuft, und die Confidence bleibt ein Method Fit — keine
Wahrscheinlichkeit. Fuer Titel ohne Bundle steht der Grund da, wo sonst die
Zaehlung stuende.

## 8. Pruefung

```
node --test "discover/tests/*.test.mjs"        82 Tests
node scripts/discover/verify-discover-data.mjs ~7.600 Nachrechnungen
```

Die Nachrechnung prueft unter anderem, dass im realen Universum **kein**
absolutes Kursniveau ausgeliefert wird (ausser fuer die freigegebenen
Titel) — der Guard ist mit einer eingeschleusten Verletzung geprueft worden.

## 9. Grenzen dieser Fassung

* Firmennamen liegen fuer das reale Universum nur fuer 15 kuratierte Titel
  vor; die Anbieter-Tickerliste fuehrt keine Namen. Karten zeigen dann den
  Ticker, das Feld traegt `SOURCE_MISSING`.
* Sektorfilter gelten nur fuer die 100 kuratierten Titel; Marktkapitalisierung
  liegt fuer reale Titel nicht vor, deshalb gibt es dort keine Cap-Buckets.
* Charts gibt es fuer die fuenf freigegebenen realen Titel und fuer die
  Titel des Modelluniversums, die in einer Zeile erscheinen.
* Intraday (1D/5D) bleibt abgeblendet, solange `ENABLE_LIVE_MARKET_DATA`
  aus ist.
