# Fundamentaldaten – Architektur (Ist und Soll)

Stand: Fundamental-Data-Integrity-Audit, 7. Oktober 2026. Begleitdokumente:
- [Audit-Bericht](FUNDAMENTAL_DATA_INTEGRITY_AUDIT.md)
- [Migration](FUNDAMENTAL_DATA_MIGRATION.md)
- Artefakte unter `scripts/fundamentals-audit/artifacts/`

## 1. Ist-Zustand (bewiesen aus dem Code, `FUNDAMENTAL-DATA-LINEAGE.json`)

```
SEC data.sec.gov (companyfacts, submissions, companyfacts.zip)
  ├─ P1 Quant-SEC-Kern  scripts/quant/sec/*  (provider → normalize → fiscal → periods → restatements → derived)
  │     ├─ P2 Consumer-Bundle  quant/data/sec/consumer/CIK*.json   (as_of_latest, 1 Fassung je Periode)
  │     │     ├─ Discover  → discover/data/stocks → Screener-Universum
  │     │     ├─ Company Intelligence (Earnings-Zusammenfassungen, Karten)
  │     │     ├─ Quant Faktor-Evidenz, Pattern-Research-Overlay
  │     │     └─ Supertrader CAN SLIM / Piotroski (Teilpruefungen, Anzeige)
  │     ├─ P3 Canonical (bitemporal, nur Golden Five) → providers/sec/adapter.js → Golden-Five-Panel
  │     └─ P5 VU2-Serving (Politik waehlbar, keine Laufzeitnutzung gefunden)
  ├─ P7 Supertrader-Validierung  scripts/supertrader/validation/sec-pit.mjs  (eigener Parser, privater Store)
  └─ P9 Minervini-Research  (Branch PR #471/#475, eigener Parser, privater Store)
```

**Befunde**
- Es gibt drei unabhängige SEC-Parser (P1, P7, P9). Nur P1 ist gemeinsam genutzt.
- P7 und P9 duplizieren die Quartalsrekonstruktion und die Tag-Listen, mit abweichender Reihenfolge und abweichender Logik.
- P1 entscheidet die Tag-Priorität je Einreichung. Das ist richtig, eine spätere Einreichung verdrängt keine frühere.
- P1 führte aber drei Konzeptfehler (E1, E2, E5) und zwei Kalenderfehler (E3, E3b).
- P1 leitete außerdem Werte je Aktie aus Kumulwerten ab (E4).
- P2 ist eine Sicht „as_of_latest“. Für aktuelle Anzeigen ist das korrekt. Als historische Point-in-Time-Quelle ist P2 ungeeignet: Es gibt nur eine Fassung je Periode, `filed` ist die jüngste Vergleichseinreichung (E6).
- Live-Minervini 2.0.0 nutzt keine SEC-Fundamentaldaten in seinen Regeln.

## 2. Soll-Leitprinzip

```
SEC PRIMARY SOURCE → RAW FACT → ECONOMIC CONCEPT → PERIOD SEMANTICS → POINT-IN-TIME VISIBILITY
→ NORMALIZED VALUE → PROVENANCE → CONSUMER
```

Korrektheit vor Abdeckung. Point-in-Time vor Bequemlichkeit. UNKNOWN vor einem falschen Wert.

## 3. Kanonische Konzepte (Concept Identity statt Tag Identity)

P1 modelliert bereits Konzepte (Registry-Metriken) mit erlaubten Quell-Tags. Der Audit belegt, dass dieser Ansatz trägt, wenn die Konzeptlisten stimmen. Die Registry 1.8.0 korrigiert sie. Eine reine Prioritätsliste reicht aber nicht: Ein Tag, der laut Taxonomie den Gesamtbetrag trägt, wird von manchen Einreichern für Teilbeträge benutzt (E2-R). Deshalb gilt eine wirtschaftliche Plausibilitätsregel: Ein Gesamtbetrag ist nie kleiner als ein Teilbetrag derselben Einreichung. Dazu kommt eine Währungsregel (E9).

| Konzept | Erlaubte Quellen (Rang in derselben Einreichung) | Periodensemantik | Einheit |
|---|---|---|---|
| EPS_DILUTED | EarningsPerShareDiluted, EarningsPerShareBasicAndDiluted, IncomeLossFromContinuingOperationsPerDilutedShare*, ifrs DilutedEarningsLossPerShare | Dauer; nur gemeldete Quartale (nicht additiv, keine Ableitung) | Währung/Aktie |
| EPS_BASIC | EarningsPerShareBasic, EarningsPerShareBasicAndDiluted, …PerBasicShare*, ifrs BasicEarningsLossPerShare | wie oben | Währung/Aktie |
| REVENUE | **Revenues (Gesamtumsatz, `aggregate`)** – gilt nur, wenn nicht kleiner als ein anderes Umsatzkonzept derselben Einreichung und Währung (E2-R); dann ASC-606-Vertragsumsatz, SalesRevenueNet, …, ifrs Revenue | Dauer; additiv; Q4 = FY − 9M zulässig | Währung (der Einreichung, E9) |
| NET_INCOME | NetIncomeLoss; Ersatz ProfitLoss / …AvailableToCommon nur mit Kennzeichen (E5, offen) | additiv | Währung |
| GROSS_PROFIT, OPERATING_INCOME, OCF, CAPEX, CASH, DEBT, SHARES_OUTSTANDING | siehe `quant/config/sec-metric-registry.json` | | |

\* Fortgeführte Geschäftsbereiche sind ein anderes Konzept als der Gesamt-EPS. Der Audit fand 4 Werte mit Abweichung. Empfehlung: Kennzeichen „CONTINUING_OPERATIONS_FALLBACK“ in der Provenienz, siehe Migration.

**Custom- und Dimensions-Fakten.** Der GDDY-Befund zeigt: Fehlende Werte stammen nicht aus Custom-Tags, sondern aus Standard-Tags mit Dimension (Aktiengattung). SEC-companyfacts liefert solche Fakten grundsätzlich nicht.
- Eine Zuordnung erfordert das Filing-XBRL samt Kontext und Dimension.
- Sie ist nur zulässig, wenn die Dimension eindeutig die einzige öffentliche Aktiengattung ist. Das ist belegbar über `dei:Security12bTitle` bzw. das Cover.
- Sonst bleibt der Wert UNKNOWN. Eine heuristische Namenszuordnung ist ausgeschlossen.

## 4. Sichten (nie implizit mischen)

| Sicht | Definition | Consumer |
|---|---|---|
| AS_REPORTED_AT_TIME | Erstmeldung; Sichtbarkeit ab Annahmezeitpunkt (acceptanceDateTime); abgeleitete Werte ab der spätesten Komponente (`POLICY_ORIGINAL`, bzw. `POLICY_AS_OF_LATEST` mit `as_of`) | Quant-Backtests, Supertrader-Backtests, historische Signale, Pattern-Research |
| LATEST_RESTATED | jüngste Fassung zum Stichtag (`POLICY_AS_OF_LATEST`, as_of = heute) | aktuelle Unternehmensseiten, Screener, Discover, aktuelle Fundamentalanalyse |

Das Consumer-Bundle (P2) ist LATEST_RESTATED. Ein Consumer, der historische Entscheidungen trifft, darf es nicht als AS_REPORTED_AT_TIME verwenden (Vertrag C-PIT-1).

## 5. Provenienz und Qualitätszustände

P1 führt je Beobachtung bereits Provenienz: Konzept, Einreichung (accession), Formular, `filed`, `available_from`, Transformation und Versionsstand.

Soll: Jeder Consumer-Wert trägt dieselben Angaben kompakt. Heute tragen Bundle-Zeilen `filed` und `accn`, aber nicht das Konzept. Hinzu kommt ein Qualitätszustand:

| Zustand | Bedeutung |
|---|---|
| VERIFIED | wie gemeldet |
| DERIVED | additiv abgeleitet (YTD-Differenz, FY − 9M) |
| AMBIGUOUS | widersprüchliche Konzepte in derselben Einreichung (heute `CONCEPT_DISAGREEMENT`) |
| MISSING | nicht gemeldet bzw. nicht ableitbar |
| STALE | jüngste Periode älter als die Meldefrist |
| CUSTOM_TAG_UNVERIFIED | nicht verwendet; dokumentierter Zustand für künftige Filing-XBRL-Ingestion |
| PERIOD_AMBIGUOUS | Kalender kann die Periode nicht eindeutig zuordnen |

## 6. Datenverträge (CI)

**Datenschicht**
- **D1** Kein Wert vor seiner Einreichung bzw. Annahme sichtbar (FALSE_AVAILABLE = 0).
- **D2** Ein kanonischer Wert je Emittent × Konzept × Periode × Sicht.
- **D3** Provenienz Pflicht (accession, Konzept, filed/available_from).
- **D4** Gültige Einheit je Konzept.
- **D5** Keine stille mehrdeutige Zuordnung.
- **D6** Keine zwei Geschäftsjahre mit demselben Label.
- **D7** Je-Aktie-Werte nie aus Kumulwerten abgeleitet.

**Consumer**
- **C-PIT-1** Quant- und Supertrader-Backtests nutzen nur AS_REPORTED_AT_TIME.
- **C-LATEST-1** Screener, Discover und aktuelle Unternehmensseiten dürfen LATEST_RESTATED nutzen, wenn sie die Sicht ausweisen.
- **C-CI-1** Company Intelligence trennt historische Erstmeldung und aktuelle Fassung ausdrücklich.
- **C-X-1** Gleiches Konzept, gleiche Periode, gleiche Sicht ergibt denselben Wert in allen Consumern (Cross-Consumer-Test).

Umgesetzt in diesem Audit:
- D1: Ground-Truth-Vergleich, FALSE_AVAILABLE = 0 als Gate.
- D6 und D7: Regressionstests `scripts/quant/tests/test_sec_ground_truth_regressions.py`.
- D4 auf Kandidatenebene (E9): Innerhalb einer Einreichung entscheidet die Währung der Einreichung vor der Konzeptpriorität (Normalisierung 1.12.0).
- C-X-1 sowie D2, D4, D6 und D7 auf Bundle-Ebene: `core/tests/fundamental-cross-consumer.test.mjs`.
  - Quant, Aktienseite, Screener-Spur und Geschäftszahlen-Karte lesen denselben Wert.
  - Die eine bewusste Abweichung (KGV ohne TTM-EPS rechnet mit TTM-Gewinn / Aktien) ist ausdrücklich festgehalten.

Die übrigen Verträge stehen im Migrationsplan: D3 (Konzept je Bundle-Zeile, F5), C-PIT-1 (F4) und C-CI-1.

## 7. Ein Parser

Ziel: P7 (`sec-pit.mjs`) und P9 (Research-Parser) lesen ihre Fundamentaldaten aus P1 in der Sicht AS_REPORTED_AT_TIME, statt eigene Parser zu pflegen. Der Audit zeigt, dass beide Duplikate Fehler enthalten, die P1 nicht hat:
- Tag-Priorität je Periode
- ein Tag je Unternehmen
- Q4-Datum nur aus dem FY-Bericht, also Lookahead in P7
- Basic-EPS als Ersatz für Diluted

Das Exportformat für SEPA ist in `scripts/fundamentals-audit/export_sepa_fund.py` bereits prototypisch umgesetzt.
