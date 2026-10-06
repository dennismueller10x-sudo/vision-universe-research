# SEC-Fundamentals-Backfill — gemessenes Ergebnis

GitHub Actions Lauf `34716547144`, Zweig
`claude/vision-universe-expansion-j633h8`.

Alle Zahlen hier stammen aus `quant/data/fundamentals/*.json` und sind
**gemessen**, nicht geschätzt. Wo nichts gemessen wurde, steht das
ausdrücklich dabei und nicht `0`.

Dieses Dokument löst den Abschnitt FUNDAMENTALS in
`VU_FUNDAMENTAL_ACCEPTANCE_REPORT.md` ab. Jener Bericht beschreibt den
Stand **vor** dem Backfill (fünf Emittenten, `sec.gov` aus der
Bauumgebung nicht erreichbar) und bleibt als Beleg dieses Stands
bestehen.

---

## 1 — UNIVERSUM UND IDENTITÄT

| | |
|---|---:|
| `PRODUCT_TITLES` | **7.004** |
| `PRODUCT_ISSUERS` | 5.449 |
| `PRODUCT_TITLES_WITHOUT_ISSUER` | 1.146 |
| `CIK_RESOLVED` | **6.461** |
| `CIK_UNRESOLVED` | **1.348** |
| `CIK_AMBIGUOUS` | **0** |

`CIK_AMBIGUOUS = 0` ist jetzt ein Befund und keine Folge fehlender
Daten mehr: beide SEC-Verzeichnisse wurden gelesen. Kein CIK wurde
geraten — ein Titel ohne eindeutige Zuordnung bleibt unaufgelöst.

## 2 — FUNDAMENTALS

| | |
|---|---:|
| `COMPANY_FACTS_AVAILABLE` | **5.406** |
| `COMPANY_FACTS_UNAVAILABLE` | 43 |
| Emittenten ingestiert (gesamt) | 5.437 |

| Kennzahl | `COUNT` | `PERCENT_OF_PRODUCT_UNIVERSE` |
|---|---:|---:|
| `REVENUE_COVERED` | 3.987 | 56,9246 % |
| `NET_INCOME_COVERED` | 4.537 | 64,7773 % |
| `EPS_COVERED` | 4.276 | 61,0508 % |
| `OPERATING_CASH_FLOW_COVERED` | 4.525 | 64,6059 % |
| `CAPEX_COVERED` | 4.075 | 58,181 % |
| `FCF_DERIVABLE` | 4.073 | 58,1525 % |
| `ASSETS_COVERED` | 4.591 | 65,5483 % |
| `DEBT_COVERED` | 2.480 | 35,4083 % |
| `EQUITY_COVERED` | 4.555 | 65,0343 % |

Nenner ist durchgehend `PRODUCT_TITLES` (7.004),
nicht der eigene Bestand — ein Nenner aus dem eigenen Bestand würde jede
Lücke wegdefinieren (§19).

`FCF_DERIVABLE` und `DEBT_COVERED` sind abgeleitete Größen. Sie werden
über die Formeln aus `derived.py` gezählt: eine abgeleitete Kennzahl
deckt genau die Perioden, in denen **alle** ihre Eingangsgrößen
auflösen.

## 3 — HISTORISCHE TIEFE

Gemessen an auflösbaren Perioden. Eine Zeitreihe ohne auflösbaren Wert
zählt nicht.

**Jahre (`ANNUAL_*`), Leitgröße Umsatz**

| Tiefe | Emittenten |
|---|---:|
| ≥ 1y | 3.938 |
| ≥ 3y | 3.623 |
| ≥ 5y | 3.217 |
| ≥ 10y | 2.200 |
| ≥ 15y | 1.626 |

**Quartale (`QUARTERLY_*`)**

| Tiefe | Emittenten |
|---|---:|
| ≥ 1y | 3.467 |
| ≥ 3y | 3.230 |
| ≥ 5y | 2.945 |
| ≥ 10y | 2.055 |
| ≥ 15y | 1.509 |

## 4 — POINT-IN-TIME

Ein Wert ist zeitpunktgenau abfragbar, wenn er ein
Veröffentlichungsdatum **und** eine Einreichung trägt. `PIT_READY`
verlangt das für **alle** aufgelösten Werte eines Emittenten.

| | |
|---|---:|
| `PIT_READY_SECURITIES` | **4.928** |
| `PIT_PARTIAL_SECURITIES` | **0** |
| `PIT_UNAVAILABLE_SECURITIES` | **2.076** |

Die drei Zustände ergeben zusammen `PRODUCT_TITLES` (4.928 + 0 + 2.076
= 7.004). Auf Emittentenebene: 4.627 `PIT_READY`, 810
`PIT_UNAVAILABLE` — letztere sind Emittenten, deren Factbook keine
auflösbare Periode hergibt.

`SURVIVORSHIP_FREE_UNIVERSE` bleibt **false**: SEC/EDGAR führt keinen
Wertpapierstamm und keinen Delisting-Ereignisfeed. Ein PASS wäre eine
Falschaussage über die Quelle.

## 5 — ANFRAGEN UND FEHLSCHLÄGE

| | |
|---|---:|
| `SEC_BULK_REQUESTS` | 1 (ein Sammelarchiv) |
| `SEC_INDIVIDUAL_REQUESTS` | 0 |
| `FAILED_SECURITIES` | **42** |

Das Archiv umfasst 1,41 GB und 20.359 Emittenten; gebraucht wurden
5.437. Es wird wahlfrei über sein Inhaltsverzeichnis gelesen — im
Speicher liegt immer nur ein Emittent, nie zwei.

Die 42 Fehlschläge stehen in der Fehlerschlange und sind mit
`cli.py retry` nachholbar. Sie sind 0,77 % des Universums und liegen
unter der Schwelle von 5 %.

`SEC_INDIVIDUAL_REQUESTS = 0` und `SEC_BULK_REQUESTS = 1` gelten für
diesen Lauf: er hat den Bestand aus dem Zwischenspeicher übernommen
(`from_cache`) und keinen Emittenten neu geholt. Die Beschaffung selbst
fand im Lauf `34707863524` statt — ein Sammelarchiv statt 5.480
Einzelabrufen.

## 6 — DATENQUALITÄT

| Zustand | Werte |
|---|---:|
| `HIGH` | 1.649.267 |
| `MEDIUM` | 164.056 |
| `LOW` | 0 |

## 7 — WAS NICHT GEMESSEN IST

**Technical/Fundamental-Overlap.** Bleibt `null`. Die kanonische
Marktdaten-/R2-Quelle ist an diesen Workstream nicht angeschlossen. Der
abgenommene R2-Stand steht als benannte Fremdquelle im Artefakt
(`overlap.marketDataSource`, Status `NOT_CONNECTED`):
`R2_SERIES_AVAILABLE = 7.802`,
`HISTORICAL_CHART_AVAILABLE = 6.997 / 7.004` (99,90 %). Dieser
Workstream rechnet **nicht** mit diesen Zahlen.

**Providerentscheidung.** Bleibt offen (§20, §32). Zwei Lückenursachen
sind jetzt gezählt — 1.348 `CIK_UNRESOLVED` und 43 ohne Company Facts —,
zwei aber noch nicht: wie viele Produkttitel ausländische Privatemittenten
mit IFRS-Taxonomie sind, und wie viele gar nicht bei der SEC einreichen.
Erst diese beiden entscheiden, ob eine zweite Quelle nötig ist. Eine
Empfehlung vorher wäre eine Ausgabe auf Verdacht.

---

*Erzeugt aus `quant/data/fundamentals/` — Stand
2026-09-12T20:23:42+00:00.*
