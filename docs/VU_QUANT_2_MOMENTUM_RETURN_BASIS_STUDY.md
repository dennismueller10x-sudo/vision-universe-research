# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-10T19:18:17.000Z |
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
| geprüfte Ereignisse | 62.592 |
| davon konsistent | 61.788 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 760 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 27 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 15 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 512 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 248 | 0 | 11 | 11 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 458 von 3.295 geprüften Titeln (13,90 %).

**Erklärt: 762 · unerklärt: 42** (0,067 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_ATRO` 4/10.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.594 |
| Preisbasis | `close` 6.594 |
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

Stichtag **2026-10-09**, 5.903 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-09 | 5.916 | 13 | 5.903 | CMCSA, THRM, CIB, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, DVXE |
| 2025-10-08 | 5.450 | 2 | 5.448 | FFNW, SBT |
| 2024-10-04 | 5.200 | 0 | 5.200 |  |
| 2023-10-04 | 5.014 | 9 | 5.005 | NYT, GAP, CUZ, BNS, PKBK, BRX, NFE, CDZIP, SLVM |
| 2022-10-03 | 4.699 | 0 | 4.699 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.903 | 0,9961 | 34 | 162,5 | 194,9 | 4.297 | 2.202 | 174 | 28 | 9 / 9 |
| `6M` | 5.903 | 0,9948 | 45 | 232 | 286,8 | 3.718 | 2.625 | 283 | 54 | 8 / 8 |
| `12M` | 5.903 | 0,9937 | 52 | 278 | 318,9 | 3.553 | 2.776 | 472 | 60 | 24 / 24 |
| `12M-1M` | 5.903 | 0,9938 | 46 | 285 | 337 | 3.498 | 2.618 | 505 | 74 | 17 / 17 |
| `RELATIVE_STRENGTH` | 5.903 | 0,9937 | 52 | 278 | 318,9 | 3.553 | 2.776 | 472 | 60 | 24 / 24 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -45,8 % | 30,9 % | 18,8 | 78,0 | 59,3 | -3.498 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -18,4 % | 35,5 % | 33,3 | 80,6 | 47,3 | -2.792 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -62,7 % | 5,8 % | 12,3 | 58,8 | 46,5 | -2.744 |
| HERZ | (unclassified) | `HIGH_YIELD` | -33,6 % | 15,7 % | 24,3 | 68,8 | 44,5 | -2.627 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -23,3 % | 18,6 % | 30,3 | 70,5 | 40,2 | -2.374 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,3 % | 14,3 % | 38,3 | 67,8 | 29,4 | -1.738 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -16,9 % | 7,4 % | 34,8 | 61,3 | 26,5 | -1.563 |
| PDX | (unclassified) | `HIGH_YIELD` | -10,3 % | 11,6 % | 41,3 | 65,7 | 24,5 | -1.444 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,9 % | -14,8 % | 10,7 | 34,7 | 24,0 | -1.416 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -5,2 % | 17,5 % | 47,1 | 69,9 | 22,9 | -1.349 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -4,9 % | 17,5 % | 47,4 | 69,9 | 22,6 | -1.332 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -2,6 % | 20,6 % | 49,8 | 72,1 | 22,3 | -1.317 |
| ECAT | (unclassified) | `HIGH_YIELD` | -9,6 % | 10,1 % | 42,1 | 64,4 | 22,3 | -1.316 |
| JCSE | D · Manufacturing | `HIGH_YIELD` | 1,0 % | 32,3 % | 56,8 | 78,8 | 22,1 | -1.302 |
| XV | (unclassified) | `HIGH_YIELD` | -8,7 % | 8,3 % | 43,2 | 62,4 | 19,3 | -1.137 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.272 | 0,00 % | 25 | -0,42 | 5,22 |
| `LOW_YIELD` | 757 | 1,03 % | 48 | -0,81 | 3,87 |
| `MEDIUM_YIELD` | 681 | 3,02 % | -14 | 0,24 | 1,63 |
| `HIGH_YIELD` | 1.193 | 6,36 % | -162 | 2,74 | 10,60 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.272 | 0,00 % | 30 | -0,51 | 4,89 |
| `LOW_YIELD` | 757 | 1,10 % | 52 | -0,88 | 3,51 |
| `MEDIUM_YIELD` | 681 | 3,17 % | -13 | 0,22 | 1,61 |
| `HIGH_YIELD` | 1.193 | 6,95 % | -167 | 2,83 | 9,97 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 206 | 5,24 % | -102 | 1,72 | 11,08 |
| (unclassified) | 799 | 4,71 % | -99 | 1,68 | 9,66 |
| Energy | 149 | 2,55 % | 0 | 0,00 | 5,52 |
| Consumer Staples | 117 | 0,93 % | 2 | -0,03 | 4,17 |
| Financials | 925 | 1,74 % | 4 | -0,07 | 5,71 |
| Utilities | 157 | 3,00 % | 4 | -0,07 | 4,44 |
| Real Estate | 69 | 0,00 % | 12 | -0,20 | 11,45 |
| Communication | 133 | 0,00 % | 18 | -0,30 | 5,37 |
| Industrials | 449 | 0,00 % | 19 | -0,32 | 4,44 |
| (other) | 501 | 0,00 % | 19 | -0,32 | 4,15 |
| Health Care | 934 | 0,00 % | 20 | -0,34 | 3,91 |
| Technology | 731 | 0,00 % | 20 | -0,34 | 4,47 |
| Consumer Discretionary | 433 | 0,00 % | 23 | -0,39 | 3,97 |
| Materials | 300 | 0,00 % | 24 | -0,40 | 4,19 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 799 | 4,71 % | -99 | 1,68 | 9,66 |
| H · Finance, Insurance, And Real Estate | 1.200 | 2,42 % | 0 | 0,00 | 6,70 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 414 | 1,64 % | 6 | -0,10 | 4,54 |
| F · Wholesale Trade | 100 | 0,00 % | 18 | -0,30 | 4,09 |
| D · Manufacturing | 1.941 | 0,00 % | 19 | -0,32 | 4,22 |
| I · Services | 897 | 0,00 % | 20 | -0,34 | 4,43 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 22 | -0,36 | 2,55 |
| B · Mining | 244 | 0,00 % | 23 | -0,38 | 5,03 |
| G · Retail Trade | 224 | 0,00 % | 23 | -0,39 | 3,74 |
| C · Construction | 64 | 0,00 % | 41 | -0,69 | 5,26 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-06 (-3 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9299 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9417 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.746 / 5.903 / 5.903 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9921 · Median 61 Ränge · P95 415,4 · Maximum 3.405 · 631 Titel bewegen sich um mindestens 5 Perzentilpunkte, 139 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 352 | 342 | 18 | 8 | 7,4 % |
| Quality Momentum (`quality-momentum`) | 40 | 36 | 5 | 1 | 15,0 % |
| Future Leader (`future-leader`) | 28 | 27 | 3 | 2 | 17,9 % |
| Value Momentum (`value-momentum`) | 185 | 179 | 7 | 1 | 4,3 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-09 | 0 | 5.903 | 0,9938 | 46 | 337 | 505 | 17 / 17 |
| 2025-10-08 | 252 | 5.448 | 0,9920 | 51 | 366 | 576 | 9 / 9 |
| 2024-10-04 | 504 | 5.200 | 0,9927 | 54 | 283,1 | 456 | 22 / 22 |
| 2023-10-04 | 756 | 5.005 | 0,9849 | 62 | 289 | 419 | 23 / 23 |
| 2022-10-03 | 1.008 | 4.699 | 0,9953 | 36 | 210 | 191 | 23 / 23 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6852` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9961 · `6M` 0,9948 · `12M` 0,9937 · `12M-1M` 0,9938 · `RELATIVE_STRENGTH` 0,9937 |
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
