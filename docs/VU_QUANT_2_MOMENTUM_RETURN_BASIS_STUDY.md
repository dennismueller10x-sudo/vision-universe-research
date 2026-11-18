# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-18T11:18:41.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.340 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.313 |
| `RAW_CLOSE_AVAILABLE` | 6.313 |
| `SPLIT_FACTOR_AVAILABLE` | 6.313 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.313 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.020 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.313 |
| `TRADING_DATES_AVAILABLE` | 6.313 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.313 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.313 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 27 |

Quellen: `CANONICAL_STORE` 6.313. Bereinigungsstufe: `adjusted` 6.313.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.313 Titel von 6.340 im Produktuniversum, 6.313 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 27 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.007 |
| geprüfte Ereignisse | 59.876 |
| davon konsistent | 59.050 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 754 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 38 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 29 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 516 | 2 | 7 | 17 |
| `ORDINARY_DIVIDEND` | 238 | 3 | 31 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 472 von 3.007 geprüften Titeln (15,70 %).

**Erklärt: 759 · unerklärt: 67** (0,112 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 5.918 |
| Preisbasis | `close` 5.918 |
| gemessene Quant-V2-Momentumbasis | **MIXED_OR_UNCONFIRMED** |

**Befund: Methodiktext und Rechnung sagen nicht dasselbe.**

| Komponente | Gewicht | beschrieben als | gerechnet auf |
|---|---:|---|---|
| `momentum:priceReturn12m1m` | 0,38 | split-adjusted price return T-252 to T-21 | `adjustedClose` |
| `momentum:priceReturn6m` | 0,25 | split-adjusted price return | `adjustedClose` |
| `momentum:priceReturn3m` | 0,13 | split-adjusted price return | `adjustedClose` |
| `momentum:distanceTo52wHigh` | 0,13 | (high252-current split-adjusted close)/high252 | `adjustedClose` |
| `momentum:distanceToSma200` | 0,13 | (split-adjusted close-SMA200)/SMA200 | `adjustedClose` |

Zusammen 1,00 Gewicht der Momentumnote. Solange `adjustedClose` splitbereinigt wäre, fiele das nicht auf; sie ist nachweislich gesamtrenditebereinigt, also ist es ein Unterschied. Diese Studie korrigiert ihn nicht still — er gehört in die Entscheidung.

## 3 · Keine Entscheidung aus fünf Titeln

Die Golden Five stehen im Regressionsumfang (`quant/tests/return-series.test.mjs`) und nirgends sonst. Sie prüfen die Konstruktion der beiden Reihen — den Splitsprung, die Dividendenlücke, die Richtung bei einem Dividendenzahler. Als Methodikbasis kommen sie nicht vor.

## 4 & 5 · Der Rangvergleich über das Universum

Stichtag **2026-11-17**, 5.721 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-17 | 5.751 | 30 | 5.721 | CMCSA, THRM, FCX, CIB, FMX, TVE, SITC, GJO, GJT, KNDI, FFNW, CVI, TFII, BPOPM, ARI, CARE, VISN, FSV, SBT, DCOMP, GOCOQ, VOXR, CCNEP, RLYB, HSHP, FER, AEBI, DVXE, OCCIM, TWOD |
| 2025-11-14 | 5.353 | 2 | 5.351 | FFNW, SBT |
| 2024-11-12 | 5.115 | 0 | 5.115 |  |
| 2023-11-10 | 4.929 | 11 | 4.918 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-11-09 | 4.694 | 0 | 4.694 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.721 | 0,9956 | 25 | 107,5 | 142 | 5.665 | 1.862 | 96 | 21 | 14 / 14 |
| `6M` | 5.721 | 0,9940 | 33 | 146 | 187 | 5.614 | 2.134 | 175 | 42 | 10 / 10 |
| `12M` | 5.721 | 0,9925 | 51 | 209 | 282 | 5.317 | 2.753 | 277 | 50 | 27 / 27 |
| `12M-1M` | 5.721 | 0,9944 | 55 | 232 | 306 | 2.766 | 2.805 | 312 | 57 | 18 / 18 |
| `RELATIVE_STRENGTH` | 5.721 | 0,9925 | 51 | 209 | 282 | 5.317 | 2.753 | 277 | 50 | 27 / 27 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -22,6 % | 29,9 % | 31,2 | 79,6 | 48,4 | -2.766 |
| HERZ | (unclassified) | `HIGH_YIELD` | -38,2 % | 8,8 % | 22,4 | 63,4 | 41,0 | -2.343 |
| RILY | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -11,4 % | 29,2 % | 41,6 | 79,1 | 37,6 | -2.148 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -28,6 % | 10,4 % | 27,7 | 64,9 | 37,2 | -2.130 |
| TASK | I · Services | `HIGH_YIELD` | -29,8 % | 9,4 % | 26,9 | 63,9 | 37,0 | -2.116 |
| TORO | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | 3,7 % | 108,8 % | 60,4 | 96,4 | 36,0 | -2.060 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,4 % | -7,5 % | 10,9 | 42,2 | 31,3 | -1.790 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 6,7 % | 91,1 % | 64,0 | 95,1 | 31,1 | -1.776 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -16,4 % | 10,3 % | 35,8 | 64,8 | 29,1 | -1.662 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -8,7 % | 14,3 % | 44,2 | 68,8 | 24,6 | -1.408 |
| PDX | (unclassified) | `HIGH_YIELD` | -6,8 % | 16,2 % | 46,4 | 70,6 | 24,2 | -1.383 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -4,9 % | 17,8 % | 48,4 | 72,1 | 23,8 | -1.359 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -13,2 % | 7,4 % | 39,5 | 61,6 | 22,1 | -1.266 |
| PRHI | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -5,1 % | 14,5 % | 48,2 | 69,1 | 20,9 | -1.198 |
| BCAT | (unclassified) | `HIGH_YIELD` | -7,7 % | 11,7 % | 45,5 | 66,0 | 20,5 | -1.171 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.262 | 0,00 % | 31 | -0,54 | 4,09 |
| `LOW_YIELD` | 738 | 1,03 % | 44 | -0,77 | 3,04 |
| `MEDIUM_YIELD` | 653 | 2,91 % | -17 | 0,30 | 1,62 |
| `HIGH_YIELD` | 1.068 | 6,44 % | -178 | 3,10 | 10,17 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.262 | 0,00 % | 34 | -0,59 | 3,67 |
| `LOW_YIELD` | 738 | 1,15 % | 51 | -0,89 | 2,89 |
| `MEDIUM_YIELD` | 653 | 3,26 % | -18 | 0,31 | 1,51 |
| `HIGH_YIELD` | 1.068 | 6,77 % | -153 | 2,67 | 9,26 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 188 | 5,36 % | -135 | 2,36 | 9,09 |
| (unclassified) | 756 | 5,16 % | -122 | 2,13 | 9,03 |
| Energy | 147 | 2,31 % | 0 | 0,00 | 5,86 |
| Consumer Staples | 117 | 0,57 % | 3 | -0,05 | 3,69 |
| Utilities | 144 | 2,55 % | 3 | -0,05 | 3,95 |
| Real Estate | 66 | 0,00 % | 7 | -0,12 | 11,31 |
| Financials | 864 | 1,50 % | 8 | -0,13 | 4,73 |
| Communication | 128 | 0,00 % | 20 | -0,35 | 4,36 |
| (other) | 498 | 0,00 % | 21 | -0,37 | 3,81 |
| Consumer Discretionary | 433 | 0,00 % | 21 | -0,37 | 3,76 |
| Health Care | 924 | 0,00 % | 21 | -0,37 | 3,67 |
| Industrials | 441 | 0,00 % | 22 | -0,38 | 3,79 |
| Materials | 296 | 0,00 % | 23 | -0,39 | 3,70 |
| Technology | 719 | 0,00 % | 23 | -0,40 | 3,78 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 756 | 5,16 % | -122 | 2,13 | 9,03 |
| H · Finance, Insurance, And Real Estate | 1.118 | 1,99 % | 0 | 0,00 | 6,68 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 394 | 1,46 % | 7 | -0,11 | 4,32 |
| F · Wholesale Trade | 100 | 0,00 % | 14 | -0,24 | 3,87 |
| D · Manufacturing | 1.924 | 0,00 % | 20 | -0,35 | 3,70 |
| G · Retail Trade | 222 | 0,00 % | 21 | -0,37 | 3,44 |
| I · Services | 885 | 0,00 % | 23 | -0,40 | 3,81 |
| B · Mining | 240 | 0,00 % | 24 | -0,42 | 4,32 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 38 | -0,66 | 3,47 |
| C · Construction | 62 | 0,00 % | 41 | -0,71 | 3,81 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-17 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9368 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9454 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.415 / 5.721 / 5.721 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9942 · Median 54 Ränge · P95 285 · Maximum 3.537 · 286 Titel bewegen sich um mindestens 5 Perzentilpunkte, 89 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 357 | 348 | 18 | 9 | 7,6 % |
| Quality Momentum (`quality-momentum`) | 60 | 58 | 2 | 0 | 3,3 % |
| Future Leader (`future-leader`) | 22 | 20 | 2 | 0 | 9,1 % |
| Value Momentum (`value-momentum`) | 221 | 216 | 9 | 4 | 5,9 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-17 | 0 | 5.721 | 0,9944 | 55 | 306 | 312 | 18 / 18 |
| 2025-11-14 | 252 | 5.351 | 0,9922 | 57 | 344 | 635 | 6 / 6 |
| 2024-11-12 | 504 | 5.115 | 0,9918 | 56 | 305,3 | 413 | 14 / 14 |
| 2023-11-10 | 756 | 4.918 | 0,9592 | 73 | 312,1 | 545 | 51 / 51 |
| 2022-11-09 | 1.008 | 4.694 | 0,9966 | 35 | 194 | 162 | 20 / 20 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6313` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9956 · `6M` 0,9940 · `12M` 0,9925 · `12M-1M` 0,9944 · `RELATIVE_STRENGTH` 0,9925 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `43` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
