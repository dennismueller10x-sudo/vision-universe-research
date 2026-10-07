# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-07T03:24:53.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.853 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.852 |
| `RAW_CLOSE_AVAILABLE` | 6.852 |
| `SPLIT_FACTOR_AVAILABLE` | 6.852 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.852 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.308 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.852 |
| `TRADING_DATES_AVAILABLE` | 6.852 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.852 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.852 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.852. Bereinigungsstufe: `adjusted` 6.852.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.852 Titel von 6.853 im Produktuniversum, 6.852 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.295 |
| geprüfte Ereignisse | 62.573 |
| davon konsistent | 61.773 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 759 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 26 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 13 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 512 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 247 | 0 | 9 | 10 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 454 von 3.295 geprüften Titeln (13,78 %).

**Erklärt: 761 · unerklärt: 39** (0,062 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_ATRO` 4/10 · `ref_BSET` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.598 |
| Preisbasis | `close` 6.598 |
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

Stichtag **2026-10-06**, 5.900 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-06 | 5.912 | 12 | 5.900 | THRM, CIB, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, DVXE |
| 2025-10-03 | 5.442 | 2 | 5.440 | FFNW, SBT |
| 2024-10-01 | 5.198 | 0 | 5.198 |  |
| 2023-09-29 | 5.011 | 7 | 5.004 | CUZ, BNS, PKBK, BRX, NFE, CDZIP, SLVM |
| 2022-09-28 | 4.693 | 0 | 4.693 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.900 | 0,9961 | 33 | 174 | 205,1 | 4.222 | 2.225 | 190 | 31 | 16 / 16 |
| `6M` | 5.900 | 0,9950 | 45 | 216 | 284,5 | 3.465 | 2.635 | 280 | 50 | 12 / 12 |
| `12M` | 5.900 | 0,9939 | 56 | 272,1 | 323,1 | 3.574 | 2.837 | 445 | 59 | 21 / 21 |
| `12M-1M` | 5.900 | 0,9939 | 49 | 283 | 334 | 3.524 | 2.652 | 551 | 65 | 15 / 15 |
| `RELATIVE_STRENGTH` | 5.900 | 0,9939 | 56 | 272,1 | 323,1 | 3.574 | 2.837 | 445 | 59 | 21 / 21 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -45,0 % | 33,0 % | 18,1 | 77,8 | 59,7 | -3.524 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -23,5 % | 27,0 % | 28,2 | 74,6 | 46,4 | -2.739 |
| HERZ | (unclassified) | `HIGH_YIELD` | -33,6 % | 15,6 % | 22,6 | 66,5 | 43,9 | -2.592 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -63,1 % | 4,7 % | 11,3 | 54,3 | 43,0 | -2.537 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -24,1 % | 17,5 % | 27,8 | 68,3 | 40,5 | -2.390 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,2 % | 14,4 % | 35,8 | 65,6 | 29,8 | -1.758 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -18,4 % | 5,4 % | 31,4 | 55,5 | 24,1 | -1.423 |
| PDX | (unclassified) | `HIGH_YIELD` | -11,0 % | 10,7 % | 38,1 | 62,2 | 24,0 | -1.417 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -6,4 % | 15,9 % | 43,2 | 66,9 | 23,7 | -1.398 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -11,1 % | 10,1 % | 38,0 | 61,6 | 23,6 | -1.394 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,1 % | -12,8 % | 10,2 | 33,8 | 23,6 | -1.390 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -4,3 % | 18,3 % | 45,5 | 68,9 | 23,5 | -1.385 |
| JCSE | D · Manufacturing | `HIGH_YIELD` | 1,0 % | 32,3 % | 54,2 | 77,4 | 23,2 | -1.369 |
| IVR | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -7,2 % | 14,0 % | 42,3 | 65,3 | 23,0 | -1.356 |
| ECAT | (unclassified) | `HIGH_YIELD` | -7,9 % | 12,1 % | 41,7 | 63,4 | 21,8 | -1.284 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.270 | 0,00 % | 25 | -0,42 | 5,36 |
| `LOW_YIELD` | 758 | 1,08 % | 46 | -0,78 | 3,57 |
| `MEDIUM_YIELD` | 677 | 3,01 % | -17 | 0,29 | 1,65 |
| `HIGH_YIELD` | 1.195 | 6,34 % | -168 | 2,85 | 10,41 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.270 | 0,00 % | 30 | -0,51 | 4,89 |
| `LOW_YIELD` | 758 | 1,12 % | 46 | -0,78 | 3,70 |
| `MEDIUM_YIELD` | 677 | 3,17 % | -13 | 0,22 | 1,59 |
| `HIGH_YIELD` | 1.195 | 6,94 % | -168 | 2,85 | 9,90 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 206 | 5,01 % | -100 | 1,70 | 11,76 |
| (unclassified) | 795 | 4,77 % | -100 | 1,70 | 9,26 |
| Energy | 149 | 2,65 % | -2 | 0,03 | 6,48 |
| Utilities | 156 | 3,03 % | 0 | 0,00 | 4,95 |
| Consumer Staples | 117 | 0,95 % | 2 | -0,03 | 3,72 |
| Financials | 926 | 1,73 % | 4 | -0,07 | 5,66 |
| Real Estate | 69 | 0,00 % | 14 | -0,24 | 10,02 |
| Communication | 134 | 0,00 % | 16 | -0,27 | 5,60 |
| Industrials | 450 | 0,00 % | 17 | -0,29 | 4,65 |
| Technology | 731 | 0,00 % | 19 | -0,32 | 3,98 |
| (other) | 501 | 0,00 % | 19 | -0,32 | 4,41 |
| Health Care | 933 | 0,00 % | 19 | -0,32 | 3,91 |
| Materials | 300 | 0,00 % | 22 | -0,36 | 3,78 |
| Consumer Discretionary | 433 | 0,00 % | 25 | -0,42 | 4,32 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 795 | 4,77 % | -100 | 1,70 | 9,26 |
| H · Finance, Insurance, And Real Estate | 1.201 | 2,37 % | 0 | 0,00 | 6,37 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 415 | 1,67 % | 4 | -0,07 | 5,04 |
| F · Wholesale Trade | 100 | 0,00 % | 17 | -0,29 | 3,94 |
| B · Mining | 244 | 0,00 % | 18 | -0,31 | 4,93 |
| D · Manufacturing | 1.940 | 0,00 % | 19 | -0,32 | 3,93 |
| I · Services | 897 | 0,00 % | 20 | -0,34 | 4,54 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 22 | -0,36 | 5,34 |
| C · Construction | 64 | 0,00 % | 25 | -0,42 | 4,94 |
| G · Retail Trade | 224 | 0,00 % | 26 | -0,43 | 4,22 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-05 (-1 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9396 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9499 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.751 / 5.900 / 5.900 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9923 · Median 60 Ränge · P95 421,1 · Maximum 3.337 · 633 Titel bewegen sich um mindestens 5 Perzentilpunkte, 139 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 355 | 346 | 17 | 8 | 7,0 % |
| Quality Momentum (`quality-momentum`) | 40 | 41 | 0 | 1 | 2,4 % |
| Future Leader (`future-leader`) | 28 | 27 | 1 | 0 | 3,6 % |
| Value Momentum (`value-momentum`) | 191 | 182 | 14 | 5 | 10,0 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-06 | 0 | 5.900 | 0,9939 | 49 | 334 | 551 | 15 / 15 |
| 2025-10-03 | 252 | 5.440 | 0,9923 | 50 | 351 | 528 | 10 / 10 |
| 2024-10-01 | 504 | 5.198 | 0,9933 | 54 | 294 | 525 | 21 / 21 |
| 2023-09-29 | 756 | 5.004 | 0,9848 | 63 | 300,8 | 481 | 25 / 25 |
| 2022-09-28 | 1.008 | 4.693 | 0,9952 | 36 | 220,4 | 199 | 21 / 21 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6852` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9961 · `6M` 0,9950 · `12M` 0,9939 · `12M-1M` 0,9939 · `RELATIVE_STRENGTH` 0,9939 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `21` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
