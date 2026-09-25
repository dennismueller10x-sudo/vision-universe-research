# VISION UNIVERSE® — Discover Markets 2.0: Market Detail & Market Intelligence

Ausgangsbasis ist der bestehende Multi-Asset-Core (Vertrag 1.1.0) und die Märkte-Seite `#/maerkte` (PR #206–#209). Beides wird nicht neu gebaut, sondern erweitert:
- **Core:** Market-Pulse-Engine, Builder und Kalibrierung.
- **Discover:** Market-Detail-System, „Markt jetzt“ und die Intelligence-Ebene.

## 1. Agent-Graph

| Agent | Aufgabe | Zustand | hängt ab von | Quality Gate |
|---|---|---|---|---|
| A Existing Architecture Audit | Inventar, Wiederverwendung | DONE | – | Befunde mit Datei:Zeile |
| B Multi-Asset Detail Contract | Detail liest den bestehenden Vertrag (`history.intervals`, `intradayPath`, `capabilities`, `tracker`, `proxy`) | DONE – keine Vertragsänderung nötig | A | DATA_TRUTH |
| C Chart & History | `MicroChart.renderRange` + kanonische Reihen | Discover-PR | A, B | Zeitraumwahrheit |
| D Asset Semantics | Einheit, bp/%, Umrechnung nur über Currency Core | Discover-PR | B | CURRENCY_CORE_REUSED |
| E Realtime / Session | `LiveHub.live` (bestehender VU-Live-Worker), nur Tracker, nur reguläre US-Sitzung | Discover-PR | A | kein falsches LIVE |
| F Market Breadth | Faktorzeilen + Intraday-Sitzungen | DONE (Core) | A | Nenner, Stand, Universum |
| G Sector Pulse | Datenlage geprüft | NOT_IMPLEMENTED (Datenqualität) | A | Fail-closed |
| H Cross-Asset Intelligence | Ausschläge relativ zur eigenen Historie | DONE (Core) | A | keine Kausalität |
| I Market Movers | Intraday-Sitzung gegen Vorsitzung, liquide Titel | DONE (Core) | A | kein neuer Provider |
| J Market Pulse / Regime | deskriptiver Pulse; Quant-Regime FAIL_CLOSED bleibt unberührt | DONE (Core) | F, H | Kalibrierung, Tests |
| K Discover UX | Detailseiten, klickbare Karten, Markt jetzt, Pulse | Discover-PR | C, D, E, J | Discover-Tests |
| L Mobile QA | 320/390/1440, hell/dunkel, Chromium/WebKit | nach Discover-PR | K | Browser-QA |
| M Data Truth | Identität, Einheit, Frische, Herkunft je Instrument | laufend | alle | Gates |
| N Production Proof | gegen research.visionuniverse.de | nach Deployment | L, M | Proof-Bericht |

- **Recovery Loops:** Ein rotes Gate führt zu Root Cause, Fix und Neuprüfung. Ein fehlendes oder veraltetes Input führt dazu, dass die Dimension `NOT_CURRENT`/`UNAVAILABLE` meldet. Es gibt keinen Ersatzwert.
- **Stop Conditions:**
  - kein Target State ohne neue Pipeline oder neuen Provider erreichbar;
  - Owner-Entscheidung außerhalb der Freigabe;
  - bezahlter Dienst nötig.

## 2. Wiederverwendung (Architecture First)

| Baustein | Entscheidung |
|---|---|
| Router `discover/app.js` | neuer Zweig `#/maerkte/<SYMBOL>`. Der Router vergleicht ganze Segmente, deshalb gibt es keinen Konflikt. |
| Chart | `VUDiscover.MicroChart.renderRange` (beliebige `[[datum, wert]]`, einheitenlos) statt einer zweiten Chart-Engine |
| Zeiträume | `history.intervals` im Vertrag und `VUQuant.SeriesSampling.sliceRange` |
| Realtime | `VUDiscover.LiveHub.live(symbol)` mit dem bestehenden Worker `wss://live.visionuniverse.de/live`. Der Worker hat keine Symbol-Allowlist, streamt nur Tiingo IEX und nur in der regulären US-Sitzung. |
| Frische | `VUMultiAssetContract.refresh` und `VURealtime.AssetFreshness` |
| Währung | `VUMultiAssetContract.present` und `VUFx.layer.series` (nur `CONVERTIBLE`) |
| Breadth | `quant/data/market/factors/factors-FULL_UNIVERSE.json` (Faktorzeilen) |
| Steigend/fallend, Movers | `quant/data/market/intraday/<session>/*.json` |
| Quant Market Regime | FAIL_CLOSED, **nicht** verwendet und nicht imitiert |
| Macro (`macro/`) | eigener V1, nicht verwendet. MACRO_REGIME = NOT_CERTIFIED |

Realtime gilt nur für die ETF-Tracker. Krypto und Edelmetalle haben keinen Browser-Stromweg: Der Worker ist IEX-only, und `realtimeCapability` ist im Vertrag `null`. Sie zeigen den Stand des letzten Ingest-Laufs (alle 3 Stunden) mit Uhrzeit, nie „Live“.

## 3. Market Pulse — Methodik (`market-pulse-1.0.0`)

- **Engine:** `quant/engines/multi-asset/market-pulse.js`, rein und deterministisch, für Node und Browser.
- **Schwellen:** `quant/config/market-pulse.json`, versioniert.
- **Artefakt:** `quant/data/market/intelligence/market-pulse.json`, gebaut von `scripts/market/build-market-pulse.mjs` im bestehenden Workflow `multi-asset-data.yml`, alle 3 Stunden nach dem Ingest.
- **Kalibrierung:** `quant/data/market/intelligence/market-pulse-calibration.json`, erzeugt mit `--calibrate`.

Jede Dimension liefert **STATE → EVIDENCE → EXPLANATION → METHODOLOGY**. Es gibt keinen Gesamtscore und keine Prognose; gleiche Daten ergeben immer dieselbe Aussage.

### 3.1 Dimensionen, Rohsignale, Schwellen

| Dimension | Rohsignale | Zustände | Schwelle | Basis |
|---|---|---|---|---|
| TREND | Schlusskurs gegen den 50- und 200-Tage-Durchschnitt von SPY, QQQ, DIA und IWM | POSITIVE / NEGATIVE / MIXED | 3 von 4 Trackern über (unter) beiden Linien | definitorisch (Mehrheit) |
| BREADTH | Anteil über SMA50 und SMA200, neue 52W-Hochs und -Tiefs, gestiegen/gefallen (Sitzung gegen Vorsitzung) | BROAD / NARROW / MIXED / NOT_CURRENT | > 50 % bzw. < 50 % bei beiden Linien | definitorisch, **nicht kalibriert** |
| MOMENTUM | Median der Tracker-Renditen über 1, 3 und 6 Monate (21/63/126 Handelstage) | RISING / FALLING / MIXED, dazu das Tempo ACCELERATING / SLOWING | Vorzeichen der 3M- und 6M-Mediane; Tempo = 1M gegen 3M/3 | definitorisch |
| RISK | SPY: 20-Tage-Volatilität (annualisiert), Abstand zum 52-Wochen-Hoch | NORMAL / ELEVATED / HIGH | Volatilität ≥ p75 (19,7 %) bzw. ≥ p90 (26,9 %) der SPY-Historie seit 1995; Rückgang ≤ −10 % / ≤ −20 %. Es gilt die höhere Stufe. | Volatilität **kalibriert**, Rückgang Marktkonvention |
| CROSS_ASSET | 1-Monats-Veränderung von SPY, US10Y (bp), Gold, WTI, Bitcoin und EUR/USD, jeweils im Verhältnis zur typischen 1-Monats-Veränderung der letzten 10 Jahre | OBSERVED (Beobachtungen) / CALM | „deutlich“ ab dem 1,0-fachen | eigene Historie |

- **Breadth-Universum:** Stammaktien, ADR und REIT mit Faktorzeile (5 584 bzw. 5 014 bewertbar am 18.09.). Der Nenner steht in jeder Aussage.
- **Veraltete Breitendaten:** Sind sie älter als der letzte Handelstag des SPY-Trackers, meldet BREADTH `NOT_CURRENT`. Die Zahlen bleiben dann sichtbar, fließen aber in keine Einordnung ein.

### 3.2 Schlagzeile und Gewichtung

Die Schlagzeile folgt einer festen Textregel aus TREND und BREADTH; RISK kommt nur bei `ELEVATED`/`HIGH` als Zusatz hinzu. Beispiele: „Aufwärtstrend – aber nur wenige Aktien tragen ihn · Schwankungen erhöht“ oder „Kein klarer Trend bei den großen US-Markt-Trackern“.

- **Gewichtungen:** keine. Es gibt keinen Score, also auch keine Gewichte.
- **MOMENTUM** geht bewusst nicht in die Schlagzeile ein, wegen der Überschneidung mit TREND.

### 3.3 Historische Kalibrierung und Gegenprobe

Stichprobe: alle 5 Handelstage vom 2001-06 bis 2026-09, 1 273 Zeitpunkte.

- **Verteilung:** TREND ist 54 % positiv, 17 % negativ und 29 % gemischt. RISK ist 71 % normal, 15 % erhöht und 14 % hoch. Es gibt also keine Dauerampel.
- **Phasenprüfung:** 12 von 12 bekannten Phasen werden plausibel eingeordnet. Geprüft wurden: Tief 2002, Finanzkrise 2008, Tief 2009, Erholung 2010, ruhiger Trend 2013, niedrige Volatilität 2017, Korrektur Dezember 2018, Corona-Crash 2020, Erholung 2020, Hoch 2021, Bärenmarkt 2022 und Erholung 2023.
- **Charakter der Prüfung:** Sie plausibilisiert nur. Es gibt keine Optimierung auf Rendite und keine Vorwärtsrenditen.
- **Breadth:** nicht kalibriert. Es gibt keine Breitenhistorie im Core, und eine Rückrechnung aus heutigen Titeln wäre survivorship-verzerrt. Deshalb gilt nur die Mehrheitsschwelle.

### 3.4 Factor Overlap

| Paar | Überschneidung | Umgang |
|---|---|---|
| TREND ↔ MOMENTUM | 200-Tage-Lage und 6M-Rendite korreliert | MOMENTUM nicht in der Schlagzeile |
| TREND ↔ RISK | Rückgang vom Hoch hängt mit der Trendlage zusammen | RISK nur als Zusatz ab ELEVATED |
| BREADTH ↔ TREND | gleiche Methode (SMA), aber andere Grundgesamtheit | Divergenz ist die Aussage („nur wenige Aktien tragen ihn“) |

### 3.5 Deterministisch und erklärend

- **Deterministisch:** alle `state`-Werte, Schlagzeilen, Zustandstexte (`summary`), Evidenzzeilen, Cross-Asset-Beobachtungen und die Auswahl für „Markt jetzt“.
- **Nur erklärend:** `explanation` je Dimension, also fester Text, der die Kennzahl erklärt. Er bewertet nichts und empfiehlt nichts.
- Es gibt keine KI- oder LLM-Entscheidung.

### 3.6 Bewusst nicht zertifiziert

- **Quant Market Regime:** FAIL_CLOSED. Es ist nicht umgangen, trägt einen anderen Namen und hat keinen gemeinsamen Vertrag mit dem Pulse.
- **MACRO_REGIME:** NOT_CERTIFIED.
- **Sector Pulse:** NOT_IMPLEMENTED. GICS-nahe Sektoren gibt es nur für 99 kuratierte Titel; die 5 355 SEC-SIC-Hauptgruppen sind keine Anlegersektoren, und es gibt keine Marktkapitalisierungen.
- **Volumenspitzen der Movers:** nicht umgesetzt, weil der Intraday-Pfad kein Volumen trägt.
- **Breadth-Kalibrierung:** NOT_CALIBRATED (siehe 3.3).

## 4. Markt jetzt

Die Auswahl läuft zur Anzeigezeit im Browser über die Engine auf dem Vertrag (`history.recent`), nach Frischebewertung.

1. Für jedes Instrument wird die jüngste Tagesveränderung durch seine typische Tagesveränderung der letzten ~3 Monate geteilt.
2. Ab dem 1-fachen gilt die Bewegung als „deutlich“, ab dem 2-fachen als „stark“.
3. Angezeigt werden höchstens 5 Bewegungen, höchstens 2 je Gruppe und mindestens 3.
4. Es nehmen nur Werte teil, die `LIVE`, `CURRENT` oder `LAST_SESSION` sind. Policy-Raten (Stufenreihen) nehmen nicht teil.
5. Renditen stehen in bp und ohne Kursfarbe.
6. Tracker vor der US-Eröffnung heißen „letzter Handelstag“, nicht „heute“.

## 5. Market Movers

- **Berechnung:** der letzte 5-Minuten-Kurs der jüngsten Sitzung gegen den letzten Kurs der Vorsitzung, aus zwei echten Snapshots. Der `previousClose` der Snapshots wird nicht verwendet, weil er aus der Tagesreihe stammt.
- **Universum:** das Discover-Aktienuniversum, mit einem Dollarumsatz über 20 Tage von mindestens 20 Mio. USD und einem Kurs von mindestens 5 USD.
- **Ausgabe:** je 5 Gewinner und Verlierer. Jeder Titel verlinkt auf seine Aktienseite.
