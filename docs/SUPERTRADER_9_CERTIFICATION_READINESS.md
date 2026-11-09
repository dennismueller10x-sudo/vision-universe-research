# Supertrader 9 – technische Zertifizierungsübersicht der 13 buchgetreuen Methoden (C01–C13)

Stand: 30.10.2026. `main` @ `533f788fca`. Die Arbeit lief nur lesend: keine Änderung im Repository, keine GitHub-Schreibzugriffe, keine Datenabrufe.

**Was diese Übersicht ist.** Eine Bestandsaufnahme der Belege, die im Repository liegen. Sie schlägt keine Parameteränderung vor, bewertet keine Kennzahlen (die liegen versiegelt beim Owner) und wertet keine Methode ohne vollständige Prüfung auf. Was nicht belegt ist, steht als **nicht belegt** da.

**Status für alle 13 Methoden** (`supertrader/data/sf-candidates/summary.json`, `status`):
- `liveReadiness: LIVE_NOT_APPROVED`
- `certification: DIAGNOSTIC_NOT_CERTIFIED`
- `validatedTradeSignal: LOCKED_FOR_ALL_13`
- `orders: NONE`

Zertifizierungskandidaten nach `STRATEGY-SF6-READINESS.json`: `certificationCandidates: []`.

---

## 0. Grundlagen und Messrahmen

### 0.1 Zertifizierungskriterien CC-1 bis CC-8 (Kriterien `sf6-readiness-criteria-1.2.0`)

Quelle: `scripts/supertrader/source-faithful/completion/sf6-readiness-criteria.mjs`, Zeilen 50–57.

| ID | Prüfung (Kurzfassung) |
|---|---|
| CC-1-SOURCE | Keine essenzielle Regel der Referenz ist SOURCE_BLOCKED oder SOURCE_AMBIGUOUS. Keine Referenzregel stützt sich nur auf eine Sekundärquelle. Der Quellwortlaut liegt vor, nicht nur eine Übersetzung. |
| CC-2-LIFECYCLE | Alle 9 Phasen laufen in der Referenz. Eine Phase, die nur eine SF6-Modellvariante schließt, zählt nicht. |
| CC-3-NO-MANUAL | Keine essenzielle manuelle Quellenentscheidung ist durch eine Modellannahme ersetzt. |
| CC-4-DATA | Keine essenzielle Regel ist DATA_BLOCKED. Proxys entsperren nichts; die SIC-Korrelationsgruppen bleiben ein Proxy (E4). |
| CC-5-CORPORATE-ACTIONS | V4-D1 ist für die Referenz RESOLVED: Jede markierte Sitzung ist durch einen CA-Beleg verifiziert und die Referenz neu gerechnet. Die Quarantäne erfüllt CC-5 nie (E1). |
| CC-6-REPRODUCIBLE | Die Referenz lief auf dem eingefrorenen Snapshot mit research-v1, abgestimmt, deterministisch, auf aktuellem Code. |
| CC-7-EXECUTION | Einstieg und Stop sind PIT ausführbar, es gibt keinen hypothetischen Short ohne Borrow-Daten, und die Kostensensitivität ist gemessen. |
| CC-8-OOS | Nur Belege aus SF6-PAPER-2027 zählen. 2008–2015 und 2016–2026 fallen durch. |

### 0.2 Gemeinsame Datengrundlage der historischen Referenzen

| Punkt | Beleg |
|---|---|
| DEV-Snapshot | `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Warm-up ab 2015-01-01, Fenster 2016-01-04 bis 2026-09-30 (`scripts/supertrader/validation/lib.mjs:13`). Umfang: 15.565 Listings (8.266 aktiv, 7.299 inaktiv), 9.211 Segmente, 14,5 Mio. Bars, 3.339 Split- und 96.443 Dividendenereignisse (`docs/SUPERTRADER_DURABLE_RESEARCH_SNAPSHOTS.md:128f.`). |
| HOLDOUT-Snapshot | `sts1-85959e4bab0681baa6ed221bee94821e`, 2008-01-02 bis 2015-12-31, Warm-up ab 2007 (`lib.mjs:14`). Er war schon in R14 geöffnet und ist survivorship-belastet: nur 813 von 6.427 Listings sind inaktiv (`docs/SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md` §1). |
| Universum | `VU_TOURNAMENT_UNIVERSE_705`: Rohkurs ≥ 5 $ und 20-Sitzungen-Dollarumsatz ≥ 1 Mio. $ am Vortag, vorregistriert (`common/series.mjs:97`). Das ist eine Messkonvention, keine Quellenregel. |
| Intervall | Tagesbalken (Tiingo EOD, split-adjustiert über `quant/engines/return-series.js#splitFactors`, ADR-002). Weinstein aggregiert die Tagesbalken zu Wochen. EP/PS nutzen zusätzlich private IEX-Minuten ab 2017. |
| Abrechnung | research-v1 (`scripts/supertrader/validation/accounting-contract.mjs`). Referenzkosten: 10 bps Slippage und 1 bp Kommission. Kostenstufen COST-0 / REF / COST-20 (20+2) / COST-50 (50+5), siehe `research/run-sf6-validation.mjs:43–50`. |
| Ausführung (Referenz) | Tagesbalken, PIT-Einstieg (nächste Eröffnung oder ruhender Buy-Stop), pessimistische Intrabar-Reihenfolge, Stop-Gap zur Eröffnung (`min(Open, Stop)`), siehe `docs/SUPERTRADER_7_EXECUTION_VALIDATION.md` §2. Die unabhängige Nachrechnung fand 0 Verstöße in 59 Läufen. Die PIT-Verfälschungsprobe ist für alle 7 sf5-Referenzen identisch. |
| Reproduzierbarkeit | REF ledger-hash-identisch mit den maßgeblichen Läufen aus 2.0–5.0. Turtle veröffentlicht keinen Trade-Hash. |

### 0.3 Produktstufe SF8 (Tageslauf, nicht der historische Test)

- Der Produktlauf (`scripts/supertrader/source-faithful/product/*`) nutzt die Research-Engines auf den aktuellen Tagesbalken (`quant/data/product/technical-signals-v1`) mit einem Fenster von 270 Sitzungen (`docs/SUPERTRADER_8_PRODUCT_INTEGRATION.md:70`).
- Stand `asOf 2026-10-28`: 3.225 Kandidaten (2.091 CHART_CANDIDATE, 1.078 CONFIRMED_RESEARCH_SETUP, 56 MODELED_TRADE_PLAN, 0 VALIDATED_TRADE_SIGNAL).
- Datenqualität: 5.099 Titel. PASS 2.960, CAP 2.018, FAIL 121 (SESSIONS 104, FRESHNESS 10, PRICE_PARITY 10, IDENTITY_ACTIVE 7).
- Die Stufen sagen nichts über eine Zertifizierung. Sie zeigen nur, wie weit eine Methode im Tagesprodukt mechanisch reicht.

### 0.4 Corporate Actions: V4-D1, die 83 Quarantänesitzungen, DQ-PX-4

**Markierung** (`docs/SUPERTRADER_6_V4D1_CONTAINMENT.md`):
- DQ-K5 markiert Tagesrelative ≥ 5 bzw. ≤ 1/5; DQ-K3 dient als Sensitivität mit k = 3.
- Nicht erklärte 2:1-Splits erfasst keine der beiden Schwellen. Die Eingrenzung ist deshalb konstruktionsbedingt unvollständig (CC5-e).
- Zensus DEV: 1.210 DQ-K5-Sitzungen bei 454 Titeln, davon 109 im Research-Universum.

**Prüfung der 83 Sitzungen:**
- 83 referenzexponierte DQ-K5-Sitzungen, über alle Referenzen dedupliziert.
- EDGAR-Prüfung mit den Regelsätzen 1.4.0 bis 1.4.3, Exhibits eingeschlossen: 0 von 83 als Split bestätigt. Belegt sind 2 echte Bewegungen (DQ-K3). Das Overlay ist leer (`docs/SUPERTRADER_7_EDGAR_CA_CHECK.md`, `docs/SUPERTRADER_7_EDGAR_EXHIBITS_1_4_2.md`).
- Tiingo-Splits-Endpunkt: HTTP 403, kein Zugang (`docs/SUPERTRADER_7_TIINGO_SPLITS_PROBE.md`).

**CC-5-Teilkriterien** (`docs/SUPERTRADER_7_COMPLETION_MATRIX.md`, Abschnitt CC-5):

| Teilkriterium | Stand |
|---|---|
| a – alle K5-Sitzungen der Referenz verifiziert | nur C04 und C06 (bei beiden 0 Sitzungen exponiert) |
| b – alle K3-Sitzungen verifiziert | nur C06 |
| c – Daten-PR mit Korrektur | entfällt, weil nichts bestätigt ist |
| d – Referenz neu gerechnet | ja, für alle |
| e – Detektor sieht jede Kapitalmaßnahme | für keine Referenz erfüllt, konstruktionsbedingt |
| f – Holdout geprüft | für keine Referenz erfüllt, nicht gerechnet |

**DQ-PX-4** (Tages- und Wochenreihe widersprechen sich):
- Betroffen sind ENLV, NUWE, PARA und SCAG.
- Kandidat ist nur NUWE (C11). C11 liest nur Tagesbalken; die Wochenreihe liest nur C03 für das Allzeithoch (`docs/SUPERTRADER_8_FIRST_RELEASE.md:52–57`).
- Widerspruch: Laut `SUPERTRADER_8_ACTIVATION_READINESS.md:47` ist DQ-PX-4 nach den Reparaturläufen der Wochenreihe 0, laut `FIRST_RELEASE` (29.10.) ist es wieder ein ERROR für 4 Titel. Der neuere Stand gilt.

### 0.5 Survivorship

**Supertrader-Snapshots:**
- Delistete Listings stammen aus Tiingos Tickerliste.
- Delistings vor 2009 sind praktisch nicht auswählbar: 2001–2008 gibt es 1 Listing, 2009–2016 sind es 765 (`docs/SUPERTRADER_VALIDATION_DATA_PATH.md:31`).
- Delisting-Renditen liefert die Quelle nicht (Zeile 32).

**V13-Nachlieferung delisteter Reihen** (`docs/quant-recovery/DATA_QUALITY_V13_FINAL.md`):
- Belegt sind 1.675 Ketten (QUALIFIED). Delistings vor 2009/2010 bleiben eine Lücke.
- Die Reihen liegen nur verschlüsselt bzw. privat vor, über `quant/engines/research-delisted-series.cjs`. Der Produktpfad ist unberührt.
- Dass sie in einen Supertrader-Snapshot eingebunden sind, ist **nicht belegt**. Eine Einbindung wäre eine neue Snapshot-Generation (E7-4) und damit eine Querschnittsänderung in getrennten PRs (Quant und Supertrader).

### 0.6 Out-of-Sample

- **Kein unberührtes historisches Fenster.** 2016–2026 ist DEV, 2008–2015 ist bereits genutzt und verzerrt (`SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md`).
- **SF6-PAPER-2027 1.1.0** (Fingerabdruck `e623b336cd24…`, gepinnt in `scripts/supertrader/tests/sf-sf6-readiness.test.mjs`):
  - Status `PREPARED_NOT_ACTIVE`, kein Workflow.
  - Fenster ab 01.01.2027, Mindestdauer 250 Sitzungen, auswertbar frühestens etwa am 31.12.2027.
  - Es umfasst 11 Referenzen; C09 und C10 sind nicht enthalten.
  - Eine Code- oder Protokolländerung nach dem 01.01.2027 macht das Fenster ungültig.
- **Offen vor der Aktivierung:** die Aufbewahrungsentscheidung für die Snapshot-Generationen (2 von 3 belegt).

### 0.7 Golden Cases (lokal verifiziert am 30.10.2026)

- **Artefakt** `scripts/supertrader/source-faithful/artifacts/STRATEGY-GOLDEN-CASE-RESULTS.json`: 120 Golden Cases, 120 PASS, 0 FAIL in 28 Testdateien (324 Tests, 2 übersprungen).
- **Eigener Lauf** `node --test` über dieselben 28 Dateien: 324 Tests, 323 pass, 0 fail, 1 skipped.
  - Übersprungen ist `SF-PIN-REBUILD`, es braucht `PSR709_DIR`.
  - Abweichung zum Artefakt: 1 statt 2 übersprungen.
- **Zusätzlich gelaufen:** alle `sf-sf6-*`, `sf-sf7-*` und `sf-sf8-*` sowie `sf-product-contract`, `sf-kk-e7-6-sample`, `sf-kk-sf6-sample`, `sf-turtle-n-wilder` und `sf-industry-groups`. Ergebnis: 289 Tests, 289 pass, 0 fail.
- **Einordnung:** Golden Cases sind Verhaltenstests, keine Performance-Stichprobe. Die #709-Fälle sind nicht broker-verifiziert und tragen gedruckte, unadjustierte Preise (Artefakt, Feld `rule`).
- Die Zählung je Methode unten enthält geteilte Fälle mehrfach (Summe 165 > 120). Dazu kommen die SF7-Ausführungs-Golden-Cases `SF7-GC-*` in `sf-sf7-execution-validation.test.mjs`.

### 0.8 Quellen-IDs

- Die Methoden-Quellen-IDs (`W-TUR`, `B06`, `B09`, `B12`, `B07`, `B03`, `W-MIN18`, `W-KK*`, `W-MOKA*`, `W-RAS04`) stammen aus dem PSR-#709-Extrakt `scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json` und dem Register `artifacts/STRATEGY-REGISTRY.json`.
- `W-RAS97` kam später über die Owner-Entscheidung D-RAS97 dazu und steht nicht im #709-Extrakt.
- Der ältere Ledger `scripts/supertrader/source-ledger.json` führt `SRC-*`-IDs. Die Zuordnung unten folgt URL bzw. Titel (eigene Zuordnung).
- Für Morales/Kacher, Raschke, W-MIN18 und B07 gibt es **keinen** Eintrag in `source-ledger.json`.

---

## C01 – Turtle System 1 (`SF_TURTLE_S1`)

**Quellen**
- `W-TUR`: The Original Turtle Trading Rules, 2003, gedruckt S. 7–33, englisch, maßgeblich. Ledger `SRC-TURTLE-PDF` (PUBLIC_FULL) bzw. `SRC-BL-TURTLE`.
- `B02`: Faith, Way of the Turtle, inoffizielle indonesische Übersetzung, sekundär. Den Konflikt 60 vs. 55 Tage entscheidet `W-TUR`. Kein Ledger-Eintrag.

**Regeln in der Quelle vs. Modellannahmen**
- Vertrag 1.2.0: 7 exakt, 13 abgeleitet (0 aus Sekundärquelle), 0 manuell, 2 datenblockiert, 2 mehrdeutig (`STRATEGY-SF6-READINESS.json`).
- Mechanisch: TUR-SF-ENTRY, -S1-FILTER, -FAILSAFE, -CONSISTENT, -MARKETS.
- Mehrdeutig:
  - `TUR-SF-S1-OPEN-BREAKOUT` mit Lesart `MA-TUR-S1-OPEN-BREAKOUT` = SKIP;
  - `TUR-SF-FAILSAFE-EXIT` mit Lesart `MA-TUR-FAILSAFE-EXIT` = 10D.

  Beide Lesarten laufen als Szenarien.
- Datenblockiert: `TUR-SF-LIMIT-CORR` (keine PIT-Korrelationsgruppen; die Mechanik ist umgesetzt) und `TUR-SF-SHORT` (Original).
- Weitere Annahmen: `MA-TUR-INTRABAR-ORDER` (Szenario ENTRY_BAR_OPTIMISTIC), `MA-TUR-HELD-BAR-ORDER`. Aktien statt Futures, nur Long, Units auf Eigenkapital (`STRATEGY-REGISTRY.json`, `knownLimitations`).

**Historische Datenabdeckung**
- Tagesbalken DEV 2016–2026 und HOLDOUT 2008–2015, Universum #705.
- Keine Fundamentaldaten, keine Intraday-Daten, kein Benchmark (`summary.json`, `dataNeeds`: minBars 76).
- PIT-Branchengruppen fehlen für das Korrelationslimit. Eine PIT-SIC-Historie liegt vor (siehe Querschnitt), ist aber nicht freigegeben (E4).

**Corporate Actions**
- DQ-K5: 16 Sitzungen exponiert, 16 ungeklärt. DQ-K3: 41 exponiert, 1 echt, 40 ungeklärt.
- In 6.0-Einheiten sind 15 von 820 Trades direkt exponiert (1,83 %, über der früheren 1-%-Berichtsgrenze). Die Exposition kommt fast nur über den Kanalrückblick; nur 2 Trades wurden über einen Sprung gehalten.
- Trade-Stabilität unter Quarantäne: 128 von 820 Trades unverändert (16 %).

**Survivorship:** Tiingo-Tickerliste mit inaktiven Listings. Der Holdout ist nach oben verzerrt. Delistings vor 2009 fehlen.

**Ausführung und Kosten**
- Eigene Engine (`sf-turtle-1.3.0`, Fingerabdruck `89fbcf86…`).
- Einstieg = max(Open, Trigger), Stop 2N, pessimistische Reihenfolge am Einstiegsbalken.
- SF7-D3 als Lesart `OPTIMISTIC_CERTAIN_RULE` behoben; die Referenz ist hashgleich.
- Kosten 0/10/20/50 bps gemessen (versiegelt). Unter COST-50: 820 → 923 Trades.
- Im Produkt kein modellierter Ablauf: `TURTLE_ENTRY_IS_INTRADAY_ON_ASOF_NOT_MODELLED_FOR_NEXT_SESSION` (`product/detectors.mjs:108`).

**OOS / Holdout:** DEV 820 Trades, HOLDOUT 716 (nicht unberührt). In SF6-PAPER-2027 enthalten (BASE_S0), nicht aktiv.

**Golden Cases:** 30 Fälle, alle PASS (`sf-turtle.test.mjs`, `sf-turtle-completion.test.mjs`). Dazu `SF7-VAL-TURTLE-LEDGER` und `SF7-VAL-TURTLE-PIT-CORRUPTION`.

**CC-Stand:** erfüllt CC-2, CC-3, CC-6, CC-7. Offen CC-1, CC-4, CC-5, CC-8.

**Zertifizierungsblocker und was sie schließen würde**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 | Owner-Entscheidung, welche der zwei mehrdeutigen Lesarten die Referenz ist, belegt aus `W-TUR`. Alternativ der Nachweis, dass die Regeln nicht essenziell sind. Die Wahl darf nicht nach Ergebnis fallen. |
| CC-4 | Eine Owner-freigegebene PIT-Gruppenquelle (E7-5 A, das braucht eine Revision von E4, oder B: GICS-Historie), dann ein Neulauf mit aktiviertem Limit und Vorher/Nachher. |
| CC-5 | Faktortragende CA-Quelle für die 16 K5- und 40 K3-Sitzungen (E7-1), Daten-PR, Snapshot-Generation 3 (E7-4 B), Holdout-Prüfung (CC5-f). CC5-e bleibt nur mit einer Quelle lösbar, die auch Splits unter dem Faktor 3 vollständig liefert. |
| CC-8 | SF6-PAPER-2027 aktiviert, 250 Sitzungen, Prüfungen FORWARD_LOG_EQUALS_BATCH_REPLAY, NO_MISSING_SESSIONS, RESEARCH_V1_RECONCILED und V4D1_FORWARD_CENSUS bestanden. |

## C02 – Turtle System 2 (`SF_TURTLE_S2`)

**Quellen:** wie C01 (`W-TUR` / `SRC-TURTLE-PDF`, `B02`).

**Regeln vs. Annahmen**
- Vertrag 1.2.0: 7 exakt, 12 abgeleitet, 0 manuell, 2 datenblockiert, **0 mehrdeutig**.
- Mechanisch: TUR-SF-ENTRY, -S2-NOSKIP, -CONSISTENT, -MARKETS.
- Datenblockiert: `TUR-SF-LIMIT-CORR`, `TUR-SF-SHORT`.
- Annahmen: `MA-TUR-INTRABAR-ORDER`, `MA-TUR-HELD-BAR-ORDER`, Aktien-Adaption.

**Daten:** wie C01, nur Tagesbalken.

**Corporate Actions**
- DQ-K5: 14 exponiert, 14 ungeklärt. DQ-K3: 38 exponiert, 0 echt, 38 ungeklärt.
- 6.0: 11 von 559 Trades direkt exponiert (1,97 %, der höchste Anteil aller Referenzen), 1 Trade über einen Sprung gehalten.
- Trade-Stabilität unter Quarantäne: 324 von 559 Trades unverändert (58 %).

**Survivorship:** wie C01.

**Ausführung und Kosten:** wie C01. Unter COST-50: 559 → 466 Trades. Im Produkt kein modellierter Ablauf (Intraday-Einstieg).

**OOS:** DEV 559, HOLDOUT 530. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 23, alle PASS (`sf-turtle.test.mjs`, `sf-turtle-completion.test.mjs`).

**CC-Stand:** erfüllt CC-1, CC-2, CC-3, CC-6, CC-7 – die meisten erfüllten Kriterien aller 13. Offen CC-4, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-4 | wie C01 |
| CC-5 | wie C01, 14 K5- und 38 K3-Sitzungen |
| CC-8 | wie C01 |

Statistische Grenze: etwa 52 Trades pro Jahr in DEV. Das ist eine eigene Ableitung aus 559 Trades über etwa 10,7 Jahre. Ein Paper-Fenster von 250 Sitzungen liefert damit nur eine kleine Stichprobe.

## C03 – Darvas-Box (`SF_DARVAS_BOX`)

**Quellen**
- `B06`: How I Made $2,000,000 in the Stock Market, Kensington/Lyle Stuart Reprint, englisch. Die Box-Regeln stehen im Q&A, S. 182–198.
- Ledger `SRC-ND-BOOK` mit `evidence_status_ceiling: DISPUTED`. Kontext: `SRC-ND-TIME-1959`, `SRC-ND-TIME-1960`, `SRC-ND-TIME-1960B`, `SRC-ND-NYCOA-1961`.

**Regeln vs. Annahmen**
- Vertrag 1.3.1: 3 exakt, 10 abgeleitet, 6 manuell, 0 datenblockiert, 1 mehrdeutig.
- Mechanisch: DAR-SF-TOP, -BOTTOM, -TOP-EXCEEDED, -BOX-FAIL, -NO-WAIT, -ENTRY, -ATH.
- Ermessen: DAR-SF-SELECTION, -VOLUME, -MARKET, -SIZING.
- Mehrdeutig: `DAR-SF-BOTTOM-START`, Lesart `MA-DAR-BOTTOM-START` = AFTER_TOP_DAY.
- 8 essenzielle manuelle Entscheidungen sind durch Annahmen ersetzt: `MA-DAR-MANUAL-SUBSTITUTE`, `MA-DAR-SIZING` (Gewicht 0,10), `MA-DAR-FRACTION`, `MA-DAR-REENTRY`, `MA-DAR-ORDER-VALIDITY`, `MA-DAR-INTRABAR-ORDER`, `MA-DAR-RESEARCH-UNIVERSE`, `MA-DAR-ATH-AVAILABLE-HISTORY`.
- Abdeckungsvariante `DA6-DAR-ATH-VERIFIED-LISTING`.

**Daten**
- Tagesbalken. Das Allzeithoch ist nur in der verfügbaren Historie prüfbar, weil der Snapshot 2015 beginnt (Flag `ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED`).
- Im Produkt gilt das ATH nur als erfüllt, wenn der Listing-Beginn im 270-Sitzungen-Fenster liegt (O-7). Lange Tageshochs gibt es nur für 5 Titel (`SUPERTRADER_8_PRODUCT_INTEGRATION.md:304`).
- Die Wochenreihe (DQ-PX-4) ist nur ein Gegenbeleg.

**Corporate Actions**
- DQ-K5: 15 exponiert, 15 ungeklärt. DQ-K3: 30 exponiert, 0 echt, 30 ungeklärt.
- 6.0: 20 von 19.556 Trades direkt exponiert (0,10 %). Trade-Stabilität unter Quarantäne 92 %.

**Survivorship:** wie oben. Die ATH-Variante ist zu jungen Listings verzerrt.

**Ausführung und Kosten**
- Buy-Stop in der nächsten Sitzung, Box-Stop.
- Die Referenz misst die pessimistische Intrabar-Annahme (D-DARVAS-SIZE-INTRABAR).
- SF7-D1: 8.596 von 17.002 Stops am Einstiegstag sind sicher. Das ist nur als Variante umgesetzt.
- **Sehr kostensensitiv:** unter COST-50 sinken die Trades von 19.556 auf 7.343.

**OOS:** DEV 19.556, HOLDOUT 11.869. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 18, alle PASS (`sf-darvas.test.mjs`, `sf-darvas-completion.test.mjs`, `sf-runner.test.mjs`). Dazu `SF7-GC-DARVAS`.

**CC-Stand**
- Messklasse MECHANICAL_COMPONENT_STUDY, nicht die volle Methode.
- Erfüllt CC-2, CC-4, CC-6, CC-7. Offen CC-1, CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 | Eine belegte Lesart des Tiefsuch-Beginns aus B06 (Owner-Entscheidung mit Quellenstelle). |
| CC-3 | Die 8 manuellen Entscheidungen (Auswahl, Volumen, Markt, Größe …) fallen weg oder sind als Quellenregel belegt. Die Quelle verlangt sie ausdrücklich als Ermessen; damit ist CC-3 strukturell kaum erreichbar. |
| CC-5 | wie C01 |
| CC-8 | wie C01 |
| Datenlücke ATH | Tageshochs vor 2015 je Listing (`LISTING_TO_DATE_HISTORY`, `SUPERTRADER_2_DATA_GAPS.md`). |

## C04 – Weinstein Investor (`SF_WEINSTEIN_INVESTOR`)

**Quellen**
- `B09`: Secrets for Profiting in Bull and Bear Markets, 1988, englisch. Ledger `SRC-SW-BOOK` (BIBLIOGRAPHIC_ONLY).
- Daneben `SRC-SW-BULKOWSKI` (sekundär) und `SRC-SW-TRADERLION-INT`.

**Regeln vs. Annahmen**
- Vertrag 1.2.0: 1 exakt, 5 abgeleitet, 9 manuell, 2 datenblockiert, 0 mehrdeutig.
- Mechanisch: WEIN-SF-MA-GATE, -ORDER, -INV-BREAKOUT.
- 14 essenzielle manuelle Entscheidungen, u. a. Stage, Volumen, RS, Overhead. Annahmen: `MA-WEIN-MANUAL-SUBSTITUTE`, `MA-WEIN-INITIAL-STOP`, `MA-WEIN-TRAIL`, `MA-WEIN-SIZING`, `MA-WEIN-WEEK-END`, `MA-WEIN-ORDER-WEEK`, `MA-WEIN-VOL5-STRENGTH`, `MA-WEIN-GROUP-PROXY` (SIC3, nur Research), `MA-WEIN-DATA-EXCEPTION`.
- Datenblockiert: `WEIN-SF-GROUP` (Branchen-Stage) und `WEIN-SF-MARKET` (NYSE-Breite).

**Daten**
- Wochen aus Tagesbalken, mindestens 160 Bars, SPY als Benchmark (Beleg).
- PIT-Branchengruppen: Eine SIC-Historie existiert, ein Gruppenchart (Member-Index) fehlt. Die Gruppen-Stage bleibt DATA_BLOCKED (`adapters/industry-groups.mjs`).
- NYSE-Breite: nur ein Live-Log ab 18.09.2026.

**Corporate Actions**
- DQ-K5: 0 exponiert, CC5-a erfüllt. DQ-K3: 5 exponiert, 1 echt, 4 ungeklärt.
- Trade-Stabilität unter Quarantäne: 311 von 1.348 Trades unverändert (23 %), Knock-on 1.037.

**Ausführung und Kosten**
- Wochenschlüsse, tägliche Ausführung.
- SF7-V1: Die Deklaration „at or above“ weicht vom Code (`>`) ab. Gemessen als Lesart `EX7-WEIN-TRAIL-AT-OR-ABOVE`; die Referenz ist unverändert.
- COST-50: 1.348 → 1.339 Trades.
- Produkt-Ceiling CHART_CANDIDATE.

**OOS:** DEV 1.348, HOLDOUT 995. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 14, alle PASS (`sf-weinstein.test.mjs`). Dazu `SF7-VAL-WEIN-TRAIL-GOLDEN`.

**CC-Stand:** Messklasse SCREEN_STATISTICS. Erfüllt CC-1, CC-2, CC-6, CC-7. Offen CC-3, CC-4, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-3 | Die 14 Ermessensfragen; die Quelle verlangt sie (Stage-Urteil). Strukturell kaum mechanisierbar ohne Owner-Neudefinition, und eine Neudefinition wäre keine Quellentreue. |
| CC-4 | PIT-Gruppen-Stage (Gruppenchart) und lizenzierte NYSE-A/D-Historie. |
| CC-5 | Belege für die 4 K3-Sitzungen. Owner-Entscheidung, ob Exposition 0 bei K5 für CC5-a genügt; CC5-e und CC5-f bleiben offen. |
| CC-8 | wie C01 |

## C05 – Weinstein Trader (`SF_WEINSTEIN_TRADER`)

**Quellen:** wie C04.

**Regeln vs. Annahmen**
- Vertrag 1.2.0: 1 exakt, 5 abgeleitet, 8 manuell, 2 datenblockiert, 0 mehrdeutig.
- Mechanisch: MA-GATE, ORDER, TR-CONT.
- 12 essenzielle manuelle Entscheidungen, Annahmen wie C04.
- Datenblockiert: WEIN-SF-GROUP, -MARKET.

**Daten:** wie C04.

**Corporate Actions**
- DQ-K5: 4 exponiert, 4 ungeklärt. DQ-K3: 9 exponiert, 0 echt, 9 ungeklärt.
- Stabilität unter Quarantäne 21 % (373 von 1.808).

**Ausführung und Kosten:** wie C04. COST-50: 1.808 → 1.859 Trades. Golden Case `SF7-GC-WEINSTEIN-TRADER` (Gap-Ausstieg).

**OOS:** DEV 1.808, HOLDOUT 1.296. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 14, alle PASS (`sf-weinstein.test.mjs`).

**CC-Stand:** erfüllt CC-1, CC-2, CC-6, CC-7. Offen CC-3, CC-4, CC-5, CC-8.

**Blocker:** wie C04, dazu 4 K5- und 9 K3-Sitzungen.

## C06 – Minervini SEPA / VCP (`SF_MINERVINI_SEPA_VCP`)

**Quellen**
- `B12`: Trade Like a Stock Market Wizard, indonesische maschinenähnliche Übersetzung. Ledger `SRC-MM-BOOK-TLSMW` (BIBLIOGRAPHIC_ONLY).
- `B07`: Momentum Masters, indonesische Übersetzung. Kein Ledger-Eintrag.
- `B03`: Think & Trade Like a Champion, vietnamesische Lizenzausgabe. Ledger `SRC-MM-BOOK-TTLC`.
- `W-MIN18`: Stockopedia-Interview 2018, englisch, nur Minervini-Antworten. Kein Ledger-Eintrag.
- Sekundär: `SRC-MM-TT-SECONDARY`.

**Regeln vs. Annahmen**
- Vertrag 1.4.0: **0 exakt**, 11 abgeleitet, 7 manuell, 1 datenblockiert. Wortlaut nur über Übersetzung (CROSS_TRANSLATION nach E7-2).
- Mechanisch: Trend Template TT-1 bis TT-7 und PROCESS.
- Datenblockiert: `MIN-SF-TT-8` (IBD-RS ≥ 70).
- 11 essenzielle manuelle Entscheidungen: Priorität, Earnings-Qualität, VCP, Pivot, Stop, Größe, Verkauf.
- 19 Lifecycle- und 6 sf7-Modellannahmen, u. a. `MA-MIN-SEPA-SETUP-PROXY`, `MA-MIN-SEPA-PIVOT`, `MA-MIN-ORDER-TYPE`, `MA-MIN-STOP-PLACEMENT`, `MA-MIN-RISK-FRACTION`, `MA-MIN-EXIT-POLICY`, `MA-MIN-INTRABAR-ORDER`, `MA-MIN-MAX-POSITIONS`, `MA-MIN-STAGE2-TREND-TEMPLATE`. Die SF7-Varianten laufen unter `MA-MIN7-*`.

**Daten**
- Tagesbalken, mindestens 252 Bars.
- SEC-PIT-EPS nur als Beleg (`fundamentals: MANUAL_ONLY`):
  - 762 von 954 DEV-Einstiegen haben PIT-Fundamentals;
  - 405 haben ein ungeklärtes Quartal, überwiegend ein abgeleitetes Q4 (`SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md` §4).
- Schätzungen, Überraschungen und Guidance fehlen.

**Corporate Actions**
- DQ-K5 und DQ-K3: je 0 exponiert. CC5-a und CC5-b erfüllt, als einzige Referenz beide.
- Stabilität unter Quarantäne 94 %, das ist der höchste Wert.
- Splits wirken zusätzlich auf den EPS-Vergleich. Korrigiert ist nur bei einem deklarierten Split; sonst wird der Wert auf `null` gesetzt.

**Ausführung und Kosten**
- `BUY_STOP_LIMIT` am Pivot, pessimistisch.
- SF7-D4 als `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` behoben; 21 Varianten hashgleich.
- COST-50: 954 → 983 Trades.
- Produkt-Ceiling CHART_CANDIDATE.

**OOS:** DEV 954, HOLDOUT 522. In SF6-PAPER-2027 enthalten (Minervini-Code `c834b227…`), nicht aktiv. Die E7-7-Ausstiegsvarianten sind vorregistriert, aber nicht Teil der Referenz.

**Golden Cases:** 14, alle PASS (`sf-minervini.test.mjs`, `sf-sf7-minervini.test.mjs`). Dazu `sf-minervini-components`, `sf-minervini-lifecycle`, `sf-sf7-minervini-*`; diese sind grün.

**CC-Stand:** erfüllt CC-2, CC-6, CC-7. Offen CC-1, CC-3, CC-4, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 | Die englische Buchausgabe im Projekt oder eine Owner-Entscheidung über Übersetzungsbelege. E7-2 sagt ausdrücklich, dass Übersetzungen nicht als SOURCE_EXACT gelten. |
| CC-3 | Die 11 Ermessensfragen; SEPA ist laut Quelle manuell (MIN-PROCESS-04). |
| CC-4 | IBD-RS-Historie. Lizenz nötig, kein Ersatz zulässig. |
| CC-5 | nur CC5-e und CC5-f fehlen |
| CC-8 | wie C01 |

## C07 – Minervini Power Play (`SF_MINERVINI_POWER_PLAY`)

**Quellen:** wie C06. Die englische Bestätigung über W-MIN18 gilt nur für Stop und Größe.

**Regeln vs. Annahmen**
- Vertrag 1.4.0: 0 exakt, 6 abgeleitet, 4 manuell, 0 datenblockiert.
- Mechanisch: PP-RUNUP (≥ +100 % in < 8 Wochen), PP-CORRECTION, PP-TIGHT.
- 6 essenzielle manuelle Entscheidungen: Startvolumen, Korrekturspanne 20–25 %, Pivot, Stop, Größe, Ausstieg.
- Annahmen: `MA-MIN-PP-PIVOT`, `MA-MIN-PP-ELIGIBLE-CLASSES`, `MA-MIN-ORDER-TYPE`, `MA-MIN-STOP-PLACEMENT`, `MA-MIN-RISK-FRACTION` (0,0125), `MA-MIN-EXIT-POLICY`.

**Daten:** nur Tagesbalken, mindestens 41 Bars (`dataReadiness READY`).

**Corporate Actions**
- DQ-K5: 12 exponiert, 12 ungeklärt. DQ-K3: 39 exponiert, 0 echt, 39 ungeklärt.
- 6.0: 10 von 1.007 Trades exponiert (0,99 %).
- Stabilität unter Quarantäne nur 11 %, Knock-on 889.
- +100-%-Bewegungen liegen methodisch nahe an Kurssprüngen. Die Methode ist daher strukturell CA-sensitiv (eigene Einordnung).

**Ausführung und Kosten**
- `BUY_STOP_LIMIT_NEXT_SESSION` am Run-up-Hoch (`product/detectors.mjs:212`), Risiko 1,25 %.
- COST-50: 1.007 → 971 Trades.
- Produkt: 5 modellierte Abläufe.
- Bekannte Grenze: Übernahmekandidaten erscheinen als „enge Basis“, z. B. BMBL (`SUPERTRADER_8_FIRST_RELEASE.md:87`).

**OOS:** DEV 1.007, HOLDOUT 425. In SF6-PAPER-2027 enthalten, nicht aktiv. Laut E7-7 sind die Stage-2-Ausstiegsregeln in rund 600 Trades nicht bewertbar.

**Golden Cases:** 9, alle PASS (`sf-minervini.test.mjs`, `sf-sf7-minervini.test.mjs`). Dazu `sf-pp-missing-low-fix.test.mjs`, grün.

**CC-Stand:** erfüllt CC-2, CC-4, CC-6, CC-7. Offen CC-1, CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 | wie C06; alle Schwellen sind nur übersetzt (REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION) |
| CC-3 | 6 Ermessensfragen |
| CC-5 | 12 K5- und 39 K3-Sitzungen |
| CC-8 | wie C01 |

## C08 – Kullamägi Breakout (`SF_KK_BREAKOUT`)

**Quellen:** `W-KK3` (`SRC-KK-SETUPS`, PUBLIC_FULL), `W-KKFAQ` (`SRC-KK-FAQ`), `W-KKEP` (`SRC-KK-EP`). Alle englisch, Primärquellen aus dem Web.

**Regeln vs. Annahmen**
- Vertrag 1.2.1: 4 exakt, 1 abgeleitet, 6 manuell, 1 datenblockiert (ORH-Einstieg, nicht essenziell für die Tagesvariante KK-011).
- Mechanisch: KK-SF-BO-MOMENTUM. Die Schwelle ab dem 98. Perzentil ist eine gekennzeichnete Modell-Interpretation mit Owner-Entscheidung.
- 7 essenzielle manuelle Entscheidungen: Setup-Qualität, Ausbruchsniveau, Größe …
- Annahmen: `MA-KK-SETUP-PROXY` (CONSOLIDATION_10), `MA-KK-ENTRY-TIMING`, `MA-KK-EXIT-POLICY`, `MA-KK-RISK-FRACTION` (0,005), `MA-KK-MANUAL-SUBSTITUTE`, `MA-KK-RESEARCH-UNIVERSE`, `MA-KK-COSTS`.

**Daten**
- Tagesbalken, mindestens 127 Bars.
- **Querschnitt** aus 1-, 3- und 6-Monats-Renditen des Universums (`crossSection: true`). Die Momentum-Perzentile hängen damit von der Vollständigkeit des Universums ab und sind survivorship-sensitiv (eigene Einordnung).

**Corporate Actions**
- DQ-K5: 27 exponiert, 27 ungeklärt. DQ-K3: 95 exponiert, 1 echt, 94 ungeklärt.
- 6.0: 31 von 9.114 Trades exponiert (0,34 %).
- Stabilität unter Quarantäne 31 %, Knock-on 6.278.

**Ausführung und Kosten**
- `ON_OPEN_NEXT_SESSION` (Referenz = Schluss am Stichtag), Stop am Tagestief, höchstens 1 ADR.
- 1/3 Teilausstieg, Rest an MA10/20.
- COST-50: 9.114 → 5.064 Trades, also deutlich kostensensitiv.
- Laut E6 ist die Trade-Stabilität gering: Ohne einen Titel bleiben nur 2.709–6.976 Trades unverändert.
- Produkt: 18 modellierte Abläufe.

**OOS:** DEV 9.114, HOLDOUT 5.722. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 8, alle PASS (`sf-kullamagi.test.mjs`). Dazu `SF7-GC-KK-BREAKOUT`.

**CC-Stand:** erfüllt CC-1, CC-2, CC-4, CC-6, CC-7. Offen CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-3 | 7 Ermessensfragen. Das Setup ist eine Modellkonvention; nötig wären Quellenbelege für eine mechanische Setup-Definition oder eine Owner-Entscheidung, die das Kriterium ausdrücklich nicht aufweicht. |
| CC-5 | 27 K5- und 94 K3-Sitzungen |
| CC-8 | wie C01 |

## C09 – Kullamägi Episodic Pivot, Chart-Modell (`SF_KK_EPISODIC_PIVOT`)

**Quellen:** `W-KKEP` (`SRC-KK-EP`), `W-KK3`, `W-KKFAQ`.

**Regeln vs. Annahmen**
- Vertrag 1.1.0: 4 exakt, 1 abgeleitet, 3 manuell, 3 datenblockiert, 1 mehrdeutig.
- Datenblockiert: KK-SF-EP-CATALYST, -VOLUME, -ENTRY. Mehrdeutig: KK-SF-EP-EXIT.
- Annahmen: `MA-EP-GAP-SCREEN`, `MA-EP-ORH`, `MA-EP-VOLUME-PACE`, `MA-EP-CATALYST-NOT-VERIFIED`, `MA-EP-IEX-PRINTS`, `MA-EP-FILL`, `MA-EP-FILL-MINUTE-STOP`, `MA-EP-LOD-AT-ENTRY`, `MA-EP-QUIET-PHASE`, `MA-EP-EXIT`, `MA-EP-SIZING`, `MA-EP-COSTS`, `MA-EP-COMMON-DAY-SET`.

**Daten**
- IEX-Minuten ab 2017 (1–5 % des konsolidierten Volumens), privater Cache, nicht im Snapshot eingefroren.
- Stichprobe `CLEAN` (11,3 %) und `CLEAN_EXT_E7_6` (etwa 15 % je Schicht, 481 Anfragen).
- Katalysator- und News-Historie fehlen.

**Corporate Actions:** NOT_EVIDENCED. Es gibt keinen eigenen Lifecycle auf dem Snapshot, die Quarantäne ist nicht separat gerechnet.

**Survivorship:** Die Stichprobe hängt am Snapshot-Universum. Vor 2017 gibt es keine Daten, also kein zweites Fenster.

**Ausführung und Kosten**
- ORH-Einstieg auf IEX-Minuten.
- **SF7-V2 (MEDIUM):** Bei 180 von 222 über Nacht gehaltenen Referenztrades liegt das konsolidierte Tagestief unter dem IEX-Stop. Die Referenz ist dort möglicherweise optimistisch (`SUPERTRADER_7_EXECUTION_VALIDATION.md` §4).

**OOS:** NOT_EVIDENCED. Nicht in SF6-PAPER-2027 (E5).

**Golden Cases:** 6, alle PASS (`sf-kullamagi.test.mjs`). Dazu `SF7-GC-EP`, `SF7-VAL-EP-PIT-CORRUPTION`, `sf-kk-ep-ps-chart`, `sf-kk-e7-6-sample` und `sf-kk-sf6-sample`; diese sind grün.

**CC-Stand:** VALIDATION_BLOCKED, NOT_MEASURABLE. Alle CC-1 bis CC-8 offen.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| Katalysator | PIT-Katalysatorkalender, z. B. SEC 8-K Item 2.02 `acceptedAt` ≤ Eröffnung. Die Bewertung „unerwartet und signifikant“ bleibt manuell. |
| Volumen und Ausführung | konsolidierte (SIP-)Minuten, Lizenz |
| Reproduzierbarkeit | Minuten im Snapshot einfrieren |
| OOS | eigenes Forward-Protokoll; SF6-PAPER-2027 deckt EP nicht ab |

## C10 – Kullamägi Parabolic Short, Chart-Modell (`SF_KK_PARABOLIC_SHORT`)

**Quellen:** `W-KK3`, `W-KKFAQ`, `W-KKEP`.

**Regeln vs. Annahmen**
- Vertrag 1.1.0: 3 exakt, 0 abgeleitet, 4 manuell, 3 datenblockiert.
- Datenblockiert: KK-SF-PS-ENTRY, -STOP, -BORROW.
- Annahmen: `MA-PS-ACCELERATION`, `MA-PS-ENTRY`, `MA-PS-STOP`, `MA-PS-TARGET`, `MA-PS-BORROW`, `MA-PS-FILL`, `MA-PS-SAME-MINUTE`, `MA-PS-IEX-PRINTS`, `MA-PS-OVERLAP`, `MA-PS-COSTS` u. a.

**Daten:** IEX-Minuten ab 2017. Keine Borrow-, Locate- oder Gebührenhistorie, kein Modell der Uptick-Regel.

**Corporate Actions:** NOT_EVIDENCED.

**Ausführung:** EXECUTION_REALISM BLOCKED, Shorts sind nur hypothetisch. 228 (CLEAN) bzw. 262 (E7-6) abgeschlossene Studientrades.

**OOS:** NOT_EVIDENCED. Nicht in SF6-PAPER-2027.

**Golden Cases:** 4, alle PASS (`sf-kullamagi.test.mjs`). Dazu `SF7-GC-PS` und `SF7-VAL-PS-PIT`.

**CC-Stand:** erfüllt nur CC-1. Offen CC-2 bis CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| Borrow | historische Borrow- und Gebührendaten, Lizenzentscheidung |
| Ausführung | Intraday-Einstieg und -Stop auf konsolidierten Minuten |
| Rest | wie C09 |

## C11 – Pocket Pivot (`SF_MOKA_POCKET_PIVOT`)

**Quellen:** `W-MOKAPP`, `W-MOKA12`, `W-MOKASTOP`, `W-MOKAV24`. Alle sind Web-Primärquellen; keine hat einen Eintrag in `source-ledger.json`.

**Regeln vs. Annahmen**
- Vertrag 1.3.0: 1 exakt, 3 abgeleitet, 5 manuell, 0 datenblockiert, 1 mehrdeutig.
- Mechanisch: nur MOKA-SF-PP-VOLUME.
- **Der Initialstop fehlt in der Quelle**: MOKA-SF-PP-STOP ist SOURCE_BLOCKED, deshalb 8 von 9 Phasen. Die Variante `MA6-PP-STOP-SIGNAL-DAY-LOW` (E3) ist ausdrücklich keine Originalregel.
- Mehrdeutig: `MOKA-SF-EXIT-VIOLATION`, Lesart `MA-MOKA-VIOLATION-READING` = LATER_DAYS.
- 7 essenzielle manuelle Entscheidungen. Annahmen: `MA-MOKA-CONTEXT-PROXY`, `MA-MOKA-ENTRY-TIMING`, `MA-MOKA-SIZING`, `MA-MOKA-MANUAL-SUBSTITUTE`, `MA-MOKA-COSTS`.

**Daten:** Tagesbalken, mindestens 51 Bars. Fundamentals nur manuell.

**Corporate Actions**
- DQ-K5: 9 exponiert, 9 ungeklärt. DQ-K3: 25 exponiert, 0 echt, 25 ungeklärt.
- Stabilität unter Quarantäne 10 %.
- Produkt: NUWE ist von DQ-PX-4 betroffen. C11 liest aber nur Tagesbalken.

**Ausführung und Kosten**
- Schluss bzw. nächste Eröffnung.
- Die Stop-Variante wirkt als Einstiegsfilter: 32.413 Einstiege abgelehnt, 4.534 statt 1.872 Trades.
- COST-50: 1.872 → 1.845 Trades.
- Produkt-Ceiling CONFIRMED_RESEARCH_SETUP.

**OOS:** DEV 1.872, HOLDOUT 1.415. In SF6-PAPER-2027 enthalten, ohne Stop-Variante, nicht aktiv.

**Golden Cases:** 9, alle PASS (`sf-morales-kacher.test.mjs`, `sf-moka-completion.test.mjs`). Dazu `SF7-GC-POCKET-PIVOT`.

**CC-Stand:** SOURCE_BLOCKED. Erfüllt CC-4, CC-6, CC-7. Offen CC-1, CC-2, CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| Stop | eine Primärquelle mit der Stopregel der Autoren. Mit der Modellvariante ist CC-2 nach E3 nicht erfüllbar. |
| CC-3 | 7 Ermessensfragen |
| CC-5 | 9 K5- und 25 K3-Sitzungen |
| CC-8 | wie C01 |

## C12 – Buyable Gap-Up (`SF_MOKA_BUYABLE_GAP_UP`)

**Quellen:** wie C11. Kein Eintrag in `source-ledger.json`.

**Regeln vs. Annahmen**
- Vertrag 1.3.0: 2 exakt, 2 abgeleitet, 6 manuell, 0 datenblockiert, 2 mehrdeutig.
- Mechanisch: BGU-GAP (≥ 0,75 × ATR40) und BGU-VOLUME (≥ 1,5 ×).
- Mehrdeutig:
  - `MOKA-SF-BGU-VOLWINDOW`: Lesart `MA-MOKA-BGU-VOLWINDOW` mit 50 Sitzungen (D-BGU-VOLWINDOW);
  - `MOKA-SF-EXIT-VIOLATION`.
- 8 essenzielle manuelle Entscheidungen: Führung/Thema, Megacap-Ausnahme, Sell-Guide, Größe, Ausstieg. Annahmen: `MA-MOKA-BGU-STOP`, `MA-MOKA-SELL-GUIDE`, `MA-MOKA-SIZING` u. a.

**Daten**
- Tagesbalken, mindestens 52 Bars.
- Die PIT-Marktkapitalisierung für die Megacap-Ausnahme fehlt im Snapshot; die Ausnahme bleibt manuell.

**Corporate Actions**
- DQ-K5: 14 exponiert, 14 ungeklärt. DQ-K3: 69 exponiert, 1 echt, 68 ungeklärt.
- Stabilität unter Quarantäne 38 %.
- Gap-Ereignisse liegen methodisch nahe an nicht deklarierten Splits (eigene Einordnung).

**Ausführung und Kosten**
- `ON_OPEN_NEXT_SESSION` (Referenz = Schluss am Stichtag, `detectors.mjs:322`). Ein Stop-Gap wird zur Eröffnung ausgeführt (`SF7-GC-BGU`).
- COST-50: 3.415 → 3.467 Trades.
- Produkt: 33 modellierte Abläufe.

**OOS:** DEV 3.415, HOLDOUT 2.116. In SF6-PAPER-2027 enthalten, nicht aktiv.

**Golden Cases:** 9, alle PASS (`sf-morales-kacher.test.mjs`, `sf-moka-completion.test.mjs`).

**CC-Stand:** erfüllt CC-2, CC-4, CC-6, CC-7. Offen CC-1, CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 | eine Quellenstelle zum Mittelungsfenster des Volumens und zur Lesart der Linienverletzung |
| CC-3 | 8 Ermessensfragen |
| CC-5 | 14 K5- und 68 K3-Sitzungen |
| CC-8 | wie C01 |

## C13 – Holy Grail (`SF_RASCHKE_HOLY_GRAIL`)

**Quellen**
- `W-RAS04`: Raschke-Interview 2004, Primärquelle, eigene Zitate.
- `W-RAS97`: AIQ Opening Bell 1997, Seitenleiste. Ausdrücklich eine **Sekundärquelle** für Einstieg und Initialstop (D-RAS97), vermutlich eine redaktionelle Zusammenfassung.
- Keine der beiden steht im Ledger.

**Regeln vs. Annahmen**
- Vertrag 1.2.1: 2 exakt, 4 abgeleitet (davon 2 aus der Sekundärquelle), 2 manuell, 1 mehrdeutig (RAS-SF-SIZE: nicht offengelegt).
- Mechanisch: RAS-SF-ADX (> 30), -PULLBACK (EMA20), -ENTRY.
- Trailing und Größe stehen in keiner Quelle. Die Variante `MA6-HG-TRAIL-SWING-LOWS` (E3) ist keine Originalregel.
- Annahmen: `MA-RAS-SOURCE-W-RAS97`, `MA-RAS-ADX-READING`, `MA-RAS-PREVIOUS-BAR`, `MA-RAS-EXIT`, `MA-RAS-SWING-LOW`, `MA-RAS-SIZING`, `MA-RAS-INTRABAR-ORDER`, `MA-RAS-COSTS`, `MA-RAS-MANUAL-SUBSTITUTE`.

**Daten:** Tagesbalken, mindestens 60 Bars. Intraday-Zeitebenen DATA_BLOCKED; die Tagesebene ist eine erlaubte Zeitebene (RAS04-006).

**Corporate Actions**
- DQ-K5: **29** exponiert, 29 ungeklärt, die höchste Zahl aller Referenzen. DQ-K3: 99 exponiert, 0 echt, 99 ungeklärt.
- Stabilität unter Quarantäne 9 %, der niedrigste Wert.

**Ausführung und Kosten**
- Buy-Stop über dem Hoch des Rücksetzertags, Ausstieg am neuen Hoch über die nächste Eröffnung.
- SF7-D1 als Variante: 127 sichere Ausstiege.
- COST-50: 4.025 → 4.041 Trades.
- Produkt-Ceiling CONFIRMED_RESEARCH_SETUP.

**OOS:** DEV 4.025, HOLDOUT 3.253. In SF6-PAPER-2027 enthalten (W-RAS97), nicht aktiv.

**Golden Cases:** 7, alle PASS (`sf-holy-grail.test.mjs`, `sf-sf5-kk-moka-lifecycle.test.mjs`, `sf-sf5-owner-decisions.test.mjs`). Dazu `SF7-GC-HOLY-GRAIL`.

**CC-Stand:** SOURCE_BLOCKED, NOT_MEASURABLE. Erfüllt CC-4, CC-6, CC-7. Offen CC-1, CC-2, CC-3, CC-5, CC-8.

**Blocker**

| Blocker | Schließender Beleg |
|---|---|
| CC-1 und CC-2 | eine Primärquelle für Einstieg, Stop, Trailing und Größe. Ohne sie ist keine historische Methodenrendite berechenbar (Registry). |
| CC-3 | 3 Ermessensfragen |
| CC-5 | 29 K5- und 99 K3-Sitzungen |
| CC-8 | wie C01 |

---

## Kompakte Matrix

Legende:
- K5/K3 = exponierte Sitzungen nach Regelsatz 1.3.0, alle ungeklärt bis auf die genannten echten Bewegungen.
- Stab. Q = Anteil unveränderter Trades unter DQ-K5-Quarantäne.
- GC = Golden Cases je Methode, mit geteilten Fällen.
- Produkt = Stufen am 28.10.2026: CHART / CONFIRMED / MODELED, VALIDATED ist für alle 0.

| | Methode | Zustand / Messklasse | Daten | erfüllt | offen | Trades DEV / HO | K5 / K3 | Stab. Q | GC | Produkt (detected) |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Turtle S1 | RCWE / FULL_DIAGNOSTIC | Tag | 2,3,6,7 | 1,4,5,8 | 820 / 716 | 16 / 41 (1 echt) | 16 % | 30 ✓ | 47 / 201 / 0 (248) |
| C02 | Turtle S2 | RCWE / FULL_DIAGNOSTIC | Tag | 1,2,3,6,7 | 4,5,8 | 559 / 530 | 14 / 38 | 58 % | 23 ✓ | 33 / 170 / 0 (203) |
| C03 | Darvas | RCWE / MECH_COMPONENT | Tag (+Woche ATH) | 2,4,6,7 | 1,3,5,8 | 19.556 / 11.869 | 15 / 30 | 92 % | 18 ✓ | 243 / 0 / 0 (243) |
| C04 | Weinstein Inv. | RCWE / SCREEN_STATS | Woche aus Tag, SPY | 1,2,6,7 | 3,4,5,8 | 1.348 / 995 | 0 / 5 (1 echt) | 23 % | 14 ✓ | 421 / 0 / 0 (421) |
| C05 | Weinstein Tr. | RCWE / SCREEN_STATS | Woche aus Tag, SPY | 1,2,6,7 | 3,4,5,8 | 1.808 / 1.296 | 4 / 9 | 21 % | 14 ✓ | 379 / 0 / 0 (379) |
| C06 | Minervini SEPA | RCWE / SCREEN_STATS | Tag, SEC-EPS (Beleg) | 2,6,7 | 1,3,4,5,8 | 954 / 522 | 0 / 0 | 94 % | 14 ✓ | 694 / 0 / 0 (694) |
| C07 | Power Play | RCWE / SCREEN_STATS | Tag | 2,4,6,7 | 1,3,5,8 | 1.007 / 425 | 12 / 39 | 11 % | 9 ✓ | 16 / 2 / 5 (23) |
| C08 | KK Breakout | RCWE / SCREEN_STATS | Tag + Querschnitt | 1,2,4,6,7 | 3,5,8 | 9.114 / 5.722 | 27 / 95 (1 echt) | 31 % | 8 ✓ | 19 / 0 / 18 (37) |
| C09 | KK EP | VALIDATION_BLOCKED / NOT_MEAS. | IEX-Minuten ab 2017 | – | 1–8 | 611 (Stichprobe) / – | – | – | 6 ✓ | 24 / 0 / 0 (24) |
| C10 | KK PS (Short) | VALIDATION_BLOCKED / NOT_MEAS. | IEX-Minuten, kein Borrow | 1 | 2–8 | 228 (Stichprobe) / – | – | – | 4 ✓ | 17 / 0 / 0 (17) |
| C11 | Pocket Pivot | SOURCE_BLOCKED / SCREEN_STATS | Tag | 4,6,7 | 1,2,3,5,8 | 1.872 / 1.415 | 9 / 25 | 10 % | 9 ✓ | 16 / 512 / 0 (528) |
| C12 | BGU | RCWE / SCREEN_STATS | Tag | 2,4,6,7 | 1,3,5,8 | 3.415 / 2.116 | 14 / 69 (1 echt) | 38 % | 9 ✓ | 142 / 53 / 33 (228) |
| C13 | Holy Grail | SOURCE_BLOCKED / NOT_MEAS. | Tag | 4,6,7 | 1,2,3,5,8 | 4.025 / 3.253 | 29 / 99 | 9 % | 7 ✓ | 40 / 140 / 0 (180) |

RCWE = RESEARCH_COMPLETE_WITH_EXCEPTIONS. Produkt-Ceilings: C04, C05, C06, C09 und C10 enden bei CHART, C11 und C13 bei CONFIRMED, die übrigen bei MODELED. Summe 3.225 Kandidaten: 2.091 / 1.078 / 56.

---

## Priorisierte Reihenfolge: robusteste Validierbarkeit mit vorhandenen Daten

**Maßstab**
- Möglichst wenige offene CC, die Daten oder Quellen brauchen, die das Projekt nicht hat.
- Nur Tagesbalken; keine Fundamentals, keine Branchengruppen, keine Intraday-Daten.
- Genug Trades für statistische Aussagekraft.
- Geringe CA-Exposition und hohe Trade-Stabilität.
- Möglichst wenig Ermessen.

CC-5 (CA-Quelle) und CC-8 (Paper 2027) sind für **alle** offen. Die Reihenfolge sagt deshalb nur, wo nach diesen beiden Querschnittsschritten am wenigsten fehlt.

1. **C02 Turtle S2**
   - Einzige Methode mit CC-1, CC-2 und CC-3 erfüllt, ohne mehrdeutige Regel.
   - Nur Tagesbalken, englische Primärquelle.
   - Offen sind nur CC-4 (PIT-Korrelationsgruppen, eine Datenentscheidung) sowie CC-5 und CC-8.
   - Schwächen: geringe Tradezahl (etwa 52 pro Jahr, also wenig Aussagekraft im 250-Sitzungen-Fenster) und der höchste Expositionsanteil bei K5 (1,97 %, fast nur über den Kanalrückblick).
2. **C01 Turtle S1**
   - Wie C02, zusätzlich CC-1 mit zwei mehrdeutigen Lesarten; beide laufen bereits als Szenarien.
   - Etwa 77 Trades pro Jahr, Trade-Stabilität nur 16 %.
3. **C08 KK Breakout**
   - CC-1 und CC-4 erfüllt, nur Tagesbalken, viele Trades (etwa 850 pro Jahr).
   - Offen ist CC-3 mit 7 Ermessensfragen; das Setup ist eine Modellkonvention.
   - Risiken: Das Querschnitts-Momentum ist survivorship-sensitiv, die Methode deutlich kostensensitiv (−44 % Trades bei COST-50) und die Trade-Stabilität gering (31 %). Die Auswertung muss über Verteilungen laufen (E6).
4. **C12 Buyable Gap-Up**
   - Tagesbalken, etwa 320 Trades pro Jahr, CC-4 erfüllt.
   - CC-1 hängt an zwei Lesarten (Volumenfenster, Linienverletzung), CC-3 an 8 Ermessensfragen.
   - Gap-Ereignisse sind CA-nah: 68 K3-Sitzungen sind ungeklärt.
5. **C03 Darvas**
   - Die größte Stichprobe (etwa 1.800 Trades pro Jahr), CA-robust (0,10 % exponiert, 92 % stabil).
   - Gemessen wird aber nur die mechanische Komponente.
   - CC-3 ist mit 8 Ermessensfragen strukturell schwer erreichbar. Das ATH braucht Tageshochs vor 2015, die Methode ist stark kostensensitiv (−62 % Trades bei COST-50), und die Quelle ist im Ledger DISPUTED.
6. **C07 Power Play**
   - Nur Tagesbalken, keine Datenblocker, etwa 94 Trades pro Jahr.
   - CC-1 ist ohne englische Ausgabe nicht lösbar. Die Trade-Stabilität ist sehr gering (11 %), die Methode methodisch CA-nah.
7. **C06 Minervini SEPA**
   - Die beste CA-Lage (0/0, CC5-a und CC5-b erfüllt, 94 % stabil).
   - Dagegen stehen drei Blocker außerhalb der Daten des Projekts: CC-1 (Übersetzung), CC-3 (11 Ermessensfragen, SEPA ist laut Quelle manuell) und CC-4 (IBD-RS, lizenzpflichtig, kein Ersatz zulässig).
   - Fundamentals sind nur als Beleg nutzbar, mit 405 ungeklärten Quartalen.
8. **C13 Holy Grail**
   - Viele Trades und nur Tagesbalken.
   - Einstieg und Stop stammen aber aus einer Sekundärquelle, Trailing und Größe fehlen. Die K5-Exposition ist die höchste (29), die Trade-Stabilität die niedrigste (9 %).
9. **C11 Pocket Pivot:** Die Quelle hat keinen Stop. CC-2 ist mit vorhandenem Material nicht erfüllbar.
10. **C05 Weinstein Trader** und **11. C04 Weinstein Investor**
    - Datenblocker bei Branchen-Stage und NYSE-Breite, 12 bzw. 14 Ermessensfragen, Wochenlogik.
    - C04 hat zwar 0 K5-Sitzungen, aber die meisten manuellen Entscheidungen.
12. **C09 Episodic Pivot:** Katalysator, konsolidiertes Intraday-Volumen und eingefrorene Minuten fehlen. Nur IEX-Stichprobe ab 2017; SF7-V2 ist offen.
13. **C10 Parabolic Short:** keine Borrow-Historie, Short hypothetisch, nicht ausführbar.

Die Trades pro Jahr sind eine eigene Ableitung: DEV-Trades geteilt durch etwa 10,7 Jahre. Sie sind keine Repository-Kennzahl und gelten unter der Kapitalbindung der Referenz (Positionsgrenzen, Kasse).

---

## Querschnittsblocker

1. **CC-5 / V4-D1:** 83 referenzexponierte DQ-K5-Sitzungen sind ungeklärt.
   - Freie Quellen (EDGAR 1.4.0 bis 1.4.3, Tiingo-Splits 403) bestätigen keine.
   - Die Quarantäne zählt nie (E1). CC5-e ist mit k-Schwellen konstruktionsbedingt unerfüllbar (2:1 bleibt unsichtbar), CC5-f ist nicht gerechnet.
   - Schließen kann nur eine lizenzierte, faktortragende CA-Quelle mit Abnahme (mindestens 90 % Event-Treffer, mindestens 95 % exakte Ratio, 0 falsch-positiv, mindestens 85 % Abdeckung 2008–2017). Danach braucht es einen Daten-PR, Snapshot-Generation 3 (E7-4 B) und Neuläufe gegen dieselben Referenz-Hashes (`SUPERTRADER_7_OWNER_DECISIONS_E7.md`).
2. **CC-8:** Kein historisches Fenster qualifiziert. SF6-PAPER-2027 1.1.0 ist vorbereitet, aber nicht aktiv: kein Workflow, die Aufbewahrungsentscheidung offen. Auswertbar frühestens Ende 2027. C09 und C10 sind nicht abgedeckt.
3. **Survivorship:**
   - Snapshot-Delistings stammen aus der Tiingo-Liste; vor 2009 sind sie kaum vorhanden, Delisting-Renditen fehlen. Der Holdout 2008–2015 ist dadurch nach oben verzerrt.
   - Die V13-Reihen (1.675 qualifizierte Ketten, Lücke vor 2009/2010) liegen privat im Quant-Bereich. Eine Einbindung in Supertrader ist **nicht belegt** und bräuchte eine neue Snapshot-Generation.
4. **PIT-Stammdaten im Produktlauf:**
   - `--as-of` schneidet nur die Tagesbalken. Listing-Beginn, Status, SIC und Kontinuität bleiben auf dem heutigen Stand (`docs/SUPERTRADER_8_DAILY_RUN.md:47`). Historische Wiederholungen des Produktlaufs sind damit nicht vollständig zeitpunktgenau, und der gezeigte Schluss ist adjustiert (`SUPERTRADER_8_PRICE_PARITY_V4.md:41`).
   - Der Security Master hat keinen Erzeuger (V1 S6 nicht erfüllt). Die Eingangsprüfung sperrt ab etwa 10./11.11.2026.
5. **PIT-Branchen- und Korrelationsgruppen (CC-4 für C01, C02, C04, C05):**
   - Widerspruch im Repository: `SUPERTRADER_2_DATA_GAPS.md` nennt die Gruppen „CURRENT values only, PIT false“. Inzwischen gibt es aber `quant/data/sec/sic-history` (SIC zum Einreichungszeitpunkt, Manifest vom 20.10.2026) und den Adapter `adapters/industry-groups.mjs` (sf-industry-groups-1.1.0).
   - Der Adapter wirft ohne Owner-Entscheidung `MODEL_ASSUMPTION_REQUIRED`. E4 schließt SIC-Proxys für CC-4 aus; E7-5 A verlangt eine E4-Revision. Für Weinstein fehlt zusätzlich ein Gruppenchart.
6. **Quellen (CC-1):**
   - Minervini liegt nur übersetzt vor (B12 id, B07 id, B03 vi).
   - Raschke stützt sich auf die Sekundärquelle W-RAS97. Der Pocket-Pivot-Stop fehlt in der Quelle.
   - `scripts/supertrader/source-ledger.json` führt Morales/Kacher, Raschke, B07 und W-MIN18 nicht. Die Herkunft dieser Quellen ist nur über PSR #709 und die Registry belegt.
7. **Ermessensregeln (CC-3):** Alle Methoden außer C01 und C02 ersetzen essenzielle Quellenentscheidungen durch Modellannahmen. Für mehrere Methoden (Darvas, SEPA, Weinstein) verlangt die Quelle das Ermessen ausdrücklich. Das ist kein Datenproblem, sondern eine Grenze der Mechanisierbarkeit.
8. **Lizenzdaten:** IBD-RS (C06), NYSE-Breite (C04, C05), SIP-Minuten (C09, C10), Borrow (C10) und PIT-Marktkapitalisierung (C12, nur Beleg) sind nicht vorhanden.
9. **Trade-Stabilität und Robustheit (E6):** Numerische Reproduzierbarkeit ist belegt. Trade-Stabilität ist gering, Robustheit **nicht belegt**: Die Kennzahlen sind versiegelt und nicht bewertet.

## Festgestellte Widersprüche und Abweichungen

| Thema | Befund |
|---|---|
| Expositionseinheiten | 6.0 zählt exponierte **Trades** (z. B. C01: 15 von 820), 7.0 exponierte **Sitzungen** (C01: 16). Die Summe der Sitzungen je Referenz ist 140, dedupliziert 83. |
| DQ-PX-4 | `SUPERTRADER_8_ACTIVATION_READINESS.md` (27.10.) meldet 0, `SUPERTRADER_8_FIRST_RELEASE.md` (29.10.) einen ERROR für 4 Titel. |
| Registry und Readiness | `STRATEGY-REGISTRY.json` (SF1-Stand) führt `backtestReadiness NOT_READY` für die meisten Methoden und andere Abdeckungszahlen (z. B. C01: 20 abgeleitet statt 13). Maßgeblich ist das neuere `STRATEGY-SF6-READINESS.json`. |
| PIT-Branchengruppen | Data-Gaps-Dokument (2.0) und vorhandene `sic-history` mit Adapter widersprechen sich, siehe oben. |
| Golden-Case-Lauf | Das Artefakt meldet 2 übersprungene Tests, der Lauf vom 30.10. 1. |
| Darvas im Produkt | Ceiling MODELED, aber 0 modellierte Abläufe, weil das ATH strukturell gesperrt ist (O-7). `SUPERTRADER_8_PRODUCT_INTEGRATION.md` nennt 237 Kandidaten, der Stand vom 28.10. sind 243. Das ist ein Datenstand, kein Widerspruch. |
| Commit-Text | Der Commit `3e7fc17476` heißt „nicht freigeschaltet“, `summary.json` ist aber veröffentlicht (`asOf` 2026-10-28). Gemeint ist vermutlich `VALIDATED_TRADE_SIGNAL`; das ist nicht belegt. |

## Verwendete Hauptbelege

- `supertrader/data/sf-candidates/summary.json`
- `scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json`, `STRATEGY-REGISTRY.json`, `STRATEGY-GOLDEN-CASE-RESULTS.json`
- `scripts/supertrader/source-faithful/completion/sf6-readiness-criteria.mjs`
- `scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json`
- `scripts/supertrader/source-faithful/product/detectors.mjs`
- `scripts/supertrader/source-faithful/adapters/industry-groups.mjs`
- `scripts/supertrader/source-faithful/research/run-sf6-validation.mjs`
- `scripts/supertrader/source-ledger.json`
- `docs/SUPERTRADER_7_COMPLETION_MATRIX.md`, `SUPERTRADER_7_FULL_COMPLETION_REPORT.md`, `SUPERTRADER_7_EXECUTION_VALIDATION.md`, `SUPERTRADER_7_OWNER_DECISIONS_E7.md`, `SUPERTRADER_7_EPPS_SAMPLE_E7_6.md`, `SUPERTRADER_7_EDGAR_CA_CHECK.md`, `SUPERTRADER_7_TIINGO_SPLITS_PROBE.md`
- `docs/SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md`, `SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md`, `SUPERTRADER_6_V4D1_CONTAINMENT.md`
- `docs/SUPERTRADER_8_ACTIVATION_READINESS.md`, `SUPERTRADER_8_FIRST_RELEASE.md`, `SUPERTRADER_8_PRODUCT_INTEGRATION.md`, `SUPERTRADER_8_DAILY_RUN.md`, `SUPERTRADER_8_PRICE_PARITY_V4.md`
- `docs/SUPERTRADER_2_DATA_GAPS.md`, `docs/SUPERTRADER_VALIDATION_DATA_PATH.md`, `docs/SUPERTRADER_DURABLE_RESEARCH_SNAPSHOTS.md`
- `docs/quant-recovery/DATA_QUALITY_V13_FINAL.md`, `docs/quant-recovery/HANDOVER_V13.md`
