# Klassifiziererwechsel us-security-master-1.1.0 → us-security-master-1.3.0: vollständige Listen

Erzeugt von `scripts/market/security-master-v130-evidence.mjs` (security-master-v130-evidence-1.0.0) aus dem committeten Stamm `26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332` (generatedAt 2026-09-11T14:43:20.305Z). Nicht von Hand ändern.

- Typwechsel: 138 (EQUITY_COMMON->PREFERRED 127, EQUITY_COMMON->TEST_SECURITY 11)
- Eignungswechsel: 138 (true->false 138), dieselben IDs wie die Typwechsel: ja
- backtestfähig: 6397 → 6270 (−127 / +0), 110 mit Langreihe
- unverändert: canonical_id 0, Deaktivierungen 0, Reaktivierungen 0, Tickerwechsel 0, verlorene IDs 0, neue IDs 0

| Ticker | securityId | Instrumenttyp | eligible_us_equity | backtestfähig | Identität (core/identity.js) | Langreihe (Bars) | Produkteignung |
|---|---|---|---|---|---|---|---|
| ACGLN | `ref_ACGLN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 282 (2021-06-04 … 2026-10-23) | SEPARATE_CLASS |
| ACGLO | `ref_ACGLO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 480 (2017-08-18 … 2026-10-23) | SEPARATE_CLASS |
| ADAMM | `ref_ADAMM` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| ADAMN | `ref_ADAMN` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| ADAMO | `ref_ADAMO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 41 (2026-01-16 … 2026-10-23) | SEPARATE_CLASS |
| AGNCM | `ref_AGNCM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 400 (2019-03-01 … 2026-10-23) | SEPARATE_CLASS |
| AGNCN | `ref_AGNCN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 480 (2017-08-18 … 2026-10-23) | SEPARATE_CLASS |
| AGNCO | `ref_AGNCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 370 (2019-09-27 … 2026-10-23) | SEPARATE_CLASS |
| AGNCP | `ref_AGNCP` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| AIRTP | `ref_AIRTP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 385 (2019-06-14 … 2026-10-23) | SEPARATE_CLASS |
| ATLCP | `ref_ATLCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 280 (2021-06-18 … 2026-10-23) | SEPARATE_CLASS |
| BANFP | `ref_BANFP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 1180 (2004-03-19 … 2026-10-23) | SEPARATE_CLASS |
| BHFAM | `ref_BHFAM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 259 (2021-11-12 … 2026-10-23) | SEPARATE_CLASS |
| BHFAN | `ref_BHFAN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 311 (2020-11-13 … 2026-10-23) | SEPARATE_CLASS |
| BHFAO | `ref_BHFAO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 336 (2020-05-22 … 2026-10-23) | SEPARATE_CLASS |
| BHFAP | `ref_BHFAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 397 (2019-03-22 … 2026-10-23) | SEPARATE_CLASS |
| BPOPM | `ref_BPOPM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 936 (2008-11-21 … 2026-10-23) | SEPARATE_CLASS |
| BPYPM | `ref_BPYPM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 274 (2021-07-30 … 2026-10-23) | SEPARATE_CLASS |
| BPYPN | `ref_BPYPN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 350 (2020-02-14 … 2026-10-23) | SEPARATE_CLASS |
| BPYPO | `ref_BPYPO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 376 (2019-08-16 … 2026-10-23) | SEPARATE_CLASS |
| BPYPP | `ref_BPYPP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 398 (2019-03-15 … 2026-10-23) | SEPARATE_CLASS |
| BRKRP | `ref_BRKRP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 59 (2025-09-12 … 2026-10-23) | SEPARATE_CLASS |
| BUSEP | `ref_BUSEP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 73 (2025-06-06 … 2026-10-23) | SEPARATE_CLASS |
| BWBBP | `ref_BWBBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 271 (2021-08-20 … 2026-10-23) | SEPARATE_CLASS |
| CCLDO | `ref_CCLDO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 247 (2022-02-04 … 2026-10-23) | SEPARATE_CLASS |
| CCLDP | `ref_CCLDP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 529 (2015-11-06 … 2026-10-23) | SEPARATE_CLASS |
| CCNEP | `ref_CCNEP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 323 (2020-08-21 … 2026-10-23) | SEPARATE_CLASS |
| CDZIP | `ref_CDZIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 278 (2021-07-02 … 2026-10-23) | SEPARATE_CLASS |
| CHSCM | `ref_CHSCM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 632 (2014-09-19 … 2026-10-23) | SEPARATE_CLASS |
| CHSCN | `ref_CHSCN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 660 (2014-03-07 … 2026-10-23) | SEPARATE_CLASS |
| CHSCO | `ref_CHSCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 683 (2013-09-27 … 2026-10-23) | SEPARATE_CLASS |
| CHSCP | `ref_CHSCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 1231 (2003-03-28 … 2026-10-23) | SEPARATE_CLASS |
| CHTRP | `ref_CHTRP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| CNOBP | `ref_CNOBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 271 (2021-08-13 … 2026-10-23) | SEPARATE_CLASS |
| DCOMP | `ref_DCOMP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 352 (2020-01-31 … 2026-10-23) | SEPARATE_CLASS |
| EFSCP | `ref_EFSCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 259 (2021-11-12 … 2026-10-23) | SEPARATE_CLASS |
| FBIOP | `ref_FBIOP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 467 (2017-11-17 … 2026-10-23) | SEPARATE_CLASS |
| FCNCN | `ref_FCNCN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 37 (2026-02-13 … 2026-10-23) | SEPARATE_CLASS |
| FCNCO | `ref_FCNCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 251 (2022-01-07 … 2026-10-23) | SEPARATE_CLASS |
| FCNCP | `ref_FCNCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 347 (2020-03-06 … 2026-10-23) | SEPARATE_CLASS |
| FGBIP | `ref_FGBIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 288 (2021-04-23 … 2026-10-23) | SEPARATE_CLASS |
| FGNXP | `ref_FGNXP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 449 (2018-03-02 … 2026-09-28) | SEPARATE_CLASS |
| FITBM | `ref_FITBM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| FITBO | `ref_FITBO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| FITBP | `ref_FITBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| FRMEP | `ref_FRMEP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 239 (2022-04-01 … 2026-10-23) | SEPARATE_CLASS |
| FTAIM | `ref_FTAIM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 189 (2023-03-17 … 2026-10-23) | SEPARATE_CLASS |
| FTAIN | `ref_FTAIN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 293 (2021-03-19 … 2026-10-23) | SEPARATE_CLASS |
| FTAIO | `ref_FTAIO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 311 (2019-11-29 … 2026-10-23) | SEPARATE_CLASS |
| FTAIP | `ref_FTAIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| FULTP | `ref_FULTP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 314 (2020-10-23 … 2026-10-23) | SEPARATE_CLASS |
| GECCM | `ref_GECCM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| GECCO | `ref_GECCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 279 (2021-06-25 … 2026-10-23) | SEPARATE_CLASS |
| GOODN | `ref_GOODN` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| GOODO | `ref_GOODO` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| HBANM | `ref_HBANM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 281 (2021-06-11 … 2026-10-23) | SEPARATE_CLASS |
| HBANP | `ref_HBANP` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| HOVNP | `ref_HOVNP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 1091 (2005-12-02 … 2026-10-23) | SEPARATE_CLASS |
| HTLFP | `ref_HTLFP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| IMPPP | `ref_IMPPP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 255 (2021-12-10 … 2026-10-23) | SEPARATE_CLASS |
| LANDM | `ref_LANDM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 302 (2021-01-15 … 2026-10-23) | SEPARATE_CLASS |
| LANDO | `ref_LANDO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 314 (2020-10-23 … 2026-10-23) | SEPARATE_CLASS |
| LANDP | `ref_LANDP` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| LBRDP | `ref_LBRDP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 296 (2020-12-24 … 2026-08-21) | REVIEW |
| LFMDP | `ref_LFMDP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 264 (2021-10-08 … 2026-10-23) | SEPARATE_CLASS |
| LILAP | `ref_LILAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| MBINM | `ref_MBINM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 214 (2022-09-23 … 2026-10-23) | SEPARATE_CLASS |
| MBINN | `ref_MBINN` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| MBINO | `ref_MBINO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| MBNKO | `ref_MBNKO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 75 (2025-05-23 … 2026-10-23) | SEPARATE_CLASS |
| MBNKP | `ref_MBNKP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 328 (2019-12-20 … 2026-10-23) | REVIEW |
| MCHPP | `ref_MCHPP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 83 (2025-03-28 … 2026-10-23) | SEPARATE_CLASS |
| MDRRP | `ref_MDRRP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| MINDP | `ref_MINDP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| MNSBP | `ref_MNSBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 319 (2020-09-18 … 2026-10-23) | SEPARATE_CLASS |
| MSBIP | `ref_MSBIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 219 (2022-08-19 … 2026-10-23) | SEPARATE_CLASS |
| NEEPN | `ref_NEEPN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 396 (2019-03-22 … 2026-10-23) | REVIEW |
| NEWTO | `ref_NEWTO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| NEWTP | `ref_NEWTP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 61 (2025-08-29 … 2026-10-23) | SEPARATE_CLASS |
| NHPAP | `ref_NHPAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 359 (2019-12-13 … 2026-10-23) | REVIEW |
| NHPBP | `ref_NHPBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 264 (2021-10-08 … 2026-10-23) | REVIEW |
| NTRSO | `ref_NTRSO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 365 (2019-11-01 … 2026-10-23) | SEPARATE_CLASS |
| OCCIM | `ref_OCCIM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 108 (2024-10-04 … 2026-10-23) | SEPARATE_CLASS |
| OCCIN | `ref_OCCIN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 255 (2021-12-10 … 2026-10-23) | SEPARATE_CLASS |
| OCFCP | `ref_OCFCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 302 (2020-05-08 … 2026-10-23) | SEPARATE_CLASS |
| OFSSO | `ref_OFSSO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 66 (2025-07-25 … 2026-10-23) | REVIEW |
| ONBPO | `ref_ONBPO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 245 (2022-02-18 … 2026-10-23) | SEPARATE_CLASS |
| ONBPP | `ref_ONBPP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 245 (2022-02-18 … 2026-10-23) | SEPARATE_CLASS |
| OXLCM | `ref_OXLCM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| OXLCN | `ref_OXLCN` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| OXLCO | `ref_OXLCO` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| OXLCP | `ref_OXLCP` | EQUITY_COMMON → PREFERRED | true → false | – (zwei Zeilen, eine inaktiv: zählt in der Survivorship-Kontrolle) | – | – | – |
| OZKAP | `ref_OZKAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 261 (2021-10-29 … 2026-10-23) | SEPARATE_CLASS |
| POWWP | `ref_POWWP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 284 (2021-05-21 … 2026-10-23) | SEPARATE_CLASS |
| PXSAP | `ref_PXSAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | REVIEW |
| QRTEP | `ref_QRTEP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| REGCO | `ref_REGCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 166 (2023-08-25 … 2026-10-23) | SEPARATE_CLASS |
| REGCP | `ref_REGCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 166 (2023-08-25 … 2026-10-23) | SEPARATE_CLASS |
| RILYM | `ref_RILYM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 302 (2020-02-14 … 2026-10-23) | SEPARATE_CLASS |
| RILYN | `ref_RILYN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 370 (2019-09-27 … 2026-10-23) | SEPARATE_CLASS |
| RILYP | `ref_RILYP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 369 (2019-10-04 … 2026-10-23) | SEPARATE_CLASS |
| SIGIP | `ref_SIGIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 307 (2020-12-11 … 2026-10-23) | SEPARATE_CLASS |
| SLMBP | `ref_SLMBP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 1111 (2005-07-15 … 2026-10-23) | SEPARATE_CLASS |
| SLNHP | `ref_SLNHP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 271 (2021-08-20 … 2026-10-23) | SEPARATE_CLASS |
| SMCIP | `ref_SMCIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | – | SEPARATE_CLASS |
| SQFTP | `ref_SQFTP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 281 (2021-06-11 … 2026-10-23) | SEPARATE_CLASS |
| TCBIO | `ref_TCBIO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 296 (2021-02-26 … 2026-10-23) | SEPARATE_CLASS |
| TECTP | `ref_TECTP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 387 (2019-05-31 … 2026-10-23) | REVIEW |
| TFINP | `ref_TFINP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 309 (2020-06-19 … 2026-10-23) | SEPARATE_CLASS |
| UMBFO | `ref_UMBFO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 72 (2025-06-13 … 2026-10-23) | SEPARATE_CLASS |
| UMBFP | `ref_UMBFP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 62 (2025-02-07 … 2026-10-23) | SEPARATE_CLASS |
| VIASP | `ref_VIASP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 503 (2017-03-10 … 2026-10-23) | REVIEW |
| VLYPN | `ref_VLYPN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 117 (2024-08-02 … 2026-10-23) | SEPARATE_CLASS |
| VLYPO | `ref_VLYPO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 483 (2017-07-28 … 2026-10-23) | SEPARATE_CLASS |
| VLYPP | `ref_VLYPP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 593 (2015-06-19 … 2026-10-23) | SEPARATE_CLASS |
| WAFDP | `ref_WAFDP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 299 (2021-02-05 … 2026-10-23) | SEPARATE_CLASS |
| WHLRP | `ref_WHLRP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 631 (2014-09-26 … 2026-10-23) | SEPARATE_CLASS |
| WSBCO | `ref_WSBCO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 55 (2025-10-10 … 2026-10-23) | SEPARATE_CLASS |
| WSBCP | `ref_WSBCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 314 (2020-08-07 … 2026-10-23) | SEPARATE_CLASS |
| WTFCM | `ref_WTFCM` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 562 (2015-07-10 … 2026-10-23) | SEPARATE_CLASS |
| WTFCN | `ref_WTFCN` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 75 (2025-05-23 … 2026-10-23) | SEPARATE_CLASS |
| WTFCP | `ref_WTFCP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 310 (2020-05-08 … 2026-10-23) | SEPARATE_CLASS |
| WVVIP | `ref_WVVIP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 539 (2016-07-01 … 2026-10-23) | SEPARATE_CLASS |
| XOMAO | `ref_XOMAO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 289 (2021-04-16 … 2026-10-23) | REVIEW |
| XOMAP | `ref_XOMAP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 306 (2020-12-18 … 2026-10-23) | REVIEW |
| ZAZZT | `ref_ZAZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZBZX | `ref_ZBZX` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZBZZT | `ref_ZBZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZCZZT | `ref_ZCZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZIONO | `ref_ZIONO` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 38 (2026-02-06 … 2026-10-23) | SEPARATE_CLASS |
| ZIONP | `ref_ZIONP` | EQUITY_COMMON → PREFERRED | true → false | entfällt | ja | 631 (2014-09-26 … 2026-10-23) | SEPARATE_CLASS |
| ZJZZT | `ref_ZJZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZTST | `ref_ZTST` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZVV | `ref_ZVV` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZVZZT | `ref_ZVZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZWZZT | `ref_ZWZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZXYZ-A | `ref_ZXYZ_A` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
| ZXZZT | `ref_ZXZZT` | EQUITY_COMMON → TEST_SECURITY | true → false | entfällt | ja | – | EXCLUDED |
