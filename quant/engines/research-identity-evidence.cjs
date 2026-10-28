'use strict';
// Versioned original-source identity bindings for offline weekly research. Data only; read by
// quant/engines/research-weekly-loader.cjs exclusively when createResearchLoader(root, { identityEvidence: true }) is requested.
// Regenerate with scripts/quant/v9-followups/identity/build-identity-registry.cjs; never hand-edit a record.
// V10 extension `v10` (research-identity-evidence-1.1.0): written by scripts/quant/v10/population/build-registers.cjs; the five 1.0.0 records stay byte-identical.
module.exports = {
  "schemaVersion": "research-identity-evidence-1.0.0",
  "scope": "Source-resolved listing bindings for OFFLINE weekly research only (research-weekly-loader createResearchLoader option identityEvidence, default off; the productive weekly-real-adapter never reads this file). Each binding replaces a misbound security-master row and restricts the series to the SEC-sourced interval; no history outside it is asserted. No security-master correction, no product or published-value change.",
  "ownerDecision": "2026-10-28: only the five V9 dossier bindings; the 132 ambiguous-id bindings of the V9 proposal are not included.",
  "derivedFrom": {
    "proposal": "docs/quant-recovery/v9/identity/identity-evidence-proposal.json@claude/vision-universe-quant-v9-dsvle1",
    "proposalSha256": "ccf117f195b7ab7cdc9d9bc1a924ca92e6e3d79af9f9a6230f71d0b6da0cb054",
    "builder": "scripts/quant/v9-followups/identity/build-identity-registry.cjs"
  },
  "sourceHashConvention": "sha256 of the fetched SEC body; when complete=false, of its first bytesRead bytes",
  "historyGuardConvention": "weekly-real-adapter hash(): sha256(JSON.stringify(points with checkedFrom <= date <= checkedTo))",
  "records": [
    {
      "securityId": "ref_BGC",
      "ticker": "BGC",
      "cik": "0001094831",
      "issuer": "BGC Group, Inc. (successor issuer of BGC Partners, Inc., formerly eSpeed, Inc.)",
      "canonicalId": "v9-sec-binding:0001094831:BGC:2018-12-07",
      "masterRowAction": "REPLACE_MISBOUND_ROW",
      "replacesCanonicalIds": [
        "tiingo:NYSE:BGC:1997-05-16"
      ],
      "replacedRowIssuer": "GENERAL CABLE CORP /DE/",
      "mic": "XNAS",
      "instrumentClass": "CLASS_A_COMMON_STOCK",
      "currency": "USD",
      "provider": "tiingo",
      "validFrom": "2018-12-07",
      "validTo": null,
      "intervalBasis": [
        "AFTER_SOURCED_CA_EVENT:SPIN_OFF_DISTRIBUTION_NOT_SPLIT"
      ],
      "activeStatus": "ACTIVE_SEC_CONFIRMED",
      "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
      "historyGuard": {
        "checkedFrom": "2018-12-07",
        "checkedTo": "2026-10-23",
        "bars": 412,
        "pointsSha256": "5f13d5d9c150894394040ab5aa0669527fb7801bafd78ca4ec9c099191a10166"
      },
      "lastConfirmedCover": {
        "accession": "0001628280-26-055187",
        "filingDate": "2026-08-10",
        "sha256": "46e63c86d464c8c8cb39ee02f99ee4bb67f3a40098849e6854b3e09ac12a38fc"
      },
      "tickerIntervals": [
        {
          "ticker": "ESPD",
          "from": null,
          "to": "2008-04-01",
          "venue": "XNAS"
        },
        {
          "ticker": "BGCP",
          "from": "2008-04-02",
          "to": "2023-06-30",
          "venue": "XNAS"
        },
        {
          "ticker": "BGC",
          "from": "2023-07-03",
          "to": null,
          "venue": "XNAS"
        }
      ],
      "corporateActionNotes": [
        {
          "date": "2018-12-03",
          "providerFactor": 1.555,
          "sourceEvent": "SPIN_OFF_DISTRIBUTION_NOT_SPLIT",
          "detail": "Provider split factor coincides with the Newmark Group distribution (0.463895 NMRK per BGCP Class A share, distribution date 2018-11-30). No share split. Bars before 2018-12-03 are distribution-adjusted, not split-adjusted."
        }
      ],
      "priceEvidence": [
        {
          "date": "2007-09-28",
          "accession": "0001193125-08-025543",
          "sha256": "b458efcd40187d080ff9f03e4932937b9a2c8c587bb128b94df46854b7b3bfa8",
          "ratioSeriesToSource": 1.000815
        },
        {
          "date": "2023-05-19",
          "accession": "0001193125-23-154748",
          "sha256": "51cc0ea6ef159b9fdeef467342d9a7d49cfaa43ea2fc8b7afa5176f6e68f5a8f",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2004-12-31",
          "accession": "0000950136-05-002702",
          "sha256": "20bfcd5ade58817101c1fbe0a7dd360ad4f3566b4fcb2567cce6b4837fca3c6d",
          "ratioSeriesToSource": 0.999373
        },
        {
          "date": "2007-09-28",
          "accession": "0001193125-08-025543",
          "sha256": "b458efcd40187d080ff9f03e4932937b9a2c8c587bb128b94df46854b7b3bfa8",
          "ratioSeriesToSource": 1.000815
        },
        {
          "date": "2016-12-30",
          "accession": "0001193125-17-134854",
          "sha256": "ee1b59aa7391b7c6fcd91bfeaf64a54f2764701824d6d4cb1263067c4915b328",
          "ratioSeriesToSource": 1.000186
        },
        {
          "date": "2016-12-30",
          "accession": "0001193125-18-140944",
          "sha256": "788b7d96be62a2dfc772f4d0a403712b9ba9abd370ffd0f3397dc76382e49fbf",
          "ratioSeriesToSource": 1.000186
        },
        {
          "date": "2016-12-30",
          "accession": "0001193125-19-125431",
          "sha256": "e827a8f48a4b80145b99c10a26dfad7953fe74264ceba272b20c5fb93413f1aa",
          "ratioSeriesToSource": 1.000186
        },
        {
          "date": "2016-12-30",
          "accession": "0001193125-20-123053",
          "sha256": "9b747958ba58de109d32ff9ae5ad094f0170fc53b22cb5e9856fdb7fa5ece111",
          "ratioSeriesToSource": 1.000186
        },
        {
          "date": "2019-02-01",
          "accession": "0001193125-21-296419",
          "sha256": "ce61b9958cf66970fb18ff79390f8c0c6aca7fe09ddcf37948e2e36ce8803804",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2023-05-19",
          "accession": "0001193125-23-154748",
          "sha256": "51cc0ea6ef159b9fdeef467342d9a7d49cfaa43ea2fc8b7afa5176f6e68f5a8f",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2023-12-29",
          "accession": "0001213900-24-064363",
          "sha256": "d6098e2b9a271bfcc8172da15711e5a2f2e8bb6cb20477510ea884f9cc8fb198",
          "ratioSeriesToSource": 1
        }
      ],
      "sources": [
        {
          "role": "TICKER_CHANGE",
          "form": "8-K",
          "filingDate": "2008-04-07",
          "accession": "0001193125-08-076419",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312508076419/d8k.htm",
          "sha256": "f78d7f48857c7f1ea951b01d2c78bfa789af216247d6d687ab469412615858ae",
          "bytesRead": 107274,
          "complete": true,
          "claim": "ESPD_TO_BGCP: s A Common Stock changed its trading symbol and started to trade on the NASDAQ Global Market under the symbol “BGCP.” The Merger Agreement and its amendments are filed as Exhibits 2.1, 2.2 and 2.3, respect…"
        },
        {
          "role": "SUCCESSOR_REGISTRATION",
          "form": "8-K12B",
          "filingDate": "2023-07-03",
          "accession": "0001193125-23-180979",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312523180979/d521017d8k12b.htm",
          "sha256": "78de80e9f2f5a3e86ef73d7f3cec9fb9c1e48d7207231386bcf13130f7e99610",
          "bytesRead": 100179,
          "complete": true,
          "claim": "SUCCESSOR_ISSUER + ONE_FOR_ONE + PRIOR_TICKER: laware limited partnership (“Cantor”). This Current Report on Form 8-K serves as notice that BGC Group, Inc. is the successor issuer to BGC Partners, Inc. under the Securit…"
        },
        {
          "role": "SPINOFF_NOT_SPLIT",
          "form": "8-K",
          "filingDate": "2018-12-06",
          "accession": "0001193125-18-342885",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312518342885/d657778d8k.htm",
          "sha256": "7d02e9765bd2e43782bab6d9d29fe2b85c7de393d8ec3af9e6ea004408c13747",
          "bytesRead": 25766,
          "complete": true,
          "claim": "NEWMARK_DISTRIBUTION: f the close of business on the Record Date, BGC Partners’ stockholders as of the Record Date received in the Distribution 0.463895 of a share of Newmark Class A common stock for each share of BGC P…"
        },
        {
          "role": "PRICE_IDENTITY",
          "form": "DEFM14A",
          "filingDate": "2008-02-11",
          "accession": "0001193125-08-025543",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312508025543/ddefm14a.htm",
          "sha256": "b458efcd40187d080ff9f03e4932937b9a2c8c587bb128b94df46854b7b3bfa8",
          "bytesRead": 2097152,
          "complete": false,
          "claim": "Closing prices cited in this filing match the weekly series on the same day (see priceEvidence)"
        },
        {
          "role": "PRICE_IDENTITY",
          "form": "DEFM14A",
          "filingDate": "2023-05-26",
          "accession": "0001193125-23-154748",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312523154748/d476089ddefm14a.htm",
          "sha256": "51cc0ea6ef159b9fdeef467342d9a7d49cfaa43ea2fc8b7afa5176f6e68f5a8f",
          "bytesRead": 1808165,
          "complete": true,
          "claim": "Closing prices cited in this filing match the weekly series on the same day (see priceEvidence)"
        },
        {
          "role": "PREDECESSOR_TERMINAL",
          "form": "8-K",
          "filingDate": "2018-06-06",
          "accession": "0001193125-18-185029",
          "url": "https://www.sec.gov/Archives/edgar/data/886035/000119312518185029/d600292d8k.htm",
          "sha256": "58fd159c17270d3bb23bc51845dbdb3a455e295a3a905e4c435e46344c33ae18",
          "bytesRead": 32617,
          "complete": true,
          "claim": "GENERAL_CABLE_CASH + DELISTING: s ”), except for certain excluded shares, was automatically cancelled and converted into the right to receive $30.00 in cash (the “ Merger Consideration ”), without interest and less any …"
        },
        {
          "role": "EARLIEST_TICKER_CONFIRMATION",
          "form": "10-K",
          "filingDate": "2003-03-31",
          "accession": "0000950136-03-000748",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000095013603000748/file001.txt",
          "sha256": "38d734435522ba4dc45754d8c06a8b4f126bb81e13cff024213ee085f7e5b59b",
          "bytesRead": 390994,
          "complete": true,
          "claim": "Ticker statement: MATTERS PRICE RANGE OF CLASS A COMMON STOCK Our Class A common stock is traded on the Nasdaq National Market under the symbol \"ESPD\". For each quarter of the prior two years and through March 17, 2003,…"
        },
        {
          "role": "IXBRL_COVER_FIRST",
          "form": "8-K12B",
          "filingDate": "2023-07-03",
          "accession": "0001193125-23-180979",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000119312523180979/d521017d8k12b.htm",
          "sha256": "78de80e9f2f5a3e86ef73d7f3cec9fb9c1e48d7207231386bcf13130f7e99610",
          "bytesRead": 100179,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=BGC; Security12bTitle=Class A Common Stock, $0.01 par value; SecurityExchangeName=The Nasdaq Stock Market, LLC"
        },
        {
          "role": "IXBRL_COVER_LATEST",
          "form": "10-Q",
          "filingDate": "2026-08-10",
          "accession": "0001628280-26-055187",
          "url": "https://www.sec.gov/Archives/edgar/data/1094831/000162828026055187/bgcg-20260630.htm",
          "sha256": "46e63c86d464c8c8cb39ee02f99ee4bb67f3a40098849e6854b3e09ac12a38fc",
          "bytesRead": 3072440,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=BGC; Security12bTitle=Class A Common Stock, $0.01 par value; SecurityExchangeName=The Nasdaq Stock Market, LLC"
        }
      ]
    },
    {
      "securityId": "ref_COHR",
      "ticker": "COHR",
      "cik": "0000820318",
      "issuer": "Coherent Corp. (formerly II-VI Incorporated)",
      "canonicalId": "v9-sec-binding:0000820318:COHR:2001-09-28",
      "masterRowAction": "REPLACE_MISBOUND_ROW",
      "replacesCanonicalIds": [
        "tiingo:NASDAQ:COHR:1990-03-26"
      ],
      "replacedRowIssuer": "COHERENT INC",
      "mic": "XNYS",
      "instrumentClass": "COMMON_STOCK_NO_PAR",
      "currency": "USD",
      "provider": "tiingo",
      "validFrom": "2001-09-28",
      "validTo": null,
      "intervalBasis": [
        "EARLIEST_SEC_FULLTEXT_TICKER_CONFIRMATION"
      ],
      "activeStatus": "ACTIVE_SEC_CONFIRMED",
      "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
      "historyGuard": {
        "checkedFrom": "2001-09-28",
        "checkedTo": "2026-10-23",
        "bars": 1309,
        "pointsSha256": "52bd8b4b6c106adb400df12063c21870f5fb913426751cc60dbc59d4de37ec84"
      },
      "lastConfirmedCover": {
        "accession": "0001193125-26-375462",
        "filingDate": "2026-08-31",
        "sha256": "79ee6d0bfb1119b0b8cd850d4ccd84c98df54bd95f79b15436d95cfa2886e3bc"
      },
      "tickerIntervals": [
        {
          "ticker": "IIVI",
          "from": null,
          "to": "2022-09-07",
          "venue": "XNAS"
        },
        {
          "ticker": "COHR",
          "from": "2022-09-08",
          "to": "2023-02-22",
          "venue": "XNAS"
        },
        {
          "ticker": "COHR",
          "from": "2023-02-23",
          "to": null,
          "venue": "XNYS"
        }
      ],
      "corporateActionNotes": [],
      "priceEvidence": [
        {
          "date": "2007-06-30",
          "accession": "0001193125-07-204268",
          "sha256": "620dcf7625d650c6686e3f6501e306b42fcc322a79fb0cfcea5e895cd0a6f734",
          "ratioSeriesToSource": 1.000368
        },
        {
          "date": "2012-06-30",
          "accession": "0001193125-12-399717",
          "sha256": "22d88aa05a7f2d44257462428ddcc87ab95f07cd8836ad7aebdb9cd9c876b4fe",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2013-06-30",
          "accession": "0001193125-13-372622",
          "sha256": "4be5dfa833a8284749b59dc81d90be9f8bb3b0727450a99cbc778cc5828637d7",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2017-06-30",
          "accession": "0001193125-17-286341",
          "sha256": "bf455e80e332675abca32ddbec45972df3ecbbf0e1f45a113aa504d474b5b2b3",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2018-06-30",
          "accession": "0001193125-18-280041",
          "sha256": "06d0e951ed214fa1493aec0d5572c96ab4a7fa9acead9a6ace919601ceca0677",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2018-11-30",
          "accession": "0001193125-18-359733",
          "sha256": "cde4ffdfcaf6ffbe9e42c023d32322239397f95a36b139bbbb99b4ff57366fc4",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2018-11-30",
          "accession": "0001193125-19-012992",
          "sha256": "d9129df521cac8476409a5625381d246fe68a9ada4a1dc3c677f89c155d5e449",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2018-11-30",
          "accession": "0001193125-19-031419",
          "sha256": "451cb5cc65800ac1cea4eeb84c13b5376f48b09bc19b0c5b0d9ce57f99d75c4c",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2019-06-28",
          "accession": "0001193125-19-261641",
          "sha256": "bfeff4653e8702f653509a66ce8bb17e798d7090a7299a264dad86907f0d8493",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2023-06-30",
          "accession": "0001193125-23-246425",
          "sha256": "b39d27e8587a370c83857feefeb05179837bdd5be9c9b14b1bdd64b9f545893e",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2024-05-31",
          "accession": "0001193125-24-232597",
          "sha256": "615113d54392c51d3b1ec125afcdffbd991c7e2a6bd9c67b4c465f50e6be1141",
          "ratioSeriesToSource": 1
        }
      ],
      "sources": [
        {
          "role": "TICKER_CHANGE",
          "form": "8-K",
          "filingDate": "2022-09-08",
          "accession": "0001193125-22-240836",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312522240836/d347635d8k.htm",
          "sha256": "56b08149f67d9aa84461543ac713420472d99c208ef7516ba9f249947c17a552",
          "bytesRead": 27829,
          "complete": true,
          "claim": "IIVI_TO_COHR: ffective September 8, 2022, the Company’s common stock, no par value (the “ Common Stock ”), began trading under the ticker symbol “COHR” on the Nasdaq Global Select Market. Also on September 8, 2022, the …"
        },
        {
          "role": "EXCHANGE_TRANSFER",
          "form": "8-K",
          "filingDate": "2023-02-08",
          "accession": "0001193125-23-027571",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312523027571/d444935d8k.htm",
          "sha256": "08c9d2af7dfa32166b790e074779697396db8e061e40cf263621cde46cd42763",
          "bytesRead": 27418,
          "complete": true,
          "claim": "NASDAQ_TO_NYSE: n February 22, 2023. The Common Stock and Series A Mandatory Convertible Preferred Stock are expected to begin trading on the NYSE on Thursday, February 23, 2023, under the ticker symbols “COHR” and “IIV…"
        },
        {
          "role": "PRICE_IDENTITY",
          "form": "S-4",
          "filingDate": "2021-04-27",
          "accession": "0001193125-21-134433",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312521134433/d150472ds4.htm",
          "sha256": "46aa85079d5ac91b1e4b6f3a15a16f0f005f86d82437793643593ebe38b8e75b",
          "bytesRead": 2097152,
          "complete": false,
          "claim": "MERGER_TERMS + EXCHANGE_RATIO: ely prior to the effective time which will be cancelled and retired at the effective time; • “cash consideration” refers to $220.00 of cash per share of Coherent common stock; • “Code” ref…"
        },
        {
          "role": "PREDECESSOR_TERMINAL",
          "form": "8-K",
          "filingDate": "2022-07-01",
          "accession": "0001104659-22-076572",
          "url": "https://www.sec.gov/Archives/edgar/data/21510/000110465922076572/tm2220124d1_8k.htm",
          "sha256": "e5b2a761d4fba38619a7b13885f4c5eb11563beeb9a7424b1a3ae0e080293b44",
          "bytesRead": 43700,
          "complete": true,
          "claim": "COHERENT_INC_MERGER_COMPLETED + DELISTING: he “ Merger ”), with the Company surviving the Merger as a wholly owned subsidiary of II-VI. Merger Consideration Pursuant to the terms and conditions of the Merger Agreement, …"
        },
        {
          "role": "SPLIT_EVIDENCE",
          "form": "8-K",
          "filingDate": "2011-05-18",
          "accession": "0001193125-11-143673",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312511143673/d8k.htm",
          "sha256": "eab2925c455dbedb9446aa693cfc1a0789d0d74940ea16650f7106d4f595ac89",
          "bytesRead": 16105,
          "complete": true,
          "claim": "SPLIT_2011: I Incorporated (the “Company”) issued a press release entitled, “II-VI Incorporated Declares Two-For-One Common Stock Split.” The full text of the Company’s press release is filed as Exhibit 99.1 to this Cur…"
        },
        {
          "role": "SPLIT_EVIDENCE",
          "form": "8-K",
          "filingDate": "2005-02-18",
          "accession": "0000820318-05-000005",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000082031805000005/r-8k02172005.txt",
          "sha256": "708f3ae1d6ff454df38cba0885a5c347498b6c579e02a7f1f2aa62b7cc9998a9",
          "bytesRead": 3808,
          "complete": true,
          "claim": "SPLIT_2005: I Incorporated (the \"Company\") issued a press release entitled, \"II-VI Incorporated Declares Two-For-One Common Stock Split.\" The full text of the Company's press release is filed as Exhibit 99.1 to this Cur…"
        },
        {
          "role": "EARLIEST_TICKER_CONFIRMATION",
          "form": "10-K",
          "filingDate": "2001-09-27",
          "accession": "0000820318-01-500018",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000082031801500018/r10k-2001.txt",
          "sha256": "5bde7a792c743163cdda29f0c37e141c18da1244eb606fefda1f95360d8aa3ad",
          "bytesRead": 103045,
          "complete": true,
          "claim": "Ticker statement: MON EQUITY AND RELATED STOCKHOLDER MATTERS The Company's Common Stock is traded on the Nasdaq National Market under the symbol \"IIVI.\" The following table sets forth the range of high and low closing s…"
        },
        {
          "role": "IXBRL_COVER_FIRST",
          "form": "8-K",
          "filingDate": "2022-09-08",
          "accession": "0001193125-22-240836",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312522240836/d347635d8k.htm",
          "sha256": "56b08149f67d9aa84461543ac713420472d99c208ef7516ba9f249947c17a552",
          "bytesRead": 27829,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=COHR; Security12bTitle=Common Stock, no par value; SecurityExchangeName=Nasdaq Global Select Market"
        },
        {
          "role": "IXBRL_COVER_LATEST",
          "form": "8-K",
          "filingDate": "2026-08-31",
          "accession": "0001193125-26-375462",
          "url": "https://www.sec.gov/Archives/edgar/data/820318/000119312526375462/d110649d8k.htm",
          "sha256": "79ee6d0bfb1119b0b8cd850d4ccd84c98df54bd95f79b15436d95cfa2886e3bc",
          "bytesRead": 38424,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=COHR; Security12bTitle=Common Stock, no par value; SecurityExchangeName=New York Stock Exchange"
        }
      ]
    },
    {
      "securityId": "ref_DCOM",
      "ticker": "DCOM",
      "cik": "0000846617",
      "issuer": "Dime Commercial Bancshares, Inc. (formerly Dime Community Bancshares, Inc.; formerly Bridge Bancorp, Inc.)",
      "canonicalId": "v9-sec-binding:0000846617:DCOM:2011-03-11",
      "masterRowAction": "REPLACE_MISBOUND_ROW",
      "replacesCanonicalIds": [
        "tiingo:NASDAQ:DCOM:1996-06-26"
      ],
      "replacedRowIssuer": "DIME COMMUNITY BANCSHARES INC",
      "mic": "XNYS",
      "instrumentClass": "COMMON_STOCK",
      "currency": "USD",
      "provider": "tiingo",
      "validFrom": "2011-03-11",
      "validTo": null,
      "intervalBasis": [
        "EARLIEST_SEC_FULLTEXT_TICKER_CONFIRMATION"
      ],
      "activeStatus": "ACTIVE_SEC_CONFIRMED",
      "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
      "historyGuard": {
        "checkedFrom": "2011-03-11",
        "checkedTo": "2026-10-23",
        "bars": 816,
        "pointsSha256": "147c58af68d37830cc5b555869f291bf748fc54b5f53c1337c72fda68512a844"
      },
      "lastConfirmedCover": {
        "accession": "0000846617-26-000049",
        "filingDate": "2026-10-22",
        "sha256": "62cf5a2d671e36f6470afe324ea4b7c6be70a11aa20432ad41f5bcb7dad23fc6"
      },
      "tickerIntervals": [
        {
          "ticker": "BDGE",
          "from": null,
          "to": "2021-01-29",
          "venue": "XNAS"
        },
        {
          "ticker": "DCOM",
          "from": "2021-02-01",
          "to": "2026-04-?",
          "venue": "XNAS"
        },
        {
          "ticker": "DCOM",
          "from": "2026-04-?",
          "to": null,
          "venue": "XNYS"
        }
      ],
      "corporateActionNotes": [],
      "priceEvidence": [
        {
          "date": "2006-12-29",
          "accession": "0000846617-07-000008",
          "sha256": "cfbd861f296baf74696aef96cfd85208a30355c9a7b92ecdb85d9e721b438432",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2007-12-29",
          "accession": "0000846617-08-000008",
          "sha256": "54685d0d127cdbf7320521901b2f386c9edc8a9b23ba58422905fae21d3e322f",
          "ratioSeriesToSource": 0.99177
        },
        {
          "date": "2009-12-31",
          "accession": "0000950123-10-032080",
          "sha256": "d91cba8f42acca5df1e5b3a98eb833d12a37c3891b64597835fa13e602f252d9",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2010-12-31",
          "accession": "0001104659-11-018280",
          "sha256": "7e356a7f496d5a0f8c9b384582c2ef10d4f1ca2954184dfd2906c328f0c423c3",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2011-12-31",
          "accession": "0001104659-12-023262",
          "sha256": "266b6a79a37e24a0f4c2acb5711d3be83499052e2c40cfe50149c82d5dd0e6c5",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2015-12-31",
          "accession": "0001571049-16-013602",
          "sha256": "6fd72c6d0688dd8b6260120433799822a86d93338351452935acf87408a44e9f",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2016-12-31",
          "accession": "0001571049-17-003129",
          "sha256": "00c20397c4e41c05a28883915d131d92f5574c801b787f0e7e70d40a95dfb597",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2017-12-31",
          "accession": "0001144204-18-018613",
          "sha256": "f2b3b40b4c22726cdb5ab51301075fab0d0932d8483389762ac6c15c760dde86",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2020-12-31",
          "accession": "0000846617-21-000020",
          "sha256": "20af51f2cad84f3a2a4fa8be98942407aed8e5e2c25b4d79038421659e862172",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2021-12-31",
          "accession": "0001140361-22-014734",
          "sha256": "1fbe2398e0ed9e2100fe08325813c58a47c1b9bb5d3a42d01ea92dd575674ac2",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2022-12-31",
          "accession": "0001140361-23-018154",
          "sha256": "b15cd81a7241342fb34dbf5eb7c25baacdd990a12cdcf1d2b72d7d5abfdd788a",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2023-12-31",
          "accession": "0001140361-24-019078",
          "sha256": "2e098f8a7289500fa11cdf34612fa44ad4f8af7d895c50c85d4cf78d7c86ad15",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2024-11-08",
          "accession": "0001104659-24-116296",
          "sha256": "80ed2a447952fe080a8e502018756d5f6c18156b0849b0f4c3ac267ecee39a56",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2024-11-08",
          "accession": "0001104659-24-117065",
          "sha256": "36b23ce663b9fba4a4eb493db035488bb4802e0ee3c91b2d991f819ff8e83a11",
          "ratioSeriesToSource": 1
        }
      ],
      "sources": [
        {
          "role": "TICKER_CHANGE_AND_MERGER",
          "form": "8-K",
          "filingDate": "2021-02-01",
          "accession": "0001104659-21-009751",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000110465921009751/tm214412d1_8k.htm",
          "sha256": "f2e190faaf6f1a386050469d229435588e3cace8735d0b5741a90d916fea7856",
          "bytesRead": 71999,
          "complete": true,
          "claim": "BDGE_TO_DCOM + LEGACY_DIME_RATIO: t ticker symbol for its common stock, par value $0.01 per share (the “Company Common Stock”) from “BDGE” to “DCOM.” Immediately following the Effective Time, the Company had approximate…"
        },
        {
          "role": "PRICE_IDENTITY",
          "form": "S-4",
          "filingDate": "2020-09-14",
          "accession": "0001104659-20-104883",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000110465920104883/tm2028785-1_s4.htm",
          "sha256": "4eb2f2e474afbb54abdee832626b861c2ca73829ed2307a87af8f2d163cc7182",
          "bytesRead": 2097152,
          "complete": false,
          "claim": "Closing prices cited in this filing match the weekly series on the same day (see priceEvidence)"
        },
        {
          "role": "EXCHANGE_REGISTRATION",
          "form": "8-A12B",
          "filingDate": "2008-06-09",
          "accession": "0001068800-08-000250",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000106880008000250/bridge8a.txt",
          "sha256": "40e7f10540286592de6e72a4c2f98e0234b414e69d42ab0ec95debb1788f3562",
          "bytesRead": 15264,
          "complete": true,
          "claim": "NASDAQ_12B_2008: each class Name of each exchange on which To be so registered each class is to be registered Common stock The NASDAQ Global Select Market ---------------------------------- -----------------------------…"
        },
        {
          "role": "EXCHANGE_TRANSFER",
          "form": "8-A12B",
          "filingDate": "2026-03-17",
          "accession": "0000943374-26-000131",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000094337426000131/form8a_0326.htm",
          "sha256": "b1b6b26f14bd54839b56f4a58a292952b648fa2bfcd031e8f4e871e9a194b7f5",
          "bytesRead": 20390,
          "complete": true,
          "claim": "NYSE_REGISTRATION_2026: each class Name of each exchange on which to be so registered each class is to be registered Common Stock, par value $0.01 per share The New York Stock Exchange Preferred Stock, Series A, $0.01 P…"
        },
        {
          "role": "EXCHANGE_TRANSFER",
          "form": "25",
          "filingDate": "2026-04-06",
          "accession": "0000943374-26-000159",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000094337426000159/form25_040626.htm",
          "sha256": "48e649219de4f0de45740cbda9dd516ad1a6ae032e87e205a2c6cb2198623b27",
          "bytesRead": 9079,
          "complete": true,
          "claim": "NASDAQ_FORM25_2026: ES EXCHANGE ACT OF 1934 Commission File Number 001-34096 DIME COMMUNITY BANCSHARES, INC. THE NASDAQ STOCK MARKET LLC (Exact name of Issuer as specified in its charter, and name of Exchange where secu…"
        },
        {
          "role": "NAME_CHANGE",
          "form": "8-K",
          "filingDate": "2026-06-01",
          "accession": "0000943374-26-000219",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000094337426000219/form8k_052826.htm",
          "sha256": "00cbde376915fed20074fc417829022172c2e87b32cedb237c36f2c2c7ef353c",
          "bytesRead": 67884,
          "complete": true,
          "claim": "DIME_COMMERCIAL: ointment of Certain Officers; Compensatory Arrangements of Certain Officers On May 28, 2026, Dime Commercial Bancshares, Inc., formerly known as Dime Community Bancshares, Inc. (the “Company”) and Dime …"
        },
        {
          "role": "EARLIEST_TICKER_CONFIRMATION",
          "form": "10-K",
          "filingDate": "2011-03-11",
          "accession": "0001104659-11-013915",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000110465911013915/a11-7685_110k.htm",
          "sha256": "a56d0c1d3bc2b8c8e595417e19fbffcef9edf8828575f408443c114b7222905e",
          "bytesRead": 2097152,
          "complete": false,
          "claim": "Ticker statement: uity Securities COMMON STOCK INFORMATION The Company’s common stock trades on the NASDAQ Global Select Market under the symbol, “BDGE”. The following table details the quarterly high and low sale price…"
        },
        {
          "role": "IXBRL_COVER_FIRST",
          "form": "8-K",
          "filingDate": "2021-02-01",
          "accession": "0001104659-21-009751",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000110465921009751/tm214412d1_8k.htm",
          "sha256": "f2e190faaf6f1a386050469d229435588e3cace8735d0b5741a90d916fea7856",
          "bytesRead": 71999,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=DCOM; Security12bTitle=Common Stock, $0.01 Par Value; SecurityExchangeName=The Nasdaq Stock Market, LLC"
        },
        {
          "role": "IXBRL_COVER_LATEST",
          "form": "8-K",
          "filingDate": "2026-10-22",
          "accession": "0000846617-26-000049",
          "url": "https://www.sec.gov/Archives/edgar/data/846617/000084661726000049/dcom-20261022x8k.htm",
          "sha256": "62cf5a2d671e36f6470afe324ea4b7c6be70a11aa20432ad41f5bcb7dad23fc6",
          "bytesRead": 46033,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=DCOM; Security12bTitle=Common Stock, $0.01 Par Value; SecurityExchangeName=The New York Stock Exchange"
        }
      ]
    },
    {
      "securityId": "ref_SGI",
      "ticker": "SGI",
      "cik": "0001206264",
      "issuer": "Somnigroup International Inc. (formerly Tempur Sealy International, Inc.; formerly Tempur-Pedic International Inc.)",
      "canonicalId": "v9-sec-binding:0001206264:SGI:2004-04-02",
      "masterRowAction": "REPLACE_MISBOUND_ROW",
      "replacesCanonicalIds": [
        "tiingo:NASDAQ:SGI:2009-05-19"
      ],
      "replacedRowIssuer": "Silicon Graphics International Corp",
      "mic": "XNYS",
      "instrumentClass": "COMMON_STOCK",
      "currency": "USD",
      "provider": "tiingo",
      "validFrom": "2004-04-02",
      "validTo": null,
      "intervalBasis": [
        "EARLIEST_SEC_FULLTEXT_TICKER_CONFIRMATION"
      ],
      "activeStatus": "ACTIVE_SEC_CONFIRMED",
      "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
      "historyGuard": {
        "checkedFrom": "2004-04-02",
        "checkedTo": "2026-10-23",
        "bars": 1178,
        "pointsSha256": "cea63a57a8562695e8d45f89f0dc64fd0cc3173bbd78eb1deefa5050929bd6a9"
      },
      "lastConfirmedCover": {
        "accession": "0001206264-26-000121",
        "filingDate": "2026-08-26",
        "sha256": "e4ee768a3fd4e9a43f48a0f92985d235393b027cace6d89a7c4038050873c1cf"
      },
      "tickerIntervals": [
        {
          "ticker": "TPX",
          "from": "2003-12-18",
          "to": "2025-02-14",
          "venue": "XNYS"
        },
        {
          "ticker": "SGI",
          "from": "2025-02-18",
          "to": null,
          "venue": "XNYS"
        }
      ],
      "corporateActionNotes": [],
      "priceEvidence": [
        {
          "date": "2026-04-10",
          "accession": "0001206264-26-000085",
          "sha256": "bacb708caad3b35926c538d8cfee101616362f4ecf57086a273f3040f7942368",
          "ratioSeriesToSource": 0.9998
        },
        {
          "date": "2004-12-31",
          "accession": "0001193125-05-059932",
          "sha256": "b22da2a04e988c8a82e0a560f53e231c41a4dc2b23021b2380698b3a618b088d",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2011-12-31",
          "accession": "0001140361-12-016278",
          "sha256": "dd2ea42592f87fb2df5d2bd35ee6d48698759a3436b2cc592e21a810d0b15727",
          "ratioSeriesToSource": 0.99981
        },
        {
          "date": "2015-12-31",
          "accession": "0001206264-16-000129",
          "sha256": "3fa7c6abca8874a53d13e02fa515406d6c3e3b37cc2d580c1b63c7231ea901d5",
          "ratioSeriesToSource": 0.999716
        },
        {
          "date": "2017-12-29",
          "accession": "0001206264-18-000061",
          "sha256": "d5e98f93dce23b5ee720caf130cd0cf73e579490285f17414be9f84567c9e215",
          "ratioSeriesToSource": 0.99984
        },
        {
          "date": "2020-12-31",
          "accession": "0001206264-21-000111",
          "sha256": "47d50f0bdfcaeafbf3031ad3472f686afcebef1956e009347019f5a07f687c51",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2021-12-31",
          "accession": "0001206264-22-000092",
          "sha256": "c1a523bde96e4af29300cb871b4982764892b09538b21306e288fe23a3bcbda4",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2022-12-30",
          "accession": "0001206264-23-000086",
          "sha256": "cdbb4d3f8124e51c920a860147af3b0ee4acb182cb1bc69c98cc9b460beab374",
          "ratioSeriesToSource": 1
        },
        {
          "date": "2023-12-29",
          "accession": "0001206264-24-000081",
          "sha256": "46b0ff02dd0dbf0f4f6fc3a0b94bcb3033e67e1446610ea00f0c73e59ff6c62f",
          "ratioSeriesToSource": 1
        }
      ],
      "sources": [
        {
          "role": "TICKER_CHANGE",
          "form": "8-K",
          "filingDate": "2025-02-18",
          "accession": "0001206264-25-000037",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000120626425000037/tpx-20250218.htm",
          "sha256": "783376cdbe36291d9d5fc701b1ce4b106290a4f56df48fe7655fd886752b078c",
          "bytesRead": 29479,
          "complete": true,
          "claim": "TPX_TO_SGI: ith the name change, the Company's common stock began trading on the New York Stock Exchange under a new ticker symbol \"SGI\" as of the Effective Date Item 9.01. Financial Statements and Exhibits. (d) Exhibit…"
        },
        {
          "role": "LISTING_REGISTRATION",
          "form": "8-A12B",
          "filingDate": "2003-12-08",
          "accession": "0001193125-03-090649",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000119312503090649/d8a12b.htm",
          "sha256": "77c2250d6adbcd836a9afb344edd09d38e544da1bcf671c5d1181c10b881449e",
          "bytesRead": 18394,
          "complete": true,
          "claim": "NYSE_8A_2003: each exchange on which each class is to be registered Common Stock, $.01 par value per share New York Stock Exchange, Inc. Securities to be registered pursuant to Section 12(g) of the Act: None (Title of c…"
        },
        {
          "role": "SPLIT_EVIDENCE",
          "form": "8-K",
          "filingDate": "2020-10-29",
          "accession": "0001206264-20-000228",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000120626420000228/tpx-20201029.htm",
          "sha256": "ade479b939932d1a78d475e9ac547ebbfc6a88b2d4c84b481b3ded6a214ac166",
          "bytesRead": 36560,
          "complete": true,
          "claim": "SPLIT_2020: pany's share repurchase program by $168.7 million to a total of $300 million, (b) declared a four-for-one stock split effected in the form of a stock dividend payable on November 23, 2020 to stockholders of …"
        },
        {
          "role": "PRICE_IDENTITY_DERIVED",
          "form": "S-4",
          "filingDate": "2026-06-24",
          "accession": "0001206264-26-000085",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000120626426000085/sgis-4.htm",
          "sha256": "bacb708caad3b35926c538d8cfee101616362f4ecf57086a273f3040f7942368",
          "bytesRead": 2097152,
          "complete": false,
          "claim": "EXCHANGE_RATIO_0_1455: ng Shares) will be converted, without any action on the part of the holder thereof, into the right to receive 0.1455 shares of Somnigroup common stock. No fractional shares of Somnigroup common st…"
        },
        {
          "role": "PREDECESSOR_TERMINAL",
          "form": "8-K",
          "filingDate": "2016-11-01",
          "accession": "0001193125-16-754864",
          "url": "https://www.sec.gov/Archives/edgar/data/1316625/000119312516754864/d278677d8k.htm",
          "sha256": "4e0e40c87e7b66a23c11c3134c149fbbc0892e5f5bac84509734bc8acbe2cec9",
          "bytesRead": 24692,
          "complete": true,
          "claim": "SGI_INTL_CASH: General Corporation Law) was cancelled and extinguished and automatically converted into the right to receive $7.75 in cash, without interest, and subject to deduction for any required withholding tax (th…"
        },
        {
          "role": "EARLIEST_TICKER_CONFIRMATION",
          "form": "10-K",
          "filingDate": "2004-03-30",
          "accession": "0001193125-04-053868",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000119312504053868/d10k.htm",
          "sha256": "9e82261704f34e7a6480bb9501126a5fdd3896de5af3e4affacc9e46bd0a6a2d",
          "bytesRead": 1622629,
          "complete": true,
          "claim": "Ticker statement: e class of common equity is our $0.01 par value common stock, which is trading on the New York Stock Exchange under the symbol “TPX.” Trading in our common stock commenced on the NYSE on December 18, 2…"
        },
        {
          "role": "IXBRL_COVER_FIRST",
          "form": "8-K",
          "filingDate": "2025-02-18",
          "accession": "0001206264-25-000037",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000120626425000037/tpx-20250218.htm",
          "sha256": "783376cdbe36291d9d5fc701b1ce4b106290a4f56df48fe7655fd886752b078c",
          "bytesRead": 29479,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=SGI; Security12bTitle=Common Stock, $0.01 par value; SecurityExchangeName=New York Stock Exchange"
        },
        {
          "role": "IXBRL_COVER_LATEST",
          "form": "8-K",
          "filingDate": "2026-08-26",
          "accession": "0001206264-26-000121",
          "url": "https://www.sec.gov/Archives/edgar/data/1206264/000120626426000121/sgi-20260826.htm",
          "sha256": "e4ee768a3fd4e9a43f48a0f92985d235393b027cace6d89a7c4038050873c1cf",
          "bytesRead": 38247,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=SGI; Security12bTitle=Common Stock, $0.01 par value; SecurityExchangeName=New York Stock Exchange"
        }
      ]
    },
    {
      "securityId": "ref_TRAK",
      "ticker": "TRAK",
      "cik": "0000050471",
      "issuer": "ReposiTrak, Inc. (formerly Park City Group, Inc.)",
      "canonicalId": "v9-sec-binding:0000050471:TRAK:2024-10-11",
      "masterRowAction": "REPLACE_MISBOUND_ROW",
      "replacesCanonicalIds": [
        "tiingo:NASDAQ:TRAK:1999-10-27"
      ],
      "replacedRowIssuer": null,
      "mic": "XNYS",
      "instrumentClass": "COMMON_STOCK",
      "currency": "USD",
      "provider": "tiingo",
      "validFrom": "2024-10-11",
      "validTo": null,
      "intervalBasis": [
        "SERIES_START"
      ],
      "activeStatus": "ACTIVE_SEC_CONFIRMED",
      "evidenceLevel": "COVER_PAGE_ONLY",
      "historyGuard": {
        "checkedFrom": "2024-10-11",
        "checkedTo": "2026-10-23",
        "bars": 107,
        "pointsSha256": "58a59ba33829552ee1d15720ba0c74be35cf71d86a9f65636c46e6158427af64"
      },
      "lastConfirmedCover": {
        "accession": "0001437749-26-031604",
        "filingDate": "2026-09-30",
        "sha256": "2b8f846da204810c63ba2b70a343e025fcba835ee22880b8ecaf443c16099b2c"
      },
      "tickerIntervals": [
        {
          "ticker": "PCYG",
          "from": null,
          "to": "2024-06-16",
          "venue": "XNAS; XNYS from 2023 (8-K 0001437749-23-028469); end is an upper bound"
        },
        {
          "ticker": "TRAK",
          "from": "2024-06-17",
          "to": null,
          "venue": "XNYS (first TRAK cover in this dossier: 8-K 0001437749-24-020637)"
        }
      ],
      "corporateActionNotes": [],
      "priceEvidence": [],
      "sources": [
        {
          "role": "EXCHANGE_TRANSFER",
          "form": "8-K",
          "filingDate": "2023-10-18",
          "accession": "0001437749-23-028469",
          "url": "https://www.sec.gov/Archives/edgar/data/50471/000143774923028469/pcyg20231017_8k.htm",
          "sha256": "93ba3605b23d86d2d7d27e513ad0d271ac1de82fbe1ff92d98f6d053de400283",
          "bytesRead": 24292,
          "complete": true,
          "claim": "NASDAQ_TO_NYSE_2023: “ Common Stock ”) from the Nasdaq Capital Market of The Nasdaq Stock Market LLC (“ NASDAQ ”) to the New York Stock Exchange (the “ NYSE ”) (the “ Exchange Transfer ”). The Board of Directors of the …"
        },
        {
          "role": "COVER_TICKER",
          "form": "8-K",
          "filingDate": "2024-06-18",
          "accession": "0001437749-24-020637",
          "url": "https://www.sec.gov/Archives/edgar/data/50471/000143774924020637/trak20240617_8k.htm",
          "sha256": "e30d7bff5998970b10a3f11569e50a9fb8e8552ee49abb73f44bc4d7ba5fc5fe",
          "bytesRead": 24938,
          "complete": true,
          "claim": "Filing cover page names the issuer's common stock under ticker TRAK"
        },
        {
          "role": "COVER_TICKER",
          "form": "8-K",
          "filingDate": "2024-10-02",
          "accession": "0001437749-24-030452",
          "url": "https://www.sec.gov/Archives/edgar/data/50471/000143774924030452/trak20241002_8k.htm",
          "sha256": "f4510d5ead2615044ad6d0f7d345e81b3de4619538009b3216064a2a7ef01d10",
          "bytesRead": 24862,
          "complete": true,
          "claim": "Filing cover page names the issuer's common stock under ticker TRAK"
        },
        {
          "role": "IXBRL_COVER_FIRST",
          "form": "10-Q",
          "filingDate": "2023-11-14",
          "accession": "0001437749-23-032047",
          "url": "https://www.sec.gov/Archives/edgar/data/50471/000143774923032047/pcyg20230930_10q.htm",
          "sha256": "f444960702b70b7af927d0ff83750591d498bce5816db404fe56706aeaf45505",
          "bytesRead": 728540,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=TRAK; Security12bTitle=Common stock, par value $0.01 per; SecurityExchangeName=New York Stock Exchange"
        },
        {
          "role": "IXBRL_COVER_LATEST",
          "form": "8-K",
          "filingDate": "2026-09-30",
          "accession": "0001437749-26-031604",
          "url": "https://www.sec.gov/Archives/edgar/data/50471/000143774926031604/trak20260930_8k.htm",
          "sha256": "2b8f846da204810c63ba2b70a343e025fcba835ee22880b8ecaf443c16099b2c",
          "bytesRead": 25755,
          "complete": true,
          "claim": "iXBRL cover: TradingSymbol=TRAK; Security12bTitle=Common stock, par value $0.01 per share; SecurityExchangeName=New York Stock Exchange"
        }
      ]
    }
  ],
  "v10": {
    "schemaVersion": "research-identity-evidence-1.1.0",
    "protocol": "docs/quant-recovery/v10/population/protocol-1.0.0.json",
    "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
    "scope": "V10 protocol bindings for ambiguous baseline ids (several master rows): SELECT_EXISTING_ROW, SEC same-day price + current cover evidence only. Applied only with createResearchLoader option identityEvidenceProtocolV10 (requires identityEvidence). Owner release pending; the 1.0.0 owner decision above is unchanged.",
    "builder": "scripts/quant/v10/population/build-registers.cjs",
    "evidence": "docs/quant-recovery/v10/population/identity-cases.json",
    "records": [
      {
        "securityId": "ref_ACI",
        "ticker": "ACI",
        "cik": "0001646972",
        "issuer": "Albertsons Companies, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:ACI:2020-06-26",
        "masterRowSet": [
          "tiingo:NYSE:ACI:1988-08-12",
          "tiingo:NYSE:ACI:2020-06-26"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, $0.01 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-02-25",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-02-25",
          "checkedTo": "2026-10-23",
          "bars": 244,
          "pointsSha256": "7aac15ae4e3786aa4a89936e3741cb65d5835bc160bb966f38ee0e998ab6b0b6"
        },
        "lastConfirmedCover": {
          "accession": "0001646972-26-000065",
          "filingDate": "2026-10-20",
          "sha256": "579cc36355087fda86871ec5c0e2e2e0c09dd3951b3b4388ea9d66462e5b94c8"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2024-02-23",
          "lastMatch": "2026-02-27",
          "maxGapDays": 370
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001646972-26-000065",
            "url": "https://www.sec.gov/Archives/edgar/data/1646972/000164697226000065/aci-20260912.htm",
            "sha256": "579cc36355087fda86871ec5c0e2e2e0c09dd3951b3b4388ea9d66462e5b94c8",
            "sha256Normalized": "72d2f7a95fbbc5426bfe9cf01ea2b84ce1a5ea128450c972e14bb89163f04a29",
            "bytesRead": 1259642,
            "complete": true,
            "claim": "10-Q 2026-10-20 cover: ACI / Class A common stock, $0.01 par value / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-20-065176",
            "url": "https://www.sec.gov/Archives/edgar/data/1646972/000119312520065176/d817604ds1.htm",
            "sha256": "241a8bbe0056b68b665298db7c0058255a64a8e1b76b5657ca7b7a9809361ce6",
            "sha256Normalized": "241a8bbe0056b68b665298db7c0058255a64a8e1b76b5657ca7b7a9809361ce6",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "are will be between $ and $ . We will apply to list the common stock on the New York Stock Exchange, or NYSE, under the symbol “ACI.” Concurrently with this offering, we are also making a public offering of shares of our % Series A mandatory convertible preferred stock, $0.01 par"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-030899",
            "url": "https://www.sec.gov/Archives/edgar/data/1646972/000114036124030899/ny20019591x1_def14a.htm",
            "sha256": "640d7ce6bd0fbc85df3a56020696cc1e7955b6c31b4af62a75b5100935d18f69",
            "sha256Normalized": "c0a941fa1bcfc7932665f39f594614102f1e18343245e82ff5631a5ae3b3bf3f",
            "bytesRead": 1630989,
            "complete": true,
            "claim": "DEF 14A 2024-06-21: closing price $21.44 on 2024-02-23"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-25-023165",
            "url": "https://www.sec.gov/Archives/edgar/data/1646972/000114036125023165/ny20043015x771.htm",
            "sha256": "c57de3968b9723c77ec3886a6063160fbd0de46daa83289ccc08f6badc1a4bf8",
            "sha256Normalized": "c57de3968b9723c77ec3886a6063160fbd0de46daa83289ccc08f6badc1a4bf8",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2025-06-20: closing price $20.55 on 2025-02-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-025819",
            "url": "https://www.sec.gov/Archives/edgar/data/1646972/000114036126025819/ny20070872x2_def14a.htm",
            "sha256": "3ad56a2e6c070168edd8aadd1eed0c4ad2ccc26132e9f70dcf0368a7ac05e2b0",
            "sha256Normalized": "3ad56a2e6c070168edd8aadd1eed0c4ad2ccc26132e9f70dcf0368a7ac05e2b0",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-06-22: closing price $17.9 on 2026-02-27"
          }
        ],
        "priceEvidence": [
          {
            "date": "2024-02-23",
            "rawPrice": 21.44,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-02-23",
              21.44
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-24-030899",
            "sha256": "640d7ce6bd0fbc85df3a56020696cc1e7955b6c31b4af62a75b5100935d18f69",
            "quote": " for Mr. Sankaran includes his performance-based restricted stock. (2) Based on closing price of $21.44 per share of Common Stock as of February 23, 2024. (3) Reflects PBRSU"
          },
          {
            "date": "2025-02-22",
            "rawPrice": 20.55,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-02-21",
              20.55
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-25-023165",
            "sha256": "c57de3968b9723c77ec3886a6063160fbd0de46daa83289ccc08f6badc1a4bf8",
            "quote": "l award and continued service through the applicable vesting date. (2) Based on closing price of $20.55 per share of Common Stock as of February 22, 2025. (3) Reflects PBRSU"
          },
          {
            "date": "2026-02-27",
            "rawPrice": 17.9,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-27",
              17.9
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-025819",
            "sha256": "3ad56a2e6c070168edd8aadd1eed0c4ad2ccc26132e9f70dcf0368a7ac05e2b0",
            "quote": " the equity awards is based on the terms of our equity award agreements and the closing price of our Common Stock on February 27, 2026 of $17.90 per share. Mr. Sank"
          }
        ]
      },
      {
        "securityId": "ref_AERT",
        "ticker": "AERT",
        "cik": "0001853044",
        "issuer": "Aeries Technology, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:AERT:2021-12-17",
        "masterRowSet": [
          "tiingo:NASDAQ:AERT:2001-01-02",
          "tiingo:NASDAQ:AERT:2021-12-17"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A ordinary shares, par value $0.0008 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-11-17",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-11-17",
          "checkedTo": "2026-10-23",
          "bars": 154,
          "pointsSha256": "7409004b8c51a041e886cdb6e086b3755a7c64a161148e656eae879664baf07a"
        },
        "lastConfirmedCover": {
          "accession": "0001829126-26-008507",
          "filingDate": "2026-08-10",
          "sha256": "e62728b9099535fa7a46f4f7d3d996f1e757ebd04862d9a72b5e331f2972add0"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-08-01",
          "lastMatch": "2025-08-01",
          "maxGapDays": 374
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001829126-26-008507",
            "url": "https://www.sec.gov/Archives/edgar/data/1853044/000182912626008507/aeriestech_10q.htm",
            "sha256": "e62728b9099535fa7a46f4f7d3d996f1e757ebd04862d9a72b5e331f2972add0",
            "sha256Normalized": "ffa176d085f111c80b64c405a45bf9a4cdd95df04ab304b658d8f6d021799b2b",
            "bytesRead": 1460263,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: AERT / Class A ordinary shares, par value $0.0008 per share / Nasdaq"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001829126-23-007330",
            "url": "https://www.sec.gov/Archives/edgar/data/1853044/000182912623007330/aeriestech_8k.htm",
            "sha256": "ca6104be1b3e70ee454e4d43f3fef1671e3304260b496a606a0206a45d560c2d",
            "sha256Normalized": "4d63610a90fb1e818883564b2fb20af6321c73752a2964676e90540d5eb9dd22",
            "bytesRead": 259224,
            "complete": true,
            "claim": "AERT / Class A ordinary shares, par value $0.0001 per share / Nasdaq"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001829126-25-006123",
            "url": "https://www.sec.gov/Archives/edgar/data/1853044/000182912625006123/aeriestech_424b3.htm",
            "sha256": "d4f5877f5a3a1de8d58b3c2221cd7fd45c1b4b8fd56c4bbb4748fef6f117c3c9",
            "sha256Normalized": "d4f5877f5a3a1de8d58b3c2221cd7fd45c1b4b8fd56c4bbb4748fef6f117c3c9",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2025-08-12: closing price $0.85 on 2025-08-01"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-08-01",
            "rawPrice": 0.85,
            "laterSplitProduct": 0.125,
            "seriesBar": [
              "2025-08-01",
              6.8
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001829126-25-006123",
            "sha256": "d4f5877f5a3a1de8d58b3c2221cd7fd45c1b4b8fd56c4bbb4748fef6f117c3c9",
            "quote": "and the trading price of our Class A ordinary shares. For example, based on the closing price of our Class A ordinary shares of $0.85 as of August 1, 2025, (i) the holders of"
          }
        ]
      },
      {
        "securityId": "ref_ALTI",
        "ticker": "ALTI",
        "cik": "0001838615",
        "issuer": "AlTi Global, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:ALTI:2023-01-03",
        "masterRowSet": [
          "tiingo:NASDAQ:ALTI:1999-07-06",
          "tiingo:NASDAQ:ALTI:2023-01-03"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-01-06",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-01-06",
          "checkedTo": "2026-10-23",
          "bars": 199,
          "pointsSha256": "7c40b693ebd80ea1e1792489721954c45c3e8d94208ae9df16f0da4d1e0fefb1"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-055274",
          "filingDate": "2026-08-10",
          "sha256": "3fa0ef78f3853d200d135ba5ad98d17fb6a97c68e79054c6f211ebb8d10c2e00"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2023-05-19",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-055274",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000162828026055274/alti-20260630.htm",
            "sha256": "3fa0ef78f3853d200d135ba5ad98d17fb6a97c68e79054c6f211ebb8d10c2e00",
            "sha256Normalized": "4bccab3d46e7f93c57b1ac02d8bf53c68ca638c7c51824d187e5760f215ba2df",
            "bytesRead": 2672666,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: ALTI / Class A common stock, par value $0.0001 per share / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-23-004775",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000119312523004775/d431644d8k.htm",
            "sha256": "b6f67fc36898b932bd33b535565559ac87d10fae9f932167e48805c8766daf85",
            "sha256Normalized": "b63b0935c897d3c699a5de6c8aa709dcb31df4cb25aa44bd051461e98a550b15",
            "bytesRead": 263399,
            "complete": true,
            "claim": "uity and Related Stockholder Matters The Common Stock and Warrants began trading on the Nasdaq Capital Market under the symbols “ALTI” and “ALTIW,” respectively, on January 4, 2023, in lieu of the Class A Ordinary Shares and public warrants of Cartesian. The Company has not paid "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-156638",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000119312523156638/d443189d424b3.htm",
            "sha256": "9a9944bf87dc16e2721a636971c53e5aa79c7f62edd405dafef0a6d1093a6ec1",
            "sha256Normalized": "9a9944bf87dc16e2721a636971c53e5aa79c7f62edd405dafef0a6d1093a6ec1",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2023-05-30: closing price $4.78 on 2023-05-19"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-155690",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000119312523155690/d495281d424b3.htm",
            "sha256": "ec60700871f7a4921c0a0dbd4eebfd1dbf782c64a846c1923e13fef626a4c65e",
            "sha256Normalized": "ec60700871f7a4921c0a0dbd4eebfd1dbf782c64a846c1923e13fef626a4c65e",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2023-05-30: closing price $4.78 on 2023-05-19"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-025336",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000114036124025336/edge20025073x1_def14a.htm",
            "sha256": "f2ae620a02b0bc2814b4e0a36a01888ed04653a4bc86a5ebd654e1f018355656",
            "sha256Normalized": "cb24b90687cbe9331bdb9f8fe2cf00ff2f1c8a09a815035cd87238f9063ebbac",
            "bytesRead": 947521,
            "complete": true,
            "claim": "DEF 14A 2024-05-10: closing price $8.76 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-018294",
            "url": "https://www.sec.gov/Archives/edgar/data/1838615/000114036126018294/ny20066517x1_def14a.htm",
            "sha256": "c63d92d7e2e1ced5c7a8ca43a437e13a59de3076808d6f3889aa56cd0691697e",
            "sha256Normalized": "b48db84d8e6d3d694579199fb814c2f4ea684e7798802052df36c5cb87b51785",
            "bytesRead": 858998,
            "complete": true,
            "claim": "DEF 14A 2026-04-30: closing price $4.64 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-05-19",
            "rawPrice": 4.78,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-05-19",
              4.78
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-156638",
            "sha256": "9a9944bf87dc16e2721a636971c53e5aa79c7f62edd405dafef0a6d1093a6ec1",
            "quote": "uture Sale—Registration Rights—Registration Rights and Lock-Up Agreement ”. The closing price of our Class A Common Stock on Nasdaq on May 19, 2023 was $4.78, which is $6.72 bel"
          },
          {
            "date": "2023-05-19",
            "rawPrice": 4.78,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-05-19",
              4.78
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-155690",
            "sha256": "ec60700871f7a4921c0a0dbd4eebfd1dbf782c64a846c1923e13fef626a4c65e",
            "quote": " substantially above the current trading price of the Class A Common Stock. The closing price of our Class A Common Stock on May 19, 2023 was $4.78. Accordingly, the W"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 8.76,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              8.76
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-24-025336",
            "sha256": "f2ae620a02b0bc2814b4e0a36a01888ed04653a4bc86a5ebd654e1f018355656",
            "quote": "ect to continued service through each applicable vesting date. (3) Based on the closing price of our common stock on December 29, 2023, which was $8.76. -35- TABLE OF CONT"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 4.64,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              4.64
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-018294",
            "sha256": "c63d92d7e2e1ced5c7a8ca43a437e13a59de3076808d6f3889aa56cd0691697e",
            "quote": "ect to continued service through each applicable vesting date. (3) Based on the closing price of our common stock on December 31, 2025, which was $4.64. (4) Represents the"
          }
        ]
      },
      {
        "securityId": "ref_ARRY",
        "ticker": "ARRY",
        "cik": "0001820721",
        "issuer": "Array Technologies, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:ARRY:2020-10-15",
        "masterRowSet": [
          "tiingo:NASDAQ:ARRY:2000-11-30",
          "tiingo:NASDAQ:ARRY:2020-10-15"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, $0.001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-10-16",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-10-16",
          "checkedTo": "2026-10-23",
          "bars": 315,
          "pointsSha256": "eb6e7eb56991b7df91ca4580ae8dbfb39ce0e837f365201e4e0b8c3aec454a8e"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-053517",
          "filingDate": "2026-08-05",
          "sha256": "14cd4017fc74b37b35f57de875773bb33a8a821ac279ce7eb91bde36e3417387"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2020-11-27",
          "lastMatch": "2022-05-06",
          "maxGapDays": 1552
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-053517",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000162828026053517/arry-20260630.htm",
            "sha256": "14cd4017fc74b37b35f57de875773bb33a8a821ac279ce7eb91bde36e3417387",
            "sha256Normalized": "1681ba8ed1b862c8e140245da78f7eecab36786f537cd94beffa9fb499a1d33a",
            "bytesRead": 1594209,
            "complete": true,
            "claim": "10-Q 2026-08-05 cover: ARRY / Common stock, $0.001 par value / Nasdaq Global Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-20-251336",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000119312520251336/d82970ds1.htm",
            "sha256": "4cd860e4e01700b246815e5f9c648ce31e5d50630c38d9c85110d70c2737e1c7",
            "sha256Normalized": "4cd860e4e01700b246815e5f9c648ce31e5d50630c38d9c85110d70c2737e1c7",
            "bytesRead": 1709215,
            "complete": true,
            "claim": "er share will be between $ and $ . We intend to list our common stock on The Nasdaq Capital Market (“Nasdaq”) under the symbol “ARRY.” We are an “emerging growth company” as defined under the U.S. federal securities laws, and, as such, may elect to comply with certain reduced pub"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-20-305718",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000119312520305718/d158151ds1.htm",
            "sha256": "25179aec0988e3df4f162a4d0ecd14fecf8f5b8d25b6c4e0f9c293253d689669",
            "sha256Normalized": "25179aec0988e3df4f162a4d0ecd14fecf8f5b8d25b6c4e0f9c293253d689669",
            "bytesRead": 1837056,
            "complete": true,
            "claim": "S-1 2020-11-30: closing price $47.11 on 2020-11-27"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-161033",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000119312522161033/d353389d424b3.htm",
            "sha256": "a02d82a7e47e1b06185e3e21a4d69c0bf678c640982fe3cac5592f12a7e134cb",
            "sha256Normalized": "a02d82a7e47e1b06185e3e21a4d69c0bf678c640982fe3cac5592f12a7e134cb",
            "bytesRead": 87535,
            "complete": true,
            "claim": "424B3 2022-05-26: closing price $8.87 on 2022-05-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-161028",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000119312522161028/d319208d424b3.htm",
            "sha256": "aaa8f45d6e8d4d0e48de6039937912db700c4826663418edd73f0e05e8158ecb",
            "sha256Normalized": "aaa8f45d6e8d4d0e48de6039937912db700c4826663418edd73f0e05e8158ecb",
            "bytesRead": 87895,
            "complete": true,
            "claim": "424B3 2022-05-26: closing price $8.87 on 2022-05-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-150149",
            "url": "https://www.sec.gov/Archives/edgar/data/1820721/000119312522150149/d319208ds1.htm",
            "sha256": "57fd1576eb3fc2831ca5fdef1bc398841282df4d0f504fc14a3e704c0d8f1de3",
            "sha256Normalized": "57fd1576eb3fc2831ca5fdef1bc398841282df4d0f504fc14a3e704c0d8f1de3",
            "bytesRead": 177216,
            "complete": true,
            "claim": "S-1 2022-05-13: closing price $8.87 on 2022-05-06"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-11-27",
            "rawPrice": 47.11,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-11-27",
              47.11
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-20-305718",
            "sha256": "25179aec0988e3df4f162a4d0ecd14fecf8f5b8d25b6c4e0f9c293253d689669",
            "quote": "k is listed on The Nasdaq Global Market (“Nasdaq”) under the symbol “ARRY.” The last reported sale price of our common stock on November 27, 2020 was $47.11 per share. We are a"
          },
          {
            "date": "2022-05-06",
            "rawPrice": 8.87,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-05-06",
              8.87
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-161033",
            "sha256": "a02d82a7e47e1b06185e3e21a4d69c0bf678c640982fe3cac5592f12a7e134cb",
            "quote": "k is listed on The Nasdaq Global Market (“Nasdaq”) under the symbol “ARRY.” The last reported sale price of our common stock on May 6, 2022 was $8.87 per share. Investin"
          },
          {
            "date": "2022-05-06",
            "rawPrice": 8.87,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-05-06",
              8.87
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-161028",
            "sha256": "aaa8f45d6e8d4d0e48de6039937912db700c4826663418edd73f0e05e8158ecb",
            "quote": "k is listed on The Nasdaq Global Market (“Nasdaq”) under the symbol “ARRY.” The last reported sale price of our common stock on May 6, 2022 was $8.87 per share. Investin"
          },
          {
            "date": "2022-05-06",
            "rawPrice": 8.87,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-05-06",
              8.87
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-150149",
            "sha256": "57fd1576eb3fc2831ca5fdef1bc398841282df4d0f504fc14a3e704c0d8f1de3",
            "quote": "k is listed on The Nasdaq Global Market (“Nasdaq”) under the symbol “ARRY.” The last reported sale price of our common stock on May 6, 2022 was $8.87 per share. Investin"
          }
        ]
      },
      {
        "securityId": "ref_AVIR",
        "ticker": "AVIR",
        "cik": "0001593899",
        "issuer": "Atea Pharmaceuticals, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:AVIR:2020-10-30",
        "masterRowSet": [
          "tiingo:NASDAQ:AVIR:2016-01-04",
          "tiingo:NASDAQ:AVIR:2020-10-30"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-10-30",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-10-30",
          "checkedTo": "2026-10-23",
          "bars": 313,
          "pointsSha256": "0f14ae766c975107f7c2cf6a85fa2083482b30811566bea135879e969eb3e702"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-347021",
          "filingDate": "2026-08-12",
          "sha256": "f9599339b5e96dfee91523096acf514c1b59c12fc1d8b3e39b785889068b1341"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2021-12-31",
          "lastMatch": "2021-12-31",
          "maxGapDays": 1685
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-347021",
            "url": "https://www.sec.gov/Archives/edgar/data/1593899/000119312526347021/avir-20260630.htm",
            "sha256": "f9599339b5e96dfee91523096acf514c1b59c12fc1d8b3e39b785889068b1341",
            "sha256Normalized": "8593ad3890007c691d341fe1ae53025abfbcec54b36bdd0adb3ea0caecce5c79",
            "bytesRead": 2654102,
            "complete": true,
            "claim": "10-Q 2026-08-12 cover: AVIR / Common Stock, $0.001 par value per share / The Nasdaq Global Select Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-20-267199",
            "url": "https://www.sec.gov/Archives/edgar/data/1593899/000119312520267199/d913778ds1.htm",
            "sha256": "00863a73d6aed422c67fe9cc294824f93023207fb73995db1ab0fe5bda938608",
            "sha256Normalized": "00863a73d6aed422c67fe9cc294824f93023207fb73995db1ab0fe5bda938608",
            "bytesRead": 2097152,
            "complete": false,
            "claim": " $ per share. After pricing of the offering, we expect that the shares will trade on The Nasdaq Global Market under the symbol “AVIR.” We are an “emerging growth company” under the federal securities laws and, as such, are subject to reduced public company disclosure standards. S"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-134263",
            "url": "https://www.sec.gov/Archives/edgar/data/1593899/000119312522134263/d278730ddef14a.htm",
            "sha256": "18a37b3f6af02ad933919b6f05562c13d1d4797925e87d8737d53596d3dd711f",
            "sha256Normalized": "18a37b3f6af02ad933919b6f05562c13d1d4797925e87d8737d53596d3dd711f",
            "bytesRead": 628065,
            "complete": true,
            "claim": "DEF 14A 2022-04-29: closing price $8.94 on 2021-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 8.94,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              8.94
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-134263",
            "sha256": "18a37b3f6af02ad933919b6f05562c13d1d4797925e87d8737d53596d3dd711f",
            "quote": "g acceleration as of December 31, 2021, by the difference between the per share closing price of the Company’s stock as of December 31, 2021 of $8.94 and the per share e"
          }
        ]
      },
      {
        "securityId": "ref_BBAI",
        "ticker": "BBAI",
        "cik": "0001836981",
        "issuer": "BigBear.ai Holdings, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:BBAI:2021-12-17",
        "masterRowSet": [
          "tiingo:NYSE:BBAI:2021-04-05",
          "tiingo:NYSE:BBAI:2021-12-17"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, $0.0001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-12-17",
        "validTo": null,
        "intervalBasis": [
          "SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-12-17",
          "checkedTo": "2026-10-23",
          "bars": 254,
          "pointsSha256": "06db89b2cdfbcaff87be9e8adc61e02e884afc890d75cae2cf5c7e686b6ff422"
        },
        "lastConfirmedCover": {
          "accession": "0001836981-26-000064",
          "filingDate": "2026-07-30",
          "sha256": "bbd4eba7014942003393dcad0747b5d146d7e954e42219ccdac0d6dac319634f"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2021-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001836981-26-000064",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000183698126000064/bbai-20260630.htm",
            "sha256": "bbd4eba7014942003393dcad0747b5d146d7e954e42219ccdac0d6dac319634f",
            "sha256Normalized": "158847f844562b43aae5a0ab438041969f52c97ade7d456d3e639d942ae0e693",
            "bytesRead": 2466896,
            "complete": true,
            "claim": "10-Q 2026-07-30 cover: BBAI / Common stock, $0.0001 par value / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-21-350338",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000119312521350338/d272491d8k.htm",
            "sha256": "7b5dcb7a7cec7ef2e1978f6e4ec55d364c87fc97206607fa37e3ce6a646e607f",
            "sha256Normalized": "4bdb2c72bb9fce32124635f06da1fe5b0c0262a04292a7539ebc5c02a98fdc4d",
            "bytesRead": 28746,
            "complete": true,
            "claim": "BBAI / Common Stock, $0.0001 par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-177776",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000119312522177776/d345953ds1.htm",
            "sha256": "85a0650c2f1a3f022f5b5ee8a196e1de1e302ec2319d1dfd3004f9e898196ea4",
            "sha256Normalized": "85a0650c2f1a3f022f5b5ee8a196e1de1e302ec2319d1dfd3004f9e898196ea4",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "S-1 2022-06-21: closing price $5.66 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-157492",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000119312522157492/d271170d424b3.htm",
            "sha256": "45c8f2df342d312fe2dd06175bb4d6bb50fd3cd5f4e1e1051709fc2fc3672eb1",
            "sha256Normalized": "45c8f2df342d312fe2dd06175bb4d6bb50fd3cd5f4e1e1051709fc2fc3672eb1",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2022-05-23: closing price $5.66 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-22-014101",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000162828022014101/bigbear-proxystatement2022.htm",
            "sha256": "80265db6fea42cba1edf21c4204e0543c6fd1b4397aaf374dd1e57d5ef6aabd3",
            "sha256Normalized": "c72a799f9fd56c80e629a1debd013f771d6a7bd848944f6ec2250697e8fbca00",
            "bytesRead": 528220,
            "complete": true,
            "claim": "DEF 14A 2022-05-12: closing price $5.66 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-23-019598",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000162828023019598/bigbear-proxystatement2023.htm",
            "sha256": "d6e2ab81c16c49d220a408a053dc1917726fefd5438090a224e35b5821aae341",
            "sha256Normalized": "4c92698206e061e5ed8c3f41d42f6920407e94e198bd6eefea8204c5ae31656e",
            "bytesRead": 733807,
            "complete": true,
            "claim": "DEF 14A 2023-05-24: closing price $0.67 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-24-018684",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000162828024018684/bigbear-proxystatement2024.htm",
            "sha256": "fd1bd92aae7d7293ffb15ca2e7ff416613e1bedcfe456271884b79f11f202a60",
            "sha256Normalized": "cc9c5d42039292eb8657decd862e9a3c488738f06804017bde454be4e6786fed",
            "bytesRead": 582751,
            "complete": true,
            "claim": "DEF 14A 2024-04-26: closing price $2.14 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001836981-26-000028",
            "url": "https://www.sec.gov/Archives/edgar/data/1836981/000183698126000028/bbai-20260428.htm",
            "sha256": "2ae42df98f6b67c59d9a51322e0feddf7a80e50c1b38f44b368989539da65f77",
            "sha256Normalized": "b7509c0e148a263fb1fd6502c6f7c61e2a90e36eb9830f5940414f2537c7e7c2",
            "bytesRead": 960469,
            "complete": true,
            "claim": "DEF 14A 2026-04-28: closing price $5.4 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 5.66,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              5.66
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-177776",
            "sha256": "85a0650c2f1a3f022f5b5ee8a196e1de1e302ec2319d1dfd3004f9e898196ea4",
            "quote": "m. (9) Calculated by multiplying the number of RSUs that have not vested by the closing price of the Company’s common stock as reported on the NYSE on December 31, 2021 of $5.66. Additional Narrati"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 5.66,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              5.66
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-157492",
            "sha256": "45c8f2df342d312fe2dd06175bb4d6bb50fd3cd5f4e1e1051709fc2fc3672eb1",
            "quote": "m. (9) Calculated by multiplying the number of RSUs that have not vested by the closing price of the Company’s common stock as reported on the NYSE on December 31, 2021 of $5.66. Additional Narrati"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 5.66,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              5.66
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-22-014101",
            "sha256": "80265db6fea42cba1edf21c4204e0543c6fd1b4397aaf374dd1e57d5ef6aabd3",
            "quote": "m. (9) Calculated by multiplying the number of RSUs that have not vested by the closing price of the Company’s common stock as reported on the NYSE on December 31, 2021 of $5.66. Additional Narrati"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 0.67,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              0.6737
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1.005522,
            "accession": "0001628280-23-019598",
            "sha256": "d6e2ab81c16c49d220a408a053dc1917726fefd5438090a224e35b5821aae341",
            "quote": " — (1) Calculated by multiplying the number of RSUs that have not vested by the closing price of the Company’s common stock as reported on the NYSE on December 30, 2022 of $0.67. Incentive Unit Awa"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 2.14,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              2.14
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-24-018684",
            "sha256": "fd1bd92aae7d7293ffb15ca2e7ff416613e1bedcfe456271884b79f11f202a60",
            "quote": "22 (1) Calculated by multiplying the number of PSUs that have not vested by the closing price of the Company’s common stock as reported on the NYSE on December 29, 2023 of $2.14. (2) Mr. Laudermilc"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 5.4,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              5.4
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001836981-26-000028",
            "sha256": "2ae42df98f6b67c59d9a51322e0feddf7a80e50c1b38f44b368989539da65f77",
            "quote": "52 — 1. Calculated by multiplying the number of PSUs that had not vested by the closing price of the Company’s common stock as reported on the NYSE on December 31, 2025 of $5.40. 2. Ms. Peffer's PS"
          }
        ]
      },
      {
        "securityId": "ref_BEAM",
        "ticker": "BEAM",
        "cik": "0001745999",
        "issuer": "Beam Therapeutics Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:BEAM:2020-02-06",
        "masterRowSet": [
          "tiingo:NASDAQ:BEAM:1977-01-03",
          "tiingo:NASDAQ:BEAM:2020-02-06"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-05-01",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "CONCATENATION_GUARD"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-05-01",
          "checkedTo": "2026-10-23",
          "bars": 339,
          "pointsSha256": "4863617400d481b96cefcad6b828bdbf938b6f9a6ccc9749e2332491d635276b"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-331541",
          "filingDate": "2026-08-04",
          "sha256": "9907210b1370e95b6a0dc85df81af613762d5143f7d8d4e75a3be960c537cfe7"
        },
        "anchorGaps": {
          "matchDates": 6,
          "firstMatch": "2020-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 434
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-331541",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000119312526331541/beam-20260630.htm",
            "sha256": "9907210b1370e95b6a0dc85df81af613762d5143f7d8d4e75a3be960c537cfe7",
            "sha256Normalized": "c2ad71ae777c4503b83a65c3354522633da8760b9c5a68bd5b3db476639fbe2b",
            "bytesRead": 2778158,
            "complete": true,
            "claim": "10-Q 2026-08-04 cover: BEAM / Common Stock, par value $0.01 per share / Nasdaq Global Select Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-20-010041",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000119312520010041/d221975ds1a.htm",
            "sha256": "b4c59d85c92df41ac442f928b32aeb695547cc94669f7424067560809a8d803e",
            "sha256Normalized": "b4c59d85c92df41ac442f928b32aeb695547cc94669f7424067560809a8d803e",
            "bytesRead": 2097152,
            "complete": false,
            "claim": " to be between $ and $ per share. We have applied for listing of our common stock on The Nasdaq Global Market under the symbol BEAM. We are an “emerging growth company” under federal securities laws and are subject to reduced public company reporting requirements. See “Prospectus"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001564590-21-020335",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000156459021020335/beam-def14a_20210609.htm",
            "sha256": "36d28e533aade84dc5fb48215de74053b1c4a52cbeb3e81fe3d02f4e31297049",
            "sha256Normalized": "49e6de0f32ab5c44d10f0b05487c63632602c0309eddfe17591d4363124a9f0a",
            "bytesRead": 830944,
            "complete": true,
            "claim": "DEF 14A 2021-04-23: closing price $81.64 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-22-006016",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000095017022006016/beam_2022_notice_and_pro.htm",
            "sha256": "1c071f310165e9ab06fde4ec465abc8378bfc20e3dbd018f094c63191ddf21d4",
            "sha256Normalized": "0be795bec963d918b89ba2ead3a912a9d030d5f102b846542479f45bc84328ca",
            "bytesRead": 1355503,
            "complete": true,
            "claim": "DEF 14A 2022-04-22: closing price $79.69 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-23-013837",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000095017023013837/beam-20230421.htm",
            "sha256": "f8af83e7b9286adc5b004040ea0f6086243905f7bd59c8138a487a4cef028fde",
            "sha256Normalized": "e65896c00b5ed13d0364de4250fba14fcc8f89aeda696a4de67b97649fb597f6",
            "bytesRead": 1653933,
            "complete": true,
            "claim": "DEF 14A 2023-04-21: closing price $39.11 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-046017",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000095017024046017/beam-20240419.htm",
            "sha256": "a7e4d17ea27a36c72c9cb161e8fab31c427f1b2feb05bfd225cd3d414fc7f70f",
            "sha256Normalized": "b1f6fa316c6d702c5a466e6fb09ebd187aa560bd846e4a8b63cb5a67ef37249f",
            "bytesRead": 1378709,
            "complete": true,
            "claim": "DEF 14A 2024-04-19: closing price $27.22 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-051106",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000119312525051106/d847224d424b5.htm",
            "sha256": "e107af25d39c7d47657a01439d2dfde0fab8e5ea039701b6bb1def13058f4db6",
            "sha256Normalized": "e107af25d39c7d47657a01439d2dfde0fab8e5ea039701b6bb1def13058f4db6",
            "bytesRead": 468707,
            "complete": true,
            "claim": "424B5 2025-03-10: closing price $28.48 on 2025-03-07"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-050343",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000119312525050343/d847224d424b5.htm",
            "sha256": "7963b335e9ec6ad8321b2d4c0c1e493d09aa4ac0bf7963e0b29a64724053a462",
            "sha256Normalized": "7963b335e9ec6ad8321b2d4c0c1e493d09aa4ac0bf7963e0b29a64724053a462",
            "bytesRead": 484083,
            "complete": true,
            "claim": "424B5 2025-03-10: closing price $28.48 on 2025-03-07"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-161512",
            "url": "https://www.sec.gov/Archives/edgar/data/1745999/000119312526161512/beam-20260417.htm",
            "sha256": "3dce440fac2cb121772c2f35d072817c885deb0ef2bf88477003929b151ffb48",
            "sha256Normalized": "9d620357eac4734af6e6395a9201043043398585e8972eb48ba5d97d8d2f87b2",
            "bytesRead": 1754902,
            "complete": true,
            "claim": "DEF 14A 2026-04-17: closing price $27.72 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 81.64,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              81.64
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001564590-21-020335",
            "sha256": "36d28e533aade84dc5fb48215de74053b1c4a52cbeb3e81fe3d02f4e31297049",
            "quote": ") Terry-Ann Burrell 122,773 260,168 — 13.68 8/31/2029 (15) — — (1) Based on the closing price of a share of our common stock on December 31, 2020 ($81.64). (2) Represents 22"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 79.69,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              79.69
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-22-006016",
            "sha256": "1c071f310165e9ab06fde4ec465abc8378bfc20e3dbd018f094c63191ddf21d4",
            "quote": ".68 8/31/2029 (20) — — 6,562 28,438 — 80.04 3/31/2031 (21) — — (1) Based on the closing price of a share of our common stock on December 31, 2021 ($79.69). (2) Represents 22"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 39.11,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              39.11
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-23-013837",
            "sha256": "f8af83e7b9286adc5b004040ea0f6086243905f7bd59c8138a487a4cef028fde",
            "quote": "031 (24) — — 6,875 23,125 — 69.21 1/31/2032 (25) — — (1) Based on the per share closing price of a share of our common stock on the Nasdaq Global Select Market on December 30, 2022 ($39.11). (2) Represents 69"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 27.22,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              27.22
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-046017",
            "sha256": "a7e4d17ea27a36c72c9cb161e8fab31c427f1b2feb05bfd225cd3d414fc7f70f",
            "quote": "032 (50) — — 9,166 30,834 — 43.45 1/31/2033 (51) — — (1) Based on the per share closing price of a share of our common stock on the Nasdaq Global Select Market on December 29, 2023 ($27.22). (2) Represents 69"
          },
          {
            "date": "2025-03-07",
            "rawPrice": 28.48,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-03-07",
              28.48
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-051106",
            "sha256": "e107af25d39c7d47657a01439d2dfde0fab8e5ea039701b6bb1def13058f4db6",
            "quote": "ades on the Nasdaq Global Select Market (“Nasdaq”) under the symbol “BEAM.” The last reported sale of our common stock on Nasdaq on March 7, 2025 was $28.48 per share. There is"
          },
          {
            "date": "2025-03-07",
            "rawPrice": 28.48,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-03-07",
              28.48
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-050343",
            "sha256": "7963b335e9ec6ad8321b2d4c0c1e493d09aa4ac0bf7963e0b29a64724053a462",
            "quote": "ades on the Nasdaq Global Select Market (“Nasdaq”) under the symbol “BEAM.” The last reported sale of our common stock on Nasdaq on March 7, 2025 was $28.48 per share. There is"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 27.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              27.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-161512",
            "sha256": "3dce440fac2cb121772c2f35d072817c885deb0ef2bf88477003929b151ffb48",
            "quote": "34 (53) — — 12,604 42,396 — 25.92 1/31/2035 (54) — — (1) Based on the per share closing price of a share of our common stock on the Nasdaq Global Select Market on December 31, 2025 ($27.72). (2) Represents 56"
          }
        ]
      },
      {
        "securityId": "ref_BEAT",
        "ticker": "BEAT",
        "cik": "0001779372",
        "issuer": "HeartBeam, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:BEAT:2021-11-11",
        "masterRowSet": [
          "tiingo:NASDAQ:BEAT:2008-03-19",
          "tiingo:NASDAQ:BEAT:2021-11-11"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-11-12",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-11-12",
          "checkedTo": "2026-10-23",
          "bars": 259,
          "pointsSha256": "f5020bd00d4a4e7d772dc1265499475858b4489d7564a3ee1fbb9b39a3ba9b0a"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-349121",
          "filingDate": "2026-08-13",
          "sha256": "ddcbacde146dd570778555f3f23b7b2f2b11bee3a56de488747a20d1aac6b173"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2023-06-30",
          "lastMatch": "2024-06-30",
          "maxGapDays": 774
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-349121",
            "url": "https://www.sec.gov/Archives/edgar/data/1779372/000119312526349121/beat-20260630.htm",
            "sha256": "ddcbacde146dd570778555f3f23b7b2f2b11bee3a56de488747a20d1aac6b173",
            "sha256Normalized": "df58190e22afecce7cb728794ead8d2a3adc9d8374d75b0fafb0e3c0de814d1a",
            "bytesRead": 1594871,
            "complete": true,
            "claim": "10-Q 2026-08-13 cover: BEAT / Common Stock / NASDAQ"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001213900-21-046840",
            "url": "https://www.sec.gov/Archives/edgar/data/1779372/000121390021046840/fs12021_heartbeaminc.htm",
            "sha256": "bb5aa602c3ac40b9e9abfb58a932b2c38bca38d0f9df4d5da84f9818354e4bc2",
            "sha256Normalized": "bb5aa602c3ac40b9e9abfb58a932b2c38bca38d0f9df4d5da84f9818354e4bc2",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "rrants. We have applied to have our Common Stock and Warrants listed on the NASDAQ Capital Market, or NASDAQ, under the symbol “BEAT” and “ ”, respectively. The Common Stock and Warrants comprising the Units will begin separate trading immediately upon issuance of the Units. Inve"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001779372-24-000002",
            "url": "https://www.sec.gov/Archives/edgar/data/1779372/000177937224000002/beat-20231231.htm",
            "sha256": "6b15315e447a1e528e040c784a2e03b8e0dad722f3ab14b2ccd81f9a69571620",
            "sha256Normalized": "01867e627c2c9ef54f7e2d12f0c3396e4b6d5badf4e8f6b1f5fe60105d76841d",
            "bytesRead": 1324086,
            "complete": true,
            "claim": "10-K 2024-03-20: closing price $2.41 on 2023-06-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-25-012614",
            "url": "https://www.sec.gov/Archives/edgar/data/1779372/000162828025012614/beat-20241231.htm",
            "sha256": "bf800c49a1f9082e01eaf55c1222d498468a8c390452a335161bfd65dbe2fc01",
            "sha256Normalized": "121a7d8ec30e0018428c04faa971a8beb2be69b17cfa2243828775eb4d8b4eff",
            "bytesRead": 1350362,
            "complete": true,
            "claim": "10-K 2025-03-13: closing price $2.57 on 2024-06-30"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-06-30",
            "rawPrice": 2.41,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-06-30",
              2.41
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001779372-24-000002",
            "sha256": "6b15315e447a1e528e040c784a2e03b8e0dad722f3ab14b2ccd81f9a69571620",
            "quote": "rities held by non-affiliates was $51,458,385 as of June 30, 2023, based on the closing price of $2.41 for the registrant’s common stock on June 30, 2023. As of March 19, 20"
          },
          {
            "date": "2024-06-30",
            "rawPrice": 2.57,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-06-28",
              2.57
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-25-012614",
            "sha256": "bf800c49a1f9082e01eaf55c1222d498468a8c390452a335161bfd65dbe2fc01",
            "quote": "ities held by non-affiliates was $ 55,733,467 as of June 30, 2024, based on the closing price of $2.57 for the registrant’s common stock on June 30, 2024. As of March 11, 20"
          }
        ]
      },
      {
        "securityId": "ref_BHVN",
        "ticker": "BHVN",
        "cik": "0001935979",
        "issuer": "Biohaven Ltd.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:BHVN:2022-09-23",
        "masterRowSet": [
          "tiingo:NYSE:BHVN:2017-05-04",
          "tiingo:NYSE:BHVN:2022-09-23"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares, no par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-11-11",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-11-11",
          "checkedTo": "2026-10-23",
          "bars": 207,
          "pointsSha256": "75d02d11b63ac3fabdfe54ab49dbaf5ab900ff121264d6ef679c8bf1cb09d12c"
        },
        "lastConfirmedCover": {
          "accession": "0001935979-26-000066",
          "filingDate": "2026-08-10",
          "sha256": "d7e715fe4be7b37aa58b9dc5253b5228f07de84f9e192c9730424a48f8c4b948"
        },
        "anchorGaps": {
          "matchDates": 6,
          "firstMatch": "2023-06-30",
          "lastMatch": "2026-05-01",
          "maxGapDays": 551
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001935979-26-000066",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597926000066/bhvn-20260630.htm",
            "sha256": "d7e715fe4be7b37aa58b9dc5253b5228f07de84f9e192c9730424a48f8c4b948",
            "sha256Normalized": "c0532339d89abf5024de34f4ce5244dbaac5359319f396723a57ce2b9f5c6f4a",
            "bytesRead": 1361264,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: BHVN / Common Shares, no par value / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001935979-22-000009",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597922000009/bhvn-20221109.htm",
            "sha256": "71871b9413d9eb4ce5e88acaf8a95f60107cabeb467a743235636a5cb7f53e55",
            "sha256Normalized": "b4d018fcdfe2e759cc389dfc6992ae85911f4c5ed52adc9cb95efd596f6813a6",
            "bytesRead": 33545,
            "complete": true,
            "claim": "BHVN / Common Shares, no par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001935979-24-000010",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597924000010/bhvn-20231231.htm",
            "sha256": "7010feaeec73e6d6747c9a3cf345e38c00f2bc219a06d5ffd68ea13a0af4b5ea",
            "sha256Normalized": "85ce63162d384a537d169193e5d4cf6ce6cd5b23aaddc7c0c2f4553176cc7372",
            "bytesRead": 2338376,
            "complete": true,
            "claim": "10-K 2024-02-29: closing price $23.92 on 2023-06-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-23-033506",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000162828023033506/a2023bhvn-atmprospectussup.htm",
            "sha256": "937acd98dd51de05b48d8c49fe531cc046fd04e7a7347a49eb6b26c29ec752c4",
            "sha256Normalized": "0869f931b6947048aa9449e1913c6a10b94cd19c1fc4263421a8a5c8294926bc",
            "bytesRead": 527937,
            "complete": true,
            "claim": "424B5 2023-10-02: closing price $26.01 on 2023-09-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001935979-24-000026",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597924000026/bhvn-20240314.htm",
            "sha256": "44addc1609ac112512065d95fbf83a4dd804dc204f2b8d3677be608f94723280",
            "sha256Normalized": "8620de84b02cefd6f23fca1ee1577b920148f70b4263a3c2668c4bd2cbe4b456",
            "bytesRead": 657909,
            "complete": true,
            "claim": "DEF 14A 2024-03-18: closing price $42.8 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001935979-25-000015",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597925000015/bhvn-20241231.htm",
            "sha256": "7c54b113e45ad83f248a363129d9b4659fed00d74e2178acd0a4e3cb052f2840",
            "sha256Normalized": "99f1379ba7a43114e4fcbee281402ad9e9433314614232b2efefb70d277b9ab9",
            "bytesRead": 2469045,
            "complete": true,
            "claim": "10-K 2025-03-03: closing price $34.71 on 2024-06-28"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001935979-26-000028",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000193597926000028/bhvn-20260313.htm",
            "sha256": "71f3d154ee6d67f2ce1e847b82d60279749a5276940a40d0e86846d00bc99249",
            "sha256Normalized": "e36dad318d6c191f30c2e33029578ae969493aaecef178ccc3e9bcbd763595e2",
            "bytesRead": 720342,
            "complete": true,
            "claim": "DEF 14A 2026-03-13: closing price $11.29 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-029924",
            "url": "https://www.sec.gov/Archives/edgar/data/1935979/000162828026029924/biohaven-424b5.htm",
            "sha256": "562850b3a4c3dd15cb5870edd9b06ca9f4f4035881229ed8fd795ffee42e5335",
            "sha256Normalized": "5de757d690fe9b9ee6f26b0b0ffad8c477f22050e0a6d4b146adb0a9b3ecbce6",
            "bytesRead": 528356,
            "complete": true,
            "claim": "424B5 2026-05-04: closing price $9.63 on 2026-05-01"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-06-30",
            "rawPrice": 23.92,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-06-30",
              23.92
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001935979-24-000010",
            "sha256": "7010feaeec73e6d6747c9a3cf345e38c00f2bc219a06d5ffd68ea13a0af4b5ea",
            "quote": "nt's most recently completed second fiscal quarter, June 30, 2023, based on the last reported sale price of the registrant's common shares on the New York Stock Exchange on June 30, 2023 of $23.92, was $ 986.7 millio"
          },
          {
            "date": "2023-09-29",
            "rawPrice": 26.01,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-09-29",
              26.01
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-23-033506",
            "sha256": "937acd98dd51de05b48d8c49fe531cc046fd04e7a7347a49eb6b26c29ec752c4",
            "quote": "n shares are listed on the New York Stock Exchange under the symbol “BHVN”. The last reported sale price of our common shares on September 29, 2023 was $26.01 per common share. S"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 42.8,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              42.8
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001935979-24-000026",
            "sha256": "44addc1609ac112512065d95fbf83a4dd804dc204f2b8d3677be608f94723280",
            "quote": "wards, assuming the acceleration occurred on December 31, 2023 and based on the closing price of our common shares on the NYSE of $42.80 on December 29, 2023 (the final trading "
          },
          {
            "date": "2024-06-28",
            "rawPrice": 34.71,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-06-28",
              34.71
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001935979-25-000015",
            "sha256": "7c54b113e45ad83f248a363129d9b4659fed00d74e2178acd0a4e3cb052f2840",
            "quote": "nt's most recently completed second fiscal quarter, June 30, 2024, based on the last reported sale price of the registrant's common shares on the New York Stock Exchange on June 28, 2024 of $34.71, was $ 2.239 billio"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 11.29,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              11.29
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001935979-26-000028",
            "sha256": "71f3d154ee6d67f2ce1e847b82d60279749a5276940a40d0e86846d00bc99249",
            "quote": " RSUs, assuming the acceleration occurred on December 31, 2025 and based on the closing price of our common shares on the NYSE of $11.29 on December 31, 2025 (the final trading "
          },
          {
            "date": "2026-05-01",
            "rawPrice": 9.63,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-05-01",
              9.63
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-029924",
            "sha256": "562850b3a4c3dd15cb5870edd9b06ca9f4f4035881229ed8fd795ffee42e5335",
            "quote": "n shares are listed on the New York Stock Exchange under the symbol “BHVN”. The last reported sale price of our common shares on May 1, 2026 was $9.63 per common share. S"
          }
        ]
      },
      {
        "securityId": "ref_BNL",
        "ticker": "BNL",
        "cik": "0001424182",
        "issuer": "Broadstone Net Lease, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:BNL:2021-03-22",
        "masterRowSet": [
          "tiingo:NYSE:BNL:2020-09-17",
          "tiingo:NYSE:BNL:2021-03-22"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.00025 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-03-26",
        "validTo": null,
        "intervalBasis": [
          "SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-03-26",
          "checkedTo": "2026-10-23",
          "bars": 292,
          "pointsSha256": "1961873c5ff983079cc7241ede63539898bf4a9df0179fb4bc9bd34dd4da552e"
        },
        "lastConfirmedCover": {
          "accession": "0001424182-26-000037",
          "filingDate": "2026-04-30",
          "sha256": "60e6e223f7f3e8560e7365c21626ab899778bbffb6840768de42909e97195e93"
        },
        "anchorGaps": {
          "matchDates": 8,
          "firstMatch": "2021-08-20",
          "lastMatch": "2026-08-05",
          "maxGapDays": 549
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001424182-26-000037",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000142418226000037/bnl-20260331.htm",
            "sha256": "60e6e223f7f3e8560e7365c21626ab899778bbffb6840768de42909e97195e93",
            "sha256Normalized": "257196672c656c04fef27515f9b1f4246079cf602412f0512b553cfc76bca7a6",
            "bytesRead": 2074365,
            "complete": true,
            "claim": "10-Q 2026-04-30 cover: BNL / Common Stock, $0.00025 par value / The New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001564590-20-051393",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000156459020051393/ck1424182-10q_20200930.htm",
            "sha256": "9f8b029a70af011df0248e0f79ba79de35f2f9fbf06c5949c00a3ea7a6343821",
            "sha256Normalized": "9f8b029a70af011df0248e0f79ba79de35f2f9fbf06c5949c00a3ea7a6343821",
            "bytesRead": 6291456,
            "complete": false,
            "claim": "BNL / Common Stock, $0.00025 par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-21-254261",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000119312521254261/d209695d424b5.htm",
            "sha256": "8199d3996a46439b42b8e63fa72e5169e16d609650e23119dca43dc1ea3e68a0",
            "sha256Normalized": "8199d3996a46439b42b8e63fa72e5169e16d609650e23119dca43dc1ea3e68a0",
            "bytesRead": 649166,
            "complete": true,
            "claim": "424B5 2021-08-24: closing price $26.23 on 2021-08-20"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-085123",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000119312522085123/d242877ddef14a.htm",
            "sha256": "c4ba801cff6684ec606b8ce38b7635d641c9300c7a13d0e3c7c84770fba86e59",
            "sha256Normalized": "c4ba801cff6684ec606b8ce38b7635d641c9300c7a13d0e3c7c84770fba86e59",
            "bytesRead": 1060538,
            "complete": true,
            "claim": "DEF 14A 2022-03-25: closing price $24.82 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-23-009799",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000095017023009799/bnl-20230324.htm",
            "sha256": "7798023e9090e307c6e38affab68136458eb42589a4f38903d1463de6d3e6eba",
            "sha256Normalized": "7798023e9090e307c6e38affab68136458eb42589a4f38903d1463de6d3e6eba",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2023-03-27: closing price $16.21 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-018725",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000095017024018725/bnl-20231231.htm",
            "sha256": "ecef277b5de90f18cec8cf33a9560846e35157d1634d5e82fef80f799e3166cb",
            "sha256Normalized": "ecef277b5de90f18cec8cf33a9560846e35157d1634d5e82fef80f799e3166cb",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2024-02-22: closing price $15.44 on 2023-06-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-035354",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000095017024035354/bnl-20240322.htm",
            "sha256": "9121f956a437f96cdee5fff8d534f76ab1547969c7f05b15b8ec20ce60c32081",
            "sha256Normalized": "d473c880a6340014e28a79b4d9a171f18d0563c0f304912cef4333d98a70e51c",
            "bytesRead": 1858271,
            "complete": true,
            "claim": "DEF 14A 2024-03-22: closing price $17.22 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-25-024123",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000095017025024123/bnl-20241231.htm",
            "sha256": "6bf913d072ddba481f8e2f02311d3b5b91d3118579a5893d0c5b27d4be7ba8ab",
            "sha256Normalized": "6bf913d072ddba481f8e2f02311d3b5b91d3118579a5893d0c5b27d4be7ba8ab",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2025-02-20: closing price $15.87 on 2024-06-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001424182-26-000025",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000142418226000025/bnl-20260319.htm",
            "sha256": "d53bc5ac9b244ed1b90248cdb564f26068cb65aa47f67aa04c3ef2859c851309",
            "sha256Normalized": "d53bc5ac9b244ed1b90248cdb564f26068cb65aa47f67aa04c3ef2859c851309",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-03-20: closing price $17.37 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-341264",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000119312526341264/d140928d424b5.htm",
            "sha256": "a7495279e5f803ebb217fcd1f3015bfc1308882ec220c4397d2107169eacffb3",
            "sha256Normalized": "a7495279e5f803ebb217fcd1f3015bfc1308882ec220c4397d2107169eacffb3",
            "bytesRead": 719820,
            "complete": true,
            "claim": "424B5 2026-08-10: closing price $21.2 on 2026-08-05"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-338184",
            "url": "https://www.sec.gov/Archives/edgar/data/1424182/000119312526338184/d140928d424b5.htm",
            "sha256": "0a7ae8b4134fe90c27a211f2ee8e4603ff51079fc5f50742c9553ebf60bf95b3",
            "sha256Normalized": "0a7ae8b4134fe90c27a211f2ee8e4603ff51079fc5f50742c9553ebf60bf95b3",
            "bytesRead": 711368,
            "complete": true,
            "claim": "424B5 2026-08-06: closing price $21.2 on 2026-08-05"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-08-20",
            "rawPrice": 26.23,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-08-20",
              26.33
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1.003812,
            "accession": "0001193125-21-254261",
            "sha256": "8199d3996a46439b42b8e63fa72e5169e16d609650e23119dca43dc1ea3e68a0",
            "quote": " listed on the New York Stock Exchange (the “NYSE”) under the symbol “BNL”. The last reported sale price of our common stock on the NYSE on August 20, 2021 was $26.23 per share. Sales of"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 24.82,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              24.82
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-085123",
            "sha256": "c4ba801cff6684ec606b8ce38b7635d641c9300c7a13d0e3c7c84770fba86e59",
            "quote": "13 — — Sean Cutt (8) 2020 — — — — 2021 — — — — (1) Value based on the per-share closing market price of the Company’s common stock on December 31, 2021, which was $24.82. 49 2022 Proxy Stat"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 16.21,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              16.21
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-23-009799",
            "sha256": "7798023e9090e307c6e38affab68136458eb42589a4f38903d1463de6d3e6eba",
            "quote": " 71,859 - - 2022 3,494 (7) 56,638 1,498 24,283 (1) Value based on the per-share closing market price of the Company’s Common Stock on December 31, 2022, which was $16.21. (2) The number of "
          },
          {
            "date": "2023-06-30",
            "rawPrice": 15.44,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-06-30",
              15.44
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-018725",
            "sha256": "ecef277b5de90f18cec8cf33a9560846e35157d1634d5e82fef80f799e3166cb",
            "quote": "value, held by non-affiliates of the registrant, was $ 2.9 billion based on the last reported sale price of $15.44 per share on the New York Stock Exchange on June 30, 2023. There were 187,707"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 17.22,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              17.22
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-035354",
            "sha256": "9121f956a437f96cdee5fff8d534f76ab1547969c7f05b15b8ec20ce60c32081",
            "quote": "2 29,941 515,584 59,883 1,031,185 2023 — — — — (1) Value based on the per-share closing market price of the Company’s Common Stock on December 29, 2023, which was $17.22. (2) The number of "
          },
          {
            "date": "2024-06-30",
            "rawPrice": 15.87,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-06-28",
              15.87
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-25-024123",
            "sha256": "6bf913d072ddba481f8e2f02311d3b5b91d3118579a5893d0c5b27d4be7ba8ab",
            "quote": "value, held by non-affiliates of the registrant, was $ 3.0 billion based on the last reported sale price of $15.87 per share on the New York Stock Exchange on June 30, 2024. There were 188,798"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 17.37,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              17.37
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001424182-26-000025",
            "sha256": "d53bc5ac9b244ed1b90248cdb564f26068cb65aa47f67aa04c3ef2859c851309",
            "quote": "179,397 2025 18,926 (7) 328,745 12,618 219,175 (1) Value based on the per-share closing market price of the Company’s Common Stock on December 31, 2025, which was $17.37. (2) The number of "
          },
          {
            "date": "2026-08-05",
            "rawPrice": 21.2,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-08-05",
              21.2
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-341264",
            "sha256": "a7495279e5f803ebb217fcd1f3015bfc1308882ec220c4397d2107169eacffb3",
            "quote": " listed on the New York Stock Exchange (the “NYSE”) under the symbol “BNL”. The last reported sale price of our common stock on the NYSE on August 5, 2026 was $21.20 per share. Our arti"
          },
          {
            "date": "2026-08-05",
            "rawPrice": 21.2,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-08-05",
              21.2
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-338184",
            "sha256": "0a7ae8b4134fe90c27a211f2ee8e4603ff51079fc5f50742c9553ebf60bf95b3",
            "quote": " listed on the New York Stock Exchange (the “NYSE”) under the symbol “BNL”. The last reported sale price of our common stock on the NYSE on August 5, 2026 was $21.20 per share. Our arti"
          }
        ]
      },
      {
        "securityId": "ref_BOLT",
        "ticker": "BOLT",
        "cik": "0001641281",
        "issuer": "Bolt Biotherapeutics, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:BOLT:2021-02-05",
        "masterRowSet": [
          "tiingo:NASDAQ:BOLT:1995-02-01",
          "tiingo:NASDAQ:BOLT:2021-02-05"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.00001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-12-15",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-12-15",
          "checkedTo": "2026-10-23",
          "bars": 150,
          "pointsSha256": "0d2f12c89a80703e273bc07aa5df1c137c7141ac4723beefbff28475afac5f53"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-344597",
          "filingDate": "2026-08-11",
          "sha256": "b4864241ef6d4c10cf62826bebef55ccf613472a364d94aa67a165816a0ba24c"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2025-12-12",
          "lastMatch": "2025-12-31",
          "maxGapDays": 223
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-344597",
            "url": "https://www.sec.gov/Archives/edgar/data/1641281/000119312526344597/bolt-20260630.htm",
            "sha256": "b4864241ef6d4c10cf62826bebef55ccf613472a364d94aa67a165816a0ba24c",
            "sha256Normalized": "ac4f705a6b9e49b0684cef19614dc4b5c13dd968175be7d991570b27e458df99",
            "bytesRead": 2184963,
            "complete": true,
            "claim": "10-Q 2026-08-11 cover: BOLT / Common Stock, $0.00001 par value / Nasdaq"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001564590-21-027527",
            "url": "https://www.sec.gov/Archives/edgar/data/1641281/000156459021027527/bolt-8k_20210513.htm",
            "sha256": "157b16954ae7cb0a06b93db281f05a2b3663333ccb53aba2332f069ccf6ed093",
            "sha256Normalized": "b624044171cf9cbb02669043e0d20bb5fbebd858c29db19d44d84b1f7affa48e",
            "bytesRead": 45596,
            "complete": true,
            "claim": "BOLT / Common Stock, par value $0.00001 per share / The Nasdaq Global Select Market"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-104121",
            "url": "https://www.sec.gov/Archives/edgar/data/1641281/000119312526104121/bolt-20251231.htm",
            "sha256": "b9c7a0e57dca24f6b1582b01bdf31c5819bb911fdf70055a8383a928666ec9c5",
            "sha256Normalized": "b9c7a0e57dca24f6b1582b01bdf31c5819bb911fdf70055a8383a928666ec9c5",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2026-03-12: closing price $5.44 on 2025-12-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-186923",
            "url": "https://www.sec.gov/Archives/edgar/data/1641281/000119312526186923/bolt-20260424.htm",
            "sha256": "7c60825dfc886608c335e83d3395428e68f08574425983802e853d058080804a",
            "sha256Normalized": "1fdb01849160d29177ae4aa36a0d5f92ccde3f521770e75f6656e9db273eeff9",
            "bytesRead": 981415,
            "complete": true,
            "claim": "DEF 14A 2026-04-28: closing price $5.468 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-12",
            "rawPrice": 5.44,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-12",
              5.44
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-104121",
            "sha256": "b9c7a0e57dca24f6b1582b01bdf31c5819bb911fdf70055a8383a928666ec9c5",
            "quote": "ny’s common stock to reduce the per-share exercise price of such options to the closing price of the Company’s common stock on the Nasdaq Capital Market on December 12, 2025, which was $ 5.44 (the “Repricing”). "
          },
          {
            "date": "2025-12-31",
            "rawPrice": 5.468,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              5.47
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1.000366,
            "accession": "0001193125-26-186923",
            "sha256": "7c60825dfc886608c335e83d3395428e68f08574425983802e853d058080804a",
            "quote": "ions are satisfied. Market value reflects the value of the RSUs, based upon the closing price of our common stock on December 31, 2025 of $5.468. (4) This stock opt"
          }
        ]
      },
      {
        "securityId": "ref_BTDR",
        "ticker": "BTDR",
        "cik": "0001899123",
        "issuer": "Bitdeer Technologies Group",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:BTDR:2023-04-13",
        "masterRowSet": [
          "tiingo:NASDAQ:BTDR:2021-07-28",
          "tiingo:NASDAQ:BTDR:2023-04-13"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A ordinary shares, par value US$0.0000001",
        "filerType": "FOREIGN_PRIVATE_ISSUER",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-11-17",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-11-17",
          "checkedTo": "2026-10-23",
          "bars": 154,
          "pointsSha256": "13eefaabac6f5e729f45dc614a42e0618905f7e7c8079dc477d2863499662340"
        },
        "lastConfirmedCover": {
          "accession": "0001213900-26-049770",
          "filingDate": "2026-04-30",
          "sha256": "289408a18e6eb297b88c38fd384da6235e05ac4d5ea6cdad89815233aa7fc1d5"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2025-11-12",
          "lastMatch": "2026-02-19",
          "maxGapDays": 99
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001213900-26-049770",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000121390026049770/ea0282628-20f_bitdeer.htm",
            "sha256": "289408a18e6eb297b88c38fd384da6235e05ac4d5ea6cdad89815233aa7fc1d5",
            "sha256Normalized": "289408a18e6eb297b88c38fd384da6235e05ac4d5ea6cdad89815233aa7fc1d5",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "20-F 2026-04-30 cover: BTDR / Class A ordinary shares, par value US$0.0000001 / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001104659-23-047181",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000110465923047181/tm237717-2_20f.htm",
            "sha256": "977edad7dd426bfedbb8777aee224b432acc368a9db76845a63c650517ae87a2",
            "sha256Normalized": "977edad7dd426bfedbb8777aee224b432acc368a9db76845a63c650517ae87a2",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "Combination on April 13, 2023. Our Class A Ordinary Shares commenced trading on the Nasdaq on April 14, 2023, under the symbol “BTDR.” Key Performance Metrics We regularly review a number of metrics, including the key metrics presented below, to evaluate our business and performa"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001213900-25-110978",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000121390025110978/ea0265759-424b5_bitdeer.htm",
            "sha256": "023201cc9f1307a6a0851a6511ab5f8beed82a7ea899449dfec887006793a906",
            "sha256Normalized": "023201cc9f1307a6a0851a6511ab5f8beed82a7ea899449dfec887006793a906",
            "bytesRead": 551239,
            "complete": true,
            "claim": "424B5 2025-11-14: closing price $13.94 on 2025-11-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001213900-25-109593",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000121390025109593/ea0265489-424b5_bitdeer.htm",
            "sha256": "0ce2ebf18f4627a1eac09a73fa6d48571f7d516b7b7c08182b1564dda646ae8a",
            "sha256Normalized": "0ce2ebf18f4627a1eac09a73fa6d48571f7d516b7b7c08182b1564dda646ae8a",
            "bytesRead": 23634,
            "complete": true,
            "claim": "424B5 2025-11-13: closing price $13.94 on 2025-11-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001213900-26-019332",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000121390026019332/ea0277924-424b5_bitdeer.htm",
            "sha256": "5e91837b15bf4d832df391a4c5ec659bf766490bcce9ad8f7c1bfa86a2a2e8cd",
            "sha256Normalized": "5e91837b15bf4d832df391a4c5ec659bf766490bcce9ad8f7c1bfa86a2a2e8cd",
            "bytesRead": 605249,
            "complete": true,
            "claim": "424B5 2026-02-23: closing price $7.94 on 2026-02-19"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001213900-26-018581",
            "url": "https://www.sec.gov/Archives/edgar/data/1899123/000121390026018581/ea0277717-424b5_bitdeer.htm",
            "sha256": "47664ba17ffec81d3d8bc04b3862d8498060fe017757e6c35691f54ac025e9b3",
            "sha256Normalized": "47664ba17ffec81d3d8bc04b3862d8498060fe017757e6c35691f54ac025e9b3",
            "bytesRead": 26737,
            "complete": true,
            "claim": "424B5 2026-02-20: closing price $7.94 on 2026-02-19"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-11-12",
            "rawPrice": 13.94,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-12",
              13.94
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-25-110978",
            "sha256": "023201cc9f1307a6a0851a6511ab5f8beed82a7ea899449dfec887006793a906",
            "quote": "ss A ordinary share, which represents a premium of approximately 27.5% over the last reported sales price of US$13.94 per Class A ordinary share on Nasdaq on November 12, 2025, subject to adjustm"
          },
          {
            "date": "2025-11-12",
            "rawPrice": 13.94,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-12",
              13.94
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-25-109593",
            "sha256": "0ce2ebf18f4627a1eac09a73fa6d48571f7d516b7b7c08182b1564dda646ae8a",
            "quote": "ade Date : November 13, 2025 Settlement Date : November 19, 2025 (T+4) 1 Nasdaq Last Reported Sale Price of Class A ordinary shares on November 12, 2025 : $13.94 per Class A ordinar"
          },
          {
            "date": "2026-02-19",
            "rawPrice": 7.94,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-19",
              7.94
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-26-019332",
            "sha256": "5e91837b15bf4d832df391a4c5ec659bf766490bcce9ad8f7c1bfa86a2a2e8cd",
            "quote": "ss A ordinary share, which represents a premium of approximately 25.0% over the last reported sales price of US$7.94 per Class A ordinary share on Nasdaq on February 19, 2026, subject to adjustm"
          },
          {
            "date": "2026-02-19",
            "rawPrice": 7.94,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-19",
              7.94
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-26-018581",
            "sha256": "47664ba17ffec81d3d8bc04b3862d8498060fe017757e6c35691f54ac025e9b3",
            "quote": "ade Date : February 20, 2026 Settlement Date : February 26, 2026 (T+4) 1 Nasdaq Last Reported Sale Price of Class A ordinary shares on February 19, 2026 : $7.94 per Class A ordinar"
          }
        ]
      },
      {
        "securityId": "ref_BUR",
        "ticker": "BUR",
        "cik": "0001714174",
        "issuer": "Burford Capital Ltd",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:BUR:2015-04-01",
        "masterRowSet": [
          "tiingo:NYSE:BUR:2010-04-05",
          "tiingo:NYSE:BUR:2015-04-01"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Ordinary shares, no par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "99a55d6cc07805bcc952eff11a13c8a89a80c53e83d8d72d22678bf122dcd12d"
        },
        "lastConfirmedCover": {
          "accession": "0001714174-26-000097",
          "filingDate": "2026-08-06",
          "sha256": "b89fa4c0257ed20809820cc8630f68f55b81beb18629f61f3d00a82ecdf5c821"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 218
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001714174-26-000097",
            "url": "https://www.sec.gov/Archives/edgar/data/1714174/000171417426000097/bur-20260630.htm",
            "sha256": "b89fa4c0257ed20809820cc8630f68f55b81beb18629f61f3d00a82ecdf5c821",
            "sha256Normalized": "b89fa4c0257ed20809820cc8630f68f55b81beb18629f61f3d00a82ecdf5c821",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-08-06 cover: BUR / Ordinary shares, no par value / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001558370-22-004552",
            "url": "https://www.sec.gov/Archives/edgar/data/1714174/000155837022004552/bur-20211231x20f.htm",
            "sha256": "6bbf8453c149ad2e547ddbd70a17bf4c645bc1089b1883b9e1fb0272f845ce4e",
            "sha256Normalized": "6bbf8453c149ad2e547ddbd70a17bf4c645bc1089b1883b9e1fb0272f845ce4e",
            "bytesRead": 6291456,
            "complete": false,
            "claim": "BUR / Ordinary shares, no par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001714174-26-000055",
            "url": "https://www.sec.gov/Archives/edgar/data/1714174/000171417426000055/bur-20260324.htm",
            "sha256": "024bdb36a73bf8d4e9ec52861b9071b3c30af492249f13784529a0571b3d083d",
            "sha256Normalized": "f0797c53488ecc07bdbd223b697fb3b1e6c83d3dda9cc4f86e39f5cd87e8a2be",
            "bytesRead": 1344806,
            "complete": true,
            "claim": "DEF 14A 2026-04-02: closing price $8.92 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 8.92,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              8.92
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001714174-26-000055",
            "sha256": "024bdb36a73bf8d4e9ec52861b9071b3c30af492249f13784529a0571b3d083d",
            "quote": "lan. (2) Represents the market value of the matching notional RSUs based on the closing price of $8.92 per ordinary share on the NYSE on December 31, 2025, which was the last"
          }
        ]
      },
      {
        "securityId": "ref_CHRD",
        "ticker": "CHRD",
        "cik": "0001486159",
        "issuer": "Chord Energy Corp",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:CHRD:2020-11-20",
        "masterRowSet": [
          "tiingo:NASDAQ:CHRD:2001-01-02",
          "tiingo:NASDAQ:CHRD:2020-11-20"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-07-08",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-07-08",
          "checkedTo": "2026-10-23",
          "bars": 225,
          "pointsSha256": "1c521ebca86c860fd363e9928549f1650ee43fbc5dacd10533de02c5f5cbe222"
        },
        "lastConfirmedCover": {
          "accession": "0001486159-26-000032",
          "filingDate": "2026-08-06",
          "sha256": "47e4a5f79ed0d78daa8c801d42948f222e7347d6ddfa405ab044c9f5c4355fec"
        },
        "anchorGaps": {
          "matchDates": 11,
          "firstMatch": "2022-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 363
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001486159-26-000032",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000148615926000032/chrd-20260630.htm",
            "sha256": "47e4a5f79ed0d78daa8c801d42948f222e7347d6ddfa405ab044c9f5c4355fec",
            "sha256Normalized": "ad73652f56b403e5bd515f3c6c35c4ab00798187c3d6ca2cd9b5dc04a63268ca",
            "bytesRead": 1368634,
            "complete": true,
            "claim": "10-Q 2026-08-06 cover: CHRD / Common Stock, par value $0.01 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-22-189506",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000119312522189506/d253559d8k.htm",
            "sha256": "6e469633ec7f2e0815d2c935d0878b490f133bb7f4aea9a31515142160d74f96",
            "sha256Normalized": "27c087085956c54bd80def01df97b39d393fc175b92ec5cb5be3d100e0fba18e",
            "bytesRead": 89919,
            "complete": true,
            "claim": "CHRD / Common Stock, par value $0.01 per share / Nasdaq Global Select Market"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001486159-23-000007",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000148615923000007/chrd-20230316.htm",
            "sha256": "5a5b77d7b8a140a4794a2730723c193f8950fad2d6d43661efe495f8b5d4a5e2",
            "sha256Normalized": "4dc852dcdf09ac0ac274bdafe6fb117f503ca87719cda665c0ddab3888344aa2",
            "bytesRead": 1192553,
            "complete": true,
            "claim": "DEF 14A 2023-03-16: closing price $136.81 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001486159-24-000015",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000148615924000015/chrd-20240319.htm",
            "sha256": "e767a46f7c309e57a77939863665b178867033c4a49c30faf9e835137f70b940",
            "sha256Normalized": "8ce4808ebe8092b7adb7baa1bedc09d0f91996dca2adaa69501b66ecde94d689",
            "bytesRead": 2046016,
            "complete": true,
            "claim": "DEF 14A 2024-03-19: closing price $166.23 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001486159-25-000013",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000148615925000013/chrd-20250318.htm",
            "sha256": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "sha256Normalized": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2025-03-19: closing price $157.6 on 2024-01-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001486159-26-000010",
            "url": "https://www.sec.gov/Archives/edgar/data/1486159/000148615926000010/chrd-20260318.htm",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "sha256Normalized": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-03-19: closing price $126.31 on 2025-01-17"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-31",
            "rawPrice": 136.81,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              136.81
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-23-000007",
            "sha256": "5a5b77d7b8a140a4794a2730723c193f8950fad2d6d43661efe495f8b5d4a5e2",
            "quote": "ed stock unit awards held by our 2022 NEOs, in each case, computed based on the closing price of our common stock on December 31, 2022, which was $136.81 per share. (3) All "
          },
          {
            "date": "2023-12-29",
            "rawPrice": 166.23,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              166.23
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-24-000015",
            "sha256": "e767a46f7c309e57a77939863665b178867033c4a49c30faf9e835137f70b940",
            "quote": "wards held by our Named Executive Officers, in each case, computed based on the closing price of our common stock on December 29, 2023, the last trading day of 2023, which was $166.23 per share. (3) All "
          },
          {
            "date": "2024-01-12",
            "rawPrice": 157.6,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-01-12",
              157.6
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-25-000013",
            "sha256": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "quote": "value realized by Mr. Robuck upon vesting of the PSUs was computed based on the closing price of our common stock on January 12, 2024, the last trading day preceding the vesting date, which was $157.60. (12) Reflects one-"
          },
          {
            "date": "2024-02-09",
            "rawPrice": 156.02,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-02-09",
              156.02
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-25-000013",
            "sha256": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "quote": "by Mr. Lou upon vesting of the restricted stock award was computed based on the closing price of our common stock on February 9, 2024, the last trading day preceding the vesting date, which was $156.02. (9) Reflects one-h"
          },
          {
            "date": "2024-04-12",
            "rawPrice": 187.12,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-04-12",
              187.12
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-25-000013",
            "sha256": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "quote": " Mr. Brown upon vesting of the restricted stock award was computed based on the closing price of our common stock on April 12, 2024, the last trading day preceding the vesting date, which was $187.12. (2) Reflects one-h"
          },
          {
            "date": "2024-05-31",
            "rawPrice": 185.41,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-05-31",
              185.41
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-25-000013",
            "sha256": "188ee93c53210b309aee9c8222184c4f7cd6f258d9b160abf80dd99ea6178b3b",
            "quote": "entive Plan (the “LTIP”). The grant date fair value for the RSU is based on the closing stock price on May 31, 2024, which was $185.41. This award is sche"
          },
          {
            "date": "2025-01-17",
            "rawPrice": 126.31,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-01-17",
              126.31
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-26-000010",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "quote": "lue realized by Mr. Lou upon vesting of the RSU award was computed based on the closing price of our common stock on January 17, 2025, the last trading day preceding the vesting date, which was $126.31. (9) Reflects the 4"
          },
          {
            "date": "2025-01-31",
            "rawPrice": 112.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-01-31",
              112.45
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-26-000010",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "quote": "e realized by Mr. Henke upon vesting of the RSU award was computed based on the closing price of our common stock on January 31, 2025, the last trading day preceding the vesting date, which was $112.45. (11) Reflects one-"
          },
          {
            "date": "2025-04-11",
            "rawPrice": 89.34,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-04-11",
              89.34
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-26-000010",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "quote": "e realized by Mr. Brown upon vesting of the RSU award was computed based on the closing price of our common stock on April 11, 2025, the last trading day preceding the vesting date, which was $89.34. (2) For Messrs. Br"
          },
          {
            "date": "2025-08-01",
            "rawPrice": 105.86,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-08-01",
              105.86
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-26-000010",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "quote": " realized by Ms. Kinney upon vesting of the RSU award was computed based on the closing price of our common stock on August 1, 2025, which was $105.86. 84 2026 Proxy Stat"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 92.7,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              92.7
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001486159-26-000010",
            "sha256": "65f5ac0e82b7af69122aaa9b0568a22deed08b8a9f456b831c14140dffeb1364",
            "quote": "wards held by our Named Executive Officers, in each case, computed based on the closing price of our common stock on December 31, 2025, the last trading day of 2025, which was $92.70 per share. 2026 Pro"
          }
        ]
      },
      {
        "securityId": "ref_CNH",
        "ticker": "CNH",
        "cik": "0001567094",
        "issuer": "CNH Industrial N.V.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:CNH:2013-09-30",
        "masterRowSet": [
          "tiingo:NYSE:CNH:2001-01-02",
          "tiingo:NYSE:CNH:2013-09-30"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares, par value €0.01",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-05-31",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-05-31",
          "checkedTo": "2026-10-23",
          "bars": 126,
          "pointsSha256": "a1d7bfafa5fcdea639d96418bf8d4c1f070cf4c0f51368263cf818fd843b4e0f"
        },
        "lastConfirmedCover": {
          "accession": "0001567094-26-000018",
          "filingDate": "2026-08-03",
          "sha256": "60255bc23b82f2b813b6b6d99582aa208bbd77ee756ffd73bc7ad85497613c84"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 215
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001567094-26-000018",
            "url": "https://www.sec.gov/Archives/edgar/data/1567094/000156709426000018/cnhi-20260630.htm",
            "sha256": "60255bc23b82f2b813b6b6d99582aa208bbd77ee756ffd73bc7ad85497613c84",
            "sha256Normalized": "4e45d5e22d724f9c0739d6403e4fb1b7d72049ba6ea0d017b8f592f28e76a94f",
            "bytesRead": 2583371,
            "complete": true,
            "claim": "10-Q 2026-08-03 cover: CNH / Common Shares, par value €0.01 / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-24-151142",
            "url": "https://www.sec.gov/Archives/edgar/data/1567094/000119312524151142/d758547d8k.htm",
            "sha256": "6330e7faf02ae7e6c8e727b94966a82885fb60de39af333bd8270b364d0e333f",
            "sha256Normalized": "bd70ea4eecf8642d2248574108df73039c6a5f938fbceea449051993eee6ff04",
            "bytesRead": 26081,
            "complete": true,
            "claim": "CNH / Common Shares, par value €0.01 / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-124227",
            "url": "https://www.sec.gov/Archives/edgar/data/1567094/000119312526124227/cnh-20260325.htm",
            "sha256": "0da89b499ffc3b1fb47321948bd786626d8018a2c9a4f18b7839cbb791dd6fce",
            "sha256Normalized": "fd6147c27c0e630a80836282ab7742438f0ebb14648517a3e6348f424bad07f2",
            "bytesRead": 2051199,
            "complete": true,
            "claim": "DEF 14A 2026-03-25: closing price $9.22 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 9.22,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              9.22
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-124227",
            "sha256": "0da89b499ffc3b1fb47321948bd786626d8018a2c9a4f18b7839cbb791dd6fce",
            "quote": "ount shown represents the number of RSUs that have not vested multiplied by the closing price for CNH Industrial common stock on the NYSE as of December 31, 2025, which was $9.22. Unvested awards do"
          }
        ]
      },
      {
        "securityId": "ref_CNR",
        "ticker": "CNR",
        "cik": "0001710366",
        "issuer": "Core Natural Resources, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:CNR:2017-11-14",
        "masterRowSet": [
          "tiingo:NYSE MKT:CNR:2016-01-04",
          "tiingo:NYSE:CNR:1992-04-06",
          "tiingo:NYSE:CNR:2017-11-14"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.01 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2025-01-17",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2025-01-17",
          "checkedTo": "2026-10-23",
          "bars": 93,
          "pointsSha256": "1b65540f0be04b87bceb526ff4c05da4e0355ef5f0b41906d55ce6d74789c6f9"
        },
        "lastConfirmedCover": {
          "accession": "0001710366-26-000054",
          "filingDate": "2026-08-06",
          "sha256": "997f91690f82fee7e5526d3a8da0f8635f3834601045703b33b34348164aa875"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2025-10-06",
          "lastMatch": "2025-12-31",
          "maxGapDays": 218
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001710366-26-000054",
            "url": "https://www.sec.gov/Archives/edgar/data/1710366/000171036626000054/cnr-20260630.htm",
            "sha256": "997f91690f82fee7e5526d3a8da0f8635f3834601045703b33b34348164aa875",
            "sha256Normalized": "c6503de2878fec5f396b08634076205261c4054bed9bb9649f3b4a1b44a6c6a8",
            "bytesRead": 2156914,
            "complete": true,
            "claim": "10-Q 2026-08-06 cover: CNR / Common Stock, $0.01 par value / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-25-007135",
            "url": "https://www.sec.gov/Archives/edgar/data/1710366/000119312525007135/d836647d8k.htm",
            "sha256": "eea97441238c7177d25d9102027c1e2f0d77e3676bc82d24c9aa3357c0222c19",
            "sha256Normalized": "4cbd44fb175658c94f2d9beb04a1364c2a75f70244a763fd8403dc06358554d7",
            "bytesRead": 73999,
            "complete": true,
            "claim": "CNR / Common Stock, $0.01 par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001710366-26-000017",
            "url": "https://www.sec.gov/Archives/edgar/data/1710366/000171036626000017/cnr-20260316.htm",
            "sha256": "42768821d351b020eecd3d82d74e509fea10210edcd87d1618d4a4e99de82750",
            "sha256Normalized": "3f60c47bef3e24ff8405c60f002c04422486ef44186e34498e39f971bcde1d3e",
            "bytesRead": 1678299,
            "complete": true,
            "claim": "DEF 14A 2026-03-16: closing price $88.45 on 2025-10-06"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-10-06",
            "rawPrice": 88.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-10-06",
              88.45
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001710366-26-000017",
            "sha256": "42768821d351b020eecd3d82d74e509fea10210edcd87d1618d4a4e99de82750",
            "quote": "standing PSUs and SPSUs in an amount equal to $4,346,433, which represented the closing price of the Company’s common stock on October 6, 2025 ($88.45) multiplied by the "
          },
          {
            "date": "2025-12-31",
            "rawPrice": 88.51,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              88.51
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001710366-26-000017",
            "sha256": "42768821d351b020eecd3d82d74e509fea10210edcd87d1618d4a4e99de82750",
            "quote": "88,673 (1) The market value for RSUs and PSUs was determined by multiplying the closing market price for Company common stock on December 31, 2025 ($88.51) by the number of s"
          }
        ]
      },
      {
        "securityId": "ref_COCO",
        "ticker": "COCO",
        "cik": "0001482981",
        "issuer": "Vita Coco Company, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:COCO:2021-10-21",
        "masterRowSet": [
          "tiingo:NASDAQ:COCO:1999-02-05",
          "tiingo:NASDAQ:COCO:2021-10-21"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, Par Value $0.01 Per Share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-10-22",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-10-22",
          "checkedTo": "2026-10-23",
          "bars": 262,
          "pointsSha256": "11767158100134971b77a5b6fd64a53d4ce2985a4dbe264e5e76cbe31ccb25fd"
        },
        "lastConfirmedCover": {
          "accession": "0001482981-26-000185",
          "filingDate": "2026-10-22",
          "sha256": "40e754a5af32b7d0242dbc960083707ada7b9b4ff3bd9cda525f6da327606981"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2021-10-22",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001482981-26-000185",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298126000185/coco-20260930.htm",
            "sha256": "40e754a5af32b7d0242dbc960083707ada7b9b4ff3bd9cda525f6da327606981",
            "sha256Normalized": "8e42443c350f79eafd5b8f750e95c994c4f4d314c55fa881ae8ce3088c771798",
            "bytesRead": 1818392,
            "complete": true,
            "claim": "10-Q 2026-10-22 cover: COCO / Common Stock, Par Value $0.01 Per Share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-21-284306",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000119312521284306/d197386ds1.htm",
            "sha256": "cdfc0515f181dddb7ca51e6c6373ed6a48d00076529d3cff124f536f39bc0cee",
            "sha256Normalized": "cdfc0515f181dddb7ca51e6c6373ed6a48d00076529d3cff124f536f39bc0cee",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ill be between $ and $ per share. We have applied to list our common stock on the Nasdaq Global Select Market under the symbol “COCO.” We are an “emerging growth company” as that term is used in the Jumpstart Our Business Startups Act of 2012 and, as such, may elect to comply wit"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-26-000022",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298126000022/coco-20251231.htm",
            "sha256": "ff3a36b10c42d619c417885b4d1eef94c3ebfdb62a434a63cf996b1d033da1ef",
            "sha256Normalized": "4128cc1af852354b64c97666b84ad03b5bf1b2303ffac374b5fa31fd1d357806",
            "bytesRead": 2200051,
            "complete": true,
            "claim": "10-K 2026-02-18: closing price $13.95 on 2021-10-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-25-000032",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298125000032/coco-20241231.htm",
            "sha256": "55ca9c0fb8fb3735844f8d326f766f906da8054b4d71ba0284005d5e7dd57eca",
            "sha256Normalized": "8b0e22ff314750b76f5295215a8833d43c0e3a0c89bbacc0297931b24ee447ab",
            "bytesRead": 2128590,
            "complete": true,
            "claim": "10-K 2025-02-26: closing price $13.95 on 2021-10-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-24-000012",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298124000012/coco-20231231.htm",
            "sha256": "2872e47e440f4e525064c972960a3438846dec20f8d795e8b90d1fcaaf46710a",
            "sha256Normalized": "171a98842c2ebd72c0cdbfce69cec265816707843e692be96f7bc953e5e3789f",
            "bytesRead": 2268295,
            "complete": true,
            "claim": "10-K 2024-02-29: closing price $13.95 on 2021-10-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-23-000017",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298123000017/coco-20221231.htm",
            "sha256": "265ca06545097cab2fbc5c533a71bbed485f668b60f150d3e958e2ddaa826296",
            "sha256Normalized": "21e3a3e1ad03b43d8f9d15e40f37a86a8e61382ca3f2809065c06fba443de851",
            "bytesRead": 2800445,
            "complete": true,
            "claim": "10-K 2023-03-14: closing price $13.95 on 2021-10-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-22-000014",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298122000014/coco-20211231.htm",
            "sha256": "7118c922618f1af2bdefefd6a9491fe6956a27a19bca4c9ca30091d78bb7b838",
            "sha256Normalized": "6d7322e50c1c2d58bf58e3527e650013cfae23416c1888651224c759c0babfba",
            "bytesRead": 2949194,
            "complete": true,
            "claim": "10-K 2022-03-14: closing price $13.95 on 2021-10-22"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-118595",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000119312523118595/d266684ddef14a.htm",
            "sha256": "f5445a1e5a4edb31b84f66121460ea41b319dc401d748ec382784474adc29296",
            "sha256Normalized": "f5445a1e5a4edb31b84f66121460ea41b319dc401d748ec382784474adc29296",
            "bytesRead": 452723,
            "complete": true,
            "claim": "DEF 14A 2023-04-26: closing price $13.82 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-021425",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000114036124021425/ny20018653x1_def14a.htm",
            "sha256": "2c633b1100a7601fe941e9aba9cc2b6f3f9bf36c3a6e309b811df114d6610b6e",
            "sha256Normalized": "940a4f17fb0fd44b9eb814953bc7245723eb30d1a2b246d20e78de85ebafcfae",
            "bytesRead": 1975831,
            "complete": true,
            "claim": "DEF 14A 2024-04-23: closing price $25.65 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001482981-26-000107",
            "url": "https://www.sec.gov/Archives/edgar/data/1482981/000148298126000107/coco-20260422.htm",
            "sha256": "120d5c58b9e7e53e9949dbe76326bcc0bb231ba52659050ff0d1ce4bc484c59c",
            "sha256Normalized": "825f3724c3ffbaab473c3a9ab125e7a2b2034c29fc60ec29bbcbca9d73dbf2b4",
            "bytesRead": 1208529,
            "complete": true,
            "claim": "DEF 14A 2026-04-22: closing price $53.01 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-10-22",
            "rawPrice": 13.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-10-22",
              13.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-26-000022",
            "sha256": "ff3a36b10c42d619c417885b4d1eef94c3ebfdb62a434a63cf996b1d033da1ef",
            "quote": "& Beverage Index, and that any dividends were reinvested. The graph assumes our closing sales price on October 22, 2021 of $13.95 per share as the in"
          },
          {
            "date": "2021-10-22",
            "rawPrice": 13.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-10-22",
              13.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-25-000032",
            "sha256": "55ca9c0fb8fb3735844f8d326f766f906da8054b4d71ba0284005d5e7dd57eca",
            "quote": "& Beverage Index, and that any dividends were reinvested. The graph assumes our closing sales price on October 22, 2021 of $13.95 per share as the in"
          },
          {
            "date": "2021-10-22",
            "rawPrice": 13.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-10-22",
              13.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-24-000012",
            "sha256": "2872e47e440f4e525064c972960a3438846dec20f8d795e8b90d1fcaaf46710a",
            "quote": "& Beverage Index, and that any dividends were reinvested. The graph assumes our closing sales price on October 22, 2021 of $13.95 per share as the in"
          },
          {
            "date": "2021-10-22",
            "rawPrice": 13.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-10-22",
              13.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-23-000017",
            "sha256": "265ca06545097cab2fbc5c533a71bbed485f668b60f150d3e958e2ddaa826296",
            "quote": "& Beverage Index, and that any dividends were reinvested. The graph assumes our closing sales price on October 22, 2021 of $13.95 per share as the in"
          },
          {
            "date": "2021-10-22",
            "rawPrice": 13.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-10-22",
              13.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-22-000014",
            "sha256": "7118c922618f1af2bdefefd6a9491fe6956a27a19bca4c9ca30091d78bb7b838",
            "quote": "& Beverage Index, and that any dividends were reinvested. The graph assumes our closing sales price on October 22, 2021 of $13.95 per share as the in"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 13.82,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              13.82
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-118595",
            "sha256": "f5445a1e5a4edb31b84f66121460ea41b319dc401d748ec382784474adc29296",
            "quote": "94 (7) 809,769 — — (1) The market value amounts in this column are based on the closing price of the Company’s common stock on December 30, 2022, the last trading day of the year ($13.82). (2) The options w"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 25.65,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              25.65
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-24-021425",
            "sha256": "2c633b1100a7601fe941e9aba9cc2b6f3f9bf36c3a6e309b811df114d6610b6e",
            "quote": " ​ — ​ ​ — ​ ​ — ​ (1) The market value amounts in this column are based on the closing price of the Company’s common stock on December 29, 2023, the last trading day of the year ($25.65). The Vita Coco Com"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 53.01,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              53.01
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001482981-26-000107",
            "sha256": "120d5c58b9e7e53e9949dbe76326bcc0bb231ba52659050ff0d1ce4bc484c59c",
            "quote": "47 (17) 182,725 — — 1. The market value amounts in this column are based on the closing price of the Company’s common stock on December 31, 2025, the last trading day of the year ($53.01). 2. The options we"
          }
        ]
      },
      {
        "securityId": "ref_COGT",
        "ticker": "COGT",
        "cik": "0001622229",
        "issuer": "Cogent Biosciences, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:COGT:2018-03-29",
        "masterRowSet": [
          "tiingo:NASDAQ:COGT:2007-12-27",
          "tiingo:NASDAQ:COGT:2018-03-29"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.001 Par Value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-12-31",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-12-31",
          "checkedTo": "2026-10-23",
          "bars": 252,
          "pointsSha256": "66b3fba81a8a5cee9cb935cc36c6c3c833a92d717761cf3469835da44fe71f3c"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-342393",
          "filingDate": "2026-08-10",
          "sha256": "67ceeef123ff36f11007066d0096baad90e1032b62058a8da540afb254fd4547"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2023-12-29",
          "lastMatch": "2025-12-31",
          "maxGapDays": 588
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-342393",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312526342393/cogt-20260630.htm",
            "sha256": "67ceeef123ff36f11007066d0096baad90e1032b62058a8da540afb254fd4547",
            "sha256Normalized": "764e5fc991e7400c0ad05eddc58f8e778154fcb2699e761eafccb73e471528b6",
            "bytesRead": 2210114,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: COGT / Common Stock, $0.001 Par Value / The Nasdaq Global Select Market"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-21-246896",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312521246896/d204129d8k.htm",
            "sha256": "4b5d8ad577887ebb0aa6ebb3bae9440cd0b2dfa09b5c9a33a9f7dc957d082192",
            "sha256Normalized": "fee0ee4d388787affb7d79fd0206178ac00f7d5abd98944093bd0981f9a972db",
            "bytesRead": 25137,
            "complete": true,
            "claim": "COGT / Common stock, $0.001 Par Value / The Nasdaq Global Select Market"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-24-107124",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312524107124/d675436ddef14a.htm",
            "sha256": "5be43f73f2c292d0060b07d6cabc29510a069ca5cf4f986d2a36a1ac4ed4b19e",
            "sha256Normalized": "5be43f73f2c292d0060b07d6cabc29510a069ca5cf4f986d2a36a1ac4ed4b19e",
            "bytesRead": 439733,
            "complete": true,
            "claim": "DEF 14A 2024-04-23: closing price $5.88 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-019770",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000095017024019770/cogt-20231231.htm",
            "sha256": "5fa8805dccd145340b6ae6ea4811ef22b06328f68bd949b015be5e3edbae182f",
            "sha256Normalized": "45deb3c5f721f006b915e2c5e3e510d781a608082b333267fdf8fe75b6465730",
            "bytesRead": 2910056,
            "complete": true,
            "claim": "10-K 2024-02-26: closing price $5.88 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-24-082065",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312524082065/d786443ds3.htm",
            "sha256": "36c62a343c61ce671fdbf1613778df602e3553eb24326bd04b0816f0a6ec470a",
            "sha256Normalized": "36c62a343c61ce671fdbf1613778df602e3553eb24326bd04b0816f0a6ec470a",
            "bytesRead": 254307,
            "complete": true,
            "claim": "S-3 2024-03-29: closing price $6.72 on 2024-03-28"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-342683",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312526342683/d149476d424b5.htm",
            "sha256": "b0bb0d87c8366372b04fc11ac9d065cae2d2f859eaee429eeaf64a50da3cea0e",
            "sha256Normalized": "b0bb0d87c8366372b04fc11ac9d065cae2d2f859eaee429eeaf64a50da3cea0e",
            "bytesRead": 313430,
            "complete": true,
            "claim": "424B5 2026-08-10: closing price $14.72 on 2025-11-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-277586",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312525277586/d940106d424b5.htm",
            "sha256": "586b3bde862c3b6dccdfbc0b0ccb17e64ae3c93eb644f435ed56de94e10e2f44",
            "sha256Normalized": "586b3bde862c3b6dccdfbc0b0ccb17e64ae3c93eb644f435ed56de94e10e2f44",
            "bytesRead": 420885,
            "complete": true,
            "claim": "424B5 2025-11-12: closing price $14.72 on 2025-11-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-277503",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312525277503/d159388d424b5.htm",
            "sha256": "0591c53639484f1feba0a69c3aede927ef2234e7d6e88ab492d281852bd98206",
            "sha256Normalized": "0591c53639484f1feba0a69c3aede927ef2234e7d6e88ab492d281852bd98206",
            "bytesRead": 852307,
            "complete": true,
            "claim": "424B5 2025-11-12: closing price $14.72 on 2025-11-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-274642",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312525274642/d940106d424b5.htm",
            "sha256": "44a528b0633cda731f8aa2ae452a699c658ad2861018edff439fc7aed5a2b483",
            "sha256Normalized": "44a528b0633cda731f8aa2ae452a699c658ad2861018edff439fc7aed5a2b483",
            "bytesRead": 421004,
            "complete": true,
            "claim": "424B5 2025-11-12: closing price $14.72 on 2025-11-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-274621",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312525274621/d159388d424b5.htm",
            "sha256": "6845a357918f1b4e63d6fae113ccad8d0f5433988c91af7afe7d7ab8c146725d",
            "sha256Normalized": "6845a357918f1b4e63d6fae113ccad8d0f5433988c91af7afe7d7ab8c146725d",
            "bytesRead": 851790,
            "complete": true,
            "claim": "424B5 2025-11-12: closing price $14.72 on 2025-11-06"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-173834",
            "url": "https://www.sec.gov/Archives/edgar/data/1622229/000119312526173834/d68009ddef14a.htm",
            "sha256": "215561d16dc9ca4f86275643065e732f1515d17eea1766dbe66130c4315a3985",
            "sha256Normalized": "2ac9b386552a472f9946e7462a1916f8652b71fabaad6b8b4909116f35304c74",
            "bytesRead": 846030,
            "complete": true,
            "claim": "DEF 14A 2026-04-23: closing price $35.52 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-12-29",
            "rawPrice": 5.88,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              5.88
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-107124",
            "sha256": "5be43f73f2c292d0060b07d6cabc29510a069ca5cf4f986d2a36a1ac4ed4b19e",
            "quote": "vested shares is calculated by multiplying the number of unvested shares by the closing market price of our common stock on Nasdaq on December 29, 2023, the last trading day of the year, which was $5.88 per share. 30 Table"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 5.88,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              5.88
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-019770",
            "sha256": "5fa8805dccd145340b6ae6ea4811ef22b06328f68bd949b015be5e3edbae182f",
            "quote": "shares is calculated by multiplying the number of unvested target shares by the closing market price of our common stock on Nasdaq on December 29, 2023, the last trading day of the year, which was $5.88 per share. 112 Empl"
          },
          {
            "date": "2024-03-28",
            "rawPrice": 6.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-03-28",
              6.72
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-082065",
            "sha256": "36c62a343c61ce671fdbf1613778df602e3553eb24326bd04b0816f0a6ec470a",
            "quote": "Stock is listed on The Nasdaq Global Select Market under the symbol “COGT.” The last reported sale price of our Common Stock on The Nasdaq Global Select Market on March 28, 2024 was $6.72 per share. We recom"
          },
          {
            "date": "2025-11-06",
            "rawPrice": 14.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-06",
              14.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-342683",
            "sha256": "b0bb0d87c8366372b04fc11ac9d065cae2d2f859eaee429eeaf64a50da3cea0e",
            "quote": "tock are listed on the Nasdaq Global Select Market under the symbol “COGT”. The last reported sale price of our common stock on the Nasdaq Global Select Market on November 6, 2025 was $14.72 per share. We recom"
          },
          {
            "date": "2025-11-06",
            "rawPrice": 14.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-06",
              14.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-277586",
            "sha256": "586b3bde862c3b6dccdfbc0b0ccb17e64ae3c93eb644f435ed56de94e10e2f44",
            "quote": "tock are listed on the Nasdaq Global Select Market under the symbol “COGT”. The last reported sale price of our common stock on the Nasdaq Global Select Market on November 6, 2025 was $14.72 per share. We recom"
          },
          {
            "date": "2025-11-06",
            "rawPrice": 14.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-06",
              14.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-277503",
            "sha256": "0591c53639484f1feba0a69c3aede927ef2234e7d6e88ab492d281852bd98206",
            "quote": "tock are listed on the Nasdaq Global Select Market under the symbol “COGT”. The last reported sale price of our common stock on the Nasdaq Global Select Market on November 6, 2025 was $14.72 per share. We recom"
          },
          {
            "date": "2025-11-06",
            "rawPrice": 14.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-06",
              14.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-274642",
            "sha256": "44a528b0633cda731f8aa2ae452a699c658ad2861018edff439fc7aed5a2b483",
            "quote": "tock are listed on the Nasdaq Global Select Market under the symbol “COGT”. The last reported sale price of our common stock on the Nasdaq Global Select Market on November 6, 2025 was $14.72 per share. We recom"
          },
          {
            "date": "2025-11-06",
            "rawPrice": 14.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-11-06",
              14.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-274621",
            "sha256": "6845a357918f1b4e63d6fae113ccad8d0f5433988c91af7afe7d7ab8c146725d",
            "quote": "tock are listed on the Nasdaq Global Select Market under the symbol “COGT”. The last reported sale price of our common stock on the Nasdaq Global Select Market on November 6, 2025 was $14.72 per share. We recom"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 35.52,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              35.52
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-173834",
            "sha256": "215561d16dc9ca4f86275643065e732f1515d17eea1766dbe66130c4315a3985",
            "quote": "vested shares is calculated by multiplying the number of unvested shares by the closing market price of our common stock on Nasdaq on December 31, 2025, the last trading day of the year, which was $35.52 per share. 41 Table"
          }
        ]
      },
      {
        "securityId": "ref_CRC",
        "ticker": "CRC",
        "cik": "0001609253",
        "issuer": "California Resources Corp",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:CRC:2020-10-28",
        "masterRowSet": [
          "tiingo:NYSE:CRC:2014-11-13",
          "tiingo:NYSE:CRC:2020-10-28"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-09-15",
        "validTo": null,
        "intervalBasis": [
          "SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-09-15",
          "checkedTo": "2026-10-23",
          "bars": 163,
          "pointsSha256": "4589e936f227cd9c150ef2f9a65295eb751647cdb1d306ee868d1289bf9bcf16"
        },
        "lastConfirmedCover": {
          "accession": "0001609253-26-000130",
          "filingDate": "2026-08-10",
          "sha256": "b1450bdb530869387e63592d0e33f78353323cf63ac98c90cedba6b0deb15650"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-09-12",
          "lastMatch": "2025-09-12",
          "maxGapDays": 332
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001609253-26-000130",
            "url": "https://www.sec.gov/Archives/edgar/data/1609253/000160925326000130/crc-20260630.htm",
            "sha256": "b1450bdb530869387e63592d0e33f78353323cf63ac98c90cedba6b0deb15650",
            "sha256Normalized": "c1e48aa7db391b0535e17eedd4ba9b73f10070b8c096c53d1a8c338d50d39f90",
            "bytesRead": 2559205,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: CRC / Common Stock / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001609253-19-000122",
            "url": "https://www.sec.gov/Archives/edgar/data/1609253/000160925319000122/a2019q210-qdocument.htm",
            "sha256": "3fc8bdf015a960e59b3458c98332f29c8f008702292102b76168d4c7168d2890",
            "sha256Normalized": "af5b68329ec6b4de8cd313f742557b611d7bba4377d2ed9e0e7b79304ce851b0",
            "bytesRead": 2403396,
            "complete": true,
            "claim": "CRC / Common Stock / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-264677",
            "url": "https://www.sec.gov/Archives/edgar/data/1609253/000119312525264677/d29454d424b3.htm",
            "sha256": "0b56b020f331a27cada7b31d1407cc07d206a3b5add669cfaea6a1d70532cf52",
            "sha256Normalized": "0b56b020f331a27cada7b31d1407cc07d206a3b5add669cfaea6a1d70532cf52",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2025-11-04: closing price $53.01 on 2025-09-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-239164",
            "url": "https://www.sec.gov/Archives/edgar/data/1609253/000119312525239164/d29454ds4.htm",
            "sha256": "455adb03158fa18d39232f7066be237e3a9d8d7f6c2a7f0dd68843fec23d5293",
            "sha256Normalized": "455adb03158fa18d39232f7066be237e3a9d8d7f6c2a7f0dd68843fec23d5293",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "S-4 2025-10-14: closing price $53.01 on 2025-09-12"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-09-12",
            "rawPrice": 53.01,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-09-12",
              53.01
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-264677",
            "sha256": "0b56b020f331a27cada7b31d1407cc07d206a3b5add669cfaea6a1d70532cf52",
            "quote": "ed on the Exchange Ratio (0.0718x) provided for in the Merger Agreement and the closing stock price of CRC Common Stock on September 12, 2025 ($53.01). (2) Represents th"
          },
          {
            "date": "2025-09-12",
            "rawPrice": 53.01,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-09-12",
              53.01
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-25-239164",
            "sha256": "455adb03158fa18d39232f7066be237e3a9d8d7f6c2a7f0dd68843fec23d5293",
            "quote": "ed on the Exchange Ratio (0.0718x) provided for in the Merger Agreement and the closing stock price of CRC Common Stock on September 12, 2025 ($53.01). (2) Represents th"
          }
        ]
      },
      {
        "securityId": "ref_CSR",
        "ticker": "CSR",
        "cik": "0000798359",
        "issuer": "CENTERSPACE",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:CSR:1997-10-17",
        "masterRowSet": [
          "tiingo:NYSE:CSR:1997-10-17",
          "tiingo:NYSE:CSR:2007-10-29"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares of Beneficial Interest, no par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-01-08",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-01-08",
          "checkedTo": "2026-10-23",
          "bars": 303,
          "pointsSha256": "33c157c8010fa1e448140a2141fe175330d988cadb66ca2fb7283750330fa5b0"
        },
        "lastConfirmedCover": {
          "accession": "0000798359-26-000078",
          "filingDate": "2026-08-03",
          "sha256": "4e1d81b4db61d93d72b470bd16d1790162b24899741ae5d0c94e9863e2f9048f"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2021-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 731
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0000798359-26-000078",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000079835926000078/csr-20260630.htm",
            "sha256": "4e1d81b4db61d93d72b470bd16d1790162b24899741ae5d0c94e9863e2f9048f",
            "sha256Normalized": "2209a74e0fc0c406c6204cdcbec9809361f080eaf4c5721be5b3901556b5bf81",
            "bytesRead": 1684053,
            "complete": true,
            "claim": "10-Q 2026-08-03 cover: CSR / Common Shares of Beneficial Interest, no par value / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001628280-21-000219",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000162828021000219/iret-20210106.htm",
            "sha256": "2a4b037ac64630186f272f05f8d4441c144088c381b1b69f382fac9c2c910069",
            "sha256Normalized": "7521b88ea206ecb37dbedb98439b15af148773d2a0f8c011890b2df219e7745f",
            "bytesRead": 47507,
            "complete": true,
            "claim": "CSR / Common Shares of Beneficial Interest, no par value / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-22-012880",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000114036122012880/ny20002630x1_def14a.htm",
            "sha256": "0b6a08e14a5d6a744ce64d1f2216c4744ec824557b72e2245e3f4bf50c0a4b4e",
            "sha256Normalized": "f23030d954413a3bb614f521923f92bace4794357b12d54c57f5e14dc640b68d",
            "bytesRead": 1402464,
            "complete": true,
            "claim": "DEF 14A 2022-04-04: closing price $110.9 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000798359-23-000042",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000079835923000042/csr-20230405.htm",
            "sha256": "28543c0b62b61a9f8773d22bf4c52b5b6f795adb284591552c43b13c70763b19",
            "sha256Normalized": "8d43696d9b0cd73e0bdad3be386609c9e6490c8886e0dbe833adec724fe88f42",
            "bytesRead": 1070912,
            "complete": true,
            "claim": "DEF 14A 2023-04-05: closing price $58.67 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000798359-24-000032",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000079835924000032/csr-20240408.htm",
            "sha256": "400eab5c44b531e5644decaba24e82c86a9b49edd01799ccb09be1978f281b54",
            "sha256Normalized": "798f0e4e33fc814edf2426ec5d7d478e054a01375db4d8cca9d5a6760a89ea1e",
            "bytesRead": 1064009,
            "complete": true,
            "claim": "DEF 14A 2024-04-09: closing price $58.2 on 2023-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000798359-26-000029",
            "url": "https://www.sec.gov/Archives/edgar/data/798359/000079835926000029/csr-20260402.htm",
            "sha256": "a377d1c00d031ca6804e5cf7b68f9b8926279baaa25e2ae82a1a715f27cbbb78",
            "sha256Normalized": "54648d576776ff9669990dfd3f5ed830bd38936ec32f27385bae066656ffb518",
            "bytesRead": 1058937,
            "complete": true,
            "claim": "DEF 14A 2026-04-03: closing price $66.72 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 110.9,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              110.9
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-22-012880",
            "sha256": "0b6a08e14a5d6a744ce64d1f2216c4744ec824557b72e2245e3f4bf50c0a4b4e",
            "quote": "ward which vests ratably over four years after the grant date. (2) Based on the closing market price per common share on December 31, 2021, which was $110.90. (3) Time-based LTI"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 58.67,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              58.67
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000798359-23-000042",
            "sha256": "28543c0b62b61a9f8773d22bf4c52b5b6f795adb284591552c43b13c70763b19",
            "quote": "ward which vests ratably over four years after the grant date. (2) Based on the closing market price per common share on December 31, 2022, which was $58.67. (3) Time-based LTI"
          },
          {
            "date": "2023-12-31",
            "rawPrice": 58.2,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              58.2
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000798359-24-000032",
            "sha256": "400eab5c44b531e5644decaba24e82c86a9b49edd01799ccb09be1978f281b54",
            "quote": "ward which vests ratably over four years after the grant date. (2) Based on the closing market price per common share on December 31, 2023, which was $58.20. (3) Time-based LTI"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 66.72,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              66.72
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0000798359-26-000029",
            "sha256": "a377d1c00d031ca6804e5cf7b68f9b8926279baaa25e2ae82a1a715f27cbbb78",
            "quote": "wards which vest ratably over four years after the grant date. (2) Based on the closing market price per common share on December 31, 2025, which was $66.72. (3) Time-based LTI"
          }
        ]
      },
      {
        "securityId": "ref_CWBC",
        "ticker": "CWBC",
        "cik": "0001127371",
        "issuer": "Community West Bancshares",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:CWBC:1999-03-08",
        "masterRowSet": [
          "tiingo:NASDAQ:CWBC:1996-11-19",
          "tiingo:NASDAQ:CWBC:1999-03-08"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, no par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-04-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-04-05",
          "checkedTo": "2026-10-23",
          "bars": 134,
          "pointsSha256": "45e41924ee971af5ad99091ef988fbadba1d0546596289c4387c001c40e3145f"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-055293",
          "filingDate": "2026-08-10",
          "sha256": "ab9546df8b4b72559bfe8b927e2e92397090fe674a723c0f81f47e2930406977"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2025-12-15",
          "lastMatch": "2026-02-18",
          "maxGapDays": 173
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-055293",
            "url": "https://www.sec.gov/Archives/edgar/data/1127371/000162828026055293/cvcy-20260630.htm",
            "sha256": "ab9546df8b4b72559bfe8b927e2e92397090fe674a723c0f81f47e2930406977",
            "sha256Normalized": "ab9546df8b4b72559bfe8b927e2e92397090fe674a723c0f81f47e2930406977",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-08-10 cover: CWBC / Common Stock, no par value / NASDAQ"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-24-085373",
            "url": "https://www.sec.gov/Archives/edgar/data/1127371/000119312524085373/d815127d8k.htm",
            "sha256": "4a462e60179f82187614a8ddf0e2e8ef7eaf4d094160802e9a359e46a79468a3",
            "sha256Normalized": "54dff3c089df9d90de2f39c54e34fed745d8da40908e9b9770e2ca98176d9bee",
            "bytesRead": 58514,
            "complete": true,
            "claim": "CWBC / Common Stock, no par value / NASDAQ"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-011232",
            "url": "https://www.sec.gov/Archives/edgar/data/1127371/000162828026011232/communitywestbancshares-42.htm",
            "sha256": "f047220fb206a1d6a84b010dc6fd951c7be913f95e2f8554e19db4bb0d2db4ea",
            "sha256Normalized": "f047220fb206a1d6a84b010dc6fd951c7be913f95e2f8554e19db4bb0d2db4ea",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2026-02-24: closing price $24.2 on 2025-12-15"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-005481",
            "url": "https://www.sec.gov/Archives/edgar/data/1127371/000162828026005481/communitywestbancshares-sx4.htm",
            "sha256": "00f9e212fac0ab0b839cd36b38a93bf7a5a70fe1c2bcd1f7bfa0851894d6db42",
            "sha256Normalized": "00f9e212fac0ab0b839cd36b38a93bf7a5a70fe1c2bcd1f7bfa0851894d6db42",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "S-4 2026-02-04: closing price $24.2 on 2025-12-15"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-15",
            "rawPrice": 24.2,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-15",
              24.2
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-011232",
            "sha256": "f047220fb206a1d6a84b010dc6fd951c7be913f95e2f8554e19db4bb0d2db4ea",
            "quote": "common stock will be cashed out at their intrinsic value, which, based on CWB’s closing stock price of $24.20 on December 15, 2025, results in the exp"
          },
          {
            "date": "2025-12-15",
            "rawPrice": 24.2,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-15",
              24.2
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-005481",
            "sha256": "00f9e212fac0ab0b839cd36b38a93bf7a5a70fe1c2bcd1f7bfa0851894d6db42",
            "quote": "common stock will be cashed out at their intrinsic value, which, based on CWB’s closing stock price of $24.20 on December 15, 2025, results in the exp"
          },
          {
            "date": "2025-12-16",
            "rawPrice": 24.06,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-16",
              24.06
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-011232",
            "sha256": "f047220fb206a1d6a84b010dc6fd951c7be913f95e2f8554e19db4bb0d2db4ea",
            "quote": "s on the Nasdaq Capital Market (“Nasdaq”) under the symbol “CWBC.” Based on the closing price of CWB common stock reported on Nasdaq of $24.06 as of December 16, 2025, the trading day im"
          },
          {
            "date": "2025-12-16",
            "rawPrice": 24.06,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-16",
              24.06
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-005481",
            "sha256": "00f9e212fac0ab0b839cd36b38a93bf7a5a70fe1c2bcd1f7bfa0851894d6db42",
            "quote": "s on the Nasdaq Capital Market (“Nasdaq”) under the symbol “CWBC.” Based on the closing price of CWB common stock reported on Nasdaq of $24.06 as of December 16, 2025, the trading day im"
          },
          {
            "date": "2026-02-18",
            "rawPrice": 24.28,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-18",
              24.28
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-011232",
            "sha256": "f047220fb206a1d6a84b010dc6fd951c7be913f95e2f8554e19db4bb0d2db4ea",
            "quote": "th an aggregate transaction value of approximately $191.9 million. Based on the closing price of CWB common stock reported on Nasdaq of $24.28 as of February 18, 2026, the latest practic"
          }
        ]
      },
      {
        "securityId": "ref_CZR",
        "ticker": "CZR",
        "cik": "0001590895",
        "issuer": "Caesars Entertainment, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:CZR:2014-09-22",
        "masterRowSet": [
          "tiingo:NASDAQ:CZR:2012-02-08",
          "tiingo:NASDAQ:CZR:2014-09-22"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.00001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-07-24",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-07-24",
          "checkedTo": "2026-10-23",
          "bars": 327,
          "pointsSha256": "8ad564baa70d5b14c026fe62744decb6f96d7fe200ee50a0d2eafbc13b196ab8"
        },
        "lastConfirmedCover": {
          "accession": "0001590895-26-000033",
          "filingDate": "2026-10-27",
          "sha256": "71db36d6f427fff9ae3775418d26b3e720ca5fb63b0fc60dd8fbcff5113c785c"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2020-09-25",
          "lastMatch": "2026-04-01",
          "maxGapDays": 1187
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001590895-26-000033",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000159089526000033/czr-20260930.htm",
            "sha256": "71db36d6f427fff9ae3775418d26b3e720ca5fb63b0fc60dd8fbcff5113c785c",
            "sha256Normalized": "55365eb6655cedb71267d779465b2ddb8813e549e6c9f6a24763e6a593d9438c",
            "bytesRead": 2126122,
            "complete": true,
            "claim": "10-Q 2026-10-27 cover: CZR / Common Stock, $0.00001 par value / NASDAQ Stock Market"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-20-196232",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000119312520196232/d940333d8k.htm",
            "sha256": "a7f1bfbee4eb4e8e5ded80d9be0dee191b0d6df27e225328142cd6532444088f",
            "sha256Normalized": "c2e6d106d3430624e46a6e54be5ac0c4829c7e653236e10c1f3475cd6256fdec",
            "bytesRead": 118157,
            "complete": true,
            "claim": "CZR / Common Stock, $0.00001 par value / NASDAQ Stock Market"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-20-259614",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000119312520259614/d81241d424b2.htm",
            "sha256": "ebe7f27d83096f3eb944c202307901079c5dcd795d34c5bd45380a5d1781e7a1",
            "sha256Normalized": "ebe7f27d83096f3eb944c202307901079c5dcd795d34c5bd45380a5d1781e7a1",
            "bytesRead": 379932,
            "complete": true,
            "claim": "424B2 2020-09-30: closing price $57.07 on 2020-09-25"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-20-255119",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000119312520255119/d81241d424b5.htm",
            "sha256": "ba1da63ef51a1fea6ad1da89f103ec179a848ee63c89fb5287afa52b45e9a830",
            "sha256Normalized": "ba1da63ef51a1fea6ad1da89f103ec179a848ee63c89fb5287afa52b45e9a830",
            "bytesRead": 369187,
            "complete": true,
            "claim": "424B5 2020-09-28: closing price $57.07 on 2020-09-25"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-124567",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000119312523124567/d419445ddef14a.htm",
            "sha256": "e554f7cb7e452f9d58f8cbdd1f4eb8e41c4b72063de33c5dd73f6c928c88f030",
            "sha256Normalized": "9639823b1b852e6bcaa08527f2a1c51d2bebea3b5228dc201d2d49eb7812ba35",
            "bytesRead": 1619186,
            "complete": true,
            "claim": "DEF 14A 2023-04-28: closing price $41.6 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-174058",
            "url": "https://www.sec.gov/Archives/edgar/data/1590895/000119312526174058/d140199ddef14a.htm",
            "sha256": "9a33a003cb899506953d12ae85c9a0f464d58ef70fae013b7658035ea85160ee",
            "sha256Normalized": "2a119234c5cf51f8c5e9a5ba38f9ebed3df822c62eac227d8ef3cb044cb89653",
            "bytesRead": 1529366,
            "complete": true,
            "claim": "DEF 14A 2026-04-23: closing price $26.55 on 2026-04-01"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-09-25",
            "rawPrice": 57.07,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-09-25",
              57.07
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-20-259614",
            "sha256": "ebe7f27d83096f3eb944c202307901079c5dcd795d34c5bd45380a5d1781e7a1",
            "quote": "t. Our shares are listed on the NASDAQ Stock Market under the symbol “CZR.” The last reported closing price of our shares on the NASDAQ Stock Market on September 25, 2020 was $57.07 per share. We inten"
          },
          {
            "date": "2020-09-25",
            "rawPrice": 57.07,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-09-25",
              57.07
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-20-255119",
            "sha256": "ba1da63ef51a1fea6ad1da89f103ec179a848ee63c89fb5287afa52b45e9a830",
            "quote": "t. Our shares are listed on the NASDAQ Stock Market under the symbol “CZR.” The last reported closing price of our shares on the NASDAQ Stock Market on September 25, 2020 was $57.07 per share. We inten"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 41.6,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              41.6
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-124567",
            "sha256": "e554f7cb7e452f9d58f8cbdd1f4eb8e41c4b72063de33c5dd73f6c928c88f030",
            "quote": "d. • The performance period is February 25, 2022 through February 25, 2025. The closing price of our common stock on December 31, 2022 was $41.60. From that closing "
          },
          {
            "date": "2026-04-01",
            "rawPrice": 26.55,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-04-01",
              26.55
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-174058",
            "sha256": "9a33a003cb899506953d12ae85c9a0f464d58ef70fae013b7658035ea85160ee",
            "quote": "n closing price of $26.55 and (3) the number of unvested RSUs multiplied by our closing stock price of $26.55 as of April 1, 2026. The realizable val"
          }
        ]
      },
      {
        "securityId": "ref_DERM",
        "ticker": "DERM",
        "cik": "0001867066",
        "issuer": "Journey Medical Corp",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:DERM:2021-11-12",
        "masterRowSet": [
          "tiingo:NASDAQ:DERM:2014-10-03",
          "tiingo:NASDAQ:DERM:2021-11-12"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-11-12",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-11-12",
          "checkedTo": "2026-10-23",
          "bars": 259,
          "pointsSha256": "16816c67c5395ba84e8e2f3b8e7a1912e927e1dfb5024f4f2e3a3267011914b2"
        },
        "lastConfirmedCover": {
          "accession": "0001104659-26-094948",
          "filingDate": "2026-08-12",
          "sha256": "8ef714eea72b30e5505ea9b94a4e2f19157e9691208905c94a87ec5c5206f17c"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2021-12-31",
          "lastMatch": "2023-12-29",
          "maxGapDays": 957
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001104659-26-094948",
            "url": "https://www.sec.gov/Archives/edgar/data/1867066/000110465926094948/derm-20260630x10q.htm",
            "sha256": "8ef714eea72b30e5505ea9b94a4e2f19157e9691208905c94a87ec5c5206f17c",
            "sha256Normalized": "69967549dcd87ba13827e933175d7ffce733c3c646164204e069f6e1ddc4c042",
            "bytesRead": 1971114,
            "complete": true,
            "claim": "10-Q 2026-08-12 cover: DERM / Common Stock, par value $0.0001 per share / NASDAQ"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001104659-21-128950",
            "url": "https://www.sec.gov/Archives/edgar/data/1867066/000110465921128950/tm2122275-8_s1.htm",
            "sha256": "f31bbf8fca19ca68c366497494e71c750406493f406eaa3102c3c0574630b23f",
            "sha256Normalized": "f31bbf8fca19ca68c366497494e71c750406493f406eaa3102c3c0574630b23f",
            "bytesRead": 2097152,
            "complete": false,
            "claim": " $ and $ per share of our common stock. We have applied to list our common stock on The Nasdaq Capital Market under the symbol “DERM.” We are an “emerging growth company” as defined in the Jumpstart Our Business Startups Act and may elect to comply with certain reduced reporting "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-22-052087",
            "url": "https://www.sec.gov/Archives/edgar/data/1867066/000110465922052087/tm2213128d1_def14a.htm",
            "sha256": "887d733f08904cb0962ab8587b3b76d0b33dc776fb4c7df2159e44d235ba203e",
            "sha256Normalized": "887d733f08904cb0962ab8587b3b76d0b33dc776fb4c7df2159e44d235ba203e",
            "bytesRead": 381913,
            "complete": true,
            "claim": "DEF 14A 2022-04-28: closing price $5.38 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-23-053054",
            "url": "https://www.sec.gov/Archives/edgar/data/1867066/000110465923053054/tm232140-1_def14a.htm",
            "sha256": "2b0a38d1f9993ac91873f55a03401ba9dcad07ba761eebccc40b812e1caa521b",
            "sha256Normalized": "db349e8a1cc0fce3abede29b42d5dfd4f4ff694844abffec999d223a2e1e1149",
            "bytesRead": 679163,
            "complete": true,
            "claim": "DEF 14A 2023-04-28: closing price $1.92 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-24-054010",
            "url": "https://www.sec.gov/Archives/edgar/data/1867066/000110465924054010/tm242869-1_def14a.htm",
            "sha256": "08573015daa9740be0b6418c723369286767eb5808d81f21f13702b5d9970677",
            "sha256Normalized": "f2883f645e5ad0fc2bcf3c71f5caa65176041a122de62f379940ec0a5d94ff20",
            "bytesRead": 555384,
            "complete": true,
            "claim": "DEF 14A 2024-04-29: closing price $5.76 on 2023-12-29"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 5.38,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              5.38
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-22-052087",
            "sha256": "887d733f08904cb0962ab8587b3b76d0b33dc776fb4c7df2159e44d235ba203e",
            "quote": "024 and November 15, 2024. (4) The market value of stock awards is based on the closing price of our common stock on December 31, 2021 (the last business day of our completed fiscal year) which was $5.38 per share. Certain "
          },
          {
            "date": "2022-12-31",
            "rawPrice": 1.92,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              1.92
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-23-053054",
            "sha256": "2b0a38d1f9993ac91873f55a03401ba9dcad07ba761eebccc40b812e1caa521b",
            "quote": "option was fully vested. ​ (2) The market value of stock awards is based on the closing price of our common stock on December 31, 2022 (the last business day of our completed fiscal year) which was $1.92 per share. ​ (3) Re"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 5.76,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              5.76
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-24-054010",
            "sha256": "08573015daa9740be0b6418c723369286767eb5808d81f21f13702b5d9970677",
            "quote": "4) ​ ​ ​ ​ $ 216,000 ​ ​ ​ (1) The market value of stock awards is based on the closing price of our common stock on December 29, 2023 (the last business day of our completed fiscal year) which was $5.76 per share. ​ (2) Th"
          }
        ]
      },
      {
        "securityId": "ref_DOW",
        "ticker": "DOW",
        "cik": "0001751788",
        "issuer": "DOW INC.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:DOW:2019-03-20",
        "masterRowSet": [
          "tiingo:NYSE:DOW:1972-06-01",
          "tiingo:NYSE:DOW:2019-03-20"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-07-12",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-07-12",
          "checkedTo": "2026-10-23",
          "bars": 120,
          "pointsSha256": "0222736c1ce894e35d285e178f9db0a5be404138b5951eb393b27fa1e5f88700"
        },
        "lastConfirmedCover": {
          "accession": "0001751788-26-000160",
          "filingDate": "2026-10-23",
          "sha256": "c703ec6a6531f1602315a457c5400acd65ef9d871fcba4762a27b18d11702b8a"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2026-07-09",
          "lastMatch": "2026-07-09",
          "maxGapDays": 106
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001751788-26-000160",
            "url": "https://www.sec.gov/Archives/edgar/data/1751788/000175178826000160/dow-20260930.htm",
            "sha256": "c703ec6a6531f1602315a457c5400acd65ef9d871fcba4762a27b18d11702b8a",
            "sha256Normalized": "c703ec6a6531f1602315a457c5400acd65ef9d871fcba4762a27b18d11702b8a",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-10-23 cover: DOW / Common Stock, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001751788-19-000031",
            "url": "https://www.sec.gov/Archives/edgar/data/1751788/000175178819000031/dowinc-q3x9302019.htm",
            "sha256": "db481033a9360eec23d1a52963aa21cbf0a6f82587de10032fb581e4869e32c4",
            "sha256Normalized": "0e8e6ccddbfce8f6ee4dd6640f90da8bbe041a22bfc2238938a65f66336450cf",
            "bytesRead": 4616733,
            "complete": true,
            "claim": "DOW / Common Stock, par value $0.01 per share / NYSE"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-300936",
            "url": "https://www.sec.gov/Archives/edgar/data/1751788/000119312526300936/d154928d424b5.htm",
            "sha256": "c5528e1b61ab05c1d92c7a9c14c4b3e8749fd13e753f04e109e9f701ddd1af61",
            "sha256Normalized": "c5528e1b61ab05c1d92c7a9c14c4b3e8749fd13e753f04e109e9f701ddd1af61",
            "bytesRead": 572601,
            "complete": true,
            "claim": "424B5 2026-07-10: closing price $28.5 on 2026-07-09"
          }
        ],
        "priceEvidence": [
          {
            "date": "2026-07-09",
            "rawPrice": 28.5,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-07-09",
              28.5
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-300936",
            "sha256": "c5528e1b61ab05c1d92c7a9c14c4b3e8749fd13e753f04e109e9f701ddd1af61",
            "quote": "mmon Stock is listed on the New York Stock Exchange under the symbol “DOW.” The last reported closing price of our Common Stock on the New York Stock Exchange on July 9, 2026 was $28.50 per share. Investin"
          }
        ]
      },
      {
        "securityId": "ref_EE",
        "ticker": "EE",
        "cik": "0001888447",
        "issuer": "Excelerate Energy, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:EE:2022-04-13",
        "masterRowSet": [
          "tiingo:NYSE:EE:1989-07-07",
          "tiingo:NYSE:EE:2022-04-13"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, $0.001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-04-14",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-04-14",
          "checkedTo": "2026-10-23",
          "bars": 237,
          "pointsSha256": "2ed99dddf3671f5132428578c675d6659c4fb90bec083a4d7de07e02a971635d"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-338466",
          "filingDate": "2026-08-06",
          "sha256": "e665393776f8f990805948bc7bb00ee46210257638a764f447dcdbec6fd1d54a"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2023-12-29",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-338466",
            "url": "https://www.sec.gov/Archives/edgar/data/1888447/000119312526338466/ee-20260630.htm",
            "sha256": "e665393776f8f990805948bc7bb00ee46210257638a764f447dcdbec6fd1d54a",
            "sha256Normalized": "e665393776f8f990805948bc7bb00ee46210257638a764f447dcdbec6fd1d54a",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-08-06 cover: EE / Class A Common Stock, $0.001 par value per share / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001140361-22-000986",
            "url": "https://www.sec.gov/Archives/edgar/data/1888447/000114036122000986/ny20000051x5_s1.htm",
            "sha256": "5f5fa6d652229634f672e7d58b64c47201995597c2c7e2d2a4c735b55b50a037",
            "sha256Normalized": "5f5fa6d652229634f672e7d58b64c47201995597c2c7e2d2a4c735b55b50a037",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ass A share. We intend to apply to list our Class A common stock on the New York Stock Exchange (the “NYSE’’) under the symbol “EE.” Each share of Class A common stock and Class B common stock will entitle the holder to one vote. The Class B common stockholder will hold % of the "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-044811",
            "url": "https://www.sec.gov/Archives/edgar/data/1888447/000095017024044811/ee-20240416.htm",
            "sha256": "10a45fadeb49f1c8bf7d873be543fab6b8606f9536465f317b036d4be1231e2c",
            "sha256Normalized": "16df8837d15f003c4610e93b89b7d2af955fe67c8d8512b7cdde7b45bf4ecc53",
            "bytesRead": 1528085,
            "complete": true,
            "claim": "DEF 14A 2024-04-16: closing price $15.46 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-159047",
            "url": "https://www.sec.gov/Archives/edgar/data/1888447/000119312526159047/ee-20260416.htm",
            "sha256": "a628bbaf28d512af8670a38bff89f41d315241296723f7086a215700c480d6e2",
            "sha256Normalized": "a628bbaf28d512af8670a38bff89f41d315241296723f7086a215700c480d6e2",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-04-16: closing price $28.05 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-12-29",
            "rawPrice": 15.46,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              15.46
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-044811",
            "sha256": "10a45fadeb49f1c8bf7d873be543fab6b8606f9536465f317b036d4be1231e2c",
            "quote": "r share of the Company’s common stock on the date of the event was equal to the closing price of the Company’s common stock on December 29, 2023 ($15.46). (3) These amounts"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 28.05,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              28.05
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-159047",
            "sha256": "a628bbaf28d512af8670a38bff89f41d315241296723f7086a215700c480d6e2",
            "quote": "of options that would have accelerated multiplied by the difference between the closing price of the Company’s Class A common stock on December 31, 2025 ($28.05) and the exercise p"
          }
        ]
      },
      {
        "securityId": "ref_ESI",
        "ticker": "ESI",
        "cik": "0001590714",
        "issuer": "Element Solutions Inc",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:ESI:2013-10-22",
        "masterRowSet": [
          "tiingo:NYSE:ESI:2013-10-22",
          "tiingo:NYSE:ESI:2019-01-31"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2019-03-01",
        "validTo": null,
        "intervalBasis": [
          "EARLIEST_FULLTEXT_TICKER_CONFIRMATION"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2019-03-01",
          "checkedTo": "2026-10-23",
          "bars": 400,
          "pointsSha256": "cffd49dbd8d84763850ead1ead85a6ebdee0b90e381c0ee9ad487a3744a35afc"
        },
        "lastConfirmedCover": {
          "accession": "0001590714-26-000073",
          "filingDate": "2026-10-22",
          "sha256": "221645255156dbefb213f791b9f3bee9cd2aed12da7e94d7a0d101cce2298e1a"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2020-12-31",
          "lastMatch": "2021-12-31",
          "maxGapDays": 1756
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001590714-26-000073",
            "url": "https://www.sec.gov/Archives/edgar/data/1590714/000159071426000073/esi-20260930.htm",
            "sha256": "221645255156dbefb213f791b9f3bee9cd2aed12da7e94d7a0d101cce2298e1a",
            "sha256Normalized": "90b16ad0742ca17db703f97c661068f5f7d62ec308ad740b64f65c7d66c854c3",
            "bytesRead": 1511030,
            "complete": true,
            "claim": "10-Q 2026-10-22 cover: ESI / Common Stock, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001590714-19-000040",
            "url": "https://www.sec.gov/Archives/edgar/data/1590714/000159071419000040/esi10-k20181231document.htm",
            "sha256": "ea3deb3e4fb0a3269b0c056d03c425ac748bdd68d94f43c11c5d9bffc653965c",
            "sha256Normalized": "ea3deb3e4fb0a3269b0c056d03c425ac748bdd68d94f43c11c5d9bffc653965c",
            "bytesRead": 2097152,
            "complete": false,
            "claim": " and Issuer Purchases of Equity Securities Market for our Common Stock Our common stock is traded on the NYSE under the symbol “ESI.” On February 22, 2019 , there were approximately 313 registered holders of record of our common stock, par value $0.01 per share. On February 22, 2"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001590714-21-000038",
            "url": "https://www.sec.gov/Archives/edgar/data/1590714/000159071421000038/esi2021noticeproxystatement.htm",
            "sha256": "22079bc7d6982e0e000074348156037e347c8a0aa1dc4a5dc332faa39cdac209",
            "sha256Normalized": "2db7f5da6aca11215c64a5a41ce27f60d8abe2fb49c54d052d86e4a659eb62c3",
            "bytesRead": 1179586,
            "complete": true,
            "claim": "DEF 14A 2021-04-28: closing price $17.73 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001590714-22-000038",
            "url": "https://www.sec.gov/Archives/edgar/data/1590714/000159071422000038/esi2022noticeproxystatement.htm",
            "sha256": "320f2ac9e12153ee2d6be1a6738330fc21f0b9c652d3da2a5ba4fe3b4b76ca47",
            "sha256Normalized": "082dd3b3ae221454945b9263e85e85e35f726fd86acd673d196e5e62d55c0fc7",
            "bytesRead": 1148855,
            "complete": true,
            "claim": "DEF 14A 2022-04-22: closing price $24.28 on 2021-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 17.73,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              17.73
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001590714-21-000038",
            "sha256": "22079bc7d6982e0e000074348156037e347c8a0aa1dc4a5dc332faa39cdac209",
            "quote": "December 31, 2020. The value for PRSUs and RSUs was calculated using the $17.73 closing price per share of the Company's common stock on December 31, 2020. The value of each SOPs was calculated using the $17.73 closing price on De"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 24.28,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              24.28
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001590714-22-000038",
            "sha256": "320f2ac9e12153ee2d6be1a6738330fc21f0b9c652d3da2a5ba4fe3b4b76ca47",
            "quote": "December 31, 2021. The value for PRSUs and RSUs was calculated using the $24.28 closing price per share of the Company's common stock on December 31, 2021. The value of each SOPs was calculated using the $24.28 closing price on De"
          }
        ]
      },
      {
        "securityId": "ref_EVER",
        "ticker": "EVER",
        "cik": "0001640428",
        "issuer": "EverQuote, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:EVER:2018-06-28",
        "masterRowSet": [
          "tiingo:NASDAQ:EVER:2012-05-03",
          "tiingo:NASDAQ:EVER:2018-06-28"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, $0.001 Par Value Per Share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2018-06-29",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2018-06-29",
          "checkedTo": "2026-10-23",
          "bars": 435,
          "pointsSha256": "9342ba54acdb31ab74b00699c83eaca5bc93cc752b26ae453507035b4b4b0f19"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-332775",
          "filingDate": "2026-08-04",
          "sha256": "10930105575e9e6641f6d3c48eaac4635872505c9de7fb21260c8f4cb35adc36"
        },
        "anchorGaps": {
          "matchDates": 6,
          "firstMatch": "2018-06-29",
          "lastMatch": "2025-12-31",
          "maxGapDays": 1463
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-332775",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312526332775/ever-20260630.htm",
            "sha256": "10930105575e9e6641f6d3c48eaac4635872505c9de7fb21260c8f4cb35adc36",
            "sha256Normalized": "d4b403672d26d0991fbb813c62a55f18d0c6c058279d3fee901582211df47ea9",
            "bytesRead": 2404721,
            "complete": true,
            "claim": "10-Q 2026-08-04 cover: EVER / Class A Common Stock, $0.001 Par Value Per Share / The Nasdaq Global Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-18-181837",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312518181837/d551802ds1.htm",
            "sha256": "4e26d393484b837c2af8a8c612bcbfeca92e599c0c41cd46d3399b9ba94b630f",
            "sha256Normalized": "4e26d393484b837c2af8a8c612bcbfeca92e599c0c41cd46d3399b9ba94b630f",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ck Exchange listing rules. We intend to apply to list our Class A common stock on the New York Stock Exchange under the symbol “EVER”. Per share Total Initial public offering price $ $ Underwriting discounts and commissions $ $ Proceeds to EverQuote, before expenses $ $ Proceeds "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-19-094588",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312519094588/d683980d10k.htm",
            "sha256": "b83afcd94d5c3be3abeb06d41bc201df0352d2dac8c8b0baf4a30a806aada2c2",
            "sha256Normalized": "b83afcd94d5c3be3abeb06d41bc201df0352d2dac8c8b0baf4a30a806aada2c2",
            "bytesRead": 916296,
            "complete": true,
            "claim": "10-K 2019-04-01: closing price $18.12 on 2018-06-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-20-072378",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312520072378/d854488d10k.htm",
            "sha256": "98d74f2150bdded58aef63f676020442c1af03add680719ebbf0df4e95fa439e",
            "sha256Normalized": "98d74f2150bdded58aef63f676020442c1af03add680719ebbf0df4e95fa439e",
            "bytesRead": 889511,
            "complete": true,
            "claim": "10-K 2020-03-13: closing price $13 on 2019-06-28"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-24-021082",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000095017024021082/ever-20231231.htm",
            "sha256": "57c94fee4f17aedc30d4352653af6ad1899384b19236a09f89bb529f3ec2728e",
            "sha256Normalized": "ce83f62504e379384bcd45836bb1217118b9b43218acb7baeb9ee79490600830",
            "bytesRead": 2550494,
            "complete": true,
            "claim": "10-K 2024-02-27: closing price $6.5 on 2023-06-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-24-110178",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312524110178/d736522ddef14a.htm",
            "sha256": "6abaf752a0e79f7433c3dcfd90e606d39a6ed4e705c41fe9984272b67dd06571",
            "sha256Normalized": "6abaf752a0e79f7433c3dcfd90e606d39a6ed4e705c41fe9984272b67dd06571",
            "bytesRead": 401292,
            "complete": true,
            "claim": "DEF 14A 2024-04-24: closing price $12.24 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950170-25-026724",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000095017025026724/ever-20241231.htm",
            "sha256": "2466fc309813035fee56d8695de6f302400a65bae8731958a9c69c00bd8eeb49",
            "sha256Normalized": "e01ff8aa54602b08643192e041c119c42e82a8e4595dbaa40edad4a3d6c9b8db",
            "bytesRead": 2938087,
            "complete": true,
            "claim": "10-K 2025-02-25: closing price $20.86 on 2024-06-28"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-173669",
            "url": "https://www.sec.gov/Archives/edgar/data/1640428/000119312526173669/d60575ddef14a.htm",
            "sha256": "456cc20d22a37f65367281777585b396911ce1da330f7619894e325bf94f4fe9",
            "sha256Normalized": "dd5904d2709f1c4878c3771309224fb89f7747e88990e0c9dc037e41897d6564",
            "bytesRead": 820135,
            "complete": true,
            "claim": "DEF 14A 2026-04-23: closing price $27 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2018-06-29",
            "rawPrice": 18.12,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2018-06-29",
              18.12
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-19-094588",
            "sha256": "b83afcd94d5c3be3abeb06d41bc201df0352d2dac8c8b0baf4a30a806aada2c2",
            "quote": "e market value of its Class A common stock and Class B common stock (based on a closing price of $18.12 per share on June 29, 2018 as reported on the "
          },
          {
            "date": "2019-06-28",
            "rawPrice": 13,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2019-06-28",
              13
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-20-072378",
            "sha256": "98d74f2150bdded58aef63f676020442c1af03add680719ebbf0df4e95fa439e",
            "quote": "e market value of its Class A common stock and Class B common stock (based on a closing price of $13.00 per share on June 28, 2019 as reported on the "
          },
          {
            "date": "2023-06-30",
            "rawPrice": 6.5,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-06-30",
              6.5
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-24-021082",
            "sha256": "57c94fee4f17aedc30d4352653af6ad1899384b19236a09f89bb529f3ec2728e",
            "quote": "e market value of its Class A common stock and Class B common stock (based on a closing price of $6.50 per share on June 30, 2023 as reported on the "
          },
          {
            "date": "2023-12-29",
            "rawPrice": 12.24,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              12.24
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-110178",
            "sha256": "6abaf752a0e79f7433c3dcfd90e606d39a6ed4e705c41fe9984272b67dd06571",
            "quote": "et value of unvested RSUs held by each NEO as of December 31, 2023 based on the closing price of our Class A common stock on December 29, 2023, which was $12.24 per share. Such RSU"
          },
          {
            "date": "2024-06-28",
            "rawPrice": 20.86,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-06-28",
              20.86
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950170-25-026724",
            "sha256": "2466fc309813035fee56d8695de6f302400a65bae8731958a9c69c00bd8eeb49",
            "quote": "e market value of its Class A common stock and Class B common stock (based on a closing price of $20.86 per share on June 28, 2024 as reported on the "
          },
          {
            "date": "2025-12-31",
            "rawPrice": 27,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              27
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-173669",
            "sha256": "456cc20d22a37f65367281777585b396911ce1da330f7619894e325bf94f4fe9",
            "quote": "ed RSUs and stock options held by each NEO as of December 31, 2025 based on the closing price of our Class A common stock on December 31, 2025, which was $27.00 per share. Such RSU"
          }
        ]
      },
      {
        "securityId": "ref_FBRT",
        "ticker": "FBRT",
        "cik": "0001562528",
        "issuer": "Franklin BSP Realty Trust, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:FBRT:2021-10-19",
        "masterRowSet": [
          "tiingo:NYSE:FBRT:2021-03-24",
          "tiingo:NYSE:FBRT:2021-10-19"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-10-22",
        "validTo": null,
        "intervalBasis": [
          "SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-10-22",
          "checkedTo": "2026-10-23",
          "bars": 262,
          "pointsSha256": "c6fbefd1ba77d50d6a2dab07ee7df76c1f337cc82494eedfd36d798a692b5482"
        },
        "lastConfirmedCover": {
          "accession": "0001562528-26-000024",
          "filingDate": "2026-07-29",
          "sha256": "1d9a10612c2c26011f9233cb9e8fdcae9a3d3ee90d207d675c5213b33341bab1"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2022-12-30",
          "lastMatch": "2025-12-31",
          "maxGapDays": 704
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001562528-26-000024",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000156252826000024/bsprt-20260630.htm",
            "sha256": "1d9a10612c2c26011f9233cb9e8fdcae9a3d3ee90d207d675c5213b33341bab1",
            "sha256Normalized": "1d9a10612c2c26011f9233cb9e8fdcae9a3d3ee90d207d675c5213b33341bab1",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-07-29 cover: FBRT / Common Stock, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001104659-21-128156",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000110465921128156/tm2130593d1_8k.htm",
            "sha256": "c034780be10c63fe9cc91c17c8cda7003b2b39e279b60592210d83d271306618",
            "sha256Normalized": "dfdf37df4d2a54ac23f25ff2386219027c4ad16fca32943a9845af965cd9b321",
            "bytesRead": 51770,
            "complete": true,
            "claim": "FBRT / Common Stock, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-106497",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000119312523106497/d427663ddef14a.htm",
            "sha256": "cc6046fc9c2ea66b0be1d13ba31eba02440bda44bad61794c237f4febcc22fa4",
            "sha256Normalized": "598edd9f29a0173d6e2f1a3ecad755e544461c9a9ef9c84a8b092090799e4734",
            "bytesRead": 809337,
            "complete": true,
            "claim": "DEF 14A 2023-04-19: closing price $12.9 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-24-098606",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000119312524098606/d816766ddef14a.htm",
            "sha256": "5533f0ca081d5b04c9047567dca3bfb96aac4ecef636a2d7150aad70c4dab59b",
            "sha256Normalized": "3845f148dc41a098fb02876855d9699b7fc021218e8ce425fd9236ad3eb59b8e",
            "bytesRead": 832663,
            "complete": true,
            "claim": "DEF 14A 2024-04-17: closing price $14.24 on 2023-01-27"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-25-081535",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000119312525081535/d900957ddef14a.htm",
            "sha256": "a83f4b95e14fa95462d5415b486ffb9f266c3d72affa18ff251189a772600462",
            "sha256Normalized": "31d8fe6fb9613963aac654e9f6301e728c4255502ac3fc2959264194f8fe4ca1",
            "bytesRead": 851343,
            "complete": true,
            "claim": "DEF 14A 2025-04-15: closing price $13.45 on 2024-01-27"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-161379",
            "url": "https://www.sec.gov/Archives/edgar/data/1562528/000119312526161379/d81559ddef14a.htm",
            "sha256": "26a20a7fc588e34c3d12e15cb51bd28f282d8cfc049a69d76d84b1dc689ec880",
            "sha256Normalized": "fbaf582971cb553b836996db608ed70a3777fb27223bfb720f7cf68b10616f71",
            "bytesRead": 830657,
            "complete": true,
            "claim": "DEF 14A 2026-04-17: closing price $10.03 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 12.9,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              12.9
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-106497",
            "sha256": "cc6046fc9c2ea66b0be1d13ba31eba02440bda44bad61794c237f4febcc22fa4",
            "quote": "ect to continuing service. (2) The amount reported in this column is based on a closing price of $12.90 per share of our Common Stock on December 30, 2022. Option Exercises a"
          },
          {
            "date": "2023-01-27",
            "rawPrice": 14.24,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-01-27",
              14.24
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-098606",
            "sha256": "5533f0ca081d5b04c9047567dca3bfb96aac4ecef636a2d7150aad70c4dab59b",
            "quote": "Baglien 19,685 $ 280,314 (1) The amount reported in this column is based on the closing price of $14.24 per share of our Common Stock on January 27, 2023. Potential Payments"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 13.51,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              13.51
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-098606",
            "sha256": "5533f0ca081d5b04c9047567dca3bfb96aac4ecef636a2d7150aad70c4dab59b",
            "quote": "ect to continuing service. (2) The amount reported in this column is based on a closing price of $13.51 per share of our Common Stock on December 29, 2023. Option Exercises a"
          },
          {
            "date": "2024-01-27",
            "rawPrice": 13.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-01-26",
              13.35
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 0.992565,
            "accession": "0001193125-25-081535",
            "sha256": "a83f4b95e14fa95462d5415b486ffb9f266c3d72affa18ff251189a772600462",
            "quote": ". Baglien 37,381 502,774 (1) The amount reported in this column is based on the closing price of $13.45 per share of our Common Stock on January 27, 2024. Potential Payments"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 10.03,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              10.03
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-161379",
            "sha256": "26a20a7fc588e34c3d12e15cb51bd28f282d8cfc049a69d76d84b1dc689ec880",
            "quote": "ect to continuing service. (2) The amount reported in this column is based on a closing price of $10.03 per share of our Common Stock on December 31, 2025. Stock Vested in 20"
          }
        ]
      },
      {
        "securityId": "ref_FRSH",
        "ticker": "FRSH",
        "cik": "0001544522",
        "issuer": "Freshworks Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:FRSH:2021-09-22",
        "masterRowSet": [
          "tiingo:NASDAQ:FRSH:2014-05-02",
          "tiingo:NASDAQ:FRSH:2021-09-22"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, par value $0.00001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-09-24",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-09-24",
          "checkedTo": "2026-10-23",
          "bars": 266,
          "pointsSha256": "0e033951b34a49e07d44ac1149699b2085b0961c4302ce7c5bc09692981f6d20"
        },
        "lastConfirmedCover": {
          "accession": "0001544522-26-000137",
          "filingDate": "2026-08-04",
          "sha256": "3b9142e38d1ef32ff0b331554b418e68ab34b75ed16f0a17973beaa68e519e6c"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2022-12-30",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001544522-26-000137",
            "url": "https://www.sec.gov/Archives/edgar/data/1544522/000154452226000137/frsh-20260630.htm",
            "sha256": "3b9142e38d1ef32ff0b331554b418e68ab34b75ed16f0a17973beaa68e519e6c",
            "sha256Normalized": "21c440cf797d5a92f200ca1c845fc8fa63daab7df706157dc67163cb34d22abf",
            "bytesRead": 1606529,
            "complete": true,
            "claim": "10-Q 2026-08-04 cover: FRSH / Class A common stock, par value $0.00001 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001628280-21-017717",
            "url": "https://www.sec.gov/Archives/edgar/data/1544522/000162828021017717/freshworkss-1.htm",
            "sha256": "b7592b67f88adf0a218e24928785c0741210dfc6e42826ee9f0eee64957e1d0e",
            "sha256Normalized": "b7592b67f88adf0a218e24928785c0741210dfc6e42826ee9f0eee64957e1d0e",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "etween $ and $ per share. We have applied to list our Class A common stock on the Nasdaq Global Select Market under the symbol “FRSH.” We have two classes of authorized common stock: Class A common stock and Class B common stock. The rights of the holders of Class A common stock "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001544522-23-000028",
            "url": "https://www.sec.gov/Archives/edgar/data/1544522/000154452223000028/frsh-20230421.htm",
            "sha256": "772f6ae9844d1ca0b2c2634adcea06d5bc5b85937f8a815088fe262c8519fad7",
            "sha256Normalized": "cb330dbd3a9ee8995f5b0ba645a3b4f0843eb66af9e2ebb9a43b786f57ee17da",
            "bytesRead": 914036,
            "complete": true,
            "claim": "DEF 14A 2023-04-21: closing price $14.71 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001544522-24-000025",
            "url": "https://www.sec.gov/Archives/edgar/data/1544522/000154452224000025/frsh-20240419.htm",
            "sha256": "e890847e21eee2f2d251a046f3e56e7651d24ac3014d0bd3c930ea68a01ed3b3",
            "sha256Normalized": "f00e2fe0dcd49bcd2041c6d5c1d2798043048c9654833eeea6a94cda5ffeeda7",
            "bytesRead": 894679,
            "complete": true,
            "claim": "DEF 14A 2024-04-19: closing price $23.49 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001544522-26-000075",
            "url": "https://www.sec.gov/Archives/edgar/data/1544522/000154452226000075/frsh-20260409.htm",
            "sha256": "3526e4de900fb9c746376cccfb23060a1e09bd9ade9eb33f97747dacc973ad42",
            "sha256Normalized": "ed989a8391b197b3d407df9ae328173f0aaeb6f562fe84960458b7c930d7ee1c",
            "bytesRead": 964597,
            "complete": true,
            "claim": "DEF 14A 2026-04-09: closing price $12.25 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 14.71,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              14.71
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001544522-23-000028",
            "sha256": "772f6ae9844d1ca0b2c2634adcea06d5bc5b85937f8a815088fe262c8519fad7",
            "quote": "1) The value of stock option and RSU award vesting acceleration is based on the closing price of $14.71 per share of our Class A common stock as of December 30, 2022 (the last business "
          },
          {
            "date": "2023-12-29",
            "rawPrice": 23.49,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              23.49
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001544522-24-000025",
            "sha256": "e890847e21eee2f2d251a046f3e56e7651d24ac3014d0bd3c930ea68a01ed3b3",
            "quote": "er of PRSUs that have not vested or have not been earned, as applicable, by the closing price ($23.49) of our Class A common stock on December 29, 2023, the last trading d"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 12.25,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              12.25
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001544522-26-000075",
            "sha256": "3526e4de900fb9c746376cccfb23060a1e09bd9ade9eb33f97747dacc973ad42",
            "quote": "of stock option, RSU award, and PRSU award vesting acceleration is based on the closing price of $12.25 per share of our Class A common stock as of December 31, 2025, minus, in the case"
          }
        ]
      },
      {
        "securityId": "ref_FSBC",
        "ticker": "FSBC",
        "cik": "0001275168",
        "issuer": "FIVE STAR BANCORP",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:FSBC:2021-05-04",
        "masterRowSet": [
          "tiingo:NASDAQ:FSBC:2007-08-31",
          "tiingo:NASDAQ:FSBC:2021-05-04"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, no par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-05-07",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-05-07",
          "checkedTo": "2026-10-23",
          "bars": 286,
          "pointsSha256": "2b85444e3095465212d316540ef9fe1f148e94034e79bc59845329d6cd075ff2"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-054141",
          "filingDate": "2026-08-06",
          "sha256": "2438c3b1adfabb1e899af1fe206d19182f3df58aaa8da9aacd9739f151ea171d"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2021-12-31",
          "lastMatch": "2026-07-21",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-054141",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000162828026054141/fsbc-20260630.htm",
            "sha256": "2438c3b1adfabb1e899af1fe206d19182f3df58aaa8da9aacd9739f151ea171d",
            "sha256Normalized": "2438c3b1adfabb1e899af1fe206d19182f3df58aaa8da9aacd9739f151ea171d",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-08-06 cover: FSBC / Common stock, no par value per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001552781-21-000190",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000155278121000190/e21201_fsbc-s1.htm",
            "sha256": "effd8a6b3aa544b97685ab28a99e9a83f8703a20eb41805babddd7b0ac813bff",
            "sha256Normalized": "effd8a6b3aa544b97685ab28a99e9a83f8703a20eb41805babddd7b0ac813bff",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "mon stock to be between $ and $ . We have applied to list our common stock on the Nasdaq Global Select Market under the symbol “FSBC.” In connection with the termination of our status as an S Corporation, we intend to use a portion of the net proceeds to us from this offering to "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001552781-22-000312",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000155278122000312/e22232_fsbc-def14a.htm",
            "sha256": "a86b19207f2a817fd8d02a45468698b1b010f0a2d80beae44d43e990c22d6ce6",
            "sha256Normalized": "a86b19207f2a817fd8d02a45468698b1b010f0a2d80beae44d43e990c22d6ce6",
            "bytesRead": 602238,
            "complete": true,
            "claim": "DEF 14A 2022-04-06: closing price $30 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001275168-23-000060",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000127516823000060/a_fsbc-def14aproxy2023.htm",
            "sha256": "35c4f01de21a432c0fd1480233ece8ec11e13ca1f8817f8bd020c58b251f2e6f",
            "sha256Normalized": "a78477d924164a84c276d5a1a02cf77d76a7eff0c5ea2ce55f5355d2648ea181",
            "bytesRead": 478152,
            "complete": true,
            "claim": "DEF 14A 2023-04-05: closing price $27.24 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001275168-24-000079",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000127516824000079/def14a-proxy2024.htm",
            "sha256": "cad831689d90fb81b89871ca8494f12d48c487af9eb2e11f419d9981b1eeda9f",
            "sha256Normalized": "07ed6fa0183f91854d92d9daa24a081f504a06aeb7cfa88f03923652a08ab4f3",
            "bytesRead": 467951,
            "complete": true,
            "claim": "DEF 14A 2024-04-03: closing price $26.18 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-022075",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000162828026022075/def14a-proxy2026.htm",
            "sha256": "e38ffe75f675e0e79e1e385c29b744564de69150bab3ce087d1b8124f08f5f23",
            "sha256Normalized": "1f860dcd51a1bcf9d5fc436d8dcb7882d6043eac5f2389e054009be87d81b6e5",
            "bytesRead": 423320,
            "complete": true,
            "claim": "DEF 14A 2026-03-30: closing price $35.78 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001552781-26-000393",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000155278126000393/e26307_fsbc-424b5.htm",
            "sha256": "3c3b76fbb744732c2097cdfd4afbaa68cb9580365c88010e35ee412b02cb7ca3",
            "sha256Normalized": "3c3b76fbb744732c2097cdfd4afbaa68cb9580365c88010e35ee412b02cb7ca3",
            "bytesRead": 711220,
            "complete": true,
            "claim": "424B5 2026-07-23: closing price $49.33 on 2026-07-21"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001552781-26-000388",
            "url": "https://www.sec.gov/Archives/edgar/data/1275168/000155278126000388/e26304_fsbc-424b5.htm",
            "sha256": "9528e21ed08a99f170ff1be042be9c58b6a93b517df9973018132a47a837d16c",
            "sha256Normalized": "9528e21ed08a99f170ff1be042be9c58b6a93b517df9973018132a47a837d16c",
            "bytesRead": 713420,
            "complete": true,
            "claim": "424B5 2026-07-22: closing price $49.33 on 2026-07-21"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 30,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              30
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001552781-22-000312",
            "sha256": "a86b19207f2a817fd8d02a45468698b1b010f0a2d80beae44d43e990c22d6ce6",
            "quote": "quity incentive plan. (2) The market value for our common stock is based on the closing price of our common stock on December 31, 2021 as reported by Nasdaq, which was $30.00 per share. These sh"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 27.24,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              27.24
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001275168-23-000060",
            "sha256": "35c4f01de21a432c0fd1480233ece8ec11e13ca1f8817f8bd020c58b251f2e6f",
            "quote": "quity incentive plan. (2) The market value for our common stock is based on the closing price of our common stock on December 30, 2022 as reported by Nasdaq, which was $27.24 per share. These sh"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 26.18,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              26.18
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001275168-24-000079",
            "sha256": "cad831689d90fb81b89871ca8494f12d48c487af9eb2e11f419d9981b1eeda9f",
            "quote": "n (as defined below). (2) The market value for our common stock is based on the closing price of our common stock on December 29, 2023 as reported by Nasdaq, which was $26.18 per share. These sh"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 35.78,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              35.78
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-022075",
            "sha256": "e38ffe75f675e0e79e1e385c29b744564de69150bab3ce087d1b8124f08f5f23",
            "quote": "depending on performance. The market value for our common stock is based on the closing price of our common stock on December 31, 2025 as reported by Nasdaq, which was $35.78 per share. Name Gra"
          },
          {
            "date": "2026-07-21",
            "rawPrice": 49.33,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-07-21",
              49.33
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001552781-26-000393",
            "sha256": "3c3b76fbb744732c2097cdfd4afbaa68cb9580365c88010e35ee412b02cb7ca3",
            "quote": "ted on the Nasdaq Global Select Market, or Nasdaq, under the symbol “FSBC.” The last reported closing price of our common stock on Nasdaq on July 21, 2026 was $49.33 per share. We are a"
          },
          {
            "date": "2026-07-21",
            "rawPrice": 49.33,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-07-21",
              49.33
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001552781-26-000388",
            "sha256": "9528e21ed08a99f170ff1be042be9c58b6a93b517df9973018132a47a837d16c",
            "quote": "ted on the Nasdaq Global Select Market, or Nasdaq, under the symbol “FSBC.” The last reported closing price of our common stock on Nasdaq on July 21, 2026 was $49.33 per share. We are a"
          }
        ]
      },
      {
        "securityId": "ref_HCC",
        "ticker": "HCC",
        "cik": "0001691303",
        "issuer": "WARRIOR MET COAL, INC.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:HCC:2017-04-10",
        "masterRowSet": [
          "tiingo:NYSE:HCC:1992-10-28",
          "tiingo:NYSE:HCC:2017-04-10"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2017-07-07",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "CONCATENATION_GUARD"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2017-07-07",
          "checkedTo": "2026-10-23",
          "bars": 486,
          "pointsSha256": "51ece0edf1d6ed5bbfc36e2474a5124a024703784307f53af065d4109c6016b7"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-335324",
          "filingDate": "2026-08-05",
          "sha256": "4a64429a7dbd81eab65f27e13a14011661ee7ad96b3c4b8bd1599bb663b9cba0"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2017-12-29",
          "lastMatch": "2022-12-30",
          "maxGapDays": 1314
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-335324",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000119312526335324/hcc-20260630.htm",
            "sha256": "4a64429a7dbd81eab65f27e13a14011661ee7ad96b3c4b8bd1599bb663b9cba0",
            "sha256Normalized": "3ebefe22d408ada45f18465314f617877308b4e4095be15c9e54fb31cb5d892a",
            "bytesRead": 2239422,
            "complete": true,
            "claim": "10-Q 2026-08-05 cover: HCC / Common Stock, par value $.01 per share / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-17-072810",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000119312517072810/d501786ds1.htm",
            "sha256": "c6633bc95798c86176793b073687a1db8d790a8eed33f4b356e824c3628e1c3a",
            "sha256Normalized": "c6633bc95798c86176793b073687a1db8d790a8eed33f4b356e824c3628e1c3a",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "will be between $ and $ per share. We intend to apply to list our common stock on the New York Stock Exchange under the symbol “HCC.” The underwriters may also purchase up to additional shares from the selling stockholders at the initial public offering price, less the underwriti"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001174947-18-000358",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000117494718000358/c488159_def14a.htm",
            "sha256": "0412ba71b84242e644ead8f15275013918e1711165d2056fe464b013c46a1a6c",
            "sha256Normalized": "0412ba71b84242e644ead8f15275013918e1711165d2056fe464b013c46a1a6c",
            "bytesRead": 780737,
            "complete": true,
            "claim": "DEF 14A 2018-03-12: closing price $25.15 on 2017-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-21-036012",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000110465921036012/tm219535d1_def14a.htm",
            "sha256": "171c70b4eab5e3139ca7c0983526ebd3d7aa3de74864a5fcc1e331bc976ab37f",
            "sha256Normalized": "171c70b4eab5e3139ca7c0983526ebd3d7aa3de74864a5fcc1e331bc976ab37f",
            "bytesRead": 1123127,
            "complete": true,
            "claim": "DEF 14A 2021-03-15: closing price $21.32 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-22-033220",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000110465922033220/tm227966-2_def14a.htm",
            "sha256": "9db599141845a739f78f35cce1dd774bf6cc93bd4dba44b97f5dabeccbee3416",
            "sha256Normalized": "ea86ed424178dbde6658650954dba065d32684617f099d4d2123c01cc23cef50",
            "bytesRead": 2001180,
            "complete": true,
            "claim": "DEF 14A 2022-03-14: closing price $25.71 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-068562",
            "url": "https://www.sec.gov/Archives/edgar/data/1691303/000119312523068562/d180426ddef14a.htm",
            "sha256": "063a8e860f0560d012bffd612f99f725132f1993776d91e8841a8a9a08048240",
            "sha256Normalized": "a0750d0a39e1d8e0273a9042a7bb625e0e2fddb2e647c46d3cc9f7c086e7794e",
            "bytesRead": 1254142,
            "complete": true,
            "claim": "DEF 14A 2023-03-13: closing price $34.64 on 2022-12-30"
          }
        ],
        "priceEvidence": [
          {
            "date": "2017-12-29",
            "rawPrice": 25.15,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2017-12-29",
              25.15
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001174947-18-000358",
            "sha256": "0412ba71b84242e644ead8f15275013918e1711165d2056fe464b013c46a1a6c",
            "quote": "ussion of the Tranche A Restricted Shares. (2) The market value is based on the closing price of our common stock on the NYSE on December 29, 2017, the last trading day of 2017, of $25.15, multiplied by the "
          },
          {
            "date": "2020-12-31",
            "rawPrice": 21.32,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              21.32
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-21-036012",
            "sha256": "171c70b4eab5e3139ca7c0983526ebd3d7aa3de74864a5fcc1e331bc976ab37f",
            "quote": "6,598 — — 2/13/2020 — — 11,876 (5) 253,196 (1) The market value is based on the closing price of our common stock on the NYSE on December 31, 2020, the last trading day of 2020, of $21.32, multiplied by the "
          },
          {
            "date": "2021-12-31",
            "rawPrice": 25.71,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              25.71
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-22-033220",
            "sha256": "9db599141845a739f78f35cce1dd774bf6cc93bd4dba44b97f5dabeccbee3416",
            "quote": "— ​ ​ ​ ​ ​ 11,149 ​ ​ ​ ​ ​ 286,641 ​ ​ ​ (1) The market value is based on the closing price of our common stock on the NYSE on December 31, 2021, the last trading day of 2021, of $25.71, multiplied by the "
          },
          {
            "date": "2022-12-30",
            "rawPrice": 34.64,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              34.64
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-068562",
            "sha256": "063a8e860f0560d012bffd612f99f725132f1993776d91e8841a8a9a08048240",
            "quote": "62,184 — — 2/17/2022 — — 9,365 (4) 324,404 (1) The market value is based on the closing price of our common stock on the NYSE on December 30, 2022, the last trading day of 2022, of $34.64, multiplied by the "
          }
        ]
      },
      {
        "securityId": "ref_HR",
        "ticker": "HR",
        "cik": "0001360604",
        "issuer": "Healthcare Realty Trust Inc",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:HR:1993-05-27",
        "masterRowSet": [
          "tiingo:NYSE:HR:1993-05-27",
          "tiingo:NYSE:HR:2012-06-06"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, $0.01 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-12-30",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "CONCATENATION_GUARD"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-12-30",
          "checkedTo": "2026-10-23",
          "bars": 200,
          "pointsSha256": "571358c0ae76425a96fc0772cca0fb9fd92096435deac74ab48fc49ea7b2846d"
        },
        "lastConfirmedCover": {
          "accession": "0001360604-26-000064",
          "filingDate": "2026-07-30",
          "sha256": "a2aaa899e2e464c26b43f93f4fa4df52a20d54ecea43d5c2ff2f04bd55ce165a"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2022-12-30",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001360604-26-000064",
            "url": "https://www.sec.gov/Archives/edgar/data/1360604/000136060426000064/hr-20260630.htm",
            "sha256": "a2aaa899e2e464c26b43f93f4fa4df52a20d54ecea43d5c2ff2f04bd55ce165a",
            "sha256Normalized": "7d7b42922f692d225892e66ddccb47d9c9e398d751bcf322b854d0e73bb8e4d7",
            "bytesRead": 1576901,
            "complete": true,
            "claim": "10-Q 2026-07-30 cover: HR / Class A Common Stock, $0.01 par value per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-22-198653",
            "url": "https://www.sec.gov/Archives/edgar/data/1360604/000119312522198653/d370743d8k.htm",
            "sha256": "cd28235615d776ced518070fdf76eb520a788b2706506ef9defa03f8eae52077",
            "sha256Normalized": "51a675fb3a8e7a18c23a56236416c0af0fb04869fe8a760d35b12bfd300d7733",
            "bytesRead": 49182,
            "complete": true,
            "claim": "HR / Class A Common Stock, $0.01 par value per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001360604-23-000032",
            "url": "https://www.sec.gov/Archives/edgar/data/1360604/000136060423000032/hr-20230424.htm",
            "sha256": "540bf32c231cff9c6e6e6ad7736712d1fb1a5e13afa250764934111fe4652cd4",
            "sha256Normalized": "6070b100c6e180d5bc201f1e915bcc78c4d51d2ed70f5fde323da3b3cc189501",
            "bytesRead": 1094131,
            "complete": true,
            "claim": "DEF 14A 2023-04-24: closing price $19.27 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001360604-24-000034",
            "url": "https://www.sec.gov/Archives/edgar/data/1360604/000136060424000034/hr-20240408.htm",
            "sha256": "e86dd54e3f32a1e2fc9d84ab6342d03a7b7cc007de6d62a2523439c1d19244fa",
            "sha256Normalized": "6ff37e0a055db31ec4928fee0c2e425ddcdb1f6d5796d78ff790817f6ace66d7",
            "bytesRead": 985355,
            "complete": true,
            "claim": "DEF 14A 2024-04-09: closing price $17.23 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001360604-26-000032",
            "url": "https://www.sec.gov/Archives/edgar/data/1360604/000136060426000032/hr-20260406.htm",
            "sha256": "09dd8421aa5fe9dbd397ebcd1704268c16b73b850f7d891497a7cc15fe4231f5",
            "sha256Normalized": "2347f738d6b251eca5745f0a929bcf5eeed0166981afeca0d8a5cf5b39e7ef24",
            "bytesRead": 1131689,
            "complete": true,
            "claim": "DEF 14A 2026-04-07: closing price $16.95 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 19.27,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              19.27
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001360604-23-000032",
            "sha256": "540bf32c231cff9c6e6e6ad7736712d1fb1a5e13afa250764934111fe4652cd4",
            "quote": " $360,856 (1) Vesting dates generally range from 2023 to 2029. (2) Based on the closing price per share of the Common Stock on the NYSE on December 30, 2022 of $19.27. (3) Represents res"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 17.23,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              17.23
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001360604-24-000034",
            "sha256": "e86dd54e3f32a1e2fc9d84ab6342d03a7b7cc007de6d62a2523439c1d19244fa",
            "quote": "1,849,623 (1) Vesting dates generally range from 2024 to 2030. (2) Based on the closing price per share of the Common Stock on the NYSE on December 29, 2023 of $17.23. (3) Represents res"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 16.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              16.95
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001360604-26-000032",
            "sha256": "09dd8421aa5fe9dbd397ebcd1704268c16b73b850f7d891497a7cc15fe4231f5",
            "quote": "1,640,675 (1) Vesting dates generally range from 2026 to 2029. (2) Based on the closing price per share of the Common Stock on the NYSE on December 31, 2025 of $16.95. (3) Represents RSU"
          }
        ]
      },
      {
        "securityId": "ref_IMCC",
        "ticker": "IMCC",
        "cik": "0001792030",
        "issuer": "IM Cannabis Corp.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:IMCC:2020-05-20",
        "masterRowSet": [
          "tiingo:NASDAQ:IMCC:2020-05-20",
          "tiingo:NASDAQ:IMCC:2021-03-01"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares",
        "filerType": "FOREIGN_PRIVATE_ISSUER",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "EARLIEST_FULLTEXT_TICKER_CONFIRMATION",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "a8a0adef0dcccb194a0d3c158ef72ed8ef884f25cc05f772b1d92ad0f5b707f4"
        },
        "lastConfirmedCover": {
          "accession": "0001178913-26-001877",
          "filingDate": "2026-03-30",
          "sha256": "17eca1b8ce9d2d407dfdd785f15fe9ee03df2663685d79d737117c29b80bf4d1"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2025-12-31",
          "lastMatch": "2026-09-22",
          "maxGapDays": 265
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001178913-26-001877",
            "url": "https://www.sec.gov/Archives/edgar/data/1792030/000117891326001877/zk2634906.htm",
            "sha256": "17eca1b8ce9d2d407dfdd785f15fe9ee03df2663685d79d737117c29b80bf4d1",
            "sha256Normalized": "17eca1b8ce9d2d407dfdd785f15fe9ee03df2663685d79d737117c29b80bf4d1",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "20-F 2026-03-30 cover: IMCC / Common Shares / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001062993-21-003822",
            "url": "https://www.sec.gov/Archives/edgar/data/1792030/000106299321003822/exhibit99-1.htm",
            "sha256": "76ac88f8e3bc61247cc7523f858cd51b0a981a782fbbaa6795b4434f789ba92a",
            "sha256Normalized": "1e4debcb524ab30ad3f0419473fc4268bb87f8fc3dd24119e42619cbf39cb36a",
            "bytesRead": 465954,
            "complete": true,
            "claim": "ntz resigned from the Board. On March 1, 2021, the Company's Common Shares commenced trading on NASDAQ under the ticker symbol \"IMCC\", making the Company the first Israeli medical cannabis operator to list its shares on NASDAQ. On March 8, 2021, the Company announced that Focus s"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001178913-26-004583",
            "url": "https://www.sec.gov/Archives/edgar/data/1792030/000117891326004583/zk2636150.htm",
            "sha256": "cdb62c23739e9daa7f68772358e683080ba4c52426a5a94c857086a21a6fca1e",
            "sha256Normalized": "cdb62c23739e9daa7f68772358e683080ba4c52426a5a94c857086a21a6fca1e",
            "bytesRead": 339524,
            "complete": true,
            "claim": "424B5 2026-09-24: closing price $4.14 on 2026-09-22"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 1.39,
            "laterSplitProduct": 0.033333,
            "seriesBar": [
              "2025-12-31",
              41.7
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 0.99999,
            "accession": "0001178913-26-001877",
            "sha256": "17eca1b8ce9d2d407dfdd785f15fe9ee03df2663685d79d737117c29b80bf4d1",
            "quote": "otes: (1) Each Option entitles the holder to purchase one Common Share. (2) The closing price of the Common Shares as at December 31, 2025 was US$1.39 per Common Share. D"
          },
          {
            "date": "2026-09-22",
            "rawPrice": 4.14,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-09-22",
              4.14
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001178913-26-004583",
            "sha256": "cdb62c23739e9daa7f68772358e683080ba4c52426a5a94c857086a21a6fca1e",
            "quote": "r trading on the Nasdaq Capital Market, or Nasdaq, under the symbol “IMCC”. The closing price of our Common Shares on September 22, 2026, as reported by Nasdaq, was US$4.14 per share. The Comm"
          }
        ]
      },
      {
        "securityId": "ref_INM",
        "ticker": "INM",
        "cik": "0001728328",
        "issuer": "InMed Pharmaceuticals Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:INM:2014-05-05",
        "masterRowSet": [
          "tiingo:NASDAQ:INM:2014-05-05",
          "tiingo:NASDAQ:INM:2020-11-12"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, no par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-10-04",
        "validTo": null,
        "intervalBasis": [
          "EARLIEST_FULLTEXT_TICKER_CONFIRMATION",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-10-04",
          "checkedTo": "2026-10-23",
          "bars": 108,
          "pointsSha256": "bed87db951e7e2d49aa9a8a855e59a57cf7e8b7e3e846478f67d9f97c0ebef8e"
        },
        "lastConfirmedCover": {
          "accession": "0001213900-26-098419",
          "filingDate": "2026-09-09",
          "sha256": "5b72ad839c6ce06f9996687da354133366a19604f8069ec4f1f2ae0103e2cd57"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2026-09-30",
          "lastMatch": "2026-09-30",
          "maxGapDays": 0
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001213900-26-098419",
            "url": "https://www.sec.gov/Archives/edgar/data/1728328/000121390026098419/ea0301263-10k_inmed.htm",
            "sha256": "5b72ad839c6ce06f9996687da354133366a19604f8069ec4f1f2ae0103e2cd57",
            "sha256Normalized": "be246b50a9dabae6261b5601591c97baba890d59243f1dd395062fcca5459cbc",
            "bytesRead": 1507688,
            "complete": true,
            "claim": "10-K 2026-09-09 cover: INM / Common Stock, no par value / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001213900-21-008271",
            "url": "https://www.sec.gov/Archives/edgar/data/1728328/000121390021008271/f10q1220_inmedpharma.htm",
            "sha256": "d1fc6f09be0e8c0112b4e1761880103b315ec5ffa8ea3f4f96cb50efc4e734f6",
            "sha256Normalized": "d1fc6f09be0e8c0112b4e1761880103b315ec5ffa8ea3f4f96cb50efc4e734f6",
            "bytesRead": 552435,
            "complete": true,
            "claim": "al-grade cannabinoids. The Company’s shares are listed on the on the Nasdaq Capital Market (“Nasdaq”) under the trading symbol “INM”) and on the Toronto Stock Exchange (“TSX”) under the trading symbol “IN”. InMed’s corporate office and principal place of business is located at #3"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-410691",
            "url": "https://www.sec.gov/Archives/edgar/data/1728328/000119312526410691/d131177d424b3.htm",
            "sha256": "9406f7c0224a8e8966ada936488308acd11f26299e8fbff40b690d4606212f0a",
            "sha256Normalized": "9406f7c0224a8e8966ada936488308acd11f26299e8fbff40b690d4606212f0a",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2026-10-01: closing price $1.36 on 2026-09-30"
          }
        ],
        "priceEvidence": [
          {
            "date": "2026-09-30",
            "rawPrice": 1.36,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-09-30",
              1.36
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-410691",
            "sha256": "9406f7c0224a8e8966ada936488308acd11f26299e8fbff40b690d4606212f0a",
            "quote": "he Merger, as reported on The Nasdaq Capital Market, was $0.6810 per share. The closing price of the InMed Common Shares on September 30, 2026, as reported on The Nasdaq Capital Market, was $1.36 per share. Because "
          }
        ]
      },
      {
        "securityId": "ref_IOT",
        "ticker": "IOT",
        "cik": "0001642896",
        "issuer": "Samsara Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:IOT:2021-12-15",
        "masterRowSet": [
          "tiingo:NYSE:IOT:2003-01-02",
          "tiingo:NYSE:IOT:2021-12-15"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, $0.0001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-12-17",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-12-17",
          "checkedTo": "2026-10-23",
          "bars": 254,
          "pointsSha256": "5dd2e40713bf8027da416a6e911c0784fa31e089f312224f05f38ad0c07ce187"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-060909",
          "filingDate": "2026-09-08",
          "sha256": "31c8423b7653e3161b0c2d225bfcc5df461f418e74ba19bbe1cfe2604adcdd68"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2023-01-27",
          "lastMatch": "2023-01-27",
          "maxGapDays": 1320
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-060909",
            "url": "https://www.sec.gov/Archives/edgar/data/1642896/000162828026060909/iot-20260801.htm",
            "sha256": "31c8423b7653e3161b0c2d225bfcc5df461f418e74ba19bbe1cfe2604adcdd68",
            "sha256Normalized": "82ca39dbf67cc1aad6fc954b5a5ba9e718fb8c18d8c39fbf72610e92f397419a",
            "bytesRead": 1305940,
            "complete": true,
            "claim": "10-Q 2026-09-08 cover: IOT / Class A Common Stock, $0.0001 par value per share / The New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-21-334578",
            "url": "https://www.sec.gov/Archives/edgar/data/1642896/000119312521334578/d261594ds1.htm",
            "sha256": "b2504c52a795e36bf2dd23beffbe596ffefcfde105e02175b43eb0318330e582",
            "sha256Normalized": "b2504c52a795e36bf2dd23beffbe596ffefcfde105e02175b43eb0318330e582",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "sued and outstanding. We have applied to list our Class A common stock on the New York Stock Exchange under the trading symbol “IOT.” We are an “emerging growth company” as that term is defined under the federal securities laws and, as such, we have elected to comply with certain"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001642896-23-000044",
            "url": "https://www.sec.gov/Archives/edgar/data/1642896/000164289623000044/iot-20230517.htm",
            "sha256": "09a07066fe2bffef65367e01b3b5c938f87318d76180bcab97a546edfe9dbea4",
            "sha256Normalized": "5ed08a7461c1d9e2f9891efb05293cc2a898ac1feb993c5154cf00e8700c297e",
            "bytesRead": 923950,
            "complete": true,
            "claim": "DEF 14A 2023-05-18: closing price $13.76 on 2023-01-27"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-01-27",
            "rawPrice": 13.76,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-01-27",
              13.76
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001642896-23-000044",
            "sha256": "09a07066fe2bffef65367e01b3b5c938f87318d76180bcab97a546edfe9dbea4",
            "quote": "d by multiplying (i) the number of unvested and accelerated options by (ii) the closing price of our Class A common stock on January 27, 2023, which was $13.76, minus the option’s"
          }
        ]
      },
      {
        "securityId": "ref_LAB",
        "ticker": "LAB",
        "cik": "0001162194",
        "issuer": "STANDARD BIOTOOLS INC.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:LAB:2003-07-29",
        "masterRowSet": [
          "tiingo:NASDAQ:LAB:2003-07-29",
          "tiingo:NASDAQ:LAB:2011-02-10"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-04-08",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-04-08",
          "checkedTo": "2026-10-23",
          "bars": 238,
          "pointsSha256": "08d269ef901efb121662337855ab8520e3c33b0c2386daaa0c71adaffb3be9a5"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-335103",
          "filingDate": "2026-08-05",
          "sha256": "dd65b60122ced75d83b5086dc061219a9bbe6e56a356b6864bbc27c961d283fe"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2022-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 1096
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-335103",
            "url": "https://www.sec.gov/Archives/edgar/data/1162194/000119312526335103/lab-20260630.htm",
            "sha256": "dd65b60122ced75d83b5086dc061219a9bbe6e56a356b6864bbc27c961d283fe",
            "sha256Normalized": "630ca254b107bb3debb23f2f155d04fc62dc16cb405db69c414bdc223c244c79",
            "bytesRead": 3047040,
            "complete": true,
            "claim": "10-Q 2026-08-05 cover: LAB / Common Stock, $0.001 par value per share / The Nasdaq Global Select Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-22-096290",
            "url": "https://www.sec.gov/Archives/edgar/data/1162194/000119312522096290/d314141d8k.htm",
            "sha256": "39534ec7b9e92ad0b0ddcc662c9103a43e1cd28144e3b25811850d9abb24f50a",
            "sha256Normalized": "93d9f3ea4bd398fa7d2bdc4eae62b1ea55f02cb5d1b8b49e96c6e639f41ec998",
            "bytesRead": 115680,
            "complete": true,
            "claim": "Change, the Company’s Common Stock is expected to begin trading on the NASDAQ Global Select Market under the new ticker symbol ‘LAB’ as of the open of trading on April 6, 2022. Previously, the Company’s Common Stock traded on the NASDAQ Global Select Market under the ticker symbo"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000950142-23-001246",
            "url": "https://www.sec.gov/Archives/edgar/data/1162194/000095014223001246/eh230354030_def14a.htm",
            "sha256": "f0350d2098c973f45ae7adf66a6aed9c8fb5d23916e5630792110e12b416fec8",
            "sha256Normalized": "f0350d2098c973f45ae7adf66a6aed9c8fb5d23916e5630792110e12b416fec8",
            "bytesRead": 730032,
            "complete": true,
            "claim": "DEF 14A 2023-04-28: closing price $1.17 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-017100",
            "url": "https://www.sec.gov/Archives/edgar/data/1162194/000114036126017100/ny20061287x1_def14a.htm",
            "sha256": "3bd81f41dff3b6c0f91410849b6c17cda2ff8b7bea8ff2e95ec07734ca442b97",
            "sha256Normalized": "298494e05eb6934556e45a72f4dd333cc95e26959bb3826219792997fe5d87d1",
            "bytesRead": 1878571,
            "complete": true,
            "claim": "DEF 14A 2026-04-27: closing price $1.28 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-31",
            "rawPrice": 1.17,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              1.17
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000950142-23-001246",
            "sha256": "f0350d2098c973f45ae7adf66a6aed9c8fb5d23916e5630792110e12b416fec8",
            "quote": "— — — 250,000 (5) 292,500 — — — — — — — 250,000 (6) 292,500 — (1) Based o n the closing price of our common stock of $1.17 per share on December 31, 2022, as reported on the"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 1.28,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              1.28
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-017100",
            "sha256": "3bd81f41dff3b6c0f91410849b6c17cda2ff8b7bea8ff2e95ec07734ca442b97",
            "quote": "lying the number of RSUs subject to acceleration as of December 31, 2025 by the closing price of our common stock on the Nasdaq Global Select Market on December 31, 2025, the last trading day of the 2025 fiscal year, of $1.28. The value of vesti"
          }
        ]
      },
      {
        "securityId": "ref_MIR",
        "ticker": "MIR",
        "cik": "0001809987",
        "issuer": "Mirion Technologies, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:MIR:2020-08-20",
        "masterRowSet": [
          "tiingo:NYSE:MIR:2006-12-28",
          "tiingo:NYSE:MIR:2020-08-20"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, $0.0001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-10-29",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-10-29",
          "checkedTo": "2026-10-23",
          "bars": 261,
          "pointsSha256": "6ba5fa4225126e6fcbcad5ea1e719129a22c726a049a5b63616b9b739e2bc27b"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-050604",
          "filingDate": "2026-07-29",
          "sha256": "2c8aedf2d008b05afe27b3225d117dd3ab83f6dbcfea9b71aa53b6fa153695cc"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2023-02-17",
          "lastMatch": "2023-02-17",
          "maxGapDays": 1258
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-050604",
            "url": "https://www.sec.gov/Archives/edgar/data/1809987/000162828026050604/mir-20260630.htm",
            "sha256": "2c8aedf2d008b05afe27b3225d117dd3ab83f6dbcfea9b71aa53b6fa153695cc",
            "sha256Normalized": "1909a5b97f475cf9b7a0bbcf41ce2d2bff744eda5ccc2a4bd4c92d8e2693a4fb",
            "bytesRead": 2194209,
            "complete": true,
            "claim": "10-Q 2026-07-29 cover: MIR / Class A Common Stock, $0.0001 par value per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-21-305946",
            "url": "https://www.sec.gov/Archives/edgar/data/1809987/000119312521305946/d219393d8k.htm",
            "sha256": "f2f8b009761ca972e82ee7816faa6d98ac20f739e593786d706c15db4e216367",
            "sha256Normalized": "61c0d94be57b6bb23dda2118ca8421669894064d76df2b172711ede3fd048713",
            "bytesRead": 244774,
            "complete": true,
            "claim": "MIR / Class A common stock, $0.0001 par value per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-24-017397",
            "url": "https://www.sec.gov/Archives/edgar/data/1809987/000162828024017397/mir-20240423.htm",
            "sha256": "ac3a3940646ac6b2de795ecd0bc9cd306a95f827f8e7e731a18a8cb8ec388406",
            "sha256Normalized": "df685e8502ce59027aca215b0f392f51b1ef4b5d887ef01f4b6a8abe2bf91363",
            "bytesRead": 1494146,
            "complete": true,
            "claim": "DEF 14A 2024-04-23: closing price $8.75 on 2023-02-17"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-23-012591",
            "url": "https://www.sec.gov/Archives/edgar/data/1809987/000162828023012591/mir-20230424.htm",
            "sha256": "5bf82ef55726322ae4125664a525a2d7de14d5fe7a32002dd1338756af88c8cb",
            "sha256Normalized": "ffd627d0eaa4d0c3a5af8c4ca3783ac16f2d5cd6b07cd7f6e3cb9b64c6f54724",
            "bytesRead": 1428798,
            "complete": true,
            "claim": "DEF 14A 2023-04-24: closing price $8.75 on 2023-02-17"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-23-004146",
            "url": "https://www.sec.gov/Archives/edgar/data/1809987/000162828023004146/mir-20230221.htm",
            "sha256": "8ad6459e71ccff593db32408a80a61dcfdbeba1a97feb019afc8ecea4e977428",
            "sha256Normalized": "66288998a66e7822ebedbd5e1bc9abd1ba1983a2979b95911c1cc8acf4c72f65",
            "bytesRead": 45471,
            "complete": true,
            "claim": "8-K 2023-02-21: closing price $8.75 on 2023-02-17"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-02-17",
            "rawPrice": 8.75,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-02-17",
              8.75
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-24-017397",
            "sha256": "ac3a3940646ac6b2de795ecd0bc9cd306a95f827f8e7e731a18a8cb8ec388406",
            "quote": " 17,142,857 shares of our Class A common stock). The shares were offered at the closing price of $8.75 per share on February 17, 2023. The Company receiv"
          },
          {
            "date": "2023-02-17",
            "rawPrice": 8.75,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-02-17",
              8.75
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-23-012591",
            "sha256": "5bf82ef55726322ae4125664a525a2d7de14d5fe7a32002dd1338756af88c8cb",
            "quote": " 17,142,857 shares of our Class A common stock). The shares were offered at the closing price of $8.75 per share on February 17, 2023. The Company receiv"
          },
          {
            "date": "2023-02-17",
            "rawPrice": 8.75,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-02-17",
              8.75
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-23-004146",
            "sha256": "8ad6459e71ccff593db32408a80a61dcfdbeba1a97feb019afc8ecea4e977428",
            "quote": "n a registered direct offering (the “Offering”). The Shares were offered at the closing price of $8.75 per share on February 17, 2023. The closing of the"
          }
        ]
      },
      {
        "securityId": "ref_MLTX",
        "ticker": "MLTX",
        "cik": "0001821586",
        "issuer": "MoonLake Immunotherapeutics",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:MLTX:2020-10-20",
        "masterRowSet": [
          "tiingo:NASDAQ:MLTX:2020-10-20",
          "tiingo:NASDAQ:MLTX:2022-04-05"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Ordinary Share, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-04-14",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-04-14",
          "checkedTo": "2026-10-23",
          "bars": 237,
          "pointsSha256": "540432ba9d16d443c85fa2192bab27eb2223e235ed6962d0de4e7ee05e8358e3"
        },
        "lastConfirmedCover": {
          "accession": "0001821586-26-000010",
          "filingDate": "2026-08-10",
          "sha256": "03b859fe18d9d23a3ab5825aa2091ff73b237f1805edecc5211e76a547ed0536"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2022-12-30",
          "lastMatch": "2026-04-01",
          "maxGapDays": 824
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001821586-26-000010",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000182158626000010/mnlk-20260630.htm",
            "sha256": "03b859fe18d9d23a3ab5825aa2091ff73b237f1805edecc5211e76a547ed0536",
            "sha256Normalized": "b770be7d97bf0f5e67a69acfa4265ccda5d6e683c78372652a035fbeb314e01e",
            "bytesRead": 1202089,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: MLTX / Class A Ordinary Share, par value $0.0001 per share / Nasdaq"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001213900-22-019217",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000121390022019217/ea158227-8k_moonlake.htm",
            "sha256": "2df155d20544d2b4592c0729c2178e5b4e1dc20e7088a69936aa41d54b32a7cf",
            "sha256Normalized": "9dcf0526f893a6dec5b5ceb8a75701ef35d2ec762f36d6c20c1b87c4029899c3",
            "bytesRead": 246482,
            "complete": true,
            "claim": "MLTX / Class A ordinary share, par value $0.0001 per share / Nasdaq"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-23-020595",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000114036123020595/ny20007692x1_def14a.htm",
            "sha256": "e2102847ba793ac690e0a6e4987cc2ed6cbf9061d0040a9317c1e6a77a545513",
            "sha256Normalized": "6a30a793476d147452663f29b1ff7207855232581aa553f9e5b98396ed69a13d",
            "bytesRead": 543258,
            "complete": true,
            "claim": "DEF 14A 2023-04-26: closing price $10.5 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-23-009529",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000162828023009529/moonlake424b3.htm",
            "sha256": "c114a36fd915ff5cc2a55ae18ccac7693de18d784ef10357a90757a8ae1d5e0e",
            "sha256Normalized": "c114a36fd915ff5cc2a55ae18ccac7693de18d784ef10357a90757a8ae1d5e0e",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2023-03-28: closing price $10.5 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001821586-23-000007",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000182158623000007/mnlk-20221231.htm",
            "sha256": "4a313169a4be092514eebea87f79b8834e1e386b72e5b4b5cd445b6266f4e717",
            "sha256Normalized": "59980b5dce3d24db44f97027a2d506f95b9451e5dd6e69f5eca535d9ffed0fe9",
            "bytesRead": 2300244,
            "complete": true,
            "claim": "10-K 2023-03-20: closing price $10.5 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-021744",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000114036124021744/ny20023928x1_def14a.htm",
            "sha256": "93cf68058f88dadc4f9a5dd688b31365cca69087152f87e99bb424be8824f693",
            "sha256Normalized": "b9ff7ae8d19f223901bb40fe90d3c1b27b00e3391a7546289a1b28c7104cbfca",
            "bytesRead": 569824,
            "complete": true,
            "claim": "DEF 14A 2024-04-24: closing price $60.39 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-015916",
            "url": "https://www.sec.gov/Archives/edgar/data/1821586/000114036126015916/ny20067252x1_def14a.htm",
            "sha256": "f4934fc239830c398f48aff20d06101b4d57a344008024a82cb3f729862b2a5e",
            "sha256Normalized": "234fa41b2abc97e380781188ac43c83c0879ba77d2772e1524cd91208c16f6b4",
            "bytesRead": 947800,
            "complete": true,
            "claim": "DEF 14A 2026-04-21: closing price $16.52 on 2026-04-01"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 10.5,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              10.5
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-23-020595",
            "sha256": "e2102847ba793ac690e0a6e4987cc2ed6cbf9061d0040a9317c1e6a77a545513",
            "quote": "33.638698 MoonLake Immunotherapeutics Class A Ordinary Shares. (2) Based on the closing price of $10.50 on December 30, 2022, which was the last"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 10.5,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              10.5
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-23-009529",
            "sha256": "c114a36fd915ff5cc2a55ae18ccac7693de18d784ef10357a90757a8ae1d5e0e",
            "quote": "33.638698 MoonLake Immunotherapeutics Class A Ordinary Shares. (5) Based on the closing price of $10.50 on December 30, 2022, which was the last"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 10.5,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              10.5
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001821586-23-000007",
            "sha256": "4a313169a4be092514eebea87f79b8834e1e386b72e5b4b5cd445b6266f4e717",
            "quote": "33.638698 MoonLake Immunotherapeutics Class A Ordinary Shares. (5) Based on the closing price of $10.50 on December 30, 2022, which was the last"
          },
          {
            "date": "2023-03-17",
            "rawPrice": 23.14,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-03-17",
              23.14
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-23-009529",
            "sha256": "c114a36fd915ff5cc2a55ae18ccac7693de18d784ef10357a90757a8ae1d5e0e",
            "quote": "rs) (3) 13,546,908 $ 10.00 (4) $ 13.14 None __________________ (1) Based on the closing price of our Class A Ordinary Shares on March 17, 2023 of $23.14. (2) Includes Dr. N"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 60.39,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              60.39
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-24-021744",
            "sha256": "93cf68058f88dadc4f9a5dd688b31365cca69087152f87e99bb424be8824f693",
            "quote": "33.638698 MoonLake Immunotherapeutics Class A Ordinary Shares. (2) Based on the closing price of $60.39 on December 29, 2023, which was the last"
          },
          {
            "date": "2026-04-01",
            "rawPrice": 16.52,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-04-01",
              16.52
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-015916",
            "sha256": "f4934fc239830c398f48aff20d06101b4d57a344008024a82cb3f729862b2a5e",
            "quote": "entive Plan as of April 1, 2026 to the persons and groups identified below. The closing market price of our Class A Ordinary Shares as reflected on Nasdaq on April 1, 2026 was $16.52. Name and Position "
          }
        ]
      },
      {
        "securityId": "ref_MOVE",
        "ticker": "MOVE",
        "cik": "0001734750",
        "issuer": "Corvex, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:MOVE:2021-03-23",
        "masterRowSet": [
          "tiingo:NASDAQ:MOVE:1999-08-05",
          "tiingo:NASDAQ:MOVE:2021-03-23"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-05-03",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-05-03",
          "checkedTo": "2026-10-23",
          "bars": 130,
          "pointsSha256": "0df588f3fc105900c727aa751bf390f67d5df47e99d162853525a8f515593ecf"
        },
        "lastConfirmedCover": {
          "accession": "0001213900-26-090091",
          "filingDate": "2026-08-14",
          "sha256": "b5bf8a14bbdce75ba18cb5fb3c5bebdcaa64ea1f9b2f2e529c59c8de81e4f17f"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2026-04-29",
          "lastMatch": "2026-04-29",
          "maxGapDays": 107
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001213900-26-090091",
            "url": "https://www.sec.gov/Archives/edgar/data/1734750/000121390026090091/ea0301480-10q_corvex.htm",
            "sha256": "b5bf8a14bbdce75ba18cb5fb3c5bebdcaa64ea1f9b2f2e529c59c8de81e4f17f",
            "sha256Normalized": "fb94c9c65c9b6252df89109cb8e55fc624c53a85f8038f345c2dd769d20dc243",
            "bytesRead": 1352421,
            "complete": true,
            "claim": "10-Q 2026-08-14 cover: MOVE / Common Stock, par value $0.0001 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001213900-21-006218",
            "url": "https://www.sec.gov/Archives/edgar/data/1734750/000121390021006218/ea134117-s1_movanoinc.htm",
            "sha256": "f65db9588384fea681512411ea7ed3c61c8bee6299fbca15c812d75b8806dfea",
            "sha256Normalized": "f65db9588384fea681512411ea7ed3c61c8bee6299fbca15c812d75b8806dfea",
            "bytesRead": 1678869,
            "complete": true,
            "claim": "blic offering price is $5.00 per share. We have applied to list our common stock on the Nasdaq Capital Market under the symbol “MOVE.” We are an “emerging growth company” as that term is used in the Jumpstart Our Business Startups Act of 2012 and, as such, have elected to comply "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-024310",
            "url": "https://www.sec.gov/Archives/edgar/data/1734750/000114036126024310/ny20066593x3_def14a.htm",
            "sha256": "211b918b48c9a7f97edbadeacdbd1ce72079fe1bd8e7574116b671b89fc4c1fd",
            "sha256Normalized": "211b918b48c9a7f97edbadeacdbd1ce72079fe1bd8e7574116b671b89fc4c1fd",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-06-05: closing price $15.85 on 2026-04-29"
          }
        ],
        "priceEvidence": [
          {
            "date": "2026-04-29",
            "rawPrice": 15.85,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-04-29",
              15.85
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-024310",
            "sha256": "211b918b48c9a7f97edbadeacdbd1ce72079fe1bd8e7574116b671b89fc4c1fd",
            "quote": "ted stock units, determined by multiplying the number of units by the Company’s closing stock price of $15.85 on April 29, 2026. Summary of U.S. Fe"
          }
        ]
      },
      {
        "securityId": "ref_MRNA",
        "ticker": "MRNA",
        "cik": "0001682852",
        "issuer": "Moderna, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:MRNA:2018-12-07",
        "masterRowSet": [
          "tiingo:NASDAQ:MRNA:1993-12-07",
          "tiingo:NASDAQ:MRNA:2018-12-07"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2019-01-04",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2019-01-04",
          "checkedTo": "2026-10-23",
          "bars": 408,
          "pointsSha256": "e00771a50c3077cae9b6d48301473ca2bbed8ee6fa955ca7f417efea08966970"
        },
        "lastConfirmedCover": {
          "accession": "0001682852-26-000150",
          "filingDate": "2026-07-31",
          "sha256": "36c40ea36dc45c249359e25abef2dc7f05140cd9b333939ae687fb843fc5022c"
        },
        "anchorGaps": {
          "matchDates": 6,
          "firstMatch": "2020-12-31",
          "lastMatch": "2026-08-27",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001682852-26-000150",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000168285226000150/mrna-20260630.htm",
            "sha256": "36c40ea36dc45c249359e25abef2dc7f05140cd9b333939ae687fb843fc5022c",
            "sha256Normalized": "6f88886399a1c14ae77d232a2bb024ba84d694308a444945b046d8230a02cfe5",
            "bytesRead": 1474199,
            "complete": true,
            "claim": "10-Q 2026-07-31 cover: MRNA / Common stock, par value $0.0001 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-18-323562",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000119312518323562/d577473ds1.htm",
            "sha256": "40d593211cc023e3d562c1369c9ad0c310e57729b2247c50037b05bdade647d5",
            "sha256Normalized": "40d593211cc023e3d562c1369c9ad0c310e57729b2247c50037b05bdade647d5",
            "bytesRead": 2097152,
            "complete": false,
            "claim": " to be between $ and $ per share. We have applied to list our common stock on the Nasdaq Global Select Market under the symbol “MRNA.” We are an “emerging growth company” as that term is used in the Jumpstart Our Business Startups Act of 2012, or the JOBS Act, and, as such, we ha"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-22-000041",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817922000041/lmrna2022_def14a.htm",
            "sha256": "011adff95904b8a25aae89d30e3be2eb29b33d6f7769834eacac7884db4bf3f0",
            "sha256Normalized": "dbcaaf646ef90f8bf38c3d18a76b0c9e4423860f81db4d1391c440ce03d41ee0",
            "bytesRead": 1424032,
            "complete": true,
            "claim": "DEF 14A 2022-03-09: closing price $104.47 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-21-000031",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817921000031/lmrn2021_def14a.htm",
            "sha256": "468b4ee33fa2b1f8beac1ebbd1b6fc2b00572c22b4a753546dc1375e49948261",
            "sha256Normalized": "c5c92a841a5dac0d8354df92c1bd5e7a5a9ca9349cddacd3d1fd783b0c0e2468",
            "bytesRead": 1217394,
            "complete": true,
            "claim": "DEF 14A 2021-03-10: closing price $104.47 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-26-000081",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817926000081/mrna-20260316.htm",
            "sha256": "f2d446167d7bcdfb01d6beb0e0b6fdfaf8ece3443174493ff79362e5c6ab5dec",
            "sha256Normalized": "5ab4568cd62fb089f6a79aba15cf2da74d6f1700656e4b52a9515cd678123bf9",
            "bytesRead": 1793226,
            "complete": true,
            "claim": "DEF 14A 2026-03-16: closing price $253.98 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-25-000082",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817925000082/mrna-20250310.htm",
            "sha256": "81fdce3208630b2313614f457c101a1455782234ef0c725edcc935b7eb2e399f",
            "sha256Normalized": "918546d7332f526f985f82842f6ffe76dc78ab6f8cbbb9fb2116572781f34df1",
            "bytesRead": 1786233,
            "complete": true,
            "claim": "DEF 14A 2025-03-11: closing price $253.98 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-24-000208",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817924000208/lmrna2024_def14a.htm",
            "sha256": "215932c4a86e4bbeff3e49734e530436adfa94626bd360a19bc482633ac4ec92",
            "sha256Normalized": "e6df1636df6982ee19dfe214c650ed8ca129a239a5c02a65e35f340a909bbcf8",
            "bytesRead": 1517130,
            "complete": true,
            "claim": "DEF 14A 2024-03-21: closing price $253.98 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001308179-23-000184",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000130817923000184/lmrna2023_def14a.htm",
            "sha256": "f2e61d69808def3fc326ae29fedf6100ff3c456ce0b9ddc7fc9d257e9bc3e091",
            "sha256Normalized": "6e622c92914ac6b2ea5af558cd9215c74de816cbe4921bbd88e14bf0322e1ff4",
            "bytesRead": 1612851,
            "complete": true,
            "claim": "DEF 14A 2023-03-15: closing price $253.98 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-378505",
            "url": "https://www.sec.gov/Archives/edgar/data/1682852/000119312526378505/d108896d8k.htm",
            "sha256": "14085a75ad34eb89e40083245aead0a979c05ccd8cac3189a2fe1a4622f47059",
            "sha256Normalized": "d9784c7e5a3187a875c631e287dbb703c680c055214582357634622c734624f2",
            "bytesRead": 56564,
            "complete": true,
            "claim": "8-K 2026-09-01: closing price $142.77 on 2026-08-27"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 104.47,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              104.47
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-22-000041",
            "sha256": "011adff95904b8a25aae89d30e3be2eb29b33d6f7769834eacac7884db4bf3f0",
            "quote": "e surveys. • Recognized year-over-year stock price appreciation of 143% (from a closing price of $104.47 on December 31, 2020 to a closing price "
          },
          {
            "date": "2020-12-31",
            "rawPrice": 104.47,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              104.47
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-21-000031",
            "sha256": "468b4ee33fa2b1f8beac1ebbd1b6fc2b00572c22b4a753546dc1375e49948261",
            "quote": "cable equity award, including both vested and unvested portions, based upon the closing price for the Company’s common stock on December 31, 2020 of $104.47. (3) The shares sub"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 253.98,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              253.98
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-26-000081",
            "sha256": "f2d446167d7bcdfb01d6beb0e0b6fdfaf8ece3443174493ff79362e5c6ab5dec",
            "quote": "COVID vaccine increased significantly in value during 2021, a year in which our closing stock price on December 31, 2021 was $253.98. Our Other NEOs joi"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 253.98,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              253.98
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-25-000082",
            "sha256": "81fdce3208630b2313614f457c101a1455782234ef0c725edcc935b7eb2e399f",
            "quote": "COVID vaccine increased significantly in value during 2021, a year in which our closing stock price on December 31, 2021 was $253.98. Our Other NEOs joi"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 253.98,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              253.98
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-24-000208",
            "sha256": "215932c4a86e4bbeff3e49734e530436adfa94626bd360a19bc482633ac4ec92",
            "quote": "ID-19 vaccine increased significantly in value during 2021, a year in which our closing stock price on December 31, 2021 was $253.98. Our Other NEOs joi"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 253.98,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              253.98
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-23-000184",
            "sha256": "f2e61d69808def3fc326ae29fedf6100ff3c456ce0b9ddc7fc9d257e9bc3e091",
            "quote": "ID-19 vaccine increased significantly in value during 2021, a year in which our closing stock price on December 31, 2021 was $253.98. Several of the Oth"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 253.98,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              253.98
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-22-000041",
            "sha256": "011adff95904b8a25aae89d30e3be2eb29b33d6f7769834eacac7884db4bf3f0",
            "quote": "cable equity award, including both vested and unvested portions, based upon the closing price for the Company’s common stock on December 31, 2021 of $253.98. (3) The shares sub"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 179.62,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              179.62
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-23-000184",
            "sha256": "f2e61d69808def3fc326ae29fedf6100ff3c456ce0b9ddc7fc9d257e9bc3e091",
            "quote": "cable equity award, including both vested and unvested portions, based upon the closing price for the Company’s common stock on December 30, 2022 of $179.62. (3) The shares sub"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 99.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              99.45
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-24-000208",
            "sha256": "215932c4a86e4bbeff3e49734e530436adfa94626bd360a19bc482633ac4ec92",
            "quote": "cable equity award, including both vested and unvested portions, based upon the closing price for the Company’s common stock on December 29, 2023 of $99.45. (3) The shares sub"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 29.49,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              29.49
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001308179-26-000081",
            "sha256": "f2d446167d7bcdfb01d6beb0e0b6fdfaf8ece3443174493ff79362e5c6ab5dec",
            "quote": "cable equity award, including both vested and unvested portions, based upon the closing price for the Company’s common stock on December 31, 2025 of $29.49. (3) The shares sub"
          },
          {
            "date": "2026-08-27",
            "rawPrice": 142.77,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-08-27",
              142.77
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-378505",
            "sha256": "14085a75ad34eb89e40083245aead0a979c05ccd8cac3189a2fe1a4622f47059",
            "quote": "version price of the Notes represents a premium of approximately 47.5% over the last reported sale price of $142.77 per share of the common stock on the Nasdaq Global Select Market on August 27, 2026. The conversion rat"
          }
        ]
      },
      {
        "securityId": "ref_MXCT",
        "ticker": "MXCT",
        "cik": "0001287098",
        "issuer": "MAXCYTE, INC.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:MXCT:2019-12-05",
        "masterRowSet": [
          "tiingo:NASDAQ:MXCT:2019-12-05",
          "tiingo:NASDAQ:MXCT:2021-07-30"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "6faeee414b51256cef8da636dacea15a0a0d58fe729e7730a3db1decb0a49b2b"
        },
        "lastConfirmedCover": {
          "accession": "0001104659-26-095971",
          "filingDate": "2026-08-13",
          "sha256": "86e8d75427fcab3dd30ca41aa7bebe9675e2ee67d4f7a106b42434df8ef2cbd1"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 225
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001104659-26-095971",
            "url": "https://www.sec.gov/Archives/edgar/data/1287098/000110465926095971/mxct-20260630x10q.htm",
            "sha256": "86e8d75427fcab3dd30ca41aa7bebe9675e2ee67d4f7a106b42434df8ef2cbd1",
            "sha256Normalized": "c9c00d503ce02211f015c644aad91c2d9273c28f2489f347055cd974e2108bc8",
            "bytesRead": 1823542,
            "complete": true,
            "claim": "10-Q 2026-08-13 cover: MXCT / Common stock, par value $0.01 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001558370-21-012432",
            "url": "https://www.sec.gov/Archives/edgar/data/1287098/000155837021012432/mxct-20210630x10q.htm",
            "sha256": "756ffff7765a4c9ed4cbe1956104300e77e516415bcd540c8e2fa5d6dca1f43c",
            "sha256Normalized": "a184005041d8f79a8b492a4faf6b38b588f29c7ccce25ad38b1e406adb7668ce",
            "bytesRead": 1502734,
            "complete": true,
            "claim": "MXCT / Common stock, par value $0.01 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-017844",
            "url": "https://www.sec.gov/Archives/edgar/data/1287098/000114036126017844/ny20071620x1_def14a.htm",
            "sha256": "3b60b9a94d9843f1208dc01c9dc141f29fc9949684c6395071a3ce165db92594",
            "sha256Normalized": "705558dcfac5d0c50615da74f49b5e59848d430c3590fbcc1dc6b610bce64f7c",
            "bytesRead": 567296,
            "complete": true,
            "claim": "DEF 14A 2026-04-29: closing price $1.55 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 1.55,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              1.55
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-017844",
            "sha256": "3b60b9a94d9843f1208dc01c9dc141f29fc9949684c6395071a3ce165db92594",
            "quote": " the applicable vesting date. The market value for these awards is based on the closing stock price as of December 31, 2025 of $1.55 per share. (9) Thes"
          }
        ]
      },
      {
        "securityId": "ref_NMIH",
        "ticker": "NMIH",
        "cik": "0001547903",
        "issuer": "NMI Holdings, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:NMIH:2013-11-08",
        "masterRowSet": [
          "tiingo:NASDAQ:NMIH:2013-11-08",
          "tiingo:NASDAQ:NMIH:2024-05-13"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.01",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2014-01-03",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2014-01-03",
          "checkedTo": "2026-10-23",
          "bars": 669,
          "pointsSha256": "9537afeba836893baf111f29e35390844f9fa1c01bd8cc1c1a44eaff1a702fc6"
        },
        "lastConfirmedCover": {
          "accession": "0001547903-26-000038",
          "filingDate": "2026-07-31",
          "sha256": "7049f8e5b61c9f2418343f891d91059b7846a611186f6c8e0fbe15d7f1c643bd"
        },
        "anchorGaps": {
          "matchDates": 12,
          "firstMatch": "2015-12-31",
          "lastMatch": "2026-02-06",
          "maxGapDays": 1098
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001547903-26-000038",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790326000038/nmih-20260630.htm",
            "sha256": "7049f8e5b61c9f2418343f891d91059b7846a611186f6c8e0fbe15d7f1c643bd",
            "sha256Normalized": "e99546356d2b76f6b1696134ec3bfa9b89a22aa844670cbb8842844f2e279fb4",
            "bytesRead": 1909041,
            "complete": true,
            "claim": "10-Q 2026-07-31 cover: NMIH / Common Stock, par value $0.01 / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001547903-13-000010",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790313000010/nmishelfs-1a.htm",
            "sha256": "1f0eac6f60ff95754e97c946df21afb307debfed98cf14bf34508d2fe61770cd",
            "sha256Normalized": "1f0eac6f60ff95754e97c946df21afb307debfed98cf14bf34508d2fe61770cd",
            "bytesRead": 2097152,
            "complete": false,
            "claim": ", we intend to apply (assuming we meet all other listing requirements) to list our common stock on the NASDAQ under the symbol “NMIH.” We are an “emerging growth company” as defined in the Jumpstart Our Business Startups Act of 2012 and will be subject to reduced public reporting"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-16-000221",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790316000221/nmihproxy2016doc.htm",
            "sha256": "070d5f5e13b3daed6a44fba646b9434e3ee92818ee7b46bbc75bb0083212bd66",
            "sha256Normalized": "eb1c5a8acf4abe6532ff83b6761533069c4e0e40ec0642d448de4dee28e30d1c",
            "bytesRead": 396052,
            "complete": true,
            "claim": "DEF 14A 2016-03-31: closing price $6.77 on 2015-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-17-000043",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790317000043/nmihproxy2017.htm",
            "sha256": "da2281c4e5eed02ef34ce2b6598db185ff346dcd518c7b38c49d5259e2da4afb",
            "sha256Normalized": "b88bbf29e4bc43a2fafb3bf4183285276920d36b467426769b93add5937a632f",
            "bytesRead": 716206,
            "complete": true,
            "claim": "DEF 14A 2017-03-30: closing price $10.65 on 2016-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-18-000057",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790318000057/nmih2018proxy.htm",
            "sha256": "9e1ecf1fa872029446b39a820264bcfd219430c4e500d12712433844486020ac",
            "sha256Normalized": "99dc6da887900ef8cdeaa6b535c2d8b4841d67da1121fae41316cf72358a49db",
            "bytesRead": 689694,
            "complete": true,
            "claim": "DEF 14A 2018-03-29: closing price $17 on 2017-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-21-000083",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790321000083/nmih2021proxy.htm",
            "sha256": "73de802e73068ea76d5921ce68067b50ef70ce8731571ea807fbcca910cc0e88",
            "sha256Normalized": "33abc550702cf3c59273f2f33f08fcb1aa25890aff53c191826b595065aa2cb4",
            "bytesRead": 899044,
            "complete": true,
            "claim": "DEF 14A 2021-03-30: closing price $22.65 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-22-000078",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790322000078/nmih2022proxy.htm",
            "sha256": "60c01a1a16cdc39804de28f94a63ff22106336631b95daf33297057afdcee8ef",
            "sha256Normalized": "522facfa6abb8f4c2656e37ba331bed41cf5fe6186d1591878f487858fd01fad",
            "bytesRead": 1241328,
            "complete": true,
            "claim": "DEF 14A 2022-03-29: closing price $21.85 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-22-000060",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790322000060/nmih-20211231.htm",
            "sha256": "81b8d12e429ba5251952e16868ffd7ab185e064294152791c90747f5ea5fa33f",
            "sha256Normalized": "81b8d12e429ba5251952e16868ffd7ab185e064294152791c90747f5ea5fa33f",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2022-02-16: closing price $25.97 on 2022-02-11"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-23-000061",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790323000061/nmih-20230329.htm",
            "sha256": "5534bd5be6bb77b69e30e30f3aed301809d59c22bddd5476837b0f079d40b8f6",
            "sha256Normalized": "b8cf50745fdc9aefdb87de5a121fa6c4c094616fa8919f8300539c549595e4c8",
            "bytesRead": 1229872,
            "complete": true,
            "claim": "DEF 14A 2023-03-31: closing price $20.9 on 2022-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-23-000036",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790323000036/nmih-20221231.htm",
            "sha256": "f58fd176b581682c518448ef675eb2843b079a3f18af7ad0991632fedcacc5ce",
            "sha256Normalized": "f58fd176b581682c518448ef675eb2843b079a3f18af7ad0991632fedcacc5ce",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2023-02-15: closing price $22.95 on 2023-02-10"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-24-000091",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790324000091/nmih-20240327.htm",
            "sha256": "007e00b35198c1d487ab64615d08a5460fde3a7aa59a5f6a275f53d880ae1f90",
            "sha256Normalized": "7e1f4dc707a93db6a21b87472c3134bca410d716f3e55a011d568e38cb8a0bed",
            "bytesRead": 1416182,
            "complete": true,
            "claim": "DEF 14A 2024-03-28: closing price $29.68 on 2023-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-24-000035",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790324000035/nmih-20231231.htm",
            "sha256": "6de61d5dca77b8834f22cd34315e186c6b6ef049c276536848cb7da9cef7f16c",
            "sha256Normalized": "6de61d5dca77b8834f22cd34315e186c6b6ef049c276536848cb7da9cef7f16c",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-K 2024-02-15: closing price $30.19 on 2024-02-09"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-26-000019",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790326000019/nmih-20260326.htm",
            "sha256": "8c873457f8332f7e1c4e2c26c5e1a37d70fdb32d9f2182961bb87548c54a3dbb",
            "sha256Normalized": "fbd500a988216f6b917ccabb4375c3ce2897362b28bc43ffeb912bb89b8d7c0e",
            "bytesRead": 1420482,
            "complete": true,
            "claim": "DEF 14A 2026-03-26: closing price $40.79 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001547903-26-000011",
            "url": "https://www.sec.gov/Archives/edgar/data/1547903/000154790326000011/nmih-20251231.htm",
            "sha256": "19c399ce7b789a03cc7534ce1d59b8cd4199b34c587c0589d98b6e1515213068",
            "sha256Normalized": "b5010ef1a2236c4ae60270a64a5478f996d7d0a3be1139f710286651ce04c6bf",
            "bytesRead": 2986353,
            "complete": true,
            "claim": "10-K 2026-02-12: closing price $41.05 on 2026-02-06"
          }
        ],
        "priceEvidence": [
          {
            "date": "2015-12-31",
            "rawPrice": 6.77,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2015-12-31",
              6.77
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-16-000221",
            "sha256": "070d5f5e13b3daed6a44fba646b9434e3ee92818ee7b46bbc75bb0083212bd66",
            "quote": "d/or the hypothetical change in control each occurred on December 31, 2015. The closing price of our common stock on December 31, 2015 on NASDAQ was $6.77 per share. 22 Name "
          },
          {
            "date": "2016-12-30",
            "rawPrice": 10.65,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2016-12-30",
              10.65
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-17-000043",
            "sha256": "da2281c4e5eed02ef34ce2b6598db185ff346dcd518c7b38c49d5259e2da4afb",
            "quote": "s of employment following a change in control under the CIC Severance Plan. The closing price of our common stock on December 30, 2016 on NASDAQ was $10.65 per share (the Clos"
          },
          {
            "date": "2017-12-29",
            "rawPrice": 17,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2017-12-29",
              17
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-18-000057",
            "sha256": "9e1ecf1fa872029446b39a820264bcfd219430c4e500d12712433844486020ac",
            "quote": "d/or the hypothetical change in control each occurred on December 31, 2017. The closing price of our common stock on December 29, 2017 on NASDAQ was $17.00 per share (the Clos"
          },
          {
            "date": "2020-12-31",
            "rawPrice": 22.65,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              22.65
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-21-000083",
            "sha256": "73de802e73068ea76d5921ce68067b50ef70ce8731571ea807fbcca910cc0e88",
            "quote": "s based on the assumption that such an event occurred on December 31, 2020. The closing price of our common stock on December 31, 2020 on NASDAQ was $22.65 per share (the Clos"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 21.85,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              21.85
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-22-000078",
            "sha256": "60c01a1a16cdc39804de28f94a63ff22106336631b95daf33297057afdcee8ef",
            "quote": "able reflects the actual severance termination payments made to Ms. Merkle. The closing price of our common stock on December 31, 2021 on NASDAQ was $21.85 per share (the Clos"
          },
          {
            "date": "2022-02-11",
            "rawPrice": 25.97,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-02-11",
              25.97
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-22-000060",
            "sha256": "81b8d12e429ba5251952e16868ffd7ab185e064294152791c90747f5ea5fa33f",
            "quote": "ers of record. There are no shares of our Class B common stock outstanding. The closing price of our common stock on NASDAQ on February 11, 2022 was $25.97. No dividends on ou"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 20.9,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              20.9
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-23-000061",
            "sha256": "5534bd5be6bb77b69e30e30f3aed301809d59c22bddd5476837b0f079d40b8f6",
            "quote": "s based on the assumption that such an event occurred on December 31, 2022. The closing price of our common stock on December 31, 2022 on NASDAQ was $20.90 per share (the Clos"
          },
          {
            "date": "2023-02-10",
            "rawPrice": 22.95,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-02-10",
              22.95
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-23-000036",
            "sha256": "f58fd176b581682c518448ef675eb2843b079a3f18af7ad0991632fedcacc5ce",
            "quote": "ers of record. There are no shares of our Class B common stock outstanding. The closing price of our common stock on Nasdaq on February 10, 2023 was $22.95. No dividends on ou"
          },
          {
            "date": "2023-12-31",
            "rawPrice": 29.68,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              29.68
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-24-000091",
            "sha256": "007e00b35198c1d487ab64615d08a5460fde3a7aa59a5f6a275f53d880ae1f90",
            "quote": "s based on the assumption that such an event occurred on December 31, 2023. The closing price of our common stock on December 31, 2023 on NASDAQ was $29.68 per share (the Clos"
          },
          {
            "date": "2024-02-09",
            "rawPrice": 30.19,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-02-09",
              30.19
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-24-000035",
            "sha256": "6de61d5dca77b8834f22cd34315e186c6b6ef049c276536848cb7da9cef7f16c",
            "quote": "ers of record. There are no shares of our Class B common stock outstanding. The closing price of our common stock on Nasdaq on February 9, 2024 was $30.19. No dividends on ou"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 40.79,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              40.79
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-26-000019",
            "sha256": "8c873457f8332f7e1c4e2c26c5e1a37d70fdb32d9f2182961bb87548c54a3dbb",
            "quote": "s based on the assumption that such an event occurred on December 31, 2025. The closing price of our common stock on December 31, 2025 on NASDAQ was $40.79 per share (the Clos"
          },
          {
            "date": "2026-02-06",
            "rawPrice": 41.05,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-06",
              41.05
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001547903-26-000011",
            "sha256": "19c399ce7b789a03cc7534ce1d59b8cd4199b34c587c0589d98b6e1515213068",
            "quote": " of our common stock outstanding and approximately seven holders of record. The closing price of our common stock on Nasdaq on February 6, 2026 was $41.05. No dividends on ou"
          }
        ]
      },
      {
        "securityId": "ref_OPEN",
        "ticker": "OPEN",
        "cik": "0001801169",
        "issuer": "Opendoor Technologies Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:OPEN:2020-06-18",
        "masterRowSet": [
          "tiingo:NASDAQ:OPEN:2009-05-21",
          "tiingo:NASDAQ:OPEN:2020-06-18"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, $0.0001 par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-03-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-03-05",
          "checkedTo": "2026-10-23",
          "bars": 295,
          "pointsSha256": "337495f5ac28c8ece1d80567579e8b035d9ed6c589b687adcaec365f3947341f"
        },
        "lastConfirmedCover": {
          "accession": "0001801169-26-000021",
          "filingDate": "2026-08-04",
          "sha256": "1bdec55a122e4c01967f9da8d0bd5778909e724977ff60d107b5161c9296279a"
        },
        "anchorGaps": {
          "matchDates": 6,
          "firstMatch": "2021-12-31",
          "lastMatch": "2026-08-12",
          "maxGapDays": 641
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001801169-26-000021",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000180116926000021/open-20260630.htm",
            "sha256": "1bdec55a122e4c01967f9da8d0bd5778909e724977ff60d107b5161c9296279a",
            "sha256Normalized": "e5f109d9dd8ba1f12eeb31b7573526bf1b0e6fb6fe3932527294472eb3873fd3",
            "bytesRead": 1860394,
            "complete": true,
            "claim": "10-Q 2026-08-04 cover: OPEN / Common stock, $0.0001 par value per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001801169-21-000010",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000180116921000010/open-20210304.htm",
            "sha256": "b16f32004ba8a9778504cd87c58fa08f44f86c8efb9d4392420cddb69a7dd127",
            "sha256Normalized": "97c879c04be471064b931a3b33e44c4b966dffe0d7fad550fa090ae27d14e501",
            "bytesRead": 40306,
            "complete": true,
            "claim": "OPEN / Common stock, $0.0001 par value per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-22-013800",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000114036122013800/ny20001092x1_def14a.htm",
            "sha256": "6132993a5f73c0665911d5548066a52b4ba59987180b8b816fab8d8ce1b476cd",
            "sha256Normalized": "0d4d036dfdd3dddf9316b1471e55d1e4fc58bbdc3f7dd3dbf4f366e1a987e236",
            "bytesRead": 1014572,
            "complete": true,
            "claim": "DEF 14A 2022-04-08: closing price $14.61 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-23-021060",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000114036123021060/ny20006733x1_def14a.htm",
            "sha256": "d4c4201605563afce0d3cb25c15c7fbb7542b0426e390ed1a3fcee6be577f83d",
            "sha256Normalized": "c7585c2c8f8f746526c99050aeb8eeff6c3cc5559d512edc86e2490c4e835452",
            "bytesRead": 1666862,
            "complete": true,
            "claim": "DEF 14A 2023-04-27: closing price $1.16 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-021743",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000114036124021743/ny20018669x1_def14a.htm",
            "sha256": "c51f6bfbc2de256901c5eb5ed41feff409109b4274205bb7d5d629e9d11b88ea",
            "sha256Normalized": "db5147b3349faf7965a9e3a02c797fdf986258ed827d808badbdd29cbb72313e",
            "bytesRead": 1440630,
            "complete": true,
            "claim": "DEF 14A 2024-04-24: closing price $4.48 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-017460",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000114036126017460/ny20064714x1_def14a.htm",
            "sha256": "66e5ed6c8b77b7ffd7ed161a685e8139c4745a77943430fab5b48e0a85f9abf1",
            "sha256Normalized": "66e5ed6c8b77b7ffd7ed161a685e8139c4745a77943430fab5b48e0a85f9abf1",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-04-28: closing price $7.97 on 2025-09-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-033739",
            "url": "https://www.sec.gov/Archives/edgar/data/1801169/000114036126033739/ef20080596_8k.htm",
            "sha256": "42c5a7a2f5b1f3a85762bd39d20f1bad0cf55ba2fab17fa3326806f21a296396",
            "sha256Normalized": "0fe6c01944daf42157f0fa5e0b014c9daccd788374ae2e87e1b6e996d90beb91",
            "bytesRead": 62866,
            "complete": true,
            "claim": "8-K 2026-08-19: closing price $3.49 on 2026-08-12"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 14.61,
            "laterSplitProduct": 1.033333,
            "seriesBar": [
              "2021-12-31",
              14.14
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1.000091,
            "accession": "0001140361-22-013800",
            "sha256": "6132993a5f73c0665911d5548066a52b4ba59987180b8b816fab8d8ce1b476cd",
            "quote": "— ​ ​ — ​ ​ — ​ ​ — (1) The amounts in this column were determined based on the closing market price of the Company's common stock on December 31, 2021 of $14.61. These amounts do n"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 1.16,
            "laterSplitProduct": 1.033333,
            "seriesBar": [
              "2022-12-30",
              1.12
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 0.997701,
            "accession": "0001140361-23-021060",
            "sha256": "d4c4201605563afce0d3cb25c15c7fbb7542b0426e390ed1a3fcee6be577f83d",
            "quote": "985,084 ​ ​ — ​ ​ — (1) The amounts in this column were determined based on the closing market price of the Company’s common stock on December 30, 2022 of $1.16. These amounts do n"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 4.48,
            "laterSplitProduct": 1.033333,
            "seriesBar": [
              "2023-12-29",
              4.34
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1.001041,
            "accession": "0001140361-24-021743",
            "sha256": "c51f6bfbc2de256901c5eb5ed41feff409109b4274205bb7d5d629e9d11b88ea",
            "quote": "093,094 ​ ​ — ​ ​ — (1) The amounts in this column were determined based on the closing market price of the Company’s common stock on December 29, 2023 of $4.48. These amounts do n"
          },
          {
            "date": "2025-09-30",
            "rawPrice": 7.97,
            "laterSplitProduct": 1.033333,
            "seriesBar": [
              "2025-09-30",
              7.71
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 0.999623,
            "accession": "0001140361-26-017460",
            "sha256": "66e5ed6c8b77b7ffd7ed161a685e8139c4745a77943430fab5b48e0a85f9abf1",
            "quote": "th the exception of the cash value for Mr. Freiha, which was calculated using a closing price of $7.97 on September 30, 2025). (2) Represents th"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 5.83,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              5.83
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-017460",
            "sha256": "66e5ed6c8b77b7ffd7ed161a685e8139c4745a77943430fab5b48e0a85f9abf1",
            "quote": "b — — — — — — — — — (1) The amounts in this column were determined based on the closing market price of the Company’s Common Stock on December 31, 2025 of $5.83. These amounts do n"
          },
          {
            "date": "2026-08-12",
            "rawPrice": 3.49,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-08-12",
              3.49
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-033739",
            "sha256": "42c5a7a2f5b1f3a85762bd39d20f1bad0cf55ba2fab17fa3326806f21a296396",
            "quote": "The initial conversion price represents a premium of approximately 35% over the last reported sale price of $3.49 per share of the Company’s common stock on August 12, 2026. The conversion rat"
          }
        ]
      },
      {
        "securityId": "ref_OSG",
        "ticker": "OSG",
        "cik": "0000874501",
        "issuer": "OCTAVE SPECIALTY GROUP INC",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:OSG:2015-12-01",
        "masterRowSet": [
          "tiingo:NYSE:OSG:2013-05-01",
          "tiingo:NYSE:OSG:2015-12-01"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2025-12-19",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2025-12-19",
          "checkedTo": "2026-10-23",
          "bars": 45,
          "pointsSha256": "2bc52b5002253d4cf565e5d84e2283518dd66f54fe105e8c997b0399b8bf6874"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-054446",
          "filingDate": "2026-08-06",
          "sha256": "15635712650811e534e9b38ba7849eed18990db32c3c615408cf388aa1e722d1"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 218
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-054446",
            "url": "https://www.sec.gov/Archives/edgar/data/874501/000162828026054446/ambc-20260630.htm",
            "sha256": "15635712650811e534e9b38ba7849eed18990db32c3c615408cf388aa1e722d1",
            "sha256Normalized": "15635712650811e534e9b38ba7849eed18990db32c3c615408cf388aa1e722d1",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-08-06 cover: OSG / Common stock par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001628280-25-057024",
            "url": "https://www.sec.gov/Archives/edgar/data/874501/000162828025057024/ambc-20251210.htm",
            "sha256": "e0a931f06fc395241c730a2fd27f813fe875cc41613bb7a1e8692364a37941d4",
            "sha256Normalized": "98c2516f403a532a044ac63c84390e9d6c007f9ae6a93db46cb0c7f60d638976",
            "bytesRead": 46801,
            "complete": true,
            "claim": "OSG / Common stock, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-024684",
            "url": "https://www.sec.gov/Archives/edgar/data/874501/000162828026024684/ambc-20260410.htm",
            "sha256": "620542019a1055d71f7a02fbc8898c947d2440ae9df176e6c613c302ef9f1af4",
            "sha256Normalized": "3c9aabf950bef2385bd73ce3cf551ce739828c3d69017a6dfa5a2204ef562cbe",
            "bytesRead": 1599400,
            "complete": true,
            "claim": "DEF 14A 2026-04-10: closing price $7.78 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 7.78,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              7.78
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-024684",
            "sha256": "620542019a1055d71f7a02fbc8898c947d2440ae9df176e6c613c302ef9f1af4",
            "quote": "ber 31, 2025. The market value of the RSUs and PSUs was calculated based on the closing price of Octave’s common stock on the NYSE on December 31, 2025 ($7.78). The Compensation "
          }
        ]
      },
      {
        "securityId": "ref_PAY",
        "ticker": "PAY",
        "cik": "0001841156",
        "issuer": "Paymentus Holdings, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:PAY:2021-05-26",
        "masterRowSet": [
          "tiingo:NYSE:PAY:2005-04-29",
          "tiingo:NYSE:PAY:2021-05-26"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "557cf044a74d6a8565ef7179d9189389edd80d31129d49aa877c91468fc235ff"
        },
        "lastConfirmedCover": {
          "accession": "0001193125-26-330940",
          "filingDate": "2026-08-04",
          "sha256": "9eb8dc90f0870e02a9c9e8ab61283df53bc249a8efe2c164f82a4310dfd4c7ea"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 216
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001193125-26-330940",
            "url": "https://www.sec.gov/Archives/edgar/data/1841156/000119312526330940/pay-20260630.htm",
            "sha256": "9eb8dc90f0870e02a9c9e8ab61283df53bc249a8efe2c164f82a4310dfd4c7ea",
            "sha256Normalized": "571dcf9fb4b2935e60f17933c3ef83bae3cd84a0ea6b20f43d350600ab8f4ea3",
            "bytesRead": 1982206,
            "complete": true,
            "claim": "10-Q 2026-08-04 cover: PAY / Class A Common Stock, par value $0.0001 per share / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001564590-21-022583",
            "url": "https://www.sec.gov/Archives/edgar/data/1841156/000156459021022583/ck7045120534-s1.htm",
            "sha256": "62039bbbea0feb9bb3e0dce52564118ad397e19d6202c861c80778b8492f8af2",
            "sha256Normalized": "62039bbbea0feb9bb3e0dce52564118ad397e19d6202c861c80778b8492f8af2",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "between $ and $ per share. We intend to apply to list our Class A common stock on the New York Stock Exchange under the symbol “PAY.” Following this offering, we will have two classes of authorized common stock, Class A common stock and Class B common stock. The rights of the hol"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-170573",
            "url": "https://www.sec.gov/Archives/edgar/data/1841156/000119312526170573/d22096ddef14a.htm",
            "sha256": "9cf6e6864377c47ff03086d5147ff6528d1e1a1ce1cc889b93be08d994ca81d1",
            "sha256Normalized": "08a383050d7a93ad6697245ccdea120728c66dffc441d9fcdf39c6f87cc749ba",
            "bytesRead": 918613,
            "complete": true,
            "claim": "DEF 14A 2026-04-22: closing price $31.59 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 31.59,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              31.59
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-170573",
            "sha256": "9cf6e6864377c47ff03086d5147ff6528d1e1a1ce1cc889b93be08d994ca81d1",
            "quote": "8,804 (6) 2,489,418 -46- Table of Contents (1) The market value is based on the closing price of our common stock on the NYSE on December 31, 2025, of $31.59, multiplied by the "
          }
        ]
      },
      {
        "securityId": "ref_PD",
        "ticker": "PD",
        "cik": "0001568100",
        "issuer": "PagerDuty, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:PD:2019-04-11",
        "masterRowSet": [
          "tiingo:NYSE:PD:2019-04-11",
          "tiingo:NYSE:PD:2019-05-15"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.000005 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2019-07-05",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "CONCATENATION_GUARD"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2019-07-05",
          "checkedTo": "2026-10-23",
          "bars": 382,
          "pointsSha256": "91817183add42ccbc10e0665926e0f5f7c79a79cf7b1a99e9c0d3f78f47023fe"
        },
        "lastConfirmedCover": {
          "accession": "0001568100-26-000045",
          "filingDate": "2026-08-27",
          "sha256": "9650d0254c11813dac3dd076f5a99d7ae2b5f1d6e8ccf6dd0cd9ccee0febf23f"
        },
        "anchorGaps": {
          "matchDates": 4,
          "firstMatch": "2020-01-31",
          "lastMatch": "2026-01-30",
          "maxGapDays": 1461
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001568100-26-000045",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810026000045/pd-20260731.htm",
            "sha256": "9650d0254c11813dac3dd076f5a99d7ae2b5f1d6e8ccf6dd0cd9ccee0febf23f",
            "sha256Normalized": "b9f41a1b4c51dea4f0ae611e94f09df48c0356bd9f5d638bdb72d8dd8baa3aba",
            "bytesRead": 1468755,
            "complete": true,
            "claim": "10-Q 2026-08-27 cover: PD / Common Stock, par value $0.000005 per share / New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001628280-19-003003",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000162828019003003/pagerdutys-1.htm",
            "sha256": "91495cba4556f9dad897552fc659119674bdf26f4f4ff72306f987fd546be344",
            "sha256Normalized": "91495cba4556f9dad897552fc659119674bdf26f4f4ff72306f987fd546be344",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "will be between $ and $ per share. We intend to apply to list our common stock on the New York Stock Exchange under the symbol “PD.” We are an “emerging growth company” as defined under the federal securities laws. Investing in our common stock involves risks. See “Risk Factors” "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001568100-20-000020",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810020000020/proxy2020.htm",
            "sha256": "d04fea5952e5d26a7d8291f5ddaf416d7c3f6c955fb94c1c34290e94dd415aab",
            "sha256Normalized": "97b55faf3b3e2c7fcfb16c6838f67c3ee71cf856b713b64a8438ebb4ef510fd3",
            "bytesRead": 574193,
            "complete": true,
            "claim": "DEF 14A 2020-05-04: closing price $23.32 on 2020-01-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001568100-26-000012",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810026000012/pd-20260131.htm",
            "sha256": "f83fdc64a85dd0b642aff9c8abb0e67269c00a75ab8e1f2b2e15e55b4ffd3ef6",
            "sha256Normalized": "8287b954971197f64832cd0e60ea1abe466f57f11c884411812c33562e4102fc",
            "bytesRead": 2244487,
            "complete": true,
            "claim": "10-K 2026-03-12: closing price $48.73 on 2021-01-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001568100-21-000019",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810021000019/proxy2021.htm",
            "sha256": "2e5c5c0a360d2d4b45708a7ced56ead58a36febc2f835e2af97b378389a6b569",
            "sha256Normalized": "07fd6e5adb326fb16d3229200855b41b7eb83c990aaf8e80208b056bc1897d51",
            "bytesRead": 783054,
            "complete": true,
            "claim": "DEF 14A 2021-05-03: closing price $48.73 on 2021-01-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001568100-25-000043",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810025000043/pd-20250527.htm",
            "sha256": "3b2686dfc3ad6804c5ca1409c6ef83d0e8f3e68c6b45be87e0e111c7556beb15",
            "sha256Normalized": "bc9387e5422fc35085b84b6995bc4b8bc199b9787d5bbc918e7ec6acc2b695a6",
            "bytesRead": 1225904,
            "complete": true,
            "claim": "DEF 14A 2025-05-27: closing price $18.52 on 2025-01-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001568100-26-000020",
            "url": "https://www.sec.gov/Archives/edgar/data/1568100/000156810026000020/pd-20260504.htm",
            "sha256": "8e5f9faf86d8d3ff5fc0c98cc7e1d3d2eb7b89ab0cdbc85f6cb28864e065335b",
            "sha256Normalized": "22ca413fd6715355198bc51ca08ba3cc0b829c76e08f04d4b8bc6b5bc879772b",
            "bytesRead": 1076259,
            "complete": true,
            "claim": "DEF 14A 2026-05-04: closing price $10.6 on 2026-01-30"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-01-31",
            "rawPrice": 23.32,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-01-31",
              23.32
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001568100-20-000020",
            "sha256": "d04fea5952e5d26a7d8291f5ddaf416d7c3f6c955fb94c1c34290e94dd415aab",
            "quote": "r common stock underlying the stock awards as of January 31, 2020, based on the closing price of our common stock, as reported on the New York Stock Exchange, of $23.32 per share on January 31, 2020. (3) All shares sub"
          },
          {
            "date": "2021-01-31",
            "rawPrice": 48.73,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-01-29",
              48.73
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001568100-26-000012",
            "sha256": "f83fdc64a85dd0b642aff9c8abb0e67269c00a75ab8e1f2b2e15e55b4ffd3ef6",
            "quote": "dices on January 31, 2021 and the reinvestment of dividends. The graph uses the closing market price on January 31, 2021 of $48.73 per share as the in"
          },
          {
            "date": "2021-01-31",
            "rawPrice": 48.73,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-01-29",
              48.73
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001568100-21-000019",
            "sha256": "2e5c5c0a360d2d4b45708a7ced56ead58a36febc2f835e2af97b378389a6b569",
            "quote": "r common stock underlying the stock awards as of January 31, 2021, based on the closing price of our common stock, as reported on the New York Stock Exchange, of $48.73 per share on January 31, 2021. (3) The shares und"
          },
          {
            "date": "2025-01-31",
            "rawPrice": 18.52,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-01-31",
              18.52
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001568100-25-000043",
            "sha256": "3b2686dfc3ad6804c5ca1409c6ef83d0e8f3e68c6b45be87e0e111c7556beb15",
            "quote": "r common stock underlying the stock awards as of January 31, 2025, based on the closing price of our common stock, as reported on the NYSE, of $18.52 per share on January 31, 2025. (3) The shares und"
          },
          {
            "date": "2026-01-30",
            "rawPrice": 10.6,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-01-30",
              10.6
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001568100-26-000020",
            "sha256": "8e5f9faf86d8d3ff5fc0c98cc7e1d3d2eb7b89ab0cdbc85f6cb28864e065335b",
            "quote": "r common stock underlying the stock awards as of January 30, 2026, based on the closing price of our common stock, as reported on the NYSE, of $10.60 per share on January 30, 2026. (3) The shares und"
          }
        ]
      },
      {
        "securityId": "ref_PPTA",
        "ticker": "PPTA",
        "cik": "0001526243",
        "issuer": "PERPETUA RESOURCES CORP.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:PPTA:2021-02-18",
        "masterRowSet": [
          "tiingo:NASDAQ:PPTA:2016-01-04",
          "tiingo:NASDAQ:PPTA:2021-02-18"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares, without par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-02-19",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-02-19",
          "checkedTo": "2026-10-23",
          "bars": 297,
          "pointsSha256": "2ea16e3bdc0936bffe86ae0dada8fb79a2e6e96e638211e4c1a1dfed915ff1ed"
        },
        "lastConfirmedCover": {
          "accession": "0001104659-26-097134",
          "filingDate": "2026-08-14",
          "sha256": "9df229f34f063a699605143aa0838a670e4f02fc567f72cbbf06d30845650aa0"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2022-12-30",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001104659-26-097134",
            "url": "https://www.sec.gov/Archives/edgar/data/1526243/000110465926097134/ppta-20260630x10q.htm",
            "sha256": "9df229f34f063a699605143aa0838a670e4f02fc567f72cbbf06d30845650aa0",
            "sha256Normalized": "7c42fd30725834b0c434c4cb1c9533afd643365617d6da6538fce811204b5ad2",
            "bytesRead": 1298529,
            "complete": true,
            "claim": "10-Q 2026-08-14 cover: PPTA / Common Shares, without par value / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001104659-21-025136",
            "url": "https://www.sec.gov/Archives/edgar/data/1526243/000110465921025136/tm217090d1_ex99-1.htm",
            "sha256": "d0875ced07eb9a72aad0aad412903ecd3d70f081188a47e966b9ab44a5f9a230",
            "sha256Normalized": "d0875ced07eb9a72aad0aad412903ecd3d70f081188a47e966b9ab44a5f9a230",
            "bytesRead": 22813,
            "complete": true,
            "claim": "aq Stock Market (“Nasdaq”). The Company’s common shares will begin trading on the Nasdaq on February 18, 2021 under the symbol “PPTA” and on the Toronto Stock Exchange (“TSX”) under the new name at market open on or around February 18, 2021 under the stock symbol “PPTA”. As the S"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-23-042573",
            "url": "https://www.sec.gov/Archives/edgar/data/1526243/000110465923042573/tm232092-4_def14a.htm",
            "sha256": "d799061f11080eeb0bb43a925f4a2451262e3723ec21e8c4dc1644ecbda2b0c3",
            "sha256Normalized": "7d6cb0779febf107ba5a8fb29abbd9de1f18f902ff6a18ed510680074a0e71cb",
            "bytesRead": 1007526,
            "complete": true,
            "claim": "DEF 14A 2023-04-06: closing price $2.92 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-24-043662",
            "url": "https://www.sec.gov/Archives/edgar/data/1526243/000110465924043662/tm242846-1_def14a.htm",
            "sha256": "0c73e006eb9d71100e156b1ff2bc8b38d432e97ca53e0b204f2b337a2e452d97",
            "sha256Normalized": "6e60fd2aa31ad79da060492d68ea3f1fe79fe106f522535ed7f270a9e59f2777",
            "bytesRead": 1195804,
            "complete": true,
            "claim": "DEF 14A 2024-04-04: closing price $3.17 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-048110",
            "url": "https://www.sec.gov/Archives/edgar/data/1526243/000110465926048110/tm2611905-1_def14a.htm",
            "sha256": "8c9f1bcab57b6b26cdb0132b65b43abe9aaf678b23a1422bfd08d091f10cbfa1",
            "sha256Normalized": "aa8c5c2ba218d95b2c9f3b7dc3f78a88e394aee8f1954bbb39806952cca06d53",
            "bytesRead": 1162221,
            "complete": true,
            "claim": "DEF 14A 2026-04-24: closing price $24.21 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 2.92,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              2.92
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-23-042573",
            "sha256": "d799061f11080eeb0bb43a925f4a2451262e3723ec21e8c4dc1644ecbda2b0c3",
            "quote": ") The market value of the outstanding RSUs and PSUs was calculated based on the closing price of the Company’s Common Shares on the Nasdaq stock exchange on December 30, 2022, of $2.92. The market value o"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 3.17,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              3.17
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-24-043662",
            "sha256": "0c73e006eb9d71100e156b1ff2bc8b38d432e97ca53e0b204f2b337a2e452d97",
            "quote": ") The market value of the outstanding RSUs and PSUs was calculated based on the closing price of the Company’s Common Shares on the Nasdaq stock exchange on December 29, 2023, of $3.17. ​ (5) This column "
          },
          {
            "date": "2025-12-31",
            "rawPrice": 24.21,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              24.21
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-048110",
            "sha256": "8c9f1bcab57b6b26cdb0132b65b43abe9aaf678b23a1422bfd08d091f10cbfa1",
            "quote": ") The market value of the outstanding RSUs and PSUs was calculated based on the closing price of the Company’s Common Shares on the Nasdaq stock exchange on December 31, 2025, of $24.21. ​ (5) This column "
          }
        ]
      },
      {
        "securityId": "ref_RELY",
        "ticker": "RELY",
        "cik": "0001782170",
        "issuer": "Remitly Global, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:RELY:2021-09-23",
        "masterRowSet": [
          "tiingo:NASDAQ:RELY:2015-02-24",
          "tiingo:NASDAQ:RELY:2021-09-23"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.0001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-09-24",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-09-24",
          "checkedTo": "2026-10-23",
          "bars": 266,
          "pointsSha256": "a40668a7805e153637eff13f3672da761e67ed4b163e49f6be497fa5e564ddd6"
        },
        "lastConfirmedCover": {
          "accession": "0001628280-26-053424",
          "filingDate": "2026-08-05",
          "sha256": "e8d10026b267ac10d804ee0af680ea354538ff63307b37c6d42c2f3041e15d73"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2021-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001628280-26-053424",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000162828026053424/rely-20260630.htm",
            "sha256": "e8d10026b267ac10d804ee0af680ea354538ff63307b37c6d42c2f3041e15d73",
            "sha256Normalized": "6bb474b99822c523aa86ae754fbeed1244b6483e46648e803b3b9982156316e0",
            "bytesRead": 1214487,
            "complete": true,
            "claim": "10-Q 2026-08-05 cover: RELY / Common Stock, $0.0001 par value / The Nasdaq Global Select Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001628280-21-017788",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000162828021017788/remitlyglobalinc-sx1.htm",
            "sha256": "5d2ab6be58aa63fc95368e08bed118bc4df3236b99537bd7d93d952b3ef73c3b",
            "sha256Normalized": "5d2ab6be58aa63fc95368e08bed118bc4df3236b99537bd7d93d952b3ef73c3b",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ill be between $ and $ per share. We have applied to list our common stock on the Nasdaq Global Select Market under the symbol “RELY.” We are an “emerging growth company” as that term is used in the Jumpstart Our Business Startups Act of 2012 and, as such, may elect to comply wit"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001782170-22-000068",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000178217022000068/relyproxystatement2022.htm",
            "sha256": "4f84223621419bbe82116500a5ba434ee68122dc7e9ce42c5da363d616be0b0e",
            "sha256Normalized": "94d8fb2bde7e762d6a4cac4be85b952dd1c9322576bf7052c2f3bd7aeea39845",
            "bytesRead": 432192,
            "complete": true,
            "claim": "DEF 14A 2022-04-19: closing price $20.62 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001782170-23-000056",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000178217023000056/rely-20230428.htm",
            "sha256": "1228a0e586011d9b61e487d50d17612c9a6b76bc6a95a3c00737a893c7ff18a0",
            "sha256Normalized": "55b84374da2f5f73c1e91e232390c16878c91b2a89073269c724c0ec82e0f7a6",
            "bytesRead": 667533,
            "complete": true,
            "claim": "DEF 14A 2023-05-01: closing price $11.45 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001782170-24-000107",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000178217024000107/rely-20240426.htm",
            "sha256": "7952fe7ab151e82f4e720692e99ba252ad8959a825bacc922612ecbe4e63ced8",
            "sha256Normalized": "697058543e0793d390d1760e2b602e29d9de6d8ffaea56a4524797477c3e6252",
            "bytesRead": 701815,
            "complete": true,
            "claim": "DEF 14A 2024-04-26: closing price $19.42 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001782170-26-000048",
            "url": "https://www.sec.gov/Archives/edgar/data/1782170/000178217026000048/rely-20260424.htm",
            "sha256": "d4248a49d6d9e9311a6fbd4753a40a6d2f48975d23c42b0d42e6d65d265755c0",
            "sha256Normalized": "c141e249926cff22c1ec893052da3ae5493d48ac1fcafcded46bfb70d96a4dd4",
            "bytesRead": 697227,
            "complete": true,
            "claim": "DEF 14A 2026-04-24: closing price $13.8 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 20.62,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              20.62
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001782170-22-000068",
            "sha256": "4f84223621419bbe82116500a5ba434ee68122dc7e9ce42c5da363d616be0b0e",
            "quote": "er the 2011 Plan. (2) The market value of unvested stock awards is based on the closing market price of our Common Stock on December 31, 2021 of $20.62. (3) This amount re"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 11.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              11.45
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001782170-23-000056",
            "sha256": "1228a0e586011d9b61e487d50d17612c9a6b76bc6a95a3c00737a893c7ff18a0",
            "quote": "der the 2021 Plan. 2. The market value of unvested stock awards is based on the closing market price of our Common Stock on December 30, 2022 of $11.45. 3. The option vest"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 11.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              11.45
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001782170-23-000056",
            "sha256": "1228a0e586011d9b61e487d50d17612c9a6b76bc6a95a3c00737a893c7ff18a0",
            "quote": "lated by multiplying the number of unvested RSUs subject to acceleration by the closing price of our common stock on December 31, 2022, which was $11.45. The estimated bene"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 19.42,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              19.42
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001782170-24-000107",
            "sha256": "7952fe7ab151e82f4e720692e99ba252ad8959a825bacc922612ecbe4e63ced8",
            "quote": "der the 2021 Plan. 2. The market value of unvested stock awards is based on the closing market price of our Common Stock on December 29, 2023 of $19.42. 36 REMITLY GLOBAL,"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 13.8,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              13.8
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001782170-26-000048",
            "sha256": "d4248a49d6d9e9311a6fbd4753a40a6d2f48975d23c42b0d42e6d65d265755c0",
            "quote": "der the 2021 Plan. 2. The market value of unvested stock awards is based on the closing price of our common stock on December 31, 2025, of $13.80. 3. The option vest"
          }
        ]
      },
      {
        "securityId": "ref_RENT",
        "ticker": "RENT",
        "cik": "0001468327",
        "issuer": "Rent the Runway, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:RENT:2021-10-27",
        "masterRowSet": [
          "tiingo:NASDAQ:RENT:1992-03-02",
          "tiingo:NASDAQ:RENT:2021-10-27"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, par value $0.001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-05-24",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-05-24",
          "checkedTo": "2026-10-23",
          "bars": 127,
          "pointsSha256": "ce872815b2cffc5ac3bcb0e9803819f379cd6a68ef71c56728e5543227593f78"
        },
        "lastConfirmedCover": {
          "accession": "0001468327-26-000088",
          "filingDate": "2026-09-11",
          "sha256": "33876613803668f1d7d00fed5c58fcc0d0484dd846aee07a5cc7f49529987386"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2026-05-20",
          "lastMatch": "2026-05-20",
          "maxGapDays": 114
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001468327-26-000088",
            "url": "https://www.sec.gov/Archives/edgar/data/1468327/000146832726000088/rent-20260731.htm",
            "sha256": "33876613803668f1d7d00fed5c58fcc0d0484dd846aee07a5cc7f49529987386",
            "sha256Normalized": "ab7ce0164ee43923948046bd37f4058fb96a2d61bccf31e2e892524650f89917",
            "bytesRead": 1449825,
            "complete": true,
            "claim": "10-Q 2026-09-11 cover: RENT / Class A common stock, par value $0.001 per share / Nasdaq"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001468327-21-000007",
            "url": "https://www.sec.gov/Archives/edgar/data/1468327/000146832721000007/wdq-20211208.htm",
            "sha256": "72dc200ebd49962670b17b5cb298e47dda23edcddd98b7150763329840773f8c",
            "sha256Normalized": "a42b3e937b57006a6ed606832b2d5dc90b7dc6a72a6e9ac2225c77d10a0dd5b6",
            "bytesRead": 42775,
            "complete": true,
            "claim": "RENT / Class A common stock, $0.001 par value per share / The Nasdaq Global Select Market"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-023446",
            "url": "https://www.sec.gov/Archives/edgar/data/1468327/000114036126023446/ny20064283x2_def14a.htm",
            "sha256": "e233b2604e7ae6344d00bd1c9938012da75fe75acbe99673d95d50657830dae1",
            "sha256Normalized": "f308613e1fdf85684806a16f558348eb375f215c34d4a07b0b91939e1e56d843",
            "bytesRead": 1264691,
            "complete": true,
            "claim": "DEF 14A 2026-06-01: closing price $3.79 on 2026-05-20"
          }
        ],
        "priceEvidence": [
          {
            "date": "2026-05-20",
            "rawPrice": 3.79,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-05-20",
              3.79
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-023446",
            "sha256": "e233b2604e7ae6344d00bd1c9938012da75fe75acbe99673d95d50657830dae1",
            "quote": "s and Ms. Bariquit’s continued service through the applicable vesting date. The closing price of a share of our Class A common stock on May 20, 2026 was $3.79. Name and Position "
          }
        ]
      },
      {
        "securityId": "ref_RPRX",
        "ticker": "RPRX",
        "cik": "0001802768",
        "issuer": "Royalty Pharma plc",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:RPRX:2020-06-16",
        "masterRowSet": [
          "tiingo:NASDAQ:RPRX:1993-03-26",
          "tiingo:NASDAQ:RPRX:2020-06-16"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A ordinary shares, par value $0.0001",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-06-19",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-06-19",
          "checkedTo": "2026-10-23",
          "bars": 332,
          "pointsSha256": "c11e01adcef022bdc2cfda282bde397f6e246947ecc7fbb74a44d36ff11485dd"
        },
        "lastConfirmedCover": {
          "accession": "0001802768-26-000015",
          "filingDate": "2026-08-05",
          "sha256": "e66bcef3a5b2230ef4236fe77ffb5c9b5ae16951afcc12d6de53b95b5f642a60"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2020-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001802768-26-000015",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000180276826000015/rprx-20260630.htm",
            "sha256": "e66bcef3a5b2230ef4236fe77ffb5c9b5ae16951afcc12d6de53b95b5f642a60",
            "sha256Normalized": "5316c960dd93ea7e1b5472ab677f562a4ec47d203061420c93a682839cb0be9a",
            "bytesRead": 2320627,
            "complete": true,
            "claim": "10-Q 2026-08-05 cover: RPRX / Class A ordinary shares, par value $0.0001 / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001193125-20-162827",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000119312520162827/d862976ds1a.htm",
            "sha256": "4939b0bb40b391f0e8f1159adfe791b070f19e27e1199899d91377cc9c2c84bc",
            "sha256Normalized": "4939b0bb40b391f0e8f1159adfe791b070f19e27e1199899d91377cc9c2c84bc",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ely. We have applied to have our Class A ordinary shares listed on the Nasdaq Global Select Market (“Nasdaq”) under the symbol “RPRX.” Investing in our Class A ordinary shares involves risks. See “ Risk Factors ” beginning on page 22. Neither the Securities and Exchange Commissio"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-21-014879",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000114036121014879/nc10022939x1_def14a.htm",
            "sha256": "f33dc8e4d6d8bb3e57139ecfa2f009010a814c34bff8c2d9572487e175c36325",
            "sha256Normalized": "0e57643a59bc064c69103890ab60837909ae543800edc2f1758e3e0e4548b896",
            "bytesRead": 948596,
            "complete": true,
            "claim": "DEF 14A 2021-04-29: closing price $50.05 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-22-016510",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000114036122016510/ny20001491x1_def14a.htm",
            "sha256": "0c01b84526d8b90987bbcb73ad832ff658eccfdffd09baf6194f087592cf2ada",
            "sha256Normalized": "f212c5b7dbb0a4f43be7c013a6d9ce3fb4feabc2c68c7f8ff2bcb4f29ef93c25",
            "bytesRead": 1638352,
            "complete": true,
            "claim": "DEF 14A 2022-04-28: closing price $39.85 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-23-020909",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000114036123020909/ny20006708x1_def14a.htm",
            "sha256": "64db39f92c085f3d044c92d5e52f11d30404589f970335eaaeaf250ee25996db",
            "sha256Normalized": "f0b5d3e4348e1b95da319ce627006302ebd80ed7e160ae503bca4f0d2f88451e",
            "bytesRead": 2058614,
            "complete": true,
            "claim": "DEF 14A 2023-04-27: closing price $39.52 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-24-022029",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000114036124022029/ny20020881x1_def14a.htm",
            "sha256": "65502d8df66b54fb1fc4191163ab5c447676d0df9b29f0caefb2fad4c9e069d0",
            "sha256Normalized": "d1982409fdb6e97c3d7b74f87b8f4ad2c9fdacb12fab6e76d1cec6466a0e6a86",
            "bytesRead": 1890708,
            "complete": true,
            "claim": "DEF 14A 2024-04-25: closing price $28.09 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-014239",
            "url": "https://www.sec.gov/Archives/edgar/data/1802768/000114036126014239/ny20066979x1_def14a.htm",
            "sha256": "1999babfbbd926a6e7a90eee06902dd3f04c51a622c3d4afb0cb11011e52825b",
            "sha256Normalized": "1999babfbbd926a6e7a90eee06902dd3f04c51a622c3d4afb0cb11011e52825b",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-04-10: closing price $38.64 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 50.05,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              50.05
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-21-014879",
            "sha256": "f33dc8e4d6d8bb3e57139ecfa2f009010a814c34bff8c2d9572487e175c36325",
            "quote": "Us issued for service on our board of directors. (3) Fair market value based on closing price of our Class A ordinary shares of $50.05 as of December 31, 2020. 24 TABLE OF CONTEN"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 39.85,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              39.85
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-22-016510",
            "sha256": "0c01b84526d8b90987bbcb73ad832ff658eccfdffd09baf6194f087592cf2ada",
            "quote": "tright and RSUs issued for service on our Board. (3) Fair market value based on closing price of our Class A ordinary shares of $39.85 our closing share price on December 31, 2021. Equity Compensatio"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 39.52,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              39.52
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-23-020909",
            "sha256": "64db39f92c085f3d044c92d5e52f11d30404589f970335eaaeaf250ee25996db",
            "quote": "tright and RSUs issued for service on our Board. (3) Fair market value based on closing price of our Class A ordinary shares of $39.52 on December 30, 2022. Royalty Pharma ​ ​"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 28.09,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              28.09
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-24-022029",
            "sha256": "65502d8df66b54fb1fc4191163ab5c447676d0df9b29f0caefb2fad4c9e069d0",
            "quote": "tright and RSUs issued for service on our Board. (3) Fair market value based on closing price of our Class A ordinary shares of $28.09 on December 29, 2023. Royalty Pharma ​ ​"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 38.64,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              38.64
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-014239",
            "sha256": "1999babfbbd926a6e7a90eee06902dd3f04c51a622c3d4afb0cb11011e52825b",
            "quote": "r of unvested Internalization Shares held by the named executive officer by the closing price of our Class A ordinary shares on December 31, 2025, which was $38.64 per share. (3) Repr"
          }
        ]
      },
      {
        "securityId": "ref_S",
        "ticker": "S",
        "cik": "0001583708",
        "issuer": "SentinelOne, Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:S:2021-06-30",
        "masterRowSet": [
          "tiingo:NYSE:S:1984-11-08",
          "tiingo:NYSE:S:2021-06-30"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, par value $0.0001",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-10-18",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-10-18",
          "checkedTo": "2026-10-23",
          "bars": 106,
          "pointsSha256": "6effdd0d62e23eca731c5d262d7a29c65ad7c7154800728fd6d694d5d97c1834"
        },
        "lastConfirmedCover": {
          "accession": "0001583708-26-000055",
          "filingDate": "2026-08-28",
          "sha256": "5ad945c493a391391187c25dcbcd30c0949512c68a86ff1d25d1f0b1dbb0fd6e"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2026-10-13",
          "lastMatch": "2026-10-13",
          "maxGapDays": 0
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001583708-26-000055",
            "url": "https://www.sec.gov/Archives/edgar/data/1583708/000158370826000055/s-20260731.htm",
            "sha256": "5ad945c493a391391187c25dcbcd30c0949512c68a86ff1d25d1f0b1dbb0fd6e",
            "sha256Normalized": "50180be15b24f14da249876d4150ab617d04497bf4ccdff1475e81c5730933c0",
            "bytesRead": 1570663,
            "complete": true,
            "claim": "10-Q 2026-08-28 cover: S / Class A common stock, par value $0.0001 / The New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001583708-21-000012",
            "url": "https://www.sec.gov/Archives/edgar/data/1583708/000158370821000012/s-20210908.htm",
            "sha256": "3e9372fcc252714115ebdf0ddc2452b838f102af3d26e552145ffa85e1e49d88",
            "sha256Normalized": "66e7cf68da3a08c1c2bb2b4000f4ed670c72e48730aa59300f959c618f5c274b",
            "bytesRead": 51239,
            "complete": true,
            "claim": "S / Class A common stock, par value $0.0001 / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-116654",
            "url": "https://www.sec.gov/Archives/edgar/data/1583708/000110465926116654/tm2627397d1_8k.htm",
            "sha256": "67182e703e28c163b866f30aee07d1cb1bf0e85e434dd87b8fb5e3bcf2be3c92",
            "sha256Normalized": "505c5fb9ecf6b47640c71de7875ca47d45320527be54f19c1088fbfe3bc5c729",
            "bytesRead": 62422,
            "complete": true,
            "claim": "8-K 2026-10-16: closing price $24.01 on 2026-10-13"
          }
        ],
        "priceEvidence": [
          {
            "date": "2026-10-13",
            "rawPrice": 24.01,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-10-13",
              24.01
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-116654",
            "sha256": "67182e703e28c163b866f30aee07d1cb1bf0e85e434dd87b8fb5e3bcf2be3c92",
            "quote": "share of the common stock repurchased in the Share Repurchases was equal to the closing price per share of the common stock on the New York Stock Exchange on October 13, 2026, which was $24.01 per share. The Shar"
          }
        ]
      },
      {
        "securityId": "ref_SAFE",
        "ticker": "SAFE",
        "cik": "0001095651",
        "issuer": "Safehold Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:SAFE:2017-06-22",
        "masterRowSet": [
          "tiingo:NYSE:SAFE:1989-11-16",
          "tiingo:NYSE:SAFE:2017-06-22"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-04-06",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-04-06",
          "checkedTo": "2026-10-23",
          "bars": 186,
          "pointsSha256": "60b3646ae66e667425c9789df45b469c0bc0a8fbc10859ff94d1174eff188463"
        },
        "lastConfirmedCover": {
          "accession": "0001095651-26-000025",
          "filingDate": "2026-07-31",
          "sha256": "e867344ecac2662fc67083f520738c63bad3c66ccb6c45fa41321092bf35c8d4"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2023-12-31",
          "lastMatch": "2026-03-24",
          "maxGapDays": 731
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001095651-26-000025",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000109565126000025/safe-20260630x10q.htm",
            "sha256": "e867344ecac2662fc67083f520738c63bad3c66ccb6c45fa41321092bf35c8d4",
            "sha256Normalized": "e867344ecac2662fc67083f520738c63bad3c66ccb6c45fa41321092bf35c8d4",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "10-Q 2026-07-31 cover: SAFE / Common Stock / NYSE"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001104659-23-041210",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000110465923041210/tm2310731d1_8k.htm",
            "sha256": "0aa36f063c4d4a9692eb31faba97a8df45659a1619ec424b6236f9282d2fc0b2",
            "sha256Normalized": "7aea031197d2b0ef2760f32fe0e8085b83dbc28fe745486ac02ca568fd34fe5f",
            "bytesRead": 235547,
            "complete": true,
            "claim": "SAFE / Common stock, $0.01 par value / NYSE"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001558370-24-004743",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000155837024004743/safe-20240515xdef14a.htm",
            "sha256": "2364bf4addd8ef3c5f8b28b043ab48eb0b82f9ac625fe63faf830e1ca48147a7",
            "sha256Normalized": "109ee6c9ad90813bf7a597233681ef2b912d74727eb4de24c57e9b8a715f2116",
            "bytesRead": 1770717,
            "complete": true,
            "claim": "DEF 14A 2024-04-05: closing price $23.4 on 2023-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-037873",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000110465926037873/safe-20260514xdef14a.htm",
            "sha256": "8393cb6abfd32b7a6de7a7ff32f1c563cf34dcbbd3a7897033522e56d7f21899",
            "sha256Normalized": "30aa8cfa83039069500583eac55a5c1c7dae0ae7ca8406174ddbb49e51b7d9c2",
            "bytesRead": 1742440,
            "complete": true,
            "claim": "DEF 14A 2026-03-31: closing price $13.69 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-034555",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000110465926034555/tm269505-4_424b7.htm",
            "sha256": "a1177bff6792dd74f79697fd37f4f85e2674a5a1b0f05329651d5418309fda67",
            "sha256Normalized": "3f487758adad88e1b69dbd3f6805477068af0cdc731709c281ed11deb84db95b",
            "bytesRead": 724165,
            "complete": true,
            "claim": "424B7 2026-03-25: closing price $13.93 on 2026-03-24"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-034546",
            "url": "https://www.sec.gov/Archives/edgar/data/1095651/000110465926034546/tm269505-3_424b7.htm",
            "sha256": "b129430da8d3a419fd388a248e1260f62a5279504d46e468ba136c349d09982c",
            "sha256Normalized": "9c8910a22d21f3cf0e82ac53062ec50d810bc65865b4ba416a8f0405315a2b7e",
            "bytesRead": 730931,
            "complete": true,
            "claim": "424B7 2026-03-25: closing price $13.93 on 2026-03-24"
          }
        ],
        "priceEvidence": [
          {
            "date": "2023-12-31",
            "rawPrice": 23.4,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              23.4
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001558370-24-004743",
            "sha256": "2364bf4addd8ef3c5f8b28b043ab48eb0b82f9ac625fe63faf830e1ca48147a7",
            "quote": " December 31, 2023 that would be subject to accelerated vesting, based upon the closing price of Safehold’s common stock on December 31, 2023 of $23.40 and unvested Caret "
          },
          {
            "date": "2025-12-31",
            "rawPrice": 13.69,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              13.69
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-037873",
            "sha256": "8393cb6abfd32b7a6de7a7ff32f1c563cf34dcbbd3a7897033522e56d7f21899",
            "quote": " December 31, 2025 that would be subject to accelerated vesting, based upon the closing price of Safehold’s common stock on December 31, 2025 of $13.69. In the event of a "
          },
          {
            "date": "2026-03-24",
            "rawPrice": 13.93,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-03-24",
              13.93
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-034555",
            "sha256": "a1177bff6792dd74f79697fd37f4f85e2674a5a1b0f05329651d5418309fda67",
            "quote": "k is listed on the New York Stock Exchange under the trading symbol “SAFE.” The last reported sale price of our common stock on the New York Stock Exchange on March 24, 2026 was $13.93 per share. We have "
          },
          {
            "date": "2026-03-24",
            "rawPrice": 13.93,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-03-24",
              13.93
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-034546",
            "sha256": "b129430da8d3a419fd388a248e1260f62a5279504d46e468ba136c349d09982c",
            "quote": "k is listed on the New York Stock Exchange under the trading symbol “SAFE.” The last reported sale price of our common stock on the New York Stock Exchange on March 24, 2026 was $13.93 per share. We have "
          }
        ]
      },
      {
        "securityId": "ref_SDRL",
        "ticker": "SDRL",
        "cik": "0001737706",
        "issuer": "SEADRILL Ltd",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:SDRL:2022-10-14",
        "masterRowSet": [
          "tiingo:NYSE:SDRL:2005-12-28",
          "tiingo:NYSE:SDRL:2022-10-14"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "3439c8aec7d3d56a534694747b6ad18c04a966f120b0fc04c6a95253b6dec95b"
        },
        "lastConfirmedCover": {
          "accession": "0001737706-26-000026",
          "filingDate": "2026-08-10",
          "sha256": "80fae58964b97737aba97349ede497ceb256a7e48f97e87e521b59d012818916"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 222
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001737706-26-000026",
            "url": "https://www.sec.gov/Archives/edgar/data/1737706/000173770626000026/sdrl-20260630.htm",
            "sha256": "80fae58964b97737aba97349ede497ceb256a7e48f97e87e521b59d012818916",
            "sha256Normalized": "ec6e41ff81da1232d3fc1f78595710bcc17b5de86b85d7136e37e18be9408624",
            "bytesRead": 1033499,
            "complete": true,
            "claim": "10-Q 2026-08-10 cover: SDRL / Common Shares, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001628280-23-011980",
            "url": "https://www.sec.gov/Archives/edgar/data/1737706/000162828023011980/sdrl-20221231.htm",
            "sha256": "1d04816b2b3b4d0d83cc7ea89cc53aadd8f6d56abf322e590bdbdac56d02e04e",
            "sha256Normalized": "21314c62b9cde3547a7685072ba09b8c2d77967d10913e3745661dc01c64c13d",
            "bytesRead": 6213178,
            "complete": true,
            "claim": "SDRL / Common Shares, par value $0.01 per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-015486",
            "url": "https://www.sec.gov/Archives/edgar/data/1737706/000114036126015486/ny20062826x1_def14a.htm",
            "sha256": "daba1cc6142b898edf4e39049a1595fc397698c25003e4e1277bf6c5d2e610d5",
            "sha256Normalized": "d465894e12d544de0ce7f10582114fec84197b4eb847d4a5ac38bbb7d5f28f5a",
            "bytesRead": 1618632,
            "complete": true,
            "claim": "DEF 14A 2026-04-20: closing price $34.6 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 34.6,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              34.6
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-015486",
            "sha256": "daba1cc6142b898edf4e39049a1595fc397698c25003e4e1277bf6c5d2e610d5",
            "quote": "s at Fiscal Year-End Market values reported in the table below are based on the closing price per share of our common shares on December 31, 2025, which was $34.60. Stock Awards Name "
          }
        ]
      },
      {
        "securityId": "ref_SEVN",
        "ticker": "SEVN",
        "cik": "0001452477",
        "issuer": "Seven Hills Realty Trust",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:SEVN:2020-07-30",
        "masterRowSet": [
          "tiingo:NASDAQ:SEVN:2020-07-30",
          "tiingo:NASDAQ:SEVN:2021-12-23"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares of Beneficial Interest",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-11-03",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-11-03",
          "checkedTo": "2026-10-23",
          "bars": 156,
          "pointsSha256": "31d6826edea7762eff505b2cb784a78a56a683094273ecfca7e31ed93917b9dc"
        },
        "lastConfirmedCover": {
          "accession": "0001452477-26-000050",
          "filingDate": "2026-10-28",
          "sha256": "55193943bb68b7e924d737d995e26f14a96be0895898b65a1612e59cbd054d03"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-10-29",
          "lastMatch": "2025-10-29",
          "maxGapDays": 364
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001452477-26-000050",
            "url": "https://www.sec.gov/Archives/edgar/data/1452477/000145247726000050/sevn-20260930.htm",
            "sha256": "55193943bb68b7e924d737d995e26f14a96be0895898b65a1612e59cbd054d03",
            "sha256Normalized": "2f2fb41ef8433c3a884ebea4aabc2cfb8ea0dcfa360dd9d8ae5d3d51b5a76919",
            "bytesRead": 1372883,
            "complete": true,
            "claim": "10-Q 2026-10-28 cover: SEVN / Common Shares of Beneficial Interest / The Nasdaq Stock Market LLC"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001452477-21-000057",
            "url": "https://www.sec.gov/Archives/edgar/data/1452477/000145247721000057/rmrm-20211102.htm",
            "sha256": "ae3870291dba97009bf12dc85c01288a08e86e706ca79620f3809261e36e1e68",
            "sha256Normalized": "1caac8100efdfbaf2942edefbb5a1c468da864a5d5e3ec1a1f299637623ebc66",
            "bytesRead": 35789,
            "complete": true,
            "claim": "SEVN / Common Shares of Beneficial Interest / The Nasdaq Stock Market LLC"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-25-104056",
            "url": "https://www.sec.gov/Archives/edgar/data/1452477/000110465925104056/tm2529703-1_424b5.htm",
            "sha256": "5fd413a1edde719d6ad3e3c2ece329e336662da77830b5f6a0ec1996ee65d29c",
            "sha256Normalized": "2319d224b5a55bb4b5c190b9833f66a0fe109f3e5ab045bc41d07f5f96d573b3",
            "bytesRead": 735348,
            "complete": true,
            "claim": "424B5 2025-10-30: closing price $9.59 on 2025-10-29"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-10-29",
            "rawPrice": 9.59,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-10-29",
              9.59
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-25-104056",
            "sha256": "5fd413a1edde719d6ad3e3c2ece329e336662da77830b5f6a0ec1996ee65d29c",
            "quote": " traded on The Nasdaq Stock Market LLC, or Nasdaq, under the symbol “SEVN.” The last reported closing price for our common shares on October 29, 2025 was $9.59 per share. The righ"
          }
        ]
      },
      {
        "securityId": "ref_SIRI",
        "ticker": "SIRI",
        "cik": "0000908937",
        "issuer": "SIRIUS XM HOLDINGS INC.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:SIRI:1994-09-13",
        "masterRowSet": [
          "tiingo:NASDAQ:SIRI:1994-09-13",
          "tiingo:NASDAQ:SIRI:2024-09-09"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common stock, $0.001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2019-01-04",
        "validTo": null,
        "intervalBasis": [
          "EARLIEST_FULLTEXT_TICKER_CONFIRMATION",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2019-01-04",
          "checkedTo": "2026-10-23",
          "bars": 408,
          "pointsSha256": "c6800899960679fe0db73be0060515248bebc530dbd42d6ee2167a95deea0cb4"
        },
        "lastConfirmedCover": {
          "accession": "0000908937-26-000022",
          "filingDate": "2026-07-30",
          "sha256": "a0b178f46454435c32e881fea6c0b660854985b739d44c05f1fceca355202dee"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2020-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0000908937-26-000022",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000090893726000022/siri-20260630.htm",
            "sha256": "a0b178f46454435c32e881fea6c0b660854985b739d44c05f1fceca355202dee",
            "sha256Normalized": "89075f5d3b07c3e0c097e62a9d840ff87962343630cf13a09f6344f13b7d9fdb",
            "bytesRead": 2029191,
            "complete": true,
            "claim": "10-Q 2026-07-30 cover: SIRI / Common stock, $0.001 par value / The Nasdaq Stock Market LLC"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0000950117-03-001189",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000095011703001189/a34799.txt",
            "sha256": "c1218a6e7e821456d85a746688cbf741b92974115ce253e57b2788b422e2e77a",
            "sha256Normalized": "c1218a6e7e821456d85a746688cbf741b92974115ce253e57b2788b422e2e77a",
            "bytesRead": 333573,
            "complete": true,
            "claim": "RANT'S COMMON EQUITY AND RELATED STOCKHOLDER MATTERS Our common stock is traded on the Nasdaq National Market under the symbol 'SIRI'. The following table sets forth the high and low closing bid price for our common stock, as reported by Nasdaq, for the periods indicated below: H"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000930413-21-000793",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000093041321000793/c100888_def14a.htm",
            "sha256": "4676946bb8e01af52df912e4631e0f5007b2f6dcf1955226248a26424a3cc0b7",
            "sha256Normalized": "4676946bb8e01af52df912e4631e0f5007b2f6dcf1955226248a26424a3cc0b7",
            "bytesRead": 781417,
            "complete": true,
            "claim": "DEF 14A 2021-04-20: closing price $6.37 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000930413-22-000719",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000093041322000719/c103261_def14a.htm",
            "sha256": "f948b63623243d7431ac58b20e7028d7f731baea16dbe2c23e72abbe70160d1a",
            "sha256Normalized": "f948b63623243d7431ac58b20e7028d7f731baea16dbe2c23e72abbe70160d1a",
            "bytesRead": 853160,
            "complete": true,
            "claim": "DEF 14A 2022-04-18: closing price $6.35 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000930413-23-001281",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000093041323001281/c105679_def14a-ixbrl.htm",
            "sha256": "b2acdc36b8414505f4af2281bcf3ded2a6872af305086a01016d53a748174bd3",
            "sha256Normalized": "01b5da294ca84dfc72dd9aab7f451edece3e74b9edd96098a0fe7bcbbf55a35c",
            "bytesRead": 1085380,
            "complete": true,
            "claim": "DEF 14A 2023-04-21: closing price $5.84 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0000930413-24-001249",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000093041324001249/c108366_def14a-ixbrl.htm",
            "sha256": "a122decb906113b5c753c3de276410d8af17807abf52095c1391145dc02f278a",
            "sha256Normalized": "1418b0a0031398f080c94d87f884783fc83bed6e9a2431b9e87df334fc477e2f",
            "bytesRead": 963919,
            "complete": true,
            "claim": "DEF 14A 2024-04-08: closing price $5.47 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-041777",
            "url": "https://www.sec.gov/Archives/edgar/data/908937/000110465926041777/tm261591-1_def14a.htm",
            "sha256": "6888f00682593444e59b1bdbd9c4e5daf0bb7952418673e988402e0be3deae42",
            "sha256Normalized": "6888f00682593444e59b1bdbd9c4e5daf0bb7952418673e988402e0be3deae42",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-04-10: closing price $20 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 6.37,
            "laterSplitProduct": 0.1,
            "seriesBar": [
              "2020-12-31",
              63.7
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000930413-21-000793",
            "sha256": "4676946bb8e01af52df912e4631e0f5007b2f6dcf1955226248a26424a3cc0b7",
            "quote": "hares, Units or Other Rights That Have Not Vested” were calculated based on the closing price on NASDAQ of our common stock on December 31, 2020 of $6.37 (the last trading d"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 6.35,
            "laterSplitProduct": 0.1,
            "seriesBar": [
              "2021-12-31",
              63.5
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000930413-22-000719",
            "sha256": "f948b63623243d7431ac58b20e7028d7f731baea16dbe2c23e72abbe70160d1a",
            "quote": "hares, Units or Other Rights That Have Not Vested” were calculated based on the closing price on NASDAQ of our common stock on December 31, 2021 of $6.35. The RSUs and PRSUs"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 5.84,
            "laterSplitProduct": 0.1,
            "seriesBar": [
              "2022-12-30",
              58.4
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000930413-23-001281",
            "sha256": "b2acdc36b8414505f4af2281bcf3ded2a6872af305086a01016d53a748174bd3",
            "quote": "hares, Units or Other Rights That Have Not Vested” were calculated based on the closing price on NASDAQ of our common stock on December 30, 2022 of $5.84. The RSUs and PRSUs"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 5.47,
            "laterSplitProduct": 0.1,
            "seriesBar": [
              "2023-12-29",
              54.7
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0000930413-24-001249",
            "sha256": "a122decb906113b5c753c3de276410d8af17807abf52095c1391145dc02f278a",
            "quote": "hares, Units or Other Rights That Have Not Vested” were calculated based on the closing price on NASDAQ of our common stock on December 29, 2023, of $5.47. The RSUs and PRSUs"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 20,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              20
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-041777",
            "sha256": "6888f00682593444e59b1bdbd9c4e5daf0bb7952418673e988402e0be3deae42",
            "quote": "hares, Units or Other Rights That Have Not Vested” were calculated based on the closing price on NASDAQ of our common stock on December 31, 2025, of $20.00. The RSUs and PRSUs"
          }
        ]
      },
      {
        "securityId": "ref_SNOW",
        "ticker": "SNOW",
        "cik": "0001640147",
        "issuer": "Snowflake Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:SNOW:2020-09-16",
        "masterRowSet": [
          "tiingo:NYSE:SNOW:2014-01-31",
          "tiingo:NYSE:SNOW:2020-09-16"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, $0.0001 par value",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2023-02-03",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2023-02-03",
          "checkedTo": "2026-10-23",
          "bars": 195,
          "pointsSha256": "49b2dbab9b36b9d1b5d516931652fb5e0dbccb4b002ad52f8b791d8302a70121"
        },
        "lastConfirmedCover": {
          "accession": "0001640147-26-000037",
          "filingDate": "2026-09-04",
          "sha256": "5c0c96f022e38150d1ceae8a6f2da604b8576dade5d602fa6689817848d93be7"
        },
        "anchorGaps": {
          "matchDates": 2,
          "firstMatch": "2025-01-31",
          "lastMatch": "2026-01-30",
          "maxGapDays": 364
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001640147-26-000037",
            "url": "https://www.sec.gov/Archives/edgar/data/1640147/000164014726000037/snow-20260731.htm",
            "sha256": "5c0c96f022e38150d1ceae8a6f2da604b8576dade5d602fa6689817848d93be7",
            "sha256Normalized": "1e904f3127d78a792295e089e3f508265c050d5beeb25d4c0be9db0f82b350af",
            "bytesRead": 2538170,
            "complete": true,
            "claim": "10-Q 2026-09-04 cover: SNOW / Common Stock, $0.0001 par value / The New York Stock Exchange"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001628280-20-013010",
            "url": "https://www.sec.gov/Archives/edgar/data/1640147/000162828020013010/snowflakes-1.htm",
            "sha256": "29ed3731ea498d0272efa41a3e34dd21d27875bc161f41b4d8c20d7e51bc5210",
            "sha256Normalized": "29ed3731ea498d0272efa41a3e34dd21d27875bc161f41b4d8c20d7e51bc5210",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "be between $ and $ per share. We have applied to list our Class A common stock on the New York Stock Exchange under the symbol “SNOW.” We are an “emerging growth company” as defined under the federal securities laws, and as such, we have elected to comply with certain reduced rep"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001640147-25-000096",
            "url": "https://www.sec.gov/Archives/edgar/data/1640147/000164014725000096/snow-20250520.htm",
            "sha256": "3a5cce7feae375805cef26ddda3418d97a54d3e86b060c448b1a2491f28fb971",
            "sha256Normalized": "b75e637353f1bf48dea66a3f427f085c14bf69408ffe2e841a4bfad56fbc8e92",
            "bytesRead": 1506621,
            "complete": true,
            "claim": "DEF 14A 2025-05-21: closing price $181.51 on 2025-01-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001640147-26-000019",
            "url": "https://www.sec.gov/Archives/edgar/data/1640147/000164014726000019/snow-20260518.htm",
            "sha256": "33da0c71c48337607fa456843a3f7915c77eb7b4acc20c1b798c322b7049dd2d",
            "sha256Normalized": "c6447ab2f489227c44e62529a7e6fa4e522fc433ecaafc72360388b154a63145",
            "bytesRead": 1420547,
            "complete": true,
            "claim": "DEF 14A 2026-05-18: closing price $192.7 on 2026-01-30"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-01-31",
            "rawPrice": 181.51,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-01-31",
              181.51
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001640147-25-000096",
            "sha256": "3a5cce7feae375805cef26ddda3418d97a54d3e86b060c448b1a2491f28fb971",
            "quote": "rket value of shares or units of stock that have not yet vested is based on the closing price of our common stock on January 31, 2025, which was $181.51 per share. (3) The "
          },
          {
            "date": "2026-01-30",
            "rawPrice": 192.7,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-01-30",
              192.7
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001640147-26-000019",
            "sha256": "33da0c71c48337607fa456843a3f7915c77eb7b4acc20c1b798c322b7049dd2d",
            "quote": "rket value of shares or units of stock that have not yet vested is based on the closing price of our common stock on January 30, 2026, the last trading day of Fiscal Year 2026, which was $192.70 per share. Snowflak"
          }
        ]
      },
      {
        "securityId": "ref_STEX",
        "ticker": "STEX",
        "cik": "0001530766",
        "issuer": "Streamex Corp.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:STEX:2014-10-30",
        "masterRowSet": [
          "tiingo:NASDAQ:STEX:2014-10-30",
          "tiingo:NASDAQ:STEX:2026-05-28"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Stock, par value $0.001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2025-10-31",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2025-10-31",
          "checkedTo": "2026-10-23",
          "bars": 52,
          "pointsSha256": "d508fd43d51e83bdcd7d9ecead99ff015e7a5c738a357031541463b1b643b974"
        },
        "lastConfirmedCover": {
          "accession": "0001493152-26-038293",
          "filingDate": "2026-08-14",
          "sha256": "dc3d71bed3ae9dc9e7bd911d31efe898d7167c50991cbfc1f5bfb15f7918f938"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 226
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001493152-26-038293",
            "url": "https://www.sec.gov/Archives/edgar/data/1530766/000149315226038293/form10-q.htm",
            "sha256": "dc3d71bed3ae9dc9e7bd911d31efe898d7167c50991cbfc1f5bfb15f7918f938",
            "sha256Normalized": "e35b39fe5a85bd38725fbc8d6d2cb4fcd1004fc3498654dbe1aa5f1b595a3f82",
            "bytesRead": 2030742,
            "complete": true,
            "claim": "10-Q 2026-08-14 cover: STEX / Common Stock, par value $0.001 per share / NASDAQ"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001493152-25-019993",
            "url": "https://www.sec.gov/Archives/edgar/data/1530766/000149315225019993/form8-k.htm",
            "sha256": "64dc798ad4374b932cd25fa8b71c1e990e4eec9461779e9b9fa149d8b394a414",
            "sha256Normalized": "d2e25a8482b678a4aa8b85fa6ebbdb55c693126af9fcb7bd6effc6dc006bce63",
            "bytesRead": 53643,
            "complete": true,
            "claim": "STEX / Common Stock, par value $0.001 per share / Nasdaq"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001493152-26-014376",
            "url": "https://www.sec.gov/Archives/edgar/data/1530766/000149315226014376/form10-k.htm",
            "sha256": "2cec3ce4e5ab578d0d30859e302f62710f1e56231c26a598c5ab2f7f743ee3cb",
            "sha256Normalized": "b1f83bb7bd5331b98c7fe846748405b359a1d9f2c4e0874d54644a5321b1bc9f",
            "bytesRead": 2909840,
            "complete": true,
            "claim": "10-K 2026-03-31: closing price $3.03 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 3.03,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              3.03
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001493152-26-014376",
            "sha256": "2cec3ce4e5ab578d0d30859e302f62710f1e56231c26a598c5ab2f7f743ee3cb",
            "quote": "nderlying the stock awards not yet vested as of December 31, 2025, based on the closing price of our common stock on The Nasdaq Stock Market LLC of $3.03 on December 31, 2025. (2) On May 23, 202"
          }
        ]
      },
      {
        "securityId": "ref_TW",
        "ticker": "TW",
        "cik": "0001758730",
        "issuer": "Tradeweb Markets Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:TW:2019-04-04",
        "masterRowSet": [
          "tiingo:NASDAQ:TW:2016-01-04",
          "tiingo:NASDAQ:TW:2019-04-04"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A common stock, par value $0.00001",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2020-04-09",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "CONCATENATION_GUARD"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2020-04-09",
          "checkedTo": "2026-10-23",
          "bars": 342,
          "pointsSha256": "6a3a884fdbbabad3ab48080c1eb658b0acdd0a193fbb1febe064c8117e00e68d"
        },
        "lastConfirmedCover": {
          "accession": "0001758730-26-000133",
          "filingDate": "2026-07-30",
          "sha256": "5a20bd9ef9da763ea4b3eaaf15f73faa532455cbd54212f2e0ad642cd18bee2d"
        },
        "anchorGaps": {
          "matchDates": 5,
          "firstMatch": "2020-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 1096
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001758730-26-000133",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000175873026000133/tw-20260630.htm",
            "sha256": "5a20bd9ef9da763ea4b3eaaf15f73faa532455cbd54212f2e0ad642cd18bee2d",
            "sha256Normalized": "6bd592ea7a59b452d3e1cccd7fa5e75d0b25062fa1c5bbe39264e3a92f7d9092",
            "bytesRead": 2652453,
            "complete": true,
            "claim": "10-Q 2026-07-30 cover: TW / Class A common stock, par value $0.00001 / Nasdaq Global Select Market"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001144204-19-012677",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000114420419012677/tv513417-s1.htm",
            "sha256": "a81c25e64169ba790503ff627f3e8228f8879cd6ef0db555c10d3aa44098a7bb",
            "sha256Normalized": "a81c25e64169ba790503ff627f3e8228f8879cd6ef0db555c10d3aa44098a7bb",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "mmon stock. We intend to apply to list our Class A common stock on the Nasdaq Global Select Market (“Nasdaq”) under the symbol “TW.” The underwriters have an option for a period of 30 days from the date of this prospectus to purchase up to a maximum of additional shares of Class "
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-21-098639",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000119312521098639/d107276ddef14a.htm",
            "sha256": "d2e27c94881f86f97bf404d82d96d8d6220906690ee8e8bc392a8075c8bb6b29",
            "sha256Normalized": "d2e27c94881f86f97bf404d82d96d8d6220906690ee8e8bc392a8075c8bb6b29",
            "bytesRead": 816386,
            "complete": true,
            "claim": "DEF 14A 2021-03-30: closing price $62.45 on 2020-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-087071",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000119312522087071/d289995ddef14a.htm",
            "sha256": "8173671b354c660b93272667312087df6cc73d04837ce30aceb34a0d2f7c8731",
            "sha256Normalized": "8173671b354c660b93272667312087df6cc73d04837ce30aceb34a0d2f7c8731",
            "bytesRead": 945338,
            "complete": true,
            "claim": "DEF 14A 2022-03-29: closing price $100.14 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-077849",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000119312523077849/d421214ddef14a.htm",
            "sha256": "2081d7b0d40c667d5f177d2c886f3ec7103eaaffe0db1e6468055c1e9c5946fc",
            "sha256Normalized": "2f33fe0de026571ce64dcea9731027824e62306b713fb1c34c43a47a44d63c30",
            "bytesRead": 1508412,
            "complete": true,
            "claim": "DEF 14A 2023-03-23: closing price $64.93 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001758730-26-000084",
            "url": "https://www.sec.gov/Archives/edgar/data/1758730/000175873026000084/tw-20260323.htm",
            "sha256": "1c7974ceea34f23a8c81d3263ec372d1cdbc3b48de9862de741bc55e0b09c505",
            "sha256Normalized": "1c7974ceea34f23a8c81d3263ec372d1cdbc3b48de9862de741bc55e0b09c505",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "DEF 14A 2026-03-26: closing price $107.54 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2020-12-31",
            "rawPrice": 62.45,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2020-12-31",
              62.45
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-21-098639",
            "sha256": "d2e27c94881f86f97bf404d82d96d8d6220906690ee8e8bc392a8075c8bb6b29",
            "quote": "on Program in Detail — Long-Term Equity Incentives.” (2) Based on the per-share closing market price of the Company’s common stock on December 31, 2020, which was $62.45. (3) Includes 138,1"
          },
          {
            "date": "2021-12-31",
            "rawPrice": 100.14,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              100.14
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-087071",
            "sha256": "8173671b354c660b93272667312087df6cc73d04837ce30aceb34a0d2f7c8731",
            "quote": "on Program in Detail — Long-Term Equity Incentives.” (2) Based on the per-share closing market price of the Company’s common stock on December 31, 2021, which was $100.14. (3) Includes 138,1"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 64.93,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              64.93
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-077849",
            "sha256": "2081d7b0d40c667d5f177d2c886f3ec7103eaaffe0db1e6468055c1e9c5946fc",
            "quote": ", will continue to be settled on their scheduled settlement dates. Based on the closing price of the Class A common stock on December 30, 2022 of $64.93, Mr. Olesky’s retai"
          },
          {
            "date": "2022-12-31",
            "rawPrice": 64.93,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              64.93
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-077849",
            "sha256": "2081d7b0d40c667d5f177d2c886f3ec7103eaaffe0db1e6468055c1e9c5946fc",
            "quote": "1,400,800 (19) 2022 — — — 22,032 (21) 1,430,538 (19) (1) Based on the per-share closing market price of the Company’s common stock on December 31, 2022, which was $64.93. (2) Includes 138,1"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 107.54,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              107.54
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001758730-26-000084",
            "sha256": "1c7974ceea34f23a8c81d3263ec372d1cdbc3b48de9862de741bc55e0b09c505",
            "quote": "— 6,728 (30) 723,529 (28) 23,671 (32) 2,545,579 (33) (1) Based on the per-share closing market price of the Class A common stock on December 31, 2025 , which was $107.54 . (2) Represents 78"
          }
        ]
      },
      {
        "securityId": "ref_UK",
        "ticker": "UK",
        "cik": "0001821424",
        "issuer": "Ucommune International Ltd",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:UK:2020-11-18",
        "masterRowSet": [
          "tiingo:NASDAQ:UK:2016-01-25",
          "tiingo:NASDAQ:UK:2020-11-18"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A ordinary shares, US$0.024 par value per share",
        "filerType": "FOREIGN_PRIVATE_ISSUER",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2024-01-05",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2024-01-05",
          "checkedTo": "2026-10-23",
          "bars": 147,
          "pointsSha256": "ffb491ff015699ff33e01ddc7e3b731f2854daf516bc502cc0a1d5548af35827"
        },
        "lastConfirmedCover": {
          "accession": "0001213900-26-033208",
          "filingDate": "2026-03-24",
          "sha256": "e0de99e99c57e1a38165b80366c824b338076018c290916486410098181e15ac"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2025-12-31",
          "lastMatch": "2025-12-31",
          "maxGapDays": 83
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001213900-26-033208",
            "url": "https://www.sec.gov/Archives/edgar/data/1821424/000121390026033208/ea0282756-20f_ucommune.htm",
            "sha256": "e0de99e99c57e1a38165b80366c824b338076018c290916486410098181e15ac",
            "sha256Normalized": "e0de99e99c57e1a38165b80366c824b338076018c290916486410098181e15ac",
            "bytesRead": 3145728,
            "complete": false,
            "claim": "20-F 2026-03-24 cover: UK / Class A ordinary shares, US$0.024 par value per share / Nasdaq"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001213900-21-027007",
            "url": "https://www.sec.gov/Archives/edgar/data/1821424/000121390021027007/f20f2020_ucommune.htm",
            "sha256": "d04595adb6f8b6fa6015f0b1f8ebd7896dac29fccded432024d8188ca15707c3",
            "sha256Normalized": "064bf703242696e7e3234633f7596d0a1643db9db030cb2d4d058a7228a7d777",
            "bytesRead": 3109430,
            "complete": true,
            "claim": "UK / Class A ordinary shares, $0.0001 par value per share / Nasdaq"
          }
        ],
        "priceEvidence": [
          {
            "date": "2025-12-31",
            "rawPrice": 0.63,
            "laterSplitProduct": 0.1,
            "seriesBar": [
              "2025-12-31",
              6.3
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-26-033208",
            "sha256": "e0de99e99c57e1a38165b80366c824b338076018c290916486410098181e15ac",
            "quote": "d as the difference between the exercise price of the underlying awards and the closing stock price of US$ 0.63 of the Company’s ordinary share on December 31, 2025. The fair values of"
          }
        ]
      },
      {
        "securityId": "ref_UWMC",
        "ticker": "UWMC",
        "cik": "0001783398",
        "issuer": "UWM Holdings Corp",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NYSE:UWMC:2021-03-04",
        "masterRowSet": [
          "tiingo:NYSE:UWMC:2020-03-24",
          "tiingo:NYSE:UWMC:2021-03-04"
        ],
        "mic": "XNYS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Class A Common Stock, par value $0.0001 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2021-03-05",
        "validTo": null,
        "intervalBasis": [
          "SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2021-03-05",
          "checkedTo": "2026-10-23",
          "bars": 295,
          "pointsSha256": "922e0475909b1d026e27051ffd500cc9e29261e71622bd20df3d439e5a075359"
        },
        "lastConfirmedCover": {
          "accession": "0001783398-26-000117",
          "filingDate": "2026-08-07",
          "sha256": "a12d1c6cee0d3a499a0784323b12a40316a639d5b428b33fb27e964d37c3a3d2"
        },
        "anchorGaps": {
          "matchDates": 7,
          "firstMatch": "2021-12-31",
          "lastMatch": "2026-09-25",
          "maxGapDays": 714
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001783398-26-000117",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000178339826000117/uwmc-20260630.htm",
            "sha256": "a12d1c6cee0d3a499a0784323b12a40316a639d5b428b33fb27e964d37c3a3d2",
            "sha256Normalized": "0a44285746b27831928cf7603ead6438a8807b45f774ffadb8231908528e8252",
            "bytesRead": 1765019,
            "complete": true,
            "claim": "10-Q 2026-08-07 cover: UWMC / Class A Common Stock, par value $0.0001 per share / New York Stock Exchange"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001193125-21-014912",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000119312521014912/d110523d8k.htm",
            "sha256": "469bb59614b0cad09202946c6fa40678da348c30ed97b56cace68a1cd7140127",
            "sha256Normalized": "63869cf7fcf703da1631edf84799c7ea6b5bfe9564800db07547cddc49aab53b",
            "bytesRead": 264000,
            "complete": true,
            "claim": "UWMC / Class A Common Stock, par value $0.0001 per share / New York Stock Exchange"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-22-133796",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000119312522133796/d192190ddef14a.htm",
            "sha256": "7eabff067a3f95cd69a9358e7c82f5198640a6c4770d411427c2974c7f47160b",
            "sha256Normalized": "7eabff067a3f95cd69a9358e7c82f5198640a6c4770d411427c2974c7f47160b",
            "bytesRead": 609320,
            "complete": true,
            "claim": "DEF 14A 2022-04-29: closing price $5.92 on 2021-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-23-124517",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000119312523124517/d451093ddef14a.htm",
            "sha256": "a265ea7e0fb8fbfc669c45a3d741eabd6e189bb82011b4cc506c74ba3e9d8fef",
            "sha256Normalized": "ecbcc755c98d02e632aadc8bb226536ff9f09e563fa0bfe1803b9304a8009a90",
            "bytesRead": 841842,
            "complete": true,
            "claim": "DEF 14A 2023-04-28: closing price $3.31 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-24-111505",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000119312524111505/d511261ddef14a.htm",
            "sha256": "b40483d6b615034c55fde68b43a0163267f62ca6d6b731c4f79cd8a13703c8b9",
            "sha256Normalized": "94ab93b588f603d7bae34ed92665fea6389c73e2c586cd37ce799e7674586d51",
            "bytesRead": 895391,
            "complete": true,
            "claim": "DEF 14A 2024-04-25: closing price $7.15 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-004996",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000114036126004996/ny20063927x2_424b3.htm",
            "sha256": "1ce941db1b311647495ad2dd916809272eec5a7d6eb5a254adb0acce6494a253",
            "sha256Normalized": "1ce941db1b311647495ad2dd916809272eec5a7d6eb5a254adb0acce6494a253",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2026-02-12: closing price $5.38 on 2025-12-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001140361-26-003047",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000114036126003047/ny20063927x1_s4.htm",
            "sha256": "a7cb1c6da3a25ebffc62fc92cb21ac2c0279c48b95a50d5292729285cef4dcef",
            "sha256Normalized": "a7cb1c6da3a25ebffc62fc92cb21ac2c0279c48b95a50d5292729285cef4dcef",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "S-4 2026-01-30: closing price $5.38 on 2025-12-12"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001193125-26-176695",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000119312526176695/d926795ddef14a.htm",
            "sha256": "c70116b869afbacdd6a0aa376db2b88389ee0b81a472cbf7f6a98cf0be2b3e50",
            "sha256Normalized": "c646bed7f92eed300f1524cc77b4face57221bfe7eb3843fab577235be0039dd",
            "bytesRead": 988479,
            "complete": true,
            "claim": "DEF 14A 2026-04-24: closing price $4.38 on 2025-12-31"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001783398-26-000013",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000178339826000013/uwmc-20251231.htm",
            "sha256": "411c92bbb4c44504e0a0450eb22b8806bf7f70b53724dcc9ed5db95eb2b2c921",
            "sha256Normalized": "2b115662880121d5df4cf57c50766fc622e7a478416313817334377b978a8d6d",
            "bytesRead": 2398910,
            "complete": true,
            "claim": "10-K 2026-02-25: closing price $4.53 on 2026-02-23"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001628280-26-063816",
            "url": "https://www.sec.gov/Archives/edgar/data/1783398/000162828026063816/uwmc-rights424b5.htm",
            "sha256": "8e9cd6a6fe9cf7cbf71c9a493298a39f6a3b5935f5ca488e6be6300dfa91c9ce",
            "sha256Normalized": "1d5e045dab37aa8e33bf028f82a53c868dd8fb88f973fa22939489823fbbaf70",
            "bytesRead": 618055,
            "complete": true,
            "claim": "424B5 2026-09-29: closing price $1.22 on 2026-09-25"
          }
        ],
        "priceEvidence": [
          {
            "date": "2021-12-31",
            "rawPrice": 5.92,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2021-12-31",
              5.92
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-22-133796",
            "sha256": "7eabff067a3f95cd69a9358e7c82f5198640a6c4770d411427c2974c7f47160b",
            "quote": "ket value of the Time RSUs or Performance RSUs is calculated by multiplying the closing price of UWMC’s Class A common stock on December 31, 2021 ($5.92) by the number of u"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 3.31,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              3.31
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-23-124517",
            "sha256": "a265ea7e0fb8fbfc669c45a3d741eabd6e189bb82011b4cc506c74ba3e9d8fef",
            "quote": "ruary 1 2024. (2) The market value of the RSUs is calculated by multiplying the closing price of UWMC’s Class A common stock on December 30, 2022 ($3.31) by the number of u"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 7.15,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              7.15
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-24-111505",
            "sha256": "b40483d6b615034c55fde68b43a0163267f62ca6d6b731c4f79cd8a13703c8b9",
            "quote": "uary 1, 2024. (5) The market value of the RSUs is calculated by multiplying the closing price of UWMC’s Class A common stock on December 29, 2023 ($7.15) by the number of u"
          },
          {
            "date": "2025-12-12",
            "rawPrice": 5.38,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-12",
              5.38
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-004996",
            "sha256": "1ce941db1b311647495ad2dd916809272eec5a7d6eb5a254adb0acce6494a253",
            "quote": "C Class A Common Stock closing price on the date prior to signing. Based on the closing price of the UWMC Class A Common Stock on December 12, 2025 of $5.38 per share, the exch"
          },
          {
            "date": "2025-12-12",
            "rawPrice": 5.38,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-12",
              5.38
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001140361-26-003047",
            "sha256": "a7cb1c6da3a25ebffc62fc92cb21ac2c0279c48b95a50d5292729285cef4dcef",
            "quote": "C Class A Common Stock closing price on the date prior to signing. Based on the closing price of the UWMC Class A Common Stock on December 12, 2025 of $5.38 per share, the exch"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 4.38,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              4.38
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001193125-26-176695",
            "sha256": "c70116b869afbacdd6a0aa376db2b88389ee0b81a472cbf7f6a98cf0be2b3e50",
            "quote": "May 19, 2026. (7) The market value of the RSUs is calculated by multiplying the closing price of UWMC’s Class A common stock on December 31, 2025 ($4.38) by the number of u"
          },
          {
            "date": "2026-02-23",
            "rawPrice": 4.53,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-02-23",
              4.53
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001783398-26-000013",
            "sha256": "411c92bbb4c44504e0a0450eb22b8806bf7f70b53724dcc9ed5db95eb2b2c921",
            "quote": "ass A common stock is currently listed on the NYSE under the symbol \"UWMC.\" The closing price of the Class A common stock as of February 23, 2026 was $4.53. Holders As of Febr"
          },
          {
            "date": "2026-09-25",
            "rawPrice": 1.22,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2026-09-25",
              1.22
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001628280-26-063816",
            "sha256": "8e9cd6a6fe9cf7cbf71c9a493298a39f6a3b5935f5ca488e6be6300dfa91c9ce",
            "quote": "Our Class A common stock is traded on the NYSE under the symbol “UWMC,” and the closing price of our Class A common stock on the NYSE on September 25, 2026, was $1.22 per share. Moreover"
          }
        ]
      },
      {
        "securityId": "ref_VS",
        "ticker": "VS",
        "cik": "0001701963",
        "issuer": "Versus Systems Inc.",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:VS:2021-01-15",
        "masterRowSet": [
          "tiingo:NASDAQ:VS:2016-02-03",
          "tiingo:NASDAQ:VS:2021-01-15"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Common Shares, no par value per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-07-01",
        "validTo": null,
        "intervalBasis": [
          "FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START",
          "FIRST_ANCHOR_730D"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-07-01",
          "checkedTo": "2026-10-23",
          "bars": 226,
          "pointsSha256": "e1ab80e8c67ff05117dcfcb31c3afab9007c5dd2c429becb2fe6c2ba01d71d53"
        },
        "lastConfirmedCover": {
          "accession": "0001213900-26-089786",
          "filingDate": "2026-08-14",
          "sha256": "c7885d283149209dcc4c487d7f02f912ec4ea444ebf33d8b286f588dc889e9b3"
        },
        "anchorGaps": {
          "matchDates": 1,
          "firstMatch": "2024-06-28",
          "lastMatch": "2024-06-28",
          "maxGapDays": 777
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001213900-26-089786",
            "url": "https://www.sec.gov/Archives/edgar/data/1701963/000121390026089786/ea0299349-10q_versus.htm",
            "sha256": "c7885d283149209dcc4c487d7f02f912ec4ea444ebf33d8b286f588dc889e9b3",
            "sha256Normalized": "57caa614efa61bcfadd5c184d0c691d8e2cbf4aca44afcbb16728a50acd49623",
            "bytesRead": 595838,
            "complete": true,
            "claim": "10-Q 2026-08-14 cover: VS / Common Shares, no par value per share / Nasdaq"
          },
          {
            "role": "FULLTEXT_TICKER_STATEMENT",
            "accession": "0001213900-20-038480",
            "url": "https://www.sec.gov/Archives/edgar/data/1701963/000121390020038480/ea127633-f1_versussystems.htm",
            "sha256": "7c30f7ad675fd0e37bf3f846cfe073692fd4283d41a00451cf7268af48d9f5af",
            "sha256Normalized": "7c30f7ad675fd0e37bf3f846cfe073692fd4283d41a00451cf7268af48d9f5af",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "ol “VRSSF.” We have applied to have our common shares and Unit A Warrants listed on The Nasdaq Capital Market under the symbols “VS” and “VSSYW,” respectively. If we do not meet all of Nasdaq’s initial listing criteria and such listings are not approved, we will not complete this"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001213900-25-026006",
            "url": "https://www.sec.gov/Archives/edgar/data/1701963/000121390025026006/ea0234220-10k_versus.htm",
            "sha256": "d28223c09f091e454e56b10b2bb562c1e3418ea9ed1bd28dca2365abb4c07311",
            "sha256Normalized": "f5e0952c7942d8007e124049ef5311869a4c82839074689fbd3bd48646c7de34",
            "bytesRead": 1108164,
            "complete": true,
            "claim": "10-K 2025-03-31: closing price $1.29 on 2024-06-28"
          }
        ],
        "priceEvidence": [
          {
            "date": "2024-06-28",
            "rawPrice": 1.29,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2024-06-28",
              1.29
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001213900-25-026006",
            "sha256": "d28223c09f091e454e56b10b2bb562c1e3418ea9ed1bd28dca2365abb4c07311",
            "quote": "scal quarter ended June 30, 2024 was approximately $ 3.2 million based upon the closing price of the registrant’s common stock of $1.29 on the Nasdaq Capital Market as of June 28, 2024. There were 4,901,6"
          }
        ]
      },
      {
        "securityId": "ref_WEST",
        "ticker": "WEST",
        "cik": "0001806347",
        "issuer": "Westrock Coffee Co",
        "masterRowAction": "SELECT_EXISTING_ROW",
        "selectedCanonicalId": "tiingo:NASDAQ:WEST:2022-08-26",
        "masterRowSet": [
          "tiingo:NASDAQ:WEST:2010-03-30",
          "tiingo:NASDAQ:WEST:2022-08-26"
        ],
        "mic": "XNAS",
        "instrumentClass": "COMMON_STOCK",
        "coverClassTitle": "Shares of common stock, par value $0.01 per share",
        "filerType": "DOMESTIC",
        "currency": "USD",
        "activeStatus": "ACTIVE_SEC_CONFIRMED",
        "validFrom": "2022-09-02",
        "validTo": null,
        "intervalBasis": [
          "FIRST_IXBRL_COVER_WITH_TICKER"
        ],
        "evidenceLevel": "SEC_SAME_DAY_PRICE_AND_COVER",
        "protocolSha256": "b4632f505d89dd369c0ffc30d8b77fd889892b494948170c2bc6c057ea621d5c",
        "historyGuard": {
          "checkedFrom": "2022-09-02",
          "checkedTo": "2026-10-23",
          "bars": 217,
          "pointsSha256": "05be821629aaa59d9d29039876cf84a323546bd436c1f0240440fb3b4a0e6495"
        },
        "lastConfirmedCover": {
          "accession": "0001104659-26-092129",
          "filingDate": "2026-08-06",
          "sha256": "b53232fde85319c944c4f44e1d90181f6e452acc8e679b893c7285ad00a40ee5"
        },
        "anchorGaps": {
          "matchDates": 3,
          "firstMatch": "2022-12-30",
          "lastMatch": "2025-12-31",
          "maxGapDays": 733
        },
        "sources": [
          {
            "role": "IXBRL_COVER_LATEST",
            "accession": "0001104659-26-092129",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000110465926092129/west-20260630x10q.htm",
            "sha256": "b53232fde85319c944c4f44e1d90181f6e452acc8e679b893c7285ad00a40ee5",
            "sha256Normalized": "a1b3b816f4a99856170fb34e8acf6b0d4c2bc141f46113877dc26d959fc5359f",
            "bytesRead": 3137728,
            "complete": true,
            "claim": "10-Q 2026-08-06 cover: WEST / Shares of common stock, par value $0.01 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "IXBRL_COVER_FIRST",
            "accession": "0001558370-22-014048",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000155837022014048/west-20220630x10q.htm",
            "sha256": "92ead3c3adf4ff713016243161a5b663a1fc6b95e109c0e9930814e54e2e6d11",
            "sha256Normalized": "77d84c85cc0d02499c7348d485e7ce13b3f9d966c228a7be2f99047143fed22f",
            "bytesRead": 3010165,
            "complete": true,
            "claim": "WEST / Shares of common stock, par value $0.01 per share / The Nasdaq Stock Market LLC"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-23-067096",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000110465923067096/tm2312705-3_424b3.htm",
            "sha256": "f5984d27ec72e733803648d4ae0c50ebad89f7c47bb24bd71356831948c6016a",
            "sha256Normalized": "f5984d27ec72e733803648d4ae0c50ebad89f7c47bb24bd71356831948c6016a",
            "bytesRead": 2097152,
            "complete": false,
            "claim": "424B3 2023-06-01: closing price $13.36 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-23-050575",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000110465923050575/tm2232294-1_def14a.htm",
            "sha256": "3f2da29c261c9a8c78ec842d4f352e50091597f4609b02997622ec7ba5c8071a",
            "sha256Normalized": "badad314a337bbdb3ffd13a284bd8ed7dbf50be4b2703ece0578fd9b29821c00",
            "bytesRead": 807037,
            "complete": true,
            "claim": "DEF 14A 2023-04-27: closing price $13.36 on 2022-12-30"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-24-051660",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000110465924051660/tm242630-1_def14a.htm",
            "sha256": "62b04f378be5b024d6c143ba16036e80f070069e99b4670adc2f1ef73a0e7a90",
            "sha256Normalized": "4a70c70a300b28f79a47b63aafd7d71b6de10434a037259e9b7bd2ef2cee9dd6",
            "bytesRead": 780315,
            "complete": true,
            "claim": "DEF 14A 2024-04-25: closing price $10.21 on 2023-12-29"
          },
          {
            "role": "SAME_DAY_PRICE",
            "accession": "0001104659-26-047289",
            "url": "https://www.sec.gov/Archives/edgar/data/1806347/000110465926047289/tm261397-1_def14a.htm",
            "sha256": "51f814b4488b2a6cd1f852f71be45650daaa54038d4ce1e9644a2e67ae3991a2",
            "sha256Normalized": "9f133663ef62f4b55a4e964ad38b6edd6c109dd95a81740a4ccb5000e1b05143",
            "bytesRead": 798253,
            "complete": true,
            "claim": "DEF 14A 2026-04-23: closing price $4.07 on 2025-12-31"
          }
        ],
        "priceEvidence": [
          {
            "date": "2022-12-30",
            "rawPrice": 13.36,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              13.36
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-23-067096",
            "sha256": "f5984d27ec72e733803648d4ae0c50ebad89f7c47bb24bd71356831948c6016a",
            "quote": "e was determined by multiplying the number of unvested restricted shares by the closing price of our Common Shares as reported on Nasdaq on December 30, 2022 (the last trading day of the fiscal year 2022), which was $13.36. ​ Prior Equity Arr"
          },
          {
            "date": "2022-12-30",
            "rawPrice": 13.36,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2022-12-30",
              13.36
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-23-050575",
            "sha256": "3f2da29c261c9a8c78ec842d4f352e50091597f4609b02997622ec7ba5c8071a",
            "quote": "e was determined by multiplying the number of unvested restricted shares by the closing price of our common stock as reported on Nasdaq on December 30, 2022 (the last trading day of the year), which was $13.36. ​ Prior Equity Arr"
          },
          {
            "date": "2023-12-29",
            "rawPrice": 10.21,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2023-12-29",
              10.21
            ],
            "basis": "WEEKLY",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-24-051660",
            "sha256": "62b04f378be5b024d6c143ba16036e80f070069e99b4670adc2f1ef73a0e7a90",
            "quote": "e was determined by multiplying the number of unvested restricted shares by the closing price of our common stock as reported on Nasdaq on December 29, 2023 (the last trading day of the year), which was $10.21. ​ Employment Agree"
          },
          {
            "date": "2025-12-31",
            "rawPrice": 4.07,
            "laterSplitProduct": 1,
            "seriesBar": [
              "2025-12-31",
              4.07
            ],
            "basis": "DAILY_CROSSCHECKED",
            "ratioSeriesToSource": 1,
            "accession": "0001104659-26-047289",
            "sha256": "51f814b4488b2a6cd1f852f71be45650daaa54038d4ce1e9644a2e67ae3991a2",
            "quote": " determined by multiplying the number of unvested restricted stock units by the closing price of our common stock as reported on Nasdaq on December 31, 2025, which was $4.07. ​ (4) The April 1,"
          }
        ]
      }
    ]
  }
};
