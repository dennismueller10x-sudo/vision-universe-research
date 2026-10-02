# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum

> Erzeugt aus `quant/data/providers/return-basis-input-audit.json` und `quant/data/providers/return-basis-universe-study.json`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.

| | |
|---|---|
| Stand der Messung | 2026-10-02T21:05:48.000Z |
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
| `DIVIDEND_EVENTS_AVAILABLE` | 3.338 |
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
| geprüfte Titel | 3.325 |
| geprüfte Ereignisse | 63.146 |
| davon konsistent | 61.759 |
| schlechtester Fehler | 760,6027 % |
| Toleranz | 0,20 % |

**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.

| Einordnung | Ereignisse | |
|---|---:|---|
| `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | 766 | bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte |
| `NO_ADJUSTMENT_AT_ALL` | 598 | **gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite |
| `ADJUSTMENT_INCONSISTENT` | 21 | bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht |
| `ADJUSTMENT_ON_NEIGHBOURING_DAY` | 2 | bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung |

Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem 0,60- und dem 1,40-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage "wurde überhaupt bereinigt", nicht "stimmt der Betrag".

| Größe der Ausschüttung | `ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT` | `ADJUSTMENT_ON_NEIGHBOURING_DAY` | `NO_ADJUSTMENT_AT_ALL` | `ADJUSTMENT_INCONSISTENT` |
|---|---:|---:|---:|---:|
| `ORDINARY_DIVIDEND` | 252 | 0 | 590 | 6 |
| `LARGE_DISTRIBUTION` | 514 | 2 | 8 | 15 |

`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.

Betroffen sind 994 von 3.325 geprüften Titeln (29,89 %).

**Erklärt: 768 · unerklärt: 619** (0,980 % aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.

Titel mit Abweichungen (erste 10 von 50 aufgezeichneten): `ref_USB` 23/24 · `ref_MDT` 23/24 · `ref_MMM` 23/24 · `ref_DE` 23/24 · `ref_AMT` 23/24 · `ref_PLD` 23/24 · `ref_O` 23/24 · `ref_DD` 23/24 · `ref_DTE` 23/24 · `ref_PCG` 23/24.

### Was die Produktion heute rechnet

Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.

| | |
|---|---|
| Artefakt | `quant/data/product/factor-evidence-v1` |
| Einträge | 6.308 |
| Preisbasis | `close` 6.308 |
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

Stichtag **2026-10-01**, 5.520 Titel mit ausreichender Historie.

**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**

| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |
|---|---:|---:|---:|---|
| 2026-10-01 | 6.027 | 507 | 5.520 | USB, MDT, DE, AMT, PLD, O, DTE, PCG, BRT, FRT, GTY, MSI, XRX, IFF, APD, HST, NUE, RRX, CP, ABM, ES, AIG, BEN, WWW, JCI, CPB, FMC, STT, NHC, NFG, MYE, BXMT, ITW, UHT, MRSH, NJR, PKE, RJF, TRP, CAH, SYK, PCL, DX, ERIC, BANF, CINF, FITB, FLS, FULT, GSBC, OMC, INDB, VLGEA, OFG, IG, BHE, WKC, DIN, NHI, RHP, HMN, CDP, FLXS, MRTN, CRT, THFF, CVBF, EGP, ESP, OLP, VIRC, RNST, MEOH, LTC, FBNC, ELS, SYBT, AKR, THRM, CPT, SGA, SUI, RYN, ADC, ABCB, ESS, FR, CWCO, LECO, CIB, RWT, WASH, E, ANDE, HUBG, OLED, LAMR, CHH, CIG, STLD, EPM, KRC, ABEV, LOGI, VTR, ARE, RL, BXP, SLG, NLY, TSM, CSR, FORTY, CM, EPR, INGR, FLXI, WPC, FNWD, HCKT, DOX, SRE, RBCAA, VIV, KFY, YORW, TOWN, LII, CCZ, EMBJ, EVC, NEWT, ALRS, DINE, MDLZ, ZBH, FRO, BFC, SLG-P-I, SPG-P-J, GLAD, CHSCP, AXS, GOOD, GBLI, BANFP, ADAM, PSEC, SHO, CUBE, BBW, INBK, DRH, GAIN, DBI, OFLX, STN, ITRN, FNF, ICE, HOVNP, TRAK, POR, TNL, WU, DEI, NOG, PCS, BGS, VTG, ISBA, TTE, WFG, GJT, KNDI, MAIN, FFNW, SHIP, CIM, KDP, AGNC, TFII, SELF, CPHC, IVR, GSM, STWD, ARI, AQN, TRNO, CLDT, FAF, NXPI, EFC, HRZN, SUNS, CCOM, ARCO, STAG, RLJ, NMFC, MITT, CSRE, PVL, VAC, TCPC, ACRE, TGLS, OFS, SCM, ESOA, JOYY, GIGL, WHF, LAND, RC, SBSW, ORC, LFT, EARN, RITM, AHRT, NRC, REXR, IRT, CHSCO, CHMI, VISN, BANX, FITB-P-I, LADR, IVT, CHSCN, TPVG, TNET, LQ, FPI, FSK, ARES, SFBS, CTRE, OXLCN, ACR-P-C, ISTR, CHSCM, ALL-P-B, BAC-P-L, CIG-C, EPR-P-C, EPR-P-E, GAB-P-G, GAB-P-H, GGN-P-B, GLU-P-A, GSL-P-B, MS-P-A, MS-P-E, MS-P-F, USB-P-A, USB-P-H, AVAL, MS-P-I, QSR, CHSCL, XHR, GSBD, APLE, FSV, FCPT, AAAP, EQBK, BCAL, WTW, NEMD, ENO, PR, GWRS, BHR-P-B, GUT-P-C, XRN, BCV-P-A, EMP, SEAL-P-A, AXS-P-E, IIPR, PK, MS-P-K, INVH, HLNE, JILL, KREF, NGL-P-B, OXLCM, CGBD, SAFE, GPMT, TRTX, KIM-P-L, CHMI-P-A, AGNCN, BBCP, RLJ-P-A, GGT-P-E, GPJA, FRT-P-C, CRCO, ADAMN, SEAL-P-B, SFB, GNT-P-A, IIPR-P-A, SBT, CNNE, EPR-P-G, SRG-P-A, KIM-P-M, NTR, BFS-P-D, COLD, PAGS, BRSP, CEPU, OXSQ, PRT, EPRT, BAC-P-K, NCZ-P-A, NCV-P-A, BSVN, CMSC, BHR-P-D, UTZ, PEB-P-F, PEB-P-E, GLU-P-B, CHMI-P-B, HGLB, AGNCM, NGL-P-C, MGR, AGM-P-D, FINS, GDV-P-H, AHRT-P-A, PRIF-P-D, OBDC, HFRO-P-A, ALL-P-H, FITB-P-A, BFS-P-E, FITB-P-K, NMCO, RILYN, GOODN, AGNCO, ADAMM, CFG-P-E, ALL-P-I, MS-P-L, GAB-P-K, GGT-P-G, WRB-P-F, CCAP, AGNCP, DX-P-C, DLY, AGM-P-E, FHN-P-E, FTHY, GOCOQ, VOXR, ASGI, AGM-P-F, BSY, WRB-P-G, MGRB, ASO, DTB, TIMB, LANDO, USB-P-Q, FULTP, AIZN, CAS, HBANP, WAFDP, WRB-P-H, AFCG, BNL, RC-P-C, ACII, ACHL, FHN-P-F, ACP-P-A, BW-P-A, LFT-P-A, FTPA, PEB-P-G, SHO-P-H, ACR-P-D, AGM-P-G, RC-P-E, TRTX-P-C, BZ, GOODO, CLDT-P-A, CMS-P-C, WDI, ADAML, DTM, SHO-P-I, MGRD, PEB-P-H, DOLE, OXLCO, ADC-P-A, GDV-P-K, PRIF-P-K, FBRT, FBRT-P-E, MEGI, BXSL, GFS, MS-P-O, NXDT-P-A, HPP-P-C, ONL, ADAMZ, GPMT-P-A, IMPPP, REFI, EFC-P-B, DMA, SPE-P-C, SGHC, USB-P-S, LIEN, PRIF-P-L, USEA, AGNCL, CRBG, STRW, BHM, RZC, FSCO, FG, RWT-P-A, EFC-P-C, HBANL, KVUE, ALL-P-J, LANDP, ACEI, ACLO, AGNCZ, AHR, ATLCZ, COIA, CRCA, CSNR, CURB, DIVE, DVXE, EASY, ETCO, FBDC, FGSN, FOXY, FRIZ, FVR, GBND, HERZ, INTM, JMTG, KBDC, KLMN, LGPS, LINE, MGRE, MMID, MSDL, MSIF, MUSE, MYCO, NCDL, NEWTP, OTF, PCHI, PDCC, PDPA, PLTA, PRSD, PSBD, QQDN, RAAA, SBAR, SOBO, SPCT, SRBK, STRC, TTAM, UMBFO, URSP, VGVT, VTP, WTFCN, XV |
| 2025-09-30 | 5.581 | 3 | 5.578 | SVA, FFNW, SBT |
| 2024-09-26 | 5.337 | 0 | 5.337 |  |
| 2023-09-26 | 5.145 | 0 | 5.145 |  |
| 2022-09-23 | 4.778 | 0 | 4.778 |  |

Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.

Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.

| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `3M` | 5.520 | 0,9878 | 32 | 140,5 | 146,5 | 5.399 | 1.909 | 148 | 37 | 18 / 18 |
| `6M` | 5.520 | 0,9902 | 38 | 164 | 220 | 5.238 | 2.209 | 197 | 62 | 15 / 15 |
| `12M` | 5.520 | 0,9906 | 44 | 219 | 263,1 | 5.043 | 2.306 | 255 | 50 | 15 / 15 |
| `12M-1M` | 5.520 | 0,9949 | 36 | 230,1 | 277 | 3.324 | 2.306 | 281 | 47 | 12 / 12 |
| `RELATIVE_STRENGTH` | 5.520 | 0,9906 | 44 | 219 | 263,1 | 5.043 | 2.306 | 255 | 50 | 15 / 15 |

`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.

**Die größten Perzentilbewegungen** (Messgröße `12M-1M`, die schwerste Momentumkomponente der Produktion)

| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |
|---|---|---|---:|---:|---:|---:|---:|---:|
| DD | D · Manufacturing | `HIGH_YIELD` | -43,5 % | 36,7 % | 19,4 | 79,7 | 60,2 | -3.324 |
| NLOP | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -62,3 % | 6,9 % | 12,0 | 58,5 | 46,5 | -2.568 |
| SACH | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -21,4 % | 30,6 % | 30,9 | 76,1 | 45,2 | -2.495 |
| AD | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -26,2 % | 14,2 % | 27,9 | 65,4 | 37,5 | -2.067 |
| TLF | D · Manufacturing | `HIGH_YIELD` | -11,7 % | 16,5 % | 38,6 | 67,6 | 29,0 | -1.600 |
| BGSF | I · Services | `HIGH_YIELD` | -27,3 % | 3,9 % | 27,4 | 54,0 | 26,6 | -1.468 |
| AIV | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -67,8 % | -14,7 % | 10,2 | 34,3 | 24,0 | -1.326 |
| BRBS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -7,8 % | 14,2 % | 42,3 | 65,3 | 23,0 | -1.270 |
| IEP | D · Manufacturing | `HIGH_YIELD` | -19,1 % | 4,5 % | 32,2 | 55,1 | 22,9 | -1.266 |
| PDX | (unclassified) | `HIGH_YIELD` | -12,4 % | 9,0 % | 37,9 | 60,8 | 22,9 | -1.265 |
| STRS | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | -11,3 % | 9,8 % | 38,9 | 61,6 | 22,7 | -1.255 |
| MIDD | D · Manufacturing | `HIGH_YIELD` | -16,0 % | 5,1 % | 34,4 | 56,0 | 21,6 | -1.194 |
| ECAT | (unclassified) | `HIGH_YIELD` | -7,4 % | 12,7 % | 42,6 | 64,2 | 21,6 | -1.191 |
| TDS | E · Transportation, Communications, Electric, Gas, And Sanitary Services | `HIGH_YIELD` | -14,3 % | 5,9 % | 35,9 | 57,1 | 21,2 | -1.167 |
| COHN | H · Finance, Insurance, And Real Estate | `HIGH_YIELD` | 0,2 % | 24,0 % | 52,5 | 72,6 | 20,1 | -1.108 |

## 6 · Dividendenschieflage

Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.

**`12M-1M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.356 | 0,00 % | 22 | -0,40 | 4,26 |
| `LOW_YIELD` | 696 | 1,04 % | 35 | -0,63 | 2,77 |
| `MEDIUM_YIELD` | 598 | 3,06 % | -22 | 0,39 | 1,59 |
| `HIGH_YIELD` | 870 | 6,43 % | -179 | 3,23 | 10,17 |

**`12M`**

| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| `NO_DIVIDEND` | 3.356 | 0,00 % | 29 | -0,53 | 4,06 |
| `LOW_YIELD` | 696 | 1,05 % | 37 | -0,67 | 2,90 |
| `MEDIUM_YIELD` | 598 | 3,13 % | -17 | 0,31 | 1,30 |
| `HIGH_YIELD` | 870 | 6,68 % | -163 | 2,95 | 9,97 |

## 7 · Sektorschieflage

Klassifikation: **SIC_DIVISION**, aus `quant/data/product/factor-evidence-v1 (peer.industry) via quant/engines/sic-peer-taxonomy.js`. Das Feld 'sector' der Universumsdatei ist fuer rund hundert von knapp siebentausend Titeln gefuellt. Die SIC-Zuordnung ist die Klassifikation, ueber die auch die Peerperzentile des Produkts laufen.

**Die acht benannten Sektoren des Auftrags**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| REITs | 113 | 5,19 % | -107 | 1,94 | 11,57 |
| Utilities | 132 | 3,13 % | -20 | 0,35 | 4,55 |
| (unclassified) | 1.013 | 0,00 % | 0 | 0,00 | 7,95 |
| Energy | 141 | 2,13 % | 2 | -0,04 | 5,76 |
| Financials | 841 | 1,69 % | 3 | -0,05 | 5,09 |
| Consumer Staples | 101 | 0,96 % | 6 | -0,11 | 3,42 |
| Communication | 118 | 0,00 % | 10 | -0,18 | 4,93 |
| Industrials | 406 | 0,00 % | 15 | -0,27 | 4,02 |
| Real Estate | 56 | 0,00 % | 17 | -0,30 | 10,08 |
| (other) | 442 | 0,00 % | 18 | -0,32 | 3,87 |
| Health Care | 823 | 0,00 % | 18 | -0,33 | 2,88 |
| Technology | 667 | 0,00 % | 19 | -0,34 | 3,62 |
| Materials | 283 | 0,00 % | 19 | -0,34 | 3,18 |
| Consumer Discretionary | 384 | 0,00 % | 21 | -0,38 | 3,96 |

> Einteilung `AUDIT_LOCAL_SIC_RANGES`. Gilt nur fuer diese Studie und ist keine Produkttaxonomie. Die Bereiche stehen hier, damit jede Zuordnung nachrechenbar ist. Die SIC-Bereiche: Energy 1200–1399/2900–2999/4600–4619 · Utilities 4900–4991 · REITs 6798 · Financials 6000–6499/6700–6797/6799 · Real Estate 6500–6599 · Health Care 2833–2836/3826/3841–3851/8000–8099 · Technology 3570–3579/3600–3699/7370–7379 · Communication 2700–2799/4800–4899/7800–7841 · Materials 1000–1099/1400–1499/2600–2699/2800–2824/2840–2899/3200–3399 · Consumer Staples 2000–2199/2825–2832/5400–5499/5912 · Consumer Discretionary 2200–2399/3700–3799/5200–5399/5500–5911/5913–5999/7000–7099/7900–7999 · Industrials 1500–1799/3400–3569/3580–3599/3710–3728/4000–4599/4620–4799/8700–8748.

**Die Peertaxonomie des Produkts (SIC-Division)**

| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |
|---|---:|---:|---:|---:|---:|
| (unclassified) | 1.013 | 0,00 % | 0 | 0,00 | 7,95 |
| H · Finance, Insurance, And Real Estate | 1.010 | 1,92 % | 2 | -0,04 | 6,40 |
| E · Transportation, Communications, Electric, Gas, And Sanitary Services | 361 | 1,65 % | 2 | -0,04 | 4,44 |
| D · Manufacturing | 1.741 | 0,00 % | 17 | -0,31 | 3,23 |
| A · Agriculture, Forestry, And Fishing | 17 | 0,00 % | 17 | -0,31 | 2,63 |
| B · Mining | 232 | 0,00 % | 17 | -0,31 | 4,36 |
| F · Wholesale Trade | 82 | 0,00 % | 18 | -0,32 | 3,54 |
| I · Services | 806 | 0,00 % | 19 | -0,34 | 3,93 |
| G · Retail Trade | 201 | 0,00 % | 22 | -0,40 | 3,97 |
| C · Construction | 57 | 0,00 % | 31 | -0,56 | 3,37 |

Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.

## 8 · Strategiewirkung

Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.

| | |
|---|---:|
| Grundlage | `EVIDENCE_AT_OR_BEFORE_CUTOFF` |
| veröffentlichtes Evidence vom | 2026-10-01 (0 Tage nach dem Stichtag) |
| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | 0 |
| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | 0,9495 |
| ρ Simulation (Kursrendite) zur veröffentlichten Note | 0,9606 |
| bewertete Titel: veröffentlicht / Kurs / gesamt | 5.079 / 5.520 / 5.520 |

**Die Momentumnote selbst, Kurs gegen gesamt:** ρ 0,9924 · Median 49 Ränge · P95 344 · Maximum 3.088 · 491 Titel bewegen sich um mindestens 5 Perzentilpunkte, 123 um mindestens 10.

| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |
|---|---:|---:|---:|---:|---:|
| Momentum Leader (`momentum-leader`) | 299 | 296 | 16 | 13 | 9,7 % |
| Quality Momentum (`quality-momentum`) | 36 | 35 | 2 | 1 | 8,3 % |
| Future Leader (`future-leader`) | 27 | 27 | 0 | 0 | 0,0 % |
| Value Momentum (`value-momentum`) | 161 | 160 | 1 | 0 | 0,6 % |

Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.

## 9 · Historische Robustheit

Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.

| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-10-01 | 0 | 5.520 | 0,9949 | 36 | 277 | 281 | 12 / 12 |
| 2025-09-30 | 252 | 5.578 | 0,9917 | 54 | 357 | 629 | 11 / 11 |
| 2024-09-26 | 504 | 5.337 | 0,9930 | 54 | 316,2 | 567 | 15 / 15 |
| 2023-09-26 | 756 | 5.145 | 0,9898 | 58 | 312 | 513 | 24 / 24 |
| 2022-09-23 | 1.008 | 4.778 | 0,9955 | 37 | 219 | 204 | 20 / 20 |

An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `PUBLISHED_FACTOR_EVIDENCE_IS_NOT_POINT_IN_TIME` statt einer Zahl.

## 10 · Maschinenlesbarer Stand

| Flag | Wert |
|---|---|
| `FULL_UNIVERSE_RETURN_AUDIT` | `PASS` |
| `DUAL_RETURN_SERIES_CAPABLE_UNIVERSE` | `6852` |
| `PRICE_VS_TOTAL_RANK_CORRELATION` | `3M` 0,9878 · `6M` 0,9902 · `12M` 0,9906 · `12M-1M` 0,9949 · `RELATIVE_STRENGTH` 0,9906 |
| `DIVIDEND_BIAS` | `MEASURED` |
| `SECTOR_BIAS` | `MEASURED` |
| `STRATEGY_IMPACT` | `MEASURED` |
| `HISTORICAL_ROBUSTNESS` | `MEASURED` |
| `UNEXPLAINED_ADJUSTMENTS_INSIDE_COMPARISON_WINDOW` | `0` |
| `EXCLUDED_FOR_UNEXPLAINED_ADJUSTMENT` | `510` |
| `METHODOLOGY_DECISION_READY` | `FAIL` |
| `QUANT_V2_MOMENTUM_RETURN_BASIS` | `PENDING_METHOD_DECISION` |

Artefakte: `quant/data/providers/return-basis-input-audit.json` · `quant/data/providers/return-basis-universe-study.json`

## 11 · Die drei Alternativen

Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **PENDING_METHOD_DECISION**.

**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.

**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.

**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage "was hätte ich verdient" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.

Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.
