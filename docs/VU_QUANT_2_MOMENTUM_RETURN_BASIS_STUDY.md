# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-23T02:25:30.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.686 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.685 |
| `RAW_CLOSE_AVAILABLE` | 6.685 |
| `SPLIT_FACTOR_AVAILABLE` | 6.685 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.685 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.199 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.685 |
| `TRADING_DATES_AVAILABLE` | 6.685 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.685 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.685 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.685. Bereinigungsstufe: `adjusted` 6.685.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.685 Titel von 6.686 im Produktuniversum, 6.685 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.186 |
| geprüfte Ereignisse | 61.017 |
| davon konsistent | 60.209 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 754 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 28 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 21 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 510 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 244 | 3 | 17 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 465 von 3.186 geprüften Titeln (14,60 %).

**Erklärt: 759 · unerklärt: 49** (0,080 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.435 |
| Preisbasis | `close` 6.435 |
| gemessene Quant-V2-Momentumbasis | **MIXED_OR_UNCONFIRMED** |

**Befund: Methodiktext und Rechnung sagen nicht dasselbe.**

| Komponente | Gewicht | beschrieben als | gerechnet auf |
|---|---:|---|---|
| `momentum:priceReturn12m1m` | 0,30 | split-adjusted price return T-252 to T-21 | `adjustedClose` |
| `momentum:priceReturn6m` | 0,20 | split-adjusted price return | `adjustedClose` |
| `momentum:priceReturn3m` | 0,10 | split-adjusted price return | `adjustedClose` |
| `momentum:relativeStrength12m1m` | 0,20 | security 12-1 split-adjusted price return minus certified broad benchmark 12-1 split-adjusted price return | `adjustedClose` |
| `momentum:distanceTo52wHigh` | 0,10 | (high252-current split-adjusted close)/high252 | `adjustedClose` |
| `momentum:distanceToSma200` | 0,10 | (split-adjusted close-SMA200)/SMA200 | `adjustedClose` |

Zusammen 1,00 Gewicht der Momentumnote. Solange `adjustedClose` splitbereinigt wäre, fiele das nicht auf; sie ist nachweislich gesamtrenditebereinigt, also ist es ein Unterschied. Diese Studie korrigiert ihn nicht still — er gehört in die Entscheidung.

## 3 · Keine Entscheidung aus fünf Titeln

Die Golden Five stehen im Regressionsumfang (`quant/tests/return-series.test.mjs`) und nirgends sonst. Sie prüfen die Konstruktion der beiden Reihen — den Splitsprung, die Dividendenlücke, die Richtung bei einem Dividendenzahler. Als Methodikbasis kommen sie nicht vor.

## 4 & 5 · Der Rangvergleich über das Universum

Stichtag **2026-10-22**, 5.769 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-22 | 5.787 | 18 | 5.769 | CMCSA, THRM, FCX, CIB, FMX, GJO, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, HSHP, DVXE, OCCIM |
| 2025-10-21 | 5.345 | 2 | 5.343 | FFNW, SBT |
| 2024-10-17 | 5.108 | 0 | 5.108 |  |
| 2023-10-17 | 4.935 | 11 | 4.924 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-10-14 | 4.659 | 0 | 4.659 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.769 | 0,9971 | 26 | 121,2 | 166 | 3.987 | 1.996 | 128 | 22 | 11 / 11 |
| `6M` | 5.769 | 0,9960 | 35 | 188 | 238 | 3.230 | 2.327 | 233 | 44 | 7 / 7 |
| `12M` | 5.769 | 0,9943 | 53 | 230 | 295 | 3.390 | 2.770 | 296 | 58 | 22 / 22 |
| `12M-1M` | 5.769 | 0,9944 | 47 | 230,5 | 288 | 3.425 | 2.577 | 286 | 66 | 18 / 18 |
| `RELATIVE_STRENGTH` | 5.769 | 0,9943 | 53 | 230 | 295 | 3.390 | 2.770 | 296 | 58 | 22 / 22 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -46,2 % | 30,0 % | 18,8 | 78,2 | 59,4 | -3.425 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -16,2 % | 40,6 % | 36,2 | 83,5 | 47,3 | -2.728 |
| HERZ | (unclassified) | `HIGH_YIELD` | -33,5 % | 17,1 % | 25,2 | 70,4 | 45,2 | -2.605 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -65,2 % | -1,4 % | 11,3 | 49,5 | 38,1 | -2.200 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -29,0 % | 9,8 % | 27,6 | 64,4 | 36,9 | -2.127 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -14,0 % | 13,5 % | 38,7 | 67,4 | 28,7 | -1.658 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -13,3 % | 12,1 % | 39,4 | 66,5 | 27,1 | -1.563 |
| TASK | I · Services | `HIGH_YIELD` | -38,4 % | -4,0 % | 22,4 | 46,5 | 24,1 | -1.390 |
| PDX | (unclassified) | `HIGH_YIELD` | -9,4 % | 12,8 % | 44,3 | 67,0 | 22,7 | -1.311 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -11,4 % | 9,7 % | 41,6 | 64,3 | 22,7 | -1.310 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -5,9 % | 16,6 % | 47,9 | 70,0 | 22,1 | -1.275 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -6,9 % | 15,2 % | 46,9 | 68,9 | 22,0 | -1.268 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -4,7 % | 17,9 % | 49,2 | 70,8 | 21,6 | -1.246 |
| JCSE | D · Manufacturing | `HIGH_YIELD` | 3,2 % | 35,2 % | 60,2 | 81,0 | 20,7 | -1.195 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -17,9 % | 2,8 % | 34,8 | 55,4 | 20,6 | -1.189 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.246 | 0,00 % | 23 | -0,40 | 4,04 |
| `LOW_YIELD` | 755 | 1,07 % | 45 | -0,78 | 3,22 |
| `MEDIUM_YIELD` | 678 | 3,01 % | -16 | 0,28 | 1,36 |
| `HIGH_YIELD` | 1.090 | 6,47 % | -176 | 3,05 | 10,60 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.246 | 0,00 % | 25 | -0,43 | 4,07 |
| `LOW_YIELD` | 755 | 1,12 % | 58 | -1,01 | 3,08 |
| `MEDIUM_YIELD` | 678 | 3,29 % | -15 | 0,26 | 1,35 |
| `HIGH_YIELD` | 1.090 | 6,99 % | -162 | 2,80 | 10,05 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 778 | 5,08 % | -129 | 2,23 | 9,23 |
| REITs | 191 | 5,03 % | -98 | 1,70 | 11,78 |
| Energy | 148 | 2,51 % | 1 | -0,02 | 6,04 |
| Consumer Staples | 116 | 0,67 % | 3 | -0,04 | 3,57 |
| Financials | 867 | 1,61 % | 4 | -0,07 | 4,62 |
| Utilities | 142 | 2,74 % | 6 | -0,10 | 4,04 |
| Real Estate | 67 | 0,00 % | 11 | -0,19 | 10,04 |
| Communication | 127 | 0,00 % | 18 | -0,31 | 4,83 |
| (other) | 501 | 0,00 % | 19 | -0,33 | 3,71 |
| Industrials | 446 | 0,00 % | 20 | -0,34 | 3,82 |
| Consumer Discretionary | 432 | 0,00 % | 20 | -0,35 | 3,70 |
| Technology | 724 | 0,00 % | 20 | -0,35 | 3,74 |
| Materials | 298 | 0,00 % | 20 | -0,35 | 3,72 |
| Health Care | 932 | 0,00 % | 21 | -0,36 | 3,73 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 778 | 5,08 % | -129 | 2,23 | 9,23 |
| H · Finance, Insurance, And Real Estate | 1.125 | 2,28 % | 0 | 0,00 | 6,29 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 389 | 1,49 % | 5 | -0,09 | 4,38 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 18 | -0,30 | 3,63 |
| D · Manufacturing | 1.934 | 0,00 % | 19 | -0,33 | 3,69 |
| B · Mining | 242 | 0,00 % | 19 | -0,33 | 4,20 |
| F · Wholesale Trade | 101 | 0,00 % | 20 | -0,35 | 4,20 |
| I · Services | 893 | 0,00 % | 21 | -0,36 | 3,76 |
| G · Retail Trade | 223 | 0,00 % | 21 | -0,36 | 3,76 |
| C · Construction | 64 | 0,00 % | 35 | -0,61 | 3,97 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-21 (-1 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9328 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9431 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.610 / 5.769 / 5.769 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9934 · Median 56 Ränge · P95 351,6 · Maximum 3.173 · 487 Titel bewegen sich um mindestens 5 Perzentilpunkte, 114 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 356 | 343 | 24 | 11 | 9,8 % |
| Quality Momentum (`quality-momentum`) | 37 | 33 | 4 | 0 | 10,8 % |
| Future Leader (`future-leader`) | 24 | 22 | 2 | 0 | 8,3 % |
| Value Momentum (`value-momentum`) | 187 | 189 | 4 | 6 | 5,3 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-22 | 0 | 5.769 | 0,9944 | 47 | 288 | 286 | 18 / 18 |
| 2025-10-21 | 252 | 5.343 | 0,9929 | 53 | 330 | 566 | 7 / 7 |
| 2024-10-17 | 504 | 5.108 | 0,9924 | 53 | 271,6 | 337 | 19 / 19 |
| 2023-10-17 | 756 | 4.924 | 0,9794 | 64 | 274,8 | 450 | 24 / 24 |
| 2022-10-14 | 1.008 | 4.659 | 0,9956 | 36 | 207 | 192 | 19 / 19 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6685` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9971 · `6M` 0,9960 · `12M` 0,9943 · `12M-1M` 0,9944 · `RELATIVE_STRENGTH` 0,9943 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `31` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
