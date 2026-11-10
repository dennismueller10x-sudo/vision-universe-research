# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-11-10T00:21:51.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.308 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.307 |
| `RAW_CLOSE_AVAILABLE` | 6.307 |
| `SPLIT_FACTOR_AVAILABLE` | 6.307 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.307 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.017 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.307 |
| `TRADING_DATES_AVAILABLE` | 6.307 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.307 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.307 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.307. Bereinigungsstufe: `adjusted` 6.307.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.307 Titel von 6.308 im Produktuniversum, 6.307 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.004 |
| geprüfte Ereignisse | 59.778 |
| davon konsistent | 58.961 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 752 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 31 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 29 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 5 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 513 | 2 | 7 | 17 |
| `ORDINARY_DIVIDEND` | 239 | 3 | 24 | 12 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 467 von 3.004 geprüften Titeln (15,55 %).

**Erklärt: 757 · unerklärt: 60** (0,100 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_NYT` 23/24 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_T` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.155 |
| Preisbasis | `close` 6.155 |
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

Stichtag **2026-11-09**, 5.712 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-11-09 | 5.738 | 26 | 5.712 | CMCSA, THRM, FCX, CIB, FMX, TVE, SITC, GJO, GJT, KNDI, FFNW, TFII, ARI, CARE, VISN, FSV, SBT, DCOMP, GOCOQ, VOXR, RLYB, HSHP, FER, DVXE, OCCIM, TWOD |
| 2025-11-06 | 5.345 | 2 | 5.343 | FFNW, SBT |
| 2024-11-04 | 5.105 | 0 | 5.105 |  |
| 2023-11-02 | 4.928 | 11 | 4.917 | NYT, GAP, CUZ, BNS, PKBK, OC, ACM, BRX, NFE, CDZIP, SLVM |
| 2022-11-01 | 4.679 | 0 | 4.679 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.712 | 0,9949 | 26 | 125 | 160 | 5.637 | 1.904 | 139 | 25 | 13 / 13 |
| `6M` | 5.712 | 0,9934 | 31 | 172 | 214 | 5.611 | 2.207 | 215 | 38 | 14 / 14 |
| `12M` | 5.712 | 0,9921 | 53 | 231 | 298,9 | 5.408 | 2.720 | 300 | 56 | 24 / 24 |
| `12M-1M` | 5.712 | 0,9947 | 55 | 238 | 299 | 2.737 | 2.791 | 312 | 62 | 15 / 15 |
| `RELATIVE_STRENGTH` | 5.712 | 0,9921 | 53 | 231 | 298,9 | 5.408 | 2.720 | 300 | 56 | 24 / 24 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -20,2 % | 33,9 % | 31,8 | 79,7 | 47,9 | -2.737 |
| HERZ | (unclassified) | `HIGH_YIELD` | -37,5 % | 10,0 % | 21,8 | 63,0 | 41,2 | -2.354 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -30,0 % | 8,3 % | 25,6 | 61,2 | 35,6 | -2.033 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,1 % | -6,5 % | 10,6 | 42,4 | 31,8 | -1.816 |
| TASK | I · Services | `HIGH_YIELD` | -34,8 % | 1,5 % | 23,2 | 51,9 | 28,7 | -1.641 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -14,4 % | 12,9 % | 37,6 | 65,7 | 28,1 | -1.604 |
| YARW | D · Manufacturing | `HIGH_YIELD` | 11,5 % | 99,7 % | 67,1 | 94,8 | 27,7 | -1.582 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -11,8 % | 10,5 % | 40,1 | 63,5 | 23,3 | -1.333 |
| PDX | (unclassified) | `HIGH_YIELD` | -4,7 % | 18,6 % | 47,3 | 70,5 | 23,2 | -1.322 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -5,5 % | 17,1 % | 46,5 | 69,3 | 22,8 | -1.302 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -12,9 % | 7,8 % | 39,2 | 60,6 | 21,4 | -1.222 |
| ECAT | (unclassified) | `HIGH_YIELD` | -11,2 % | 8,2 % | 40,6 | 61,1 | 20,6 | -1.174 |
| ETD | D · Manufacturing | `HIGH_YIELD` | -13,9 % | 6,3 % | 38,3 | 58,8 | 20,5 | -1.170 |
| BCAT | (unclassified) | `HIGH_YIELD` | -5,5 % | 14,2 % | 46,5 | 66,9 | 20,4 | -1.163 |
| PRHI | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -3,0 % | 17,1 % | 49,1 | 69,3 | 20,2 | -1.153 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.251 | 0,00 % | 28 | -0,49 | 4,35 |
| `LOW_YIELD` | 732 | 1,09 % | 47 | -0,82 | 3,03 |
| `MEDIUM_YIELD` | 663 | 3,05 % | -18 | 0,32 | 1,42 |
| `HIGH_YIELD` | 1.066 | 6,64 % | -172 | 3,01 | 10,37 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.251 | 0,00 % | 34 | -0,60 | 4,11 |
| `LOW_YIELD` | 732 | 1,16 % | 51 | -0,89 | 3,19 |
| `MEDIUM_YIELD` | 663 | 3,35 % | -19 | 0,33 | 1,47 |
| `HIGH_YIELD` | 1.066 | 7,05 % | -157 | 2,74 | 9,95 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 725 | 5,31 % | -121 | 2,12 | 9,22 |
| REITs | 189 | 5,37 % | -119 | 2,08 | 9,49 |
| Utilities | 142 | 2,83 % | -1 | 0,02 | 4,08 |
| Energy | 149 | 2,82 % | 0 | 0,00 | 5,44 |
| Consumer Staples | 116 | 0,66 % | 3 | -0,05 | 3,69 |
| Financials | 867 | 1,67 % | 6 | -0,11 | 4,85 |
| Real Estate | 66 | 0,00 % | 8 | -0,14 | 10,89 |
| Communication | 129 | 0,00 % | 15 | -0,26 | 4,32 |
| (other) | 500 | 0,00 % | 18 | -0,32 | 3,84 |
| Industrials | 443 | 0,00 % | 20 | -0,35 | 4,10 |
| Materials | 298 | 0,00 % | 20 | -0,35 | 3,43 |
| Health Care | 933 | 0,00 % | 21 | -0,37 | 3,45 |
| Technology | 723 | 0,00 % | 22 | -0,39 | 3,62 |
| Consumer Discretionary | 432 | 0,00 % | 23 | -0,39 | 3,43 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 725 | 5,31 % | -121 | 2,12 | 9,22 |
| H · Finance, Insurance, And Real Estate | 1.122 | 2,17 % | 0 | 0,00 | 7,03 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 392 | 1,57 % | 4 | -0,07 | 4,61 |
| D · Manufacturing | 1.933 | 0,00 % | 18 | -0,32 | 3,43 |
| B · Mining | 242 | 0,00 % | 21 | -0,37 | 4,62 |
| F · Wholesale Trade | 101 | 0,00 % | 21 | -0,37 | 3,94 |
| G · Retail Trade | 222 | 0,00 % | 22 | -0,39 | 3,74 |
| I · Services | 893 | 0,00 % | 23 | -0,40 | 3,82 |
| C · Construction | 62 | 0,00 % | 31 | -0,53 | 4,47 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 48 | -0,83 | 4,01 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-11-06 (-3 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9366 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9457 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.574 / 5.712 / 5.712 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9927 · Median 54,5 Ränge · P95 350 · Maximum 3.330 · 492 Titel bewegen sich um mindestens 5 Perzentilpunkte, 134 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 349 | 350 | 11 | 12 | 6,6 % |
| Quality Momentum (`quality-momentum`) | 39 | 38 | 1 | 0 | 2,6 % |
| Future Leader (`future-leader`) | 21 | 19 | 2 | 0 | 9,5 % |
| Value Momentum (`value-momentum`) | 218 | 214 | 8 | 4 | 5,5 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-11-09 | 0 | 5.712 | 0,9947 | 55 | 299 | 312 | 15 / 15 |
| 2025-11-06 | 252 | 5.343 | 0,9924 | 49 | 350 | 630 | 11 / 11 |
| 2024-11-04 | 504 | 5.105 | 0,9920 | 56 | 307,6 | 529 | 15 / 15 |
| 2023-11-02 | 756 | 4.917 | 0,9659 | 71 | 301,2 | 517 | 45 / 45 |
| 2022-11-01 | 1.008 | 4.679 | 0,9964 | 38 | 195 | 168 | 21 / 21 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6307` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9949 · `6M` 0,9934 · `12M` 0,9921 · `12M-1M` 0,9947 · `RELATIVE_STRENGTH` 0,9921 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `39` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
