'use strict';
// Versioned original-source identity bindings for offline weekly research. Data only; read by
// quant/engines/weekly-real-adapter.cjs exclusively when createLoader(root, { identityEvidence: true }) is requested.
// Regenerate with scripts/quant/v9-followups/identity/build-identity-registry.cjs; never hand-edit a record.
module.exports = {
  "schemaVersion": "research-identity-evidence-1.0.0",
  "scope": "Source-resolved listing bindings for OFFLINE weekly research only (weekly-real-adapter createLoader option identityEvidence, default off). Each binding replaces a misbound security-master row and restricts the series to the SEC-sourced interval; no history outside it is asserted. No security-master correction, no product or published-value change.",
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
  ]
};
