# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-09-24T10:40:51.000Z |
| Bestand | `CANONICAL_HISTORY` |
| Studienlogik | `1.0.0` · Reihen `vu-return-series-1.0.0` · Vergleich `vu-return-basis-comparison-1.0.0` |
| Entscheidung | **PENDING_METHOD_DECISION** |

Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.

## 1 · Was an Daten wirklich da ist

Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.

| Größe | Titel |
|---|---:|
| `CANONICAL_PRODUCT_UNIVERSE` | 6.875 |
| `CANONICAL_HISTORY_UNIVERSE` | 6.874 |
| `RAW_CLOSE_AVAILABLE` | 6.874 |
| `SPLIT_FACTOR_AVAILABLE` | 6.874 |
| `DIVIDEND_COLUMN_AVAILABLE` | 6.874 |
| `DIVIDEND_EVENTS_AVAILABLE` | 3.330 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.874 |
| `TRADING_DATES_AVAILABLE` | 6.874 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.874 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.874 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.874. Bereinigungsstufe: `adjusted` 6.874.

## 2 · Die beiden Reihen

Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.

- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.
- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.

Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.

**Beide Basen baubar:** 6.874 Titel von 6.875 im Produktuniversum, 6.874 davon mit gefundener Reihe.

| Ausschlussgrund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist

An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.

| | |
|---|---:|
| Urteil | **TOTAL_RETURN_NOT_UNIFORM** |
| geprüfte Titel | 3.319 |
| geprüfte Ereignisse | 62.859 |
| davon konsistent | 62.066 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTMENT_BELOW_CASH_DIVIDEND` | 465 | bereinigt **weniger** als die Bardividende — ein echter Widerspruch |
| `ADJUSTMENT_EXCEEDS_CASH_DIVIDEND` | 326 | bereinigt **mehr** als die gemeldete Dividende — Signatur einer zusätzlichen Ausschüttung (Abspaltung, Sachdividende) |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

**Erklärt: 328 · unerklärt: 465** (0,740 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MMM` 23/24 · `ref_DD` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_PHI` 23/24 · `ref_SIEB` 22/24 · `ref_SSL` 23/24 · `ref_AIRT` 16/19 · `ref_ATRO` 4/10 · `ref_BSET` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.403 |
| Preisbasis | `adjustedClose` 6.403 |
| gemessene Quant-V2-Momentumbasis | **MIXED_OR_UNCONFIRMED** |

**Befund: Methodiktext und Rechnung sagen nicht dasselbe.**

| Komponente | Gewicht | beschrieben als | gerechnet auf |
|---|---:|---|---|
| `momentum:distanceTo52wHigh` | 0,10 | (high252-current split-adjusted close)/high252 | `adjustedClose` |
| `momentum:distanceToSma200` | 0,10 | (split-adjusted close-SMA200)/SMA200 | `adjustedClose` |

Zusammen 0,20 Gewicht der Momentumnote. Solange `adjustedClose` splitbereinigt wäre, fiele das nicht auf; sie ist nachweislich gesamtrenditebereinigt, also ist es ein Unterschied. Diese Studie korrigiert ihn nicht still — er gehört in die Entscheidung.

## 3 · Keine Entscheidung aus fünf Titeln

Die Golden Five stehen im Regressionsumfang (`quant/tests/return-series.test.mjs`) und nirgends sonst. Sie prüfen die Konstruktion der beiden Reihen — den Splitsprung, die Dividendenlücke, die Richtung bei einem Dividendenzahler. Als Methodikbasis kommen sie nicht vor.

## 4 & 5 · Der Rangvergleich über das Universum

Stichtag **2026-09-10**, 6.003 Titel mit ausreichender Historie.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 6.003 | 0,9937 | 37 | 215,5 | 274 | 5.593 | 2.282 | 277 | 53 | 12 / 12 |
| `6M` | 6.003 | 0,9929 | 50 | 248,5 | 333,9 | 5.603 | 2.762 | 333 | 80 | 17 / 17 |
| `12M` | 6.003 | 0,9925 | 52 | 306 | 361 | 5.099 | 2.837 | 619 | 68 | 20 / 20 |
| `12M-1M` | 6.003 | 0,9930 | 50 | 302 | 360 | 3.853 | 2.800 | 610 | 66 | 9 / 9 |
| `RELATIVE_STRENGTH` | — | — | — | — | — | — | — | — | — | — |

> **`RELATIVE_STRENGTH` · `RANK_EQUIVALENT_TO_12M`** (`BENCHMARK_NOT_IN_CANONICAL_STORE`). Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich. Relative Staerke ist dann die Zwoelfmonatsrendite minus einer Konstante, und eine Konstante aendert keinen Rang. Die Rangstatistik steht deshalb vollstaendig in der Zeile 12M; sie hier zu wiederholen waere dieselbe Messung unter zwei Namen.

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -37,2 % | 50,6 % | 19,9 | 84,1 | 64,2 | -3.853 |
| VISN | D · Manufacturing | `HIGH_YIELD` | -27,8 % | 45,2 % | 24,7 | 82,1 | 57,4 | -3.445 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -60,6 % | 11,8 % | 11,2 | 61,5 | 50,3 | -3.020 |
| FFNW | (unclassified) | `HIGH_YIELD` | -0,6 % | 96,3 % | 48,4 | 92,7 | 44,4 | -2.662 |
| SBT | (unclassified) | `HIGH_YIELD` | 0,4 % | 101,0 % | 51,0 | 93,1 | 42,1 | -2.529 |
| HERZ | (unclassified) | `HIGH_YIELD` | -34,9 % | 12,3 % | 21,0 | 61,8 | 40,8 | -2.447 |
| BGSF | I · Services | `HIGH_YIELD` | -13,1 % | 24,2 % | 34,2 | 70,7 | 36,5 | -2.193 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -37,9 % | 7,2 % | 19,5 | 55,9 | 36,4 | -2.183 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -32,0 % | 5,1 % | 22,4 | 52,9 | 30,5 | -1.830 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -19,4 % | 6,3 % | 29,3 | 54,6 | 25,2 | -1.515 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -66,3 % | -10,6 % | 9,4 | 33,7 | 24,3 | -1.459 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -10,3 % | 11,0 % | 37,1 | 60,8 | 23,7 | -1.420 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -13,5 % | 8,3 % | 33,8 | 57,5 | 23,6 | -1.418 |
| CIM | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -18,0 % | 5,6 % | 30,3 | 53,5 | 23,2 | -1.395 |
| PDX | (unclassified) | `HIGH_YIELD` | -13,2 % | 7,9 % | 34,1 | 57,0 | 22,9 | -1.376 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.339 | 0,00 % | 24 | -0,40 | 5,67 |
| `LOW_YIELD` | 751 | 1,01 % | 47 | -0,78 | 4,14 |
| `MEDIUM_YIELD` | 692 | 2,99 % | -12 | 0,20 | 1,75 |
| `HIGH_YIELD` | 1.221 | 6,48 % | -172 | 2,87 | 10,20 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.339 | 0,00 % | 32 | -0,53 | 5,37 |
| `LOW_YIELD` | 751 | 1,13 % | 51 | -0,85 | 3,82 |
| `MEDIUM_YIELD` | 692 | 3,29 % | -13 | 0,22 | 1,69 |
| `HIGH_YIELD` | 1.221 | 7,04 % | -175 | 2,92 | 10,25 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 210 | 5,88 % | -139 | 2,32 | 14,64 |
| Utilities | 154 | 3,02 % | -4 | 0,06 | 5,39 |
| Energy | 148 | 2,37 % | -2 | 0,02 | 5,88 |
| (unclassified) | 1.202 | 0,32 % | 0 | 0,00 | 8,06 |
| Financials | 903 | 1,96 % | 5 | -0,08 | 5,83 |
| Consumer Staples | 109 | 1,38 % | 12 | -0,20 | 3,41 |
| Real Estate | 69 | 0,00 % | 12 | -0,20 | 9,91 |
| Communication | 125 | 0,00 % | 15 | -0,25 | 5,27 |
| Industrials | 425 | 0,19 % | 19 | -0,32 | 5,02 |
| Health Care | 826 | 0,00 % | 20 | -0,32 | 3,89 |
| Materials | 294 | 0,00 % | 21 | -0,35 | 3,97 |
| (other) | 459 | 0,00 % | 23 | -0,38 | 4,43 |
| Technology | 679 | 0,00 % | 24 | -0,40 | 4,91 |
| Consumer Discretionary | 400 | 0,00 % | 33 | -0,54 | 4,88 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| H · Finance, Insurance, And Real Estate | 1.182 | 2,63 % | -4 | 0,07 | 6,86 |
| (unclassified) | 1.202 | 0,32 % | 0 | 0,00 | 8,06 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 399 | 2,16 % | 6 | -0,10 | 5,46 |
| B · Mining | 241 | 0,00 % | 18 | -0,30 | 4,82 |
| D · Manufacturing | 1.783 | 0,00 % | 19 | -0,32 | 4,15 |
| F · Wholesale Trade | 90 | 0,23 % | 23 | -0,37 | 5,85 |
| I · Services | 821 | 0,00 % | 27 | -0,45 | 5,00 |
| G · Retail Trade | 208 | 0,00 % | 28 | -0,47 | 4,53 |
| C · Construction | 59 | 0,00 % | 34 | -0,57 | 5,12 |
| A · Agriculture, Forestry, And Fishing | 18 | 0,00 % | 61 | -1,02 | 4,20 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `FUNDAMENTALS_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-09-21 (11 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 1.021 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9247 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9193 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.559 / 6.003 / 6.003 |

> **Einschränkung, benannt statt weggelassen.** Die benutzten Fundamentalzahlen waren am Stichtag oeffentlich, ihre Peerperzentile wurden aber in einem 11 Tage spaeteren Querschnitt gerechnet. Titel mit spaeter verfuegbaren Fundamentaldaten sind ausgeschlossen.

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9904 · Median 68 Ränge · P95 479,9 · Maximum 5.306,5 · 705 Titel bewegen sich um mindestens 5 Perzentilpunkte, 181 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 320 | 315 | 11 | 6 | 5,3 % |
| Quality Momentum (`quality-momentum`) | 21 | 20 | 2 | 1 | 14,3 % |
| Future Leader (`future-leader`) | 15 | 14 | 1 | 0 | 6,7 % |
| Value Momentum (`value-momentum`) | 120 | 118 | 3 | 1 | 3,3 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-09-10 | 0 | 6.003 | 0,9930 | 50 | 360 | 610 | 9 / 9 |
| 2025-09-09 | 252 | 5.568 | 0,9916 | 52 | 367,6 | 678 | 11 / 11 |
| 2024-09-05 | 504 | 5.322 | 0,9913 | 57 | 371 | 745 | 18 / 18 |
| 2023-09-05 | 756 | 5.135 | 0,9909 | 61,5 | 339,3 | 653 | 14 / 14 |
| 2022-09-01 | 1.008 | 4.745 | 0,9946 | 36 | 250,8 | 344 | 20 / 20 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 9b · Was die Messung begrenzt hat

**`CANONICAL_STORE_LAGS_PUBLISHED_EVIDENCE`** — die kanonische Historie endet am 2026-09-10, das veröffentlichte Factor Evidence trägt den Stichtag 2026-09-21: 11 Tage Abstand. Die wiederhergestellte kanonische Historie endet frueher als der Stichtag des veroeffentlichten Factor Evidence, das aus dem Arbeitsbestand des taeglichen Marktdatenlaufs gebaut wurde. Diese Studie repariert das nicht; sie benennt die Folge fuer ihre eigene Messung.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6874` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9937 · `6M` 0,9929 · `12M` 0,9925 · `12M-1M` 0,9930 · `RELATIVE_STRENGTH` RANK_EQUIVALENT_TO_12M |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
