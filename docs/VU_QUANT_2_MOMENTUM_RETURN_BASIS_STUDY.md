# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-27T00:01:53.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.001 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.000 |
| `RAW_CLOSE_AVAILABLE` | 6.000 |
| `SPLIT_FACTOR_AVAILABLE` | 6.000 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.000 |
| `DIVIDEND_EVENTS_AVAILABLE` | 2.927 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.000 |
| `TRADING_DATES_AVAILABLE` | 6.000 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.000 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.000 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.000. Bereinigungsstufe: `adjusted` 6.000.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.000 Titel von 6.001 im Produktuniversum, 6.000 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 2.917 |
| geprüfte Ereignisse | 58.275 |
| davon konsistent | 57.473 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 735 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 36 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 25 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 6 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 503 | 2 | 8 | 14 |
| `ORDINARY_DIVIDEND` | 232 | 4 | 28 | 11 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 458 von 2.917 geprüften Titeln (15,70 %).

**Erklärt: 741 · unerklärt: 61** (0,105 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 5.927 |
| Preisbasis | `close` 5.927 |
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

Stichtag **2026-11-25**, 5.518 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-25 | 5.540 | 22 | 5.518 | CMCSA, THRM, FCX, CIB, FMX, SITC, KNDI, FFNW, CVI, TFII, BPOPM, CARE, VISN, FSV, DCOMP, VOXR, CCNEP, RLYB, HSHP, FER, AEBI, OCCIM |
| 2025-11-24 | 5.158 | 1 | 5.157 | FFNW |
| 2024-11-20 | 4.931 | 0 | 4.931 |  |
| 2023-11-20 | 4.750 | 11 | 4.739 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-11-17 | 4.549 | 0 | 4.549 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.518 | 0,9931 | 27 | 98 | 133 | 5.464 | 1.718 | 62 | 13 | 16 / 16 |
| `6M` | 5.518 | 0,9935 | 30 | 148 | 171 | 5.399 | 1.951 | 135 | 27 | 16 / 16 |
| `12M` | 5.518 | 0,9917 | 50 | 204 | 267 | 5.162 | 2.650 | 258 | 40 | 23 / 23 |
| `12M-1M` | 5.518 | 0,9942 | 49 | 211 | 278,3 | 4.854 | 2.622 | 281 | 44 | 19 / 19 |
| `RELATIVE_STRENGTH` | 5.518 | 0,9917 | 50 | 204 | 267 | 5.162 | 2.650 | 258 | 40 | 23 / 23 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| AZTR | D · Manufacturing | `NO_DIVIDEND` | -65,3 % | 246,5 % | 11,2 | 99,1 | 88,0 | -4.854 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -20,3 % | 33,8 % | 31,8 | 79,6 | 47,8 | -2.638 |
| TASK | I · Services | `HIGH_YIELD` | -26,8 % | 14,1 % | 27,9 | 66,1 | 38,2 | -2.108 |
| RILY | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -7,2 % | 35,3 % | 45,0 | 80,3 | 35,4 | -1.950 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -30,7 % | 7,1 % | 25,7 | 59,6 | 33,9 | -1.870 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 10,2 % | 97,4 % | 65,1 | 95,4 | 30,3 | -1.672 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,6 % | -8,0 % | 10,4 | 40,5 | 30,1 | -1.660 |
| TORO | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | 15,4 % | 132,5 % | 69,2 | 97,4 | 28,3 | -1.559 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,6 % | 13,9 % | 38,1 | 66,0 | 27,9 | -1.537 |
| PDX | (unclassified) | `HIGH_YIELD` | -3,4 % | 20,4 % | 49,0 | 71,1 | 22,1 | -1.217 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -6,1 % | 16,2 % | 46,0 | 67,9 | 21,9 | -1.207 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -0,6 % | 24,4 % | 52,5 | 74,2 | 21,7 | -1.195 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -16,3 % | 3,7 % | 35,1 | 55,2 | 20,1 | -1.109 |
| ECAT | (unclassified) | `HIGH_YIELD` | -14,6 % | 4,3 % | 36,7 | 56,3 | 19,7 | -1.084 |
| BCAT | (unclassified) | `HIGH_YIELD` | -4,6 % | 15,3 % | 47,7 | 67,1 | 19,4 | -1.071 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.121 | 0,00 % | 32 | -0,58 | 3,82 |
| `LOW_YIELD` | 715 | 1,02 % | 46 | -0,83 | 3,15 |
| `MEDIUM_YIELD` | 640 | 2,91 % | -14 | 0,25 | 1,49 |
| `HIGH_YIELD` | 1.042 | 6,47 % | -162 | 2,94 | 9,57 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.121 | 0,00 % | 29 | -0,53 | 3,72 |
| `LOW_YIELD` | 715 | 1,15 % | 52 | -0,94 | 3,08 |
| `MEDIUM_YIELD` | 640 | 3,24 % | -18 | 0,32 | 1,45 |
| `HIGH_YIELD` | 1.042 | 6,71 % | -151 | 2,74 | 8,95 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 532 | 6,00 % | -159 | 2,88 | 9,32 |
| REITs | 188 | 5,50 % | -124 | 2,24 | 9,16 |
| Utilities | 143 | 2,56 % | 1 | -0,02 | 4,02 |
| Energy | 147 | 2,35 % | 2 | -0,04 | 5,15 |
| Consumer Staples | 117 | 0,67 % | 2 | -0,04 | 3,62 |
| Real Estate | 68 | 0,00 % | 9 | -0,15 | 9,75 |
| Financials | 878 | 1,47 % | 9 | -0,16 | 4,38 |
| Communication | 128 | 0,00 % | 17 | -0,31 | 3,95 |
| (other) | 499 | 0,00 % | 20 | -0,36 | 3,81 |
| Health Care | 926 | 0,00 % | 21 | -0,38 | 3,77 |
| Consumer Discretionary | 432 | 0,00 % | 22 | -0,39 | 3,70 |
| Materials | 296 | 0,00 % | 23 | -0,41 | 3,64 |
| Industrials | 442 | 0,00 % | 24 | -0,43 | 3,70 |
| Technology | 722 | 0,00 % | 29 | -0,53 | 3,79 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 532 | 6,00 % | -159 | 2,88 | 9,32 |
| H · Finance, Insurance, And Real Estate | 1.134 | 1,97 % | 2 | -0,04 | 6,25 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 393 | 1,43 % | 6 | -0,11 | 4,02 |
| F · Wholesale Trade | 101 | 0,00 % | 14 | -0,25 | 3,72 |
| D · Manufacturing | 1.928 | 0,00 % | 20 | -0,36 | 3,70 |
| G · Retail Trade | 221 | 0,00 % | 22 | -0,40 | 3,70 |
| B · Mining | 240 | 0,00 % | 24 | -0,43 | 4,02 |
| I · Services | 888 | 0,00 % | 26 | -0,47 | 3,82 |
| A · Agriculture, Forestry, And Fishing | 19 | 0,00 % | 41 | -0,74 | 3,49 |
| C · Construction | 62 | 0,00 % | 55 | -1,00 | 3,43 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-25 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9355 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9433 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 4.846 / 5.518 / 5.518 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9938 · Median 50,5 Ränge · P95 268 · Maximum 4.970 · 264 Titel bewegen sich um mindestens 5 Perzentilpunkte, 58 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 375 | 367 | 18 | 10 | 7,5 % |
| Quality Momentum (`quality-momentum`) | 45 | 42 | 3 | 0 | 6,7 % |
| Future Leader (`future-leader`) | 17 | 18 | 0 | 1 | 5,6 % |
| Value Momentum (`value-momentum`) | 214 | 210 | 10 | 6 | 7,5 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-25 | 0 | 5.518 | 0,9942 | 49 | 278,3 | 281 | 19 / 19 |
| 2025-11-24 | 252 | 5.157 | 0,9924 | 50 | 335 | 604 | 9 / 9 |
| 2024-11-20 | 504 | 4.931 | 0,9918 | 49 | 303 | 478 | 12 / 12 |
| 2023-11-20 | 756 | 4.739 | 0,9485 | 80 | 298,2 | 518 | 55 / 55 |
| 2022-11-17 | 1.008 | 4.549 | 0,9961 | 34 | 190 | 154 | 21 / 21 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6000` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9931 · `6M` 0,9935 · `12M` 0,9917 · `12M-1M` 0,9942 · `RELATIVE_STRENGTH` 0,9917 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `34` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
