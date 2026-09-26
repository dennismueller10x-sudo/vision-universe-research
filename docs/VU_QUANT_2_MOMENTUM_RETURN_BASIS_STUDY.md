# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-09-26T05:05:03.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.344 |
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
| geprüfte Titel | 3.332 |
| geprüfte Ereignisse | 63.097 |
| davon konsistent | 62.080 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 767 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 227 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 21 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `ORDINARY_DIVIDEND` | 253 | 0 | 225 | 6 |
| `LARGE_DISTRIBUTION` | 514 | 2 | 2 | 15 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 653 von 3.332 geprüften Titeln (19,60 %).

**Erklärt: 769 · unerklärt: 248** (0,393 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MDT` 23/24 · `ref_MMM` 23/24 · `ref_PLD` 23/24 · `ref_DD` 23/24 · `ref_DTE` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_GTY` 23/24 · `ref_PHI` 23/24 · `ref_MSI` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.437 |
| Preisbasis | `close` 6.437 |
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

Stichtag **2026-09-25**, 5.835 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-09-25 | 6.031 | 196 | 5.835 | MDT, PLD, DTE, GTY, MSI, IFF, CP, ES, AIG, JCI, MYE, UHT, NJR, DX, CINF, FLS, OMC, DIN, HMN, MRTN, ESP, VIRC, RNST, MEOH, LTC, ELS, SYBT, SGA, RYN, RWT, E, HUBG, OLED, LAMR, EPM, ABEV, LOGI, RL, TSM, FORTY, FLXI, FNWD, HCKT, SRE, RBCAA, KFY, TOWN, EMBJ, EVC, NEWT, ALRS, DINE, FRO, BFC, SPG-P-J, GLAD, CHSCP, GOOD, GBLI, ADAM, BBW, GAIN, DBI, FNF, ICE, POR, TNL, WU, MAIN, FFNW, SHIP, SELF, GSM, ARI, NXPI, HRZN, CCOM, ARCO, NMFC, VAC, TCPC, OFS, WHF, LAND, SBSW, NRC, CHSCO, VISN, BANX, CHSCN, TPVG, LQ, FSK, ARES, OXLCN, CHSCM, GAB-P-G, GAB-P-H, GGN-P-B, GLU-P-A, GSL-P-B, QSR, CHSCL, BCAL, NEMD, PR, GWRS, GUT-P-C, XRN, BCV-P-A, INVH, HLNE, JILL, OXLCM, BBCP, GGT-P-E, CRCO, GNT-P-A, SBT, CNNE, PAGS, OXSQ, NCZ-P-A, NCV-P-A, BSVN, UTZ, GLU-P-B, HGLB, FINS, GDV-P-H, PRIF-P-D, HFRO-P-A, GOODN, CFG-P-E, GAB-P-K, GGT-P-G, WRB-P-F, DLY, GOCOQ, ASGI, BSY, WRB-P-G, ASO, LANDO, CAS, WRB-P-H, ACP-P-A, BW-P-A, TRTX-P-C, GOODO, WDI, DTM, DOLE, OXLCO, ADC-P-A, GDV-P-K, PRIF-P-K, MEGI, GFS, NXDT-P-A, HPP-P-C, IMPPP, DMA, SPE-P-C, SGHC, LIEN, PRIF-P-L, USEA, CRBG, STRW, BHM, FSCO, FG, KVUE, LANDP, COIA, CRCA, DVXE, FBDC, FOXY, FRIZ, HERZ, INTM, KLMN, MMID, MSIF, NEWTP, OTF, PDCC, PDPA, PLTA, PSBD, QQDN, SBAR, URSP, XV |
| 2025-09-24 | 5.581 | 3 | 5.578 | SVA, FFNW, SBT |
| 2024-09-20 | 5.332 | 0 | 5.332 |  |
| 2023-09-20 | 5.143 | 0 | 5.143 |  |
| 2022-09-19 | 4.770 | 0 | 4.770 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.835 | 0,9942 | 30 | 170 | 213 | 5.470 | 2.089 | 203 | 45 | 16 / 16 |
| `6M` | 5.835 | 0,9939 | 44 | 222 | 294,6 | 4.442 | 2.473 | 297 | 65 | 11 / 11 |
| `12M` | 5.835 | 0,9944 | 48 | 269,3 | 309,3 | 3.590 | 2.582 | 353 | 63 | 11 / 11 |
| `12M-1M` | 5.835 | 0,9940 | 45 | 279 | 335 | 3.718 | 2.627 | 500 | 57 | 10 / 10 |
| `RELATIVE_STRENGTH` | — | — | — | — | — | — | — | — | — | — |

> **`RELATIVE_STRENGTH` · `RANK_EQUIVALENT_TO_12M`** (`BENCHMARK_NOT_IN_CANONICAL_STORE`). Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich. Relative Staerke ist dann die Zwoelfmonatsrendite minus einer Konstante, und eine Konstante aendert keinen Rang. Die Rangstatistik steht deshalb vollstaendig in der Zeile 12M; sie hier zu wiederholen waere dieselbe Messung unter zwei Namen.

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -39,3 % | 45,6 % | 19,6 | 83,4 | 63,7 | -3.718 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -60,6 % | 11,6 % | 12,2 | 62,1 | 49,9 | -2.910 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -20,7 % | 31,7 % | 29,3 | 76,0 | 46,7 | -2.724 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -25,6 % | 15,2 % | 26,2 | 65,0 | 38,8 | -2.261 |
| BGSF | I · Services | `HIGH_YIELD` | -24,4 % | 8,1 % | 26,9 | 58,0 | 31,1 | -1.816 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,3 % | 14,3 % | 34,8 | 64,3 | 29,5 | -1.723 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -16,7 % | 7,6 % | 31,8 | 57,5 | 25,7 | -1.499 |
| PDX | (unclassified) | `HIGH_YIELD` | -11,7 % | 9,8 % | 36,6 | 60,3 | 23,7 | -1.385 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -9,2 % | 12,4 % | 39,1 | 62,8 | 23,7 | -1.383 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -14,2 % | 7,5 % | 34,0 | 57,3 | 23,3 | -1.360 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -10,8 % | 10,2 % | 37,7 | 60,8 | 23,1 | -1.347 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,1 % | -12,7 % | 10,0 | 33,0 | 23,1 | -1.346 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -13,4 % | 7,2 % | 34,7 | 57,0 | 22,3 | -1.301 |
| ECAT | (unclassified) | `HIGH_YIELD` | -4,7 % | 16,0 % | 43,7 | 65,6 | 21,9 | -1.278 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | 0,1 % | 23,9 % | 51,1 | 71,5 | 20,4 | -1.190 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.353 | 0,00 % | 21 | -0,36 | 5,23 |
| `LOW_YIELD` | 733 | 1,04 % | 44 | -0,75 | 3,72 |
| `MEDIUM_YIELD` | 652 | 3,03 % | -18 | 0,31 | 1,46 |
| `HIGH_YIELD` | 1.097 | 6,39 % | -174 | 2,98 | 10,10 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.353 | 0,00 % | 25 | -0,43 | 4,68 |
| `LOW_YIELD` | 733 | 1,09 % | 40 | -0,69 | 3,43 |
| `MEDIUM_YIELD` | 652 | 3,19 % | -18 | 0,31 | 1,34 |
| `HIGH_YIELD` | 1.097 | 6,83 % | -172 | 2,95 | 10,40 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 194 | 6,06 % | -126 | 2,15 | 10,77 |
| Utilities | 147 | 3,22 % | -18 | 0,31 | 4,92 |
| (unclassified) | 1.109 | 0,00 % | 0 | 0,00 | 8,10 |
| Energy | 146 | 2,13 % | 2 | -0,03 | 6,04 |
| Financials | 893 | 1,89 % | 5 | -0,09 | 5,74 |
| Consumer Staples | 107 | 1,65 % | 7 | -0,12 | 3,96 |
| Communication | 124 | 0,00 % | 11 | -0,18 | 5,25 |
| Real Estate | 63 | 0,00 % | 14 | -0,24 | 9,44 |
| Materials | 291 | 0,00 % | 16 | -0,27 | 3,63 |
| Health Care | 827 | 0,00 % | 17 | -0,29 | 3,68 |
| Technology | 672 | 0,00 % | 18 | -0,31 | 4,11 |
| Industrials | 418 | 0,05 % | 18 | -0,31 | 4,61 |
| (other) | 451 | 0,00 % | 20 | -0,34 | 4,26 |
| Consumer Discretionary | 393 | 0,00 % | 24 | -0,41 | 4,43 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| H · Finance, Insurance, And Real Estate | 1.150 | 2,42 % | -2 | 0,03 | 7,37 |
| (unclassified) | 1.109 | 0,00 % | 0 | 0,00 | 8,10 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 384 | 1,87 % | 3 | -0,05 | 4,95 |
| B · Mining | 238 | 0,00 % | 16 | -0,27 | 4,48 |
| D · Manufacturing | 1.771 | 0,00 % | 17 | -0,29 | 3,87 |
| F · Wholesale Trade | 86 | 0,06 % | 18 | -0,31 | 3,93 |
| I · Services | 817 | 0,00 % | 20 | -0,34 | 4,56 |
| G · Retail Trade | 203 | 0,00 % | 22 | -0,38 | 4,39 |
| C · Construction | 60 | 0,00 % | 34 | -0,58 | 3,81 |
| A · Agriculture, Forestry, And Fishing | 17 | 0,00 % | 40 | -0,69 | 5,34 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-09-24 (-1 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9343 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9466 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.417 / 5.835 / 5.835 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9922 · Median 60 Ränge · P95 420,3 · Maximum 3.360 · 623 Titel bewegen sich um mindestens 5 Perzentilpunkte, 165 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 319 | 310 | 16 | 7 | 7,2 % |
| Quality Momentum (`quality-momentum`) | 24 | 24 | 0 | 0 | 0,0 % |
| Future Leader (`future-leader`) | 23 | 21 | 2 | 0 | 8,7 % |
| Value Momentum (`value-momentum`) | 111 | 110 | 4 | 3 | 6,3 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-09-25 | 0 | 5.835 | 0,9940 | 45 | 335 | 500 | 10 / 10 |
| 2025-09-24 | 252 | 5.578 | 0,9915 | 53 | 383 | 693 | 9 / 9 |
| 2024-09-20 | 504 | 5.332 | 0,9923 | 56 | 341,4 | 705 | 16 / 16 |
| 2023-09-20 | 756 | 5.143 | 0,9886 | 59 | 317,9 | 520 | 19 / 19 |
| 2022-09-19 | 1.008 | 4.770 | 0,9951 | 38 | 235 | 232 | 18 / 18 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6874` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9942 · `6M` 0,9939 · `12M` 0,9944 · `12M-1M` 0,9940 · `RELATIVE_STRENGTH` RANK_EQUIVALENT_TO_12M |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `199` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
