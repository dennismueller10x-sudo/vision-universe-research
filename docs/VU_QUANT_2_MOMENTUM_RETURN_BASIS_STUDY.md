# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-09-29T04:15:26.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.345 |
| `ADJUSTED_CLOSE_AVAILABLE` | 6.874 |
| `TRADING_DATES_AVAILABLE` | 6.874 |
| `ADJUSTMENT_STATUS_PRESENT` | 6.874 |
| `RETURN_BASIS_IDENTIFIABLE_UNIVERSE` | 6.874 |

**Warum der Rest ausgeschlossen ist**

| Grund | Titel |
|---|---:|
| `NO_SERIES` | 1 |

Quellen: `CANONICAL_STORE` 6.874. Bereinigungsstufe: `adjusted` 6.873 · `splitAdjustedReconstructible` 1.

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
| geprüfte Titel | 3.333 |
| geprüfte Ereignisse | 63.108 |
| davon konsistent | 62.061 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 767 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 257 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 21 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `ORDINARY_DIVIDEND` | 253 | 0 | 253 | 6 |
| `LARGE_DISTRIBUTION` | 514 | 2 | 4 | 15 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 681 von 3.333 geprüften Titeln (20,43 %).

**Erklärt: 769 · unerklärt: 278** (0,441 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_MDT` 23/24 · `ref_MMM` 23/24 · `ref_PLD` 23/24 · `ref_DD` 23/24 · `ref_DTE` 23/24 · `ref_UIS` 1/3 · `ref_AXR` 5/6 · `ref_BRT` 23/24 · `ref_GTY` 23/24 · `ref_PHI` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.296 |
| Preisbasis | `close` 6.296 |
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

Stichtag **2026-09-28**, 5.813 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-09-28 | 6.033 | 220 | 5.813 | MDT, PLD, DTE, BRT, GTY, MSI, IFF, CP, ES, AIG, JCI, MYE, UHT, NJR, DX, CINF, FLS, GSBC, OMC, INDB, WKC, DIN, HMN, MRTN, ESP, OLP, VIRC, RNST, MEOH, LTC, ELS, SYBT, THRM, SGA, RYN, RWT, E, HUBG, OLED, LAMR, CIG, EPM, ABEV, LOGI, RL, TSM, FORTY, CM, FLXI, FNWD, HCKT, SRE, RBCAA, VIV, KFY, TOWN, EMBJ, EVC, NEWT, ALRS, DINE, FRO, BFC, SPG-P-J, GLAD, CHSCP, GOOD, GBLI, ADAM, PSEC, BBW, GAIN, DBI, FNF, ICE, POR, TNL, WU, ISBA, MAIN, FFNW, SHIP, KDP, SELF, IVR, GSM, ARI, FAF, NXPI, HRZN, CCOM, ARCO, NMFC, VAC, TCPC, OFS, WHF, LAND, SBSW, NRC, CHSCO, VISN, BANX, FITB-P-I, CHSCN, TPVG, LQ, FSK, ARES, OXLCN, CHSCM, CIG-C, GAB-P-G, GAB-P-H, GGN-P-B, GLU-P-A, GSL-P-B, QSR, CHSCL, BCAL, NEMD, PR, GWRS, GUT-P-C, XRN, BCV-P-A, INVH, HLNE, JILL, OXLCM, TRTX, BBCP, GGT-P-E, CRCO, GNT-P-A, SBT, CNNE, PAGS, CEPU, OXSQ, NCZ-P-A, NCV-P-A, BSVN, UTZ, GLU-P-B, HGLB, FINS, GDV-P-H, PRIF-P-D, HFRO-P-A, FITB-P-A, FITB-P-K, GOODN, CFG-P-E, GAB-P-K, GGT-P-G, WRB-P-F, DLY, FHN-P-E, GOCOQ, ASGI, BSY, WRB-P-G, ASO, TIMB, LANDO, CAS, WRB-P-H, FHN-P-F, ACP-P-A, BW-P-A, TRTX-P-C, BZ, GOODO, WDI, DTM, DOLE, OXLCO, ADC-P-A, GDV-P-K, PRIF-P-K, MEGI, GFS, NXDT-P-A, HPP-P-C, IMPPP, DMA, SPE-P-C, SGHC, LIEN, PRIF-P-L, USEA, CRBG, STRW, BHM, FSCO, FG, KVUE, LANDP, COIA, CRCA, DVXE, FBDC, FOXY, FRIZ, HERZ, INTM, KLMN, MMID, MSIF, NEWTP, OTF, PDCC, PDPA, PLTA, PSBD, QQDN, SBAR, URSP, XV |
| 2025-09-25 | 5.581 | 3 | 5.578 | SVA, FFNW, SBT |
| 2024-09-23 | 5.336 | 0 | 5.336 |  |
| 2023-09-21 | 5.144 | 0 | 5.144 |  |
| 2022-09-20 | 4.771 | 0 | 4.771 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.813 | 0,9918 | 30 | 162 | 194,4 | 5.698 | 2.135 | 190 | 43 | 16 / 16 |
| `6M` | 5.813 | 0,9912 | 45 | 205 | 275 | 5.538 | 2.550 | 277 | 58 | 13 / 13 |
| `12M` | 5.813 | 0,9917 | 50 | 260 | 311 | 5.340 | 2.658 | 367 | 65 | 13 / 13 |
| `12M-1M` | 5.813 | 0,9939 | 43 | 272,5 | 337 | 3.699 | 2.601 | 514 | 60 | 12 / 12 |
| `RELATIVE_STRENGTH` | — | — | — | — | — | — | — | — | — | — |

> **`RELATIVE_STRENGTH` · `RANK_EQUIVALENT_TO_12M`** (`BENCHMARK_NOT_IN_CANONICAL_STORE`). Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich. Relative Staerke ist dann die Zwoelfmonatsrendite minus einer Konstante, und eine Konstante aendert keinen Rang. Die Rangstatistik steht deshalb vollstaendig in der Zeile 12M; sie hier zu wiederholen waere dieselbe Messung unter zwei Namen.

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -37,9 % | 49,0 % | 20,1 | 83,7 | 63,6 | -3.699 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -60,2 % | 12,8 % | 12,1 | 62,8 | 50,7 | -2.948 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -15,9 % | 39,7 % | 31,9 | 79,7 | 47,8 | -2.780 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -24,8 % | 16,3 % | 26,3 | 65,4 | 39,1 | -2.270 |
| BGSF | I · Services | `HIGH_YIELD` | -20,9 % | 13,1 % | 28,6 | 63,0 | 34,5 | -2.004 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -12,5 % | 15,4 % | 35,1 | 64,9 | 29,7 | -1.728 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -18,0 % | 5,9 % | 30,5 | 55,0 | 24,5 | -1.422 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -13,7 % | 8,0 % | 33,8 | 57,8 | 24,0 | -1.394 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -10,3 % | 11,0 % | 37,5 | 61,3 | 23,9 | -1.388 |
| PDX | (unclassified) | `HIGH_YIELD` | -12,8 % | 8,4 % | 34,8 | 58,3 | 23,6 | -1.370 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -11,5 % | 9,4 % | 36,3 | 59,4 | 23,1 | -1.342 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,3 % | -13,3 % | 9,8 | 32,3 | 22,5 | -1.307 |
| ECAT | (unclassified) | `HIGH_YIELD` | -4,8 % | 15,9 % | 42,9 | 65,2 | 22,3 | -1.298 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -0,5 % | 23,1 % | 48,6 | 70,0 | 21,4 | -1.242 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -15,2 % | 5,1 % | 32,6 | 53,7 | 21,1 | -1.228 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.353 | 0,00 % | 23 | -0,40 | 5,16 |
| `LOW_YIELD` | 731 | 1,05 % | 45 | -0,77 | 3,66 |
| `MEDIUM_YIELD` | 647 | 3,03 % | -18 | 0,31 | 1,54 |
| `HIGH_YIELD` | 1.082 | 6,45 % | -170 | 2,92 | 10,18 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.353 | 0,00 % | 28 | -0,48 | 4,65 |
| `LOW_YIELD` | 731 | 1,10 % | 45 | -0,77 | 3,48 |
| `MEDIUM_YIELD` | 647 | 3,20 % | -15 | 0,26 | 1,37 |
| `HIGH_YIELD` | 1.082 | 6,86 % | -167 | 2,87 | 10,25 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 190 | 5,92 % | -130 | 2,23 | 10,57 |
| Utilities | 144 | 3,21 % | -13 | 0,22 | 5,16 |
| (unclassified) | 1.108 | 0,00 % | 0 | 0,00 | 8,53 |
| Energy | 146 | 2,16 % | 2 | -0,03 | 5,90 |
| Financials | 884 | 1,87 % | 6 | -0,09 | 5,78 |
| Consumer Staples | 106 | 1,52 % | 11 | -0,19 | 4,07 |
| Communication | 122 | 0,00 % | 14 | -0,24 | 5,44 |
| Real Estate | 63 | 0,00 % | 15 | -0,26 | 9,35 |
| Industrials | 418 | 0,05 % | 17 | -0,29 | 4,11 |
| Materials | 291 | 0,00 % | 17 | -0,29 | 3,73 |
| Health Care | 827 | 0,00 % | 19 | -0,33 | 3,43 |
| (other) | 450 | 0,00 % | 20 | -0,34 | 4,26 |
| Technology | 672 | 0,00 % | 20 | -0,34 | 4,36 |
| Consumer Discretionary | 392 | 0,00 % | 24 | -0,40 | 4,51 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| H · Finance, Insurance, And Real Estate | 1.137 | 2,38 % | -2 | 0,03 | 7,49 |
| (unclassified) | 1.108 | 0,00 % | 0 | 0,00 | 8,53 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 379 | 1,73 % | 4 | -0,07 | 5,25 |
| B · Mining | 238 | 0,00 % | 15 | -0,26 | 4,96 |
| D · Manufacturing | 1.769 | 0,00 % | 18 | -0,31 | 3,85 |
| F · Wholesale Trade | 85 | 0,00 % | 19 | -0,33 | 4,15 |
| I · Services | 817 | 0,00 % | 22 | -0,38 | 4,75 |
| G · Retail Trade | 203 | 0,00 % | 24 | -0,41 | 4,32 |
| C · Construction | 60 | 0,00 % | 25 | -0,42 | 3,73 |
| A · Agriculture, Forestry, And Fishing | 17 | 0,00 % | 36 | -0,62 | 5,63 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-09-25 (-3 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9354 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9481 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.361 / 5.813 / 5.813 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9908 · Median 59,5 Ränge · P95 406,7 · Maximum 3.778 · 594 Titel bewegen sich um mindestens 5 Perzentilpunkte, 157 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 322 | 317 | 14 | 9 | 7,1 % |
| Quality Momentum (`quality-momentum`) | 36 | 35 | 1 | 0 | 2,8 % |
| Future Leader (`future-leader`) | 29 | 30 | 1 | 2 | 10,0 % |
| Value Momentum (`value-momentum`) | 160 | 159 | 5 | 4 | 5,6 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-09-28 | 0 | 5.813 | 0,9939 | 43 | 337 | 514 | 12 / 12 |
| 2025-09-25 | 252 | 5.578 | 0,9916 | 54 | 370,1 | 647 | 11 / 11 |
| 2024-09-23 | 504 | 5.336 | 0,9927 | 56 | 330,3 | 636 | 19 / 19 |
| 2023-09-21 | 756 | 5.144 | 0,9887 | 58 | 320,7 | 535 | 23 / 23 |
| 2022-09-20 | 1.008 | 4.771 | 0,9951 | 38 | 229 | 213 | 23 / 23 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6874` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9918 · `6M` 0,9912 · `12M` 0,9917 · `12M-1M` 0,9939 · `RELATIVE_STRENGTH` RANK_EQUIVALENT_TO_12M |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `223` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
