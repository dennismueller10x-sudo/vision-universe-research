# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-04T06:44:03.000Z |
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

Quellen: `CANONICAL_STORE` 6.852. Bereinigungsstufe: `adjusted` 6.851 · `splitAdjustedReconstructible` 1.

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
| geprüfte Ereignisse | 62.566 |
| davon konsistent | 61.769 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 759 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `ADJUSTMENT_INCONSISTENT` | 24 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `NO_ADJUSTMENT_AT_ALL` | 12 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `LARGE_DISTRIBUTION` | 512 | 2 | 4 | 16 |
| `ORDINARY_DIVIDEND` | 247 | 0 | 8 | 8 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 452 von 3.295 geprüften Titeln (13,72 %).

**Erklärt: 761 · unerklärt: 36** (0,057 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_ATRO` 4/10 · `ref_BSET` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.601 |
| Preisbasis | `close` 6.601 |
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

Stichtag **2026-10-02**, 5.894 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-02 | 5.906 | 12 | 5.894 | THRM, CIB, KNDI, FFNW, TFII, ARI, VISN, FSV, SBT, GOCOQ, VOXR, DVXE |
| 2025-10-01 | 5.438 | 2 | 5.436 | FFNW, SBT |
| 2024-09-27 | 5.195 | 0 | 5.195 |  |
| 2023-09-27 | 5.010 | 4 | 5.006 | PKBK, BRX, NFE, SLVM |
| 2022-09-26 | 4.689 | 0 | 4.689 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.894 | 0,9957 | 33 | 173 | 200,7 | 4.623 | 2.231 | 187 | 28 | 11 / 11 |
| `6M` | 5.894 | 0,9950 | 44 | 220 | 285 | 3.919 | 2.554 | 278 | 56 | 13 / 13 |
| `12M` | 5.894 | 0,9939 | 52 | 273 | 325 | 3.557 | 2.731 | 384 | 65 | 23 / 23 |
| `12M-1M` | 5.894 | 0,9938 | 48 | 280,7 | 338 | 3.630 | 2.695 | 528 | 64 | 15 / 15 |
| `RELATIVE_STRENGTH` | 5.894 | 0,9939 | 52 | 273 | 325 | 3.557 | 2.731 | 384 | 65 | 23 / 23 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -43,4 % | 36,9 % | 18,2 | 79,8 | 61,6 | -3.630 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -24,3 % | 25,8 % | 27,3 | 73,8 | 46,5 | -2.741 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -62,3 % | 6,9 % | 11,4 | 57,5 | 46,1 | -2.719 |
| HERZ | (unclassified) | `HIGH_YIELD` | -32,4 % | 17,8 % | 22,9 | 68,6 | 45,6 | -2.689 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -24,2 % | 17,2 % | 27,3 | 68,1 | 40,7 | -2.401 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -12,7 % | 15,2 % | 36,4 | 66,3 | 29,9 | -1.763 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -5,3 % | 17,4 % | 43,9 | 68,2 | 24,3 | -1.433 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -7,5 % | 14,5 % | 41,7 | 65,5 | 23,7 | -1.398 |
| OXSQ | (unclassified) | `HIGH_YIELD` | -14,8 % | 7,2 % | 34,2 | 57,9 | 23,7 | -1.397 |
| PDX | (unclassified) | `HIGH_YIELD` | -12,2 % | 9,2 % | 36,8 | 60,5 | 23,7 | -1.397 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -9,0 % | 12,5 % | 40,2 | 63,7 | 23,5 | -1.386 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -19,0 % | 4,6 % | 30,4 | 53,8 | 23,4 | -1.380 |
| IVR | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -8,2 % | 12,8 % | 40,9 | 64,0 | 23,1 | -1.362 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,5 % | -13,8 % | 9,8 | 32,9 | 23,0 | -1.357 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -2,4 % | 20,8 % | 47,5 | 70,5 | 23,0 | -1.354 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.265 | 0,00 % | 26 | -0,44 | 5,19 |
| `LOW_YIELD` | 758 | 1,06 % | 45 | -0,76 | 3,77 |
| `MEDIUM_YIELD` | 680 | 2,96 % | -16 | 0,27 | 1,61 |
| `HIGH_YIELD` | 1.191 | 6,31 % | -166 | 2,82 | 10,26 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.265 | 0,00 % | 31 | -0,53 | 4,80 |
| `LOW_YIELD` | 758 | 1,12 % | 45 | -0,76 | 3,75 |
| `MEDIUM_YIELD` | 680 | 3,19 % | -14 | 0,24 | 1,65 |
| `HIGH_YIELD` | 1.191 | 6,93 % | -169 | 2,87 | 10,35 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 206 | 5,03 % | -99 | 1,67 | 12,40 |
| (unclassified) | 794 | 4,75 % | -94 | 1,60 | 9,24 |
| Energy | 149 | 2,35 % | 1 | -0,02 | 6,11 |
| Utilities | 156 | 3,00 % | 1 | -0,02 | 5,18 |
| Financials | 924 | 1,73 % | 4 | -0,07 | 5,67 |
| Consumer Staples | 117 | 0,95 % | 7 | -0,12 | 3,78 |
| Real Estate | 69 | 0,00 % | 12 | -0,20 | 9,56 |
| Communication | 134 | 0,00 % | 15 | -0,25 | 5,14 |
| Industrials | 450 | 0,00 % | 17 | -0,29 | 4,86 |
| (other) | 501 | 0,00 % | 19 | -0,32 | 4,29 |
| Health Care | 933 | 0,00 % | 20 | -0,34 | 3,88 |
| Technology | 729 | 0,00 % | 22 | -0,37 | 3,91 |
| Materials | 300 | 0,00 % | 22 | -0,37 | 4,13 |
| Consumer Discretionary | 432 | 0,00 % | 25 | -0,42 | 4,44 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 794 | 4,75 % | -94 | 1,60 | 9,24 |
| H · Finance, Insurance, And Real Estate | 1.199 | 2,34 % | 0 | 0,00 | 6,45 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 415 | 1,63 % | 4 | -0,07 | 4,86 |
| F · Wholesale Trade | 100 | 0,00 % | 19 | -0,31 | 3,84 |
| D · Manufacturing | 1.940 | 0,00 % | 19 | -0,32 | 3,95 |
| I · Services | 895 | 0,00 % | 20 | -0,34 | 4,47 |
| B · Mining | 244 | 0,00 % | 20 | -0,34 | 5,01 |
| A · Agriculture, Forestry, And Fishing | 20 | 0,00 % | 23 | -0,38 | 4,18 |
| G · Retail Trade | 223 | 0,00 % | 25 | -0,42 | 4,41 |
| C · Construction | 64 | 0,00 % | 28 | -0,47 | 4,94 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-02 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9422 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9526 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.750 / 5.894 / 5.894 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9923 · Median 59 Ränge · P95 414,3 · Maximum 3.359 · 632 Titel bewegen sich um mindestens 5 Perzentilpunkte, 122 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 347 | 340 | 16 | 9 | 7,2 % |
| Quality Momentum (`quality-momentum`) | 41 | 39 | 3 | 1 | 9,8 % |
| Future Leader (`future-leader`) | 29 | 27 | 3 | 1 | 13,8 % |
| Value Momentum (`value-momentum`) | 189 | 184 | 7 | 2 | 4,8 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-02 | 0 | 5.894 | 0,9938 | 48 | 338 | 528 | 15 / 15 |
| 2025-10-01 | 252 | 5.436 | 0,9916 | 52 | 350 | 579 | 14 / 14 |
| 2024-09-27 | 504 | 5.195 | 0,9934 | 53 | 305 | 562 | 23 / 23 |
| 2023-09-27 | 756 | 5.006 | 0,9857 | 60 | 294 | 446 | 25 / 25 |
| 2022-09-26 | 1.008 | 4.689 | 0,9954 | 34 | 218 | 189 | 24 / 24 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6852` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9957 · `6M` 0,9950 · `12M` 0,9939 · `12M-1M` 0,9938 · `RELATIVE_STRENGTH` 0,9939 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `18` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
