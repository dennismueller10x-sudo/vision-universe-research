# VU INVESTMENT INTELLIGENCE — IMPLEMENTATION REPORT

Vision Universe® Investment Intelligence Foundation V1
Branch `claude/vision-universe-v1-build-uyp8qp`

---

## 1. Implemented — was gebaut wurde

Ein vollstaendiger Investment-Intelligence-Bereich, der den Pfad
**Idee → Regeln → Kandidaten → Faktorprofil → historischer Test → Evidenz → Ueberwachung**
durchgaengig abbildet. Alles laeuft auf synthetischen Daten, ohne API-Key, ohne Netzwerk
und ohne Vertrag.

### Engines (`quant/engines/`, ~6.700 Zeilen)

| Datei | Inhalt |
|---|---|
| `schema.js` | Kanonisches Financial Data Model, 26 Entitaeten, Laufzeitvalidatoren, bitemporaler Point-in-Time-Zugriff |
| `catalog.js` | Financial Ontology: 52 Felder mit Einheit, Richtung, Kategorie und VUQL-Token |
| `provider.js` | 7 Provider-Interfaces, Registry mit Vertragspruefung, Vendor-Leakage-Guard |
| `mock-generator.js` | 511 synthetische Securities, deterministisch aus einem Seed |
| `mock-provider.js` | Adapter fuer alle sieben Interfaces |
| `normalization.js` | Winsorization, Perzentile, robuste Z-Scores, Peer-Normalisierung mit Fallback-Kette |
| `factors.js` | Quality, Momentum, Value, Growth, Risk aus Kursen und PIT-Fundamentaldaten |
| `quant-score.js` | Composite, Coverage, Konfidenz, Faktorbeitraege, Universums-Perzentil |
| `radar.js` | Score-Historie, Velocity, Acceleration, Intelligence Events, 7 Radar-Module |
| `query.js` | Versionierter Query-AST, Schema- und Semantikvalidierung, Screener-Engine |
| `vuql.js` | Parser und Serializer der lesbaren Abfragedarstellung |
| `strategy.js` | Strategy Schema, Validierung, unveraenderliche Versionierung, Lineage, Diff |
| `backtest.js` | Point-in-Time-Backtest-Engine, Portfoliokonstruktion, Kennzahlen, Current Holdings |
| `trust-score.js` | Evidenzbasierte Bewertung der methodischen Guete mit harten Obergrenzen |
| `ai-provider.js` | AIProvider-Interface + deterministischer MockAIProvider |
| `ai-tools.js` | Tool Registry mit 15 Werkzeugen und der Sicherheitsgrenze |
| `methodology.js`, `hash.js` | Zentrale Methodik-Registry, deterministischer Hash und PRNG |

### Produktseiten (10)

Quant Home · VU Quant Ranking · Screener mit VUQL-Editor · Quant Radar ·
Stock Quant Detail · Strategie-Bibliothek · Strategy Lab · Backtest-Ergebnis ·
Watchlist Intelligence · Ask Vision Universe

### Weitere Bausteine

- `quant/methodology/*.json` — alle Gewichte, Schwellen und Strategien zentral versioniert
- `quant/api/client.js` — die v1-API-Contracts als Funktionsschicht
- `quant/ui/*` — Designsystem, Shell, gemeinsames Chartmodul, Komponenten, Backtest-Worker
- `scripts/quant/build-quant-data.mjs` — Praekomputation (~6 s)
- `scripts/quant/verify-quant-data.mjs` — Konsistenzpruefung Daten ↔ Engines
- `.github/workflows/quant-ci.yml` — Tests, JSON-Validitaet, Seitenstruktur, Datenkonsistenz
- 13 Dokumente unter `docs/`, 4 Provider-Vorbereitungen unter `providers/`

Am bestehenden Repository geaendert: **zwei Zeilen** — ein Menuepunkt in
`assets/site-navigation.js` und eine Positionierungsregel in
`assets/site-navigation.css`. Kein bestehender Produktbereich wurde angefasst.

---

## 2. Architecture — wie das System funktioniert

### Das Leitprinzip

> **AI ist nicht die Wahrheitsschicht.**

Die Wahrheitsschicht ist Financial Data Core + Quant Engine + Strategy Engine +
Backtest Engine. Die AI uebersetzt Sprache in Struktur, ruft registrierte Werkzeuge auf
und erklaert deren Ergebnisse. Sie berechnet keine einzige Kennzahl.

### Vier Entscheidungen, die das System tragen

**1. Ein kanonisches Datenmodell, kein Vendor-Modell.**
Vendor-Felder existieren ausschliesslich in Provider-Adaptern. Der Schema-Validator lehnt
unbekannte Felder ab; ein Acceptance-Test scannt Product Layer und UI auf
Vendor-Feldzugriffe. Der Wechsel des Datenanbieters beruehrt genau eine Datei.

**2. Point-in-Time ohne Ausweg.**
`availableAt <= decisionTime` ist die einzige Zugriffsregel auf Fundamentaldaten. Es gibt
keinen Parameter, der sie abschaltet — der einzige Effekt waere Look-Ahead Bias. Faktoren,
Scores und Filter laufen im Backtest ueber **dieselben Funktionen** wie die heutige
Anzeige; ein zweiter Pfad koennte versehentlich mehr sehen.

**3. Eine Filterlogik, eine Strategy Engine.**
Screener-UI, VUQL-Editor, AI-Tool und Backtest erzeugen denselben typisierten AST und
rufen dieselbe `Query.execute()` auf. Der manuelle Strategy Builder und die AI erzeugen
dasselbe `StrategyDefinition`-Objekt und benutzen denselben Validator. Zwei
Implementierungen waeren der sicherste Weg, dass Screener-Ergebnis und Backtest-Universum
auseinanderlaufen.

**4. Fehlende Daten sind fehlend.**
Ein fehlender Wert bekommt kein Ersatzperzentil, keine neutrale 50 und keine 0. Er senkt
die Coverage; unterhalb der Mindestabdeckung gibt es den Status `INCOMPLETE` mit
Begruendung statt eines kuenstlich praezisen Scores. Nicht lizenzierte Datenklassen
(Estimates, Macro, News) kommen als `unavailable` **mit Begruendung** zurueck und sind in
der Oberflaeche sichtbar.

### Kette einer Zahl

```
Mock-Generator (Seed)
   -> MockProvider           kanonische Objekte + Provenance
   -> factors.js             Rohkennzahlen, PIT-gefiltert
   -> normalization.js       Winsorization, Peer-Perzentile
   -> quant-score.js         Faktorscores -> Composite -> Universums-Perzentil
   -> build-quant-data.mjs   praekomputiert nach quant/data/**
   -> api/client.js          v1-Contract
   -> Seite                  mit asOf, Coverage, Methodikversion, Provenance
```

Jeder Schritt ist einzeln getestet, und `verify-quant-data.mjs` prueft in der CI, dass die
ausgelieferten Dateien noch zur Engine passen.

### Zwei Modellkorrekturen, die beim Testen entstanden sind

Beide betreffen den Mock-Generator und waren keine Kosmetik:

**Der Kurs braucht einen Fundamentalanker.** Ein reiner Random Walk hatte Kurs und
Ertragslage nach 20 Jahren vollstaendig entkoppelt — ein Titel handelte bei einem KGV von
0,5 und wies eine Dividendenrendite von 34.000 % aus. Die Value- und Quality-Faktoren
haetten dann nicht Bewertung gemessen, sondern kumuliertes Rauschen. Seither gilt
`Kurs = Ertragsanker × Bewertungsmultiplikator`.

**Das Modell braucht Momentum.** Eine reine Mean Reversion ist strukturell
*anti*-Momentum: genau die Titel, die zuletzt gestiegen sind, verlieren wieder. Eine
Momentum-Strategie haette darin nie funktionieren koennen — der Backtest haette nicht die
Strategie getestet, sondern eine Eigenschaft des Generators. Die Rueckkopplung aus der
12-1-Monats-Rendite bildet den dokumentierten Befund nach; das oberste Momentum-Quintil
liegt jetzt rund 12 Prozentpunkte vor dem untersten.

---

## 3. Testing — was geprueft ist

**134 Tests, alle gruen** (`node --test "quant/tests/*.test.mjs"`, ~34 s).

| Datei | Tests | Schwerpunkt |
|---|---:|---|
| `acceptance.test.mjs` | 22 | die kritischen Acceptance-Kriterien aus Abschnitt 76 |
| `backtest.test.mjs` | 22 | PIT-Semantik, Ausfuehrungszeitpunkt, Kosten, Grenzen, Reproduzierbarkeit, Trust Score |
| `strategy.test.mjs` | 22 | Query-AST, VUQL, Strategy Schema, Versionierung, Lineage |
| `ai.test.mjs` | 22 | Provider-Interface, Intent-Parsing, Sicherheitsgrenze, Halluzinationskontrolle |
| `provider.test.mjs` | 21 | Determinismus, Schema-Validitaet, Provenance, alle 11 Fixtures |
| `quant.test.mjs` | 25 | Normalisierung, Faktoren, Score-Zerlegung, Coverage, Radar |

### Die 22 Acceptance-Kriterien

| # | Kriterium | Status |
|---:|---|---|
| 1 | Frontend enthaelt keine vendor-spezifischen Felder | ✓ |
| 2 | Anwendung laeuft vollstaendig mit MockProvider | ✓ |
| 3 | Kein API-Key erforderlich | ✓ |
| 4 | Jede Finanzkennzahl fuehrt `asOf` mit | ✓ |
| 5 | Jeder Score fuehrt `methodologyVersion` mit | ✓ |
| 6 | Jeder Score fuehrt Coverage mit | ✓ |
| 7 | Faktorbeitraege reproduzieren den Composite | ✓ |
| 8 | Historische Faktoren als Snapshots | ✓ |
| 9 | Backtest sieht keine zukuenftigen Fundamentaldaten | ✓ |
| 10 | Delistetes Unternehmen bleibt im historischen Universum | ✓ |
| 11 | Korrektur wirkt nicht rueckwaerts | ✓ |
| 12 | Signal vom Schlusskurs handelt nicht vor T+1 | ✓ |
| 13 | Transaktionskosten wirken auf die Rendite | ✓ |
| 14 | Jeder Backtest erhaelt einen Reproduktionshash | ✓ |
| 15 | Ungueltiges Strategy Schema wird abgelehnt | ✓ |
| 16 | Ungueltiges VUQL wird abgelehnt | ✓ |
| 17 | AI kann kein SQL ausfuehren | ✓ |
| 18 | AI kann nur registrierte Werkzeuge nutzen | ✓ |
| 19 | AI-erzeugte Strategie wird vor Ausfuehrung validiert | ✓ |
| 20 | Strategieaenderung erzeugt eine neue Version | ✓ |
| 21 | Datenherkunft ist einsehbar | ✓ |
| 22 | Fehlende Provider-Daten werden ausgewiesen, nicht erfunden | ✓ |

Zusaetzlich: regulatorische Sprache (§81), Mock-Kennzeichnung (§94), zentrale Methodik (§72).

### Im Browser geprueft

Alle 10 Seiten in Chromium: keine Konsolenfehler, kein horizontaler Seitenueberlauf,
funktionierende Leer- und Fehlerzustaende.

Die vollstaendige User Journey aus Abschnitt 96 laeuft end-to-end durch:
Quant Home → Upgrade → Stock Detail → Factor DNA → Screener → VUQL → Strategy Lab →
Backtest (18 s) → CAGR 15,5 % / MaxDD −43,2 % / Trust 74 → 25 aktuelle Modellpositionen →
AI-Anfrage → strukturierte Abfrage → Ergebnis.

Der zweite AI-Flow aus Abschnitt 97 ebenfalls: Strategie beschreiben → Interpretation
bestaetigen → „Der Drawdown ist mir zu hoch“ → begruendete neue Version.

### Verhalten der Edge-Case-Fixtures

| Fixture | Quant | Quality | Momentum | Value | Growth | Risk |
|---|---:|---:|---:|---:|---:|---:|
| MOCK_HIGH_QUALITY | 98,5 | **94,5** | 88,6 | 17,8 | 58,7 | 81,0 |
| MOCK_HIGH_MOMENTUM | 71,9 | 38,6 | **89,6** | 11,8 | 76,9 | 67,5 |
| MOCK_HIGH_GROWTH | 65,1 | 35,5 | 84,2 | 19,9 | **82,4** | 11,5 |
| MOCK_DEEP_VALUE | 80,4 | 36,9 | 82,6 | **89,3** | 48,3 | 62,8 |
| MOCK_VALUE_TRAP | **0,2** | 5,4 | 1,8 | 27,6 | 3,6 | 16,8 |
| MOCK_LOW_VOL | 76,5 | 77,2 | 63,7 | 50,8 | 30,2 | **93,8** |
| MOCK_MISSING_DATA | **INCOMPLETE** | – | 68,5 | – | 32,7 | 69,1 |

Jede Fixture verhaelt sich wie konstruiert. Die Value Trap ist bei einem Value-Score von
27,6 der zweitschlechteste Titel des Universums — genau das soll ein Screener leisten:
optisch guenstig ist nicht guenstig.

---

## 4. Limitations — was fehlt

### Fachlich

- **Analyst Revisions** sind im Schema vorgesehen, aber ohne Daten. Der Faktor ist als
  `available: false` markiert; sein im Research vorgesehenes Gewicht wird nicht mit
  erfundenen Konsensdaten gefuellt, sondern auf Quality, Momentum und Growth verteilt.
- **Deflated Sharpe Ratio und Probability of Backtest Overfitting** sind nicht
  implementiert. Der Trust Score vergibt fuer diesen Block null Punkte, statt die Luecke
  zu ueberspringen — kein Lauf erreicht in V1 100 Punkte.
- **Ein Universum** (`US_EQUITIES`), eine Waehrung, keine Makro-, News- oder
  Ownership-Daten.
- **Kein Market Regime**, keine Similarity Engine, keine Portfolio-Intelligence.
- Backtest: long only, keine Steuern, kein Intraday, kein Market Impact ueber die
  Slippage hinaus.

### Technisch

- **Alle Daten sind synthetisch.** Die Ergebnisse belegen die Funktionsweise der Engine,
  nicht die historische Tragfaehigkeit einer Strategie an realen Maerkten. Jede Seite
  weist das aus.
- **Kein Nutzerkonto.** Strategien, Backtests und Watchlist liegen im `localStorage` des
  Browsers.
- **Backtest-Laufzeit**: 20 Jahre monatlich ≈ 19 s (rund 250 vollstaendige Faktor-Panels).
  Der Web Worker haelt die Oberflaeche bedienbar, beschleunigt die Rechnung aber nicht.
  10 Jahre quartalsweise laufen in ~3 s.
- **Charts** sind ein eigenes SVG-Modul statt einer Library. Begruendung in
  `VU_ARCHITECTURE.md`; der Austausch bleibt auf `quant/ui/charts.js` begrenzt.
- Der Mock-Datensatz kennt keine Feiertage und keinen echten Intraday-Verlauf.

### Regulatorisch — offen und ausserhalb dieses Builds

Vor einer Veroeffentlichung mit echten Daten ist eine Pruefung durch spezialisierte
deutsche Finanzaufsichtsrechtler notwendig: MiFID II, WpIG, WpHG (Abgrenzung
Anlageberatung), MAR (Anlageempfehlungen), EU AI Act, Verbraucherschutz,
Marketingaussagen, Datenlizenzen, DSGVO.

Die Produktlogik ist bereits auf Research- und Analysecharakter ausgelegt — analytische
Sprache statt Kauf-/Verkaufsvokabular, ein Test prueft das —, aber ein Disclaimer macht
aus einer persoenlichen Empfehlung keine Nicht-Beratung.

---

## 5. API Readiness — welcher Provider als Naechstes

Die Provider-Abstraktion ist vollstaendig. Ein Adapter implementiert die Interfaces, wird
per `registry.registerAll()` angemeldet, und die bestehenden Tests laufen unveraendert
weiter — sie pruefen Verhalten gegen das kanonische Modell, nicht gegen den Mock.

| Interface | Status | Naechster Kandidat |
|---|---|---|
| `ReferenceDataProvider` | Mock vollstaendig | Twelve Data / EODHD / Intrinio |
| `MarketDataProvider` | Mock vollstaendig | Twelve Data |
| `CorporateActionsProvider` | Mock vollstaendig | Twelve Data / Intrinio |
| `FundamentalDataProvider` | Mock vollstaendig, bitemporal | **Intrinio** (nach Audit) |
| `EstimateDataProvider` | bewusst leer | spaeter, Enterprise-Feed |
| `MacroDataProvider` | bewusst leer | FRED / EZB |
| `NewsDataProvider` | bewusst leer | spaeter |

`providers/twelve-data/`, `providers/intrinio/` und `providers/eodhd/` enthalten je eine
README mit Zweck, Datenklassen, ENV-Variablen, Mapping-Strategie und den offenen
Lizenz- und PIT-Pruefpunkten als Checkliste. Bewusst **ohne Preisangaben** — Preise
aendern sich und gehoeren in ein datiertes Vertragsdokument.

---

## 6. Next Recommended Step

### Zuerst: Market Data (Twelve Data oder EODHD)

Der risikoaermste erste Schritt. Kurse, Referenzdaten und Corporate Actions ersetzen den
Mock in `MarketDataProvider`, `ReferenceDataProvider` und `CorporateActionsProvider`. Die
Momentum- und Risk-Faktoren rechnen dann auf echten Kursen, waehrend Fundamentaldaten
weiter aus dem Mock kommen. Der Bereich bleibt sichtbar als Demo gekennzeichnet.

**Warum zuerst:** Marktdaten sind gut verfuegbar, lizenzrechtlich ueberschaubarer als
historische Fundamentaldaten, und der Schritt validiert die Adapter-Architektur an einem
Fall, bei dem ein Fehler nicht die Backtest-Integritaet gefaehrdet.

### Danach: US Point-in-Time Fundamentals (Intrinio, nach Audit)

Der eigentlich entscheidende Schritt — von ihm haengt die Belastbarkeit jedes Backtests
ab. **Vor Vertragsabschluss** sind die drei Mock-Faelle mit echten Daten nachzubauen:

1. `MOCK_RESTATEMENT` — eine Korrektur darf nicht rueckwaerts wirken
2. `MOCK_DELISTED` — delistete Titel bleiben im historischen Universum
3. `MOCK_FUTURE_DATA_LEAK` — kein Datensatz vor seinem Verfuegbarkeitszeitpunkt

Besteht ein Anbieter diese drei Tests nicht, ist er fuer historische Backtests
ungeeignet, unabhaengig von seiner sonstigen Datenbreite.

### Parallel, nicht danach: die Data Rights Matrix

Ein API-Key ist keine Erlaubnis zur Anzeige. Besonders **Derived Data** ist zu klaeren:
der VU Quant Score kann ein eigener Daten-Moat werden — aber nur, wenn Berechnung,
Speicherung und kommerzielle Darstellung abgeleiteter Kennzahlen vertraglich
ausdruecklich erlaubt sind. Die vollstaendige Checkliste steht in
`docs/VU_API_INTEGRATION_GUIDE.md`.

### Was nicht als Naechstes kommen sollte

Weitere Features. Das System hat bereits Quant Core, Screener, VUQL, Strategy Engine,
Backtest Engine, Trust Score, AI-Schicht und Watchlist Intelligence. Was ihm fehlt, sind
echte Daten — und der Wert jedes weiteren Features haengt an ihrer Qualitaet, nicht an
ihrer Anzahl.
