# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-01T10:42:32.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.353 |
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
| geprüfte Titel | 3.340 |
| geprüfte Ereignisse | 63.203 |
| davon konsistent | 61.926 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 766 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 488 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 21 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `ORDINARY_DIVIDEND` | 252 | 0 | 482 | 6 |
| `LARGE_DISTRIBUTION` | 514 | 2 | 6 | 15 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 894 von 3.340 geprüften Titeln (26,77 %).

**Erklärt: 768 · unerklärt: 509** (0,805 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_USB` 23/24 · `ref_MDT` 23/24 · `ref_MMM` 23/24 · `ref_DE` 23/24 · `ref_AMT` 23/24 · `ref_PLD` 23/24 · `ref_O` 23/24 · `ref_DD` 23/24 · `ref_DTE` 23/24 · `ref_PCG` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.297 |
| Preisbasis | `close` 6.297 |
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

Stichtag **2026-09-30**, 5.614 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-09-30 | 6.035 | 421 | 5.614 | USB, MDT, DE, AMT, PLD, O, DTE, PCG, BRT, GTY, MSI, XRX, IFF, HST, NUE, RRX, CP, ES, AIG, BEN, JCI, FMC, NHC, NFG, MYE, BXMT, ITW, UHT, NJR, TRP, SYK, PCL, DX, ERIC, BANF, CINF, FITB, FLS, GSBC, OMC, INDB, OFG, BHE, WKC, DIN, NHI, RHP, HMN, CDP, FLXS, MRTN, CRT, CVBF, EGP, ESP, OLP, VIRC, RNST, MEOH, LTC, FBNC, ELS, SYBT, AKR, THRM, CPT, SGA, SUI, RYN, ADC, ABCB, ESS, FR, LECO, CIB, RWT, E, HUBG, OLED, LAMR, CIG, STLD, EPM, KRC, ABEV, LOGI, VTR, ARE, RL, BXP, SLG, NLY, TSM, CSR, FORTY, CM, EPR, FLXI, WPC, FNWD, HCKT, DOX, SRE, RBCAA, VIV, KFY, YORW, TOWN, LII, EMBJ, EVC, NEWT, ALRS, DINE, MDLZ, ZBH, FRO, BFC, SLG-P-I, SPG-P-J, GLAD, CHSCP, AXS, GOOD, GBLI, BANFP, ADAM, PSEC, SHO, BBW, DRH, GAIN, DBI, OFLX, STN, ITRN, FNF, ICE, TRAK, POR, TNL, WU, DEI, NOG, PCS, BGS, ISBA, TTE, WFG, GJT, KNDI, MAIN, FFNW, SHIP, CIM, KDP, AGNC, TFII, SELF, CPHC, IVR, GSM, STWD, ARI, AQN, TRNO, CLDT, FAF, NXPI, EFC, HRZN, SUNS, CCOM, ARCO, STAG, RLJ, NMFC, MITT, CSRE, PVL, VAC, TCPC, ACRE, TGLS, OFS, SCM, ESOA, JOYY, WHF, LAND, RC, SBSW, ORC, EARN, AHRT, NRC, REXR, IRT, CHSCO, CHMI, VISN, BANX, FITB-P-I, LADR, IVT, CHSCN, TPVG, LQ, FSK, ARES, CTRE, OXLCN, ISTR, CHSCM, CIG-C, EPR-P-C, EPR-P-E, GAB-P-G, GAB-P-H, GGN-P-B, GLU-P-A, GSL-P-B, MS-P-A, MS-P-E, MS-P-F, USB-P-A, USB-P-H, AVAL, MS-P-I, QSR, CHSCL, XHR, GSBD, APLE, FSV, FCPT, AAAP, EQBK, BCAL, WTW, NEMD, ENO, PR, GWRS, BHR-P-B, GUT-P-C, XRN, BCV-P-A, EMP, SEAL-P-A, AXS-P-E, IIPR, PK, MS-P-K, INVH, HLNE, JILL, KREF, OXLCM, CGBD, SAFE, TRTX, CHMI-P-A, BBCP, RLJ-P-A, GGT-P-E, GPJA, CRCO, SEAL-P-B, GNT-P-A, IIPR-P-A, SBT, CNNE, EPR-P-G, SRG-P-A, NTR, COLD, PAGS, BRSP, CEPU, OXSQ, PRT, EPRT, NCZ-P-A, NCV-P-A, BSVN, CMSC, BHR-P-D, UTZ, PEB-P-F, PEB-P-E, GLU-P-B, CHMI-P-B, HGLB, MGR, FINS, GDV-P-H, PRIF-P-D, OBDC, HFRO-P-A, ALL-P-H, FITB-P-A, FITB-P-K, RILYN, GOODN, CFG-P-E, ALL-P-I, MS-P-L, GAB-P-K, GGT-P-G, WRB-P-F, CCAP, DLY, FHN-P-E, GOCOQ, VOXR, ASGI, BSY, WRB-P-G, MGRB, ASO, DTB, TIMB, LANDO, USB-P-Q, FULTP, CAS, WAFDP, WRB-P-H, AFCG, BNL, RC-P-C, ACII, ACHL, FHN-P-F, ACP-P-A, BW-P-A, PEB-P-G, SHO-P-H, RC-P-E, TRTX-P-C, BZ, GOODO, CLDT-P-A, WDI, DTM, SHO-P-I, MGRD, PEB-P-H, DOLE, OXLCO, ADC-P-A, GDV-P-K, PRIF-P-K, FBRT, FBRT-P-E, MEGI, BXSL, GFS, MS-P-O, NXDT-P-A, HPP-P-C, ONL, IMPPP, REFI, EFC-P-B, DMA, SPE-P-C, SGHC, USB-P-S, LIEN, PRIF-P-L, USEA, CRBG, STRW, BHM, FSCO, FG, EFC-P-C, KVUE, ALL-P-J, LANDP, ACEI, AHR, COIA, CRCA, CSNR, CURB, DIVE, DVXE, ETCO, FBDC, FOXY, FRIZ, FVR, HERZ, INTM, KBDC, KLMN, LGPS, LINE, MGRE, MMID, MSDL, MSIF, NCDL, NEWTP, OTF, PCHI, PDCC, PDPA, PLTA, PSBD, QQDN, SBAR, SOBO, SRBK, STRC, UMBFO, URSP, XV |
| 2025-09-29 | 5.583 | 3 | 5.580 | SVA, FFNW, SBT |
| 2024-09-25 | 5.339 | 0 | 5.339 |  |
| 2023-09-25 | 5.145 | 0 | 5.145 |  |
| 2022-09-22 | 4.774 | 0 | 4.774 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.614 | 0,9892 | 28 | 130,5 | 155 | 5.491 | 2.050 | 151 | 33 | 17 / 17 |
| `6M` | 5.614 | 0,9909 | 40 | 177 | 237 | 5.300 | 2.315 | 220 | 45 | 11 / 11 |
| `12M` | 5.614 | 0,9919 | 44 | 230 | 279,3 | 5.141 | 2.429 | 278 | 48 | 18 / 18 |
| `12M-1M` | 5.614 | 0,9946 | 39 | 253 | 296 | 3.458 | 2.399 | 345 | 46 | 14 / 14 |
| `RELATIVE_STRENGTH` | — | — | — | — | — | — | — | — | — | — |

> **`RELATIVE_STRENGTH` · `RANK_EQUIVALENT_TO_12M`** (`BENCHMARK_NOT_IN_CANONICAL_STORE`). Bei festem Stichtag ist der Benchmarkterm fuer alle Titel gleich. Relative Staerke ist dann die Zwoelfmonatsrendite minus einer Konstante, und eine Konstante aendert keinen Rang. Die Rangstatistik steht deshalb vollstaendig in der Zeile 12M; sie hier zu wiederholen waere dieselbe Messung unter zwei Namen.

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -41,8 % | 40,8 % | 19,6 | 81,2 | 61,6 | -3.458 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -61,1 % | 10,5 % | 12,4 | 62,0 | 49,6 | -2.782 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -19,6 % | 33,5 % | 30,9 | 77,3 | 46,4 | -2.602 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -25,6 % | 15,1 % | 27,4 | 65,9 | 38,5 | -2.160 |
| BGSF | I · Services | `HIGH_YIELD` | -22,8 % | 10,4 % | 29,0 | 61,9 | 32,9 | -1.844 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -13,5 % | 14,1 % | 35,6 | 65,1 | 29,5 | -1.653 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -8,5 % | 13,4 % | 40,6 | 64,4 | 23,8 | -1.337 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,6 % | -13,9 % | 10,2 | 33,8 | 23,7 | -1.328 |
| PDX | (unclassified) | `HIGH_YIELD` | -12,6 % | 8,7 % | 36,6 | 59,9 | 23,3 | -1.308 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -12,2 % | 8,8 % | 37,0 | 60,0 | 23,1 | -1.295 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -12,9 % | 7,7 % | 36,4 | 58,8 | 22,4 | -1.255 |
| ECAT | (unclassified) | `HIGH_YIELD` | -6,2 % | 14,1 % | 42,9 | 65,1 | 22,3 | -1.249 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -19,7 % | 3,7 % | 30,8 | 53,0 | 22,2 | -1.245 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -0,7 % | 22,9 % | 49,9 | 71,5 | 21,7 | -1.216 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -17,0 % | 3,9 % | 32,4 | 53,4 | 21,0 | -1.177 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.354 | 0,00 % | 21 | -0,37 | 4,73 |
| `LOW_YIELD` | 701 | 1,04 % | 36 | -0,64 | 3,19 |
| `MEDIUM_YIELD` | 613 | 3,03 % | -23 | 0,41 | 1,53 |
| `HIGH_YIELD` | 946 | 6,33 % | -173 | 3,08 | 9,79 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.354 | 0,00 % | 27 | -0,48 | 4,31 |
| `LOW_YIELD` | 701 | 1,07 % | 40 | -0,71 | 2,99 |
| `MEDIUM_YIELD` | 613 | 3,14 % | -17 | 0,30 | 1,24 |
| `HIGH_YIELD` | 946 | 6,72 % | -165 | 2,94 | 9,83 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 133 | 5,97 % | -131 | 2,33 | 10,72 |
| Utilities | 134 | 3,09 % | -20 | 0,35 | 4,88 |
| (unclassified) | 1.049 | 0,00 % | 0 | 0,00 | 8,01 |
| Energy | 141 | 2,14 % | 2 | -0,04 | 5,59 |
| Financials | 858 | 1,78 % | 3 | -0,05 | 5,42 |
| Consumer Staples | 104 | 1,25 % | 9 | -0,15 | 3,86 |
| Communication | 122 | 0,00 % | 11 | -0,19 | 5,58 |
| Real Estate | 56 | 0,00 % | 14 | -0,25 | 7,23 |
| Industrials | 408 | 0,00 % | 16 | -0,28 | 4,20 |
| (other) | 447 | 0,00 % | 18 | -0,32 | 3,33 |
| Materials | 285 | 0,00 % | 19 | -0,34 | 3,71 |
| Health Care | 823 | 0,00 % | 19 | -0,34 | 3,05 |
| Technology | 668 | 0,00 % | 21 | -0,37 | 3,81 |
| Consumer Discretionary | 386 | 0,00 % | 22 | -0,39 | 4,68 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 1.049 | 0,00 % | 0 | 0,00 | 8,01 |
| H · Finance, Insurance, And Real Estate | 1.047 | 2,10 % | 1 | -0,02 | 7,03 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 367 | 1,66 % | 2 | -0,04 | 4,88 |
| F · Wholesale Trade | 84 | 0,00 % | 17 | -0,30 | 3,26 |
| D · Manufacturing | 1.747 | 0,00 % | 18 | -0,32 | 3,45 |
| B · Mining | 233 | 0,00 % | 18 | -0,32 | 4,94 |
| I · Services | 810 | 0,00 % | 21 | -0,37 | 4,17 |
| G · Retail Trade | 202 | 0,00 % | 23 | -0,41 | 4,11 |
| A · Agriculture, Forestry, And Fishing | 17 | 0,00 % | 25 | -0,45 | 2,73 |
| C · Construction | 58 | 0,00 % | 31 | -0,54 | 3,80 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-09-28 (-2 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9292 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9431 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.166 / 5.614 / 5.614 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9915 · Median 54 Ränge · P95 360,2 · Maximum 3.435,5 · 527 Titel bewegen sich um mindestens 5 Perzentilpunkte, 116 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 320 | 309 | 18 | 7 | 7,8 % |
| Quality Momentum (`quality-momentum`) | 33 | 32 | 2 | 1 | 9,1 % |
| Future Leader (`future-leader`) | 28 | 30 | 1 | 3 | 13,3 % |
| Value Momentum (`value-momentum`) | 146 | 147 | 2 | 3 | 3,4 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-09-30 | 0 | 5.614 | 0,9946 | 39 | 296 | 345 | 14 / 14 |
| 2025-09-29 | 252 | 5.580 | 0,9918 | 53 | 363,1 | 639 | 17 / 17 |
| 2024-09-25 | 504 | 5.339 | 0,9927 | 55 | 327 | 625 | 17 / 17 |
| 2023-09-25 | 756 | 5.145 | 0,9894 | 57 | 315,2 | 522 | 19 / 19 |
| 2022-09-22 | 1.008 | 4.774 | 0,9956 | 37 | 212,7 | 199 | 27 / 27 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6874` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9892 · `6M` 0,9909 · `12M` 0,9919 · `12M-1M` 0,9946 · `RELATIVE_STRENGTH` RANK_EQUIVALENT_TO_12M |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `424` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
