# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-29T03:38:50.000Z |
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
| geprüfte Ereignisse | 61.040 |
| davon konsistent | 60.231 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 755 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 28 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 21 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 511 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 244 | 3 | 17 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 465 von 3.186 geprüften Titeln (14,60 %).

**Erklärt: 760 · unerklärt: 49** (0,080 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.431 |
| Preisbasis | `close` 6.431 |
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

Stichtag **2026-10-28**, 5.774 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-28 | 5.792 | 18 | 5.774 | CMCSA, THRM, FCX, CIB, FMX, GJO, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, HSHP, DVXE, OCCIM |
| 2025-10-27 | 5.349 | 2 | 5.347 | FFNW, SBT |
| 2024-10-23 | 5.112 | 0 | 5.112 |  |
| 2023-10-23 | 4.936 | 11 | 4.925 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-10-20 | 4.668 | 0 | 4.668 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.774 | 0,9953 | 29 | 123 | 173 | 5.283 | 2.084 | 142 | 25 | 13 / 13 |
| `6M` | 5.774 | 0,9939 | 39 | 193,5 | 240,3 | 5.322 | 2.338 | 238 | 60 | 10 / 10 |
| `12M` | 5.774 | 0,9940 | 52 | 225 | 289,3 | 4.823 | 2.768 | 290 | 53 | 18 / 18 |
| `12M-1M` | 5.774 | 0,9945 | 47 | 230,7 | 283,3 | 3.443 | 2.585 | 283 | 66 | 19 / 19 |
| `RELATIVE_STRENGTH` | 5.774 | 0,9940 | 52 | 225 | 289,3 | 4.823 | 2.768 | 290 | 53 | 18 / 18 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -46,7 % | 28,8 % | 19,4 | 79,0 | 59,6 | -3.443 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -16,1 % | 40,8 % | 38,6 | 84,7 | 46,0 | -2.658 |
| HERZ | (unclassified) | `HIGH_YIELD` | -35,1 % | 14,4 % | 25,1 | 70,0 | 44,9 | -2.590 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -65,8 % | -2,9 % | 11,6 | 49,6 | 38,0 | -2.195 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -33,0 % | 3,7 % | 26,3 | 59,0 | 32,7 | -1.888 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -16,4 % | 10,3 % | 38,2 | 66,5 | 28,3 | -1.631 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -15,7 % | 8,9 % | 39,0 | 65,3 | 26,3 | -1.516 |
| PDX | (unclassified) | `HIGH_YIELD` | -9,0 % | 13,3 % | 46,6 | 69,2 | 22,6 | -1.305 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -7,3 % | 14,7 % | 48,2 | 70,3 | 22,1 | -1.275 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -6,6 % | 15,8 % | 49,1 | 71,0 | 21,9 | -1.264 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -10,7 % | 10,6 % | 44,9 | 66,7 | 21,8 | -1.259 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -12,6 % | 8,1 % | 42,6 | 64,3 | 21,8 | -1.257 |
| TASK | I · Services | `HIGH_YIELD` | -42,4 % | -10,3 % | 21,2 | 41,4 | 20,2 | -1.163 |
| BCAT | (unclassified) | `HIGH_YIELD` | -6,6 % | 12,9 % | 49,1 | 68,9 | 19,8 | -1.141 |
| ELME | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -89,9 % | -36,5 % | 4,3 | 23,8 | 19,6 | -1.129 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.250 | 0,00 % | 24 | -0,42 | 4,06 |
| `LOW_YIELD` | 759 | 1,06 % | 44 | -0,76 | 3,09 |
| `MEDIUM_YIELD` | 676 | 3,00 % | -17 | 0,29 | 1,39 |
| `HIGH_YIELD` | 1.089 | 6,37 % | -168 | 2,91 | 10,49 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.250 | 0,00 % | 31 | -0,54 | 3,93 |
| `LOW_YIELD` | 759 | 1,11 % | 50 | -0,87 | 2,96 |
| `MEDIUM_YIELD` | 676 | 3,23 % | -16 | 0,28 | 1,35 |
| `HIGH_YIELD` | 1.089 | 6,91 % | -160 | 2,77 | 9,87 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 783 | 5,00 % | -122 | 2,11 | 9,22 |
| REITs | 191 | 4,89 % | -86 | 1,49 | 10,87 |
| Energy | 148 | 2,26 % | -1 | 0,01 | 6,23 |
| Consumer Staples | 116 | 0,67 % | 4 | -0,07 | 3,75 |
| Financials | 867 | 1,58 % | 6 | -0,10 | 4,97 |
| Utilities | 142 | 2,75 % | 7 | -0,12 | 4,14 |
| Real Estate | 67 | 0,00 % | 10 | -0,17 | 10,68 |
| Communication | 127 | 0,00 % | 18 | -0,31 | 4,06 |
| Materials | 298 | 0,00 % | 18 | -0,31 | 3,74 |
| Industrials | 445 | 0,00 % | 19 | -0,33 | 3,79 |
| (other) | 501 | 0,00 % | 20 | -0,35 | 3,67 |
| Consumer Discretionary | 432 | 0,00 % | 20 | -0,35 | 3,68 |
| Technology | 724 | 0,00 % | 20 | -0,35 | 3,79 |
| Health Care | 933 | 0,00 % | 21 | -0,36 | 3,61 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 783 | 5,00 % | -122 | 2,11 | 9,22 |
| H · Finance, Insurance, And Real Estate | 1.125 | 2,25 % | 1 | -0,02 | 6,64 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 389 | 1,61 % | 6 | -0,10 | 4,22 |
| F · Wholesale Trade | 101 | 0,00 % | 18 | -0,31 | 4,85 |
| D · Manufacturing | 1.934 | 0,00 % | 19 | -0,33 | 3,65 |
| I · Services | 894 | 0,00 % | 20 | -0,35 | 3,77 |
| G · Retail Trade | 223 | 0,00 % | 20 | -0,35 | 3,69 |
| B · Mining | 242 | 0,00 % | 22 | -0,38 | 4,26 |
| C · Construction | 63 | 0,00 % | 26 | -0,45 | 3,89 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 28 | -0,49 | 3,29 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-26 (-2 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9343 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9434 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.611 / 5.774 / 5.774 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9936 · Median 56 Ränge · P95 337 · Maximum 3.130 · 420 Titel bewegen sich um mindestens 5 Perzentilpunkte, 106 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 350 | 336 | 24 | 10 | 9,7 % |
| Quality Momentum (`quality-momentum`) | 39 | 37 | 2 | 0 | 5,1 % |
| Future Leader (`future-leader`) | 20 | 20 | 0 | 0 | 0,0 % |
| Value Momentum (`value-momentum`) | 203 | 194 | 10 | 1 | 5,4 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-28 | 0 | 5.774 | 0,9945 | 47 | 283,3 | 283 | 19 / 19 |
| 2025-10-27 | 252 | 5.347 | 0,9929 | 52 | 339 | 565 | 7 / 7 |
| 2024-10-23 | 504 | 5.112 | 0,9927 | 55 | 274,2 | 285 | 14 / 14 |
| 2023-10-23 | 756 | 4.925 | 0,9743 | 68 | 285,9 | 533 | 35 / 35 |
| 2022-10-20 | 1.008 | 4.668 | 0,9960 | 34 | 199,3 | 183 | 18 / 18 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6685` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9953 · `6M` 0,9939 · `12M` 0,9940 · `12M-1M` 0,9945 · `RELATIVE_STRENGTH` 0,9940 |
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
