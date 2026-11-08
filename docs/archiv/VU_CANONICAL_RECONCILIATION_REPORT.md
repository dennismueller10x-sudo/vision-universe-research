# ACCEPTANCE REPORT — CANONICAL R2 × FUNDAMENTALS RECONCILIATION

Die finale, **pro Instrument nachrechenbare** Cross-Data-Coverage des
Vision-Universe-Produktuniversums.

Marktdaten wurden ausschließlich **read-only** konsumiert: null
Kursanfragen, null R2-Schreibzugriffe, keine Eligibility neu gerechnet,
kein Fundamental-Backfill, kein Provider integriert, keine
Frontend-Arbeit.

---

## 0 — DER ANSCHLUSS

Die kanonische Quelle lag im Repository, auf dem Zweig des
R2-Workstreams: Commit `0b7d09a` („Eignungsschicht und drei
Deckungskennzahlen", Lauf `34611793308`). Übernommen mit Herkunftsvermerk
(`quant/data/market/history/CANONICAL_SOURCE.json`):

- `coverage-metrics.json` — die drei abgenommenen Kennzahlen
- `technical-coverage-ELIGIBLE_US_EQUITY.json` — Zustand je Titel
- `universe-ELIGIBLE_US_EQUITY.json` — die kanonischen 7.004

**Warum sich daraus eine Aussage je Titel gewinnen lässt:** beide
Berichte führen ihre **Ausnahmen namentlich** — sieben nicht
darstellbare Titel, 1.041 technisch zu kurze. Wer im Produktuniversum
steht und in keiner Ausnahmeliste, ist gedeckt. Das ist die Umkehrung
einer vollständigen Aufzählung, keine Schätzung. Zwei Tests prüfen, dass
die Listen aufgehen — fällt das, fällt die ganze Konstruktion, und zwar
still.

### Identitätsjoin

```
securityId  ==  masterMemberId  →  issuerId (= iss_cik_<CIK>)  →  CIK
 (Market)         (Universum)          (Fundamentals)            (SEC)
```

Geprüft über alle **7.004 von 7.004** Titel, ohne Abweichung und ohne
abweichendes Kürzel. Das Ticker ist nie alleiniger Schlüssel.

### Abgleich gegen den abgenommenen Stand

| | abgenommen | gerechnet | Δ |
|---|---:|---:|---:|
| `HISTORICAL_CHART_AVAILABLE` | 6.997 | 6.997 | **0** |
| `TECHNICAL_HISTORY_ELIGIBLE` | 5.963 | 5.963 | **0** |

`reconciled: true`. Kein neuer Nenner.

`R2_SERIES_AVAILABLE = 7.802` zählt gegen den
**Wertpapierstamm (7.803)**, nicht gegen das Produktuniversum — es ist die
Ablagedeckung und keine Produktkennzahl. Sie wird geführt und **nicht** in
die Schnittmengen gerechnet.

---

## 1 — UNIVERSE

| | Titel |
|---|---:|
| `PRODUCT_TITLES` | **7.004** |

## 2 — MARKET

| | Titel |
|---|---:|
| `R2_HISTORY_AVAILABLE` | **6.997** |
| `R2_HISTORY_UNAVAILABLE` | 7 |
| `TECHNICAL_HISTORY_ELIGIBLE` | **5.963** |
| `TECHNICAL_INSUFFICIENT_HISTORY` | 1.041 |

## 3 — FUNDAMENTALS

| | Titel |
|---|---:|
| `FUNDAMENTAL_COVERED` | **5.813** |
| `PIT_READY` | **4.928** |

## 4 — OVERLAP

| | Titel |
|---|---:|
| `R2_AND_FUNDAMENTAL` | **5.810** |
| `R2_WITHOUT_FUNDAMENTAL` | 1.187 |
| `TECHNICAL_AND_FUNDAMENTAL` | **5.215** |
| `TECHNICAL_WITHOUT_FUNDAMENTAL` | 748 |
| `PIT_AND_R2` | 4.927 |
| `PIT_AND_TECHNICAL` | 4.633 |
| `PIT_R2_AND_TECHNICAL` | **4.633** |
| `PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS` | **4.056** |

Die letzte Zeile ist die Antwort auf §14: **4.056**
Titel haben gleichzeitig Kurshistorie, ausreichende Technical History,
Point-in-Time-Fundamentals **und** die Kernkennzahlen Umsatz,
Nettoergebnis und Bilanzsumme.

## 5 — CORE METRICS

Basis: **5.963** technisch geeignete Titel.

| Kennzahl | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_REVENUE` | 4.057 | 68,0362 % |
| `TECHNICAL_WITH_NET_INCOME` | 4.618 | 77,4442 % |
| `TECHNICAL_WITH_EPS` | 4.381 | 73,4697 % |
| `TECHNICAL_WITH_OPERATING_CASH_FLOW` | 4.609 | 77,2933 % |
| `TECHNICAL_WITH_FCF` | 4.139 | 69,4114 % |
| `TECHNICAL_WITH_ASSETS` | 4.619 | 77,461 % |
| `TECHNICAL_WITH_DEBT` | 2.545 | 42,6799 % |
| `TECHNICAL_WITH_EQUITY` | 4.581 | 76,8237 % |

## 6 — HISTORY

| Jahrestiefe | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_ANNUAL_1Y` | 4.588 | 76,9411 % |
| `TECHNICAL_WITH_ANNUAL_3Y` | 4.361 | 73,1343 % |
| `TECHNICAL_WITH_ANNUAL_5Y` | 3.955 | 66,3257 % |
| `TECHNICAL_WITH_ANNUAL_10Y` | 2.846 | 47,7277 % |
| `TECHNICAL_WITH_ANNUAL_15Y` | 2.192 | 36,76 % |

| Quartalstiefe | `COUNT` | Anteil |
|---|---:|---:|
| `TECHNICAL_WITH_QUARTERLY_1Y` | 4.557 | 76,4213 % |
| `TECHNICAL_WITH_QUARTERLY_3Y` | 4.110 | 68,925 % |
| `TECHNICAL_WITH_QUARTERLY_5Y` | 3.757 | 63,0052 % |
| `TECHNICAL_WITH_QUARTERLY_10Y` | 2.756 | 46,2183 % |

## 7 — BACKTEST

| Stufe | Titel |
|---|---:|
| `BACKTEST_PRICE_READY` | 6.997 |
| `BACKTEST_TECHNICAL_READY` | 5.963 |
| `BACKTEST_FUNDAMENTAL_READY` | 4.633 |
| `BACKTEST_PIT_READY` | **4.633** |
| `BACKTEST_5Y_READY` | 3.955 |
| `BACKTEST_10Y_READY` | 2.846 |
| `BACKTEST_15Y_READY` | 2.192 |

Jede Stufe ist eine echte Teilmenge der vorigen. `BACKTEST_PIT_READY`
fällt mit `BACKTEST_FUNDAMENTAL_READY` zusammen, weil XBRL-Fakten der SEC
`accn` und `filed` **immer** tragen — eine Eigenschaft der Quelle, kein
Rechenfehler. Ein Wert darf erst ab `filedAt`/`availableAt` verwendet
werden; die Daten tragen das für jeden Wert.

## 8 — GAPS

| Gruppe | Titel |
|---|---:|
| `SEC_RECOVERABLE` | 926 |
| `EXTERNAL_PROVIDER_CANDIDATE` | 132 |
| `RESOLVES_WITH_TIME` | 798 |
| `BY_DESIGN` | 312 |
| `REQUIRES_REVIEW` | 389 |

## 9 — SEC_RECOVERABLE: WODURCH?

Basis: **926** Titel.

| Block | Titel | Anteil | Formulare |
|---|---:|---:|---|
| `IFRS_OR_FOREIGN_TAXONOMY` | 561 | 60,5832 % | {"20-F": 386, "40-F": 110, "40-F/A": 35, "20-F/A": 30} |
| `MISSING_CANONICAL_TAG_MAPPING` | 223 | 24,0821 % | {"10-Q": 221, "10-Q/A": 2} |
| `PERIOD_MAPPING` | 3 | 0,324 % | {"10-Q": 3} |
| `OTHER_SEC_RECOVERABLE` | 139 | 15,0108 % | {"KEINE_EINREICHUNG": 136, "10-Q": 3} |

**Größter Block: `IFRS_OR_FOREIGN_TAXONOMY`.** 20-F und 40-F sind bei der SEC
geführt; ihre IFRS-Taxonomien sind nicht gemappt. Das ist ein
Normalisierungsblock, kein Datenmangel — und der mit Abstand größte
Coverage-Gewinn je Arbeitsstunde. **Nichts davon wurde repariert.**

## 10 — EXTERNAL PROVIDER CANDIDATES

| | |
|---|---:|
| `COUNT` | **132** |
| `FOREIGN_ISSUERS` | 43 |
| `ADR` | 0 |
| `PREFERRED / SPECIAL_CLASSES` | 0 |
| `OTHER` | 89 |

| Bedarf | Titel |
|---|---:|
| tiefere historische Fundamentals | 132 |
| überhaupt historische Fundamentals | 0 |
| Estimates / Forward / Consensus | **0** |

Schätzungen, Forward Metrics und Analystenkonsens schließen **keine**
dieser Lücken — sie sind eine andere Fähigkeit, keine tiefere Historie.
Ob Vision Universe sie will, ist eine Produktfrage und steht hier bewusst
auf 0. **Keine Providerauswahl getroffen.**

---

## 11 — ZWEI BEFUNDE AUS DEM EIGENEN ENTWURF

**Die Historie gehörte dem Umsatz, nicht dem Emittenten.** Beim
Nachrechnen der externen Kandidaten trugen 517 von 701 Titeln
Jahreshistorie 0 und reichten trotzdem 10-Q ein — darunter
AllianceBernstein, notiert seit 1988. Nachgesehen: 17 Jahre
Nettoergebnis, Cashflow und Bilanzsumme, aber **kein Umsatz-Tag**. Banken
melden Zinserträge, Vermögensverwalter Gebühren, Biotechs vor der
Zulassung gar nichts. 635 Emittenten mit Werten haben diese Kennzahl
nicht, und 517 davon standen in der Begründung für einen Datenzukauf.
Gemessen wird jetzt die Spanne der auflösbaren Perioden des Emittenten.

→ `EXTERNAL_PROVIDER_CANDIDATE` fiel von 701 auf **132**,
`BACKTEST_10Y_READY` stieg von 2.283 auf **2.846**.

**Der Overlap war gegen die falsche Quelle gerechnet.** 5.397 statt 6.997,
5.378 statt 5.963 — die alten Gate-Läufe endeten vor der Erweiterung des
Wertpapierstamms. Das Ergebnis sah nach Deckung aus und war eine
Stichprobe.

---

## 12 — DIE ANTWORT AUF §14

Von **7.004** Vision-Universe-US-Produkttiteln haben:

| | Titel | Anteil |
|---|---:|---:|
| Kursdaten | 6.997 | 99,9 % |
| + Technical History | 5.963 | 85,1 % |
| + historische Fundamentals | 5.215 | 74,5 % |
| + Point-in-Time | 4.633 | 66,1 % |
| + Kernkennzahlen | **4.056** | 57,9 % |
| + 5 Jahre | 3.955 | 56,5 % |
| + 10 Jahre | 2.846 | 40,6 % |
| + 15 Jahre | 2.192 | 31,3 % |

Das ist die kanonische Basis für Quant, Strategy Lab, Stock
Intelligence, Screener, Compare, Portfolio, Atlas und Backtesting.

---

## 13 — WAS NICHT GETAN WURDE

- **Keine SEC-Reparatur.** Die 926 sind gemessen und aufgeschlüsselt,
  nicht angefasst.
- **Kein Provider integriert**, keine Auswahl getroffen.
- **Keine Frontend-Arbeit**, keine R2-Änderung, keine Kursanfrage.

---

*Gemessen am 2026-09-13 aus `quant/data/fundamentals/`.
Marktdatenstand: Lauf 34611793308. Fundamentalstand: Lauf 34716547144.*
