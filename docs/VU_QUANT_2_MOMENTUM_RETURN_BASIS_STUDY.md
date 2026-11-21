# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-21T13:10:29.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.340 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.338 |
| `RAW_CLOSE_AVAILABLE` | 6.338 |
| `SPLIT_FACTOR_AVAILABLE` | 6.338 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.338 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.024 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.338 |
| `TRADING_DATES_AVAILABLE` | 6.338 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.338 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.338 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 2 |

Quellen: `CANONICAL_STORE` 6.338. Bereinigungsstufe: `adjusted` 6.338.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.338 Titel von 6.340 im Produktuniversum, 6.338 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 2 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.011 |
| geprüfte Ereignisse | 59.930 |
| davon konsistent | 59.101 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 755 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 39 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 29 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 6 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 517 | 2 | 8 | 17 |
| `ORDINARY_DIVIDEND` | 238 | 4 | 31 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 474 von 3.011 geprüften Titeln (15,74 %).

**Erklärt: 761 · unerklärt: 68** (0,113 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

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

Stichtag **2026-11-20**, 5.744 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-20 | 5.774 | 30 | 5.744 | CMCSA, THRM, FCX, CIB, FMX, TVE, SITC, GJO, GJT, KNDI, FFNW, CVI, TFII, BPOPM, ARI, CARE, VISN, FSV, SBT, DCOMP, GOCOQ, VOXR, CCNEP, RLYB, HSHP, FER, AEBI, DVXE, OCCIM, TWOD |
| 2025-11-19 | 5.371 | 2 | 5.369 | FFNW, SBT |
| 2024-11-15 | 5.131 | 0 | 5.131 |  |
| 2023-11-15 | 4.935 | 11 | 4.924 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-11-14 | 4.709 | 0 | 4.709 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.744 | 0,9958 | 26 | 101 | 133,4 | 5.696 | 1.861 | 95 | 15 | 14 / 14 |
| `6M` | 5.744 | 0,9942 | 29 | 164 | 187 | 5.628 | 2.106 | 164 | 41 | 16 / 16 |
| `12M` | 5.744 | 0,9926 | 51 | 210 | 282 | 5.309 | 2.691 | 279 | 43 | 25 / 25 |
| `12M-1M` | 5.744 | 0,9945 | 53 | 220 | 305,7 | 2.792 | 2.730 | 315 | 50 | 16 / 16 |
| `RELATIVE_STRENGTH` | 5.744 | 0,9926 | 51 | 210 | 282 | 5.309 | 2.691 | 279 | 43 | 25 / 25 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -14,4 % | 43,6 % | 35,5 | 84,1 | 48,6 | -2.792 |
| TORO | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -3,2 % | 95,0 % | 47,3 | 95,1 | 47,8 | -2.744 |
| TASK | I · Services | `HIGH_YIELD` | -20,7 % | 23,5 % | 30,3 | 72,7 | 42,4 | -2.435 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -26,2 % | 14,1 % | 27,4 | 64,9 | 37,5 | -2.153 |
| RILY | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -1,9 % | 43,1 % | 48,8 | 83,8 | 35,1 | -2.015 |
| HERZ | (unclassified) | `HIGH_YIELD` | -40,8 % | 4,3 % | 20,2 | 55,1 | 34,9 | -2.002 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 8,8 % | 94,8 % | 62,6 | 95,0 | 32,4 | -1.863 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -66,8 % | -5,7 % | 10,8 | 41,3 | 30,5 | -1.749 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -10,0 % | 18,7 % | 40,1 | 68,9 | 28,8 | -1.653 |
| PDX | (unclassified) | `HIGH_YIELD` | -6,9 % | 16,0 % | 43,2 | 66,9 | 23,7 | -1.360 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -3,5 % | 19,6 % | 47,1 | 69,7 | 22,7 | -1.303 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -8,5 % | 13,2 % | 41,7 | 64,1 | 22,4 | -1.289 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | 1,0 % | 26,4 % | 53,8 | 74,5 | 20,7 | -1.190 |
| ETD | D · Manufacturing | `HIGH_YIELD` | -7,1 % | 12,8 % | 43,2 | 63,8 | 20,7 | -1.187 |
| BCAT | (unclassified) | `HIGH_YIELD` | -5,7 % | 14,0 % | 44,4 | 64,8 | 20,4 | -1.169 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.282 | 0,00 % | 32 | -0,56 | 3,83 |
| `LOW_YIELD` | 740 | 1,05 % | 47 | -0,82 | 2,96 |
| `MEDIUM_YIELD` | 650 | 3,01 % | -17 | 0,29 | 1,60 |
| `HIGH_YIELD` | 1.072 | 6,60 % | -171 | 2,97 | 9,90 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.282 | 0,00 % | 29 | -0,50 | 3,67 |
| `LOW_YIELD` | 740 | 1,12 % | 54 | -0,93 | 3,07 |
| `MEDIUM_YIELD` | 650 | 3,19 % | -17 | 0,29 | 1,46 |
| `HIGH_YIELD` | 1.072 | 6,61 % | -159 | 2,76 | 9,26 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 188 | 5,61 % | -130 | 2,25 | 9,42 |
| (unclassified) | 772 | 4,65 % | -111 | 1,93 | 9,03 |
| Utilities | 145 | 2,49 % | 0 | 0,00 | 3,80 |
| Consumer Staples | 117 | 0,56 % | 2 | -0,03 | 3,90 |
| Energy | 147 | 2,25 % | 2 | -0,03 | 5,20 |
| Financials | 868 | 1,57 % | 7 | -0,12 | 4,87 |
| Real Estate | 66 | 0,00 % | 8 | -0,14 | 9,37 |
| Communication | 128 | 0,00 % | 14 | -0,24 | 4,59 |
| Health Care | 923 | 0,00 % | 21 | -0,37 | 3,67 |
| Consumer Discretionary | 433 | 0,00 % | 21 | -0,37 | 3,55 |
| (other) | 498 | 0,00 % | 22 | -0,37 | 3,75 |
| Materials | 296 | 0,00 % | 24 | -0,41 | 3,56 |
| Industrials | 441 | 0,00 % | 26 | -0,45 | 3,76 |
| Technology | 722 | 0,00 % | 27 | -0,47 | 3,74 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 772 | 4,65 % | -111 | 1,93 | 9,03 |
| H · Finance, Insurance, And Real Estate | 1.122 | 2,06 % | 0 | 0,00 | 6,58 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 395 | 1,48 % | 5 | -0,09 | 4,00 |
| F · Wholesale Trade | 100 | 0,00 % | 15 | -0,25 | 3,58 |
| D · Manufacturing | 1.925 | 0,00 % | 21 | -0,37 | 3,66 |
| G · Retail Trade | 222 | 0,00 % | 22 | -0,37 | 3,34 |
| B · Mining | 240 | 0,00 % | 26 | -0,45 | 3,83 |
| I · Services | 887 | 0,00 % | 26 | -0,45 | 3,81 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 52 | -0,91 | 3,82 |
| C · Construction | 61 | 0,00 % | 55 | -0,96 | 3,52 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-20 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9329 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9411 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.436 / 5.744 / 5.744 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9944 · Median 52 Ränge · P95 281,8 · Maximum 3.738 · 278 Titel bewegen sich um mindestens 5 Perzentilpunkte, 82 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 356 | 345 | 20 | 9 | 8,2 % |
| Quality Momentum (`quality-momentum`) | 48 | 48 | 0 | 0 | 0,0 % |
| Future Leader (`future-leader`) | 16 | 17 | 0 | 1 | 5,9 % |
| Value Momentum (`value-momentum`) | 215 | 217 | 3 | 5 | 3,7 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-20 | 0 | 5.744 | 0,9945 | 53 | 305,7 | 315 | 16 / 16 |
| 2025-11-19 | 252 | 5.369 | 0,9920 | 55 | 354 | 641 | 7 / 7 |
| 2024-11-15 | 504 | 5.131 | 0,9915 | 55 | 314 | 519 | 11 / 11 |
| 2023-11-15 | 756 | 4.924 | 0,9580 | 74 | 307 | 545 | 53 / 53 |
| 2022-11-14 | 1.008 | 4.709 | 0,9961 | 36 | 195,2 | 165 | 25 / 25 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6338` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9958 · `6M` 0,9942 · `12M` 0,9926 · `12M-1M` 0,9945 · `RELATIVE_STRENGTH` 0,9926 |
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
