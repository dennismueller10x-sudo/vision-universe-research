# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-05T04:28:28.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.204 |
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
| geprüfte Titel | 3.191 |
| geprüfte Ereignisse | 61.137 |
| davon konsistent | 60.324 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 755 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 29 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 24 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 512 | 2 | 4 | 17 |
| `ORDINARY_DIVIDEND` | 243 | 3 | 20 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 470 von 3.191 geprüften Titeln (14,73 %).

**Erklärt: 760 · unerklärt: 53** (0,087 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.408 |
| Preisbasis | `close` 6.408 |
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

Stichtag **2026-11-04**, 5.779 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-04 | 5.801 | 22 | 5.779 | CMCSA, THRM, FCX, CIB, FMX, TVE, GJO, GJT, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, RLYB, HSHP, DVXE, OCCIM, TWOD |
| 2025-11-03 | 5.356 | 2 | 5.354 | FFNW, SBT |
| 2024-10-30 | 5.113 | 0 | 5.113 |  |
| 2023-10-30 | 4.940 | 11 | 4.929 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-10-27 | 4.682 | 0 | 4.682 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.779 | 0,9950 | 26 | 153 | 186 | 5.682 | 2.014 | 163 | 31 | 13 / 13 |
| `6M` | 5.779 | 0,9940 | 35 | 183 | 232 | 5.541 | 2.241 | 217 | 49 | 14 / 14 |
| `12M` | 5.779 | 0,9928 | 51 | 236 | 299 | 5.494 | 2.746 | 310 | 66 | 24 / 24 |
| `12M-1M` | 5.779 | 0,9947 | 51 | 231,5 | 300,1 | 2.723 | 2.713 | 313 | 61 | 14 / 14 |
| `RELATIVE_STRENGTH` | 5.779 | 0,9928 | 51 | 236 | 299 | 5.494 | 2.746 | 310 | 66 | 24 / 24 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -18,5 % | 36,7 % | 34,4 | 81,6 | 47,1 | -2.723 |
| HERZ | (unclassified) | `HIGH_YIELD` | -34,3 % | 15,6 % | 24,1 | 68,5 | 44,4 | -2.564 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -30,8 % | 7,1 % | 26,0 | 60,6 | 34,6 | -1.999 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -66,9 % | -6,2 % | 10,9 | 43,6 | 32,7 | -1.890 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 8,2 % | 93,7 % | 64,8 | 94,7 | 30,0 | -1.731 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -17,2 % | 9,2 % | 35,4 | 63,1 | 27,7 | -1.601 |
| TASK | I · Services | `HIGH_YIELD` | -36,8 % | -1,6 % | 22,9 | 48,4 | 25,6 | -1.479 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -17,7 % | 6,3 % | 34,9 | 59,6 | 24,6 | -1.423 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -13,5 % | 8,3 % | 39,4 | 62,2 | 22,8 | -1.318 |
| PDX | (unclassified) | `HIGH_YIELD` | -6,9 % | 15,8 % | 46,0 | 68,7 | 22,7 | -1.311 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -11,2 % | 9,9 % | 42,1 | 63,8 | 21,7 | -1.251 |
| ETD | D · Manufacturing | `HIGH_YIELD` | -11,9 % | 8,8 % | 41,4 | 62,6 | 21,2 | -1.227 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -0,1 % | 23,8 % | 53,8 | 74,3 | 20,5 | -1.184 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -15,2 % | 5,1 % | 37,5 | 58,0 | 20,5 | -1.183 |
| BCAT | (unclassified) | `HIGH_YIELD` | -6,8 % | 12,7 % | 46,2 | 66,2 | 20,0 | -1.155 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.256 | 0,00 % | 28 | -0,48 | 4,01 |
| `LOW_YIELD` | 765 | 1,10 % | 49 | -0,85 | 3,16 |
| `MEDIUM_YIELD` | 670 | 3,08 % | -16 | 0,28 | 1,43 |
| `HIGH_YIELD` | 1.088 | 6,75 % | -170 | 2,93 | 10,24 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.256 | 0,00 % | 33 | -0,57 | 4,17 |
| `LOW_YIELD` | 765 | 1,17 % | 54 | -0,93 | 3,18 |
| `MEDIUM_YIELD` | 670 | 3,38 % | -19 | 0,32 | 1,50 |
| `HIGH_YIELD` | 1.088 | 7,05 % | -163 | 2,82 | 10,37 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 794 | 4,95 % | -116 | 2,01 | 9,22 |
| REITs | 190 | 5,39 % | -116 | 2,00 | 9,72 |
| Energy | 148 | 2,40 % | -1 | 0,02 | 5,49 |
| Utilities | 142 | 2,92 % | 1 | -0,01 | 3,81 |
| Consumer Staples | 116 | 0,67 % | 4 | -0,06 | 3,69 |
| Financials | 869 | 1,65 % | 6 | -0,10 | 4,68 |
| Real Estate | 66 | 0,00 % | 11 | -0,18 | 9,82 |
| Communication | 127 | 0,00 % | 17 | -0,29 | 4,99 |
| (other) | 500 | 0,00 % | 20 | -0,34 | 3,67 |
| Industrials | 444 | 0,00 % | 20 | -0,35 | 3,63 |
| Materials | 298 | 0,00 % | 22 | -0,38 | 3,55 |
| Health Care | 932 | 0,00 % | 23 | -0,40 | 3,57 |
| Technology | 722 | 0,00 % | 23 | -0,40 | 3,72 |
| Consumer Discretionary | 431 | 0,00 % | 24 | -0,42 | 3,62 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 794 | 4,95 % | -116 | 2,01 | 9,22 |
| H · Finance, Insurance, And Real Estate | 1.125 | 2,22 % | 1 | -0,02 | 6,97 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 390 | 1,62 % | 4 | -0,07 | 4,48 |
| F · Wholesale Trade | 101 | 0,00 % | 16 | -0,28 | 3,96 |
| D · Manufacturing | 1.931 | 0,00 % | 19 | -0,33 | 3,58 |
| I · Services | 891 | 0,00 % | 23 | -0,40 | 3,70 |
| B · Mining | 242 | 0,00 % | 24 | -0,42 | 4,67 |
| G · Retail Trade | 222 | 0,00 % | 26 | -0,44 | 3,87 |
| C · Construction | 63 | 0,00 % | 32 | -0,55 | 3,51 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 34 | -0,59 | 3,65 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-03 (-1 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9330 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9429 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.606 / 5.779 / 5.779 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9929 · Median 56 Ränge · P95 356,1 · Maximum 3.153,5 · 515 Titel bewegen sich um mindestens 5 Perzentilpunkte, 140 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 347 | 335 | 25 | 13 | 11,0 % |
| Quality Momentum (`quality-momentum`) | 39 | 39 | 1 | 1 | 5,1 % |
| Future Leader (`future-leader`) | 17 | 15 | 2 | 0 | 11,8 % |
| Value Momentum (`value-momentum`) | 219 | 217 | 7 | 5 | 5,5 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-04 | 0 | 5.779 | 0,9947 | 51 | 300,1 | 313 | 14 / 14 |
| 2025-11-03 | 252 | 5.354 | 0,9919 | 52 | 363,3 | 677 | 5 / 5 |
| 2024-10-30 | 504 | 5.113 | 0,9925 | 57 | 299 | 376 | 16 / 16 |
| 2023-10-30 | 756 | 4.929 | 0,9733 | 69 | 302 | 512 | 39 / 39 |
| 2022-10-27 | 1.008 | 4.682 | 0,9960 | 39 | 192,9 | 157 | 22 / 22 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6685` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9950 · `6M` 0,9940 · `12M` 0,9928 · `12M-1M` 0,9947 · `RELATIVE_STRENGTH` 0,9928 |
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
