# VISION UNIVERSE® — MARKETS 3.0: Consumer Intelligence Experience
## Final Implementation Report

Stand 2026-09-25. Umsetzung: #215 (Core, Quant-Spur), #216 (Discover-Spur), #217 (QA ohne Zeitrennen). Produktion: `research.visionuniverse.de/discover/#/maerkte`.

---

## 0. Agent-Graph und Ist-Zustand (Punkte 1, 2)

Vor der Umsetzung wurde `main` auditiert. Markets 2.0 war vollständig vorhanden (#206–#213) und wurde **nicht neu gebaut**:
- Multi-Asset-Vertrag 1.1.0, Tracker, Detail-System;
- Market Pulse mit fünf Dimensionen;
- „Markt jetzt“, Movers, Browser-QA.

| Agent | Entscheidung des Orchestrators | Ergebnis |
|---|---|---|
| ORCHESTRATOR | Delta statt Neubau; Core- und Discover-Spur getrennt | #215 → #216 → Doku |
| DATA-CONTRACT | Vertrag 1.1.0 reicht; neue **Artefakte** statt neuer Pipeline | `market-pulse.json` 1.1.0 + `market-pulse-history.json` |
| MARKET-INTELLIGENCE | Marktumfeld, Kontrafaktik, Worauf, Vorher/Jetzt, Ereignisse | Engine `market-pulse.js` (dieselbe Datei) |
| METHODOLOGY | Entscheidungstabelle versioniert, Kalibrierung erweitert, Point-in-Time-Historie | `market-environment-1.0.0`, 12/12 Phasen |
| CONSUMER-UX | Einordnung zuerst, Konsumentensprache, keine Empfehlung | `market-intelligence.js` |
| VISUAL-DESIGN | Hero als einzige „Bühne“, Instrument statt Kachelwand, wechselnde Flächen | `markets.css` (Markets-3.0-Block) |
| DETAIL-PAGE | „Wie steht dieser Markt?“ je Assetklasse | `market-detail.js` |
| CHART | Verlauf des Marktumfelds (SVG), Breite/Cross-Asset-Balken | ohne neue Chart-Bibliothek |
| MOBILE-QA | 320/390/1440, hell/dunkel, Chromium/WebKit | Märkte-QA 1.2.0 |
| DATA-TRUTH | Gates in Tests und QA | 12 + 8 neue Tests, 60+ neue QA-Prüfungen |
| PRODUCTION-PROOF | gegen die ausgelieferte Seite | §29 |

Nicht nötig und deshalb nicht erzeugt:
- kein neuer Provider, keine neue Pipeline;
- kein zweiter FX-, Realtime-, History- oder Kalender-Kern;
- kein Sektor-Vertrag (Owner-Entscheidung, §31).

**Ist-Matrix vor Markets 3.0**

| Bereich | Zustand vorher | Markets 3.0 |
|---|---|---|
| Märkte-Route, Übersicht, Detailseiten | IMPLEMENTED | erweitert (Einordnung) |
| Multi-Asset-Vertrag, Tracker, Rohstoffe, Metalle, Krypto, Renditen, Leitzinsen, FX | IMPLEMENTED | unverändert wiederverwendet |
| Market Pulse (5 Dimensionen) | IMPLEMENTED | unverändert, Grundlage |
| Marktumfeld / Investment Environment | MISSING | IMPLEMENTED |
| Vorher → Jetzt, Zustandswechsel | MISSING | IMPLEMENTED |
| Pulse-Historie | MISSING | IMPLEMENTED (point in time) |
| Was würde das Bild ändern / Worauf es ankommt | MISSING | IMPLEMENTED |
| Markt jetzt | PARTIAL (Liste) | Geschichten |
| Breadth | PARTIAL (Zahlen) | eigene Visualisierung, NOT_CURRENT ehrlich |
| Realtime Tracker | IMPLEMENTED (VU-Live-Worker) | unverändert; Nachweis bei offener Börse §29.4 |
| Sektoren | NOT_IMPLEMENTED (Datenlage) | OUT_OF_SCOPE (kein Sektor-Vertrag) |
| Macro Regime | NOT_CERTIFIED | unverändert NOT_CERTIFIED |

## 1. Executive Summary

Markets 2.0 zeigte die Märkte vollständig und korrekt; die Einordnung musste der Nutzer aber selbst leisten. Markets 3.0 dreht die Reihenfolge um:

- **Oben steht die Einordnung.** Der Hero nennt das Marktumfeld (derzeit **„Selektiv“**) mit Hauptaussage („Positive Dynamik – aber der Trend ist noch nicht breit bestätigt.“), Bedeutung für Anleger, Veränderung seit der letzten Bewertung, den Gründen auf einen Blick sowie letzter und nächster planmäßiger Neubewertung.
- **Darunter folgen die Belege.**
  - fünf Dimensionen als ein Messinstrument;
  - Vorher → Jetzt, Warum, Worauf es ankommt, Was das Bild ändern würde;
  - Verlauf über ein Jahr, Marktbreite, Cross Asset, Markt jetzt als Geschichten;
  - danach die Märkte selbst.
- **Detailseiten:** Jede Detailseite erklärt jetzt, wie der Markt steht und welche Rolle er im Marktumfeld spielt.

Die Aussagen entstehen nach festen Regeln; kein Modell entscheidet. Es gibt weder Score noch Kauf- oder Verkaufsaufforderung. Fehlende Daten zählen weder dafür noch dagegen.

## 2. Product Problem

Markets 2.0 beantwortete, *was* die Märkte machen. Nicht beantwortet waren:
- ob das Umfeld besser oder schlechter wird;
- was das für Anleger bedeutet;
- worauf es ankommt;
- was die Einordnung ändern würde.

Die fünf Dimensionen standen als fünf gleichartige Kacheln nebeneinander. Die Schlagzeile („Kein klarer Trend bei den großen US-Markt-Trackern“) war korrekt, aber ohne Konsequenz. Es gab keinen Grund, morgen wiederzukommen: weder Veränderung noch Historie noch Ereignisse.

## 3. Consumer North Star

**„Wie ist das Marktumfeld gerade – und warum?“** Die Antwort steht innerhalb von fünf Sekunden im ersten Bildschirm (Zustand, Hauptaussage, Bedeutung). Jede weitere Fläche beantwortet eine Folgefrage und führt zu den Belegen bis hinunter auf die Detailseite.

## 4. Architecture

```
Multi-Asset-Reihen (Tiingo-first, offizielle Quellen) ─┐
EZB-Referenzkurs (Currency Core) ──────────────────────┤
Faktorzeilen Aktienuniversum ──────────────────────────┼─► scripts/market/build-market-pulse.mjs
Intraday-Sitzungen ─────────────────────────────────────┘      (im bestehenden multi-asset-data.yml)
                                                                 │  quant/engines/multi-asset/market-pulse.js
                                                                 ▼
                              market-pulse.json 1.1.0  +  market-pulse-history.json
                                                                 │
                         Discover: markets.js → market-intelligence.js, market-detail.js
```

- **Wiederverwendet:**
  - Multi-Asset-Vertrag und Snapshot;
  - Market-Pulse-Engine und Kalibrierung;
  - `VUMultiAssetContract.refresh`, Currency Core (`VUFx.layer`, nur im Kopf und Chart der Detailseite);
  - `MicroChart.renderRange`, `LiveHub.live`;
  - der Workflow `multi-asset-data.yml` (Zeitplan `20 */3 * * *`).
- **Neu:** Eine Oberflächendatei (`market-intelligence.js`), ein Historienartefakt, neue Funktionen in der bestehenden Engine.

## 5. Data Core Freeze

- Keine neue Datenquelle, kein Anbieterabruf im Builder. Er liest nur, was im Repository liegt.
- Keine zweite FX-, Realtime-, History-, Kalender- oder Instrument-Engine.
- Discover enthält keine Providerlogik und keine Zustandsberechnung. Ein Test verbietet `environmentLevel`, `seriesSignals`, `moveRatio`, `fetch(` und Providernamen in `market-intelligence.js`.
- Die Spuren sind getrennt:
  - #215 berührt nur Quant, `scripts/market` und den Workflow;
  - #216 berührt nur `discover/` und `scripts/discover/`.
- `assert-no-local-fx`: Werte auf der Grundlinie (33/2).

## 6. Market Intelligence Model

Fünf Dimensionen aus Markets 2.0 (`market-pulse-1.0.0`, unverändert): TREND, BREADTH, MOMENTUM, RISK, CROSS_ASSET. Jede liefert STATE, EVIDENCE, EXPLANATION und METHODOLOGY. Neu darüber liegt das **Marktumfeld** (`market-environment-1.0.0`), §16.

## 7. Market Pulse vs. Macro Regime

- **Market Pulse** beschreibt Marktverhalten aus Preisdaten.
- **Macro Regime** bleibt `NOT_CERTIFIED`. Es gibt keine Ableitung von Expansion, Inflation usw. aus Preisen.
- Das Quant Market Regime bleibt `FAIL_CLOSED` und wird weder verwendet noch imitiert.
- Beides ist im Artefakt (`notes`) und sichtbar auf der Seite vermerkt.

## 8. Determinism

- Alle Zustände entstehen aus Tabellen und Schwellen in `quant/config/market-pulse.json`.
- Tests prüfen:
  - gleiche Eingabe ergibt gleiche Ausgabe (auch für Geschichten und Vergleich);
  - jede der 108 Kombinationen der Entscheidungstabelle hat genau eine Stufe;
  - Monotonie: Ein besserer Zustand senkt die Einordnung nie.
- Es gibt keinen LLM-Aufruf im Build oder in der Oberfläche. Texte sind feste Bausteine je Zustand.

## 9. Trend Methodology

- **Inputs:** SPY, QQQ, DIA, IWM (ETF-Tracker, Tiingo, split-bereinigt, keine Indexstände).
- **Regel:** Positiv, wenn mindestens 3 von 4 über der 50- und der 200-Tage-Linie liegen; negativ, wenn mindestens 3 von 4 unter beiden liegen; sonst gemischt.
- **Consumer:** „Der Trend ist noch nicht breit bestätigt – die großen US-Markt-Tracker liegen teils darüber, teils darunter.“
- **Evidence:** Abstand jedes Trackers zu beiden Linien.

## 10. Breadth Methodology

- **Universum:** US-Aktienuniversum von Vision Universe (Stammaktien, ADR, REIT mit Faktorzeile), 5 584 Titel.
- **Regel:** Breit, wenn mehr als 50 % über der 50- *und* der 200-Tage-Linie liegen; schmal, wenn beide unter 50 % liegen; sonst gemischt. Die Schwelle ist definitorisch (Mehrheit), nicht kalibriert.
- **Freshness:** Liegt der Stichtag der Faktorzeilen vor dem letzten Handelstag, ist der Zustand `NOT_CURRENT`.
  - Derzeit gilt: Stand 18.09., letzter Handelstag 24.09. (Aktien-Tagesdaten, #182).
  - Sobald die Pipeline aktuelle Tagesdaten liefert, wird die Breite ohne Frontend-Änderung wieder aktuell.
- **Consumer:** „Wie viele Aktien tragen die Marktbewegung mit?“ Gezeigt werden:
  - Balken für den Anteil über der 50- und der 200-Tage-Linie, mit Mehrheitsmarke;
  - neue Hochs gegen Tiefs;
  - gestiegen gegen gefallen der letzten Sitzung (aktuell, fließt nicht in den Zustand ein).
  - Veraltete Werte sind schraffiert und mit ihrem Datum als „nicht aktuell, nur zur Orientierung“ gekennzeichnet.

## 11. Momentum Methodology

- **Inputs:** Median der Tracker-Renditen über 3 und 6 Monate (63/126 Handelstage). Das Tempo ergibt sich aus dem 1-Monats-Median gegen den Schnitt der letzten 3 Monate.
- **Overlap Control:** Momentum und Trend stammen aus denselben Trackern. Sie bilden deshalb im Marktumfeld *gemeinsam eine* Basisstufe (§14), nicht zwei Stimmen.
- **Consumer:** „Die Märkte sind über drei und sechs Monate gestiegen. Zuletzt hat das Tempo nachgelassen.“

## 12. Risk Methodology

- **Referenz:** `REFERENCE_INSTRUMENT = SPY`, `SOURCE = TIINGO`, `SERIES_TYPE = SPLIT_ADJUSTED_CLOSE`, `DISTRIBUTIONS = NOT_INCLUDED`, `INSTRUMENT_TYPE = ETF_TRACKER`, `OFFICIAL_SP500_INDEX_LEVEL = false`.
- **Guard:** Der Guard `riskSeries()` und der Test „Risiko-Referenz“ aus #213 bleiben bestehen.
- **Schwankung:** 20 Tage, annualisiert.
  - Erhöht ab dem 75. Perzentil (19,7 %), hoch ab dem 90. Perzentil (26,9 %).
  - Kalibriert auf die Historie seit 1995-02-01 mit 7 964 Beobachtungen.
- **Drawdown vom 52-Wochen-Hoch:** −10 % (Korrektur), −20 % (Bärenmarkt-Konvention). Es gilt die höhere der beiden Stufen.

## 13. Cross-Asset Methodology

- **Beschrieben wird:** die Monatsbewegung je Anlageklasse (Aktien über SPY, US-Rendite 10J, Gold, Öl, Bitcoin, EUR/USD) im Vielfachen ihrer typischen Monatsbewegung (10 Jahre). „Deutlich“ gilt ab dem 1-Fachen.
- **Beziehungen:** gleichzeitige deutliche Bewegungen, zum Beispiel „Aktien und langfristige US-Renditen steigen gleichzeitig.“
- **Verboten** (Tests):
  - „weil“, „wegen“, „führt zu“, „bullish/bearish“, „risk-on/off“;
  - steigendes Gold ist nur „gestiegen“, nicht „Risk-Off“.
- Cross Asset **stimmt im Marktumfeld nicht mit ab**, sondern steht als Kontext da.

## 14. Factor Overlap

| Überschneidung | Behandlung |
|---|---|
| TREND ↔ MOMENTUM (gleiche Tracker, 200-Tage-Linie und 6-Monats-Rendite korreliert) | eine gemeinsame Basisstufe (Tabelle `base`), keine zwei Stimmen |
| TREND ↔ RISK (Drawdown hängt mit Trendlage zusammen) | Risiko wirkt nur als Deckel nach oben, nie als zusätzlicher Punkt |
| BREADTH ↔ TREND (gleiche Methode, andere Grundgesamtheit) | Breite nur als Bestätigung (Stufe 4) bzw. Deckel (schmal: höchstens Stufe 2) |
| CROSS_ASSET ↔ alle | kein Stimmrecht |

## 15. Historical Calibration

`market-pulse-calibration.json` (Aufruf `build-market-pulse.mjs --calibrate`). Die Erwartungen wurden **vor** dem Lauf festgelegt; es wurde nichts nachjustiert.

| Phase | Datum | Trend | Risiko | Marktumfeld | Warum plausibel |
|---|---|---|---|---|---|
| Tief Bärenmarkt 2000–02 | 2002-10-09 | NEGATIVE | HIGH | DEFENSIV | fallende Kurse auf breiter Front, hohe Schwankung |
| Finanzkrise | 2008-10-15 | NEGATIVE | HIGH | DEFENSIV | Crash-Phase |
| Tief Finanzkrise | 2009-03-09 | NEGATIVE | HIGH | DEFENSIV | Tiefpunkt, Regel reagiert nicht voreilig |
| Erholung | 2010-01-15 | POSITIVE | NORMAL | KONSTRUKTIV | Trend und Dynamik wieder positiv |
| Ruhiger Aufwärtstrend | 2013-11-15 | POSITIVE | NORMAL | KONSTRUKTIV | Lehrbuchumfeld |
| Niedrige Volatilität | 2017-06-15 | POSITIVE | NORMAL | KONSTRUKTIV | Lehrbuchumfeld |
| Korrektur Q4 2018 | 2018-12-24 | NEGATIVE | HIGH | DEFENSIV | kurzer, heftiger Rückgang |
| Corona-Crash | 2020-03-20 | NEGATIVE | HIGH | DEFENSIV | extreme Schwankung |
| Erholung 2020 | 2020-08-31 | POSITIVE | NORMAL | KONSTRUKTIV | V-Erholung erkannt |
| Hoch 2021 | 2021-11-15 | POSITIVE | NORMAL | KONSTRUKTIV | vor dem Bärenmarkt 2022 (Beschreibung, keine Prognose) |
| Bärenmarkt 2022 | 2022-06-16 | NEGATIVE | HIGH | DEFENSIV | Zinsschock |
| Erholung 2023 | 2023-12-15 | POSITIVE | NORMAL | KONSTRUKTIV | |

- **12 von 12 Phasen** stimmen, für Trend, Risiko und Marktumfeld.
- **Zustandsverteilung 2001–2026 (wöchentlich, 1 273 Stichproben):** Defensiv 13,6 %, Vorsichtig 22,6 %, Selektiv 18,8 %, Konstruktiv 45 %. „Breit konstruktiv“ kommt historisch nicht vor, weil die Marktbreite nicht rekonstruierbar ist. Das Ergebnis ist also keine Dauerampel.
- **Letzte 12 Monate (point in time):** Konstruktiv 179 Tage, Selektiv 46, Vorsichtig 15, Defensiv 12. Dabei gab es 17 Wechsel der Einordnung.

## 16. Market Environment

`market-environment-1.0.0`: `Stufe = min(Basis + Breitenbonus, Risikodeckel, Breitendeckel)`.

| Basis (Trend \| Momentum) | Steigend | Uneinheitlich | Fallend |
|---|---|---|---|
| Positiv | 3 | 2 | 2 |
| Gemischt | 2 | 1 | 1 |
| Negativ | 1 | 1 | 0 |

- **Risikodeckel:** normal 4, erhöht 2, hoch 1.
- **Breite:**
  - „breit“ ergibt +1 auf Basis 3 und damit „Breit konstruktiv“;
  - gemischt oder unbekannt: Deckel 3;
  - schmal: Deckel 2.
- **Fail closed:** Ohne Trend, Momentum oder Risiko gibt es keine Einordnung.
- **Stufen und Anlegertexte (fest, keine Empfehlung):**
  - Defensiv: „erhöhte Vorsicht bei neuen Positionen“;
  - Vorsichtig: „eher Zurückhaltung als zusätzliche Risikobereitschaft“;
  - Selektiv: „eher selektive Einstiege als breite Risikobereitschaft“;
  - Konstruktiv: „konstruktiv, aber noch nicht auf breiter Basis bestätigt“;
  - Breit konstruktiv.
- **Sprachtests:** Kein „kaufen“, „verkaufen“, „all-in“, „sollten Sie“ oder „Kaufsignal“ in allen 108 Kombinationen.

## 17. Market Intelligence Hero (vorher / nachher)

- **Vorher:** H1 „Märkte“, ein Einleitungssatz, dann eine Liste „Markt jetzt“ und fünf gleichartige Kacheln mit Schlagzeile.
- **Nachher:** Ein dunkler Hero als einzige Bühne der Seite. Der globale Hintergrund bleibt weiß. Er enthält:
  - Eyebrow mit Datenstand;
  - der Zustand groß („Selektiv“), darunter das Stufenspektrum (Defensiv … Breit konstruktiv, vorherige Stufe als Ring);
  - die Hauptaussage;
  - „Für Anleger bedeutet das“;
  - „Seit der Bewertung vom 23.09.: …“;
  - rechts bzw. mobil darunter „Die Gründe auf einen Blick“ (fünf Dimensionen mit Zeichen ✓ – ? ·);
  - zwei Sprungziele: „Warum diese Einordnung?“, „Was würde sie ändern?“;
  - den Bewertungszyklus.

## 18. Intelligence Visualization

**„Fünf Dimensionen, ein Bild“:** ein Instrument mit fünf Zeilen, keine fünf Karten. Je Zeile stehen:
- Dimension mit Konsumentenfrage;
- Zustand mit Rollenzeichen;
- eine Skala mit den **echten Schwellen der Methodik** (Trend: 3 von 4; Breite: Mehrheit; Momentum: 0 %; Risiko: Median, erhöht, hoch);
- der Messwert als Punkt, die vorherige Bewertung als Ring.

Weitere Eigenschaften:
- Cross Asset zeigt sechs Punkte (Monatsbewegung im Vielfachen des Typischen) auf einer neutralen Skala.
- Der Punkt gleitet beim Laden von der vorherigen zur aktuellen Position (funktionale Bewegung; bei `prefers-reduced-motion` ohne Animation).
- Antippen öffnet Zustand, Belege, Erklärung und Methodik.
- Es wird keine Präzision vorgetäuscht: Die Skala zeigt nur Messwert und Schwelle, keine Zwischenwertung.

## 19. Today vs. Previous

- **Vergleichsbasis:** die vorherige Bewertung nach derselben Methode (vorheriger Handelstag der Historie).
- **Zeilen:** Marktumfeld, Trend, Marktbreite, Momentum, Risiko, US-Rendite 10J.
- **Status je Zeile:** verbessert, verschlechtert, unverändert oder nicht vergleichbar.
- **Größte Veränderung:** zuerst ein Zustandswechsel (Umfeld vor Trend, Breite, Momentum, Risiko). Sonst lautet sie „Marktbild seit der letzten Bewertung weitgehend unverändert.“ Das ist der aktuelle Stand.
- Numerische Bewegung ohne Zustandswechsel wird gezeigt (zum Beispiel Momentum +1,8 % → +1,1 %), aber nie Schlagzeile.
- **Zustandswechsel** werden als Ereignisse persistiert (`events` in der Historie), zum Beispiel 21.09. Vorsichtig → Selektiv, 15.09. Selektiv → Vorsichtig, 08.09. Konstruktiv → Selektiv.

## 20. Pulse History

- **Umfang:** 300 Handelstage (17.07.2025–24.09.2026), Zeiträume 1W/1M/3M/6M/1J.
- **Look-Ahead-Schutz:**
  - Jeder Tag entsteht nur aus Daten bis zu diesem Tag: Linien, Renditen und 52-Wochen-Hoch aus der abgeschnittenen Reihe;
  - die Volatilitätsschwellen sind Perzentile der Verteilung *bis zum Tag* (expandierend ab 1995-02-01) statt der heutigen Kalibrierung;
  - die Marktbreite stammt **nur** aus dem materialisierten Breitenprotokoll (erster Eintrag 18.09.2026). Eine Rückrechnung aus dem heutigen Universum wäre survivorship-verzerrt.
- **Nachweis:** Ein Test rechnet Stichproben mit abgeschnittenen Reihen nach: gleicher Zustand, gleiche Schwellen.
- **Darstellung:** Balken je Zustandsphase auf der Stufenachse, dazu eine Textfassung (Anteile, Wechsel, Richtung) und die Wechsel im Zeitraum.

## 21. What Matters Now

Höchstens vier Punkte nach fester Reihenfolge:
1. Dimensionen, deren nächster Wechsel die Einordnung ändert und die nah an ihrer Schwelle liegen (Trend ≤ 3 %, Momentum ≤ 3 %, Risiko ≤ 15 % relativ);
2. eine nicht aktuelle Marktbreite;
3. die erste deutliche Cross-Asset-Beobachtung als Kontext;
4. übrige einordnungsrelevante Dimensionen.

Derzeit ergibt das: Trend (DIA/IWM verlinkt), Dynamik, Marktbreite, Kontext US-Renditen (US10Y verlinkt).

## 22. What Would Change the Picture

- **Kontrafaktik mit derselben Tabelle:** Für jede Dimension wird der nächstgelegene Zustand gesucht, der die Einordnung tatsächlich ändert. Die Bedingung wird nur aus Schwelle und Messwert formuliert. Aktuell:
  - Positiver: „wenn mindestens 3 der 4 großen US-Markt-Tracker über ihrer 50- und 200-Tage-Linie liegen (derzeit 2). Am nächsten dran: DIA (2,9 % bis über beide Linien)“ → Konstruktiv.
  - Negativer: Trend negativ, Momentum dreht (derzeit +1,1 % über 3 Monate) oder Risiko hoch (Schwankung SPY 26,9 % bzw. −20 % vom Hoch) → Vorsichtig.
- **Test:** Jede genannte Bedingung ändert die Stufe wirklich. Jede Dimension mit einem solchen Nachbarzustand erscheint.

## 23. Market Now

- **Auswahl** (`marketNow`, unverändert aus 2.0): Tagesbewegung im Vielfachen der typischen Tagesbewegung (ca. 3 Monate). Nur aktuelle Werte (`maxAgeDays` 3), höchstens 2 je Gruppe, 3–5 Einträge. Lieber weniger als mit alten Werten aufgefüllt.
- **Neu:** Gleiche Gruppe und gleiche Richtung werden zu einer Geschichte gebündelt, zum Beispiel „Renditedruck nimmt zu – Die Renditen steigen über mehrere Laufzeiten. Bund 10J +10 bp, Bund 2J +7 bp.“ Dazu kommt „Warum relevant?“ als allgemeine Einordnung der Anlageklasse, ohne Kausalität.
- Jede Geschichte hat Stand und Frische, jede Bewegung einen Link.

## 24. Market Breadth Experience

Siehe §10. Die Fläche beginnt mit der Konsumentenfrage und dem Zustand als Etikett („NICHT AKTUELL“ mit Begründung und Daten). Danach folgen die Balken. Ein materialisiertes Protokoll der Sitzungen (gestiegen/gefallen) wächst mit jedem Lauf und wird ab zwei Sitzungen als Säulenreihe gezeigt.

## 25. Detail Pages

„Wie steht dieser Markt?“ aus den Kennzahlen des Core (`instruments` im Artefakt), asset-aware:

- **Tracker, Index, Metalle, Energie, Krypto, FX:**
  - Trend gegen die 50/200-Tage-Linie;
  - Lage in der 52-Wochen-Spanne;
  - Abstand zum Hoch;
  - Schwankung gegen die eigene 5-Jahres-Verteilung (Krypto annualisiert mit 365 Tagen);
  - Veränderung 1M/3M/1J.
  - Keine Beträge: Die Währung bleibt Sache des Currency Core.
- **Renditen, EFFR:**
  - Abstand zum 50/200er-Durchschnitt in bp;
  - Spanne in %;
  - Veränderungen in bp;
  - ohne Kursrisiko.
- **Leitzins-Beschlüsse (Stufen):** keine Kurskennzahlen, weiter „letzte Änderung“.
- **„Rolle im Marktumfeld“:**
  - Tracker gehören zur Trend- und Momentum-Messung;
  - SPY ist die Risiko-Referenz;
  - Cross-Asset-Instrumente mit ihrer Monatsbewegung;
  - Link zurück zum Marktumfeld.

## 26. Mobile, Accessibility, Performance

- **Mobile:**
  - Das Hero-Raster wird einspaltig;
  - Dimensionszeilen sind zweizeilig mit voller Skala;
  - Zeitraumknöpfe stehen in einer Zeile;
  - kein Querlauf (geprüft 320/390/1440).
- **Accessibility:**
  - axe ohne ernste oder kritische Befunde auf `#/maerkte` hell und dunkel, `#/maerkte/QQQ`, `#/maerkte/US10Y`;
  - Kontrast der Warntöne angehoben;
  - jede Farbe hat Text oder Zeichen dazu;
  - der Verlauf hat eine Textfassung, Skalen tragen den Wert als Text.
- **Performance:**
  - zusätzlich ein Skript (`market-intelligence.js`, 11 KB gz) und ein Historienartefakt (7 KB gz, parallel geladen); der Pulse ist 10 KB gz;
  - keine zusätzliche Realtime-Subscription;
  - einmaliges Rendern; der Zeitraumwechsel im Verlauf zeichnet nur das Diagramm neu;
  - alle Berechnungen liegen im Core.

## 27. Market → Stock (vorbereitet, nicht erfunden)

Das Artefakt trägt Marktumfeld, Stufe und Gründe maschinenlesbar (`environment.state/level/why`). Eine spätere Einzelaktienanalyse kann diesen Kontext konsumieren. Es gibt in diesem Auftrag keine Aussage „Aktie X in Umfeld Y“, weil Sektor- und Relativstärke-Verträge fehlen.

## 28. Return Reason

- neue Bewertung alle drei Stunden (Datenstand je Handelstag);
- Vorher → Jetzt;
- Zustandswechsel mit Datum;
- der wachsende Verlauf;
- Markt jetzt;
- das Sitzungsprotokoll der Breite;
- neue Cross-Asset-Konstellationen.

Keine Gamification.

## 29. Production Proof (2026-09-25, research.visionuniverse.de)

### 29.1 Läufe

| Lauf | Gegen | Ergebnis |
|---|---|---|
| Live-Rauchtest [36129205136](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36129205136) – Märkte-QA 1.2.0 **Chromium** | ausgelieferte Seite (main `bb63532`) | **PASS 359/359** |
| derselbe Lauf – Märkte-QA 1.2.0 **WebKit** | ausgelieferte Seite | **PASS 359/359** |
| derselbe Lauf – Discover-Browser-QA (gesamtes Discover) | ausgelieferte Seite | PASS 186/186 |
| derselbe Lauf – Discover-Live-QA | ausgelieferte Seite | PASS 33/33 |
| Multi-Asset-Lauf [36126539281](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36126539281) (Ingest + Pulse + Proof) | Pipeline und ausgelieferte Seite | Gates 18/18 PASS |
| derselbe Lauf – Pulse und Historie über die Pipeline | `d365f1e` „Market Pulse aktualisiert (automatischer Lauf)“ | beide Artefakte materialisiert |

- **Erster Lauf:** [36126529212](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36126529212) endete mit Chromium bei 357/359. Beide Befunde waren Zeitrennen der Prüfung und keine Produktfehler:
  - der weiche Bildlauf der Sprungleiste wurde nach 900 ms gemessen;
  - axe maß direkt nach einem Themenwechsel auf derselben Seite.
- **Korrektur (#217):** Die Prüfung wartet, bis der Bildlauf steht. axe misst je Route in einer frischen Seite. WebKit läuft auch nach einem roten Chromium-Lauf. Die Sprünge respektieren `prefers-reduced-motion`.
- **Frische:** Die strenge Frische-Prüfung desselben Laufs ist rot, und zwar ausschließlich wegen der **Aktien-Tagesdaten** (Stand 18.09., erwartet 24.09.; #182, außerhalb dieses Auftrags). Die Marktbreite zeigt genau deshalb ehrlich `NOT_CURRENT` (§10).

### 29.2 Geprüfte Verträge (Auszug, je 390/1440 hell sowie 320 dunkel, Chromium und WebKit)

| Prüfung (58.x) | Ergebnis |
|---|---|
| A · Erste fünf Sekunden: Zustand und Hauptaussage im ersten Bildschirm (390 px), Bedeutung für Anleger | PASS |
| B · Live-System: letzte Neubewertung, nächste „ca.“, kein Sekundenzähler, Veränderung seit der letzten Bewertung | PASS |
| C · Fünf Dimensionen mit Skala, Belegen und Methodik | PASS |
| 58.2 · Hero, Umfeld, Erklärung, Evidence, Vorher/Jetzt, Worauf, Ändern, Markt jetzt, Cross Asset, Verlauf, Breite, klickbare Märkte – mit Inhalt, nicht nur Container | PASS |
| 58.3/58.4 · Erste fünf Sekunden und Entscheidungskontext | PASS |
| 58.7 · Kein 0–100-Score, keine Kauf- oder Verkaufsaufforderung, Hinweis sichtbar | PASS |
| 58.9 · Verlauf: Zeitraumwechsel 3M → 1J ändert Diagramm und Textfassung | PASS |
| 58.10 · Marktbreite `NOT_CURRENT` ehrlich angezeigt | PASS |
| 58.11 · Tracker QQQ/SPY/DIA: „Tracker · QQQ“, nie Punkte, Offenlegung | PASS |
| 58.13 · Detailseiten QQQ, SPY, DIA, N225, WTI, Gold, BTC, ETH, US10Y, DE10Y, Fed, EZB, EUR/USD: Identität, Einheit, Frische, Chart, Zeiträume, Einordnung | PASS |
| 58.14 · 1T nur mit Intraday-Pfad; Renditen und Leitzinsen ohne 1T; Beschlüsse ohne Kurskennzahlen | PASS |
| 58.16 · Markt jetzt: jede Geschichte mit Stand, jede Bewegung verlinkt | PASS |
| 58.17 · Cross Asset: „nicht, warum“, Anlageklassen verlinkt | PASS |
| 58.19/58.20 · 320/390/1440, hell/dunkel, Chromium **und** WebKit, kein Querlauf | PASS |
| 58.21 · axe: `#/maerkte` hell und dunkel, QQQ hell, US10Y dunkel – keine ernsten oder kritischen Befunde | PASS |
| 58.23 · Visuelle Abfolge: ≥ 7 Flächentypen in 10 mobilen Bildschirmen, keine reine Kartenwand | PASS |
| 58.25 · Navigation: Karte → Detail, Reload auf der Detailroute, Zurück; Sprungleiste | PASS |

### 29.3 Stand zum Prüfzeitpunkt

- Marktumfeld **Selektiv** (Stufe 2 von 0–4): „Positive Dynamik – aber der Trend ist noch nicht breit bestätigt.“
- Gründe:
  - unterstützt: Momentum (Aufwärtsdynamik, Tempo nachlassend), Risiko (normal, SPY-Schwankung 10,8 %);
  - noch nicht bestätigt: Trend (2 von 4 Trackern über beiden Linien);
  - nicht beurteilbar: Marktbreite;
  - Kontext: US-Rendite 10J +54 bp und Gold −8,4 % über einen Monat.
- Vorher → Jetzt: 23.09. → 24.09., „Marktbild seit der letzten Bewertung weitgehend unverändert.“
- Letzte Wechsel: 21.09. Vorsichtig → Selektiv, 15.09. Selektiv → Vorsichtig, 08.09. Konstruktiv → Selektiv.

### 29.4 Realtime (58.15)

Der Proof lief um 11:26 UTC, also 07:26 New York (`PRE_MARKET`). **`REALTIME_TRACKER = MARKET_CLOSED_NOT_PROVEN`**, bewusst kein künstliches PASS. Geprüft und bestanden ist die Gegenrichtung: kein „Live“ ohne frischen Tick, auf allen Detailseiten in beiden Engines.

Der Nachweis bei offener US-Börse ist für 14:15 UTC eingeplant (IEX-Stufe-6-Sonde für QQQ/SPY/DIA und Märkte-QA während der Sitzung). Er wird hier und in `VU_TIINGO_FIRST_MARKET_TRACKERS.md` nachgetragen.

## 30. Zielzustände

| Zielzustand | Stand | Beleg |
|---|---|---|
| MARKET_INTELLIGENCE_HERO | PRESENT | §17, QA 58.2 |
| MARKET_ENVIRONMENT (deterministisch, kein Score) | PRESENT | §16, 108 Kombinationen getestet |
| STATE → EVIDENCE → EXPLANATION → METHODOLOGY | PRESENT | §18, QA „Belege und Methodik“ |
| TODAY_VS_PREVIOUS / WHAT_CHANGED | PRESENT | §19 |
| WHAT_MATTERS_NOW | PRESENT | §21 |
| WHAT_WOULD_CHANGE_THE_PICTURE | PRESENT | §22, Kontrafaktik-Test |
| MARKET_NOW (Geschichten, Frische) | PRESENT | §23 |
| CROSS_ASSET_CONTEXT (ohne Kausalität) | PRESENT | §13 |
| MARKET_PULSE_HISTORY (point in time) | PRESENT | §20, Look-Ahead-Test |
| MARKET_BREADTH | NOT_CURRENT (ehrlich) | §10, #182 |
| MARKET_DETAILS | CLICKABLE, mit Einordnung | §25 |
| DETERMINISM / NO_LLM_STATE | PASS | §8 |
| NO_OPAQUE_SCORE | PASS | QA 58.7 |
| MACRO_REGIME | NOT_CERTIFIED | §7 |
| QUANT_MARKET_REGIME | FAIL_CLOSED, unberührt | §7 |
| TRACKER_TRUTH | PASS | QA 58.11 |
| SPY_RISK_REFERENCE (Tiingo, split-bereinigt, kein Index) | PASS | §12, Test aus #213 |
| DATA_CORE_FREEZE / NEW_PARALLEL_DATA_ARCHITECTURES = 0 | PASS | §5 |
| DISCOVER_PROVIDER_LOGIC = 0 | PASS | Test in `market-intelligence.test.mjs` |
| CURRENCY_CORE_REUSED | PASS | `assert-no-local-fx` 33/2 |
| PAID_SERVICES = 0 / ZERO_COST_MODE | PASS | keine neue Quelle |
| MOBILE / WEBKIT / A11Y | PASS | §29.2 |
| REALTIME_TRACKER | MARKET_CLOSED_NOT_PROVEN | §29.4 – Nachweis 14:15 UTC eingeplant |

## 31. Offene Punkte

1. **Aktien-Tagesdaten (#182):** Solange die Faktorzeilen auf dem 18.09. stehen, ist die Marktbreite `NOT_CURRENT`. Die Einordnung kann deshalb höchstens „Konstruktiv“ erreichen. Das behebt sich automatisch.
2. **Sektoren:** Kein Sektor-Vertrag (99 kuratierte GICS-nahe Titel, SIC-Hauptgruppen sind keine Anlegersektoren). Owner-Entscheidung nötig.
3. **Breitenhistorie:** Sie beginnt mit dem ersten materialisierten Lauf (18.09.2026) und wächst ab jetzt. Keine Rückrechnung.
4. **Movers ohne Volumen:** Der Intraday-Pfad trägt kein Volumen.
