# Produktuniversum nachholen (eligibility-catchup-2026-11)

Freigabeliste fuer `scripts/core/eligibility-gate.mjs --approved`, erzeugt von `scripts/core/eligibility-catchup.mjs` aus dem Probelauf lokal 05.11.2026 (Kette build-us-eligibility, apply-name-layer-class DEBT, apply-exchange-directory) gegen us-security-master-1.3.0. Gebunden an den Vorstand sha256 `b8f85c88d5e9…`.

Produktuniversum: **6686 → 6573**. Wechsel gesamt 228, davon 131 aus dem Produkt, 18 ins Produkt.

## Vorher/Nachher je Produkt

| Produkt | Titel heute | verlieren den Titel | neue Titel mit Seite |
|---|---:|---:|---:|
| discover | 6091 | 123 | 0 |
| elliott | 5049 | 0 | 0 |
| fundamental | 5051 | 4 | 0 |
| hedgefonds | 4448 | 5 | 1 |
| quant | 6684 | 131 | 0 |
| supertrader | 1501 | 0 | 0 |
| technical | 5664 | 24 | 0 |
| technik | 5049 | 0 | 0 |

Screener liest das Produktuniversum ueber den Discover-Index; neue Titel erscheinen in Discover, Quant und Screener erst nach dem naechsten Marktdaten-Lauf.

## Gruende

Aus dem Produkt:
- CONFIRMED_NON_EQUITY:ETF: 131

Ins Produkt:
- ELIGIBLE <- CONFIRMED_NON_EQUITY:ETF: 2
- REVIEW <- CONFIRMED_NON_EQUITY:WARRANT: 6
- REVIEW <- CONFIRMED_NON_EQUITY:RIGHT: 2
- ELIGIBLE <- CONFIRMED_NON_EQUITY:DEBT: 2
- REVIEW <- CONFIRMED_NON_EQUITY:UNIT: 5
- ELIGIBLE <- CONFIRMED_NON_EQUITY:WARRANT: 1

## Aus dem Produkt (vollstaendig)

| Ticker | Grund | heute sichtbar in |
|---|---|---|
| WR | CONFIRMED_NON_EQUITY:ETF | quant |
| PCL | CONFIRMED_NON_EQUITY:ETF | quant, technical |
| VOLT | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| IG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| NYNY | CONFIRMED_NON_EQUITY:ETF | quant |
| CAM | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| BREW | CONFIRMED_NON_EQUITY:ETF | quant |
| CLUB | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| PCS | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| VTG | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| ABI | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| CEGX | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| CSRE | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| INVN | CONFIRMED_NON_EQUITY:ETF | quant |
| TMED | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| AAAP | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SPCL | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| MYHA | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| COOL | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AAAC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AAAD | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ACYN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ACYS | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AGIQ | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AHD | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AMKL | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| APHU | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| AQLG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ASEC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ASTN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BCEM | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BCGD | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BCOR | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| BCSM | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BFLX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BRCE | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BRIE | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BTOT | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BUFE | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| BWOW | CONFIRMED_NON_EQUITY:ETF | quant |
| CCRP | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CJUN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CMAY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CRUX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CRXP | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CSIO | CONFIRMED_NON_EQUITY:ETF | discover, hedgefonds, quant |
| CSNR | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| CSSD | CONFIRMED_NON_EQUITY:ETF | quant |
| CTJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| CTMA | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DDFY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DDFZ | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DDTY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DDTZ | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DLMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DLUX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| DUSG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ECHX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| EMJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| EMMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| ETCO | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| FBDC | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| FOXY | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| FSML | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| GIEQ | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| GOLI | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| GOVM | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| GQGU | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| GXRP | CONFIRMED_NON_EQUITY:ETF | discover, fundamental, hedgefonds, quant |
| HJUN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| HMAY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| HOLA | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| IBHM | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| IBMW | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| IBMX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| IDJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| IDMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| IFLO | CONFIRMED_NON_EQUITY:ETF | discover, hedgefonds, quant, technical |
| JIDE | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| JMMF | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| JMTG | CONFIRMED_NON_EQUITY:ETF | discover, hedgefonds, quant, technical |
| JUNC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| KEEX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| KPHO | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| MAYC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| MMID | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| MMK | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| MYCO | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| NGIF | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| NUDG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| NUIF | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| PBSC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| PJUS | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| POEL | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| PONX | CONFIRMED_NON_EQUITY:ETF | quant |
| PRAB | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| PRSD | CONFIRMED_NON_EQUITY:ETF | discover, hedgefonds, quant |
| QJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| QMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| QQJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| QQMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| QSOL | CONFIRMED_NON_EQUITY:ETF | discover, fundamental, quant |
| RAAA | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| REGS | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| REMC | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| RESM | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| RONB | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SBAR | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| SCJN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SCMY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SITX | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SLWS | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| SMU | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| SQLT | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| TLG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| TOXR | CONFIRMED_NON_EQUITY:ETF | discover, fundamental, quant |
| TSOL | CONFIRMED_NON_EQUITY:ETF | discover, fundamental, quant |
| UCOP | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| UPAL | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| UPLT | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| USLN | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| VDG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| VDV | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| VGVT | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| VOXP | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| VTP | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| WCMG | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| WRTH | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| XEY | CONFIRMED_NON_EQUITY:ETF | discover, quant |
| XOEF | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |
| XV | CONFIRMED_NON_EQUITY:ETF | discover, quant, technical |

## Ins Produkt (vollstaendig)

| Ticker | neu | vorher |
|---|---|---|
| DOO | ELIGIBLE | CONFIRMED_NON_EQUITY:ETF |
| CHAI | ELIGIBLE | CONFIRMED_NON_EQUITY:ETF |
| ILLRW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| CELGR | REVIEW | CONFIRMED_NON_EQUITY:RIGHT |
| LILMW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| GREEL | ELIGIBLE | CONFIRMED_NON_EQUITY:DEBT |
| IVCBU | REVIEW | CONFIRMED_NON_EQUITY:UNIT |
| TETEU | REVIEW | CONFIRMED_NON_EQUITY:UNIT |
| MSSAU | REVIEW | CONFIRMED_NON_EQUITY:UNIT |
| CLRCU | REVIEW | CONFIRMED_NON_EQUITY:UNIT |
| BNCWZ | ELIGIBLE | CONFIRMED_NON_EQUITY:WARRANT |
| CCCXW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| DGACR | REVIEW | CONFIRMED_NON_EQUITY:RIGHT |
| NVNIW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| SPKLU | REVIEW | CONFIRMED_NON_EQUITY:UNIT |
| SPKLW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| SVMHW | REVIEW | CONFIRMED_NON_EQUITY:WARRANT |
| SWKHL | ELIGIBLE | CONFIRMED_NON_EQUITY:DEBT |
