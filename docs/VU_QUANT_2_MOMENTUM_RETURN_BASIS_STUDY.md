# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-13T04:40:51.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.195 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.685 |
| `TRADING_DATES_AVAILABLE` | 6.685 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.685 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.685 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.685. Bereinigungsstufe: `adjusted` 6.683 · `splitAdjustedReconstructible` 2.

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
| geprüfte Titel | 3.182 |
| geprüfte Ereignisse | 60.961 |
| davon konsistent | 60.163 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 751 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 27 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 15 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 508 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 243 | 3 | 11 | 11 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 457 von 3.182 geprüften Titeln (14,36 %).

**Erklärt: 756 · unerklärt: 42** (0,069 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.443 |
| Preisbasis | `close` 6.443 |
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

Stichtag **2026-10-12**, 5.766 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-12 | 5.779 | 13 | 5.766 | CMCSA, THRM, CIB, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, DVXE |
| 2025-10-09 | 5.331 | 2 | 5.329 | FFNW, SBT |
| 2024-10-07 | 5.103 | 0 | 5.103 |  |
| 2023-10-05 | 4.932 | 9 | 4.923 | NYT, GAP, CUZ, BNS, PKBK, BRX, NFE, CDZIP, SLVM |
| 2022-10-04 | 4.640 | 0 | 4.640 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.766 | 0,9967 | 29 | 125 | 173,4 | 4.062 | 2.051 | 132 | 26 | 11 / 11 |
| `6M` | 5.766 | 0,9954 | 42 | 209 | 253 | 3.551 | 2.452 | 260 | 55 | 12 / 12 |
| `12M` | 5.766 | 0,9943 | 49 | 241 | 295 | 3.387 | 2.680 | 297 | 58 | 19 / 19 |
| `12M-1M` | 5.766 | 0,9944 | 43 | 252 | 285 | 3.334 | 2.528 | 280 | 61 | 22 / 22 |
| `RELATIVE_STRENGTH` | 5.766 | 0,9943 | 49 | 241 | 295 | 3.387 | 2.680 | 297 | 58 | 19 / 19 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -45,6 % | 31,5 % | 19,3 | 77,2 | 57,8 | -3.334 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -16,8 % | 38,2 % | 34,4 | 80,8 | 46,5 | -2.679 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -62,6 % | 6,0 % | 12,5 | 57,8 | 45,3 | -2.614 |
| HERZ | (unclassified) | `HIGH_YIELD` | -33,1 % | 16,6 % | 24,7 | 68,0 | 43,3 | -2.497 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -23,8 % | 17,9 % | 30,3 | 69,0 | 38,7 | -2.231 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,0 % | 14,8 % | 38,2 | 66,7 | 28,5 | -1.644 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -14,7 % | 10,2 % | 36,3 | 63,0 | 26,7 | -1.538 |
| PDX | (unclassified) | `HIGH_YIELD` | -10,0 % | 12,6 % | 40,8 | 65,1 | 24,4 | -1.404 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -9,6 % | 12,0 % | 41,3 | 64,3 | 23,0 | -1.325 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -68,4 % | -16,2 % | 10,7 | 33,5 | 22,8 | -1.316 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -5,4 % | 16,9 % | 45,9 | 68,3 | 22,4 | -1.291 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -2,4 % | 20,9 % | 49,4 | 71,0 | 21,6 | -1.243 |
| ECAT | (unclassified) | `HIGH_YIELD` | -11,2 % | 8,1 % | 39,8 | 60,5 | 20,7 | -1.192 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -0,5 % | 23,2 % | 52,1 | 72,6 | 20,4 | -1.177 |
| XV | (unclassified) | `HIGH_YIELD` | -7,9 % | 9,2 % | 43,2 | 62,1 | 19,0 | -1.093 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.237 | 0,00 % | 24 | -0,42 | 4,48 |
| `LOW_YIELD` | 757 | 1,06 % | 45 | -0,78 | 3,28 |
| `MEDIUM_YIELD` | 679 | 3,06 % | -15 | 0,26 | 1,34 |
| `HIGH_YIELD` | 1.093 | 6,46 % | -160 | 2,78 | 10,47 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.237 | 0,00 % | 27 | -0,47 | 4,28 |
| `LOW_YIELD` | 757 | 1,13 % | 47 | -0,82 | 3,20 |
| `MEDIUM_YIELD` | 679 | 3,22 % | -15 | 0,26 | 1,37 |
| `HIGH_YIELD` | 1.093 | 6,97 % | -157 | 2,72 | 10,12 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 766 | 4,61 % | -95 | 1,65 | 9,12 |
| REITs | 191 | 5,04 % | -87 | 1,51 | 10,95 |
| Energy | 148 | 2,54 % | 0 | 0,00 | 6,00 |
| Consumer Staples | 117 | 0,69 % | 4 | -0,07 | 3,51 |
| Financials | 863 | 1,66 % | 5 | -0,09 | 4,86 |
| Utilities | 142 | 2,92 % | 6 | -0,10 | 4,61 |
| Real Estate | 67 | 0,00 % | 14 | -0,24 | 10,37 |
| (other) | 504 | 0,00 % | 18 | -0,31 | 3,62 |
| Technology | 726 | 0,00 % | 19 | -0,33 | 4,14 |
| Industrials | 447 | 0,00 % | 19 | -0,33 | 4,12 |
| Communication | 129 | 0,00 % | 19 | -0,33 | 5,10 |
| Health Care | 933 | 0,00 % | 20 | -0,35 | 3,66 |
| Materials | 300 | 0,00 % | 20 | -0,35 | 3,66 |
| Consumer Discretionary | 433 | 0,00 % | 21 | -0,36 | 3,72 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 766 | 4,61 % | -95 | 1,65 | 9,12 |
| H · Finance, Insurance, And Real Estate | 1.121 | 2,31 % | 1 | -0,02 | 6,04 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 392 | 1,55 % | 8 | -0,14 | 4,63 |
| F · Wholesale Trade | 101 | 0,00 % | 15 | -0,26 | 3,61 |
| B · Mining | 243 | 0,00 % | 17 | -0,29 | 4,48 |
| D · Manufacturing | 1.941 | 0,00 % | 18 | -0,31 | 3,71 |
| I · Services | 894 | 0,00 % | 19 | -0,33 | 4,31 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 20 | -0,35 | 2,36 |
| G · Retail Trade | 224 | 0,00 % | 22 | -0,38 | 3,67 |
| C · Construction | 64 | 0,00 % | 27 | -0,46 | 3,80 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-09 (-3 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9358 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9460 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.616 / 5.766 / 5.766 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9932 · Median 55 Ränge · P95 361,5 · Maximum 3.259 · 515 Titel bewegen sich um mindestens 5 Perzentilpunkte, 113 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 347 | 337 | 18 | 8 | 7,5 % |
| Quality Momentum (`quality-momentum`) | 38 | 36 | 3 | 1 | 10,5 % |
| Future Leader (`future-leader`) | 26 | 23 | 3 | 0 | 11,5 % |
| Value Momentum (`value-momentum`) | 184 | 181 | 7 | 4 | 6,0 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-12 | 0 | 5.766 | 0,9944 | 43 | 285 | 280 | 22 / 22 |
| 2025-10-09 | 252 | 5.329 | 0,9927 | 49 | 329 | 494 | 10 / 10 |
| 2024-10-07 | 504 | 5.103 | 0,9928 | 48 | 278,9 | 368 | 19 / 19 |
| 2023-10-05 | 756 | 4.923 | 0,9850 | 58 | 290,8 | 446 | 23 / 23 |
| 2022-10-04 | 1.008 | 4.640 | 0,9953 | 35 | 211,1 | 199 | 26 / 26 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6685` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9967 · `6M` 0,9954 · `12M` 0,9943 · `12M-1M` 0,9944 · `RELATIVE_STRENGTH` 0,9943 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `24` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
