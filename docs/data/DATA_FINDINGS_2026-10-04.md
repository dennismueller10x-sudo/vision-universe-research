# Datenbefunde 04.10.2026: LOGI, gesperrte Bereinigungsstufen, Fundamentals-Abweichung −22 / −8

Alle Zahlen sind gemessen, nicht geschätzt:
- Bars nur lesend aus der dauerhaften Ablage, Workflow `diagnose-adjustment-steps.yml` mit Lauf 37175583706 (LOGI, AAPL, MSFT) und Lauf 37176153540 (alle 30 gesperrten Titel).
- Universum, Namensschicht und `market-capability` aus `main` (`ced259314b`) bzw. vor #366 (`891270d2d7^`).

---

## 1. LOGI: warum `unexplained_adjustment_step`?

**Gate:** `quant/engines/market-quality.js#validateAdjustmentConsistency` meldet einen Fehler, wenn sich der Bereinigungsfaktor `adjustedClose / close` an einem Tag ohne gemeldeten Split und ohne gemeldete Bardividende um mehr als 0,2 % ändert. Die Tiingo-Konvention ist `step = splitFactor · (1 + divCash / close)`.

**Bars um den Sprung (Ablage, Anbieter Tiingo):**

| Datum | close | adjustedClose | Faktor | divCash |
|---|---|---|---|---|
| 2026-09-17 | 102,54 | 99,3947 | 0,96933 | 0 |
| 2026-09-18 | 101,20 | 98,0958 | 0,96933 | 0 |
| **2026-09-21** | 105,12 | 103,4988 | **0,98458** | **0** |
| **2026-09-22** | 105,82 | 105,82 | **1,00000** | **1,657556** |
| 2026-09-23 | 104,65 | 104,65 | 1,00000 | 0 |

- **2026-09-22:** Faktorsprung +1,566 % = `1,657556 / 105,82`. Das ist exakt die gemeldete Dividende, also **erklärt**.
- **2026-09-21:** Faktorsprung **+1,5734 %** ohne gemeldete Dividende. Er entspräche einer Dividende von 1,654 USD, also derselben Ausschüttung noch einmal. Das ist der **unerklärte** Sprung.

**Vorjahre (gemeldete Dividenden):**

| Jahr | Einträge |
|---|---|
| 2012 bis 2023 | je **eine** Dividende im Jahr |
| 2024 | 2024-09-23 **1,365** und 2024-09-24 **1,368658** |
| 2025 | 2025-09-22 **1,585** und 2025-09-23 **1,59121** |
| 2026 | 2026-09-22 1,657556; der Faktorsprung am 2026-09-21 hat **keine** Meldung |

**Root Cause (belegt):** Der Anbieter verbucht die Logitech-Jahresdividende seit 2024 **doppelt**, an zwei aufeinanderfolgenden Handelstagen mit leicht verschiedenen Beträgen.
- 2024 und 2025 standen beide Buchungen in `divCash`. Das Gate hat sie als „erklärt“ akzeptiert, die Gesamtrendite-Reihe zählt die Dividende dort also doppelt.
- 2026 fehlt die `divCash`-Meldung für den ersten der beiden Tage, die Bereinigung ist aber trotzdem in `adjustedClose` enthalten.

**Was es nicht ist:**
- Kein Split und keine fehlende Corporate Action in unserer Pipeline. Unsere Pipeline speichert `adjustedClose` und `divCash` wie geliefert und rechnet `adjustedClose` nicht selbst.
- Der Faktor vor dem 21.09. trägt beide Stufen. Die Reihe wurde also nach dem 22.09. vom Anbieter neu ausgeliefert, und auch diese Auslieferung enthält beide Stufen.

**Entscheidung nach Owner-Regel:** Der Anbieter ist inkonsistent, deshalb werden **keine Daten erfunden**.
- **Das Gate sperrt LOGI korrekt**, die Sperre bleibt bestehen.
- Robuste Behandlung: #418 weist den Zustand im Supertrader-Build aus (`discoverAvailability.unavailable`). Die Supertrader-Aktienseite zeigt einen Hinweis statt eines toten Links.
- Keine Sonderregel `ticker === LOGI`.

**Nebenbefund:** Die Gesamtrendite von LOGI für 2024 und 2025 enthält je eine Dividende doppelt, etwa +1,5 % p. a. zu viel. Eine Regel „zwei Dividenden an benachbarten Handelstagen“ als Warnung in `market-quality.js` wäre eine Methodikänderung mit eigener Version und ist **nicht** Teil dieser Arbeit (Restliste).

---

## 2. Alle 30 vom Faktorlauf gesperrten Titel (`unexplained_adjustment_step`)

Die Klassifikation kommt aus `scripts/diagnose/adjustment-steps.mjs --blocked` (`classifyStep`).

| Klasse | Titel | Befund |
|---|---|---|
| **Doppelte Dividendenbereinigung** | LOGI | siehe oben |
| **Ausschüttungen nur in `adjustedClose`, nicht in `divCash`** | AIZN (22), AMJB (9), AOMN (7), BEPH (20), BEPI (16), BEPJ (9), CIMP (3), EASY (10), FGSN (6), GJO (171), GJT (129), HCXY (32), KTN (100), MFAO (9), NRUC (26), PMTV (4), RILYN (28), SAZ (13), SFB (25), TCPA (1), TVE (158), TWOD (5) | Regelmäßige Stufen von 0,4–2,4 % in Kupon- oder Ausschüttungsrhythmus, bei 0–2 gemeldeten Dividenden. Typisch für Vorzugsaktien, Baby Bonds und Trust-Zertifikate: Der Anbieter bereinigt um Ausschüttungen, ohne sie in `divCash` zu führen. |
| **Einzelne historische Stufe** | APD (2016-10-03, +9,37 %) | Datum der Abspaltung von Versum Materials. Eine Corporate Action, die weder Split noch Bardividende ist; das Gate kennt diesen Typ nicht. |
| | ADTN (2023-08-16, −1,09 %), BRN (2023-08-21, −0,61 %), ESOA (2016-06-14, +3,33 %), FSOL (2026-06-23, +0,44 %), THRM (1995-01-20, −97,5 %), TTE (2008-05-30, +1,40 %) | Einzelne unerklärte Stufen; die Ursache ist ohne Anbieter-Corporate-Action-Daten nicht belegbar. |

**Bewertung:** In allen 30 Fällen sperrt das Gate **korrekt**, denn die bereinigte Reihe ist mit den gemeldeten Corporate Actions nicht konsistent.
- Für die 22 Ausschüttungsfälle wäre eine eigene Behandlung von Ausschüttungen ohne `divCash` eine Methodikentscheidung (Restliste, Owner).
- APD bräuchte einen Corporate-Action-Typ „Spin-off“.

---

## 3. Fundamentals-Gate: Abweichung −22 / −8

**Gate:** `sec-fundamentals-universe.yml`, Schritt „Der Abgleich trifft den abgenommenen Marktdatenstand“.

| | abgenommen (Lauf 34611793308, neu gerechnet 2026-09-20 gegen 6.875 Titel) | heute | Δ |
|---|---|---|---|
| Produkttitel | 6.875 | 6.853 | −22 |
| `HISTORICAL_CHART_AVAILABLE` | 6.871 | 6.849 | **−22** |
| `TECHNICAL_HISTORY_ELIGIBLE` | 5.884 | 5.876 | **−8** |

**Ursache, vollständig:** Seit der Abnahme hat sich das Produktuniversum genau einmal geändert, durch **#366** („Schuldverschreibungen sind keine Aktien: Klasse DEBT aus der Namensschicht“, `891270d2d7`). Universum und `market-capability.json` vor und nach #366 im Vergleich:
- **22 Titel** gingen von `ELIGIBLE`, `SEPARATE_CLASS` oder `REVIEW` auf `EXCLUDED` (`CONFIRMED_NON_EQUITY:DEBT`).
- **0 Titel** kamen hinzu.
- **0** der übrigen 6.853 Mitglieder haben sich in irgendeinem Feld verändert.
- Alle 22 hatten eine Kurshistorie (`ph = true`), daher −22.
- 8 davon waren `TECHNICAL_READY` (CICB, CIMN, DCOMG, MFAN, MFICL, MHNC, RWTN, UNMA), daher −8.

| Titel | vorher → nachher | Klasse vorher → nachher | technisch vorher | Namensbeleg (Namensschicht, TIINGO_METADATA) | CIK | Klasse |
|---|---|---|---|---|---|---|
| ADAMH | SEPARATE_CLASS → EXCLUDED | TRUST → DEBT | zu kurz | Adamas Trust Inc 9.875 Senior Notes Due 2030 | 0001273685 | **B** |
| BNH | REVIEW → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Brookfield Finance Inc 4.625 Subordinated Notes due October 16 2080 | 0001001085 | **B** |
| CICB | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | CION Investment Corporation 7.50 Notes due 2029 | 0001534254 | **B** |
| CIMN | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | Chimera Investment Corporation 9.000 Senior Notes due 2029 | 0001409493 | **B** |
| CTGG | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Qwest Corporation 6.500 Senior Notes due 2051 | 0000068622 | **B** |
| CTHH | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Qwest Corporation 6.750 Senior Notes due 2052 | 0000068622 | **B** |
| DCOMG | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | Dime Community Bancshares 9.000 Fixed-to-Floating Subordinated Notes due 2034 | – | **B** |
| MFAN | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | MFA Financial Inc 8.875 Senior Notes due 2029 | 0001055160 | **B** |
| MFICL | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | MidCap Financial Investment Corporation 8.00 Notes due 2028 | 0001278752 | **B** |
| MHNC | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | Maiden Holdings North American Ltd 7.75 Notes 2043 | 0001412100 | **B** |
| PRHIZ | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Presurance Holdings Inc Sr Nt | 0001502292 | **B** |
| RWTN | SEPARATE_CLASS → EXCLUDED | TRUST → DEBT | **bereit** | Redwood Trust Inc 9.125 Senior Notes Due 2029 | 0000930236 | **B** |
| SAX | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Saratoga Investment Corp 8.00 Notes due 2031 | 0001377936 | **B** |
| SRJN | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Spire Inc 6.375 Junior Subordinated Notes due 2086 | 0001126956 | **B** |
| SSSSL | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | SuRo Capital Corp 6.00 Notes due 2026 | – | **B** |
| TMUSI | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | T-Mobile US Inc 5.500 Senior Notes due June 2070 | 0001283699 | **B** |
| TMUSL | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | T-Mobile US Inc 6.250 Senior Notes due 2069 | 0001283699 | **B** |
| TMUSZ | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | T-Mobile US Inc 5.500 Senior Notes due March 2070 | 0001283699 | **B** |
| TPTS | SEPARATE_CLASS → EXCLUDED | TRUST → DEBT | zu kurz | Terra Property Trust Inc 7.00 Senior Secured Notes due 2029 | 0001674356 | **B** |
| TRINI | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Trinity Capital Inc 7.875 Notes Due 2029 | – | **B** |
| TRINZ | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | zu kurz | Trinity Capital Inc 7.875 Notes due 2029 | – | **B** |
| UNMA | ELIGIBLE → EXCLUDED | EQUITY_COMMON → DEBT | **bereit** | Unum Group 6.250 Junior Subordinated Notes due 2058 | 0000005513 | **B** |

**Klassifikation:**

| Klasse | Anzahl |
|---|---|
| A, legitime Markt- oder Universumsänderung | 0 |
| **B, erwartete Folge einer freigegebenen Methodikänderung (#366, gemergt)** | **22 (−22 Kurshistorie, davon −8 technisch)** |
| C, Datenqualitätsproblem | 0 |
| D, unklar | 0 |

Ausgeschlossen sind damit: Delisting, Neulisting, CIK-Mapping, fehlende SEC-Daten, Aktienklasse, ADR, Share-Dedupe, Corporate Action, Datenverlust und Pipeline-Regression. Kein anderes Mitglied hat sich verändert, und kein Titel hat eine Kurshistorie verloren. Die 22 Instrumente bleiben in Stamm und Suche; die Stammaktien der Emittenten (TMUS, UNM, MFA, CIM …) sind unverändert im Universum.

**Vorschlag (Owner-Entscheidung):** Die gesamte Abweichung gehört in Klasse B. Der Referenzstand kann deshalb mit dem dafür vorgesehenen Weg auf 6.853 / 6.849 / 5.876 gesetzt werden:
- Workflow `coverage-metrics.yml` (lesend, 0 Kursabfragen, 0 R2-Schreibvorgänge) rechnet die abgenommenen Kennzahlen gegen das aktuelle Produktuniversum neu, wie zuletzt am 2026-09-20 (Lauf 35493503241).
- **Keine** Codeänderung am Gate, keine Schwellenänderung.
- Bis zur Freigabe bleibt das Gate rot.

---

## 4. Werkzeug

`scripts/diagnose/adjustment-steps.mjs` und `.github/workflows/diagnose-adjustment-steps.yml`:
- Nur lesend, `contents: read`, Bericht als Artefakt.
- `--tickers A,B` oder leer für alle vom letzten Faktorlauf gesperrten Titel.
- Für jede Sperre `unexplained_adjustment_step` liefert es Datum, Rohkurs, bereinigten Kurs, Faktor, gemeldete Aktionen, die Dividende, die den Sprung erklären würde, und die Einordnung.
