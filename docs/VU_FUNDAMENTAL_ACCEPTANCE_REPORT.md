# ACCEPTANCE REPORT — FUNDAMENTAL DATA EXPANSION (§22)

> **Stand vor dem Backfill.** Die Zahlen in diesem Bericht sind am
> Tag der Abnahme gemessen worden, als `sec.gov` aus der Bauumgebung
> nicht erreichbar war und fünf Emittenten im Bestand lagen. Sie
> bleiben als Beleg dieses Stands stehen. Das gemessene Ergebnis des
> Produktivlaufs steht in **`VU_SEC_BACKFILL_ERGEBNIS.md`**:
> 5.406 Emittenten mit Geschäftszahlen, 6.461 aufgelöste CIKs.

Alle Zahlen sind **gemessen**, keine geschätzt (§19). Wo nichts gemessen
wurde, steht `null` und nicht `0`.

Maschinenlesbar: `quant/data/fundamentals/*.json`,
`quant/data/universe/*.json`.

---

## UNIVERSE

| | |
|---|---:|
| `MASTER_MEMBERS` | **7.803** |
| `PRODUCT_TITLES` | **7.004** |
| `ELIGIBLE` | 6.477 |
| `SEPARATE_CLASS` | 308 |
| `REVIEW` | 219 |
| `EXCLUDED` | 799 |
| Instrumente (Listings) im Master | 7.809 |
| davon ohne Produktentscheidung | **0** |

Instrumente > Mitglieder, weil sechs Mitglieder (BGC, COHR, DCOM, SGI,
SUNE, TRAK) an zwei Börsen liegen. Produkttitel werden als **Mitglieder**
gezählt.

Gattungen laut Wertpapierstamm: EQUITY_COMMON 6.592 · WARRANT 457 ·
PREFERRED 308 · UNIT 290 · RIGHT 129 · TEST_SECURITY 30 · ETF 3.
Aktiv 7.794 · beendet 15.

---

## IDENTITY

| | |
|---|---:|
| `CIK_RESOLVED` | **5** |
| `CIK_UNRESOLVED` | **7.804** |
| `CIK_AMBIGUOUS` | **0** |
| Emittenten im Master | 5 |
| Emittenten mit mehreren Mitgliedern | 0 |

Die fünf sind der Validierungssatz aus `quant/config/sec-universe.json`.
Alle übrigen sind unaufgelöst, **weil `sec.gov` aus dieser Bauumgebung
nicht erreichbar ist** — Egress-Proxy, HTTP 403 auf `CONNECT
www.sec.gov:443` und `data.sec.gov:443`, im Proxy-Status protokolliert. Es
wurde ausdrücklich keine ersatzweise Zuordnung gebaut.

`CIK_AMBIGUOUS = 0` ist hier kein Befund über den Markt, sondern eine
Folge davon: ambig werden Einträge erst, wenn beide SEC-Verzeichnisse
gelesen sind.

---

## FUNDAMENTALS

| | |
|---|---:|
| `COMPANY_FACTS_AVAILABLE` | **5** |
| `COMPANY_FACTS_UNAVAILABLE` | **0** (von 5 Emittenten mit CIK) |
| Quelle | 5 × `DELIVERED_CANONICAL` |

Bezogen auf die **7.004 Produkttitel** sind das **0,07 %**.

| Kennzahl | `COUNT` | `PERCENT_OF_PRODUCT_UNIVERSE` |
|---|---:|---:|
| `REVENUE_COVERED` | 5 | 0,0714 % |
| `NET_INCOME_COVERED` | 5 | 0,0714 % |
| `EPS_COVERED` | **0** | 0 % |
| `OPERATING_CASH_FLOW_COVERED` | **0** | 0 % |
| `CAPEX_COVERED` | 4 | 0,0571 % |
| `FCF_DERIVABLE` | 4 | 0,0571 % |
| `ASSETS_COVERED` | 5 | 0,0714 % |
| `DEBT_COVERED` | **0** | 0 % |
| `EQUITY_COVERED` | 5 | 0,0714 % |

Die drei Nullen sind **keine fehlenden Daten, sondern ein fehlender
Export**: EPS, operativer Cashflow und Gesamtverschuldung stehen in der
Registry und in den Factbooks, aber nicht im ausgelieferten kanonischen
Bündel (`quant/data/sec/canonical/`, 13 metricIds). Der Faktenspeicher ist
gitignored und in diesem Container leer.

---

## HISTORY

Gemessen an auflösbaren Perioden je Emittent, über den `PeriodResolver`
(§8) — nicht an rohen Zeitreihen.

| | `>=1y` | `>=3y` | `>=5y` | `>=10y` | `>=15y` |
|---|---:|---:|---:|---:|---:|
| `ANNUAL` (Revenue) | 5 | 5 | 5 | **3** | **3** |
| `ANNUAL` (Net Income) | 5 | 5 | 5 | 5 | 5 |
| `ANNUAL` (Total Assets) | 5 | 5 | 5 | 5 | 5 |
| `ANNUAL` (Equity) | 5 | 5 | 5 | 5 | 5 |
| `ANNUAL` (FCF / CapEx) | 4 | 4 | 4 | 4 | 4 |
| `QUARTERLY` (gesamt) | 5 | 5 | 5 | 3 | 3 |

Je Emittent:

| Emittent | Jahresperioden | Quartalsperioden | von | bis | Jahre |
|---|---:|---:|---|---|---:|
| Apple | 20 | 74 | 2007-09-29 | 2026-06-27 | 18,75 |
| Microsoft | 20 | 76 | 2007-09-30 | 2026-06-30 | 18,75 |
| JPMorgan Chase | 20 | 74 | 2007-12-31 | 2026-06-30 | 18,50 |
| Exxon Mobil | 20 | 73 | 2007-12-31 | 2026-03-31 | 18,25 |
| NVIDIA | 19 | 74 | 2008-01-27 | 2026-07-26 | 18,50 |

**Keine Historie wurde aufgefüllt.** Keine Interpolation, keine erfundenen
Quartale. Dass Revenue nur bei drei von fünf `>=10y` erreicht, ist ein
gemessener Befund der Konzeptzuordnung — kein Rundungsfehler.

---

## OVERLAP

**Der Overlap wird nicht berechnet.** Die kanonische Marktdatendeckung
gehört dem R2-Workstream und ist dort abgenommen:

| | |
|---|---:|
| `PRODUCT_TITLES` | 7.004 |
| `R2_SERIES_AVAILABLE` | **7.802** |
| `HISTORICAL_CHART_AVAILABLE` | **6.997 / 7.004 = 99,90 %** |

Dieser Workstream hat **noch keinen Anschluss** an diese Quelle
(`overlap.marketDataSource.status = NOT_CONNECTED`). Solange er fehlt,
bleiben alle Overlap-Zahlen `null`:

| | |
|---|---:|
| `TECHNICAL_COVERED` | **null** |
| `FUNDAMENTAL_COVERED` (Produkttitel) | 5 |
| `TECHNICAL_AND_FUNDAMENTAL` | **null** |
| `TECHNICAL_WITHOUT_FUNDAMENTALS` | **null** |
| `FUNDAMENTALS_WITHOUT_TECHNICAL` | **null** |

### Korrektur: die 1.607 sind keine Marktdatendeckung

Ein früherer Stand dieses Berichts leitete aus den Tiingo-Gate-Läufen ab,
**1.607 Produkttitel hätten keine Kursdaten**. Diese Zahl ist **nicht
kanonisch** und darf nicht als Marktdatendeckung verwendet werden: die
Gate-Läufe endeten vor der Erweiterung des Wertpapierstamms, und der
abgenommene R2-Stand sagt das Gegenteil — 99,90 % der Produkttitel haben
eine historische Kursreihe.

Die Gate-Ableitung steht deshalb im Artefakt unter `fromGateRuns` mit dem
ausdrücklichen Vermerk, dass sie keine Marktdatendeckung ist, und ein Test
prüft, dass sie nicht wieder so heißt.

---

## PIT

| | |
|---|---:|
| `PIT_READY_SECURITIES` | **5** |
| `PIT_PARTIAL_SECURITIES` | 0 |
| `PIT_UNAVAILABLE_SECURITIES` | 6.999 |

Die fünf tragen `availableAt`, `filedAt`, `accession`, `form` und
`restatementStatus` je Fakt. `quant/data/sec/pit_gates.json` weist für
alle fünf aus:

| Gate | Ergebnis |
|---|---|
| `PIT_NO_FUTURE_DATA_LEAK` | **PASS** 5/5 |
| `PROVENANCE_COMPLETE` | PASS 5/5 |
| `PERIOD_INTEGRITY` | PASS 5/5 |
| `UNIT_INTEGRITY` | PASS 5/5 |
| `NO_INVENTED_VALUES` | PASS 5/5 |
| `DERIVED_SEPARATION` | PASS 5/5 |
| `SURVIVORSHIP_FREE_UNIVERSE` | **FAIL** 5/5 |
| `MARKET_DATA_AVAILABLE` | NOT_APPLICABLE 5/5 |

`SURVIVORSHIP_FREE_UNIVERSE` scheitert und soll es: SEC/EDGAR liefert kein
überlebensfreies Universum, und ein PASS hier wäre eine Falschaussage über
die Quelle. Für einen Backtest bedeutet das, dass die Universumsauswahl
nicht aus der SEC kommen darf — nicht, dass die Fundamentaldaten unbrauchbar
wären.

Für alle übrigen Titel ist PIT nicht „teilweise", sondern nicht vorhanden —
es gibt keine Fakten.

---

## QUALITY

| | |
|---|---:|
| `VALID` / `WARNING` / `AMBIGUOUS` / `MISSING` / `RESTATED` / `NON_COMPARABLE` | **nicht ermittelt** |
| Emittenten mit Qualitätsbefunden | 0 |

Die Zustände entstehen beim Normalisieren im Faktenspeicher. Aus den
ausgelieferten Bündeln sind sie nicht rekonstruierbar, und sie zu
schätzen wäre genau das, was §19 verbietet. Der erste Backfill-Lauf füllt
sie.

**Datenqualität des Company Master** dagegen ist gemessen:

| | |
|---|---:|
| doppelte Instrument-IDs | 0 |
| doppelte Kürzel (aktiv, gleiche Börse) | 0 |
| doppelte Provider-IDs | 0 |
| ungültige CIK | 0 |
| Gattung `UNKNOWN` | 0 |
| ohne Produktentscheidung | 0 |
| ohne Firmennamen | **7.291** |
| Klassifikationswidersprüche zum Wertpapierstamm | **909** |

Die 909: WARRANT→COMMON_STOCK 457, UNIT→COMMON_STOCK 290,
RIGHT→COMMON_STOCK 129, TEST_SECURITY→COMMON_STOCK 30, ETF→COMMON_STOCK 2,
EQUITY_COMMON→ETF 1. Festgehalten statt still korrigiert — die
Screenerfähigkeit folgt der Produktentscheidung.

---

## PERFORMANCE

| | |
|---|---:|
| `SEC_BULK_REQUESTS` | **0** |
| `SEC_INDIVIDUAL_REQUESTS` | **0** |
| `TOTAL_RUNTIME` (Fundamental-Ingest) | — |
| `RESUMED_SECURITIES` | 0 |
| `FAILED_SECURITIES` | 0 |

Kein einziger SEC-Abruf in dieser Sitzung: `sec.gov` ist am Egress-Proxy
gesperrt. Alle Zahlen oben stammen aus bereits im Repository liegenden
Artefakten.

Gemessen wurde stattdessen die **Pipeline**:

| | |
|---|---:|
| Company-Master-Sync, 7.810 Instrumente | 85 ms, idempotent |
| Emittentenstamm | < 1 s |
| Coverage-Rechnung | < 1 s |
| Scale Test, 25.000 Instrumente | Sync 196 ms, Suche 0,015 ms/Anfrage |
| Master-Prüfungen | **683**, 0 Befunde |
| Python-Tests | **279** grün |
| JS-Tests (Quant / Discover) | **56** neu, 118 grün |

---

## Was ein Lauf mit Zugang ändert

```
Actions → "SEC Fundamentals — Universum" → backfill: true
```

Erwartete Wirkung, der Reihe nach:

1. **7.291 fehlende Firmennamen** und die CIKs kommen aus zwei SEC-Anfragen.
2. `CIK_RESOLVED` springt von 5 auf mehrere Tausend, `CIK_AMBIGUOUS` wird
   zum ersten Mal überhaupt messbar.
3. Der Ingest läuft über den Sammelweg: **eine** Anfrage für alle
   companyfacts statt einer je Emittent.
4. `coverage-universe` misst, was angekommen ist — mit demselben Nenner.

Anfragebudget bei 7.000 Emittenten: ~7.000 Einreichungsübersichten plus
eine für das Sammelarchiv, bei 5 Anfragen/s rund 25 Minuten reine
Anfragezeit.

---

## Was NICHT behauptet wird (§19)

- **Nicht**: „7.004 Aktien haben vollständige Fundamentals." Gemessen sind
  **5**.
- **Nicht**: eine geschätzte Coverage als echte.
- **Nicht**: eine Providerentscheidung. `gaps.json` hält sie ausdrücklich
  offen, und die CI prüft diesen Satz.

## Übergabestelle

| Schritt | Zustand |
|---|---|
| 1. Company Master auf 7.803 / 7.004 | **erledigt** |
| 2. CIK Coverage | Pipeline steht, Lauf fehlt |
| 3. SEC Bulk Mapping | **erledigt**, ohne Netz geprüft |
| 4. Company Facts Coverage | messbar, gemessen: 5 |
| 5. Canonical Taxonomy | **erledigt** (40 Kennzahlen, EBITDA ableitbar) |
| 6. Historical Annual / Quarterly | **erledigt**, an 5 Emittenten belegt |
| 7. Derived Metrics | **erledigt** |
| 8. Restatement Handling | war schon erledigt |
| 9. PIT Layer | war schon erledigt |
| 10. Coverage Audit | **erledigt** |
| 11. Technical/Fundamental Overlap | **bewusst offen** — erst nach Anbindung der kanonischen R2-Quelle |
| 12. Incremental Update Design | **erledigt** (`cli.py update --universe`) |
| 13. Final Acceptance Report | dieses Dokument |

Branch: **`claude/vision-universe-expansion-j633h8`**. Nicht nach `main`
gemergt, nicht deployt, kein Pull Request — und kein neuer Provider
integriert.
