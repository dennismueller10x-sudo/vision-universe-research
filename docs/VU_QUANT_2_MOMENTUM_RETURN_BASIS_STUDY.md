# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-22T09:28:10.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.024 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.022 |
| `RAW_CLOSE_AVAILABLE` | 6.022 |
| `SPLIT_FACTOR_AVAILABLE` | 6.022 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.022 |
| `DIVIDEND_EVENTS_AVAILABLE` | 2.931 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.022 |
| `TRADING_DATES_AVAILABLE` | 6.022 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.022 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.022 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 2 |

Quellen: `CANONICAL_STORE` 6.022. Bereinigungsstufe: `adjusted` 6.022.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.022 Titel von 6.024 im Produktuniversum, 6.022 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 2 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 2.920 |
| geprüfte Ereignisse | 58.320 |
| davon konsistent | 57.521 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 732 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 35 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 26 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 6 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 500 | 2 | 8 | 14 |
| `ORDINARY_DIVIDEND` | 232 | 4 | 27 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 455 von 2.920 geprüften Titeln (15,58 %).

**Erklärt: 738 · unerklärt: 61** (0,105 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 5.939 |
| Preisbasis | `close` 5.939 |
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

Stichtag **2026-11-20**, 5.530 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-20 | 5.553 | 23 | 5.530 | CMCSA, THRM, FCX, CIB, FMX, SITC, KNDI, FFNW, CVI, TFII, BPOPM, ARI, CARE, VISN, FSV, DCOMP, VOXR, CCNEP, RLYB, HSHP, FER, AEBI, OCCIM |
| 2025-11-19 | 5.175 | 1 | 5.174 | FFNW |
| 2024-11-15 | 4.947 | 0 | 4.947 |  |
| 2023-11-15 | 4.763 | 11 | 4.752 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-11-14 | 4.554 | 0 | 4.554 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.530 | 0,9959 | 24 | 100 | 126 | 5.484 | 1.683 | 58 | 13 | 13 / 13 |
| `6M` | 5.530 | 0,9945 | 28 | 155 | 172,6 | 5.416 | 1.940 | 135 | 33 | 16 / 16 |
| `12M` | 5.530 | 0,9926 | 49 | 203,1 | 259 | 5.116 | 2.560 | 257 | 37 | 25 / 25 |
| `12M-1M` | 5.530 | 0,9947 | 50 | 208 | 288 | 2.661 | 2.630 | 295 | 49 | 15 / 15 |
| `RELATIVE_STRENGTH` | 5.530 | 0,9926 | 49 | 203,1 | 259 | 5.116 | 2.560 | 257 | 37 | 25 / 25 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -14,4 % | 43,6 % | 36,0 | 84,1 | 48,1 | -2.661 |
| TORO | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -3,2 % | 95,0 % | 48,0 | 95,1 | 47,1 | -2.606 |
| TASK | I · Services | `HIGH_YIELD` | -20,7 % | 23,5 % | 30,6 | 72,6 | 41,9 | -2.319 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -26,2 % | 14,1 % | 27,7 | 64,7 | 37,0 | -2.043 |
| HERZ | (unclassified) | `HIGH_YIELD` | -40,8 % | 4,3 % | 20,4 | 54,9 | 34,5 | -1.908 |
| RILY | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -1,9 % | 43,1 % | 49,5 | 83,9 | 34,4 | -1.900 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 8,8 % | 94,8 % | 62,2 | 95,1 | 32,8 | -1.816 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -66,8 % | -5,7 % | 10,7 | 41,9 | 31,1 | -1.721 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -10,0 % | 18,7 % | 40,7 | 68,7 | 28,0 | -1.547 |
| PDX | (unclassified) | `HIGH_YIELD` | -6,9 % | 16,0 % | 43,8 | 66,6 | 22,8 | -1.262 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -3,5 % | 19,6 % | 47,8 | 69,6 | 21,8 | -1.206 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -8,5 % | 13,2 % | 42,3 | 63,9 | 21,5 | -1.191 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | 1,0 % | 26,4 % | 53,6 | 74,4 | 20,8 | -1.150 |
| ETD | D · Manufacturing | `HIGH_YIELD` | -7,1 % | 12,8 % | 43,8 | 63,6 | 19,8 | -1.093 |
| BCAT | (unclassified) | `HIGH_YIELD` | -5,7 % | 14,0 % | 45,1 | 64,5 | 19,4 | -1.073 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.128 | 0,00 % | 30 | -0,54 | 3,74 |
| `LOW_YIELD` | 716 | 1,05 % | 46 | -0,83 | 3,06 |
| `MEDIUM_YIELD` | 640 | 3,01 % | -15 | 0,27 | 1,52 |
| `HIGH_YIELD` | 1.046 | 6,56 % | -162 | 2,92 | 9,66 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.128 | 0,00 % | 28 | -0,51 | 3,74 |
| `LOW_YIELD` | 716 | 1,12 % | 52 | -0,94 | 3,11 |
| `MEDIUM_YIELD` | 640 | 3,19 % | -14 | 0,25 | 1,37 |
| `HIGH_YIELD` | 1.046 | 6,58 % | -150 | 2,70 | 8,80 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 559 | 5,87 % | -149 | 2,69 | 9,28 |
| REITs | 188 | 5,61 % | -123 | 2,22 | 9,09 |
| Utilities | 144 | 2,54 % | 0 | 0,00 | 3,81 |
| Energy | 147 | 2,25 % | 1 | -0,02 | 5,28 |
| Consumer Staples | 117 | 0,56 % | 3 | -0,05 | 3,79 |
| Financials | 868 | 1,57 % | 8 | -0,14 | 4,41 |
| Real Estate | 66 | 0,00 % | 8 | -0,14 | 9,21 |
| Communication | 128 | 0,00 % | 15 | -0,26 | 4,70 |
| Health Care | 923 | 0,00 % | 21 | -0,38 | 3,69 |
| Consumer Discretionary | 433 | 0,00 % | 21 | -0,38 | 3,62 |
| (other) | 498 | 0,00 % | 22 | -0,40 | 3,74 |
| Materials | 296 | 0,00 % | 24 | -0,43 | 3,63 |
| Industrials | 441 | 0,00 % | 26 | -0,47 | 3,76 |
| Technology | 722 | 0,00 % | 27 | -0,49 | 3,74 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 559 | 5,87 % | -149 | 2,69 | 9,28 |
| H · Finance, Insurance, And Real Estate | 1.122 | 2,06 % | 1 | -0,02 | 6,37 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 394 | 1,47 % | 7 | -0,12 | 3,99 |
| F · Wholesale Trade | 100 | 0,00 % | 15 | -0,26 | 3,63 |
| D · Manufacturing | 1.925 | 0,00 % | 21 | -0,38 | 3,67 |
| G · Retail Trade | 222 | 0,00 % | 21 | -0,38 | 3,43 |
| I · Services | 887 | 0,00 % | 25 | -0,45 | 3,76 |
| B · Mining | 240 | 0,00 % | 25 | -0,45 | 3,75 |
| C · Construction | 61 | 0,00 % | 51 | -0,92 | 3,45 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 51 | -0,92 | 3,75 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-20 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9328 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9410 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.435 / 5.530 / 5.530 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9947 · Median 49 Ränge · P95 263 · Maximum 3.587 · 258 Titel bewegen sich um mindestens 5 Perzentilpunkte, 59 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 361 | 353 | 16 | 8 | 6,7 % |
| Quality Momentum (`quality-momentum`) | 49 | 47 | 3 | 1 | 8,2 % |
| Future Leader (`future-leader`) | 19 | 17 | 2 | 0 | 10,5 % |
| Value Momentum (`value-momentum`) | 222 | 220 | 7 | 5 | 5,4 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-20 | 0 | 5.530 | 0,9947 | 50 | 288 | 295 | 15 / 15 |
| 2025-11-19 | 252 | 5.174 | 0,9925 | 52 | 334 | 579 | 6 / 6 |
| 2024-11-15 | 504 | 4.947 | 0,9916 | 53 | 302 | 392 | 10 / 10 |
| 2023-11-15 | 756 | 4.752 | 0,9568 | 72 | 294,4 | 478 | 53 / 53 |
| 2022-11-14 | 1.008 | 4.554 | 0,9961 | 35 | 187 | 151 | 21 / 21 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6022` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9959 · `6M` 0,9945 · `12M` 0,9926 · `12M-1M` 0,9947 · `RELATIVE_STRENGTH` 0,9926 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `35` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
