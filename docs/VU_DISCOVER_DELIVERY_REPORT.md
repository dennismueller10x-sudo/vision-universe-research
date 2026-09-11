# VISION UNIVERSE® DISCOVER — Abnahmebericht

Stand: 2026-09-11 · Branch `claude/vision-universe-discover-h93fmv`

## 1. Was wurde gebaut?

Ein eigenstaendiges Discovery-Modul unter `/discover/`. Beim Oeffnen zeigt
es ohne jede Eingabe, wo gerade Marktfuehrerschaft entsteht: horizontale
Kartenreihen fuer neue 52-Wochen-Hochs, Marktfuehrer, Momentum,
Breakout-Watch, relative Staerke, intakte Trends und Sektorfuehrer. Dazu
Kategorieseiten mit Filtern, eine globale Suche und eine Detailansicht mit
Chart, technischen Ueberlagerungen, Score-Herleitung und Technical-
Intelligence-Panel.

Routing (statisch, Hash-basiert, ohne Server):
`#/` · `#/u/<UNIVERSUM>` · `#/c/<UNIVERSUM>/<kategorie>` · `#/s/<UNIVERSUM>/<TICKER>`

## 2. Welche Dateien wurden neu erstellt?

**Modul**
```
discover/index.html                         Seite
discover/app.js                             Router, Startseite, Kategorie, Suche
discover/discover.css                       Design-Layer (erweitert quant.css)
discover/methodology/discover-v1.json       Gewichte, Schwellen, Zeilen, Filter
discover/engines/contract.js                Discover-Datenvertrag
discover/engines/high52w.js                 52-Wochen-Hoch-Engine
discover/engines/scoring.js                 Leadership/Momentum/RS/Breakout, Perzentile
discover/engines/indicators.js              EMA, SMA, RSI, MACD, Bollinger, ATR, rel. Volumen
discover/engines/technical-intelligence.js  Elliott-/TI-Layer (liest, erzeugt nicht)
discover/engines/realtime-source.js         Sitzung, Aktualitaet, Tick-Anwendung
discover/ui/cards.js                        Karte, Reihe, Jahresspanne, Sparkline, Zustaende
discover/ui/detail.js                       Detailansicht, Chart, Ueberlagerungen, Panels
discover/tests/*.test.mjs                   6 Testdateien, 82 Tests
discover/data/**                            651 vorberechnete Payloads (9,8 MB)
```

**Werkzeuge**
```
scripts/discover/build-discover-data.mjs    Aggregation (der "Server" dieses Repositories)
scripts/discover/verify-discover-data.mjs   Nachrechnung, ~7.600 Pruefungen
scripts/discover/browser-qa.mjs             21 Browser-Pruefungen (Playwright, ausserhalb CI)
.github/workflows/discover-ci.yml           Eigener Workflow
docs/VU_DISCOVER_ARCHITECTURE.md            Architektur
docs/VU_DISCOVER_DELIVERY_REPORT.md         dieser Bericht
```

## 3. Welche bestehenden Komponenten/APIs wurden wiederverwendet?

| Wiederverwendet | Wofuer |
|---|---|
| `quant/engines/market-factors.js` | **Alle** Kennzahlen beider Universen — eine Definition |
| `quant/engines/display-policy.js` | Entscheidet je Titel ueber die Auslieferung einer Kursreihe |
| `quant/config/feature-gates.json`, `development-preview.json` | Gates und Titel-Allowlist |
| `quant/ui/technical-chart.js`, `quant/ui/charts.js` | Der grosse Chart und alle Indikator-Panels |
| `quant/engines/chart-ranges.js` | Zeitraumleiste inkl. gesperrter Intraday-Zeitraeume |
| `quant/engines/realtime/market-hours.js` | Sitzungszustand (OPEN/PRE/AFTER/CLOSED) |
| `quant/data/technical/instruments/*.json` | Bars, S/R, Fibonacci, Marktstruktur, Elliott |
| `quant/data/market/**`, `quant/data/securities.json` | Universen, Faktoren, Marktkapitalisierung |
| `quant/engines/mock-generator.js`, `mock-provider.js` | Modelluniversum |
| `quant/ui/shell.js`, `quant/ui/quant.css` | DOM-Hilfen, Laden, Design-Tokens |

## 4./5. Wurde eine bestehende Datei veraendert?

**Eine, mit einer Zeile:** `assets/site-navigation.js` — der Menueeintrag
`['Discover', '/discover/']`.

Zwingend, weil das Modul sonst nur ueber die direkte URL erreichbar waere.
`scripts/NAVIGATION.md` benennt genau diese Liste als den vorgesehenen Ort
fuer neue Hauptmenues ("Neue Hauptmenues nur in der Liste `items`
ergaenzen"). Keine Struktur, kein Markup, kein Verhalten geaendert.

Sonst keine. Der CI-Workflow prueft das bei jedem Pull Request: eine
Aenderung unter `quant/`, `providers/`, `scripts/quant`, `scripts/technical`,
`scripts/market`, `dashboard/`, `macro/` oder `academy/` laesst den Lauf
fehlschlagen.

## 6. Welche Discovery Categories funktionieren?

| Kategorie | US_REAL (498 Titel) | VU_MODEL (482 Titel) |
|---|---|---|
| New 52-Week Highs | 53 Treffer | 244 |
| Market Leaders | 497 bewertet | 482 |
| Momentum Leaders | 497 | 482 |
| Breakout Watch | 8 | 0 (Leerzustand mit Begruendung) |
| Relative Strength | 497 | 482 |
| Trend Intact | 97 | 64 |
| Sector Leaders | 9 kuratierte Sektoren | 11 Sektoren |

Die leere Breakout-Zeile im Modelluniversum ist ein Befund, kein Fehler:
das synthetische Volumen kennt keine Sprünge ueber das Doppelte des
20-Tage-Schnitts. Die Oberflaeche sagt das.

## 7. Welche Daten sind realtime?

**Keine.** `ENABLE_PUBLIC_LIVE_MARKET_DATA` ist `false`, und fuer Realtime
liegt keine Anzeigeerlaubnis vor. Discover zeigt deshalb `SCHLUSSKURS` mit
Datum sowie den echten Sitzungszustand aus dem Handelskalender — nie einen
LIVE-Punkt ohne Live-Daten.

Die Schicht ist verdrahtet und getestet (`discover/engines/realtime-source.js`,
12 Tests): sobald Gate, Erlaubnis und eine Kursquelle vorhanden sind, meldet
sie `live` und `applyTick` aktualisiert Kurs, Tagesveraenderung,
52-Wochen-Hoch-Signal und Intraday-Ausbruch — und nichts sonst.

## 8. Welche Daten werden periodisch berechnet?

Im Build (`scripts/discover/build-discover-data.mjs`): Leadership-,
Momentum-, RS- und Breakout-Score, alle Perzentile, Renditen ueber
1/3/6/12 Monate, relative Staerke gegen SPY, gleitende Durchschnitte,
Volatilitaet, Drawdown, Volumenverhaeltnisse, 52-Wochen-Abstaende,
Sektorraenge, Badges und Sparklines.

## 9. Welche technischen Indikatoren funktionieren?

Im Chart zuschaltbar: **EMA 20/50/100/200, SMA 50/200, Bollinger 20/2,
52-Wochen-Hoch/Tief**, sowie aus dem bestehenden Bundle **Support/Resistance,
Marktstruktur, Fibonacci, Elliott (Beta)**. Als Panels: **Volumen,
relatives Volumen, RSI 14, MACD 12/26/9, ATR 14**.

Alle Indikatoren sind gegen die bestehende Technical-Engine nachgerechnet
und treffen deren Werte (`discover/tests/indicators.test.mjs`) — auch der
Unterschied zwischen den beiden Volumendefinitionen des Repositories ist
benannt und getestet, statt stillschweigend vermischt zu werden.

## 10. Was ist fuer Technical Intelligence / Elliott Wave vorbereitet?

`discover/engines/technical-intelligence.js` ist die Erweiterungsschnittstelle.
Sie liefert je Ebene einen der vier Zustaende `unavailable`, `calculating`,
`available`, `lowConfidence`. Heute angeschlossen: Elliott Wave (Beta),
Marktstruktur, Support/Resistance aus den vorberechneten Bundles. Weitere
Ebenen erscheinen ohne Aenderung der Oberflaeche.

**Es wird keine Wellenzaehlung erzeugt.** `AMBIGUOUS` bleibt `AMBIGUOUS`,
eine Methodengeguete unter 50 wird herabgestuft, und die Confidence bleibt
ein Method Fit — keine Wahrscheinlichkeit. Ein Test stellt sicher, dass ein
`unavailable`-Befund weder Welle noch Konfidenz traegt.

## 11. Welche Tests wurden ausgefuehrt?

```
node --test "discover/tests/*.test.mjs"           82 Tests, 82 bestanden
node scripts/discover/verify-discover-data.mjs    7.643 Nachrechnungen, 0 Abweichungen
node --test "quant/tests/*.test.mjs"              684 Tests, 684 bestanden (unveraendert)
node scripts/quant/verify-quant-data.mjs          bestanden
node scripts/technical/verify-technical-data.mjs  (unveraendert)
node scripts/market/assert-no-secrets.mjs         keine Zugangsdaten
```

Abgedeckt: 52-Wochen-Hoch (Split, Gleichstand, Tageshoch vs. Schlusskurs,
veralteter Kurs, fehlende Referenz, Kursartenkonflikt, zu kurze Historie),
Leadership Score (von Hand nachgerechnet, fehlende Komponenten, Abdeckungs-
Schwelle, Beitragssumme), Perzentile mit Bindungen, Breakout-Logik,
Indikatoren gegen die bestehende Engine, Contract-Verstoesse, Elliott-
Uebersetzung, Realtime-Zustandsmaschine, Tick-Anwendung, Payload-Groessen
und die Zahl der Abrufe je Startseite.

Zwei echte Fehler haben die Tests gefunden und sie sind behoben: eine
Historien-Schwelle, die nie greifen konnte, und eine Volumendefinition, die
von der bestehenden Engine abwich.

## 12. Welche Browser-QA wurde durchgefuehrt?

`node scripts/discover/browser-qa.mjs` — **21 von 21 bestanden**, Chromium,
Desktop 1440×900 und Telefon 390×844:

Startseite baut alle Zeilen auf · jede Zeile zeigt Karten oder einen
benannten Leerzustand · keine Karte zeigt `NaN`/`undefined`/`0,00 $` ·
24 Karten einer Kategorie unter 3 s · Filter greift und meldet den leeren
Fall · Kartennavigation · Suche mit und ohne Treffer · Chart-Aufbau ·
Zeitraumwechsel · gesperrte Zeitraeume mit Begruendung · Ueberlagerungen
zuschaltbar · Indikator-Panels · Titel ohne Kursreihe nennt den Grund ·
Elliott nie als Ergebnis ohne Befund · keine Konsolenfehler · mobil: kein
seitlicher Ueberstand, wischbare Reihen, Chart in Bildbreite, tippbare
Zeitraumleiste.

Visuell geprueft und iteriert wurden: Startseite, Kategorieseite
(52-Wochen-Hochs, Market Leaders), Sektorreihen, Detailseite mit und ohne
Kursreihe, Chart mit Ueberlagerungen, Modelluniversum — jeweils Desktop und
Mobil. Dabei behoben: unsichtbare Reihen ohne Scroll-Ereignis, uneinheitliche
Kartenhoehen, ein rot gefaerbter Normalzustand, abgeschnittene Beschriftungen,
ein SMA 200, der im Ein-Jahres-Chart erst nach 200 Tagen begann, ein Chart mit
erzwungener Mindestbreite auf dem Telefon und eine erste Karte, die am
Bildschirmrand klebte.

## 13. Live-/Preview-URL

* **Nach dem Merge nach `main`:** https://research.visionuniverse.de/discover/
  (GitHub Pages liefert `main` aus; der Branch ist noch nicht veroeffentlicht.)
* **Lokal geprueft:** `python3 -m http.server 8765` → http://localhost:8765/discover/
* **Branch:** `claude/vision-universe-discover-h93fmv`

## Bekannte Grenzen

* Firmennamen liegen im realen Universum nur fuer 15 kuratierte Titel vor.
* Kursanzeige und Sparkline gibt es dort nur fuer AAPL, MSFT, NVDA, JPM, XOM.
* Sektorfilter greifen nur auf den 100 kuratierten Titeln; Cap-Buckets gibt
  es nur im Modelluniversum.
* 1D/5D bleiben gesperrt, solange `ENABLE_LIVE_MARKET_DATA` aus ist.
* Der Browser-QA-Lauf ist nicht Teil der CI (keine Browser-Abhaengigkeit im
  Repository).
