# Supertrader – Source-to-Code Traceability

Generiert aus `scripts/supertrader/source-faithful/artifacts/` mit `node scripts/supertrader/source-faithful/build-docs.mjs`. Nicht von Hand bearbeiten. Quelle: Draft-PR #709 @ `8b766fa` (hash-geprüft). Alle Ergebnisse `DIAGNOSTIC_NOT_CERTIFIED`; keine Methode ist live oder handelbar.

Kette: Source -> Book Edition -> Rule ID -> Strategy Candidate -> Executable Rule -> Test Case -> Implementation Status. Testresultate aus `STRATEGY-GOLDEN-CASE-RESULTS.json`.

## C01 `SF_TURTLE_S1` – Original Turtles (Richard Dennis / William Eckhardt rules)

System 1 (20-day breakout with skip filter and 55-day failsafe, 10-day exit)

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-TR | HARD/HIGH/ja | TUR-SF-TR | SOURCE_EXACT | `methods/turtle.mjs#trueRange` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-N | HARD/HIGH/ja | TUR-SF-N | SOURCE_EXACT | `methods/turtle.mjs#turtleN` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 9; printed 15 | TUR-WEEKLY | CONTEXTUAL/HIGH/ja | TUR-SF-N-DAILY | SOURCE_DERIVED | `methods/turtle.mjs#turtleN` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 8; printed 14 | TUR-UNIT | HARD/HIGH/ja | TUR-SF-UNIT | SOURCE_DERIVED | `methods/turtle.mjs#unitSize` | GC-TUR-HO2002 (PASS)<br>GC-TUR-UNIT-EQUITY (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-DOLLAR | HARD/HIGH/ja | TUR-SF-UNIT | SOURCE_DERIVED | `methods/turtle.mjs#unitSize` | GC-TUR-HO2002 (PASS)<br>GC-TUR-UNIT-EQUITY (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 11; printed 17 | TUR-NOTIONAL | HARD/HIGH/ja | TUR-SF-NOTIONAL | SOURCE_DERIVED | `methods/turtle.mjs#createNotionalAccount` | GC-TUR-NOTIONAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 11; printed 17 | TUR-DRAWDOWN | HARD/HIGH/ja | TUR-SF-NOTIONAL | SOURCE_DERIVED | `methods/turtle.mjs#createNotionalAccount` | GC-TUR-NOTIONAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT4 | HARD/HIGH/ja | TUR-SF-LIMIT4 | SOURCE_EXACT | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS)<br>GC-TUR-LIMIT4 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT12 | HARD/HIGH/ja | TUR-SF-LIMIT12 | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-LIMIT12 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT6 | HARD/HIGH/ja | TUR-SF-LIMIT-CORR | DATA_BLOCKED | `methods/turtle.mjs#correlationLimitBreach` | GC-TUR-LIMIT6 (PASS)<br>GC-TUR-LIMIT10 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT10 | HARD/HIGH/ja | TUR-SF-LIMIT-CORR | DATA_BLOCKED | `methods/turtle.mjs#correlationLimitBreach` | GC-TUR-LIMIT6 (PASS)<br>GC-TUR-LIMIT10 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1ENT | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S1 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 12; printed 18 | TUR-INTRADAY | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S1 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 12; printed 18 | TUR-GAP | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S1 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1ENT | HARD/HIGH/ja | TUR-SF-SHORT | DATA_BLOCKED | – | – |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1SKIP | HARD/HIGH/ja | TUR-SF-S1-FILTER | SOURCE_DERIVED | `methods/turtle.mjs#createBreakoutTracker` | GC-TUR-S1-SKIP-WINNER (PASS)<br>GC-TUR-S1-TAKE-AFTER-LOSER (PASS)<br>GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT (PASS)<br>GC-TUR-S1-SHORT-COUNTS (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1LOSER | HARD/HIGH/ja | TUR-SF-S1-FILTER | SOURCE_DERIVED | `methods/turtle.mjs#createBreakoutTracker` | GC-TUR-S1-SKIP-WINNER (PASS)<br>GC-TUR-S1-TAKE-AFTER-LOSER (PASS)<br>GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT (PASS)<br>GC-TUR-S1-SHORT-COUNTS (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1DIR | HARD/HIGH/ja | TUR-SF-S1-FILTER | SOURCE_DERIVED | `methods/turtle.mjs#createBreakoutTracker` | GC-TUR-S1-SKIP-WINNER (PASS)<br>GC-TUR-S1-TAKE-AFTER-LOSER (PASS)<br>GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT (PASS)<br>GC-TUR-S1-SHORT-COUNTS (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S1SKIP | HARD/HIGH/ja | TUR-SF-S1-OPEN-BREAKOUT | SOURCE_AMBIGUOUS | `methods/turtle.mjs#entryTrigger` | SF2-TUR-OPEN-BREAKOUT-READINGS (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-FAILSAFE | HARD/HIGH/ja | TUR-SF-FAILSAFE | SOURCE_EXACT | `methods/turtle.mjs#entryTrigger` | GC-TUR-FAILSAFE (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-FAILSAFE | HARD/HIGH/ja | TUR-SF-FAILSAFE-EXIT | SOURCE_AMBIGUOUS | `methods/turtle.mjs#runTurtle` | GC-TUR-FAILSAFE (PASS)<br>SF2-TUR-FAILSAFE-EXIT-READINGS (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-ADD | HARD/HIGH/ja | TUR-SF-ADD | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS)<br>GC-TUR-ADD-GAP-FILL (PASS)<br>GC-TUR-NO-READD-AFTER-UNIT-STOP (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 14; printed 20 | TUR-ADDFAST | CONTEXTUAL/HIGH/ja | TUR-SF-ADDFAST | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 16; printed 22 | TUR-STOP | HARD/HIGH/ja | TUR-SF-STOP | SOURCE_EXACT | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-NORMAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 16; printed 22 | TUR-STOPADD | HARD/HIGH/ja | TUR-SF-STOPADD | SOURCE_EXACT | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-NORMAL (PASS)<br>GC-TUR-CRUDE-GAP (PASS)<br>GC-TUR-UNIT-STOP-EXIT (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 17; printed 23 | TUR-STOPGAP | CONTEXTUAL/HIGH/ja | TUR-SF-STOPGAP | SOURCE_DERIVED | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-GAP (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 20; printed 26 | TUR-S1EX | HARD/HIGH/ja | TUR-SF-EXIT | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-EXIT-S1 (PASS)<br>GC-TUR-ENTRY-BAR-CHANNEL-EXIT (PASS)<br>GC-TUR-ENTRY-BAR-STOP-BEFORE-CHANNEL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 23; printed 29 | TUR-RANK | HARD/HIGH/ja | TUR-SF-RANK | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-RANK (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 23; printed 29 | TUR-RANKVAR | OPTIONAL/HIGH/ja | TUR-SF-RANK | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-RANK (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF14; printed20 | TUR-SIGNAL-CONSISTENCY | HARD/HIGH/ja | TUR-SF-CONSISTENT | SOURCE_EXACT | `methods/turtle.mjs#runTurtle` | GC-TUR-NO-REGIME (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 4; printed 10 | TUR-MARKETS | HARD/HIGH/ja | TUR-SF-MARKETS | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-UNIVERSE (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 5; printed 11 | TUR-CONSISTENT | HARD/HIGH/ja | TUR-SF-MARKETS | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-UNIVERSE (PASS) |
| – | – | – | – (Konvention) | –/–/– | TUR-SF-CASH | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-NO-CASH (PASS) |

## C02 `SF_TURTLE_S2` – Original Turtles (Richard Dennis / William Eckhardt rules)

System 2 (55-day breakout, 20-day exit, no filter)

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-TR | HARD/HIGH/ja | TUR-SF-TR | SOURCE_EXACT | `methods/turtle.mjs#trueRange` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-N | HARD/HIGH/ja | TUR-SF-N | SOURCE_EXACT | `methods/turtle.mjs#turtleN` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 9; printed 15 | TUR-WEEKLY | CONTEXTUAL/HIGH/ja | TUR-SF-N-DAILY | SOURCE_DERIVED | `methods/turtle.mjs#turtleN` | GC-TUR-N (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 8; printed 14 | TUR-UNIT | HARD/HIGH/ja | TUR-SF-UNIT | SOURCE_DERIVED | `methods/turtle.mjs#unitSize` | GC-TUR-HO2002 (PASS)<br>GC-TUR-UNIT-EQUITY (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 7; printed 13 | TUR-DOLLAR | HARD/HIGH/ja | TUR-SF-UNIT | SOURCE_DERIVED | `methods/turtle.mjs#unitSize` | GC-TUR-HO2002 (PASS)<br>GC-TUR-UNIT-EQUITY (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 11; printed 17 | TUR-NOTIONAL | HARD/HIGH/ja | TUR-SF-NOTIONAL | SOURCE_DERIVED | `methods/turtle.mjs#createNotionalAccount` | GC-TUR-NOTIONAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 11; printed 17 | TUR-DRAWDOWN | HARD/HIGH/ja | TUR-SF-NOTIONAL | SOURCE_DERIVED | `methods/turtle.mjs#createNotionalAccount` | GC-TUR-NOTIONAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT4 | HARD/HIGH/ja | TUR-SF-LIMIT4 | SOURCE_EXACT | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS)<br>GC-TUR-LIMIT4 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT12 | HARD/HIGH/ja | TUR-SF-LIMIT12 | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-LIMIT12 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT6 | HARD/HIGH/ja | TUR-SF-LIMIT-CORR | DATA_BLOCKED | `methods/turtle.mjs#correlationLimitBreach` | GC-TUR-LIMIT6 (PASS)<br>GC-TUR-LIMIT10 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 10; printed 16 | TUR-LIMIT10 | HARD/HIGH/ja | TUR-SF-LIMIT-CORR | DATA_BLOCKED | `methods/turtle.mjs#correlationLimitBreach` | GC-TUR-LIMIT6 (PASS)<br>GC-TUR-LIMIT10 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S2ENT | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S2 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 12; printed 18 | TUR-INTRADAY | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S2 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 12; printed 18 | TUR-GAP | HARD/HIGH/ja | TUR-SF-ENTRY | SOURCE_DERIVED | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S2 (PASS)<br>GC-TUR-GAP-FILL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S2ENT | HARD/HIGH/ja | TUR-SF-SHORT | DATA_BLOCKED | – | – |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-S2NOSKIP | HARD/HIGH/ja | TUR-SF-S2-NOSKIP | SOURCE_EXACT | `methods/turtle.mjs#entryTrigger` | GC-TUR-ENTRY-S2 (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 13; printed 19 | TUR-ADD | HARD/HIGH/ja | TUR-SF-ADD | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS)<br>GC-TUR-ADD-GAP-FILL (PASS)<br>GC-TUR-NO-READD-AFTER-UNIT-STOP (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 14; printed 20 | TUR-ADDFAST | CONTEXTUAL/HIGH/ja | TUR-SF-ADDFAST | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-GOLD (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 16; printed 22 | TUR-STOP | HARD/HIGH/ja | TUR-SF-STOP | SOURCE_EXACT | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-NORMAL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 16; printed 22 | TUR-STOPADD | HARD/HIGH/ja | TUR-SF-STOPADD | SOURCE_EXACT | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-NORMAL (PASS)<br>GC-TUR-CRUDE-GAP (PASS)<br>GC-TUR-UNIT-STOP-EXIT (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 17; printed 23 | TUR-STOPGAP | CONTEXTUAL/HIGH/ja | TUR-SF-STOPGAP | SOURCE_DERIVED | `methods/turtle.mjs#unitStops` | GC-TUR-CRUDE-GAP (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 20; printed 26 | TUR-S2EX | HARD/HIGH/ja | TUR-SF-EXIT | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-EXIT-S2 (PASS)<br>GC-TUR-ENTRY-BAR-CHANNEL-EXIT (PASS)<br>GC-TUR-ENTRY-BAR-STOP-BEFORE-CHANNEL (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 23; printed 29 | TUR-RANK | HARD/HIGH/ja | TUR-SF-RANK | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-RANK (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 23; printed 29 | TUR-RANKVAR | OPTIONAL/HIGH/ja | TUR-SF-RANK | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-RANK (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF14; printed20 | TUR-SIGNAL-CONSISTENCY | HARD/HIGH/ja | TUR-SF-CONSISTENT | SOURCE_EXACT | `methods/turtle.mjs#runTurtle` | GC-TUR-NO-REGIME (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 4; printed 10 | TUR-MARKETS | HARD/HIGH/ja | TUR-SF-MARKETS | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-UNIVERSE (PASS) |
| W-TUR | The Original Turtle Trading Rules, 2003 participant publication mirrored at Trading Blox / en | PDF 5; printed 11 | TUR-CONSISTENT | HARD/HIGH/ja | TUR-SF-MARKETS | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-UNIVERSE (PASS) |
| – | – | – | – (Konvention) | –/–/– | TUR-SF-CASH | SOURCE_DERIVED | `methods/turtle.mjs#runTurtle` | GC-TUR-NO-CASH (PASS) |

## C03 `SF_DARVAS_BOX` – Nicolas Darvas

Later Q&A box construction, buy-stop entry and box stop method (machine component) with manual techno-fundamental layer

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q1 | HARD/HIGH/ja | DAR-SF-TOP | SOURCE_EXACT | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-TOP-CONFIRM (PASS)<br>GC-DAR-TOP-TOUCH-RESET (PASS)<br>GC-DAR-TOP-HIGHER-RESET (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q2 | HARD/HIGH/ja | DAR-SF-BOTTOM | SOURCE_DERIVED | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-BOTTOM-CONFIRM (PASS)<br>GC-DAR-BOTTOM-TOUCH-RESET (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q2 | HARD/HIGH/ja | DAR-SF-BOTTOM-START | SOURCE_AMBIGUOUS | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-BOTTOM-START-VARIANTS (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q1 | HARD/HIGH/ja | DAR-SF-TOP-EXCEEDED | SOURCE_DERIVED | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-TOP-EXCEEDED-BEFORE-BOTTOM (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q2 | HARD/HIGH/ja | DAR-SF-TOP-EXCEEDED | SOURCE_DERIVED | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-TOP-EXCEEDED-BEFORE-BOTTOM (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 204; printed 192 | DAR-Q11 | CONTEXTUAL/HIGH/ja | DAR-SF-BOX-FAIL | SOURCE_DERIVED | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-BOX-FAIL (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 196; printed 184 | DAR-Q3 | HARD/HIGH/ja | DAR-SF-NO-WAIT | SOURCE_EXACT | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-BREAKOUT-NO-WAIT (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 204; printed 192 | DAR-Q4 | HARD/HIGH/ja | DAR-SF-ENTRY | SOURCE_DERIVED | `methods/darvas.mjs#createDarvasBoxMachine` | GC-DAR-BREAKOUT-NO-WAIT (PASS)<br>GC-DAR-GAP-OPEN-FILL (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 68; printed 56 | DAR-B6 | HARD/HIGH/ja | DAR-SF-PROTECT | SOURCE_EXACT | `methods/darvas.mjs#darvasPosition` | GC-DAR-STOP-PATH (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 200; printed 188 | DAR-Q5 | HARD/HIGH/ja | DAR-SF-STOP-INIT | SOURCE_DERIVED | `methods/darvas.mjs#darvasPosition` | GC-DAR-STOP-PATH (PASS)<br>GC-DAR-ENTRY-BAR-STOP (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 205; printed 193 | DAR-Q7 | HARD/HIGH/ja | DAR-SF-STOP-INIT | SOURCE_DERIVED | `methods/darvas.mjs#darvasPosition` | GC-DAR-STOP-PATH (PASS)<br>GC-DAR-ENTRY-BAR-STOP (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 202; printed 190 | DAR-Q6 | HARD/HIGH/ja | DAR-SF-STOP-RAISE | SOURCE_DERIVED | `methods/darvas.mjs#darvasPosition` | GC-DAR-STOP-PATH (PASS)<br>GC-DAR-STOP-NEVER-LOWER (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 209; printed 197 | DAR-Q8 | HARD/HIGH/ja | DAR-SF-STOP-RAISE | SOURCE_DERIVED | `methods/darvas.mjs#darvasPosition` | GC-DAR-STOP-PATH (PASS)<br>GC-DAR-STOP-NEVER-LOWER (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 194; printed 182 | DAR-Q9 | HARD/HIGH/ja | DAR-SF-ATH | SOURCE_DERIVED | `methods/darvas.mjs#darvasScreen` | GC-DAR-ATH-GATE (PASS)<br>GC-DAR-ATH-UNVERIFIED (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 199; printed 187 | DAR-Q15 | CONTEXTUAL/HIGH/ja | DAR-SF-SPLITS | SOURCE_DERIVED | `methods/darvas.mjs#fractionFor` | GC-DAR-FRACTION (PASS) |
| – | – | – | – (Konvention) | –/–/– | DAR-SF-RESEARCH-POPULATION | SOURCE_DERIVED | `runner/run-research.mjs#componentStudy` | SF-RUN-COMPONENT (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 206; printed 194 | DAR-Q12 | STRONG_PREFERENCE/HIGH/ja | DAR-SF-REVIEW-DATA | SOURCE_DERIVED | `methods/darvas.mjs#darvasReviewData` | GC-DAR-REVIEW-DATA (PASS) |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 206; printed 194 | DAR-Q12 | STRONG_PREFERENCE/HIGH/ja | DAR-SF-SELECTION | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 210; printed 198 | DAR-Q14 | STRONG_PREFERENCE/HIGH/ja | DAR-SF-SELECTION | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 91; printed 79 | DAR-B9 | STRONG_PREFERENCE/HIGH/ja | DAR-SF-SELECTION | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 93; printed 81 | DAR-B10 | PREFERENCE/HIGH/ja | DAR-SF-SELECTION | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 94; printed 82 | DAR-B11 | PREFERENCE/HIGH/ja | DAR-SF-SELECTION | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 200; printed 188 | DAR-Q10 | CONTEXTUAL/HIGH/ja | DAR-SF-VOLUME | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 61; printed 49 | DAR-B3 | STRONG_PREFERENCE/HIGH/ja | DAR-SF-VOLUME | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 207; printed 195 | DAR-Q13 | CONTEXTUAL/HIGH/ja | DAR-SF-MARKET | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 99; printed 87 | DAR-B14 | CONTEXTUAL/HIGH/ja | DAR-SF-MARKET | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 113; printed 101 | DAR-B15 | OPTIONAL/HIGH/ja | DAR-SF-SIZING | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 137; printed 125 | DAR-B18 | CONTEXTUAL/HIGH/ja | DAR-SF-SIZING | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 71; printed 59 | DAR-B8 | CONTEXTUAL/HIGH/ja | DAR-SF-PYRAMID | MANUAL_REVIEW_REQUIRED | – | – |
| B06 | Nicolas Darvas / How I Made $2,000,000 in the Stock Market / Kensington/Lyle Stuart reprint; copyright 1994/1971/1960 / en | PDF 204; printed 192 | DAR-Q11 | CONTEXTUAL/HIGH/ja | DAR-SF-REENTRY | MANUAL_REVIEW_REQUIRED | – | – |

## C04 `SF_WEINSTEIN_INVESTOR` – Stan Weinstein

Stage 2 Investor: early Stage 2 breakout above resistance, half position at the breakout, half on a constructive pullback

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 48; printed 34 | WEIN-S2 | CONTEXTUAL/HIGH/ja | WEIN-SF-WEEKLY | SOURCE_DERIVED | `methods/weinstein.mjs#weeklyBars` | GC-WEIN-WEEKLY (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 143; printed 129 | WEIN-MA | HARD/HIGH/ja | WEIN-SF-MA-GATE | SOURCE_DERIVED | `methods/weinstein.mjs#maGate` | GC-WEIN-MA-BELOW (PASS)<br>GC-WEIN-MA-FALLING (PASS)<br>GC-WEIN-MA-OK (PASS)<br>GC-WEIN-BREAKOUT-CROSSES-MA (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 47; printed 33 | WEIN-S1 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 48; printed 34 | WEIN-S2 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 50; printed 36 | WEIN-S3 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 52; printed 38 | WEIN-S4 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 52; printed 38 | WEIN-NO3 | HARD/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 53; printed 39 | WEIN-NO4 | HARD/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-VOL | HARD/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL1 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL2 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL3 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL4 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-BASEVOL | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 122; printed 108 | WEIN-RS | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 123; printed 109 | WEIN-RSP | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 124; printed 110 | WEIN-RSZERO | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 124; printed 110 | WEIN-RSNO | HARD/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 94; printed 80 | WEIN-GROUP | HARD/HIGH/ja | WEIN-SF-GROUP | DATA_BLOCKED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 94; printed 80 | WEIN-GROUP2 | CONTEXTUAL/HIGH/ja | WEIN-SF-GROUP | DATA_BLOCKED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 143; printed 129 | WEIN-MARKET | HARD/HIGH/ja | WEIN-SF-MARKET | DATA_BLOCKED | `methods/weinstein.mjs#marketEvidence` | GC-WEIN-MARKET-EVIDENCE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-OH | HARD/HIGH/ja | WEIN-SF-OVERHEAD | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 134; printed 120 | WEIN-OHAGE | CONTEXTUAL/HIGH/ja | WEIN-SF-OVERHEAD | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 79; printed 65 | WEIN-ORD | HARD/HIGH/ja | WEIN-SF-ORDER | SOURCE_DERIVED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-INVESTOR-CANDIDATE (PASS)<br>GC-WEIN-TRADER-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 197; printed 183 | WEIN-STOP1 | HARD/HIGH/ja | WEIN-SF-STOP-PLAN | SOURCE_DERIVED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-INVESTOR-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 186; printed 172 | WEIN-AVG | HARD/HIGH/ja | WEIN-SF-NO-AVG-DOWN | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 181; printed 167 | WEIN-SELL4 | HARD/HIGH/ja | WEIN-SF-NONTECH | SOURCE_EXACT | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-NO-NONTECH-EXIT (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 73; printed 59 | WEIN-BUY1 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-BREAKOUT | SOURCE_DERIVED | `methods/weinstein.mjs#investorScreen` | GC-WEIN-INVESTOR-CANDIDATE (PASS)<br>GC-WEIN-INVESTOR-NO-BASE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 78; printed 64 | WEIN-BASE | PREFERENCE/HIGH/ja | WEIN-SF-INV-BREAKOUT | SOURCE_DERIVED | `methods/weinstein.mjs#investorScreen` | GC-WEIN-INVESTOR-CANDIDATE (PASS)<br>GC-WEIN-INVESTOR-NO-BASE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 73; printed 59 | WEIN-BUY2 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 73; printed 59 | WEIN-PB | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 73; printed 59 | WEIN-NOPB | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 152; printed 138 | WEIN-DIVERS2 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 196; printed 182 | WEIN-STOP2 | HARD/HIGH/ja | WEIN-SF-INV-STOP | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-INVESTOR-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 198; printed 184 | WEIN-TRAIL1 | CONTEXTUAL/HIGH/ja | WEIN-SF-INV-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 198; printed 184 | WEIN-TRAIL2 | CONTEXTUAL/HIGH/ja | WEIN-SF-INV-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 199; printed 185 | WEIN-TRAIL3 | CONTEXTUAL/HIGH/ja | WEIN-SF-INV-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 203; printed 189 | WEIN-TRAIL4 | CONTEXTUAL/HIGH/ja | WEIN-SF-INV-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 50; printed 36 | WEIN-SELL3 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-INV-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 251; printed 237 | WEIN-VOL5 | HARD/HIGH/ja | WEIN-SF-VOL5 | MANUAL_REVIEW_REQUIRED | – | – |

## C05 `SF_WEINSTEIN_TRADER` – Stan Weinstein

Stage 2 Trader continuation: breakout over new resistance after a consolidation near a clearly rising 30-week MA, full position, tighter trader stop

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 48; printed 34 | WEIN-S2 | CONTEXTUAL/HIGH/ja | WEIN-SF-WEEKLY | SOURCE_DERIVED | `methods/weinstein.mjs#weeklyBars` | GC-WEIN-WEEKLY (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 143; printed 129 | WEIN-MA | HARD/HIGH/ja | WEIN-SF-MA-GATE | SOURCE_DERIVED | `methods/weinstein.mjs#maGate` | GC-WEIN-MA-BELOW (PASS)<br>GC-WEIN-MA-FALLING (PASS)<br>GC-WEIN-MA-OK (PASS)<br>GC-WEIN-BREAKOUT-CROSSES-MA (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 47; printed 33 | WEIN-S1 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 48; printed 34 | WEIN-S2 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 50; printed 36 | WEIN-S3 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 52; printed 38 | WEIN-S4 | CONTEXTUAL/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 52; printed 38 | WEIN-NO3 | HARD/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 53; printed 39 | WEIN-NO4 | HARD/HIGH/ja | WEIN-SF-STAGE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-VOL | HARD/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL1 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL2 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL3 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 118; printed 104 | WEIN-VOL4 | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-BASEVOL | CONTEXTUAL/HIGH/ja | WEIN-SF-VOLUME | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#volumeAlternatives` | GC-WEIN-VOL-A (PASS)<br>GC-WEIN-VOL-C (PASS)<br>GC-WEIN-VOL-NONE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 122; printed 108 | WEIN-RS | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 123; printed 109 | WEIN-RSP | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 124; printed 110 | WEIN-RSZERO | CONTEXTUAL/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 124; printed 110 | WEIN-RSNO | HARD/HIGH/ja | WEIN-SF-RS | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#relativeStrength` | GC-WEIN-RS-BELOW-ZERO-IMPROVING (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 94; printed 80 | WEIN-GROUP | HARD/HIGH/ja | WEIN-SF-GROUP | DATA_BLOCKED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 94; printed 80 | WEIN-GROUP2 | CONTEXTUAL/HIGH/ja | WEIN-SF-GROUP | DATA_BLOCKED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 143; printed 129 | WEIN-MARKET | HARD/HIGH/ja | WEIN-SF-MARKET | DATA_BLOCKED | `methods/weinstein.mjs#marketEvidence` | GC-WEIN-MARKET-EVIDENCE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 117; printed 103 | WEIN-OH | HARD/HIGH/ja | WEIN-SF-OVERHEAD | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 134; printed 120 | WEIN-OHAGE | CONTEXTUAL/HIGH/ja | WEIN-SF-OVERHEAD | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 79; printed 65 | WEIN-ORD | HARD/HIGH/ja | WEIN-SF-ORDER | SOURCE_DERIVED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-INVESTOR-CANDIDATE (PASS)<br>GC-WEIN-TRADER-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 197; printed 183 | WEIN-STOP1 | HARD/HIGH/ja | WEIN-SF-STOP-PLAN | SOURCE_DERIVED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-INVESTOR-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 186; printed 172 | WEIN-AVG | HARD/HIGH/ja | WEIN-SF-NO-AVG-DOWN | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 181; printed 167 | WEIN-SELL4 | HARD/HIGH/ja | WEIN-SF-NONTECH | SOURCE_EXACT | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-NO-NONTECH-EXIT (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 75; printed 61 | WEIN-TR-CONT | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-TR-CONT | SOURCE_DERIVED | `methods/weinstein.mjs#traderScreen` | GC-WEIN-TRADER-CANDIDATE (PASS)<br>GC-WEIN-TRADER-MA-FLAT (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 77; printed 63 | WEIN-TR-CONT-SIZE | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-TR-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 208; printed 194 | WEIN-TR-STOP | CONTEXTUAL/HIGH/ja | WEIN-SF-TR-STOP | MANUAL_REVIEW_REQUIRED | `methods/weinstein.mjs#candidateRecord` | GC-WEIN-TRADER-CANDIDATE (PASS) |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 209; printed 195 | WEIN-TR-TRAIL | CONTEXTUAL/HIGH/ja | WEIN-SF-TR-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 208; printed 194 | WEIN-TR-EARLY | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-TR-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |
| B09 | Stan Weinstein / Secrets for Profiting in Bull and Bear Markets / 1988 reprint / en | PDF 50; printed 36 | WEIN-TR-SELL3 | STRONG_PREFERENCE/HIGH/ja | WEIN-SF-TR-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |

## C06 `SF_MINERVINI_SEPA_VCP` – Mark Minervini

SEPA: Trend Template qualification and VCP evidence as a machine screen, then manual relative-priority review

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-MIN18 | Min ervin i own interview 2018 | riskmanagement answer | MIN-W18-1 | HARD/HIGH/ja | MIN-SF-STAGGER | SOURCE_EXACT | `research/minervini-sf7.mjs#staggeredStopRisk` | SF7-MIN-STAGGER-EXACT (PASS) |
| W-MIN18 | Min ervin i own interview 2018 | fundamentals answer | MIN-W18-5 | HARD/HIGH/ja | MIN-SF-PRICE-CONFIRM | SOURCE_DERIVED | `research/minervini-lifecycle.mjs#fillBuyOrder` | SF7-MIN-PRICE-CONFIRM (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 66 | MIN-PROCESS-15 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-SIMPLE | SOURCE_DERIVED | `methods/minervini.mjs#sepaScreen` | GC-MIN-SEPA-NO-FUNDAMENTAL-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 61 | MIN-PROCESS-01 | HARD/MEDIUM/nein | MIN-SF-PROCESS | SOURCE_DERIVED | `methods/minervini.mjs#sepaScreen` | GC-MIN-SEPA-CANDIDATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-01 | HARD/MEDIUM/nein | MIN-SF-TT-1 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-1 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-02 | HARD/MEDIUM/nein | MIN-SF-TT-2 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-2 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-03 | HARD/MEDIUM/nein | MIN-SF-TT-3 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-3 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-04 | HARD/MEDIUM/nein | MIN-SF-TT-4 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-4 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-05 | HARD/MEDIUM/nein | MIN-SF-TT-5 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-5 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-06 | HARD/MEDIUM/nein | MIN-SF-TT-6 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-6 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 114 | MIN-TT-07 | HARD/MEDIUM/nein | MIN-SF-TT-7 | SOURCE_DERIVED | `methods/minervini.mjs#trendTemplate` | GC-MIN-TT-7 (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 115 | MIN-TT-08 | HARD/MEDIUM/nein | MIN-SF-TT-8 | DATA_BLOCKED | `methods/minervini.mjs#rsProxy` | GC-MIN-RS-PROXY-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 61 | MIN-PROCESS-04 | CONTEXTUAL/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-05 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-06 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-07 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-08 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-09 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-10 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 62 | MIN-PROCESS-11 | PREFERENCE/MEDIUM/nein | MIN-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 177 | MIN-EPS-01 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-FUNDAMENTALS | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 177 | MIN-EPS-02 | CONTEXTUAL/MEDIUM/nein | MIN-SF-FUNDAMENTALS | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 196 | MIN-QUALITY-01 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-FUNDAMENTALS | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 197 | MIN-QUALITY-02 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-FUNDAMENTALS | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 198 | MIN-QUALITY-03 | CONTEXTUAL/MEDIUM/nein | MIN-SF-FUNDAMENTALS | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 264 | MIN-VCP-01 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 265 | MIN-VCP-02 | CONTEXTUAL/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 266 | MIN-VCP-03 | PREFERENCE/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 266 | MIN-VCP-04 | CONTEXTUAL/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 273 | MIN-VCP-05 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 262 | MIN-BASE-01 | HARD/MEDIUM/nein | MIN-SF-VCP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#vcpEvidence` | GC-MIN-VCP-EVIDENCE-NOT-GATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 270 | MIN-VCP-07 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-PIVOT | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 256 | MIN-PRICE-01 | HARD/MEDIUM/nein | MIN-SF-PIVOT | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 61 | MIN-RISK-01 | HARD/MEDIUM/nein | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 75; respective Minervini answer | MIN-MM-STOP-01 | HARD/MEDIUM/nein | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 72; respective Minervini answer | MIN-MM-STOP-02 | HARD/MEDIUM/nein | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 409 | MIN-RISK-05 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| W-MIN18 | Min ervin i own interview 2018 | stop answer | MIN-W18-7 | STRONG_PREFERENCE/HIGH/ja | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| W-MIN18 | Min ervin i own interview 2018 | stop answer | MIN-W18-8 | CONTEXTUAL/HIGH/ja | MIN-SF-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B03 | Mark Minervini / Think & Trade Like a Champion / Vietnamese copyright 2017; printed January 2018 / vi | PDF 193; printed 186 | MIN-TTC-SIZING | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 30; respective Minervini answer | MIN-MM-SIZE-01 | HARD/MEDIUM/nein | MIN-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MIN18 | Min ervin i own interview 2018 | progressive exposure answer | MIN-W18-3 | STRONG_PREFERENCE/HIGH/ja | MIN-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MIN18 | Min ervin i own interview 2018 | progressive exposure answer | MIN-W18-4 | EXAMPLE_ONLY/HIGH/ja | MIN-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 92; respective Minervini answer | MIN-MM-SELL-01 | PREFERENCE/MEDIUM/nein | MIN-SF-SELL | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 93; respective Minervini answer | MIN-MM-SELL-02 | CONTEXTUAL/MEDIUM/nein | MIN-SF-SELL | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 90; respective Minervini answer | MIN-MM-SELL-03 | CONTEXTUAL/MEDIUM/nein | MIN-SF-SELL | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 91; respective Minervini answer | MIN-MM-SELL-04 | CONTEXTUAL/MEDIUM/nein | MIN-SF-SELL | MANUAL_REVIEW_REQUIRED | – | – |
| W-MIN18 | Min ervin i own interview 2018 | selling answer | MIN-W18-2 | CONTEXTUAL/HIGH/ja | MIN-SF-SELL | MANUAL_REVIEW_REQUIRED | – | – |

## C07 `SF_MINERVINI_POWER_PLAY` – Mark Minervini

Power Play: >= 100 % in under eight weeks starting on strong volume, then a tight consolidation that corrects no more than 20-25 %

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-MIN18 | Min ervin i own interview 2018 | riskmanagement answer | MIN-W18-1 | HARD/HIGH/ja | MIN-SF-STAGGER | SOURCE_EXACT | `research/minervini-sf7.mjs#staggeredStopRisk` | SF7-MIN-STAGGER-EXACT (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 341 | MIN-PP-01 | CONTEXTUAL/MEDIUM/nein | MIN-SF-PP-NOFUND | SOURCE_DERIVED | `methods/minervini.mjs#powerPlayScreen` | GC-MIN-PP-CANDIDATE (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 342 | MIN-PP-03 | CONTEXTUAL/MEDIUM/nein | MIN-SF-PP-DURATION | SOURCE_DERIVED | `methods/minervini.mjs#powerPlayScreen` | GC-MIN-PP-SHORT-CONSOLIDATION (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 342 | MIN-PP-02 | HARD/MEDIUM/nein | MIN-SF-PP-RUNUP | SOURCE_DERIVED | `methods/minervini.mjs#powerPlayScreen` | GC-MIN-PP-CANDIDATE (PASS)<br>GC-MIN-PP-SLOW-RUN (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 342 | MIN-PP-04 | HARD/MEDIUM/nein | MIN-SF-PP-CORRECTION | SOURCE_DERIVED | `methods/minervini.mjs#powerPlayScreen` | GC-MIN-PP-DEEP-CORRECTION (PASS)<br>GC-MIN-PP-CORRECTION-RANGE-FLAG (PASS)<br>GC-MIN-PP-MISSING-LOW (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 342 | MIN-PP-05 | HARD/MEDIUM/nein | MIN-SF-PP-TIGHT | SOURCE_DERIVED | `methods/minervini.mjs#powerPlayScreen` | GC-MIN-PP-CANDIDATE (PASS)<br>GC-MIN-PP-WIDE-REVIEW (PASS) |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 270 | MIN-VCP-07 | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-PP-ENTRY | MANUAL_REVIEW_REQUIRED | – | – |
| B12 | Mark Minervini / Trade Like a Stock Market Wizard / 2013; Indonesian machine-like translation / id | PDF 61 | MIN-RISK-01 | HARD/MEDIUM/nein | MIN-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 75; respective Minervini answer | MIN-MM-STOP-01 | HARD/MEDIUM/nein | MIN-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 72; respective Minervini answer | MIN-MM-STOP-02 | HARD/MEDIUM/nein | MIN-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| W-MIN18 | Min ervin i own interview 2018 | stop answer | MIN-W18-7 | STRONG_PREFERENCE/HIGH/ja | MIN-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| W-MIN18 | Min ervin i own interview 2018 | stop answer | MIN-W18-8 | CONTEXTUAL/HIGH/ja | MIN-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | `methods/minervini.mjs#stopCheck` | GC-MIN-STOP-10PCT-FLAG (PASS) |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 30; respective Minervini answer | MIN-MM-SIZE-01 | HARD/MEDIUM/nein | MIN-SF-PP-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B03 | Mark Minervini / Think & Trade Like a Champion / Vietnamese copyright 2017; printed January 2018 / vi | PDF 193; printed 186 | MIN-TTC-SIZING | STRONG_PREFERENCE/MEDIUM/nein | MIN-SF-PP-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MIN18 | Min ervin i own interview 2018 | progressive exposure answer | MIN-W18-3 | STRONG_PREFERENCE/HIGH/ja | MIN-SF-PP-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MIN18 | Min ervin i own interview 2018 | progressive exposure answer | MIN-W18-4 | EXAMPLE_ONLY/HIGH/ja | MIN-SF-PP-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| B07 | Mark Minervini; David Ryan; Dan Zanger; Mark Ritchie II / Momentum Masters / 2015 original; 2021 Indonesian translation file / id | PDF 92; respective Minervini answer | MIN-MM-SELL-01 | PREFERENCE/MEDIUM/nein | MIN-SF-PP-EXIT | MANUAL_REVIEW_REQUIRED | – | – |

## C08 `SF_KK_BREAKOUT` – Kristjan Kullamaegi

Common Breakout, written daily alternative (KK-011); opening-range-high branch DATA_BLOCKED

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | ADR formula | KK-031 | HARD/HIGH/ja | KK-SF-ADR | SOURCE_EXACT | `methods/kullamagi.mjs#adr20` | GC-KK-ADR20 (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | opening risk note | KK-001 | HARD/HIGH/ja | KK-SF-CAP | SOURCE_EXACT | `methods/kullamagi.mjs#overnightCap` | GC-KK-CAP-30 (PASS) |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | stopmarket question | KK-027 | HARD/HIGH/ja | KK-SF-STOPMARKET | SOURCE_EXACT | `methods/kullamagi.mjs#stopMarketFill` | GC-KK-STOP-MARKET-GAP (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-04-13 16:07 to enumerated six-factor question | KK-048 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-02-09 16:22 c1 | KK-049 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-002 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-003 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-004 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | Howmuchrisk | KK-025 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | position size | KK-026 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Breakouts:steps1–3 | KK-005 | PREFERENCE/HIGH/ja | KK-SF-BO-MOMENTUM | SOURCE_DERIVED | `methods/kullamagi.mjs#momentumRanks` | GC-KK-MOMENTUM-RANK-NOT-GATE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-07-29 04:20 | KK-054 | CONTEXTUAL/HIGH/ja | KK-SF-BO-MOMENTUM | SOURCE_DERIVED | `methods/kullamagi.mjs#momentumRanks` | GC-KK-MOMENTUM-RANK-NOT-GATE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Breakouts:criteria1 | KK-006 | PREFERENCE/HIGH/ja | KK-SF-BO-SETUP | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#breakoutEvidence` | GC-KK-SETUP-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Breakouts:criteria2 | KK-007 | STRONG_PREFERENCE/HIGH/ja | KK-SF-BO-SETUP | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#breakoutEvidence` | GC-KK-SETUP-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Breakouts:criteria3 | KK-008 | CONTEXTUAL/HIGH/ja | KK-SF-BO-SETUP | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#breakoutEvidence` | GC-KK-SETUP-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Breakouts:criteria3 | KK-009 | STRONG_PREFERENCE/HIGH/ja | KK-SF-BO-SETUP | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#breakoutEvidence` | GC-KK-SETUP-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | HowtoTrade1 | KK-011 | OPTIONAL/HIGH/ja | KK-SF-BO-ENTRY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | HowtoTrade1 | KK-010 | OPTIONAL/HIGH/ja | KK-SF-BO-ORH | DATA_BLOCKED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | HowtoTrade2 | KK-012 | HARD/HIGH/ja | KK-SF-BO-STOP | SOURCE_EXACT | `methods/kullamagi.mjs#breakoutStopCheck` | GC-KK-STOP-ACCEPT (PASS)<br>GC-KK-STOP-REJECT-WIDE (PASS)<br>GC-KK-STOP-NO-CLAMP (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | HowtoTrade3 | KK-013 | PREFERENCE/HIGH/ja | KK-SF-BO-PARTIAL | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | HowtoTrade3 | KK-014 | PREFERENCE/HIGH/ja | KK-SF-BO-TRAIL | MANUAL_REVIEW_REQUIRED | – | – |

## C09 `SF_KK_EPISODIC_PIVOT` – Kristjan Kullamaegi

Episodic Pivot: 10 %+ gap on an unexpected significant catalyst with exceptional early volume; ORH entry, low-of-day stop

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | ADR formula | KK-031 | HARD/HIGH/ja | KK-SF-ADR | SOURCE_EXACT | `methods/kullamagi.mjs#adr20` | GC-KK-ADR20 (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | opening risk note | KK-001 | HARD/HIGH/ja | KK-SF-CAP | SOURCE_EXACT | `methods/kullamagi.mjs#overnightCap` | GC-KK-CAP-30 (PASS) |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | stopmarket question | KK-027 | HARD/HIGH/ja | KK-SF-STOPMARKET | SOURCE_EXACT | `methods/kullamagi.mjs#stopMarketFill` | GC-KK-STOP-MARKET-GAP (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-04-13 16:07 to enumerated six-factor question | KK-048 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-02-09 16:22 c1 | KK-049 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-002 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-003 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-004 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | Howmuchrisk | KK-025 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | position size | KK-026 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | EP description | KK-015 | STRONG_PREFERENCE/HIGH/ja | KK-SF-EP-GAP | SOURCE_DERIVED | `methods/kullamagi.mjs#epGapEvidence` | GC-KK-EP-GAP-EVIDENCE (PASS) |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | types;recentstudy | KK-035 | STRONG_PREFERENCE/HIGH/ja | KK-SF-EP-SIDEWAYS | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#epGapEvidence` | GC-KK-EP-GAP-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | EP description | KK-015 | STRONG_PREFERENCE/HIGH/ja | KK-SF-EP-CATALYST | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | Differenttypes | KK-038 | CONTEXTUAL/HIGH/ja | KK-SF-EP-CATALYST | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | earningsEP | KK-039 | CONTEXTUAL/HIGH/ja | KK-SF-EP-CATALYST | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | earningsEP | KK-040 | PREFERENCE/HIGH/ja | KK-SF-EP-CATALYST | DATA_BLOCKED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | EP description | KK-016 | STRONG_PREFERENCE/HIGH/ja | KK-SF-EP-VOLUME | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | EPdefinition | KK-037 | PREFERENCE/HIGH/ja | KK-SF-EP-VOLUME | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | HowtoBuy | KK-032 | PREFERENCE/HIGH/ja | KK-SF-EP-ENTRY | DATA_BLOCKED | – | – |
| W-KKEP | Kristjan Kullamägi / How to master Episodic Pivots / en | HowtoBuy | KK-034 | HARD/HIGH/ja | KK-SF-EP-STOP | SOURCE_EXACT | `methods/kullamagi.mjs#epStopCheck` | GC-KK-EP-STOP-ACCEPT (PASS)<br>GC-KK-EP-STOP-REJECT (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | EP howto2;criteria5 | KK-017 | CONTEXTUAL/HIGH/ja | KK-SF-EP-EXIT | SOURCE_AMBIGUOUS | – | – |

## C10 `SF_KK_PARABOLIC_SHORT` – Kristjan Kullamaegi

Parabolic Short: accelerated up-move; ORL / first red 5-minute candle / failed VWAP retest entry; high of day or VWAP reclaim as risk; cover toward the 10 / 20-day MA

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | ADR formula | KK-031 | HARD/HIGH/ja | KK-SF-ADR | SOURCE_EXACT | `methods/kullamagi.mjs#adr20` | GC-KK-ADR20 (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | opening risk note | KK-001 | HARD/HIGH/ja | KK-SF-CAP | SOURCE_EXACT | `methods/kullamagi.mjs#overnightCap` | GC-KK-CAP-30 (PASS) |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | stopmarket question | KK-027 | HARD/HIGH/ja | KK-SF-STOPMARKET | SOURCE_EXACT | `methods/kullamagi.mjs#stopMarketFill` | GC-KK-STOP-MARKET-GAP (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-04-13 16:07 to enumerated six-factor question | KK-048 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | own reply 2021-02-09 16:22 c1 | KK-049 | PREFERENCE/HIGH/ja | KK-SF-PRIORITY | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-002 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-003 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | risk note | KK-004 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | Howmuchrisk | KK-025 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | position size | KK-026 | CONTEXTUAL/HIGH/ja | KK-SF-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Parabolic shorts1–3 | KK-018 | STRONG_PREFERENCE/HIGH/ja | KK-SF-PS-ACCEL | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#parabolicEvidence` | GC-KK-PS-EVIDENCE (PASS) |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Parabolic shorts howto1 | KK-020 | OPTIONAL/HIGH/ja | KK-SF-PS-ENTRY | DATA_BLOCKED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Parabolic shorts howto1 | KK-021 | OPTIONAL/HIGH/ja | KK-SF-PS-ENTRY | DATA_BLOCKED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Parabolic shorts howto2 | KK-022 | CONTEXTUAL/HIGH/ja | KK-SF-PS-STOP | DATA_BLOCKED | – | – |
| W-KKFAQ | Kristjan Kullamägi / FAQ / en | borrow question | KK-030 | CONTEXTUAL/HIGH/ja | KK-SF-PS-BORROW | DATA_BLOCKED | – | – |
| W-KK3 | Kristjan Kullamägi / Three timeless setups / en | Parabolic shorts howto3 | KK-023 | PREFERENCE/HIGH/ja | KK-SF-PS-TARGET | MANUAL_REVIEW_REQUIRED | `methods/kullamagi.mjs#parabolicEvidence` | GC-KK-PS-EVIDENCE (PASS) |

## C11 `SF_MOKA_POCKET_PIVOT` – Gil Morales / Chris Kacher

Pocket Pivot volume signature (machine) with manual chart / fundamental context and exits

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule3 | MOKAPP-003 | HARD/HIGH/ja | MOKA-SF-PP-VOLUME | SOURCE_EXACT | `methods/morales-kacher.mjs#pocketPivotAt` | GC-PP-SIGNATURE (PASS)<br>GC-PP-EQUAL-NOT-GREATER (PASS)<br>GC-PP-WINDOW-10 (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule3 | MOKAPP-003 | HARD/HIGH/ja | MOKA-SF-PP-DOWNDAY | SOURCE_DERIVED | `methods/morales-kacher.mjs#pocketPivotAt` | GC-PP-NO-DOWN-DAY (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule3 | MOKAPP-003 | HARD/HIGH/ja | MOKA-SF-PP-UPDAY | SOURCE_DERIVED | `methods/morales-kacher.mjs#pocketPivotAt` | GC-PP-DOWN-DAY-REJECT (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule1 | MOKAPP-001 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule2 | MOKAPP-002 | PREFERENCE/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule4/5 | MOKAPP-004 | CONTEXTUAL/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule6 | MOKAPP-006 | CONTEXTUAL/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule7 | MOKAPP-007 | CONTEXTUAL/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule8 | MOKAPP-008 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule9 | MOKAPP-009 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule10 | MOKAPP-010 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-PP-CONTEXT | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#pocketPivotScreen` | GC-PP-EXTENSION-IS-EVIDENCE (PASS) |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule4/5 | MOKAPP-004 | CONTEXTUAL/HIGH/ja | MOKA-SF-PP-STOP | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKAPP | Official Ten Pocket Pivot Rules | rule2 | MOKAPP-002 | PREFERENCE/HIGH/ja | MOKA-SF-PP-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-008 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-MA | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2/3 | MOKASTOP-001 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-MA | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-009 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-VIOLATION | SOURCE_AMBIGUOUS | `methods/morales-kacher.mjs#maViolationEvidence` | GC-MOKA-MA-VIOLATION-BOTH-READINGS (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2 | MOKASTOP-002 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-VIOLATION | SOURCE_AMBIGUOUS | `methods/morales-kacher.mjs#maViolationEvidence` | GC-MOKA-MA-VIOLATION-BOTH-READINGS (PASS) |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-008 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-GUIDE-EVIDENCE | SOURCE_DERIVED | `methods/morales-kacher.mjs#sellGuideEvidence` | GC-MOKA-SELL-GUIDE-RESPECTED (PASS)<br>GC-MOKA-SELL-GUIDE-READINGS-DIFFER (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2/3 | MOKASTOP-001 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-GUIDE-EVIDENCE | SOURCE_DERIVED | `methods/morales-kacher.mjs#sellGuideEvidence` | GC-MOKA-SELL-GUIDE-RESPECTED (PASS)<br>GC-MOKA-SELL-GUIDE-READINGS-DIFFER (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph3 | MOKASTOP-003 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph3 | MOKASTOP-004 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph4 | MOKASTOP-005 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |

## C12 `SF_MOKA_BUYABLE_GAP_UP` – Gil Morales / Chris Kacher

Buyable Gap-Up: gap >= 0.75 x ATR40 with standard volume 1.5x (megacap exception), gap-day low as sell guide

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-004 | HARD/HIGH/ja | MOKA-SF-BGU-GAP | SOURCE_EXACT | `methods/morales-kacher.mjs#gapUpAt` | GC-BGU-CANDIDATE (PASS)<br>GC-BGU-GAP-BELOW (PASS) |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-004 | HARD/HIGH/ja | MOKA-SF-BGU-GAP-MEASURE | SOURCE_DERIVED | `methods/morales-kacher.mjs#gapUpAt` | GC-BGU-ATR40-NO-SAME-DAY (PASS) |
| W-MOKAV24 | Gil Morales own Voo Doo Report | MCDparagraph | MOKA24-VOL | HARD/HIGH/ja | MOKA-SF-BGU-VOLUME | SOURCE_EXACT | `methods/morales-kacher.mjs#gapUpAt` | GC-BGU-VOLUME-1-5-EXACT (PASS) |
| W-MOKAV24 | Gil Morales own Voo Doo Report | MCDparagraph | MOKA24-VOL | HARD/HIGH/ja | MOKA-SF-BGU-VOLWINDOW | SOURCE_AMBIGUOUS | `methods/morales-kacher.mjs#gapUpAt` | GC-BGU-VOLUME-1-5-EXACT (PASS) |
| W-MOKAV24 | Gil Morales own Voo Doo Report | MCDparagraph | MOKA24-MEGA | CONTEXTUAL/HIGH/ja | MOKA-SF-BGU-MEGA | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#gapUpAt` | GC-BGU-MCD-EXCEPTION (PASS) |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-003 | PREFERENCE/HIGH/ja | MOKA-SF-BGU-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-006 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-BGU-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-007 | STRONG_PREFERENCE/HIGH/ja | MOKA-SF-BGU-SELLGUIDE | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#buyableGapUpScreen` | GC-BGU-SELL-GUIDE (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph5 | MOKASTOP-006 | PREFERENCE/HIGH/ja | MOKA-SF-BGU-SELLGUIDE | MANUAL_REVIEW_REQUIRED | `methods/morales-kacher.mjs#buyableGapUpScreen` | GC-BGU-SELL-GUIDE (PASS) |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF35 | MOKA12-003 | PREFERENCE/HIGH/ja | MOKA-SF-BGU-SIZE | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-008 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-MA | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2/3 | MOKASTOP-001 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-MA | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-009 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-VIOLATION | SOURCE_AMBIGUOUS | `methods/morales-kacher.mjs#maViolationEvidence` | GC-MOKA-MA-VIOLATION-BOTH-READINGS (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2 | MOKASTOP-002 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-VIOLATION | SOURCE_AMBIGUOUS | `methods/morales-kacher.mjs#maViolationEvidence` | GC-MOKA-MA-VIOLATION-BOTH-READINGS (PASS) |
| W-MOKA12 | Chris Kacher own Traders Expo London 2012 presentation | PDF50 | MOKA12-008 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-GUIDE-EVIDENCE | SOURCE_DERIVED | `methods/morales-kacher.mjs#sellGuideEvidence` | GC-MOKA-SELL-GUIDE-RESPECTED (PASS)<br>GC-MOKA-SELL-GUIDE-READINGS-DIFFER (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph2/3 | MOKASTOP-001 | PREFERENCE/HIGH/ja | MOKA-SF-EXIT-GUIDE-EVIDENCE | SOURCE_DERIVED | `methods/morales-kacher.mjs#sellGuideEvidence` | GC-MOKA-SELL-GUIDE-RESPECTED (PASS)<br>GC-MOKA-SELL-GUIDE-READINGS-DIFFER (PASS) |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph3 | MOKASTOP-003 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph3 | MOKASTOP-004 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |
| W-MOKASTOP | Official Mo Kastop FAQ | paragraph4 | MOKASTOP-005 | CONTEXTUAL/HIGH/ja | MOKA-SF-EXIT-CONTEXT | MANUAL_REVIEW_REQUIRED | – | – |

## C13 `SF_RASCHKE_HOLY_GRAIL` – Linda Raschke

Holy Grail disclosed setup component: first pullback to the 20 EMA after ADX(14) > 30 on the same (daily) timeframe

| Quelle | Ausgabe | Seite | #709-Regel | Modalität/Conf./geprüft | Ausführbare Regel | Status | Code | Tests (Ergebnis) |
|---|---|---|---|---|---|---|---|---|
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-002 | HARD/HIGH/ja | RAS-SF-ADX | SOURCE_EXACT | `methods/holy-grail.mjs#adx` | GC-RAS-ADX-WILDER (PASS)<br>GC-RAS-ADX-BELOW-30 (PASS) |
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-001 | STRONG_PREFERENCE/HIGH/ja | RAS-SF-PULLBACK | SOURCE_DERIVED | `methods/holy-grail.mjs#holyGrailScreen` | GC-RAS-FIRST-PULLBACK (PASS)<br>GC-RAS-SECOND-PULLBACK-NOT-FIRST (PASS) |
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF3;ownquote | RAS04-004 | HARD/HIGH/ja | RAS-SF-OSC | SOURCE_EXACT | `methods/holy-grail.mjs#oscillator310` | GC-RAS-OSC-310 (PASS) |
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-005 | PREFERENCE/HIGH/ja | RAS-SF-OSC-HIGH | MANUAL_REVIEW_REQUIRED | – | – |
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-006 | CONTEXTUAL/HIGH/ja | RAS-SF-TIMEFRAME | SOURCE_DERIVED | `methods/holy-grail.mjs#holyGrailScreen` | GC-RAS-FIRST-PULLBACK (PASS) |
| W-RAS04 (Primärquelle schweigt; Sekundärquelle W-RAS97, D-RAS97 2026-10-23) | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-001 | STRONG_PREFERENCE/HIGH/ja | RAS-SF-ENTRY | SOURCE_DERIVED | `research/holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER` | GC-SF5-HG-RESEARCH-VARIANT (PASS)<br>SF5-OD-RAS97-SECONDARY-SOURCE (PASS) |
| W-RAS04 (Primärquelle schweigt; Sekundärquelle W-RAS97, D-RAS97 2026-10-23) | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-001 | STRONG_PREFERENCE/HIGH/ja | RAS-SF-STOP | SOURCE_DERIVED | `research/holy-grail-lifecycle.mjs#holyGrailSetupSeries` | GC-SF5-HG-RESEARCH-VARIANT (PASS)<br>SF5-OD-RAS97-SECONDARY-SOURCE (PASS) |
| W-RAS04 | Ra sch ke own quoted 2004 interview on own website | PDF4;ownquote | RAS04-003 | PREFERENCE/HIGH/ja | RAS-SF-EXIT | MANUAL_REVIEW_REQUIRED | – | – |
| – | – | – | – (Konvention) | –/–/– | RAS-SF-SIZE | SOURCE_AMBIGUOUS | – | – |

