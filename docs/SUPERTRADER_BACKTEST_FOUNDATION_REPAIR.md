# Supertrader – Backtest Foundation Repair (A4/A5/A8)

Stand: 19. Oktober 2026. Technische Reparatur der Research-Abrechnung, **keine Performance-Zertifizierung**. Keine Strategieregel, kein Parameter, keine Kosten-, Slippage-, Benchmark-, Universums-, Corporate-Action- oder PIT-Regel wurde geändert. Das Tournament wurde nicht neu gestartet.

Artefakte: [`scripts/supertrader/foundation/artifacts/`](../scripts/supertrader/foundation/artifacts/)
- `SUPERTRADER-A4-A5-A8-ROOT-CAUSES.json`: Codepfade, Mechanismus und Fix je Befund und Engine
- `SUPERTRADER-ACCOUNTING-REGRESSION.json`: Ledger, Cash, Positionswerte, Equity und TR-Abgleich, Legacy gegen RESEARCH_V1
- `SUPERTRADER-EXECUTION-REGRESSION.json`: Fills, Settlements, Stückzahlen und Ablehnungen, Legacy gegen RESEARCH_V1

## 1. Kurzfassung

- **Wo die Befunde liegen.** A4, A5 und A8 stammen aus dem V3-Tournament (`runner-certified-v3`, nur auf #677/#705). In V4 (`runner-v4`, nur auf #705) sind sie behoben. Beide Runner liegen nicht auf `main` und bleiben unverändert.
- **Auf `main`** läuft der Research-Backtest der Buchstrategien so: `engine/simulator.mjs` → `validation/analyze-methods.mjs tradesFor` → `validation/portfolio.mjs runPortfolioTR`. Dieser Pfad hat **eigene Varianten** der Befunde, mit anderem Code und teils anderer Wirkung. Die Labels wurden nicht blind übernommen; Einzelheiten in Abschnitt 2.
- **Fix:** ein gemeinsamer, getesteter Vertrag `validation/accounting-contract.mjs`.
  - Er portiert die vorab registrierte V4-Politik. Paritätstest gegen die V4-Originale: 120.000 Stale-Vergleiche, 2.000 Terminal-Termine und 6 Faktoren, **0 Abweichungen**.
  - Eingeschaltet wird er in `runPortfolioTR` über `opts.accounting = 'RESEARCH_V1'` bzw. `analyze-methods.mjs --accounting research-v1`.
- **Legacy bleibt bitgleich.** Ein Golden-Test prüft das über 22 Fälle. Damit ändern sich weder das Live-Modellportfolio noch die eingefrorenen Runden R7–R15.
- **Ergebnis:**
  - 12 von 22 eingefrorenen Fällen ändern sich, genau die A4/A5/A8-Fälle; alle Kontrollfälle bleiben identisch.
  - RESEARCH_V1 erfüllt in jedem Fall alle Erhaltungsidentitäten.
  - Kein Fill liegt ohne realen Quellbalken.

## 2. Befunde nach tatsächlichem Codepfad

| Befund | Tournament V3 (#677/#705) | main: Simulator → runPortfolioTR | gleich? |
|---|---|---|---|
| **A4 Stale Valuation** | `posValue` bewertet ohne Balken mit `lastMarks`, unbegrenzt (52W: 2.175 von 2.198 Tagen) | `markOf` liefert `p.last`, unbegrenzt. Der Simulator überspringt Lücken bis 30 Kalendertage und bucht danach den späteren Ausstieg | gleiche Wirkung, anderer Pfad |
| **A5 Terminal** | `terminal.date = quarantine.from` vor `observedAt` (Lookahead); Datenquarantäne mit 0,7 | Segmentende durch Datenlücke gilt als `DELISTED` → S1 −30 %. Eine vorzeitig endende Reihe wird am letzten Balken verkauft, dessen Ende unbekannt war. `OPEN_AT_END_MARK` wird als Verkauf mit Gebühr gebucht | teilweise (Pauschalabschlag, Zeitpunkt); Quarantäne-Termin nur im Tournament |
| **A5 synthetischer Bar** | Synthetischer Balken nur für Settlement, nach `executeTargets` eingefügt: **keine** Orderausführung darauf gefunden | Legacy füllt einen Ausstieg auch an einem Tag ohne Quellbalken (C15) | main-Pfad prüfte es nicht |
| **A8 Dust** | Löschung bei `shares < 1e-10` (Stückzahl): 15,6 Restwert bei ~2e11 Kurs verschwand | **V3-Mechanismus fehlt**, Löschung nach Fraktion (≤ 1e-9 der Position, C20 korrekt). Verwandte Defekte: Rest ohne Ledger verworfen (C13), Überverkauf erzeugt Bargeld (C14), Rest ohne Ausstieg bleibt unbegrenzt (C19) | nein: anderer Mechanismus, betragsmäßig klein |

## 3. Korrekturen (Funktionen)

| Befund | Funktion | Regel |
|---|---|---|
| A4 | `accounting-contract.mjs createStaleTracker`, `endingPositionCheck`; `portfolio.mjs runPortfolioTR` (Block A4) | Höchstens 5 Sitzungen zum letzten Schluss. In der 6. Sitzung `SECURITY_UNAVAILABLE` zum letzten gültigen Schluss × Datenereignis-Faktor. Nullvolumen bei unverändertem Schluss zählt als stale. Spätere Ausstiege der Position verfallen und werden gezählt |
| A5 | `causalTerminalDate`, `isDataEvent`, `dataEventFactor`, `isExecutableBar`; `portfolio.mjs exitsV1`, `settleV1`; `analyze-methods.mjs segmentEndCause` | Quarantäne in der ersten Sitzung ab `max(from, observedAt)`. `DATA_GAP`, `SECURITY_UNAVAILABLE` und `DATA_QUARANTINE` sind Datenereignisse: Basis Faktor 1, Sensitivitäten 0,7 und 0. Wirtschaftliche Delistings behalten S0/S1/S2/S1C/S2C. `OPEN_AT_END_MARK` ist eine Bewertung, keine Order. Orders nur auf realem Quellbalken; Settlement ohne Balken nur für Datenereignisse |
| A8 | `sellQuantity`, `dustDecision`, `reconciliationTolerance`; `portfolio.mjs reconcileResearch` | Ein Schlussverkauf verkauft exakt den Bestand, nie mehr. Ein Rest unter 0,01 Wert wird mit Wert im Ledger abgeschrieben; die Summe je Buch ist auf 1 begrenzt (fail closed). Mindestorderwert 1e-6. binary64-Bargeldrest wird innerhalb der Toleranz auf 0 gesetzt und protokolliert |

Alle Konstanten stammen aus V4 (`measurement-policy-v4.mjs`, `accounting-v4.mjs` auf #705-Head `547d604d`). Keine ist aus einem Ergebnis abgeleitet.

**Erhaltungsnachweis** `reconcileResearch` prüft:
- Bargeld aus den Ledger-Zeilen
- Endwert = Bargeld + offener Wert
- P&L-Identität
- kein negatives Bargeld
- keine negative Stückzahl
- Dust-Summe ≤ Grenze
- Stale-Endprüfung

Toleranz: absolute Untergrenze plus binary64-Hülle der Bruttoflüsse (V4 A12).

## 4. Regressionstests

`node --test scripts/supertrader/tests/foundation-accounting.test.mjs` (21 Tests):

| Prüfpunkt des Auftrags | Fall / Test |
|---|---|
| Bar vorhanden, ein Tag fehlt, mehrere Tage ohne Bar | C01, C02, C03 |
| Stale-Limit erreicht | C04 (Abrechnung in der 6. Sitzung), C21 (Nullvolumen) |
| spätere / zeitlich korrekt beobachtete Quarantäne | C08 (Buchung an `observedAt`) / C09 |
| synthetischer Terminal-Bar | C05 (Reihenende), C06 (Datenlücke), C18 (Fensterende) |
| nicht ausführbarer synthetischer Bar | C15 (`EXIT_WITHOUT_SOURCE_BAR`); Fill-Prüfung über alle Fälle |
| Voll-, Teilverkauf, Bruchteilsaktien | C10, C11, C12 |
| Rundungsreste | C13, C14 |
| Schlussbewertung | C18 |
| Cash-/Shares-Erhaltung, keine negativen Bestände | Identitätstest über alle 22 Fälle, C22 |
| keine Löschung mit relevantem Restwert | C19 (Abschreibung < 0,01), C20 (15,8 bleibt), Dust-Grenze fail closed |
| kein Lookahead | C17: Equity-Kurve mit und ohne spätere Quarantäne identisch |
| historische Regression Cases | V3-52W-Dust (C20, `dustDecision(8e-11, 1.97e11) = KEEP`), V4-Testwerte A4/A5 (Paritätstest) |
| Legacy unverändert | Golden-Test gegen `tests/fixtures/foundation-legacy-golden.json` (Stand `a20d03081`) |

## 5. Vorher/Nachher auf identischen Eingaben

Eingaben: `scripts/supertrader/foundation/cases.mjs` (eingefroren, synthetisch). Szenario S1_MINUS_30, Datenereignis-Basis LAST_VALID_CLOSE.

| Fall | Befund | Equity Legacy | Equity RESEARCH_V1 | Ursache der Differenz |
|---|---|---|---|---|
| C04 | A4 | 109.997,00 | 100.687,23 | Legacy bucht den Ausstieg nach 8 Sitzungen ohne Kurs; V1 rechnet in der 6. Sitzung zum letzten Schluss ab |
| C21 | A4 | 100.197,98 | 99.988,00 | Nullvolumen-Kurse zählen als stale |
| C05 | A5 | 101.197,88 | 101.186,68 | kein Verkauf am letzten Balken; Abrechnung nach Stale-Grenze mit Slippage |
| C06 | A5 | 97.838,22 | 101.186,68 | Datenlücke ist kein Delisting: Faktor 1 statt 0,7 |
| C08/C09 | A5 | 101.099,00 (offen, unbegrenzt) | 101.086,79 | Quarantäne kausal abgerechnet (C08 an `observedAt`) |
| C17 | A4/A5 | 101.099,00 | 101.086,79 | Stale-Grenze vor `observedAt`, kein Lookahead |
| C15 | A5 | 98.998,10 | 99.988,00 | Legacy-Fill ohne Quellbalken abgelehnt |
| C18 | A5 | 101.947,81 | 101.949,00 | Bewertung statt Verkauf mit Gebühr |
| C13 | A8 | 101.497,849994 | 101.497,85 | Rest wird verkauft statt still gelöscht |
| C14 | A8 | 101.597,84000001 | 101.597,84 | kein Überverkauf |
| C19 | A8 | 99.998,0000005 | 99.997,9950005 | Rest 0,005 als Dust im Ledger statt unbegrenzt gehalten |
| übrige 10 | Kontrolle | identisch | identisch | – |

Die Beträge sind synthetisch und sagen nichts über Strategien. **Ein exakter historischer Vorher/Nachher-Vergleich wird nicht behauptet**, weil kein unveränderlicher historischer Input existiert (#763, Abschnitt 1). Teil B behebt das.

## 6. Welche Methoden verwenden die korrigierte Verarbeitung?

**Mit korrigierter Verarbeitung:**
- Alle per-Symbol-Engines auf `main` über `analyze-methods.mjs --accounting research-v1`: Momentum/Kullamägi, Weinstein, Darvas, Minervini, Donchian/Turtle, 52W, Hausstrategie.
- Diese Engines sind die Grundlage der Buchstrategie-Implementierung.

**Noch ohne korrigierte Verarbeitung:**
- **Die sechs Tournament-Methoden** über `runner-certified-v3`: unverändert, Research-PR. Korrigiert sind sie nur in `runner-v4` auf #705 (#763 Szenario B).
- **Legacy-Standard** von `runPortfolioTR` (eingefrorene Runden R7–R15).
- **Live-Modellportfolio** (`model-portfolio.mjs`): keine Live-Änderung, OBS-2.
- **`engine/backtest.mjs runPortfolio`**: nur Referenz der C2-Gleichheitsprüfung, für Research-Ergebnisse nicht verwenden.

## 7. Offene Beobachtungen (kein HIGH)

- **OBS-1:** Der gültige Präfix im Tournament endet an `quarantine.from`. Das ist eine Datenqualitäts- bzw. PIT-Policy, kein Accounting-Fehler.
- **OBS-2:** Das Live-Modellportfolio hat dieselbe A4-Wirkung. Die Korrektur braucht einen eigenen PR mit Vorher/Nachher.
- **OBS-3:** Wirtschaftliche Delistings werden laut Protokoll am letzten Balken abgerechnet; das bleibt unverändert.

Die Readiness ist erst mit Teil B entschieden: `SUPERTRADER-FOUNDATION-READINESS.json`.
