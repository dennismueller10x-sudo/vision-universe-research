# Vision Universe Chartstandard (Entwurf, Stand 23.10.2026, nach Owner-Entscheidungen)

**Status:** Entwurf zur Freigabe. Entschieden am 23.10.2026: **1T als Standardzeitraum**, **EUR als Standard-Anzeigewährung mit Umschalter auf die Börsenwährung**, Zeitraumleiste 1T · 1W · 1M · 1J · 5J · MAX, fehlende Zeiträume deaktiviert statt ausgeblendet, split-angepasste Ansicht historischer Elliott-Thesen neben dem Original. Dieses Dokument ändert keinen Chart. Es beschreibt den Bestand, die gemeinsame Kursdefinition, den Zielstandard und einen Migrationsplan. Produktive UI-Änderungen erst nach ausdrücklicher Freigabe des Eigentümers, je Produktwelt in einem eigenen PR (Gates siehe `CLAUDE.md`).

Leitsatz: **Einheitliche Kurswerte. Einheitliche Zeiträume. Einheitliche Bedienung. Unterschiedliche fachliche Analysefunktionen.** Datenqualität hat Vorrang vor Optik; kein funktionierender Chart wird allein der Einheitlichkeit wegen ersetzt.

Mockups v2 (echte NVDA-Daten, EZB-Tageskurse, 1T und EUR als Standard, hell/dunkel, 390/1280 px): https://claude.ai/artifact/6AKUFFDySim2F6ee1hAE5S (privat, Freigabe über das Teilen-Menü). Paritätsprüfung: `node scripts/quality/chart-parity.mjs`.

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

## 2. Datenidentität (Messung 23.10.2026, `main` 43e882c)

`scripts/quality/chart-parity.mjs` (seit #859 täglich als Bericht in `core-ci.yml`, nicht blockierend), 6 125 US-Aktien:

| Kennzahl | Ergebnis |
|---|---|
| Aktien insgesamt | 6 125 |
| Vollständige Chart-Parität | 5 634 |
| Kursabweichungen | **0** |
| Datenlücken (fehlender Handelstag, gleiche Kurse) | 2 (YPF 18.11.2025, ACHL 3 umsatzlose Tage) |
| Fehlende Zeiträume nach Datenlage | 1 210 (nur 1T, kein Intraday-Snapshot) |
| Ohne verfügbare Charts | 0 |
| Corporate-Action-Fehler | **0** (die 9 Reverse-Split-Fälle sind repariert, die 6 Elliott-Chartbilder neu gebaut) |
| Nicht vergleichbar | 489 (nur Tagesreihe, kein Zweitbezug) |

Paare: Discover/Quant ↔ Supertrader 5 150/5 152 (2 Datenlücken), Woche ↔ Tag 5 632/5 632, Woche ↔ Supertrader 5 148/5 148, Elliott (Woche) 4 561/4 561, Elliott (Tag, Golden-5) 5/5, Golden-5 in allen Quellen identisch.

**Datenidentität ≠ Darstellung ≠ Verfügbarkeit.** Die Kurswerte sind identisch. Verschieden sind:
1. **Währung:** Discover zeigt EUR, Quant und Supertrader USD. Zusätzlich ist die EZB-Reihe veraltet (Abschnitt 3.1).
2. **Historientiefe:** Supertrader zeigt ~1 Jahr, obwohl die Wochenreihe vorliegt.
3. **1T in Supertrader:** 1 395 von 5 651 Titeln, obwohl es für 4 579 einen Snapshot gibt (Abschnitt 6.1).
4. **Zeitraumlogik:** Kalendertage (Quant, Discover, ChartHistory) gegen Balkenzahl (Supertrader, Karten, Technik) gegen Monate (Vorsorge).

---

## 3. Gemeinsame Kursdefinition

| Begriff | Definition | Quelle der Wahrheit |
|---|---|---|
| **Close** | Schlusskurs der regulären Sitzung des Listings | Anbieter (Tiingo EOD) |
| **Open/High/Low** | Anbieterwerte derselben Sitzung, mit demselben Splitfaktor wie Close | `technical-signals-v1`, `golden-preview` |
| **Splitbereinigung** | rückwärts mit dem kumulierten `splitFactor`, nicht mit `adjClose` | `return-series.js#splitFactors` (ADR-002) |
| **Dividenden** | im Kurschart **nicht** enthalten | – |
| **Total Return** | eigene Kennzahl (`return-series.js#totalReturn`), nie als Kurschart; Beschriftung „Gesamtrendite inkl. Dividenden“ | ADR-002 |
| **Rechenwährung** | Listing-Währung (US: USD). Alle Modelle (Quant, Supertrader, Elliott) rechnen darin | Kursreihen |
| **Anzeigewährung** | Standard **EUR**, Umschalter auf die Börsenwährung. Reine Darstellungsschicht | `VUFx` (`quant/engines/fx/`) |
| **Handelskalender** | `quant/config/market-calendar.json` (NYSE) | |
| **Zeitzone** | Tagesdaten: Börsendatum des Listings; Intraday: Ortszeit der Börse (ET), Anzeige „Stand HH:MM ET“ | `trading-session.js` |
| **Wochenschluss** | Schluss des letzten Handelstags der ISO-Woche | `series-sampling.js#weeklyPoints` |
| **Corporate Actions** | Split am Ex-Tag; Tages- und Wochenreihe tragen denselben Bereinigungsstand (DQ-PX-4, Reparaturlauf Di–Sa 04:20 UTC) | `corporate-action-evidence.js` |
| **Aktualität** | „Stand <Datum>“ am Chart; ≥ 2 Sitzungen zurück = Warnung | DQ-PX-2 |
| **Rundung** | `roundClose`: 2 Nachkommastellen ab 1, darunter 4 gültige Stellen | `published-close.js` |

### 3.1 Währungsschicht (EUR als Standard)

- **Historische Punkte:** jeder Tagespunkt mit dem EZB-Referenzkurs **seines** Tages (`DAILY_AT_DATE`), fehlt er, der letzte vorherige innerhalb `maxCarryDays` (`PREVIOUS_AVAILABLE`). Nie der heutige Kurs für die Historie. Wochenpunkte mit dem Kurs ihres Stichtags. Die bestehende Engine leistet das bereits (`currency-contract.js#series`, in Discover über `detail.js#inAnzeigewaehrung`).
- **1T:** alle Punkte und der Vortagesschluss mit dem Kurs der Sitzung (so rechnet Discover heute, `inAnzeigewaehrungSnapshot`). Die Prozentveränderung bleibt dadurch gleich der in der Börsenwährung.
- **Overlays:** Trigger, Stops, Zonen, Ziele werden fachlich in der Rechenwährung bestimmt. In EUR mit dem jüngsten Kurs umgerechnet angezeigt, der Originalwert steht daneben („Stop 207,41 € (232,41 $)“), dazu ein Hinweis unter dem Chart. Die Signallogik sieht nie EUR.
- **Fehlender Kurs:** Anzeige in der Börsenwährung mit Hinweis „Euro-Kurs für diesen Tag nicht verfügbar“, keine Umrechnung mit einem zu alten Kurs (Engine: `carryLimitExceeded`).
- **Präferenz:** ein Schlüssel für alle Welten (heute `VUFx`-Präferenz in Discover); wird beim Wechsel der Produktwelt übernommen.
- **Quelle:** EZB-Referenzkurse (`quant/data/market/fx/ecb/`), Quellennennung „Wechselkurse: Europäische Zentralbank“. Tiingo-FX bleibt Arbeitsablage (Lizenz).
- **Befund 23.10.2026:** Die EZB-Reihe endet am **21.09.2026** (Repository wie live). Sie entstand nur in `currency-fx-verify.yml` (Hand/Marke, mit ~54 Tiingo-Anfragen), ohne Zeitplan. Gemessen mit der Engine an NVDA: 255 von 270 Tagespunkten umrechenbar, letzter EUR-Punkt 01.10.; 1T fällt auf USD zurück. **Behoben mit PR #865** (gemergt 23.10.2026: täglicher EZB-Lauf werktags 15:47 UTC, eine öffentliche Datei, kein Anbieterkontingent, plus Frischeüberwachung in `domains.json`). Vor dem Merge geprüft: 135 195 vorhandene Tageswerte in 22 Reihen unverändert, nur 23 neue Tage bis 22.10. ergänzt. Mit aktuellen EZB-Kursen: 270/270 und 1 448/1 448 Punkte tagesgenau.

---

## 4. Zielstandard Zeiträume

**Verbindliche Hauptleiste:** `1T · 1W · 1M · 1J · 5J · MAX`

| Taste | Fenster | Auflösung | Quelle | Wenn Daten fehlen |
|---|---|---|---|---|
| **1T (Standard)** | laufende bzw. letzte Sitzung | 5 Min (IEX), live wo verfügbar | `intraday/<Sitzung>/<id>.json`, Relay | Ersatzansicht: letzter Schlusskurs mit Datum, Hinweis „Für heute liegt kein Tagesverlauf vor“; Taste bleibt gewählt |
| 1W | 7 Kalendertage bis zum letzten Punkt | **Tagesschluss** (≈ 5 Punkte) | Tagesreihe | deaktiviert |
| 1M | 31 Tage | Tag | Tagesreihe | deaktiviert |
| 1J | 366 Tage | Tag | Tagesreihe | deaktiviert |
| 5J | 1 827 Tage | Woche, im letzten Jahr Tag; Golden-5 Tag | Wochen- + Tagesreihe | „Aktie kürzer gelistet (seit …)“, deaktiviert |
| MAX | gesamte Historie des aktuellen Listings | wie 5J, Log-Achse ab Faktor 15 | wie 5J | – |

- **Standard 1T** beim ersten Öffnen eines Aktiencharts, in jeder Welt. Außerhalb der Handelszeit zeigt 1T den letzten Handelstag („Letzter Handelstag 22.10.2026, Stand 15:55 ET · verzögert“) – **kein** automatischer Wechsel auf 1J. Wählt der Nutzer einen Zeitraum, gilt er auch in der nächsten Welt (gemeinsamer Präferenzschlüssel, wie die Währung).
- **Fensterlogik einheitlich:** Kalendertage ab dem letzten Datenpunkt, Abdeckung ≥ 95 % (`core/chart-history.js`). Balkenzahlen nur in Analysecharts (Chartbild, Methodenchart), dort fachlich begründet.
- **Sekundär:** 3M, 6M, YTD, 3J, 10J hinter „Mehr“, nur wo es sie heute gibt. Nichts wird ersatzlos gestrichen.
- **1W ist keine Wochenkerze.** Quants „5T“ ist genau 1W und wird umbenannt.
- **Echte Intraday-1W fehlt (gemessen):** `ingest-intraday.mjs` hält `retentionSessions: 2` und löscht ältere Sitzungen (je ~20 MB, ~5 000 Titel, 78 Punkte à 5 Min). Vorschlag: beim Tageslauf ein abgeleitetes Artefakt mit 30-Min-Werten der letzten 5 Sitzungen (~65 Punkte, ~1 KB je Titel, ~5 MB gesamt), verdichtet aus dem Snapshot vor dessen Löschung. Keine Anbieterabfrage, keine Interpolation. Pipeline-Änderung, braucht Freigabe; bis dahin 1W aus Tagespunkten, beschriftet.
- **Keine simulierten Kurse:** 1T nie aus Tagesschlüssen; Lücken bleiben Lücken; Wochenpunkte nie interpoliert.

---

## 5. Bedienung und Design

Grundlage ist das bestehende VU3-System (`assets/site-navigation.css`: `.vu-chart`, `.vu-ranges`, Tokens `--vu-chart-up/-down/-base`, Inter). Keine neue Bibliothek, keine neue Shell, keine Änderung an Navigation, Produktmenüs oder Dock, keine zusätzlichen Textblöcke außer Quellen-/Hinweiszeile.

| Element | Regel |
|---|---|
| Zeitraumleiste | `.vu-ranges` (Pillen, aktiv = Textfarbe gefüllt), unter dem Chart, links bündig, auf dem Handy horizontal scrollbar, Tasten `<button aria-pressed>`, deaktiviert mit `aria-disabled` und Grund |
| Währungsumschalter | Segment „EUR · USD“ (bzw. GBP, CHF) rechts im Chartkopf, `min-height:30px`, gilt für alle Charts und Welten |
| Linie | Farbe nach Richtung im Fenster (`--vu-chart-up` / `-down`), gestrichelte Startlinie (1T: Vortagesschluss), Punkt am letzten Kurs |
| Achse | rechts: Hoch, Tief, Letzter; Log-Achse automatisch bei Hoch/Tief > 15 mit Hinweis |
| Tooltip/Crosshair | Zeiger und Touch (`pointer`-Ereignisse), senkrechte Linie, Pille mit Datum und Kurs inkl. Währung; Kopf zeigt Veränderung bis zum Punkt |
| Datum | Tag `22.10.2026`; Intraday `15:55 ET`; Woche `KW 43 · 23.10.2026` |
| Kurs | `de-DE`, 2 Nachkommastellen ab 1, darunter 4 gültige Stellen, Währungszeichen immer sichtbar (`189,39 €`, `212,21 $`) |
| Overlay-Beschriftung | Linienwerte rechts ausgerichtet, Zonen links; bei Abstand < 12 px versetzt; in EUR mit Originalwert in Klammern |
| Zoom | keiner (heute in keinem Chart); Zeitraumtasten ersetzen ihn |
| Tastatur | Zeitraum- und Währungstasten fokussierbar; Pfeiltasten bewegen den Crosshair im fokussierten Chart |
| Mobile Safari | `touch-action: pan-y`, keine `100vh`, Tasten ≥ 44 × 36 px |
| Laden | Platzhalter in Chart-Höhe, keine Spinner |
| Fehler | Klartext mit Grund und Ersatz (letzter Kurs), nie ein leerer Kasten |
| Hell/Dunkel | nur über Tokens |
| Quelle/Stand | eine Zeile: „Schlusskurse, splitbereinigt, ohne Dividenden · in EUR zum EZB-Referenzkurs des jeweiligen Tages · Quelle Tiingo, EZB“ |

**Produktspezifisch bleibt:** Discover Profi-Ansicht mit Indikatoren und Kerzen; Quant-Einordnung, Scores, Signalmarkierungen, Benchmark; Supertrader Darvas-Boxen, Trendlinien, Ausbruch, Einstieg, Stop, Ausstieg, Methodenchart; Elliott Wellen, Pivots, Zonen, Ziele, Invalidierung, Zeitreise, Balkenfenster, historische Thesen; Screener-Sparklines (ohne Leiste); Vorsorge-Portfolio/-Plan (keine Kurscharts).

---

## 6. Je Produktwelt: was gleich wird, was bleibt

| Welt | Wird einheitlich | Bleibt produktspezifisch | Aufwand / Risiko |
|---|---|---|---|
| Discover | Leiste in Standardreihenfolge mit 1W; deaktiviert statt ausgeblendet; Währungsumschalter (EUR bleibt Standard) | Profi-Indikatoren, Kerzen, Karten-Mikrochart | klein; **Discover-Budget-Gate** (≤ 180 000 Byte, ≤ 12 Requests) |
| Quant | 1T Standard (heute schon, wenn Snapshot da); 5T → 1W; YTD, 3M, 6M, 3J, 10J hinter „Mehr“; EUR-Anzeige über `VUFx` | Einordnung neben dem Chart, Signalmarkierungen, Benchmark; keine News/Fundamentaldaten; Backtest-Gates unverändert | klein–mittel (FX-Bündel laden) |
| Supertrader | 1T über `available` (+3 184 Titel); 5J/MAX aus Wochenreihe; Standard 1T; EUR-Anzeige inkl. umgerechneter Linien | Signale, Strategien, Engine, Methodenchart unverändert | mittel; **Gate A**: eigener PR nur unter `supertrader/**`, erst nach Freigabe |
| Elliott | Kopf, Kurszeile, Währung, Datum, Tooltip-Format; Zonen in EUR angezeigt | Balkenfenster, Wellen, Zonen, Zeitreise, Logik | gering |
| Screener | Detail-Tab: gemeinsame Leiste, Tooltip, Währung | Sparklines ohne Leiste | klein |
| Vorsorge | ETF-Kurschart: Leiste und Währungslogik | PRICE_RETURN, Portfolio/Plan-Diagramme | optional |
| Fundamental, Macro, Hedgefonds, Home-Hero | – | eigene Analysediagramme | nicht betroffen |

### 6.1 Supertrader 1T (nur Analyse, isolierter Vorschlag)

Ursache: `supertrader/assets/supertrader.js#intradaySnap` (Zeile ~968) liest nur `index.entries[sym]` (Live-Umfang, 1 404 Titel). Quant und Discover lösen über `discover/ui/live-hub.js#resolveEntry` zusätzlich `index.available[<Sitzung>]` mit `pathPattern`/`idPattern`/`idExceptions` auf (~5 049 Titel). Kein Datenmangel. Gemessen: 1 395 → 4 579 Supertrader-Titel mit 1T (+3 184); 1 072 bleiben ohne Snapshot.

Vorschlag (nur `supertrader/assets/supertrader.js`, keine Engine, keine Signale, keine Pipeline):

```js
function intradaySnap(sym) {
  return fetch('/quant/data/market/intraday/index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (idx) {
    var e = idx.entries && idx.entries[sym], path = e && e.path;
    if (!path && idx.available) {                       /* wie live-hub.js#resolveEntry */
      var dates = Object.keys(idx.available).sort();
      for (var i = dates.length - 1; i >= 0 && !path; i--) {
        if ((idx.available[dates[i]] || []).indexOf(sym) === -1) continue;
        var id = (idx.idExceptions && idx.idExceptions[sym]) || String(idx.idPattern || 'ref_<symbol>').replace('<symbol>', sym);
        path = String(idx.pathPattern || '/quant/data/market/intraday/<sessionDate>/<securityId>.json').replace('<sessionDate>', dates[i]).replace('<securityId>', id);
      }
    }
    if (!path) return null;
    return fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }).catch(function () { return null; });
}
```

Die bestehende Prüfung „Sitzung ≥ letzter Tagesschluss“ bleibt. Umsetzung erst nach Freigabe; der parallele Supertrader-5.0-Auftrag ist mit #863 abgeschlossen.

### 6.2 Supertrader ohne Chart (fachlich, kein Fehler)

973 Titel ohne Supertrader-Bars sind Aufnahmeregeln, keine Lücke: kanonische R2-Tagesdatei vorhanden, gültige OHLC und Splitfaktoren, `TECHNICAL_READY` und **≥ 300 Bars** (`materialize-product-intelligence.mjs`, `minTechnicalBars`), Kalenderprüfung der 270 Anzeigebars, vollständiges Bundle; im Supertrader-Build zusätzlich ohne ETF/ETN/CEF und ≥ 60 Bars. Abgelehnte Titel stehen mit Grund im `unavailable`-Block der Shards. Keine automatische Freischaltung.

---

### 6.3 Gemeinsamer Baustein

`core/chart-standard.js` (`VUCore.ChartStandard`) ist die eine Stelle für Zeitraumreihenfolge, Startzeitraum (1T, gemerkte Wahl `vu-chart-range-v1`, ohne Tagesverlauf der längste Zeitraum bis 1J), Intraday-Auflösung (`intradayEntry`, Regel aus `live-hub.js#resolveEntry`) und die Anzeige in EUR über die vorhandene FX-Schicht (`displaySeries`, `displaySnapshot`, `displayLevel`). Er rechnet selbst nichts um und ändert keine Kursreihe.

---

## 7. Migrationsplan

| Schritt | Inhalt | PR-Zuschnitt | Risiko | Prüfung |
|---|---|---|---|---|
| M0 ✔ | DQ-PX-4-Reparaturlauf, Chart-Paritätsprüfung | #858, #859 (gemergt) | – | erster Reparaturlauf 23.10. ohne Befund, ohne Schreibzugriff |
| M0b ✔ | EZB-Kurse täglich + Frischeüberwachung | #865 (gemergt) | – | Lauf nach Merge, `system-health` |
| M0c ✔ | Elliott: split-angepasste Ansicht historischer Thesen (Bericht) | #864 (gemergt); Einbindung in Erzeuger/Oberfläche offen | gering | Elliott-Registertests |
| M1 | `chart-ranges.js` / `ChartHistory`: Standardleiste, 1W, Standard 1T als Definition; gemeinsamer Präferenzschlüssel Zeitraum/Währung | Quant/Core | gering | Unit-Tests je Zeitraum |
| M2 | Supertrader: 1T-Rückfall, 5J/MAX, Standard 1T, EUR-Anzeige inkl. Linien | nur `supertrader/**` (Gate A) | mittel | `browser-qa.mjs`, Vorher/Nachher 390/1280 px |
| M3 | Discover: 1W, deaktiviert statt ausgeblendet, Umschalter EUR/USD | nur `discover/**` | mittel (Budget-Gate) | `browser-qa.mjs`, Budget |
| M4 | Quant: 5T → 1W, „Mehr“, EUR-Anzeige | Quant | gering–mittel | Quant-Browser-QA |
| M5 | Screener-Detail, Vorsorge-ETF | je Produkt | gering | Produkt-QA |
| M6 | Elliott: Formate, Zonen in EUR | Quant/Elliott | gering | Chartbild-Tests |
| optional | echte 1W-Intraday-Reihe (30 Min, 5 Sitzungen) | Markt-Pipeline | gering | Größenmessung, Hygiene |
| später | Discover `renderRange` auf `VUChart` zusammenführen | eigener PR | mittel | Pixelvergleich, Budget |

Jeder Schritt: Vorher/Nachher-Bilder bei 390 und 1 280 px, hell und dunkel, Paritätsprüfung unverändert ohne Kursabweichung.

---

## 8. Noch erforderliche Freigaben

1. ~~PR #865~~ gemergt 23.10.2026.
2. **Supertrader 1T-Rückfall** (6.1) als isolierter Supertrader-PR.
3. **Echte 1W-Intraday-Reihe** (Abschnitt 4) – Pipeline-Änderung.
4. **Elliott-Thesen:** Einbindung der split-angepassten Ansicht (Bericht mit #864 gemergt) in Erzeuger und Oberfläche.
5. **Supertrader-Wochenkontext** (`engine/weekly.mjs`): Titel mit offenem DQ-PX-4-Befund aussetzen, bis repariert (seit #858 höchstens bis zum nächsten Reparaturlauf).
6. **Je Produktwelt die UI-Umsetzung M1–M6.**

Gate-Audit (Bestandsaufnahme, Empfehlungen): `docs/audits/GATE_AUDIT_2026-10-23.md`.
