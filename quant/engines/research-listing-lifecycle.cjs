'use strict';
// Research-only listing-lifecycle register (frozen series ends). Data only; read exclusively by the research loader option listingLifecycleEvidence.
// Regenerate with scripts/quant/v10/population/build-registers.cjs; never hand-edit a record.
module.exports = {
  "schemaVersion": "research-listing-lifecycle-1.0.0",
  "protocol": "docs/quant-recovery/v10/population/protocol-1.0.0.json",
  "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
  "scope": "Source-bound last trading days and terminal consideration for weekly series with a frozen (carried-forward) end, OFFLINE research only (createResearchLoader option listingLifecycleEvidence, default off). No product, master or series change.",
  "builder": "scripts/quant/v10/population/build-registers.cjs",
  "evidence": "docs/quant-recovery/v10/population/lifecycle-cases.json",
  "conventions": {
    "historyGuard": "weekly-real-adapter hash(): sha256(JSON.stringify(points with checkedFrom <= date <= lastTradeDate))",
    "lastTradeDate": "protocol-1.0.0 B2 lastTradeDate rule",
    "paymentDate": "null unless a document states it"
  },
  "records": [
    {
      "securityId": "ref_ALE",
      "ticker": "ALE",
      "cik": "0000066756",
      "issuer": "ALLETE INC",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-12-12",
      "frozenClose": 67.9,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "1990-01-05",
        "checkedTo": "2025-12-12",
        "bars": 1876,
        "pointsSha256": "7c4d53b9f39a41fe870939749c70419ca602fee4ecebdb45aefcfe720d1c92cb"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 67,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-12-15",
          "accession": "0000876661-25-000967"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-29",
          "accession": "0001140361-25-046705"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001140361-25-045482",
          "url": "https://www.sec.gov/Archives/edgar/data/66756/000114036125045482/ef20060780_8k.htm",
          "sha256": "d9aeb8d9251cab7869ea6f40253935519b653825dc88f064358408ecf43a7562",
          "sha256Normalized": "d4da3cd63f2f4c4ccd4f5c1340a47911343f097d30ed07c323700b903b69a930",
          "quote": "Trading of Common Stock on the NYSE was suspended prior to the opening of trading on the Closing Date, and the ",
          "rule": "PRIOR_TO_OPEN_ON_DEFINED_DATE",
          "statedDate": "2025-12-15"
        },
        {
          "role": "LAST_TRADE_DATE_DEFINITION",
          "accession": "0001140361-25-045482",
          "url": "https://www.sec.gov/Archives/edgar/data/66756/000114036125045482/ef20060780_8k.htm",
          "sha256": "d9aeb8d9251cab7869ea6f40253935519b653825dc88f064358408ecf43a7562",
          "sha256Normalized": "d4da3cd63f2f4c4ccd4f5c1340a47911343f097d30ed07c323700b903b69a930",
          "quote": "Effective Time”) on December 15, 2025 (the “Closing Date”), Merger "
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001140361-24-032849",
          "url": "https://www.sec.gov/Archives/edgar/data/66756/000114036124032849/ny20029448x3_defm14a.htm",
          "sha256": "25bbc844bfb1c3e321706020e9210c52318ac49959f12625f62cd64fdc020b04",
          "sha256Normalized": "25bbc844bfb1c3e321706020e9210c52318ac49959f12625f62cd64fdc020b04",
          "quote": "o Share, if any, and the Dissenting Shares in accordance with Section 2.01(g) and Section 2.05 , shall automatically be converted into, and shall thereafter represent solely, the right to receive cash in the amount of $67.00, without interest (the “ Merger Consideration ”)"
        }
      ]
    },
    {
      "securityId": "ref_ALOT",
      "ticker": "ALOT",
      "cik": "0000008146",
      "issuer": "AstroNova, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-08-26",
      "frozenClose": 28.99,
      "frozenTailBarsAtBuild": 9,
      "historyGuard": {
        "checkedFrom": "1990-01-05",
        "checkedTo": "2026-08-26",
        "bars": 1912,
        "pointsSha256": "91eb9e712b0339ff975fc10742954835faaa9b18d63f6a254e0b053febfc1060"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 29,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-08-27",
          "accession": "0001354457-26-000831"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-09-08",
          "accession": "0001193125-26-385202"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-26-368764",
          "url": "https://www.sec.gov/Archives/edgar/data/8146/000119312526368764/d618841d8k.htm",
          "sha256": "5ee09f23cacbe96e58516489725966b3a7b5b5d198611675fba5974e065e7437",
          "sha256Normalized": "133fabe3646f9b823f86951efc293c155f41367bd4ff1ca037b8f6cea28d4da0",
          "quote": "ock on the Nasdaq Global Market will be suspended after the close of trading on August 26, 2026. The Comp",
          "rule": "CLOSE_OF_TRADING",
          "statedDate": "2026-08-26"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001193125-26-326441",
          "url": "https://www.sec.gov/Archives/edgar/data/8146/000119312526326441/d140981ddefm14a.htm",
          "sha256": "72f59bab86ef151b8144177fda4bec259e71e07e76a6f449eaefcb9fe3bb6636",
          "sha256Normalized": "72f59bab86ef151b8144177fda4bec259e71e07e76a6f449eaefcb9fe3bb6636",
          "quote": "er (other than shares held by AstroNova as treasury stock and shares held by Parent or any of its subsidiaries) will be converted into the right to receive $29.00 per share in cash, without interest and subject to any applicable withholding taxes (the “ Merger Consideration ”)"
        }
      ]
    },
    {
      "securityId": "ref_APLT",
      "ticker": "APLT",
      "cik": "0001697532",
      "issuer": "Applied Therapeutics, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-02-02",
      "frozenClose": 0.103,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "2019-05-17",
        "checkedTo": "2026-02-02",
        "bars": 351,
        "pointsSha256": "8a1813f9d9a9d43c82564a71586eeac4d04363c0dd572efa912fa09734956585"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-02-03",
          "accession": "0001354457-26-000130"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-02-13",
          "accession": "0001193125-26-049942"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-26-034559",
          "url": "https://www.sec.gov/Archives/edgar/data/1697532/000119312526034559/d93556d8k.htm",
          "sha256": "4beda1a5b7e902372b8a2466ecfa7f45da4fdaab174c30d5ca4277490d5b6d0a",
          "sha256Normalized": "534704e69ec9112afe10021e91715aed6059202654d4e4619a09d25ff2cf62e9",
          "quote": "rger and (ii) requested that Nasdaq (A) suspend trading of the Shares effective before the opening of trading on February 3, 2026 and (B) f",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2026-02-03"
        }
      ]
    },
    {
      "securityId": "ref_AVNS",
      "ticker": "AVNS",
      "cik": "0001606498",
      "issuer": "AVANOS MEDICAL, INC.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-07-24",
      "frozenClose": 24.99,
      "frozenTailBarsAtBuild": 13,
      "historyGuard": {
        "checkedFrom": "2014-10-24",
        "checkedTo": "2026-07-24",
        "bars": 614,
        "pointsSha256": "146f960113dd1baf69463dc4670e62da29bbb4efdce0a60094baf9b23e2e8053"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 25,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-07-27",
          "accession": "0000876661-26-000646"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-08-06",
          "accession": "0001606498-26-000120"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001606498-26-000115",
          "url": "https://www.sec.gov/Archives/edgar/data/1606498/000160649826000115/avns-20260727.htm",
          "sha256": "09a242d21db9e495532a4676c9e1ac4d70fdad816fcf3d956d90599f08b9d254",
          "sha256Normalized": "12de851892230a4876fdca80b3207313205a88fbecb7dbe7591d051cedadd27e",
          "quote": "n completed and requested that the NYSE suspend trading of Common Stock on the NYSE prior to the opening of trading on the Closing Date. The Comp",
          "rule": "PRIOR_TO_OPEN_ON_DEFINED_DATE",
          "statedDate": "2026-07-27"
        },
        {
          "role": "LAST_TRADE_DATE_DEFINITION",
          "accession": "0001606498-26-000115",
          "url": "https://www.sec.gov/Archives/edgar/data/1606498/000160649826000115/avns-20260727.htm",
          "sha256": "09a242d21db9e495532a4676c9e1ac4d70fdad816fcf3d956d90599f08b9d254",
          "sha256Normalized": "12de851892230a4876fdca80b3207313205a88fbecb7dbe7591d051cedadd27e",
          "quote": "ntroductory Note On July 27, 2026 (the “Closing Date”), Avanos "
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-26-072432",
          "url": "https://www.sec.gov/Archives/edgar/data/1606498/000110465926072432/tm2614353-2_defm14a.htm",
          "sha256": "57f59bd002dab4704bbe792acef36f34e3aac4218d6ae0eaa75cd07773465e7d",
          "sha256Normalized": "37907f1f5f979e4f95295ba5b61e9f07d3ffa15203faa9b721a7cc1f452baf7b",
          "quote": "ld in treasury or owned by the Acquiror and its affiliates and Dissenting Shares (as defined in the Agreement), will be converted into the right to receive $25.00 per share in cash (the “Consideration”)"
        }
      ]
    },
    {
      "securityId": "ref_BAYA",
      "ticker": "BAYA",
      "cik": "0001969475",
      "issuer": "Bayview Acquisition Corp",
      "category": "DELISTED_FORM25",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-07-06",
      "frozenClose": 12.14,
      "frozenTailBarsAtBuild": 16,
      "historyGuard": {
        "checkedFrom": "2023-12-29",
        "checkedTo": "2026-07-06",
        "bars": 132,
        "pointsSha256": "99f3982ea6bcabd32418264f7ef3ae8d9bd9fd130d70bbdfd6f78298a92b89b8"
      },
      "terminal": {
        "kind": "DELISTED_NO_CONSIDERATION",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001493152-26-032688",
          "url": "https://www.sec.gov/Archives/edgar/data/1969475/000149315226032688/form8-k.htm",
          "sha256": "bb687369bb00ed555f6c723787c5ded5eb4c440abaea3a4bfdfdee82d50e6242",
          "sha256Normalized": "9e97e3067a58ab4ac5c7e39d8a122167edbba98064ffb37a5e7feaa89d05a812",
          "quote": "e June 19, 2026. Accordingly, the Panel suspended trading of the Company’s securities from Nasdaq, effective as of the open of trading on July 7, 2026, and a Fo",
          "rule": "EFFECTIVE_BEFORE_OPEN",
          "statedDate": "2026-07-07"
        }
      ]
    },
    {
      "securityId": "ref_BGFV",
      "ticker": "BGFV",
      "cik": "0001156388",
      "issuer": "BIG 5 SPORTING GOODS Corp",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-10-01",
      "frozenClose": 1.44,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2002-09-20",
        "checkedTo": "2025-10-01",
        "bars": 1202,
        "pointsSha256": "787ccbc187b839c40bb912da1df558f0ba8572e51d1b106a2ecef18bbf53c467"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-10-02",
          "accession": "0001354457-25-000978"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-10-14",
          "accession": "0001193125-25-239001"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-227537",
          "url": "https://www.sec.gov/Archives/edgar/data/1156388/000119312525227537/d54346d8k.htm",
          "sha256": "909c5634b87de53cab3787ce6b498a88c52e4a1ddc31f438e5c2ef674cb51c9a",
          "sha256Normalized": "db8cf7784e82398174a6d1914e6a6454abdcccd251e0626501d510d0c4290966",
          "quote": "tion. The Company requested that Nasdaq suspend trading of Company Common Stock prior to the opening of trading on the Closing Date, withdraw",
          "rule": "PRIOR_TO_OPEN_ON_DEFINED_DATE",
          "statedDate": "2025-10-02"
        },
        {
          "role": "LAST_TRADE_DATE_DEFINITION",
          "accession": "0001193125-25-227537",
          "url": "https://www.sec.gov/Archives/edgar/data/1156388/000119312525227537/d54346d8k.htm",
          "sha256": "909c5634b87de53cab3787ce6b498a88c52e4a1ddc31f438e5c2ef674cb51c9a",
          "sha256Normalized": "db8cf7784e82398174a6d1914e6a6454abdcccd251e0626501d510d0c4290966",
          "quote": "ntroductory Note On October 2, 2025 (the “Closing Date”), Big 5 S"
        }
      ]
    },
    {
      "securityId": "ref_BLFY",
      "ticker": "BLFY",
      "cik": "0001846017",
      "issuer": "Blue Foundry Bancorp",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-03-31",
      "frozenClose": 13.24,
      "frozenTailBarsAtBuild": 30,
      "historyGuard": {
        "checkedFrom": "2021-07-16",
        "checkedTo": "2026-03-31",
        "bars": 246,
        "pointsSha256": "d36f9f2485213064d2a956bb1ae4e0e78ca311f33f3edf7538040a004192ef70"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 0.65,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-04-01",
          "accession": "0001354457-26-000317"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-04-13",
          "accession": "0001193125-26-152831"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-26-135897",
          "url": "https://www.sec.gov/Archives/edgar/data/1846017/000119312526135897/d62529d8k.htm",
          "sha256": "e5305dcd3177db53af0af9230895cbec11fe9008e7fd30046f44633315166d9c",
          "sha256Normalized": "32ac344ac2d6e79fc7b6ccdcfe2952224bda6405e17ab257fc02852c9b9588d1",
          "quote": "ad closed and requested that Nasdaq (i) suspend trading in Blue Foundry Common Stock prior to the opening of trading on April 1, 2026, (ii) wit",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2026-04-01"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001193125-26-135897",
          "url": "https://www.sec.gov/Archives/edgar/data/1846017/000119312526135897/d62529d8k.htm",
          "sha256": "e5305dcd3177db53af0af9230895cbec11fe9008e7fd30046f44633315166d9c",
          "sha256Normalized": "32ac344ac2d6e79fc7b6ccdcfe2952224bda6405e17ab257fc02852c9b9588d1",
          "quote": "f Blue Foundry (“Blue Foundry Common Stock”) outstanding immediately prior to the Effective Time was converted into the right to receive 0.650 of a share of common stock"
        }
      ]
    },
    {
      "securityId": "ref_COLA",
      "ticker": "COLA",
      "cik": "0002028201",
      "issuer": "Columbus Acquisition Corp/Cayman Islands",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-10-01",
      "frozenClose": 2.86,
      "frozenTailBarsAtBuild": 4,
      "historyGuard": {
        "checkedFrom": "2025-03-21",
        "checkedTo": "2026-10-01",
        "bars": 80,
        "pointsSha256": "d483a08963614c8cdcc8c608b89062e04bfe5727c1d002df208b0a180c2f902a"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-10-01",
          "accession": "0001354457-26-000937"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-10-23",
          "accession": "0001213900-26-111931"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001213900-26-107578",
          "url": "https://www.sec.gov/Archives/edgar/data/2028201/000121390026107578/ea0307944-8k_columbus.htm",
          "sha256": "307d38d36d9f73e00807b57df5df65bf2ca0fcf446cbc1a84f16ea97cd4eeaf1",
          "sha256Normalized": "915868a0dd73cb728a6600f9cd7817ee93474afb70b5a4c99d098e75d4f3a8b1",
          "quote": "ctive, Nasdaq determined to permanently suspend trading of CAC’s ordinary shares, rights and units prior to the opening of trading on October 2, 2026. The dere",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2026-10-02"
        }
      ]
    },
    {
      "securityId": "ref_EBTC",
      "ticker": "EBTC",
      "cik": "0001018399",
      "issuer": "ENTERPRISE BANCORP INC /MA/",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-06-30",
      "frozenClose": 39.64,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2005-02-18",
        "checkedTo": "2025-06-30",
        "bars": 1063,
        "pointsSha256": "fe2b315aa76298138c794f441879362b1eca7a5bcc3f7a931e3f00ffe8611000"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 2,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-07-01",
          "accession": "0001354457-25-000601"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-07-11",
          "accession": "0001018399-25-000099"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001018399-25-000082",
          "url": "https://www.sec.gov/Archives/edgar/data/1018399/000101839925000082/ebtc-20250701.htm",
          "sha256": "2fee4b6e6a3814c89fe2e4bf04055c1d475a0a7dff4c7f0903eef2367d8648b1",
          "sha256Normalized": "a2093d6e7e702424e99e78834b0edc34ad16d504daa22fe6bd323ae013259422",
          "quote": "that the Nasdaq Stock Market (“Nasdaq”) suspend trading of Enterprise Common Stock on Nasdaq and remove Enterprise Common Stock from listing on Nasdaq, in each case, prior to the market opening on July 1, 2025. Enterpri",
          "rule": "PRIOR_TO_MARKET_OPEN",
          "statedDate": "2025-07-01"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001193125-25-029668",
          "url": "https://www.sec.gov/Archives/edgar/data/1018399/000119312525029668/d843045ddefm14a.htm",
          "sha256": "5cc344d541d502529a72c9f1e7d9bf6477338f5eda094a01225656c9e25233cf",
          "sha256Normalized": "5cc344d541d502529a72c9f1e7d9bf6477338f5eda094a01225656c9e25233cf",
          "quote": "ding immediately prior to the Effective Time (other than shares described in Section 2.01(b) above) shall become and be converted into the right to receive (i) $2.00 in cash (the “ Cash Consideration ”) and (ii) 0"
        }
      ]
    },
    {
      "securityId": "ref_ENFN",
      "ticker": "ENFN",
      "cik": "0001868912",
      "issuer": "Enfusion, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-04-17",
      "frozenClose": 10.76,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "2021-10-22",
        "checkedTo": "2025-04-17",
        "bars": 183,
        "pointsSha256": "e86b9315c6c1c13270cad5ac393fe88f27f1b50965553a0e62e998a8de5e3004"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-04-21",
          "accession": "0000876661-25-000277"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-05-01",
          "accession": "0001193125-25-109983"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-036869",
          "url": "https://www.sec.gov/Archives/edgar/data/1868912/000110465925036869/tm2512751d1_8k.htm",
          "sha256": "89c82b205cc06f0671e9bb1349887deff61a0ce17f68fdc465a68451368f904e",
          "sha256Normalized": "d56b5f1d88f1097fa3f308dff7c935d3fd6a89e6b87d673dae2b7bd937d982cb",
          "quote": " Class A Common Stock of Enfusion, Inc. ceased being traded prior to the opening of the market on April 21, 2025 and will ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-04-21"
        }
      ]
    },
    {
      "securityId": "ref_EQC",
      "ticker": "EQC",
      "cik": "0000803649",
      "issuer": "EQC Liquidating Trust",
      "category": "DELISTED_FORM25",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-04-21",
      "frozenClose": 1.58,
      "frozenTailBarsAtBuild": 79,
      "historyGuard": {
        "checkedFrom": "1990-01-05",
        "checkedTo": "2025-04-21",
        "bars": 1842,
        "pointsSha256": "ec464590083f1408a65216287deda1dded1ba77de92c084467fcfa10631a4642"
      },
      "terminal": {
        "kind": "DELISTED_NO_CONSIDERATION",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25",
          "filingDate": "2025-04-11",
          "accession": "0000803649-25-000041"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-06-13",
          "accession": "0000803649-25-000048"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0000803649-25-000039",
          "url": "https://www.sec.gov/Archives/edgar/data/803649/000080364925000039/eqc-20250401.htm",
          "sha256": "3109d6e94ce0daef56016e9bbbf106c3977090a107c59551c38fb5e0c9b66718",
          "sha256Normalized": "cdc70b1e7411b8835a6f879c60e1ae350bdf50d1861240d08d7deda450120d4e",
          "quote": " or about April 11, 2025. The Company’s last day of trading on NYSE will be April 21, 2025. Item 7.0",
          "rule": "LAST_DAY_OF_TRADING",
          "statedDate": "2025-04-21"
        }
      ]
    },
    {
      "securityId": "ref_ETWO",
      "ticker": "ETWO",
      "cik": "0001800347",
      "issuer": "E2open Parent Holdings, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-08-01",
      "frozenClose": 3.3,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "2020-06-19",
        "checkedTo": "2025-08-01",
        "bars": 268,
        "pointsSha256": "97d127e1acdcaac50982d62c9d7d6ae63968ae7358f87856ae61eaeaa9007c07"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-08-04",
          "accession": "0000876661-25-000550"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-08-14",
          "accession": "0001193125-25-180760"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-172643",
          "url": "https://www.sec.gov/Archives/edgar/data/1800347/000119312525172643/d936154d8k.htm",
          "sha256": "ad9a21369c7b33556daaf9c1354c1e1b5ae6b9cd0b8aa752def44b0132bce62a",
          "sha256Normalized": "a5e3365c0b8d733157749818ce4ccf716eb62975867bf8808dd979f234ee0b6d",
          "quote": " of the Class A Common Stock on NYSE be suspended prior to the opening of trading on August 4, 2025. Trading ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-08-04"
        }
      ]
    },
    {
      "securityId": "ref_GHLD",
      "ticker": "GHLD",
      "cik": "0001821160",
      "issuer": "Guild Holdings Co",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-11-26",
      "frozenClose": 20.01,
      "frozenTailBarsAtBuild": 41,
      "historyGuard": {
        "checkedFrom": "2020-10-23",
        "checkedTo": "2025-11-26",
        "bars": 266,
        "pointsSha256": "d9301434ff850dda56599fcc21999242ba35629f1991c125765d0ecc31fb6db2"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 20,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-11-28",
          "accession": "0000876661-25-000916"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-08",
          "accession": "0001104659-25-119229"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-116680",
          "url": "https://www.sec.gov/Archives/edgar/data/1821160/000110465925116680/tm2532188d4_8k.htm",
          "sha256": "6b54370b09ea5cf2aafb0df505d04103b99fead669ea22482e131de6e11898de",
          "sha256Normalized": "b80cb52bb5df9a2a5df6f5de7ddaec6e745be2eab03cff847e2b18f786629d6a",
          "quote": " trading in the Class A Common Stock be suspended on the NYSE prior to the opening of trading on November 28, 2025. On Novem",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-11-28"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-25-116680",
          "url": "https://www.sec.gov/Archives/edgar/data/1821160/000110465925116680/tm2532188d4_8k.htm",
          "sha256": "6b54370b09ea5cf2aafb0df505d04103b99fead669ea22482e131de6e11898de",
          "sha256Normalized": "b80cb52bb5df9a2a5df6f5de7ddaec6e745be2eab03cff847e2b18f786629d6a",
          "quote": " and each share of Company Common Stock, a “ Share ”), other than Shares held by the Company or the Parent Parties, was converted into the right to receive $20.00 in cash, without interest (the “ Per Share Consideration ”)"
        }
      ]
    },
    {
      "securityId": "ref_GIFI",
      "ticker": "GIFI",
      "cik": "0001031623",
      "issuer": "GULF ISLAND FABRICATION INC",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-01-16",
      "frozenClose": 12,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "1997-04-04",
        "checkedTo": "2026-01-16",
        "bars": 1503,
        "pointsSha256": "0f875df3f891f69e9b7af119ece3f56e80b0c2a29be97d19885ca01f379ead07"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 12,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-01-16",
          "accession": "0001354457-26-000053"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-01-26",
          "accession": "0001140361-26-002306"
        },
        {
          "form": "15-15D",
          "filingDate": "2026-01-26",
          "accession": "0001140361-26-002307"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001140361-26-001488",
          "url": "https://www.sec.gov/Archives/edgar/data/1031623/000114036126001488/ef20063243_8k.htm",
          "sha256": "2bf4eba81c375853cb41bffe4308e37dcf795399d841a26db54470eff9c00a57",
          "sha256Normalized": "0a90c3362737f4d80561be0902f652fe547d8eef93f4c9976cdccb6dbb12e21e",
          "quote": "that (i) trading of the Common Stock be suspended after the close of trading on January 16, 2026, with a m",
          "rule": "CLOSE_OF_TRADING",
          "statedDate": "2026-01-16"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001140361-25-044187",
          "url": "https://www.sec.gov/Archives/edgar/data/1031623/000114036125044187/ny20056788x6_defm14a.htm",
          "sha256": "9ec8b84eba231dbb1dd115fe7e9e5b8a8f1922eee6a6793901ff28eec4176f38",
          "sha256Normalized": "9ec8b84eba231dbb1dd115fe7e9e5b8a8f1922eee6a6793901ff28eec4176f38",
          "quote": "sued and outstanding immediately prior to the effective time of the Merger, other than certain excluded shares, will be converted into the right to receive $12.00 in cash, without interest, and subject to deduction for any required tax withholding (the “ Merger Consideration ”)"
        }
      ]
    },
    {
      "securityId": "ref_GLDD",
      "ticker": "GLDD",
      "cik": "0001372020",
      "issuer": "Great Lakes Dredge & Dock CORP",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-03-31",
      "frozenClose": 17,
      "frozenTailBarsAtBuild": 30,
      "historyGuard": {
        "checkedFrom": "2006-12-29",
        "checkedTo": "2026-03-31",
        "bars": 1005,
        "pointsSha256": "b50dddb59192b6267c86f78c32b364cdf0422e6303539672fe63ada2e9404638"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-04-01",
          "accession": "0001354457-26-000316"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-04-13",
          "accession": "0001193125-26-152759"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-26-136214",
          "url": "https://www.sec.gov/Archives/edgar/data/1372020/000119312526136214/d145321d8k.htm",
          "sha256": "f3bf1edf7930616b8f7bf83d5c876921d7282b2b588d7d1dc34a00a3e95b931f",
          "sha256Normalized": "f0041e915879a09a11cc9b6153e58d012bd69231ef3bb897d0620f1739903e2c",
          "quote": "rger and (ii) requested that Nasdaq (x) suspend trading of the Shares effective before the opening of trading on April 1, 2026, and (y) ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2026-04-01"
        }
      ]
    },
    {
      "securityId": "ref_HBI",
      "ticker": "HBI",
      "cik": "0001359841",
      "issuer": "Hanesbrands Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-11-28",
      "frozenClose": 6.47,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2006-09-08",
        "checkedTo": "2025-11-28",
        "bars": 1004,
        "pointsSha256": "afd71081437598bdda90aeacf3293005129966cf315834b038ea4459d2b7efa1"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-12-01",
          "accession": "0000876661-25-000928"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-11",
          "accession": "0001104659-25-120123"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-303276",
          "url": "https://www.sec.gov/Archives/edgar/data/1359841/000119312525303276/d848051d8k.htm",
          "sha256": "353e06c29144ac55297e1e5f0dc7564ae26dc924a2717a9195039796bf273f90",
          "sha256Normalized": "ee9bc6c7d30410a7f1697b55f3b19321d45bf2fdd507bdd266a4f23d509d07b1",
          "quote": "anesbrands Common Stock on the NYSE was suspended prior to the opening of trading on the Closing Date, and Hane",
          "rule": "PRIOR_TO_OPEN_ON_DEFINED_DATE",
          "statedDate": "2025-12-01"
        },
        {
          "role": "LAST_TRADE_DATE_DEFINITION",
          "accession": "0001193125-25-303276",
          "url": "https://www.sec.gov/Archives/edgar/data/1359841/000119312525303276/d848051d8k.htm",
          "sha256": "353e06c29144ac55297e1e5f0dc7564ae26dc924a2717a9195039796bf273f90",
          "sha256Normalized": "ee9bc6c7d30410a7f1697b55f3b19321d45bf2fdd507bdd266a4f23d509d07b1",
          "quote": ". ☐ INTRODUCTION On December 1, 2025 (the “Closing Date”), Gildan "
        }
      ]
    },
    {
      "securityId": "ref_HSII",
      "ticker": "HSII",
      "cik": "0001066605",
      "issuer": "HEIDRICK & STRUGGLES INTERNATIONAL INC",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-12-09",
      "frozenClose": 59.01,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "1999-04-30",
        "checkedTo": "2025-12-09",
        "bars": 1389,
        "pointsSha256": "4622bfe01aa5f7bfec83f040a9cead43e611935c60d6231ceb1adc89f5909e1c"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 59,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-12-10",
          "accession": "0001354457-25-001242"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-22",
          "accession": "0001193125-25-328707"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-313582",
          "url": "https://www.sec.gov/Archives/edgar/data/1066605/000119312525313582/d832427d8k.htm",
          "sha256": "35bef68760a89a6a4c3de12073e1360b590c21bf3a9987030df674afba01b9be",
          "sha256Normalized": "213f698a0ae20428b77cb79570d0713f420dc411488eea4e565ba9e53802a84e",
          "quote": "Nasdaq Global Stock Market (“ NASDAQ ”) suspend trading of the Shares effective before the opening of trading on December 10, 2025, and file",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-12-10"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001193125-25-261675",
          "url": "https://www.sec.gov/Archives/edgar/data/1066605/000119312525261675/d176641ddefm14a.htm",
          "sha256": "4ce5d8fa0704014cf4737ac07dafd96e3a3271741a636dfadea98f02fcf4e548",
          "sha256Normalized": "4ce5d8fa0704014cf4737ac07dafd96e3a3271741a636dfadea98f02fcf4e548",
          "quote": "s of immediately prior to the Effective Time will be automatically converted into and shall thereafter represent the right to receive $59.00 in cash, without interest and subject to deduction for any applicable withholding taxes (the “ Merger Consideration ”) (except that no Merger Consideration wil"
        }
      ]
    },
    {
      "securityId": "ref_HTBK",
      "ticker": "HTBK",
      "cik": "0001053352",
      "issuer": "HERITAGE COMMERCE CORP",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-04-17",
      "frozenClose": 13.45,
      "frozenTailBarsAtBuild": 27,
      "historyGuard": {
        "checkedFrom": "1998-07-24",
        "checkedTo": "2026-04-17",
        "bars": 1448,
        "pointsSha256": "9dc4d9f203a7d26a4ab37e54d2a0b7d2111d9b08d8e99c6a4abc3d1c2fe52845"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 0.65,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-04-20",
          "accession": "0001354457-26-000355"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-04-30",
          "accession": "0001193125-26-193926"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-26-167257",
          "url": "https://www.sec.gov/Archives/edgar/data/1053352/000119312526167257/d143924d8k.htm",
          "sha256": "70b2dcfa53c67ae67740ec92b67f8879d5a4dea8688645812324aac919c08d2b",
          "sha256Normalized": "008e2674f66870a266df9929813a8b056127b055ff7bb0bfb357fef16b0e8d2d",
          "quote": "th the SEC on Form 25 a notification of delisting of such securities and the deregistration of such securities under Section 12(b) of the Securities Exchange Act of 1934 (as amended, the “Exchange Act”), in each case prior to the market open on April 20, 2026. As a res",
          "rule": "PRIOR_TO_MARKET_OPEN",
          "statedDate": "2026-04-20"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001193125-26-048925",
          "url": "https://www.sec.gov/Archives/edgar/data/1053352/000119312526048925/d105934ddefm14a.htm",
          "sha256": "2ff78d455b79583387271e898686e0e606ba204ed09f97cf984349a7ecbb50c6",
          "sha256Normalized": "2ff78d455b79583387271e898686e0e606ba204ed09f97cf984349a7ecbb50c6",
          "quote": "nd the cancellation of each outstanding share of Heritage common stock, other than excluded shares, in exchange for the right to receive 0.65 shares of CVBF common stock"
        }
      ]
    },
    {
      "securityId": "ref_ICCH",
      "ticker": "ICCH",
      "cik": "0001681903",
      "issuer": "ICC Holdings, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-03-12",
      "frozenClose": 23.49,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2017-03-31",
        "checkedTo": "2025-03-12",
        "bars": 415,
        "pointsSha256": "5305abd567a98d8673fb11b79b0d5e75e3f3deeeec4b9084a756c0d88e7f09be"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 23.5,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-03-13",
          "accession": "0001354457-25-000200"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-03-24",
          "accession": "0001437749-25-008870"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001437749-25-008045",
          "url": "https://www.sec.gov/Archives/edgar/data/1681903/000143774925008045/icch20250317_8k.htm",
          "sha256": "b5e2c103a8fc10296b2c2cdd74c7bcb761ba358d391586ff24877edf46c00091",
          "sha256Normalized": "f6cc4ec5b21c72f9866d641fec9b35fc076dbc31a0c996eac26765658cdcde3d",
          "quote": "5, and it was requested that NASDAQ (1) suspend trading of ICCH Common Stock after the close of trading on March 12, 2025, (2) withdraw ICCH Common Stock from listing on NASDAQ prior to the open of trading on March 13, 2025, and (3) ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-03-13"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001437749-25-008045",
          "url": "https://www.sec.gov/Archives/edgar/data/1681903/000143774925008045/icch20250317_8k.htm",
          "sha256": "b5e2c103a8fc10296b2c2cdd74c7bcb761ba358d391586ff24877edf46c00091",
          "sha256Normalized": "f6cc4ec5b21c72f9866d641fec9b35fc076dbc31a0c996eac26765658cdcde3d",
          "quote": "mon Stock”) issued and outstanding immediately prior to the Effective Time, other than certain shares held by ICCH, was converted into the right to receive $23.50 in cash (the “Merger Consideration”)"
        }
      ]
    },
    {
      "securityId": "ref_MDV",
      "ticker": "MDV",
      "cik": "0001645873",
      "issuer": "MODIV INDUSTRIAL, INC.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-08-11",
      "frozenClose": 18.05,
      "frozenTailBarsAtBuild": 2,
      "historyGuard": {
        "checkedFrom": "2022-02-11",
        "checkedTo": "2026-08-11",
        "bars": 235,
        "pointsSha256": "cd4ce4419ce6bbe8d0aed4bedf217f8eb698bf2ec024d128f0cfd8e8365ae95e"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 1.975,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-08-12",
          "accession": "0000876661-26-000679"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-08-24",
          "accession": "0001104659-26-099824"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-26-094865",
          "url": "https://www.sec.gov/Archives/edgar/data/1645873/000110465926094865/tm2622928d1_8k.htm",
          "sha256": "3ffe6156198abde9f29506ab36c76bc146a0a773ef3cabd5a83752734f014a58",
          "sha256Normalized": "2324c70d4a7bfd3338476c55169dce60f281221dfa42bc7701152b3f72c2d674",
          "quote": "on Stock and Modiv Preferred Stock were suspended from trading on the NYSE effective prior to the opening of trading on the Closing Date. After ef",
          "rule": "PRIOR_TO_OPEN_ON_DEFINED_DATE",
          "statedDate": "2026-08-12"
        },
        {
          "role": "LAST_TRADE_DATE_DEFINITION",
          "accession": "0001104659-26-094865",
          "url": "https://www.sec.gov/Archives/edgar/data/1645873/000110465926094865/tm2622928d1_8k.htm",
          "sha256": "3ffe6156198abde9f29506ab36c76bc146a0a773ef3cabd5a83752734f014a58",
          "sha256Normalized": "2324c70d4a7bfd3338476c55169dce60f281221dfa42bc7701152b3f72c2d674",
          "quote": "Co Merger Sub”). On August 12, 2026 (the “Closing Date”), pursuan"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-26-077331",
          "url": "https://www.sec.gov/Archives/edgar/data/1645873/000110465926077331/tm2615734-8_defm14a.htm",
          "sha256": "5ebd2765fd0121684cef6d75af14a540cc7a6b9070a7bff1d33a579b838f4359",
          "sha256Normalized": "5ebd2765fd0121684cef6d75af14a540cc7a6b9070a7bff1d33a579b838f4359",
          "quote": "d and outstanding share of Modiv Common Stock, other than any Excluded Shares, will be automatically converted into the right to receive 1.975 shares of GNL Common Stock"
        }
      ]
    },
    {
      "securityId": "ref_MURA",
      "ticker": "MURA",
      "cik": "0001971543",
      "issuer": "Mural Oncology plc",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-12-04",
      "frozenClose": 2.04,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2023-11-17",
        "checkedTo": "2025-12-04",
        "bars": 107,
        "pointsSha256": "7ae9688d855a8f6b1e11397788edd5d98ec90a2fd4836e8cce524c7e70b20ca1"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-12-05",
          "accession": "0001354457-25-001216"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-15",
          "accession": "0001193125-25-319281"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-308710",
          "url": "https://www.sec.gov/Archives/edgar/data/1971543/000119312525308710/d64366d8k.htm",
          "sha256": "6a6d800146a9cd6dbf4cd4d2c1cbcd6c3e9b2ae2f36613d15b374580e13172e7",
          "sha256Normalized": "7eb59123d8df88fccb3093362fc028a89b05f921fbe05286f43bad13f71b98e4",
          "quote": "2025 and (ii) requested that Nasdaq (A) suspend trading of the Company’s Ordinary Shares effective before the opening of trading on December 5, 2025 and (B) f",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-12-05"
        }
      ]
    },
    {
      "securityId": "ref_NURO",
      "ticker": "NURO",
      "cik": "0001289850",
      "issuer": "NeuroMetrix, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-05-01",
      "frozenClose": 4.58,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "2001-01-05",
        "checkedTo": "2025-05-01",
        "bars": 1270,
        "pointsSha256": "a2aaf76d69c4058f881a5f20c58ebfb58393e8e4caf0e876496fa1d75b104cfd"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-05-01",
          "accession": "0001354457-25-000373"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-05-12",
          "accession": "0001213900-25-042021"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001641172-25-008179",
          "url": "https://www.sec.gov/Archives/edgar/data/1289850/000164117225008179/form8-k.htm",
          "sha256": "846fdf3e6d09884c5e0f4db7d755c82f51bfd393bd9dc2adfc4820afb7c293a4",
          "sha256Normalized": "c8ddb9e24cea5749accc95ad5228f2bac09f57506a0c3eda68f34a821281468a",
          "quote": "equested that The Nasdaq Capital Market suspend trading of the Company Common Stock prior to the opening of trading on May 2, 2025, and file",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-05-02"
        }
      ]
    },
    {
      "securityId": "ref_ODP",
      "ticker": "ODP",
      "cik": "0000800240",
      "issuer": "ODP Corp",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-12-09",
      "frozenClose": 28,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "1990-03-30",
        "checkedTo": "2025-12-09",
        "bars": 1863,
        "pointsSha256": "31b4d54f9256f791453184e7098aa01645a38f019536507b60ff8d85720e320f"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-12-10",
          "accession": "0001354457-25-001240"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-12-22",
          "accession": "0000899140-25-001452"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-314368",
          "url": "https://www.sec.gov/Archives/edgar/data/800240/000119312525314368/d76250d8k.htm",
          "sha256": "bff4121259feb76b384ff9f91ecc4b5f334136f672da844398c00d3cc8d52342",
          "sha256Normalized": "edbc8a741dfac5982976ee2b1844a973f5db20dfa8f435bf6def07a1f57aba4a",
          "quote": "10, 2025, ODP requested that Nasdaq (i) suspend trading of ODP Common Stock on Nasdaq before the opening of trading on December 10, 2025 and (ii) ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-12-10"
        }
      ]
    },
    {
      "securityId": "ref_SASR",
      "ticker": "SASR",
      "cik": "0000824410",
      "issuer": "SANDY SPRING BANCORP INC",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-03-31",
      "frozenClose": 27.95,
      "frozenTailBarsAtBuild": 38,
      "historyGuard": {
        "checkedFrom": "1996-04-19",
        "checkedTo": "2025-03-31",
        "bars": 1512,
        "pointsSha256": "2930536d552f5194b728751a197bf210d571db2d7a5805c85b53690014ae490e"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 0.9,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-03-31",
          "accession": "0001354457-25-000262"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-04-10",
          "accession": "0001104659-25-033554"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-030581",
          "url": "https://www.sec.gov/Archives/edgar/data/824410/000110465925030581/tm2510685d3_8k.htm",
          "sha256": "86c85883c4edcf5195345c85a947494725acfba02e98fded4a53145e24e81818",
          "sha256Normalized": "59bf4a7b1814e5674249f270a4525738fab9847f7b4b280ccfedd2c153203ddf",
          "quote": "nd it was requested that the NASDAQ (1) suspend trading of Sandy Spring Common Stock, (2) withdraw Sandy Spring Common Stock from listing on the NASDAQ prior to the open of trading on April 1, 2025, and (3) ",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-04-01"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-24-129292",
          "url": "https://www.sec.gov/Archives/edgar/data/824410/000110465924129292/tm2428626-8_defm14a.htm",
          "sha256": "fe096465a13c1714daa5e966618957a3e6f950de3e2609446412a54e4c7ed3e9",
          "sha256Normalized": "fe096465a13c1714daa5e966618957a3e6f950de3e2609446412a54e4c7ed3e9",
          "quote": "ommon stock and shares of Sandy Spring common stock owned by Sandy Spring or Atlantic Union, will be converted into the right to receive 0.900 shares of Atlantic Union common stock"
        }
      ]
    },
    {
      "securityId": "ref_SBT",
      "ticker": "SBT",
      "cik": "0001680379",
      "issuer": "Sterling Bancorp, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-03-31",
      "frozenClose": 4.84,
      "frozenTailBarsAtBuild": 41,
      "historyGuard": {
        "checkedFrom": "2017-11-17",
        "checkedTo": "2025-03-31",
        "bars": 385,
        "pointsSha256": "01a90268af0a03b4b3a67a5260df3d613b760ae332aa5a6ec83bc42320a16416"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25",
          "filingDate": "2025-04-01",
          "accession": "0001104659-25-030477"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-04-11",
          "accession": "0001104659-25-034056"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-030586",
          "url": "https://www.sec.gov/Archives/edgar/data/1680379/000110465925030586/tm2510964d1_8k.htm",
          "sha256": "1be36c04bd11a35365f647d93e4996823ffe220bd68025bb21ef27e5e023fcb1",
          "sha256Normalized": "a62c1483dc3c0a0f556e24a422f1ca2985d3dda47ae41ac6a0eeab72b805573a",
          "quote": "ansaction and requested that Nasdaq (i) halt trading of the Company’s common stock after the close of trading on March 31, 2025 and (ii) ",
          "rule": "CLOSE_OF_TRADING",
          "statedDate": "2025-03-31"
        }
      ]
    },
    {
      "securityId": "ref_SLRN",
      "ticker": "SLRN",
      "cik": "0001962918",
      "issuer": "ACELYRIN, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-05-20",
      "frozenClose": 2.27,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2023-05-05",
        "checkedTo": "2025-05-20",
        "bars": 107,
        "pointsSha256": "eb98ee2ecf5e10d119df661bb29765d99db1cb0434d72a07322b0dd1a79c7297"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 0.4274,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-05-21",
          "accession": "0001354457-25-000436"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-06-09",
          "accession": "0001104659-25-057733"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001193125-25-123707",
          "url": "https://www.sec.gov/Archives/edgar/data/1962918/000119312525123707/d13977d8k.htm",
          "sha256": "ba052078fec2111d8ce768afb7a407d5be9a43af069bdef1c9e5c78fd4832f46",
          "sha256Normalized": "969daa2e01b09f75f6cc366b1a3e1f439b254ba4b15b31e3eb812ad85eb555f4",
          "quote": "ompleted and (ii) requested that Nasdaq suspend trading of ACELYRIN Common Stock, effective as of the open of business on May 21, 2025, and file",
          "rule": "EFFECTIVE_BEFORE_OPEN",
          "statedDate": "2025-05-21"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-25-032228",
          "url": "https://www.sec.gov/Archives/edgar/data/1962918/000110465925032228/tm255940-11_defm14a.htm",
          "sha256": "2b8ebe3f49684f118defd9efb149060682703cc29d65f738aeb301bf5e961109",
          "sha256Normalized": "2b8ebe3f49684f118defd9efb149060682703cc29d65f738aeb301bf5e961109",
          "quote": " treasury, (ii) ACELYRIN’s subsidiaries, (iii) Alumis or (iv) Alumis’ subsidiaries, if any), will be converted into the right to receive 0.4274 shares of Alumis common stock"
        }
      ]
    },
    {
      "securityId": "ref_STRM",
      "ticker": "STRM",
      "cik": "0001008586",
      "issuer": "STREAMLINE HEALTH SOLUTIONS INC.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-08-11",
      "frozenClose": 5.33,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "1996-04-19",
        "checkedTo": "2025-08-11",
        "bars": 1530,
        "pointsSha256": "aa1fdcab02408cbb39132ef8eadea3da5f9faf02fb84014032704fe31b645152"
      },
      "terminal": {
        "kind": "CASH_MERGER",
        "cashPerShare": 5.34,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-08-12",
          "accession": "0001354457-25-000807"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-08-22",
          "accession": "0001437749-25-027567"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001437749-25-026379",
          "url": "https://www.sec.gov/Archives/edgar/data/1008586/000143774925026379/strm20250812_8k.htm",
          "sha256": "fda4d724776c8b246d1faf71f8253fb75644a1ce21b981eb9a614949d3746b9d",
          "sha256Normalized": "7ac4f40ed4b092c9cd82c31f89300531355008e0a1ccc47f7894e1ef52f96adc",
          "quote": "ct. Trading of the Shares on Nasdaq was halted prior to the opening of trading on August 12, 2025. The info",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-08-12"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001437749-25-022490",
          "url": "https://www.sec.gov/Archives/edgar/data/1008586/000143774925022490/strm20250707_defm14a.htm",
          "sha256": "80352ab38a35ac8bea90d71f3b527bbe4f11659afbcedf579301e4d9a7178d48",
          "sha256Normalized": "b74c60736ec79e093b917ea2c798c8ade2d1a12c268c9802717f5ccb911ad2a6",
          "quote": "tive Time (other than any dissenting shares or other excluded shares, as further described below) will automatically be cancelled and converted into the right to receive $5.34 per share in cash, without interest (the “ Merger Consideration ”)"
        }
      ]
    },
    {
      "securityId": "ref_TRML",
      "ticker": "TRML",
      "cik": "0001827506",
      "issuer": "Tourmaline Bio, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-10-27",
      "frozenClose": 47.98,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2021-05-07",
        "checkedTo": "2025-10-27",
        "bars": 234,
        "pointsSha256": "fcf2d68bc8e5e0fd5a573eebff01047792c277d5e7c5664e0b75047730d378a9"
      },
      "terminal": {
        "kind": "UNKNOWN",
        "cashPerShare": null,
        "stockRatio": null,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-10-28",
          "accession": "0001354457-25-001066"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-11-07",
          "accession": "0001104659-25-108172"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-102971",
          "url": "https://www.sec.gov/Archives/edgar/data/1827506/000110465925102971/tm2529486d1_8k.htm",
          "sha256": "455155e5d52d9f016ee54e2b471359d3287ee41c3d88468eb558a0b0c3bd1d30",
          "sha256Normalized": "8a3f3e5f8508856c2e77c952f9c290fca0fa9f74a2e17e4a09c2313f1a8f5294",
          "quote": "asdaq Global Select Market (“ Nasdaq ”) suspend the Shares from trading effective as of the open of trading on October 28, 2025, remove t",
          "rule": "EFFECTIVE_BEFORE_OPEN",
          "statedDate": "2025-10-28"
        }
      ]
    },
    {
      "securityId": "ref_UBFO",
      "ticker": "UBFO",
      "cik": "0001137547",
      "issuer": "UNITED SECURITY BANCSHARES",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2026-03-31",
      "frozenClose": 10.51,
      "frozenTailBarsAtBuild": 30,
      "historyGuard": {
        "checkedFrom": "1999-03-05",
        "checkedTo": "2026-03-31",
        "bars": 1413,
        "pointsSha256": "e3e77f894b2f190452ea25e60a8f632fc4f48369daea2047a150dd40e67d96ce"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 0.452,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2026-04-01",
          "accession": "0001354457-26-000318"
        },
        {
          "form": "15-12G",
          "filingDate": "2026-04-13",
          "accession": "0001137547-26-000018"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001628280-26-022619",
          "url": "https://www.sec.gov/Archives/edgar/data/1137547/000162828026022619/ubfo-20260401.htm",
          "sha256": "6a228258a8b2ec071b899fce4e859e80556510d2273f415219ecaa35b9dce94c",
          "sha256Normalized": "748c7a6c2110113d9b542a12d07a9dceea816f2b5e8b9351386011f91625158e",
          "quote": "in by reference. Item 3.01. Notice of Delisting or Failure to Satisfy a Continued Listing Rule or Standard; Transfer of Listing On March 31, 2026, USB notified the NASDAQ Global Select Market (“NASDAQ”) that trading in USB common stock should be halted prior to market open on April 1, 2026, and that",
          "rule": "PRIOR_TO_MARKET_OPEN",
          "statedDate": "2026-04-01"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001628280-26-011309",
          "url": "https://www.sec.gov/Archives/edgar/data/1137547/000162828026011309/usb-defm14a.htm",
          "sha256": "ca9ce2225ce1146cf48bf6fbf61c2f9d890782131bc9a763abe8df7a6c3308c3",
          "sha256Normalized": "ca9ce2225ce1146cf48bf6fbf61c2f9d890782131bc9a763abe8df7a6c3308c3",
          "quote": "ach share of USB common stock issued and outstanding immediately prior to the effective time will be converted into the right to receive 0.4520 shares of CWB common stock"
        }
      ]
    },
    {
      "securityId": "ref_VBTX",
      "ticker": "VBTX",
      "cik": "0001501570",
      "issuer": "Veritex Holdings, Inc.",
      "category": "MERGER_TERMINAL_CONSIDERATION",
      "status": "DELISTED_SOURCE_VERIFIED",
      "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
      "lastTradeDate": "2025-10-17",
      "frozenClose": 30.26,
      "frozenTailBarsAtBuild": 39,
      "historyGuard": {
        "checkedFrom": "2014-10-10",
        "checkedTo": "2025-10-17",
        "bars": 576,
        "pointsSha256": "7221472131fd615df4c246d7ded97b495b33eba75714014b14f5eac2ff72c68c"
      },
      "terminal": {
        "kind": "STOCK_MERGER",
        "cashPerShare": null,
        "stockRatio": 1.95,
        "acquirerTicker": null,
        "paymentDate": null,
        "paymentDateNote": "PAYMENT_DATE_NOT_STATED"
      },
      "delistingForms": [
        {
          "form": "25-NSE",
          "filingDate": "2025-10-20",
          "accession": "0001354457-25-001033"
        },
        {
          "form": "15-12G",
          "filingDate": "2025-11-03",
          "accession": "0001140361-25-040133"
        }
      ],
      "masterConflict": "MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE",
      "sources": [
        {
          "role": "LAST_TRADE_STATEMENT",
          "accession": "0001104659-25-100622",
          "url": "https://www.sec.gov/Archives/edgar/data/1501570/000110465925100622/tm2529027d1_8k.htm",
          "sha256": "2529944464da2af5761f13cb3aa7c827d2f1a50c6866577b7be47062b920ed8d",
          "sha256Normalized": "7d933bbcb73e814ab1edf2bf38604a57d646d9f94f46b7ab9cbf9016bacbd08d",
          "quote": "he Merger and requested that NASDAQ (i) suspend trading of Veritex Common Stock prior to the opening of trading on October 20, 2025, (ii) wit",
          "rule": "PRIOR_TO_OPEN",
          "statedDate": "2025-10-20"
        },
        {
          "role": "TERMINAL_CONSIDERATION",
          "accession": "0001104659-25-100622",
          "url": "https://www.sec.gov/Archives/edgar/data/1501570/000110465925100622/tm2529027d1_8k.htm",
          "sha256": "2529944464da2af5761f13cb3aa7c827d2f1a50c6866577b7be47062b920ed8d",
          "sha256Normalized": "7d933bbcb73e814ab1edf2bf38604a57d646d9f94f46b7ab9cbf9016bacbd08d",
          "quote": "mmediately prior to the Effective Time, other than certain shares held by Huntington or Veritex, was converted into the right to receive 1.95 shares of common stock"
        }
      ]
    }
  ]
};
