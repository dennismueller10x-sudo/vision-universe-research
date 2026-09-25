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

## 6. Umsetzung

| PR | Lane | Inhalt |
|---|---|---|
| #210 | Core | Engine `market-pulse.js`, Konfiguration, Builder, Kalibrierung, Tests, Workflow-Schritt; „Markt jetzt“ mit Altersgrenze; Tracker-Texte mit Umlauten |
| #211 | Discover | `ui/market-detail.js` (ein Detail-System), Route `#/maerkte/<SYMBOL>`, klickbare Karten, Markt jetzt, Was bewegt die Märkte?, Aktien in Bewegung, Browser-QA (Chromium + WebKit) |

Die Lane-Trennung ist eingehalten: `discover-ci` hat kein Mixed-PR-Gate verletzt, und keine Gates wurden abgeschwächt.

## 7. Production Proof (2026-09-25, research.visionuniverse.de)

**Daten** (`quant/data/market/multi-asset/production-proof.json`, 09:07 UTC):
- 18 von 18 Gates bestanden.
- 29 Instrumente PASS.
- NDX, SPX und DJI sind erwartete Lücken (CAPABILITY_GAP).

**Market Pulse im Produktivpfad** (`market-pulse.json`, gebaut im Workflow, 09:08 UTC):

| Dimension | Zustand | Aussage |
|---|---|---|
| Schlagzeile | – | „Kein klarer Trend bei den großen US-Markt-Trackern“ |
| TREND | MIXED | SPY und QQQ über beiden Linien, DIA und IWM unter der 50-Tage-Linie |
| BREADTH | NOT_CURRENT | Faktorzeilen vom 18.09., letzter Handelstag 24.09. – keine Einordnung, Zahlen sichtbar |
| MOMENTUM | RISING | positiv über 3 und 6 Monate, Tempo lässt nach |
| RISK | NORMAL | Volatilität 10,8 %, 1,4 % unter dem 52-Wochen-Hoch |
| CROSS_ASSET | OBSERVED | US-Renditen +54 bp (2,2-fach typisch), Gold −8,4 % (1,6-fach typisch) |

Die Movers kommen aus der Sitzung vom 24.09. gegenüber dem 23.09. mit 1 991 liquiden Titeln, zum Beispiel TWST +16,07 % und ACAD −12,74 %.

**Seite** (`scripts/discover/browser-qa-maerkte.mjs` im Workflow „Discover Live-Rauchtest“):
- Märkte-QA besteht in Chromium **und** WebKit, jeweils 294 von 294.
- Übersicht bei 390 und 1440 px:
  - Gruppen, Tracker-Kennzeichnung, Einheiten, 24/7 und bp;
  - „Markt jetzt“ mit Links zum Detail;
  - Pulse mit fünf Dimensionen, ohne Score;
  - Movers mit Links zu den Aktienseiten.
- 13 Detailseiten bei 390 px hell: QQQ, SPY, DIA, Nikkei 225, WTI, Gold, BTC, ETH, US 10J, Bund 10J, Fed, EZB, EUR/USD.
- Vier Detailseiten zusätzlich bei 320 px dunkel und 1440 px hell.
- Geprüft wird je Seite:
  - Kopf, Chart und Zeiträume, Zurück-Link, kein Querlauf, „Live“ nur beim Tracker;
  - Tracker ohne Punkte und mit Offenlegung, Nikkei in Punkten;
  - Krypto 24/7, Renditen in %/bp neutral ohne 1T, Leitzins als Beschluss, WTI ohne 1T und ohne Live, Gold je Feinunze, EUR/USD nicht umgerechnet.
- Navigation: Karte zum Detail, Reload auf der Detailroute, Browser-Zurück.
- Barrierefreiheit (axe): keine kritischen oder ernsten Verstöße auf `#/maerkte`, `#/maerkte/QQQ` und `#/maerkte/US10Y`.

**Im selben Lauf, außerhalb von Markets 2.0:**
- Browser-QA Discover: 185 von 186 bestanden. Offen ist ein Check auf der Startseite („320-light five-second entry heuristic: search missing“, `.v2-search-prompt` noch nicht gerendert). Die Startseite ist unverändert; lokal besteht derselbe Stand 186/186.
- Live-QA: 33 von 33.
- Strenge Freshness: rot wegen der veralteten Aktien-Tagesreihen vom 18.09. Die Reparatur läuft in PR #182.

**Realtime:** Der Nachweis lief vor der US-Eröffnung (Sitzung „Vorbörse“). Die Tracker zeigen korrekt „Letzter Handelsstand“; „Live“ erschien nirgends. Die Live-Übergänge nutzen `LiveHub.live`, denselben Pfad wie die Aktienseite. Ein Nachweis bei offener Börse folgt mit der Tracker-Messung bei geöffnetem US-Markt.

## 8. Zielzustände

| Ziel | Zustand |
|---|---|
| MARKET_DETAIL_ROUTES | PASS (`#/maerkte/<SYMBOL>`, Deep Link, Reload, Zurück) |
| ONE_DETAIL_SYSTEM | PASS (eine Datei, asset-aware) |
| CHART_RANGE_TRUTH | PASS (Zeiträume nur aus `history.intervals` bzw. echtem Intraday) |
| TRACKER_TRUTH | PASS (ETF, isProxy, keine Punkte, Offenlegung, Tracker-Performance) |
| CRYPTO_24_7 / METALS / ENERGY / YIELDS / RATES / FX Detail | PASS |
| CURRENCY_CORE_REUSED | PASS (keine lokale FX-Arithmetik, Guard an der Grundlinie) |
| REALTIME_REUSED | PASS (LiveHub/VU-Live-Worker, kein zweiter WebSocket; kein falsches LIVE) |
| MARKT_JETZT | PASS (deterministisch, aktuell, 3–5 Einträge) |
| MARKET_PULSE (TREND, MOMENTUM, RISK, CROSS_ASSET) | AVAILABLE |
| BREADTH | AVAILABLE, derzeit NOT_CURRENT (Daten vom 18.09.) |
| MARKET_MOVERS | PASS (Kursbewegung; Volumen nicht verfügbar) |
| SECTOR_PULSE | NOT_IMPLEMENTED (Datenqualität) |
| QUANT_MARKET_REGIME | unberührt, FAIL_CLOSED |
| MACRO_REGIME | NOT_CERTIFIED |
| NO_BLACK_BOX_SCORE | PASS |
| DISCOVER_PROVIDER_LOGIC | 0 |
| QUANT_ISOLATION | PASS (kein Quant Score, keine Factor DNA, keine Backtests, kein Regime berührt) |
| ZERO_COST_MODE | PASS |
| NEW_PARALLEL_DATA_ARCHITECTURES / NEW_DATA_PIPELINES / NEW_PROVIDERS | 0 |
| MOBILE / A11Y QA | PASS (320/390/1440, hell/dunkel, Chromium + WebKit, axe) |

## 9. Methodik-Nachweis (Ergänzung, Punkt 20)

| Frage | Antwort | Wo |
|---|---|---|
| Verwendete Dimensionen | TREND, BREADTH, MOMENTUM, RISK, CROSS_ASSET | §3.1 |
| Rohsignale je Dimension | SMA50/200-Lage, Breiten-Anteile mit Nenner, 1/3/6-Monats-Mediane, 20-Tage-Volatilität und 52W-Abstand, Monatsbewegung relativ zur eigenen Historie | §3.1, `market-pulse.json` Evidenz |
| Schwellen | Mehrheit 3/4 und 50 % (definitorisch), p75/p90 der Volatilität (kalibriert), −10/−20 % (Konvention), 1-fach typische Bewegung | `quant/config/market-pulse.json` |
| Gewichtungen | keine – es gibt keinen Score | §3.2 |
| Historische Kalibrierung | 1 273 Zeitpunkte 2001–2026; 12 von 12 Phasen plausibel | `market-pulse-calibration.json` |
| Factor Overlap | TREND/MOMENTUM, TREND/RISK, BREADTH/TREND dokumentiert und behandelt | §3.4 |
| Gegenproben | Grenzfälle und Determinismus, keine Kausalitätswörter, veraltete Daten führen zu NOT_CURRENT, keine Beobachtung älter als drei Tage in „Markt jetzt“ | `quant/tests/multi-asset-market-pulse.test.mjs` |
| Consumer-Texte | feste Textregeln für Schlagzeile, Zustände und Beobachtungen | Engine |
| Deterministisch / nur erklärend | Zustände und Texte deterministisch; `explanation` und „Warum ist das wichtig?“ nur erklärend | §3.5 |
| Bewusst nicht zertifiziert | MACRO_REGIME, Quant Market Regime, Sector Pulse, Breadth-Kalibrierung | §3.6 |

## 10. Offene Punkte

1. **Aktien-Tagesreihen (Stand 18.09.):** Sobald der Refresh aus PR #182 wieder läuft, wird BREADTH automatisch aktuell. Dafür ist keine Änderung hier nötig.
2. **Browser-QA Discover:** ein Startseiten-Check bei 320 px, außerhalb dieses Auftrags. Die Wiederholung zur Bestätigung ist angestoßen.
3. **Realtime-Nachweis bei offener US-Börse:** Tracker-Messung (WebSocket, Stufe 6) und Blick auf „Markt geöffnet · Live“ im Detail.
4. **Sektoren:** Sie brauchen einen belastbaren Sektor-Vertrag (GICS-ähnlich, breite Abdeckung). Das ist eine Owner-Entscheidung zu einer Datenquelle.
5. **Movers mit Volumenspitzen:** Der Intraday-Pfad trägt kein Volumen.
