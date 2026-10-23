# Vision Universe Chartstandard (Vorschlag, Stand 23.10.2026)

**Status:** Entwurf zur Freigabe. Dieses Dokument ändert keinen Chart. Es beschreibt den Bestand, die gemeinsame Kursdefinition, den Zielstandard und einen Migrationsplan. Produktive UI-Änderungen erst nach ausdrücklicher Freigabe des Eigentümers, je Produktwelt in einem eigenen PR (Gates siehe `CLAUDE.md`).

Leitsatz: **Einheitliche Kurswerte. Einheitliche Zeiträume. Einheitliche Bedienung. Unterschiedliche fachliche Analysefunktionen.** Datenqualität hat Vorrang vor Optik; kein funktionierender Chart wird allein der Einheitlichkeit wegen ersetzt.

Mockups (echte NVDA-Daten, hell/dunkel, 390/1280 px): https://claude.ai/artifact/6AKUFFDySim2F6ee1hAE5S (privat, Freigabe über das Teilen-Menü). Paritätsprüfung: `node scripts/quality/chart-parity.mjs`.

---

## 1. Bestand

Alle Charts sind eigenes SVG ohne Chartbibliothek. Es gibt drei Familien:

| Familie | Baustein | Wo |
|---|---|---|
| **Kurschart (Verbraucher)** | `assets/vu-chart.js` (`VUChart`, VU3) | Quant-Aktienseite, Supertrader-Aktienseite, Vorsorge-ETF |
| | `discover/ui/microchart.js` (`renderRange`, `renderIntraday`, `render`) | Discover-Detail, Discover-Karten, Märkte |
| **Technischer Chart** (Kerzen, Indikatoren) | `quant/ui/technical-chart.js` (`QuantCharts.technicalChart`) | Discover „Analyse-Chart“, Quant-Technik (verwaist) |
| | `supertrader/assets/st-chart.js` (`STChart`) | Supertrader-Methodenchart, Beispiele |
| | `quant/ui/ti-chart.js` (`VUTIChart`) | Elliott/Chartbild |
| **Mini/Analyse** | `VUScreenerCharts.sparkline`, `C.priceChart` | Screener |
| | eigene SVGs | Fundamental, Macro, Hedgefonds, Vorsorge-Portfolio/-Plan |

### 1.1 Kurscharts je Welt

| Welt / Ansicht | Datenquelle | Kursdefinition | Auflösung | Zeiträume heute (Reihenfolge, Standard) | Fachliche Overlays |
|---|---|---|---|---|---|
| **Discover** Detail | `discover-series` (270 Tage), `discover-series-long` (Woche); Golden-5: `technical/instruments`; Europa: `discover/data/europe` | Schluss, SPLIT_ADJUSTED, **in EUR umgerechnet zum Tageskurs** (`VUFx.layer.series`); Europa: Originalwährung | Tag; 3J/5J/MAX Woche + Tag (`mergeWeeklyWithDaily`) | 1T · 1M · 3M · 6M · 1J · 3J · 5J · MAX; nicht verfügbare **ausgeblendet**; Standard 1T, sonst 1J | Profi-Ansicht: EMA/SMA, Bollinger, 52W, RSI, MACD, ATR, Strukturen |
| Discover Karten | `discover-series` | wie oben | Tag, ≤ 64 Punkte | fest 6M (Balkenzahl) | Renditeleiter als Ersatz |
| **Quant** Aktienseite | Golden-5: `golden-preview/daily` (RAW × splitFactor); sonst `discover-series` + `discover-series-long`; 1T LiveHub + Relay | Schluss, SPLIT_ADJUSTED, USD | Tag; lange Zeiträume Woche + Tag | 1T · 5T · 1M · 3M · 6M · YTD · 1J · 3J · 5J · 10J · Max; nicht verfügbare **deaktiviert**; Standard 1T, sonst 1J | keine im Kurschart (Analyse daneben) |
| **Supertrader** Aktienseite | `technical-signals-v1` (270 Bars); 1T nur `intraday/index.json#entries` | Schluss aus SPLIT_ADJUSTED OHLCV, USD | Tag | 1T · 1M · 3M · 6M · 1J; **kein 5J/MAX**; Standard 6M | Trigger/Einstieg/Stop-Linien |
| Supertrader Methodenchart | Shard; Weinstein: `discover-series-long` | OHLC (Woche: Schluss) | Tag (90 Bars) / Woche (104) | keine | SMA, 30-Wochen-Linie, Darvas-/Basisbox, Marker |
| **Elliott** Chartbild | `technical-intelligence/v3` (aus Golden-Tagesreihe bzw. Wochenreihe) | Schluss/OHLC, SPLIT_ADJUSTED | Tag (5) / Woche | Tag: 3M · 6M · 1J; Woche: 1J · 3J · 5J (Balkenzahl) | Wellen, Szenariozonen, Projektion, Zeitreise, Log |
| **Screener** | `discover-series` | Schluss | Tag, ~1 Jahr | keine | SMA 50/200 im Detail |
| **Vorsorge** ETF | `vorsorge/data/series` | PRICE_RETURN, SPLIT_ADJUSTED, Originalwährung | Tag ≤ 12 M, sonst Woche + Tag | 1M · 3M · 6M · 1J · 3J · 5J · MAX (Monate) | – |
| Märkte (Discover) | `multi-asset` | Instrumentwert | Tag / Intraday | 1T · 1W · 1M · 3M · 1J · 5J · MAX | Rendite in bp |

Keine Aktienkurscharts: Fundamental (Balken), Macro (KPI), Hedgefonds (Donut), Vorsorge Portfolio/Plan (normiert bzw. simuliert), Home-Hero (illustrativ). Der Standard gilt dort **nicht**.

Verwaist/tot (Aufräumen separat): `quant/markt` (Datenpfad `market/daily/` fehlt), `QXTools.technical` (keine Route), `quant/ui/live-chart.js` (nicht geladen), Legacy-Dashboard.

### 1.2 Aktualisierung der Quellen

| Artefakt | Erzeuger | Takt |
|---|---|---|
| `discover-series`, `golden-preview`, `technical/instruments` | `market-data-refresh.yml` | werktags nach US-Schluss (Lauf ~00:45–03:00 UTC) |
| `technical-signals-v1` | Materialisierung im selben Lauf | nachts |
| `discover-series-long` | `long-series.yml` | Volllauf samstags und 1.–7. des Monats; **Reparaturlauf Di–Sa 04:20 UTC** (#858) |
| `intraday/` | `intraday-pacemaker.yml`, `intraday-snapshots.yml` | 5-Min-Takt in der Sitzung (Live-Umfang ~1 400), Gesamtuniversum nach Schluss (~5 000); **2 Sitzungen** vorgehalten |
| `technical-intelligence/v3` | `technical-intelligence-build.yml` | täglich 05:35 UTC |
| Live | Worker `vu-live` | Echtzeit, nur auf Aktienseiten |

---

## 2. Datenidentität (Messung 23.10.2026)

`scripts/quality/chart-parity.mjs`, 6 125 US-Aktien:

| Kennzahl | Ergebnis |
|---|---|
| Aktien insgesamt | 6 125 |
| Vollständige Chart-Parität | 5 628 |
| Datenabweichungen | 8 (6 Elliott-Stand vor Neubau, 2 fehlende Handelstage) |
| Fehlende Zeiträume nach Datenlage | 1 210 (nur 1T, kein Intraday-Snapshot) |
| Ohne verfügbare Charts | 0 |
| Corporate-Action-Fehler | 6 (Elliott, selbstheilend beim nächsten Build) |
| Nicht vergleichbar | 489 (nur Tagesreihe, kein Zweitbezug) |

Paare: Discover/Quant ↔ Supertrader 5 150/5 152 identisch (2 mit fehlendem Handelstag), Woche ↔ Tag 5 632/5 632, Golden-5 in allen Quellen identisch. Die neun Split-Fälle vom 22.10. sind repariert (#858).

**Datenidentität ≠ Darstellung ≠ Verfügbarkeit.** Die Kurswerte sind praktisch überall identisch. Verschieden sind:
1. **Währung:** Discover zeigt EUR (Tagesumrechnung), Quant und Supertrader USD. Gleicher Basiskurs, andere Anzeige.
2. **Historientiefe:** Supertrader zeigt nur ~1 Jahr, obwohl die Wochenreihe vorliegt.
3. **1T:** Supertrader liest nur `entries` (~1 400 Titel); Quant/Discover lösen über `available` (~5 000) auf. Ein Fehler, kein Datenmangel (`supertrader.js#intradaySnap`).
4. **Zeitraumlogik:** Kalendertage (Quant, Discover, ChartHistory) gegen Balkenzahl (Supertrader, Karten, Technik) gegen Monate (Vorsorge).

---

## 3. Gemeinsame Kursdefinition

| Begriff | Definition | Quelle der Wahrheit |
|---|---|---|
| **Close** | Schlusskurs der regulären Sitzung des Listings | Anbieter (Tiingo EOD) |
| **Open/High/Low** | Anbieterwerte derselben Sitzung, mit demselben Splitfaktor wie Close | `technical-signals-v1`, `golden-preview` |
| **Splitbereinigung** | rückwärts mit dem kumulierten `splitFactor` (RAW × Faktor), nicht mit `adjClose` | `return-series.js#splitFactors` (ADR-002) |
| **Dividenden** | im Kurschart **nicht** enthalten | – |
| **Total Return** | eigene Kennzahl (`return-series.js#totalReturn`), nie als Kurschart; Beschriftung „Gesamtrendite inkl. Dividenden“ | ADR-002 |
| **Währung** | Preiswahrheit in Listing-Währung (US: USD). Anzeige in EUR ist eine Umrechnung **je Tag** mit dem Kurs dieses Tages und muss so beschriftet sein („in EUR, umgerechnet zum Tageskurs“) | `VUFx` |
| **Handelskalender** | `quant/config/market-calendar.json` (NYSE) | |
| **Zeitzone** | Tagesdaten: Börsendatum des Listings; Intraday: Ortszeit der Börse (ET), Anzeige „Stand HH:MM“ | `trading-session.js` |
| **Wochenschluss** | Schluss des letzten Handelstags der ISO-Woche (Feiertage: Donnerstag usw.) | `series-sampling.js#weeklyPoints` |
| **Corporate Actions** | Split am Ex-Tag; Tages- und Wochenreihe müssen denselben Bereinigungsstand tragen (DQ-PX-4, Reparaturlauf) | `corporate-action-evidence.js` |
| **Aktualität** | „Stand <Datum>“ am Chart; ≥ 2 Sitzungen zurück = Warnung | DQ-PX-2 |
| **Rundung** | `roundClose`: 2 Nachkommastellen ab 1, darunter 4 gültige Stellen | `published-close.js` |

Regel: **Zwei Charts, die denselben Kurs behaupten, nutzen dieselbe Definition – sonst steht die Abweichung am Chart.** Konkret: Discover (EUR) und Quant (USD) sind nicht „falsch“, aber nur dann vergleichbar, wenn die Währung sichtbar ist. Entscheidung offen (Abschnitt 8).

---

## 4. Zielstandard Zeiträume

**Verbindliche Hauptleiste:** `1T · 1W · 1M · 1J · 5J · MAX`

| Taste | Fenster | Auflösung | Quelle | Wenn Daten fehlen |
|---|---|---|---|---|
| 1T | letzte (laufende) Sitzung | 5 Min (IEX), live wo verfügbar | `intraday/<Sitzung>/<id>.json`, Relay | deaktiviert: „Kein Tagesverlauf für diese Aktie“ |
| 1W | 7 Kalendertage bis zum letzten Punkt | **Tagesschluss** (≈ 5 Punkte) | Tagesreihe | deaktiviert |
| 1M | 31 Tage | Tag | Tagesreihe | deaktiviert |
| 1J | 366 Tage | Tag | Tagesreihe | deaktiviert |
| 5J | 1 827 Tage | Woche, ab Beginn der Tagesreihe Tag; Golden-5 Tag | Wochen- + Tagesreihe | „Aktie kürzer gelistet (seit …)“ bzw. deaktiviert |
| MAX | gesamte Historie des aktuellen Listings | wie 5J | wie 5J | – |

- **Fensterlogik einheitlich:** Kalendertage ab dem letzten Datenpunkt, Abdeckung ≥ 95 % (`core/chart-history.js`). Balkenzahlen nur noch in Analysecharts (Chartbild, Methodenchart), dort fachlich begründet.
- **Sekundär (nur wo heute vorhanden):** 3M, 6M, YTD, 3J, 10J hinter „Mehr“ – Quant, Discover, Vorsorge. Nichts wird ersatzlos gestrichen.
- **1W ist keine Wochenkerze**, sondern ein Betrachtungszeitraum mit Tagespunkten. Quants heutiges „5T“ ist genau das und wird zu „1W“ umbenannt.
- **Echte Intraday-1W fehlt.** Die Ablage hält 2 Sitzungen 5-Min-Bars. Realistischer Vorschlag: 5 Sitzungen als 30-Min-Bars ableiten (aus vorhandenen 5-Min-Snapshots, keine neue Anbieterabfrage; ~65 Punkte/Titel). Erst nach Größenmessung und Freigabe; bis dahin Tagespunkte, beschriftet.
- **Nicht verfügbare Zeiträume** bleiben an ihrem Platz sichtbar und sind deaktiviert, mit Grund im Tooltip/`aria-disabled`. (Heute: Discover blendet aus, Quant deaktiviert.)
- **Standard:** 1T bei laufender Sitzung und vorhandenem Tagesverlauf, sonst 1J – in allen Welten (Supertrader heute 6M).
- **Keine simulierten Kurse:** 1T nie aus Tagesschlüssen; Lücken bleiben Lücken; Wochenpunkte werden nie interpoliert.

---

## 5. Bedienung und Design

Grundlage ist das bestehende VU3-System (`assets/site-navigation.css`: `.vu-chart`, `.vu-ranges`, Tokens `--vu-chart-up/-down/-base`, Inter). Keine neue Bibliothek, keine neue Shell, keine Änderung an Navigation, Produktmenüs oder Dock.

| Element | Regel |
|---|---|
| Zeitraumleiste | `.vu-ranges` (Pillen, aktiv = Textfarbe gefüllt), unter dem Chart, links bündig, horizontal scrollbar auf dem Handy, `min-height:36px`, Tasten `<button aria-pressed>` |
| Linie | Farbe nach Richtung im Fenster (`--vu-chart-up` / `-down`), gestrichelte Startlinie, Punkt am letzten Kurs |
| Achse | rechts: Hoch, Tief, Letzter; Log-Achse automatisch bei Hoch/Tief > 15 mit Hinweis „logarithmisch“ |
| Tooltip/Crosshair | Zeiger und Touch (`pointer`-Ereignisse), senkrechte Linie, Pille mit Datum und Kurs; Kopf zeigt Veränderung bis zum Punkt |
| Datum | Tag: `22.10.2026`; Intraday: `15:55`; Woche: `KW 43 · 23.10.2026` |
| Kurs | `de-DE`, 2 Nachkommastellen ab 1, darunter 4 gültige Stellen, Währung immer sichtbar (`221,97 $`, `190,12 €`) |
| Zoom | keiner (heute in keinem Chart). Kein Pinch-Zoom auf Kurscharts; Zeitraumtasten ersetzen ihn |
| Tastatur | Zeitraumtasten fokussierbar; neu: Pfeiltasten bewegen den Crosshair, wenn der Chart fokussiert ist |
| Mobile Safari | `touch-action: pan-y` (Seite scrollt, waagerechtes Wischen scrubbt), keine `100vh`, Mindestgröße der Tasten 44 × 36 px |
| Laden | Platzhalter in Chart-Höhe (kein Springen), keine Spinner im Chart |
| Fehler | `.vu-chart-empty` mit Grund in Klartext („Für diese Aktie liegt kein Tagesverlauf vor“), nie ein leerer Kasten |
| Hell/Dunkel | ausschließlich über Tokens; keine Literalfarben |
| Quelle/Stand | eine Zeile unter dem Chart: „Schlusskurse, splitbereinigt, ohne Dividenden · USD · Stand 22.10.2026“ |

**Produktspezifisch bleibt:** Discover Profi-Ansicht mit Indikatoren; Supertrader Trigger/Einstieg/Stop-Linien und Methodenchart; Elliott Wellen, Zonen, Projektion, Zeitreise, Balkenfenster; Screener-Sparklines (ohne Zeitraumleiste); Vorsorge ETF (eigene Kursart PRICE_RETURN, Originalwährung).

---

## 6. Je Produktwelt: was gleich wird, was bleibt

| Welt | Wird einheitlich | Bleibt produktspezifisch | Aufwand / Risiko |
|---|---|---|---|
| Discover | Leiste 1T·1W·1M·1J·5J·MAX (+ Mehr: 3M, 6M, 3J); deaktiviert statt ausgeblendet; Währungszeile | EUR-Anzeige (Entscheidung), Profi-Indikatoren, Karten-Mikrochart | klein; **Discover-Budget-Gate** (≤ 180 000 Byte, ≤ 12 Requests) beachten |
| Quant | 5T → 1W; YTD, 3M, 6M, 3J, 10J hinter „Mehr“ | Analyse neben dem Chart, keine Overlays im Kurschart | klein |
| Supertrader | 1T über `available` (Fehlerbehebung, +~3 600 Titel); 5J/MAX aus vorhandener Wochenreihe; Standard 1J | Setup-Linien; Methodenchart unverändert | mittel; **Gate A**: eigener PR nur unter `supertrader/**` |
| Elliott | Kopf, Kurszeile, Währung, Datum, Tooltip-Format | Balkenfenster 3M/6M/1J bzw. 1J/3J/5J, Wellen, Zonen, Zeitreise | keine Änderung an Fenstern; nur Formate |
| Screener | Detail-Tab: Leiste 1M·1J (Datenlage), Tooltip | Sparklines ohne Leiste | klein |
| Vorsorge | Reihenfolge/Beschriftung (1M … MAX), Tooltip | PRICE_RETURN, Originalwährung, Portfolio/Plan-Diagramme | optional |
| Fundamental, Macro, Hedgefonds | – | eigene Analysediagramme | nicht betroffen |

---

## 7. Migrationsplan

| Schritt | Inhalt | PR-Zuschnitt | Risiko | Prüfung |
|---|---|---|---|---|
| M0 ✔ | DQ-PX-4-Reparaturlauf, Chart-Paritätsprüfung | #858, #859 | gering | Core-Tests, täglicher Bericht |
| M1 | `chart-ranges.js` / `ChartHistory`: Standardleiste und 1W als Definition (Engine, keine UI) | Quant/Core | gering | Unit-Tests je Zeitraum |
| M2 | Supertrader: 1T-Auflösung wie LiveHub, 5J/MAX aus Wochenreihe, Standard 1J | nur `supertrader/**` (Gate A) | mittel | `browser-qa.mjs`, Vorher/Nachher-Screenshots 390/1280 px |
| M3 | Discover: 1W, deaktiviert statt ausgeblendet, Leiste in Standardreihenfolge | nur `discover/**` | mittel (Budget-Gate) | `browser-qa.mjs`, Budget |
| M4 | Quant: 5T → 1W, Sekundärzeiträume hinter „Mehr“ | Quant | gering | Quant-Browser-QA |
| M5 | Screener-Detail, Vorsorge (optional) | je Produkt | gering | Produkt-QA |
| M6 | Elliott: nur Formate | Quant/Elliott | gering | Chartbild-Tests |
| später | Discover `renderRange` auf `VUChart` zusammenführen (ein Renderer) | eigener PR mit Vorher/Nachher | mittel | Pixelvergleich, Budget |

Jeder Schritt: Vorher/Nachher-Bilder bei 390 und 1 280 px, hell und dunkel, und die Paritätsprüfung unverändert grün.

---

## 8. Offene Entscheidungen (Eigentümer)

1. **Währung:** Bleibt Discover bei EUR (dann Währungszeile Pflicht), oder zeigen alle Welten die Listing-Währung mit optionaler EUR-Umschaltung?
2. **Standardzeitraum:** 1T während der Sitzung, sonst 1J – überall, auch Supertrader (heute 6M)?
3. **Nicht verfügbare Zeiträume:** deaktiviert anzeigen (Vorschlag) statt ausblenden?
4. **Echte 1W-Intraday-Reihe:** 5 Sitzungen 30-Min aus vorhandenen Snapshots vorhalten (Repo-Größe messen) – ja/nein?
5. **Elliott-Register:** eingefrorene Thesen mit absoluten Zonen werden bei späterem Split nicht umgerechnet (7 Fälle, alle ARCHIVED). Eigener Elliott-PR: These bei Split nach dem Einfrieren auf „durch Kapitalmaßnahme beendet“ setzen oder Zonen mit dem Faktor umrechnen?
6. **Supertrader-Wochenkontext** (`engine/weekly.mjs`) mischt Wochen- und Tagesreihe; nach einem Split ohne Reparatur entsteht dort eine Naht (DKI, FRGT lagen 19.–23.10. über der Liquiditätsgrenze, ohne Signal). Vorschlag für einen Supertrader-PR: Titel mit DQ-PX-4-Befund im Wochenkontext aussetzen.
