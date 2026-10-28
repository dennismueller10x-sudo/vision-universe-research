'use strict';
// Versioned SEC-sourced corporate-action evidence for offline weekly research. Data only; read by
// quant/engines/research-weekly-loader.cjs exclusively when createResearchLoader(root, { corporateActionEvidence: true }) is requested.
// Regenerate with scripts/quant/v10/corporate-actions/build-ca-registry.cjs; never hand-edit a record.
module.exports = {
  "schemaVersion": "research-ca-evidence-1.0.0",
  "scope": "Source-verified corporate-action resolutions for OFFLINE weekly research only (research-weekly-loader createResearchLoader option corporateActionEvidence, default off; the productive weekly-real-adapter never reads this file). Each record resolves exactly one UNRESOLVED split-sized weekly move, bound to the event's own points (week, prevWeek, closes, ratio within 1e-5). No series, master or published value is changed.",
  "ownerDecision": "2026-10-28: corrections only after independent source verification; no blanket activation of the 81 V9 dry-run cases.",
  "protocol": "docs/quant-recovery/v10/corporate-actions/protocol-1.1.2.json",
  "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
  "builder": "scripts/quant/v10/corporate-actions/build-ca-registry.cjs",
  "sourceHashConvention": "sha256 of the fetched SEC body (complete)",
  "records": [
    {
      "securityId": "ref_ACAD",
      "ticker": "ACAD",
      "cik": "0001070494",
      "issuer": "ACADIA PHARMACEUTICALS INC",
      "canonicalId": "tiingo:NASDAQ:ACAD:2004-05-27",
      "week": "2009-09-04",
      "prevWeek": "2009-08-28",
      "prevClose": 5.98,
      "close": 2.03,
      "weeklyRatio": 0.33946488294314375,
      "jumpDay": "2009-09-01",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "TEXT",
      "identity": {
        "before": {
          "accession": "0001193125-09-049516",
          "form": "10-K",
          "filingDate": "2009-03-10",
          "tradingSymbol": "ACAD",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001193125-10-051371",
          "form": "10-K",
          "filingDate": "2010-03-09",
          "tradingSymbol": "ACAD",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001193125-09-049516"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001193125-09-049516",
          "coverDate": "2009-03-02",
          "shares": 37179124,
          "via": "E2_TEXT_COVER"
        },
        "after": {
          "accession": "0001193125-10-051371",
          "coverDate": "2010-03-01",
          "shares": 38332119,
          "via": "E2_TEXT_COVER"
        },
        "ratio": 1.0310118925878942
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 2,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2009-03-10",
          "accession": "0001193125-09-049516",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509049516/d10k.htm",
          "sha256": "037941e248abf7c1b0cef635a48bcb20e04879b76c25d85937faaf6104976193",
          "via": "E2_TEXT_COVER",
          "quote": "shares 37179124 as of 2009-03-02 | on the closing price of the registrant’s common stock on the NASDAQ Global Market on June 30, 2008 of $3.69 per share. As of March 2, 2009, 37,179,124 shares of registrant’s common stock, $0.0001 par value, were outstanding. DOCUMENTS INCORPORATED BY REFERENCE Port"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2010-03-09",
          "accession": "0001193125-10-051371",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312510051371/d10k.htm",
          "sha256": "ea4a09d07159ec9db43ac791684721d1890957e209c416a5467f83a015209969",
          "via": "E2_TEXT_COVER",
          "quote": "shares 38332119 as of 2010-03-01 | on the closing price of the registrant’s common stock on the NASDAQ Global Market on June 30, 2009 of $2.19 per share. As of March 1, 2010, 38,332,119 shares of registrant’s common stock, $0.0001 par value, were outstanding. DOCUMENTS INCORPORATED BY REFERENCE Port"
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001193125-09-049516",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509049516/d10k.htm",
          "sha256": "037941e248abf7c1b0cef635a48bcb20e04879b76c25d85937faaf6104976193",
          "quote": "d Issuer Purchases of Equity Securities. (a) Our common stock is traded on the NASDAQ Global Market under the symbol “ACAD”. The following table sets forth the high and low sale prices for our common stock as reported on the NASDAQ G"
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001193125-10-051371",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312510051371/d10k.htm",
          "sha256": "ea4a09d07159ec9db43ac791684721d1890957e209c416a5467f83a015209969",
          "quote": "d Issuer Purchases of Equity Securities. (a) Our common stock is traded on the NASDAQ Global Market under the symbol “ACAD”. The following table sets forth the high and low sale prices for our common stock as reported on the NASDAQ G"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-10-051371",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312510051371/d10k.htm",
          "sha256": "ea4a09d07159ec9db43ac791684721d1890957e209c416a5467f83a015209969",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001193125-09-049516",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509049516/d10k.htm",
          "sha256": "037941e248abf7c1b0cef635a48bcb20e04879b76c25d85937faaf6104976193",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-09-156923",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509156923/0001193125-09-156923.txt",
          "sha256": "531a7962edf871bc0bf12565f32db4d89ade6ce9e2cdd4a44042c0862d8e81d9",
          "quote": "items 3.01,5.02"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-09-185421",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509185421/0001193125-09-185421.txt",
          "sha256": "ad6a502f16aa410d64a7745a879a0ad03aa58c7b289cb73a135934c814f49e39",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01"
          ],
          "filingDate": "2009-09-01",
          "reportDate": "2009-09-01",
          "accession": "0001193125-09-185421",
          "url": "https://www.sec.gov/Archives/edgar/data/1070494/000119312509185421/0001193125-09-185421.txt",
          "sha256": "ad6a502f16aa410d64a7745a879a0ad03aa58c7b289cb73a135934c814f49e39",
          "quote": "Item 8.01. Other Events. On September 1, 2009, ACADIA Pharmaceuticals Inc. issued a press release announcing top-line results from its first Phase III trial with pimavanserin (aka ACP-103) for the treatment of Parkinson’s disease psychosis. The study did not meet its primary endpoint of antipsychoti"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:03+00:00"
    },
    {
      "securityId": "ref_ACRS",
      "ticker": "ACRS",
      "cik": "0001557746",
      "issuer": "Aclaris Therapeutics, Inc.",
      "canonicalId": "tiingo:NASDAQ:ACRS:2015-10-07",
      "week": "2023-11-17",
      "prevWeek": "2023-11-10",
      "prevClose": 4.76,
      "close": 0.9543,
      "weeklyRatio": 0.20048319327731093,
      "jumpDay": "2023-11-13",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001558370-23-017660",
          "form": "10-Q",
          "filingDate": "2023-11-06",
          "tradingSymbol": "ACRS",
          "tagged": [
            "ACRS"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001558370-24-001753",
          "form": "10-K",
          "filingDate": "2024-02-27",
          "tradingSymbol": "ACRS",
          "tagged": [
            "ACRS"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001558370-23-017660",
          "coverDate": "2023-10-31",
          "shares": 70836194,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001558370-24-001753",
          "coverDate": "2024-01-31",
          "shares": 70925042,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.001254274050918
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 3,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2023-11-06",
          "accession": "0001558370-23-017660",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837023017660/acrs-20230930x10q_htm.xml",
          "sha256": "f1d1838b109f0f909b01ac324a1f413a2f1729278c9df6e9d852dfb46f542c57",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ACRS\"]; dei:EntityCommonStockSharesOutstanding 70836194 as of 2023-10-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2024-02-27",
          "accession": "0001558370-24-001753",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837024001753/acrs-20231231x10k_htm.xml",
          "sha256": "10a2f9e7026554f7f4fbca8b0774a9d5961d6593823e4609c551701c159f9fee",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ACRS\"]; dei:EntityCommonStockSharesOutstanding 70925042 as of 2024-01-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001558370-24-001753",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837024001753/acrs-20231231x10k.htm",
          "sha256": "0425d9fd3f422e3c9005515c803a3a40fd990517b75e0a1b83e40ce129afe3c5",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001558370-23-015840",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837023015840/0001558370-23-015840.txt",
          "sha256": "587d0a3a6a6a0da6ee8c301dca149506f92212c9c4de41eb488be28e5ff97b3f",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001558370-23-018691",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837023018691/0001558370-23-018691.txt",
          "sha256": "afb8cbdbe0ea022eac983e056a4601c086bf03a20af8e3ad82c655b068e0ffd5",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001558370-23-019911",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837023019911/0001558370-23-019911.txt",
          "sha256": "4dbc7e9802a916b45cc63a452a5e0571894b75c2bf431058a8c67bcdb20f0858",
          "quote": "items 2.05,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "7.01",
            "8.01",
            "9.01"
          ],
          "filingDate": "2023-11-13",
          "reportDate": "2023-11-13",
          "accession": "0001558370-23-018691",
          "url": "https://www.sec.gov/Archives/edgar/data/1557746/000155837023018691/0001558370-23-018691.txt",
          "sha256": "afb8cbdbe0ea022eac983e056a4601c086bf03a20af8e3ad82c655b068e0ffd5",
          "quote": "Item 7.01 Regulation FD Disclosure. ​ On November 13, 2023, Aclaris Therapeutics, Inc. (the “ Company ”) will hold a conference call to discuss top-line results for its Phase 2b clinical trial of zunsemetinib (ATI-450), an investigational oral MK2 inhibitor, in subjects with moderate to severe rheum"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:07+00:00"
    },
    {
      "securityId": "ref_ALEC",
      "ticker": "ALEC",
      "cik": "0001653087",
      "issuer": "Alector, Inc.",
      "canonicalId": "tiingo:NASDAQ:ALEC:2019-02-07",
      "week": "2025-10-24",
      "prevWeek": "2025-10-17",
      "prevClose": 3.04,
      "close": 1.5,
      "weeklyRatio": 0.4934210526315789,
      "jumpDay": "2025-10-22",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000950170-25-105050",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "tradingSymbol": "ALEC",
          "tagged": [
            "ALEC"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001193125-25-269592",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "tradingSymbol": "ALEC",
          "tagged": [
            "ALEC"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000950170-25-105050",
          "coverDate": "2025-08-01",
          "shares": 101212329,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001193125-25-269592",
          "coverDate": "2025-10-31",
          "shares": 109151472,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0784404733933155
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "accession": "0000950170-25-105050",
          "url": "https://www.sec.gov/Archives/edgar/data/1653087/000095017025105050/alec-20250630_htm.xml",
          "sha256": "aaa7c8c49f88b48d1845ff63db0e50ed0972f25e339ee210e41dbb8d32f1f791",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ALEC\"]; dei:EntityCommonStockSharesOutstanding 101212329 as of 2025-08-01; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "accession": "0001193125-25-269592",
          "url": "https://www.sec.gov/Archives/edgar/data/1653087/000119312525269592/alec-20250930_htm.xml",
          "sha256": "da24954e6215974898c1e54a7da07863924097ce56407d7b238c5abec762b518",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ALEC\"]; dei:EntityCommonStockSharesOutstanding 109151472 as of 2025-10-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-25-269592",
          "url": "https://www.sec.gov/Archives/edgar/data/1653087/000119312525269592/alec-20250930.htm",
          "sha256": "131183401ee16d1c7561971a7b55edcc16e9db3e903adfea0b43f7d0ee7fed4a",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-25-245102",
          "url": "https://www.sec.gov/Archives/edgar/data/1653087/000119312525245102/0001193125-25-245102.txt",
          "sha256": "f7693d1554c326857c1d853a205dd0d8c6cbabd13ddb6189a0314bb792d740f5",
          "quote": "items 2.02,2.05,5.02,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "2.05",
            "5.02",
            "7.01",
            "9.01"
          ],
          "filingDate": "2025-10-21",
          "reportDate": "2025-10-20",
          "accession": "0001193125-25-245102",
          "url": "https://www.sec.gov/Archives/edgar/data/1653087/000119312525245102/0001193125-25-245102.txt",
          "sha256": "f7693d1554c326857c1d853a205dd0d8c6cbabd13ddb6189a0314bb792d740f5",
          "quote": "Item 2.02 Results of Operations and Financial Condition. On October 21, 2025, the Company issued a press release announcing data results from the Company’s Phase 3 INFRONT-3 clinical trial that included its preliminary estimate of cash, cash equivalents, and short-term investments as of September 30"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:11+00:00"
    },
    {
      "securityId": "ref_ALNY",
      "ticker": "ALNY",
      "cik": "0001178670",
      "issuer": "ALNYLAM PHARMACEUTICALS, INC.",
      "canonicalId": "tiingo:NASDAQ:ALNY:2004-06-01",
      "week": "2016-10-07",
      "prevWeek": "2016-09-30",
      "prevClose": 67.78,
      "close": 34.27,
      "weeklyRatio": 0.5056063735615226,
      "jumpDay": "2016-10-06",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001193125-16-671945",
          "form": "10-Q",
          "filingDate": "2016-08-04",
          "tradingSymbol": "ALNY",
          "tagged": [
            "ALNY"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001193125-16-758802",
          "form": "10-Q",
          "filingDate": "2016-11-03",
          "tradingSymbol": "ALNY",
          "tagged": [
            "ALNY"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001564590-17-001649"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001193125-16-671945",
          "coverDate": "2016-07-29",
          "shares": 85724637,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001193125-16-758802",
          "coverDate": "2016-10-31",
          "shares": 85813869,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0010409142939853
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 2,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2016-08-04",
          "accession": "0001193125-16-671945",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516671945/alny-20160630.xml",
          "sha256": "2629f4771f08d566b224ff7fabf01e8abb5287d4e41db644516c867b52388a42",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ALNY\"]; dei:EntityCommonStockSharesOutstanding 85724637 as of 2016-07-29"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2016-11-03",
          "accession": "0001193125-16-758802",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516758802/alny-20160930.xml",
          "sha256": "edfcb6f602ce5dc9bc4ca8c7aa9368c5fc9d14dc541d25e4f56eb8a3c77a2561",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ALNY\"]; dei:EntityCommonStockSharesOutstanding 85813869 as of 2016-10-31"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-16-758802",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516758802/d97137d10q.htm",
          "sha256": "b4f894efdd55f6baebd7209dc97963fc6ad9c17ae175f087d4630097891e82a8",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001564590-17-001649",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000156459017001649/alny-10k_20161231.htm",
          "sha256": "2bfa8d163447e85004de85653b10614603aad6ca866cd9ec3bf81cf8dc8a4624",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-713525",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516713525/0001193125-16-713525.txt",
          "sha256": "3aa80a0f479ff8c97335591b912927dd8af9fbe8b9afc695e788c283bca8525d",
          "quote": "items 1.01,5.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-731590",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516731590/0001193125-16-731590.txt",
          "sha256": "6b1f10f6829529457cc863cac80534380ff981893a6ad348fa918fd67414ae70",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01",
            "9.01"
          ],
          "filingDate": "2016-10-05",
          "reportDate": "2016-10-05",
          "accession": "0001193125-16-731590",
          "url": "https://www.sec.gov/Archives/edgar/data/1178670/000119312516731590/0001193125-16-731590.txt",
          "sha256": "6b1f10f6829529457cc863cac80534380ff981893a6ad348fa918fd67414ae70",
          "quote": "Item 8.01. Other Events. On October 5, 2016, Alnylam Pharmaceuticals, Inc. (the “Company”) announced that upon the recommendation of the ENDEAVOUR Phase 3 study Data Monitoring Committee (the “DMC”) to suspend dosing, the Company has decided to discontinue development of revusiran, an investigationa"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:12+00:00"
    },
    {
      "securityId": "ref_ARLO",
      "ticker": "ARLO",
      "cik": "0001736946",
      "issuer": "Arlo Technologies, Inc.",
      "canonicalId": "tiingo:NYSE:ARLO:2018-08-03",
      "week": "2019-02-08",
      "prevWeek": "2019-02-01",
      "prevClose": 7.43,
      "close": 3.66,
      "weeklyRatio": 0.4925975773889637,
      "jumpDay": "2019-02-06",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001736946-19-000010",
          "form": "10-K",
          "filingDate": "2019-02-22",
          "tradingSymbol": "ARLO",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001736946-19-000024",
          "form": "10-Q",
          "filingDate": "2019-05-06",
          "tradingSymbol": "ARLO",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NYSE",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001736946-19-000010"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001736946-19-000010",
          "coverDate": "2019-02-01",
          "shares": 74255189,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001736946-19-000024",
          "coverDate": "2019-04-19",
          "shares": 74548465,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0039495691001474
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 2,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2019-02-22",
          "accession": "0001736946-19-000010",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000010/arlo-20181231.xml",
          "sha256": "88b79b21300c075d167ce20514e5188f7f3107734c2d2c6653d177004b943c04",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol []; dei:EntityCommonStockSharesOutstanding 74255189 as of 2019-02-01"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2019-05-06",
          "accession": "0001736946-19-000024",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000024/arlo-20190331.xml",
          "sha256": "8058efd80c576e53532aae08826dd0d0b965c66b264795819216c1b76822468d",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol []; dei:EntityCommonStockSharesOutstanding 74548465 as of 2019-04-19"
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001736946-19-000010",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000010/arlo20181231-10xk.htm",
          "sha256": "e818519381c6603a54ac67c55df1c97d2dc034fb594b9ec2fad6813db87ffc33",
          "quote": " of $16.00 per share. On August 3, 2018, Arlo’s shares began trading on the New York Stock Exchange under the ticker symbol “ARLO.” On August 7, 2018, we completed the IPO of 11,747,250 shares of common stock (including 1,532,250 shares of"
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001736946-19-000024",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000024/arlo20190331-10q.htm",
          "sha256": "477295775682c22b950feafe23b1a1acbe5a6af15f04843ad74bed3d94afae4a",
          "quote": " of $16.00 per share. On August 3, 2018, Arlo’s shares began trading on the New York Stock Exchange under the ticker symbol “ARLO.” On August 7, 2018, the Company completed its IPO of 11,747,250 shares of common stock (including 1,532,250 "
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001736946-19-000024",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000024/arlo20190331-10q.htm",
          "sha256": "477295775682c22b950feafe23b1a1acbe5a6af15f04843ad74bed3d94afae4a",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001736946-19-000010",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000010/arlo20181231-10xk.htm",
          "sha256": "e818519381c6603a54ac67c55df1c97d2dc034fb594b9ec2fad6813db87ffc33",
          "quote": "NYSE"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-18-341095",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000119312518341095/0001193125-18-341095.txt",
          "sha256": "ee7db0406ac6422092418ba08b042a9b927652c47b1a9c2646f6a7d50d3ee6cf",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-19-002536",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000119312519002536/0001193125-19-002536.txt",
          "sha256": "5ecfbaf03ef697413160c5eb17cd0243efd7ccd3cf6370476c21f783485dbaff",
          "quote": "items 3.03,8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2019-02-05",
          "reportDate": "2019-02-05",
          "accession": "0001736946-19-000005",
          "url": "https://www.sec.gov/Archives/edgar/data/1736946/000173694619000005/0001736946-19-000005.txt",
          "sha256": "4c93d67d7381875474fc6436739446b94bc24eb751c553722c5bf277555a46fe",
          "quote": "Item 2.02 Results of Operations and Financial Condition. On February 5, 2019 , Arlo Technologies, Inc. issued a press release announcing its financial results for the fourth quarter and full year ended December 31, 2018 , the text of which is furnished herewith as Exhibit 99.1. The information furni"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:14+00:00"
    },
    {
      "securityId": "ref_BKSY",
      "ticker": "BKSY",
      "cik": "0001753539",
      "issuer": "BlackSky Technology Inc.",
      "canonicalId": "tiingo:NYSE:BKSY:2019-12-20",
      "week": "2022-05-27",
      "prevWeek": "2022-05-20",
      "prevClose": 10.4,
      "close": 20.96,
      "weeklyRatio": 2.0153846153846153,
      "jumpDay": "2022-05-25",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001753539-22-000031",
          "form": "10-Q",
          "filingDate": "2022-05-11",
          "tradingSymbol": "BKSY",
          "tagged": [
            "BKSY",
            "BKSY.W"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001753539-22-000070",
          "form": "10-Q",
          "filingDate": "2022-08-10",
          "tradingSymbol": "BKSY",
          "tagged": [
            "BKSY",
            "BKSY.W"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NYSE",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NYSE"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001753539-22-000031",
          "coverDate": "2022-05-10",
          "shares": 120575011,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001753539-22-000070",
          "coverDate": "2022-08-09",
          "shares": 120948826,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0031002692589428
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2022-05-11",
          "accession": "0001753539-22-000031",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000031/bksy-20220331_htm.xml",
          "sha256": "de5b40c236a213a7e7d6447ea645883e80160f833001d6454d96d3e3d735ca0a",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"BKSY\",\"BKSY.W\"]; dei:EntityCommonStockSharesOutstanding 120575011 as of 2022-05-10; dei:SecurityExchangeName [\"NYSE\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2022-08-10",
          "accession": "0001753539-22-000070",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000070/bksy-20220630_htm.xml",
          "sha256": "7ae1c28f5beb340f89b385accbd8b8a68081ad3afa576cb7a8aa03605c3d3680",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"BKSY\",\"BKSY.W\"]; dei:EntityCommonStockSharesOutstanding 120948826 as of 2022-08-09; dei:SecurityExchangeName [\"NYSE\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001753539-22-000070",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000070/bksy-20220630.htm",
          "sha256": "b015affeefaf0e2827face36cb35366380d2817f93df08ff181b56dd003f0c3f",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001753539-22-000039",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000039/0001753539-22-000039.txt",
          "sha256": "45d68747e0e54605b60cf398cd13f861a909ddd41129b7357b6815c84bc11a6c",
          "quote": "items 1.01,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001753539-22-000044",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000044/0001753539-22-000044.txt",
          "sha256": "586d48d7f551d611c2a38e4f15d174d4e7b9bd1eb2c37918603af79660a87978",
          "quote": "items 1.01,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001753539-22-000052",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000052/0001753539-22-000052.txt",
          "sha256": "fca0615e5968c6bf08eb741184e83a32adbc683659644d467c8f54e9d870236f",
          "quote": "items 2.02,5.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001753539-22-000056",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000056/0001753539-22-000056.txt",
          "sha256": "9a92b037c86c3b5ce5a61b44ea13025a564e9781928e6a0887f2ff902d5f569f",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "1.01",
            "7.01",
            "9.01"
          ],
          "filingDate": "2022-05-25",
          "reportDate": "2022-05-25",
          "accession": "0001753539-22-000039",
          "url": "https://www.sec.gov/Archives/edgar/data/1753539/000175353922000039/0001753539-22-000039.txt",
          "sha256": "45d68747e0e54605b60cf398cd13f861a909ddd41129b7357b6815c84bc11a6c",
          "quote": "Item 1.01. Entry into a Material Definitive Agreement On May 22, 2022, BlackSky Technology Inc. (the “Company”) entered into a multi-year, firm fixed-price contract with the National Reconnaissance Office, an agency of the United States Intelligence Community (the \"NRO Contract\"). The NRO Contract i"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:27+00:00"
    },
    {
      "securityId": "ref_BMEA",
      "ticker": "BMEA",
      "cik": "0001840439",
      "issuer": "Biomea Fusion, Inc.",
      "canonicalId": "tiingo:NASDAQ:BMEA:2021-04-16",
      "week": "2023-03-31",
      "prevWeek": "2023-03-24",
      "prevClose": 15.43,
      "close": 31.01,
      "weeklyRatio": 2.009721322099806,
      "jumpDay": "2023-03-28",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000950170-23-010312",
          "form": "10-K",
          "filingDate": "2023-03-28",
          "tradingSymbol": "BMEA",
          "tagged": [
            "BMEA"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0000950170-23-016700",
          "form": "10-Q",
          "filingDate": "2023-05-02",
          "tradingSymbol": "BMEA",
          "tagged": [
            "BMEA"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000950170-23-010312",
          "coverDate": "2023-03-21",
          "shares": 29608622,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0000950170-23-016700",
          "coverDate": "2023-04-26",
          "shares": 35401134,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.195635987382324
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2023-03-28",
          "accession": "0000950170-23-010312",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000095017023010312/bmea-20221231_htm.xml",
          "sha256": "859075abe765fb2111b666bd738b1aee69750fe27e7532dc10a604c8a749da14",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"BMEA\"]; dei:EntityCommonStockSharesOutstanding 29608622 as of 2023-03-21; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2023-05-02",
          "accession": "0000950170-23-016700",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000095017023016700/bmea-20230331_htm.xml",
          "sha256": "0e8e6f22589d9109c2540ae09e6e64fdbafb13d57236eee2b52d9b24a423a55c",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"BMEA\"]; dei:EntityCommonStockSharesOutstanding 35401134 as of 2023-04-26; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0000950170-23-016700",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000095017023016700/bmea-20230331.htm",
          "sha256": "01614b9465d9569bd57b4d40632bee6bff402563c2fcb2566e293a2c18d13538",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-23-007186",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000119312523007186/0001193125-23-007186.txt",
          "sha256": "3dc7ed35bfa128df54f55888364faaec4adebe49d1f4035adcbc9a42b5fed4ce",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-23-082314",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000119312523082314/0001193125-23-082314.txt",
          "sha256": "474cd19dda24e8cecafe68fd98691e456d066fce742c9937664ea27c87ff96f4",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-23-089530",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000119312523089530/0001193125-23-089530.txt",
          "sha256": "4b1f219a8c8689f45b70da8bd5dc884c044d87672bdaaca09fd3e13cfb302250",
          "quote": "items 1.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-23-132621",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000119312523132621/0001193125-23-132621.txt",
          "sha256": "d3f00cdbe8cf1a41664c46d7a2a1b0bc93c01ba652cb44fe1829cdfbc2a0fad0",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2023-03-28",
          "reportDate": "2023-03-28",
          "accession": "0000950170-23-010286",
          "url": "https://www.sec.gov/Archives/edgar/data/1840439/000095017023010286/0000950170-23-010286.txt",
          "sha256": "0043e410a1110574a642383d295cc7a87c8bc0d5f2e0ce7b1329fd84fceda661",
          "quote": "Item 2.02 Results of Operations and Financial Condition. On March 28, 2023, Biomea Fusion, Inc. issued a press release announcing its financial results for the quarter ended and year ended December 31, 2022. The full text of the press release is being furnished as Exhibit 99.1 to this Current Report"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:34+00:00"
    },
    {
      "securityId": "ref_CPIX",
      "ticker": "CPIX",
      "cik": "0001087294",
      "issuer": "CUMBERLAND PHARMACEUTICALS INC",
      "canonicalId": "tiingo:NASDAQ:CPIX:2009-08-11",
      "week": "2021-12-03",
      "prevWeek": "2021-11-26",
      "prevClose": 2.23,
      "close": 4.59,
      "weeklyRatio": 2.0582959641255605,
      "jumpDay": "2021-11-30",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001628280-21-023213",
          "form": "10-Q",
          "filingDate": "2021-11-12",
          "tradingSymbol": "CPIX",
          "tagged": [
            "CPIX"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001628280-22-005942",
          "form": "10-K",
          "filingDate": "2022-03-11",
          "tradingSymbol": "CPIX",
          "tagged": [
            "CPIX"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001628280-21-023213",
          "coverDate": "2021-11-08",
          "shares": 14809628,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001628280-22-005942",
          "coverDate": "2022-03-07",
          "shares": 14840330,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0020731108168281
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2021-11-12",
          "accession": "0001628280-21-023213",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828021023213/cpix-20210930_htm.xml",
          "sha256": "814e6f6b53b5d37b6a586847fcdb35c8925bbb0d6c0cab7de76a903d6dfe647c",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"CPIX\"]; dei:EntityCommonStockSharesOutstanding 14809628 as of 2021-11-08; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2022-03-11",
          "accession": "0001628280-22-005942",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828022005942/cpix-20211231_htm.xml",
          "sha256": "e7da55b5d90044488df20baecd543b1d6975b6ff5ae8278a73d6832c5ff96ef4",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"CPIX\"]; dei:EntityCommonStockSharesOutstanding 14840330 as of 2022-03-07; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001628280-22-005942",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828022005942/cpix-20211231.htm",
          "sha256": "3f67c212fce7a9da2d3eaef994796e22767fb35cf80623f95c6e827e4bde84fb",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-21-023902",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828021023902/0001628280-21-023902.txt",
          "sha256": "92b2abbbc7ba07647c6e685d26d7487d20d29408a811b3c2c074ab10f6637bff",
          "quote": "items 1.01,2.03,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-21-024264",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828021024264/0001628280-21-024264.txt",
          "sha256": "c1b7464b2a23a7c5dfd011847fa98f6e0b6112258b74af110bdb981daf2c824b",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-21-025612",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828021025612/0001628280-21-025612.txt",
          "sha256": "9778827458485f41d741253ccc289f337f1cf1e4471aa46917896f5c1ef406c1",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-22-000440",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828022000440/0001628280-22-000440.txt",
          "sha256": "21219b0be8b7af70e8ff8c5e5da2ff16f227fd8ecd16ae0404454117ec9c33df",
          "quote": "items 1.01,2.01,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01"
          ],
          "filingDate": "2021-12-01",
          "reportDate": "2021-11-30",
          "accession": "0001628280-21-024264",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828021024264/0001628280-21-024264.txt",
          "sha256": "c1b7464b2a23a7c5dfd011847fa98f6e0b6112258b74af110bdb981daf2c824b",
          "quote": "Item 8.01 Other Events On November 29, 2021, Cumberland announced the U.S. Food and Drug Administration (FDA) has approved expanded labeling for Caldolor®, an intravenously delivered formulation of ibuprofen to now include use in pre-operative administration. The non-narcotic pain reliever may now b"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:55+00:00"
    },
    {
      "securityId": "ref_CPIX",
      "ticker": "CPIX",
      "cik": "0001087294",
      "issuer": "CUMBERLAND PHARMACEUTICALS INC",
      "canonicalId": "tiingo:NASDAQ:CPIX:2009-08-11",
      "week": "2025-02-07",
      "prevWeek": "2025-01-31",
      "prevClose": 2.26,
      "close": 4.47,
      "weeklyRatio": 1.9778761061946903,
      "jumpDay": "2025-02-04",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001628280-24-046730",
          "form": "10-Q",
          "filingDate": "2024-11-08",
          "tradingSymbol": "CPIX",
          "tagged": [
            "CPIX"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001628280-25-011366",
          "form": "10-K",
          "filingDate": "2025-03-07",
          "tradingSymbol": "CPIX",
          "tagged": [
            "CPIX"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001628280-24-046730",
          "coverDate": "2024-11-04",
          "shares": 14042304,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001628280-25-011366",
          "coverDate": "2025-03-04",
          "shares": 13968394,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 0.9947366187201189
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 8,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2024-11-08",
          "accession": "0001628280-24-046730",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828024046730/cpix-20240930_htm.xml",
          "sha256": "40d080d9fd8de58b5c5c7852e1a42ee4dfbb4c8ebaa8132cf401c4f3204f757d",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"CPIX\"]; dei:EntityCommonStockSharesOutstanding 14042304 as of 2024-11-04; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2025-03-07",
          "accession": "0001628280-25-011366",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025011366/cpix-20241231_htm.xml",
          "sha256": "af0c01a9b4855254faa1b9da9cfed2f16360a841c53b55f3a60c5d362f88d74e",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"CPIX\"]; dei:EntityCommonStockSharesOutstanding 13968394 as of 2025-03-04; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001628280-25-011366",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025011366/cpix-20241231.htm",
          "sha256": "66b5b38842e37b3c344488e0ffe015d628309b4c495c8238753c0706c5239f00",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-24-045054",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828024045054/0001628280-24-045054.txt",
          "sha256": "041cb9dd852f481f338d14283ec9f13ccf1073fa5dae84bb475d080d9c41720f",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-24-045807",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828024045807/0001628280-24-045807.txt",
          "sha256": "5d8ec27495ea97e80e9ac6bde365d785740eaf1b4bea830720b5eeb0b8353b62",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-24-046827",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828024046827/0001628280-24-046827.txt",
          "sha256": "460ecdfaca465ec798861b3b516bfeb91e13beab934f883d9533d737f35ba166",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-24-050499",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828024050499/0001628280-24-050499.txt",
          "sha256": "40a22a3257feff7b91e7e738163a759162c3135e816999bff13908cdb8f5ebf3",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-25-003753",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025003753/0001628280-25-003753.txt",
          "sha256": "39b459f9a13d827c02cd1e11b74fad175c9314ff3c087eead5f35c25ba9ea843",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-25-005744",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025005744/0001628280-25-005744.txt",
          "sha256": "881d788d6e9de385ec56b91845b29e6d1e117949be525756180e90f81339fde6",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-25-006430",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025006430/0001628280-25-006430.txt",
          "sha256": "798cf02fca442c4d5d0468e3b075dc30850905d7042914eb24459bffd1d41ca8",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001628280-25-013875",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025013875/0001628280-25-013875.txt",
          "sha256": "5fed054b76ab049cd56979e26e90a318babfa0c0d0447993cb5adc45caad204d",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01"
          ],
          "filingDate": "2025-02-04",
          "reportDate": "2025-02-04",
          "accession": "0001628280-25-003753",
          "url": "https://www.sec.gov/Archives/edgar/data/1087294/000162828025003753/0001628280-25-003753.txt",
          "sha256": "39b459f9a13d827c02cd1e11b74fad175c9314ff3c087eead5f35c25ba9ea843",
          "quote": "Item 8.01 Other Events On February 5, 2025, Cumberland Pharmaceuticals Inc. (“Cumberland” or the “Company”) announced positive top-line results from its Phase 2 FIGHT DMD trial. The study evaluated ifetroban, a novel oral therapy for Duchenne muscular dystrophy (DMD) heart disease – the leading caus"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:03:55+00:00"
    },
    {
      "securityId": "ref_ERII",
      "ticker": "ERII",
      "cik": "0001421517",
      "issuer": "Energy Recovery, Inc.",
      "canonicalId": "tiingo:NASDAQ:ERII:2008-07-02",
      "week": "2015-10-23",
      "prevWeek": "2015-10-16",
      "prevClose": 2.46,
      "close": 7.39,
      "weeklyRatio": 3.0040650406504064,
      "jumpDay": "2015-10-20",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001437749-15-015102",
          "form": "10-Q",
          "filingDate": "2015-08-06",
          "tradingSymbol": "ERII",
          "tagged": [
            "ERII"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001437749-15-019876",
          "form": "10-Q",
          "filingDate": "2015-11-05",
          "tradingSymbol": "ERII",
          "tagged": [
            "ERII"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001437749-16-026759"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001437749-15-015102",
          "coverDate": "2015-08-03",
          "shares": 52231186,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001437749-15-019876",
          "coverDate": "2015-11-02",
          "shares": 54838283,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0499145663665381
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2015-08-06",
          "accession": "0001437749-15-015102",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915015102/erii-20150630.xml",
          "sha256": "644532488460085ec363ce2e6f156d98c758c45aee218c6af69e2a3a8bece4c9",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ERII\"]; dei:EntityCommonStockSharesOutstanding 52231186 as of 2015-08-03"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2015-11-05",
          "accession": "0001437749-15-019876",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915019876/erii-20150930.xml",
          "sha256": "b471b0fa67002dcc783ecd98d214924c866a671066ca73ca8889dd6e3b8f9ea1",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"ERII\"]; dei:EntityCommonStockSharesOutstanding 54838283 as of 2015-11-02"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001437749-15-019876",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915019876/erii20150930_10q.htm",
          "sha256": "a603caa33ec4253e35138c06feeced967392af080369c997bf5fda4a906c236a",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001437749-16-026759",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774916026759/erii20151231_10k.htm",
          "sha256": "f1ee16682dfa3001b1b3e007e0fc145a5969965bc67b1632f9ef3b0afa01059a",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-15-018552",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915018552/0001437749-15-018552.txt",
          "sha256": "fe8513a6b018840ff0702ee8ba591fcadb42b12b2bf792947ef2bc6f4085b981",
          "quote": "items 1.01,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-15-018747",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915018747/0001437749-15-018747.txt",
          "sha256": "19099fba3046329e496c60478651b29537f483297ae22a5984abe1fbd8ee3899",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-15-019216",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915019216/0001437749-15-019216.txt",
          "sha256": "80f1c9f91384dade74b6ce83b9d991ca7d41ee8a8ece669a5aca004be76a4f39",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-15-020666",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915020666/0001437749-15-020666.txt",
          "sha256": "12338f2207a6ae4fe1b0c640819f3bc8664e62fde28bd8949a694dd2d0037ac2",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "1.01",
            "7.01",
            "9.01"
          ],
          "filingDate": "2015-10-19",
          "reportDate": "2015-10-14",
          "accession": "0001437749-15-018552",
          "url": "https://www.sec.gov/Archives/edgar/data/1421517/000143774915018552/0001437749-15-018552.txt",
          "sha256": "fe8513a6b018840ff0702ee8ba591fcadb42b12b2bf792947ef2bc6f4085b981",
          "quote": "Item 7.01 Regulation FD Disclosure . On October 19, 2015, the Company issued a press release announcing the entry into the License Agreement. A copy of this press release is attached hereto as Exhibit 99.1. Item 9.01 Financial Statements and Exhibits. (c) Exhibits 99.1 Press Release Dated October 19"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:04:24+00:00"
    },
    {
      "securityId": "ref_FMC",
      "ticker": "FMC",
      "cik": "0000037785",
      "issuer": "FMC CORP",
      "canonicalId": "tiingo:NYSE:FMC:1985-07-01",
      "week": "2025-10-31",
      "prevWeek": "2025-10-24",
      "prevClose": 30.45,
      "close": 15.17,
      "weeklyRatio": 0.49819376026272577,
      "jumpDay": "2025-10-30",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000037785-25-000127",
          "form": "10-Q",
          "filingDate": "2025-10-30",
          "tradingSymbol": "FMC",
          "tagged": [
            "FMC"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0000037785-26-000041",
          "form": "10-K",
          "filingDate": "2026-02-27",
          "tradingSymbol": "FMC",
          "tagged": [
            "FMC"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NYSE",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NYSE"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000037785-25-000127",
          "coverDate": "2025-09-30",
          "shares": 124920067,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0000037785-26-000041",
          "coverDate": "2025-12-31",
          "shares": 124934056,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.000111983609487
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2025-10-30",
          "accession": "0000037785-25-000127",
          "url": "https://www.sec.gov/Archives/edgar/data/37785/000003778525000127/fmc-20250930_htm.xml",
          "sha256": "0b6eb90f00a30ae0068b5c37ba045e470c47912c1248d5409a7d81d054ed6092",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"FMC\"]; dei:EntityCommonStockSharesOutstanding 124920067 as of 2025-09-30; dei:SecurityExchangeName [\"NYSE\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2026-02-27",
          "accession": "0000037785-26-000041",
          "url": "https://www.sec.gov/Archives/edgar/data/37785/000003778526000041/fmc-20251231_htm.xml",
          "sha256": "ca68457d832d4b1a5eec172006f8fee1b3f23359edd6ed8113c96cc7ef089e63",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"FMC\"]; dei:EntityCommonStockSharesOutstanding 124934056 as of 2025-12-31; dei:SecurityExchangeName [\"NYSE\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0000037785-26-000041",
          "url": "https://www.sec.gov/Archives/edgar/data/37785/000003778526000041/fmc-20251231.htm",
          "sha256": "19df727d75947686002aeeb3e9ce6ffc674abf02145835a0d618a8352f686ce6",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000950103-25-013822",
          "url": "https://www.sec.gov/Archives/edgar/data/37785/000095010325013822/0000950103-25-013822.txt",
          "sha256": "b28783ab8ce829facb1d2d72f5f01bd31cc3ffbd988f83f61bd6d427ed66d6c4",
          "quote": "items 5.02,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2025-10-29",
          "reportDate": "2025-10-29",
          "accession": "0000037785-25-000123",
          "url": "https://www.sec.gov/Archives/edgar/data/37785/000003778525000123/0000037785-25-000123.txt",
          "sha256": "2265b8d882b60dddd14d4358cd6e04a422335530a8582d6bdc4cc2a1879769dc",
          "quote": "ITEM 2.02. RESULTS OF OPERATIONS AND FINANCIAL CONDITION On October 29, 2025, FMC Corporation issued a press release announcing the financial results for the three months ended September 30, 2025. A copy of the press release is attached as Exhibit 99.1 to this Current Report on Form 8-K. ITEM 9.01. "
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:05:30+00:00"
    },
    {
      "securityId": "ref_GRAL",
      "ticker": "GRAL",
      "cik": "0001699031",
      "issuer": "GRAIL, Inc.",
      "canonicalId": "tiingo:NASDAQ:GRAL:2024-06-25",
      "week": "2026-02-20",
      "prevWeek": "2026-02-13",
      "prevClose": 97.5,
      "close": 50.21,
      "weeklyRatio": 0.514974358974359,
      "jumpDay": "2026-02-20",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001699031-25-000193",
          "form": "10-Q",
          "filingDate": "2025-11-13",
          "tradingSymbol": "GRAL",
          "tagged": [
            "GRAL"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001628280-26-017319",
          "form": "10-K",
          "filingDate": "2026-03-12",
          "tradingSymbol": "GRAL",
          "tagged": [
            "GRAL"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001699031-25-000193",
          "coverDate": "2025-11-10",
          "shares": 38982223,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001628280-26-017319",
          "coverDate": "2026-03-06",
          "shares": 41020255,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.052281061549517
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2025-11-13",
          "accession": "0001699031-25-000193",
          "url": "https://www.sec.gov/Archives/edgar/data/1699031/000169903125000193/gral-20250930_htm.xml",
          "sha256": "58d187b2848adf8bfc3e582301f120ed28a2ba585ec98e30cb2e66e2ef32ddb3",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"GRAL\"]; dei:EntityCommonStockSharesOutstanding 38982223 as of 2025-11-10; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2026-03-12",
          "accession": "0001628280-26-017319",
          "url": "https://www.sec.gov/Archives/edgar/data/1699031/000162828026017319/gral-20251231_htm.xml",
          "sha256": "e6c06e7695623c860515abeed030cefde0e681d36e15b616dd11fd1536e5aebf",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"GRAL\"]; dei:EntityCommonStockSharesOutstanding 41020255 as of 2026-03-06; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001628280-26-017319",
          "url": "https://www.sec.gov/Archives/edgar/data/1699031/000162828026017319/gral-20251231.htm",
          "sha256": "854a41743ebeba379a64b2fdf5efb0e3924a4bc5b887170cf4c6124b7450f44b",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001699031-26-000009",
          "url": "https://www.sec.gov/Archives/edgar/data/1699031/000169903126000009/0001699031-26-000009.txt",
          "sha256": "aecc27cf5e6c58f52b35756b48ce855cf6af7bd4de2ea2b008f9afa755d498bd",
          "quote": "items 2.02,8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "8.01",
            "9.01"
          ],
          "filingDate": "2026-02-19",
          "reportDate": "2026-02-19",
          "accession": "0001699031-26-000009",
          "url": "https://www.sec.gov/Archives/edgar/data/1699031/000169903126000009/0001699031-26-000009.txt",
          "sha256": "aecc27cf5e6c58f52b35756b48ce855cf6af7bd4de2ea2b008f9afa755d498bd",
          "quote": "Item 2.02 Results of operations and financial condition. On February 19, 2026 , GRAIL, Inc. (the “Company” or “GRAIL”) issued a press release announcing its financial results for the fourth quarter and year ended December 31, 2025. A copy of the press release is furnished as Exhibit 99.1 to this Cur"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:10:22+00:00"
    },
    {
      "securityId": "ref_GRCE",
      "ticker": "GRCE",
      "cik": "0001444192",
      "issuer": "Grace Therapeutics, Inc.",
      "canonicalId": "tiingo:NASDAQ:GRCE:2024-10-08",
      "week": "2026-04-24",
      "prevWeek": "2026-04-17",
      "prevClose": 4.6,
      "close": 2.3,
      "weeklyRatio": 0.5,
      "jumpDay": "2026-04-23",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001140361-26-004924",
          "form": "10-Q",
          "filingDate": "2026-02-12",
          "tradingSymbol": "GRCE",
          "tagged": [
            "GRCE"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001140361-26-025662",
          "form": "10-K",
          "filingDate": "2026-06-18",
          "tradingSymbol": "GRCE",
          "tagged": [
            "GRCE"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001140361-26-004924",
          "coverDate": "2026-02-12",
          "shares": 15474026,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001140361-26-025662",
          "coverDate": "2026-06-15",
          "shares": 16274026,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.051699538310198
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 2,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2026-02-12",
          "accession": "0001140361-26-004924",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126004924/ef20060621_10q_htm.xml",
          "sha256": "566b306d49d7a595f0ba497e78d6b67a01d8ae6262f83f7d13aba3ca183c0277",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"GRCE\"]; dei:EntityCommonStockSharesOutstanding 15474026 as of 2026-02-12; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2026-06-18",
          "accession": "0001140361-26-025662",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126025662/ef20070498_10k_htm.xml",
          "sha256": "e89d903ceebdf5592b97c9c815f6591554594eaaed314138be849424c882b809",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"GRCE\"]; dei:EntityCommonStockSharesOutstanding 16274026 as of 2026-06-15; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001140361-26-025662",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126025662/ef20070498_10k.htm",
          "sha256": "a12d35688dfd513773e4179edd8bc170b2b553e5de1190241646782c293d3534",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001140361-26-016324",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126016324/0001140361-26-016324.txt",
          "sha256": "acecbe8a0d43c0cea1c46374be306d57f372f955e36d52c73adc166b49530395",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001140361-26-016834",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126016834/0001140361-26-016834.txt",
          "sha256": "9ab3779b82afbc4e25a5bb19bd759a5d49036fe90c51e62f95ad625f8aa55ebd",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01",
            "9.01"
          ],
          "filingDate": "2026-04-23",
          "reportDate": "2026-04-23",
          "accession": "0001140361-26-016324",
          "url": "https://www.sec.gov/Archives/edgar/data/1444192/000114036126016324/0001140361-26-016324.txt",
          "sha256": "acecbe8a0d43c0cea1c46374be306d57f372f955e36d52c73adc166b49530395",
          "quote": "Item 8.01. Other Events On April 23, 2026, Grace Therapeutics, Inc. (the “Company”) issued a press release announcing that the U.S. Food and Drug Administration has issued a Complete Response Letter for the Company’s New Drug Application for GTx-104 in the treatment of patients with aneurysmal subar"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:10:35+00:00"
    },
    {
      "securityId": "ref_HYFM",
      "ticker": "HYFM",
      "cik": "0001695295",
      "issuer": "HYDROFARM HOLDINGS GROUP, INC.",
      "canonicalId": "tiingo:NASDAQ:HYFM:2020-12-10",
      "week": "2026-08-07",
      "prevWeek": "2026-07-31",
      "prevClose": 0.54,
      "close": 1.6,
      "weeklyRatio": 2.962962962962963,
      "jumpDay": "2026-08-03",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001437749-26-017373",
          "form": "10-Q",
          "filingDate": "2026-05-15",
          "tradingSymbol": "HYFM",
          "tagged": [
            "HYFM"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001437749-26-028012",
          "form": "10-Q",
          "filingDate": "2026-08-14",
          "tradingSymbol": "HYFM",
          "tagged": [
            "HYFM"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001437749-26-017373",
          "coverDate": "2026-05-11",
          "shares": 4764612,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001437749-26-028012",
          "coverDate": "2026-08-12",
          "shares": 4819323,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.011482781808886
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 3,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2026-05-15",
          "accession": "0001437749-26-017373",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926017373/hyfm20260331_10q_htm.xml",
          "sha256": "27fef88fcf2a39289c41ef0cd6c9009f154b8b3b6517f47540a4d4a033efb879",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"HYFM\"]; dei:EntityCommonStockSharesOutstanding 4764612 as of 2026-05-11; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2026-08-14",
          "accession": "0001437749-26-028012",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926028012/hyfm20260630_10q_htm.xml",
          "sha256": "60652e0be0641c040ed351ce28e1556d7b915b9ec85a737f8765375eed434678",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"HYFM\"]; dei:EntityCommonStockSharesOutstanding 4819323 as of 2026-08-12; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001437749-26-028012",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926028012/hyfm20260630_10q.htm",
          "sha256": "8c65fcdc239e7f7c78b69f3acfd59be396de3aeeace2dfdf30ab9c3a4fcb02a8",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-26-021306",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926021306/0001437749-26-021306.txt",
          "sha256": "6f6178ee5650f2afcd1c8bfc32a9f1b6013745260e97b62dbaa19fc59b920d54",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-26-023198",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926023198/0001437749-26-023198.txt",
          "sha256": "c746e4c7c2b38e050466339e201e48dccdf6daead3ee0503596e102647f2fd0b",
          "quote": "items 3.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001437749-26-026270",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926026270/0001437749-26-026270.txt",
          "sha256": "25f68dd59ef88a6f9b16fb598b6210fbaf7fbd8da43da6723dac23de44180bb1",
          "quote": "items 1.01,2.01,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "1.01",
            "2.01",
            "7.01",
            "9.01"
          ],
          "filingDate": "2026-08-06",
          "reportDate": "2026-07-31",
          "accession": "0001437749-26-026270",
          "url": "https://www.sec.gov/Archives/edgar/data/1695295/000143774926026270/0001437749-26-026270.txt",
          "sha256": "25f68dd59ef88a6f9b16fb598b6210fbaf7fbd8da43da6723dac23de44180bb1",
          "quote": "Item 1.01 Entry into Material Definitive Agreement. On July 31, 2026 (the “Closing Date”), Hydrofarm Holdings Group, Inc., a Delaware corporation (the “Company”), through its wholly owned subsidiaries Aurora International, LLC, a Delaware limited liability company (the “Seller”) and Aurora Peat Prod"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:12:01+00:00"
    },
    {
      "securityId": "ref_MDRR",
      "ticker": "MDRR",
      "cik": "0001654595",
      "issuer": "Medalist Diversified, Inc.",
      "canonicalId": "tiingo:NASDAQ:MDRR:2018-11-28",
      "week": "2020-10-16",
      "prevWeek": "2020-10-09",
      "prevClose": 18.88,
      "close": 38.55,
      "weeklyRatio": 2.041843220338983,
      "jumpDay": "2020-10-14",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001104659-20-094696",
          "form": "10-Q",
          "filingDate": "2020-08-13",
          "tradingSymbol": "MDRR",
          "tagged": [
            "mdrr"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001104659-20-125124",
          "form": "10-Q",
          "filingDate": "2020-11-13",
          "tradingSymbol": "MDRR",
          "tagged": [
            "mdrr"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001104659-20-094696",
          "coverDate": "2020-08-12",
          "shares": 4747968,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001104659-20-125124",
          "coverDate": "2020-11-13",
          "shares": 4797968,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0105308207637456
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 5,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2020-08-13",
          "accession": "0001104659-20-094696",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920094696/mdrr-20200630.xml",
          "sha256": "344fef414f7948acbf611d9ad589792a43d56ee5db0a50653bd0c0444535f5d8",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"mdrr\"]; dei:EntityCommonStockSharesOutstanding 4747968 as of 2020-08-12"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2020-11-13",
          "accession": "0001104659-20-125124",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920125124/mdrr-20200930.xml",
          "sha256": "d9180025124ecb4ff434ab01d4132bde72f69cb811e3aa9c4267edc28f5c76e6",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"mdrr\"]; dei:EntityCommonStockSharesOutstanding 4797968 as of 2020-11-13; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001104659-20-125124",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920125124/tm2029556d1_10q.htm",
          "sha256": "7dea0fd756dfb276b9b47b1bebfbd3ccce8364c4c8fce9b6a5263b8a4bb1759f",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-20-083120",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920083120/0001104659-20-083120.txt",
          "sha256": "c5f327ddd8bebe0d57699911176b2c4775b93170db21891a0751a49a08acd23a",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-20-090864",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920090864/0001104659-20-090864.txt",
          "sha256": "6c5fa1ca54815f36c4387f1aa5574e6087d5765105e58517700fdc378446978e",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-20-102637",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920102637/0001104659-20-102637.txt",
          "sha256": "7855f6b6882cccf0b58bfcf55f44937f516b2de4c8e504d95725791eba9ed42d",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-20-105218",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920105218/0001104659-20-105218.txt",
          "sha256": "de2aeb2f7e294d9140715c57e211936710be137a58ed70dac9342a6237072688",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-20-115543",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920115543/0001104659-20-115543.txt",
          "sha256": "d82bc318c83ab89a39cc35e678ff8ba7eb4a3f1e18878a2c857a3b5704d851bd",
          "quote": "items 7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "7.01",
            "9.01"
          ],
          "filingDate": "2020-10-16",
          "reportDate": "2020-10-14",
          "accession": "0001104659-20-115543",
          "url": "https://www.sec.gov/Archives/edgar/data/1654595/000110465920115543/0001104659-20-115543.txt",
          "sha256": "d82bc318c83ab89a39cc35e678ff8ba7eb4a3f1e18878a2c857a3b5704d851bd",
          "quote": "ITEM 7.01 REGULATION FD DISCLOSURE. On October 14, 2020, Medalist Diversified REIT, Inc. (the “Company”) issued a press release, a copy of which is attached to this Current Report on Form 8-K as Exhibit 99.1 and is incorporated herein by reference, anno uncing that the Company’s board of directors d"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:21:19+00:00"
    },
    {
      "securityId": "ref_MGNX",
      "ticker": "MGNX",
      "cik": "0001125345",
      "issuer": "MACROGENICS INC",
      "canonicalId": "tiingo:NASDAQ:MGNX:2013-10-10",
      "week": "2019-02-08",
      "prevWeek": "2019-02-01",
      "prevClose": 11.43,
      "close": 22.44,
      "weeklyRatio": 1.9632545931758532,
      "jumpDay": "2019-02-06",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001125345-18-000022",
          "form": "10-Q",
          "filingDate": "2018-11-07",
          "tradingSymbol": "MGNX",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001125345-19-000046",
          "form": "10-K",
          "filingDate": "2019-02-26",
          "tradingSymbol": "MGNX",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001125345-19-000046"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001125345-18-000097",
          "coverDate": "2018-11-02",
          "shares": 42259080,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001125345-19-000046",
          "coverDate": "2019-02-22",
          "shares": 48780321,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.1543157352218743
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2018-11-07",
          "accession": "0001125345-18-000097",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534518000097/mgnx-20180930_htm.xml",
          "sha256": "016589ba9c662a24a69f9e7aa5b48a542b753e51f8a32ae723a6d93c6be792ba",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol []; dei:EntityCommonStockSharesOutstanding 42259080 as of 2018-11-02"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2019-02-26",
          "accession": "0001125345-19-000046",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000046/mgnx-20181231_htm.xml",
          "sha256": "5d88632f652b13d8beccfe83ad862b19650310d8a6cf6e0c138b856c9aee5896",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol []; dei:EntityCommonStockSharesOutstanding 48780321 as of 2019-02-22"
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001125345-18-000022",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534518000022/mgnx-123117x10k.htm",
          "sha256": "d74b0dc19661ce9e4fe3c6c5b08a07a7f24aec0797f248f6ecefcdea30bfcc90",
          "quote": "Y SECURITIES Market Information Our common stock has been listed on the Nasdaq Global Select Market under the symbol \"MGNX\" since October 10, 2013. On February 23, 2018 , the closing price for our common stock as reported on the Nasd"
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001125345-19-000046",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000046/mgnx-20181231.htm",
          "sha256": "7ab458f9a0e2bd728b9c90314509b7b0b3e4d61feb7e9f1df64023dcba2470d0",
          "quote": " EQUITY SECURITIES Market Information Our common stock is listed on the Nasdaq Global Select Market under the symbol \"MGNX\". As of February 22, 2019, we had 48,780,321 shares of common stock outstanding held by approximately 75 holde"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001125345-19-000046",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000046/mgnx-20181231.htm",
          "sha256": "7ab458f9a0e2bd728b9c90314509b7b0b3e4d61feb7e9f1df64023dcba2470d0",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001125345-19-000046",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000046/mgnx-20181231.htm",
          "sha256": "7ab458f9a0e2bd728b9c90314509b7b0b3e4d61feb7e9f1df64023dcba2470d0",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-18-000107",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534518000107/0001125345-18-000107.txt",
          "sha256": "a3ff2f5f7ed4c2651250af91c655d6447153d28d7a394d04660a64d2c6b4320a",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-19-000006",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000006/0001125345-19-000006.txt",
          "sha256": "c1a71d632787084f5facc23813f2ed650d102c024468cecb2c2ab4ef05271d1c",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-19-000012",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000012/0001125345-19-000012.txt",
          "sha256": "53e6e4b760979b610ed3329513804bb6c799195fb2429bfb53d6be9084fac264",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001140361-19-003314",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000114036119003314/0001140361-19-003314.txt",
          "sha256": "eb48da4c403f46976c99e641d0ea56bc980893bf29eb88981adc78351f86c346",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01"
          ],
          "filingDate": "2019-02-06",
          "reportDate": "2019-02-06",
          "accession": "0001125345-19-000012",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534519000012/0001125345-19-000012.txt",
          "sha256": "53e6e4b760979b610ed3329513804bb6c799195fb2429bfb53d6be9084fac264",
          "quote": "Item 8.01. Other Events On February 6, 2019, the Company issued a press release announcing top-line results from its Phase 3 SOPHIA trial. SOPHIA is a randomized, controlled, multi-center study that compares margetuximab plus chemotherapy to trastuzumab plus chemotherapy in subjects with metastatic "
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:21:54+00:00"
    },
    {
      "securityId": "ref_MGNX",
      "ticker": "MGNX",
      "cik": "0001125345",
      "issuer": "MACROGENICS INC",
      "canonicalId": "tiingo:NASDAQ:MGNX:2013-10-10",
      "week": "2020-05-08",
      "prevWeek": "2020-05-01",
      "prevClose": 6.68,
      "close": 20.34,
      "weeklyRatio": 3.0449101796407185,
      "jumpDay": "2020-05-06",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001125345-20-000072",
          "form": "10-Q",
          "filingDate": "2020-05-05",
          "tradingSymbol": "MGNX",
          "tagged": [
            "MGNX"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001125345-20-000126",
          "form": "10-Q",
          "filingDate": "2020-07-31",
          "tradingSymbol": "MGNX",
          "tagged": [
            "MGNX"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001125345-20-000072",
          "coverDate": "2020-05-01",
          "shares": 49138017,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001125345-20-000126",
          "coverDate": "2020-07-24",
          "shares": 54117181,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.1013301778132398
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 6,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2020-05-05",
          "accession": "0001125345-20-000072",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000072/mgnx-20200331_htm.xml",
          "sha256": "5e8d86899a8659759974a2273f2971192ef79dcf8a7aff800b8231384c5dd157",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MGNX\"]; dei:EntityCommonStockSharesOutstanding 49138017 as of 2020-05-01; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2020-07-31",
          "accession": "0001125345-20-000126",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000126/mgnx-20200630_htm.xml",
          "sha256": "a53b02fcd9e6b4250e9c9cbc860cb62ab224410a048b841098e27fd150917767",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MGNX\"]; dei:EntityCommonStockSharesOutstanding 54117181 as of 2020-07-24; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001125345-20-000126",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000126/mgnx-20200630.htm",
          "sha256": "a25bba6daf06dfe5e326164d4ea7b261f6b32ea8e0f2030c5cb5937079629ea0",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001140361-20-004828",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000114036120004828/0001140361-20-004828.txt",
          "sha256": "bc34b5f57a1549ed0e73f1ac0b3a8be2cffc3fd104224c2161eff3ec9c02c4fd",
          "quote": "items 5.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-20-000064",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000064/0001125345-20-000064.txt",
          "sha256": "15fca5337f298672c471ec81a6d7e2a0cc73e1f4d069e7538c61c0be7e95f14f",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-20-000077",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000077/0001125345-20-000077.txt",
          "sha256": "5711a627370d47ff12821573611d79f28c4b9c93462fb78662011563fef7508c",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-20-000103",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000103/0001125345-20-000103.txt",
          "sha256": "ad1d4b772cfb955e8e4521694fe1e2cdb19d62cd467d8b90197e3e998b779afb",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001125345-20-000106",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000106/0001125345-20-000106.txt",
          "sha256": "7c4379e6554bb6500b1d62bd60b5d0b4a35c221d66d48a7549048cdcaaacb4a8",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001140361-20-014355",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000114036120014355/0001140361-20-014355.txt",
          "sha256": "36cc1516fdefe6ae252463ef3a979c3183bc9783b5004cedfc7923b78f823d19",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2020-05-05",
          "reportDate": "2020-05-05",
          "accession": "0001125345-20-000073",
          "url": "https://www.sec.gov/Archives/edgar/data/1125345/000112534520000073/0001125345-20-000073.txt",
          "sha256": "edd82bcb3f5bc36ed970b6f6480c51004a30239f9b47a8f14d944c21c0c8c08b",
          "quote": "Item 2.02 Results of Operations and Financial Condition On May 5, 2020, MacroGenics, Inc. (the \"Company\") announced financial and operating results as of and for the quarter ended March 31, 2020. The full text of the press release issued in connection with the announcement is attached as Exhibit 99."
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:21:54+00:00"
    },
    {
      "securityId": "ref_MIRA",
      "ticker": "MIRA",
      "cik": "0001904286",
      "issuer": "MIRA PHARMACEUTICALS, INC.",
      "canonicalId": "tiingo:NASDAQ:MIRA:2023-08-03",
      "week": "2024-07-26",
      "prevWeek": "2024-07-19",
      "prevClose": 0.6888,
      "close": 2.71,
      "weeklyRatio": 3.9343786295005807,
      "jumpDay": "2024-07-22",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001493152-24-012141",
          "form": "10-K",
          "filingDate": "2024-04-01",
          "tradingSymbol": "MIRA",
          "tagged": [
            "MIRA"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001493152-24-031612",
          "form": "10-Q",
          "filingDate": "2024-08-13",
          "tradingSymbol": "MIRA",
          "tagged": [
            "MIRA"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001493152-24-012141",
          "coverDate": "2024-03-28",
          "shares": 14780885,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001493152-24-031612",
          "coverDate": "2024-08-13",
          "shares": 14780885,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 6,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2024-04-01",
          "accession": "0001493152-24-012141",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224012141/form10-k_htm.xml",
          "sha256": "e474b203b6068155a427ab43f5288d4410c1fff37c583c27b942ad85977fc9a8",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MIRA\"]; dei:EntityCommonStockSharesOutstanding 14780885 as of 2024-03-28; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2024-08-13",
          "accession": "0001493152-24-031612",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224031612/form10-q_htm.xml",
          "sha256": "c31da851d9b5c2903d9ef8c21f727af8d3ba19db87b6fcd8ff474ec564be9604",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MIRA\"]; dei:EntityCommonStockSharesOutstanding 14780885 as of 2024-08-13; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001493152-24-031612",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224031612/form10-q.htm",
          "sha256": "8a65b526e2e17d2e62b0c575148f07035da9b9ed9baf48dc2ada8a7395db2eb4",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-027120",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224027120/0001493152-24-027120.txt",
          "sha256": "d9ae10a492be5207b108a3e7dde186a805dd50ad252d875b07abc8e7e2731904",
          "quote": "items 3.01,8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-028548",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224028548/0001493152-24-028548.txt",
          "sha256": "b5fc1adee43d750efdf6f52e8237452aed28ca5123844e6cc2dd9f31b3783ec6",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-028917",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224028917/0001493152-24-028917.txt",
          "sha256": "709bcec90cd3a60492694c11d484faeb2f7ea00136702907aea4e9b7fb2b92c5",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-030684",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224030684/0001493152-24-030684.txt",
          "sha256": "9e32cc4eadbe174077ab2b8f2e207f3ac8781af347ce5f5847e16eb33bf2464b",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-030980",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224030980/0001493152-24-030980.txt",
          "sha256": "64f837a28dceff9bed2e950a10dcf69c7f7a6c90ef3d5a273b5caa240c8cb66b",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001493152-24-033718",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224033718/0001493152-24-033718.txt",
          "sha256": "38e2eb675a320491779ca318f9b6de8ccd286220959eae889b0935feae406c60",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01"
          ],
          "filingDate": "2024-07-19",
          "reportDate": "2024-07-19",
          "accession": "0001493152-24-028548",
          "url": "https://www.sec.gov/Archives/edgar/data/1904286/000149315224028548/0001493152-24-028548.txt",
          "sha256": "b5fc1adee43d750efdf6f52e8237452aed28ca5123844e6cc2dd9f31b3783ec6",
          "quote": "Item 8.01 Other Events MIRA Pharmaceuticals Unveils Additional Preclinical Success MIRA Pharmaceuticals, Inc. (the “Company”) recently received the results of new preclinical testing data for its novel oral ketamine analog, Ketamir-2. Ketamir-2 is under investigation for its potential in treating ne"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:22:20+00:00"
    },
    {
      "securityId": "ref_MOH",
      "ticker": "MOH",
      "cik": "0001179929",
      "issuer": "MOLINA HEALTHCARE, INC.",
      "canonicalId": "tiingo:NYSE:MOH:2003-07-02",
      "week": "2005-07-22",
      "prevWeek": "2005-07-15",
      "prevClose": 32.23,
      "close": 16.55,
      "weeklyRatio": 0.5134967421656842,
      "jumpDay": "2005-07-21",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "TEXT",
      "identity": {
        "before": {
          "accession": "0001193125-05-044725",
          "form": "10-Q",
          "filingDate": "2005-04-29",
          "tradingSymbol": "MOH",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001193125-06-053951",
          "form": "10-Q",
          "filingDate": "2005-08-09",
          "tradingSymbol": "MOH",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NYSE",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001193125-05-044725"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001193125-05-088979",
          "coverDate": "2005-04-28",
          "shares": 27668108,
          "via": "E2_TEXT_COVER"
        },
        "after": {
          "accession": "0001193125-05-162774",
          "coverDate": "2005-07-29",
          "shares": 27747343,
          "via": "E2_TEXT_COVER"
        },
        "ratio": 1.0028637664707685
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2005-04-29",
          "accession": "0001193125-05-088979",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312505088979/d10q.htm",
          "sha256": "056c063ee5d6252fc7712470ae9d35b8611d5a1d6f19905dcb9aebfc7d95323c",
          "via": "E2_TEXT_COVER",
          "quote": "shares 27668108 as of 2005-04-28 | t of 1934). Yes x No ¨ The number of shares of the issuer’s Common Stock, par value $0.001 per share, outstanding as of April 28, 2005, was 27,668,108. Table of Contents MOLIN"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2005-08-09",
          "accession": "0001193125-05-162774",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312505162774/d10q.htm",
          "sha256": "0032560e81854aaa9f6ebcdb7a07469c854df16d9bf6f104f155e24b4c45df02",
          "via": "E2_TEXT_COVER",
          "quote": "shares 27747343 as of 2005-07-29 | ct of 1934). Yes x No ¨ The number of shares of the issuer’s Common Stock, par value $0.001 per share, outstanding as of July 29, 2005, was 27,747,343. Table of Contents MOLINA HEALTHCARE"
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001193125-05-044725",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312505044725/d10k.htm",
          "sha256": "ff0ba4cf51a13055436c33810a35804b39ad443949ebf2c919c17b741e12609f",
          "quote": "uity Securities Our common stock became listed on July 2, 2003 on The New York Stock Exchange, Inc. under the symbol “MOH”. Prior to that time, there was no established public trading market for any class of our common equity. The h"
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001193125-06-053951",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312506053951/d10k.htm",
          "sha256": "ceef7e800ee13f80affb48fe4f9b53391fed4cc3b01f27fabe9662069b973677",
          "quote": "uity Securities Our common stock became listed on July 2, 2003 on The New York Stock Exchange, Inc. under the symbol “MOH”. Prior to that time, there was no established public trading market for any class of our common equity. The h"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-05-162774",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312505162774/d10q.htm",
          "sha256": "0032560e81854aaa9f6ebcdb7a07469c854df16d9bf6f104f155e24b4c45df02",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001193125-05-044725",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000119312505044725/d10k.htm",
          "sha256": "ff0ba4cf51a13055436c33810a35804b39ad443949ebf2c919c17b741e12609f",
          "quote": "NYSE"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001181431-05-027084",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000118143105027084/0001181431-05-027084.txt",
          "sha256": "ff9f892b9832ce35f65ed21b7561a8a8f404f88b9549d48aae4045f3cce4ae64",
          "quote": "items 7.01,8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2005-07-20",
          "reportDate": "2005-07-20",
          "accession": "0001181431-05-041255",
          "url": "https://www.sec.gov/Archives/edgar/data/1179929/000118143105041255/0001181431-05-041255.txt",
          "sha256": "876900a53ef544f0c4badc536d9bea1fd110b4790a5b459893a1eb40fd9bc36b",
          "quote": "Item 2.02. Results of Operations and Financial Condition On July 20, 2005, Molina Healthcare, Inc. issued a press release announcing its preliminary financial results for the second quarter ended June 30, 2005, and also announcing revised guidance for fiscal year 2005. The full text of the press rel"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:23:09+00:00"
    },
    {
      "securityId": "ref_MVST",
      "ticker": "MVST",
      "cik": "0001760689",
      "issuer": "Microvast Holdings, Inc.",
      "canonicalId": "tiingo:NASDAQ:MVST:2019-03-27",
      "week": "2024-11-15",
      "prevWeek": "2024-11-08",
      "prevClose": 0.1783,
      "close": 0.7184,
      "weeklyRatio": 4.029164329781268,
      "jumpDay": "2024-11-13",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001760689-24-000046",
          "form": "10-Q",
          "filingDate": "2024-11-12",
          "tradingSymbol": "MVST",
          "tagged": [
            "MVST",
            "MVSTW"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001760689-25-000010",
          "form": "10-K",
          "filingDate": "2025-03-31",
          "tradingSymbol": "MVST",
          "tagged": [
            "MVST",
            "MVSTW"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001760689-24-000046",
          "coverDate": "2024-11-08",
          "shares": 323815298,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001760689-25-000010",
          "coverDate": "2025-03-24",
          "shares": 325209085,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0043042654519676
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2024-11-12",
          "accession": "0001760689-24-000046",
          "url": "https://www.sec.gov/Archives/edgar/data/1760689/000176068924000046/mvst-20240930_htm.xml",
          "sha256": "54b7f67c32943c8d9ac06ba685fa346aedef41525fc139c6f32ad5f84fe2d304",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MVST\",\"MVSTW\"]; dei:EntityCommonStockSharesOutstanding 323815298 as of 2024-11-08; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2025-03-31",
          "accession": "0001760689-25-000010",
          "url": "https://www.sec.gov/Archives/edgar/data/1760689/000176068925000010/mvst-20241231_htm.xml",
          "sha256": "f8df0827b57a54626cc0c8ed0449795117511114b4037fdbae82c0be6cfa8223",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"MVST\",\"MVSTW\"]; dei:EntityCommonStockSharesOutstanding 325209085 as of 2025-03-24; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001760689-25-000010",
          "url": "https://www.sec.gov/Archives/edgar/data/1760689/000176068925000010/mvst-20241231.htm",
          "sha256": "29f9ee68c7e8dea4b1739259871a7ba114aca6b3db1539b228ce768a59cc8fcc",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000947871-24-000777",
          "url": "https://www.sec.gov/Archives/edgar/data/1760689/000094787124000777/0000947871-24-000777.txt",
          "sha256": "6130cbfe3a891a69d5e498a8cf91f0dd8d62d7ef7c872e16628a025ff36981e8",
          "quote": "items 3.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2024-11-12",
          "reportDate": "2024-11-12",
          "accession": "0001760689-24-000049",
          "url": "https://www.sec.gov/Archives/edgar/data/1760689/000176068924000049/0001760689-24-000049.txt",
          "sha256": "19747c24b822aad614be999e24a3bcf50db3ced58644859f2cc7c43eb0e75e39",
          "quote": "Item 2.02 Results of Operations and Financial Condition. On November 12, 2024, Microvast Holdings, Inc. (the “Company”) issued a press release announcing its unaudited condensed consolidated financial results for the period ended September 30, 2024. In addition, the Company posted an accompanying sl"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:24:49+00:00"
    },
    {
      "securityId": "ref_NSIT",
      "ticker": "NSIT",
      "cik": "0000932696",
      "issuer": "INSIGHT ENTERPRISES INC",
      "canonicalId": "tiingo:NASDAQ:NSIT:1995-01-25",
      "week": "2009-02-13",
      "prevWeek": "2009-02-06",
      "prevClose": 5.9,
      "close": 2.97,
      "weeklyRatio": 0.5033898305084746,
      "jumpDay": "2009-02-10",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "TEXT",
      "identity": {
        "before": {
          "accession": "0001362310-08-001149",
          "form": "10-Q",
          "filingDate": "2008-11-07",
          "tradingSymbol": "NSIT",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001362310-09-007124",
          "form": "10-K",
          "filingDate": "2009-05-12",
          "tradingSymbol": "NSIT",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001362310-09-007124"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001362310-08-006849",
          "coverDate": "2008-11-03",
          "shares": 45584578,
          "via": "E2_TEXT_COVER"
        },
        "after": {
          "accession": "0001362310-09-007124",
          "coverDate": "2009-04-30",
          "shares": 45846171,
          "via": "E2_TEXT_COVER"
        },
        "ratio": 1.0057386294110258
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 3,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2008-11-07",
          "accession": "0001362310-08-006849",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231008006849/c76760e10vq.htm",
          "sha256": "6b3ab5bf2a2d864ff929a231316acbaf372f0b8b42acda88d8fd7d81aabba442",
          "via": "E2_TEXT_COVER",
          "quote": "shares 45584578 as of 2008-11-03 | ned in Rule 12b-2 of the Exchange Act). Yes o No þ The number of shares outstanding of the issuer’s common stock as of November 3, 2008 was 45,584,578. INSIGHT ENTERPRISES, INC. QUARTERLY REPORT ON FORM 10-Q Three Months Ended September 30, 2008 TABLE OF CONTENTS P"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2009-05-12",
          "accession": "0001362310-09-007124",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231009007124/c85057e10vk.htm",
          "sha256": "1ca348d607577b56277f2df0a3992cd3938c7f72d3fb58b83670e70e9afd9fd4",
          "via": "E2_TEXT_COVER",
          "quote": "shares 45846171 as of 2009-04-30 |  completed second fiscal quarter, was $527,456,717. The number of shares outstanding of the registrant’s common stock on April 30, 2009 was 45,846,171. INSIGHT ENTERPRISES, INC. ANNUAL REPORT ON FORM 10-K Year Ended December 31, 2008 TABLE OF CONTENTS Page PART I I"
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001362310-08-001149",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231008001149/c72541e10vk.htm",
          "sha256": "afd131ab59049c724545871142807f0650a3ac7d2f4b79cb9535506bdf7014c8",
          "quote": "holder Matters and Issuer Purchases of Equity Securities Market Information Our common stock trades under the symbol “NSIT” on the Nasdaq Global Select Market. The following table shows, for the calendar quarters indicated, the high "
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001362310-09-007124",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231009007124/c85057e10vk.htm",
          "sha256": "1ca348d607577b56277f2df0a3992cd3938c7f72d3fb58b83670e70e9afd9fd4",
          "quote": "holder Matters and Issuer Purchases of Equity Securities Market Information Our common stock trades under the symbol “NSIT” on The Nasdaq Global Select Market. The following table shows, for the calendar quarters indicated, the high "
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001362310-09-007124",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231009007124/c85057e10vk.htm",
          "sha256": "1ca348d607577b56277f2df0a3992cd3938c7f72d3fb58b83670e70e9afd9fd4",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001362310-09-007124",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000136231009007124/c85057e10vk.htm",
          "sha256": "1ca348d607577b56277f2df0a3992cd3938c7f72d3fb58b83670e70e9afd9fd4",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001299933-08-005364",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000129993308005364/0001299933-08-005364.txt",
          "sha256": "42b08f053417ef276e5c8b54d2ec48df0e09abc92f4fcd0d9387a8472b623145",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001299933-09-001033",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000129993309001033/0001299933-09-001033.txt",
          "sha256": "a30c0bd4b00a8e180b676db506704f06ff42300c95ec99d3e6c12270610462a0",
          "quote": "items 3.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001299933-09-001315",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000129993309001315/0001299933-09-001315.txt",
          "sha256": "03f10d2a3b9eb74e2e2358156f22e84498605cf01bf8aea6ecb3d7ab0115b53d",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "4.02",
            "9.01"
          ],
          "filingDate": "2009-02-10",
          "reportDate": "2009-02-06",
          "accession": "0001299933-09-000672",
          "url": "https://www.sec.gov/Archives/edgar/data/932696/000129993309000672/0001299933-09-000672.txt",
          "sha256": "92ea9ebcf1be0f060aceebeafd2dca4cfdc433be4c48292cd3efd4c4fe6521df",
          "quote": "Item 4.02 Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review. (a) On February 9, 2009, the Company issued a press release announcing that its management had discovered errors in the Company's historical accounting treatment since 1996 of cert"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:27:59+00:00"
    },
    {
      "securityId": "ref_NTLA",
      "ticker": "NTLA",
      "cik": "0001652130",
      "issuer": "Intellia Therapeutics, Inc.",
      "canonicalId": "tiingo:NASDAQ:NTLA:2016-05-06",
      "week": "2025-10-31",
      "prevWeek": "2025-10-24",
      "prevClose": 25.6,
      "close": 12.62,
      "weeklyRatio": 0.49296874999999996,
      "jumpDay": "2025-10-27",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000950170-25-104987",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "tradingSymbol": "NTLA",
          "tagged": [
            "NTLA"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001193125-25-269680",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "tradingSymbol": "NTLA",
          "tagged": [
            "NTLA"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000950170-25-104987",
          "coverDate": "2025-07-31",
          "shares": 107346886,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001193125-25-269680",
          "coverDate": "2025-10-31",
          "shares": 115829926,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0790245559615022
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "accession": "0000950170-25-104987",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000095017025104987/ntla-20250630_htm.xml",
          "sha256": "0ce2f4835ac81df2114ed15bb38d8657f210543bea7b961616f2c8c2ab795a3e",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"NTLA\"]; dei:EntityCommonStockSharesOutstanding 107346886 as of 2025-07-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "accession": "0001193125-25-269680",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525269680/ntla-20250930_htm.xml",
          "sha256": "034a71139a814c28e318f78bf13aee206f437a1ef76c536d160c828e746b9c59",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"NTLA\"]; dei:EntityCommonStockSharesOutstanding 115829926 as of 2025-10-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-25-269680",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525269680/ntla-20250930.htm",
          "sha256": "4bd4954acfe866be2dd4da930f379e5f64ac7059b365779465a27b178fcab159",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-25-217484",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525217484/0001193125-25-217484.txt",
          "sha256": "4149d3b8bf9ae7889ded379fefc8b6ddc14de9411820b4e4d85701486ac482fd",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-25-250757",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525250757/0001193125-25-250757.txt",
          "sha256": "a14ad70b0999591055f6dcb7bb6cbf5a86d412cdf6e0407aea48fb5a684d2e68",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-25-256378",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525256378/0001193125-25-256378.txt",
          "sha256": "0ad0fe53a6128658936fb41a221f1bb28ceaf2099bcc891e98d29b00ad6bb05d",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-25-274596",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525274596/0001193125-25-274596.txt",
          "sha256": "11b4e984ffde1dfb18ba5c2679d2495989e9fe4c86e3fc14dcecc43946caddef",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "7.01",
            "8.01",
            "9.01"
          ],
          "filingDate": "2025-10-27",
          "reportDate": "2025-10-27",
          "accession": "0001193125-25-250757",
          "url": "https://www.sec.gov/Archives/edgar/data/1652130/000119312525250757/0001193125-25-250757.txt",
          "sha256": "a14ad70b0999591055f6dcb7bb6cbf5a86d412cdf6e0407aea48fb5a684d2e68",
          "quote": "Item 7.01 Regulation FD Disclosure. On October 27, 2025, Intellia Therapeutics, Inc. (the “Company or “Intellia”) issued a press release titled “Intellia Therapeutics Provides Update on MAGNITUDE Clinical Trials of Nexiguran Ziclumeran (nex-z).” A copy of the press release is furnished as Exhibit 99"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:28:28+00:00"
    },
    {
      "securityId": "ref_OM",
      "ticker": "OM",
      "cik": "0001484612",
      "issuer": "Outset Medical, Inc.",
      "canonicalId": "tiingo:NASDAQ:OM:2020-09-15",
      "week": "2023-10-13",
      "prevWeek": "2023-10-06",
      "prevClose": 150.15,
      "close": 50.85,
      "weeklyRatio": 0.3386613386613387,
      "jumpDay": "2023-10-13",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000950170-23-037387",
          "form": "10-Q",
          "filingDate": "2023-08-03",
          "tradingSymbol": "OM",
          "tagged": [
            "OM"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0000950170-23-060476",
          "form": "10-Q",
          "filingDate": "2023-11-08",
          "tradingSymbol": "OM",
          "tagged": [
            "OM"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000950170-23-037387",
          "coverDate": "2023-07-26",
          "shares": 49790212,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0000950170-23-060476",
          "coverDate": "2023-11-02",
          "shares": 50204570,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0083220774396382
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 0,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2023-08-03",
          "accession": "0000950170-23-037387",
          "url": "https://www.sec.gov/Archives/edgar/data/1484612/000095017023037387/om-20230630_htm.xml",
          "sha256": "ecdfc141af27e0a8d6cc93c8225ed1e5e82d6bd1b2d45ac808e5ad1f5631dac5",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"OM\"]; dei:EntityCommonStockSharesOutstanding 49790212 as of 2023-07-26; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2023-11-08",
          "accession": "0000950170-23-060476",
          "url": "https://www.sec.gov/Archives/edgar/data/1484612/000095017023060476/om-20230930_htm.xml",
          "sha256": "6574565a48d50bd7ba6f304ec44e0f5aa8065817790f0cccb05f7554c564880a",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"OM\"]; dei:EntityCommonStockSharesOutstanding 50204570 as of 2023-11-02; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0000950170-23-060476",
          "url": "https://www.sec.gov/Archives/edgar/data/1484612/000095017023060476/om-20230930.htm",
          "sha256": "92ebadc2f1fc04642a9b3de35155d12e04fd88f3ca04a706ebfac02fabe4b953",
          "quote": ""
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2023-10-12",
          "reportDate": "2023-10-12",
          "accession": "0000950170-23-053108",
          "url": "https://www.sec.gov/Archives/edgar/data/1484612/000095017023053108/0000950170-23-053108.txt",
          "sha256": "729a428bf1f117cef844b7fb8d6ec68ddb479ef6c9ff856efa974514ff2dbb4f",
          "quote": "Item 2.02 Result of Operations and Financial Condition. On October 12, 2023, Outset Medical, Inc. (the “ Company ”) issued a press release announcing expected revenue and gross margin for the third quarter ended September 30, 2023, as well as updated financial guidance for 2023 revenue. A copy of th"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:31:44+00:00"
    },
    {
      "securityId": "ref_PACB",
      "ticker": "PACB",
      "cik": "0001299130",
      "issuer": "PACIFIC BIOSCIENCES OF CALIFORNIA, INC.",
      "canonicalId": "tiingo:NASDAQ:PACB:2010-10-27",
      "week": "2024-04-19",
      "prevWeek": "2024-04-12",
      "prevClose": 3.17,
      "close": 1.55,
      "weeklyRatio": 0.4889589905362776,
      "jumpDay": "2024-04-16",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001299130-24-000054",
          "form": "10-K",
          "filingDate": "2024-02-28",
          "tradingSymbol": "PACB",
          "tagged": [
            "PACB"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001299130-24-000111",
          "form": "10-Q",
          "filingDate": "2024-05-09",
          "tradingSymbol": "PACB",
          "tagged": [
            "PACB"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001299130-24-000054",
          "coverDate": "2024-01-31",
          "shares": 267951880,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001299130-24-000111",
          "coverDate": "2024-04-30",
          "shares": 272355892,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.016435831687391
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2024-02-28",
          "accession": "0001299130-24-000054",
          "url": "https://www.sec.gov/Archives/edgar/data/1299130/000129913024000054/pacb-20231231_htm.xml",
          "sha256": "5ee27a31190a0ddb6a7ad800789f8c733de5ff6b4ccdb27c930d571c040010a0",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"PACB\"]; dei:EntityCommonStockSharesOutstanding 267951880 as of 2024-01-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2024-05-09",
          "accession": "0001299130-24-000111",
          "url": "https://www.sec.gov/Archives/edgar/data/1299130/000129913024000111/pacb-20240331_htm.xml",
          "sha256": "9635296f8ddcddd31670f4bc1841c38e0524b0d60e14ae3f05a5fd7ecabab253",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"PACB\"]; dei:EntityCommonStockSharesOutstanding 272355892 as of 2024-04-30; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001299130-24-000111",
          "url": "https://www.sec.gov/Archives/edgar/data/1299130/000129913024000111/pacb-20240331.htm",
          "sha256": "4b4e5a65aa287e121f1429d0ca1592d190e2666dea26d8bca973f5a132e38754",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-24-047511",
          "url": "https://www.sec.gov/Archives/edgar/data/1299130/000110465924047511/0001104659-24-047511.txt",
          "sha256": "f1f425fe5e3e5e4e92c216e6c183563a53ca105f1d05af93d0d88aebec183d14",
          "quote": "items 2.02,2.05,8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "2.05",
            "8.01",
            "9.01"
          ],
          "filingDate": "2024-04-16",
          "reportDate": "2024-04-16",
          "accession": "0001104659-24-047511",
          "url": "https://www.sec.gov/Archives/edgar/data/1299130/000110465924047511/0001104659-24-047511.txt",
          "sha256": "f1f425fe5e3e5e4e92c216e6c183563a53ca105f1d05af93d0d88aebec183d14",
          "quote": "ITEM 2.02. RESULTS OF OPERATIONS AND FINANCIAL CONDITION. On April 16, 2024, Pacific Biosciences of California, Inc. (the “Company”) issued a press release providing a business update and announcing certain unaudited preliminary financial results as of and for the quarter ended March 31, 2024 (the “"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:33:16+00:00"
    },
    {
      "securityId": "ref_PBYI",
      "ticker": "PBYI",
      "cik": "0001401667",
      "issuer": "PUMA BIOTECHNOLOGY, INC.",
      "canonicalId": "tiingo:NASDAQ:PBYI:2012-04-24",
      "week": "2018-11-02",
      "prevWeek": "2018-10-26",
      "prevClose": 40.39,
      "close": 20.07,
      "weeklyRatio": 0.49690517454815547,
      "jumpDay": "2018-11-02",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001564590-18-026644",
          "form": "10-Q",
          "filingDate": "2018-11-05",
          "tradingSymbol": "PBYI",
          "tagged": [
            "PBYI"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001564590-19-005830",
          "form": "10-K",
          "filingDate": "2019-03-01",
          "tradingSymbol": "PBYI",
          "tagged": [
            "PBYI"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001564590-19-005830"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001564590-18-026644",
          "coverDate": "2018-10-26",
          "shares": 38134994,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001564590-19-005830",
          "coverDate": "2019-02-15",
          "shares": 38497981,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0095184753405233
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 2,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2018-11-05",
          "accession": "0001564590-18-026644",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000156459018026644/pbyi-20180930.xml",
          "sha256": "964f6814348f485c5b2eb1112ee4c952397abc3957ceae7e1d9cb3a02a91a448",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"PBYI\"]; dei:EntityCommonStockSharesOutstanding 38134994 as of 2018-10-26"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-K",
          "filingDate": "2019-03-01",
          "accession": "0001564590-19-005830",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000156459019005830/pbyi-20181231.xml",
          "sha256": "db33c34e4c822433c64d976c67ebf02a844229108333921d60f96f76a1f3d550",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"PBYI\"]; dei:EntityCommonStockSharesOutstanding 38497981 as of 2019-02-15"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001564590-19-005830",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000156459019005830/pbyi-10k_20181231.htm",
          "sha256": "741b61612f290c57f7b44c08db6650287d638f35999b61ed04910bb7f4e605b9",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001564590-19-005830",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000156459019005830/pbyi-10k_20181231.htm",
          "sha256": "741b61612f290c57f7b44c08db6650287d638f35999b61ed04910bb7f4e605b9",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-18-329510",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000119312518329510/0001193125-18-329510.txt",
          "sha256": "a2f0acb6cc20fc66e7f01db5ce90d1e063394e0f3f15ca0e1942378812a7dd45",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-18-351272",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000119312518351272/0001193125-18-351272.txt",
          "sha256": "0dfd79c951fffe60f63435460b487cb365fc863334d5e2c9f8377c41d7195c11",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2018-11-01",
          "reportDate": "2018-11-01",
          "accession": "0001193125-18-315715",
          "url": "https://www.sec.gov/Archives/edgar/data/1401667/000119312518315715/0001193125-18-315715.txt",
          "sha256": "90433d3865981523666fde9bb752774d55966f41f47581549095699b5775644c",
          "quote": "Item 2.02 Results of Operations and Financial Condition. On November 1, 2018, Puma Biotechnology, Inc. issued a press release announcing its financial results for the quarter ended September 30, 2018. A copy of the press release is furnished herewith as Exhibit 99.1 and is incorporated by reference "
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:33:59+00:00"
    },
    {
      "securityId": "ref_RDN",
      "ticker": "RDN",
      "cik": "0000890926",
      "issuer": "RADIAN GROUP INC",
      "canonicalId": "tiingo:NYSE:RDN:1992-10-30",
      "week": "2009-08-07",
      "prevWeek": "2009-07-31",
      "prevClose": 3.33,
      "close": 6.83,
      "weeklyRatio": 2.051051051051051,
      "jumpDay": "2009-08-05",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "TEXT",
      "identity": {
        "before": {
          "accession": "0001193125-09-048930",
          "form": "10-Q",
          "filingDate": "2009-05-11",
          "tradingSymbol": "RDN",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "after": {
          "accession": "0001193125-10-046168",
          "form": "10-Q",
          "filingDate": "2009-11-09",
          "tradingSymbol": "RDN",
          "tagged": [],
          "via": "E1_TEXT"
        },
        "exchange": "NYSE",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001193125-09-048930"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001193125-09-107357",
          "coverDate": "2009-05-04",
          "shares": 81901186,
          "via": "E2_TEXT_COVER"
        },
        "after": {
          "accession": "0001193125-09-229548",
          "coverDate": "2009-11-02",
          "shares": 82775605,
          "via": "E2_TEXT_COVER"
        },
        "ratio": 1.0106765120593004
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 1,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2009-05-11",
          "accession": "0001193125-09-107357",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509107357/d10q.htm",
          "sha256": "703ce723821ba37da934292f1437b0fd098058119b655ab3447b0ac16c8f70df",
          "via": "E2_TEXT_COVER",
          "quote": "shares 81901186 as of 2009-05-04 | latest practicable date: 81,901,186 shares of common stock, $0.001 par value per share, outstanding on May 4, 2009. Table of Contents Radian Group Inc. INDEX Page Number Forwa"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2009-11-09",
          "accession": "0001193125-09-229548",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509229548/d10q.htm",
          "sha256": "3ccff73bee9a81fd340ed0f33e9701c25ff7c57d142fcf4bfa12014fb6bb21a6",
          "via": "E2_TEXT_COVER",
          "quote": "shares 82775605 as of 2009-11-02 | latest practicable date: 82,775,605 shares of common stock, $0.001 par value per share, outstanding on November 2, 2009. Table of Contents Radian Group Inc. INDEX Page Number "
        },
        {
          "role": "IDENTITY_TEXT_BEFORE",
          "accession": "0001193125-09-048930",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509048930/d10k.htm",
          "sha256": "9fb1a2b8c2f1c56b49c79c39571bfd12c3a9440d6682703c3e0b7d2e9f1f5a06",
          "quote": " Purchases of Equity Securities. Our common stock is listed on the New York Stock Exchange (“NYSE”) under the symbol “RDN.” At March 4, 2009, there were 81,420,871 shares outstanding and approximately 89 holders of record. The foll"
        },
        {
          "role": "IDENTITY_TEXT_AFTER",
          "accession": "0001193125-10-046168",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312510046168/d10k.htm",
          "sha256": "3c66339618a1d55536b113537b35e74d013d24db84b342fedf22090978d7eca0",
          "quote": " Purchases of Equity Securities. Our common stock is listed on the New York Stock Exchange (“NYSE”) under the symbol “RDN.” At February 25, 2010, there were 82,936,146 shares outstanding and approximately 87 holders of record. The "
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-09-229548",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509229548/d10q.htm",
          "sha256": "3ccff73bee9a81fd340ed0f33e9701c25ff7c57d142fcf4bfa12014fb6bb21a6",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001193125-09-048930",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509048930/d10k.htm",
          "sha256": "9fb1a2b8c2f1c56b49c79c39571bfd12c3a9440d6682703c3e0b7d2e9f1f5a06",
          "quote": "NYSE"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-09-114962",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509114962/0001193125-09-114962.txt",
          "sha256": "8b7c3f979e32068525cb0f4caee1d2d92804b2d43588ffb47fb59921aa143275",
          "quote": "items 5.02,8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "2.02",
            "9.01"
          ],
          "filingDate": "2009-08-05",
          "reportDate": "2009-08-05",
          "accession": "0001193125-09-164703",
          "url": "https://www.sec.gov/Archives/edgar/data/890926/000119312509164703/0001193125-09-164703.txt",
          "sha256": "4367db180ecbf18f8e87e181b8f669947279aabc4c2ca063a0af03dad484005a",
          "quote": "Item 2.02. Results of Operations and Financial Condition. On August 5, 2009, Radian Group Inc. issued a news release announcing its financial results for the quarter ended June 30, 2009. A copy of this news release is furnished as Exhibit 99.1 to this report. The information included in, or furnishe"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:38:35+00:00"
    },
    {
      "securityId": "ref_REPL",
      "ticker": "REPL",
      "cik": "0001737953",
      "issuer": "Replimune Group, Inc.",
      "canonicalId": "tiingo:NASDAQ:REPL:2018-07-20",
      "week": "2025-10-24",
      "prevWeek": "2025-10-17",
      "prevClose": 4.5,
      "close": 8.8,
      "weeklyRatio": 1.9555555555555557,
      "jumpDay": "2025-10-20",
      "providerReason": "SINGLE_DAY_SPLIT_SIZED_JUMP",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001737953-25-000013",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "tradingSymbol": "REPL",
          "tagged": [
            "REPL"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001628280-25-049884",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "tradingSymbol": "REPL",
          "tagged": [
            "REPL"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001737953-25-000013",
          "coverDate": "2025-08-04",
          "shares": 78055846,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001628280-25-049884",
          "coverDate": "2025-11-03",
          "shares": 78443334,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.0049642406028114
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2025-08-07",
          "accession": "0001737953-25-000013",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000173795325000013/repl-20250630_htm.xml",
          "sha256": "c12f270b53c91641b04c391517eb438544bcbb5d22c9df83c2f2388b7603863c",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"REPL\"]; dei:EntityCommonStockSharesOutstanding 78055846 as of 2025-08-04; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2025-11-06",
          "accession": "0001628280-25-049884",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000162828025049884/repl-20250930_htm.xml",
          "sha256": "0f3f046ec4902b5b06f6588a3921247c552a224adfb661d4aed7a77625bce5b5",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"REPL\"]; dei:EntityCommonStockSharesOutstanding 78443334 as of 2025-11-03; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001628280-25-049884",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000162828025049884/repl-20250930.htm",
          "sha256": "56fe905925268e13fa2e91ae2ad0f85e02e07595d9b4bd366d995d2178f54228",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-25-069489",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000110465925069489/0001104659-25-069489.txt",
          "sha256": "50830ff1e2c895d06b18af41365fceb93d9382eb8e52364e1de865cf8346b93b",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-25-087464",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000110465925087464/0001104659-25-087464.txt",
          "sha256": "ec0e1717fcf996a5eef34f9c7c656f4457976546dd962fc00910bf58cb08d791",
          "quote": "items 5.07,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-25-091066",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000110465925091066/0001104659-25-091066.txt",
          "sha256": "ff398984b8ec6b757bb722be7f66421caf5b382794736d6faf04242e0394d81c",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001104659-25-100605",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000110465925100605/0001104659-25-100605.txt",
          "sha256": "11f48dd85813cedc77d5df6c319b4c6a42afd7186c4e67b76d11263774f0320a",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01",
            "9.01"
          ],
          "filingDate": "2025-10-20",
          "reportDate": "2025-10-20",
          "accession": "0001104659-25-100605",
          "url": "https://www.sec.gov/Archives/edgar/data/1737953/000110465925100605/0001104659-25-100605.txt",
          "sha256": "11f48dd85813cedc77d5df6c319b4c6a42afd7186c4e67b76d11263774f0320a",
          "quote": "Item 8.01 Other Events . On October 20, 2025, Replimune Group, Inc. (the “Company”) issued a news release announcing that the U.S. Food and Drug Administration (the “FDA”) accepted the Company’s resubmission of the Biologics License Application for RP1 in combination with nivolumab for patients with"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:38:56+00:00"
    },
    {
      "securityId": "ref_SRPT",
      "ticker": "SRPT",
      "cik": "0000873303",
      "issuer": "Sarepta Therapeutics, Inc.",
      "canonicalId": "tiingo:NASDAQ:SRPT:1997-06-04",
      "week": "2016-09-23",
      "prevWeek": "2016-09-16",
      "prevClose": 28.15,
      "close": 57.83,
      "weeklyRatio": 2.0543516873889875,
      "jumpDay": "2016-09-19",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001564590-16-023663",
          "form": "10-Q",
          "filingDate": "2016-08-09",
          "tradingSymbol": "SRPT",
          "tagged": [
            "SRPT"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001564590-16-027821",
          "form": "10-Q",
          "filingDate": "2016-11-07",
          "tradingSymbol": "SRPT",
          "tagged": [
            "SRPT"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "10-K cover text",
          "accession": "0001564590-17-002842"
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001564590-16-023663",
          "coverDate": "2016-08-03",
          "shares": 47899532,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001564590-16-027821",
          "coverDate": "2016-11-03",
          "shares": 54590380,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.1396850390939102
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 4,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-Q",
          "filingDate": "2016-08-09",
          "accession": "0001564590-16-023663",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000156459016023663/srpt-20160630.xml",
          "sha256": "2e10d89266f151c3788e82dfab28ff52276a38fb56ac4a4d056906bd6b97c153",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"SRPT\"]; dei:EntityCommonStockSharesOutstanding 47899532 as of 2016-08-03"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2016-11-07",
          "accession": "0001564590-16-027821",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000156459016027821/srpt-20160930.xml",
          "sha256": "ad952d1a37e351d17606e6dc1d93f6960aecd400c9be49566558cd4db6ffb649",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"SRPT\"]; dei:EntityCommonStockSharesOutstanding 54590380 as of 2016-11-03"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001564590-16-027821",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000156459016027821/srpt-10q_20160930.htm",
          "sha256": "2cdfa7748ad09f140478a46582cc6493c07ceab926128171c5ebda9ba725586b",
          "quote": ""
        },
        {
          "role": "EXCHANGE_10K_COVER",
          "accession": "0001564590-17-002842",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000156459017002842/srpt-10k_20161231.htm",
          "sha256": "4a55ddd95e798551f15c611b93f71549a936e752031d127cc8e8fcfe4cc93cc8",
          "quote": "NASDAQ"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-713139",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000119312516713139/0001193125-16-713139.txt",
          "sha256": "89a846edcfd146e1bef2a4443bdcb3ac57e0ae036d51195b1288c016c35926c5",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-714964",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000119312516714964/0001193125-16-714964.txt",
          "sha256": "d33717d9f3145787e41e1755b54370697d980d446cf94bc21b5edd2dcfe1a430",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-718579",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000119312516718579/0001193125-16-718579.txt",
          "sha256": "ccc67104deb7f69864ff09fea385b2acfb965debba4db213d5650617812f1bd3",
          "quote": "items 1.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-16-727567",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000119312516727567/0001193125-16-727567.txt",
          "sha256": "476ed3a8d429f9959bbca44e7529cc2104cea42e3f6882fa15d99544f471935f",
          "quote": "items 8.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01",
            "9.01"
          ],
          "filingDate": "2016-09-19",
          "reportDate": "2016-09-19",
          "accession": "0001193125-16-713139",
          "url": "https://www.sec.gov/Archives/edgar/data/873303/000119312516713139/0001193125-16-713139.txt",
          "sha256": "89a846edcfd146e1bef2a4443bdcb3ac57e0ae036d51195b1288c016c35926c5",
          "quote": "Item 8.01 Other Events. On September 19, 2016, Sarepta Therapeutics, Inc. (the “Company”) announced that the United States Food and Drug Administration has provided accelerated approval of Exondys 51 TM (eteplirsen) Injection for the treatment of Duchenne Muscular Dystrophy amenable to skipping of e"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:46:37+00:00"
    },
    {
      "securityId": "ref_SSRM",
      "ticker": "SSRM",
      "cik": "0000921638",
      "issuer": "SSR MINING INC.",
      "canonicalId": "tiingo:NASDAQ:SSRM:1996-08-01",
      "week": "2024-02-16",
      "prevWeek": "2024-02-09",
      "prevClose": 9.55,
      "close": 4.91,
      "weeklyRatio": 0.5141361256544502,
      "jumpDay": "2024-02-13",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0000921638-24-000047",
          "form": "10-K",
          "filingDate": "2024-02-27",
          "tradingSymbol": "SSRM",
          "tagged": [
            "SSRM"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0000921638-24-000115",
          "form": "10-Q",
          "filingDate": "2024-05-08",
          "tradingSymbol": "SSRM",
          "tagged": [
            "SSRM"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0000921638-24-000047",
          "coverDate": "2024-01-31",
          "shares": 202463697,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0000921638-24-000115",
          "coverDate": "2024-03-31",
          "shares": 202089818,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 0.9981533528946673
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 6,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2024-02-27",
          "accession": "0000921638-24-000047",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000047/ssrm-20231231_htm.xml",
          "sha256": "a577aeab11c0f77ea5d8f8a0ad204f1d607ff6a5313598a33c8874839b3a6f31",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"SSRM\"]; dei:EntityCommonStockSharesOutstanding 202463697 as of 2024-01-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2024-05-08",
          "accession": "0000921638-24-000115",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000115/ssrm-20240331_htm.xml",
          "sha256": "db3a0fe976d0c661fb1b6e91259474ddbc24b44c76cc2aca3ee3c196cc904fd2",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"SSRM\"]; dei:EntityCommonStockSharesOutstanding 202089818 as of 2024-03-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000115",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000115/ssrm-20240331.htm",
          "sha256": "a19b6065c35ac04abac3edcc60f80d3cdb9599615c3a4ec741ffc64a325ac411",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000035",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000035/0000921638-24-000035.txt",
          "sha256": "f244eb38602c75818e74d66fe74f7b09dade1de6eb1b97d8522eedbcb7b446da",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000947871-24-000126",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000094787124000126/0000947871-24-000126.txt",
          "sha256": "def87c5716e55a33458accef3a6540bb4afd64c778d7829d635af32de6e1059c",
          "quote": "items 2.02,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000037",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000037/0000921638-24-000037.txt",
          "sha256": "65bbdd9443436d4860b3fb54c9e04bb474e4b03cdd05483b487e6ff8e661334b",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000039",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000039/0000921638-24-000039.txt",
          "sha256": "95601e9b2105285d91de9c0f4a94a13ce07d194451cf33bafd7911f126fe855d",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000041",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000041/0000921638-24-000041.txt",
          "sha256": "708eadf045c881f25221c0c6bc8fdfeb3f52ea54d210ef1fe211f408e90fe687",
          "quote": "items 8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0000921638-24-000051",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000051/0000921638-24-000051.txt",
          "sha256": "af969bf91df2a87c573be1e06364abdc200efbd563ad9e7b3aaa2f79e6c7fa81",
          "quote": "items 5.02,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "8.01",
            "9.01"
          ],
          "filingDate": "2024-02-13",
          "reportDate": "2024-02-13",
          "accession": "0000921638-24-000035",
          "url": "https://www.sec.gov/Archives/edgar/data/921638/000092163824000035/0000921638-24-000035.txt",
          "sha256": "f244eb38602c75818e74d66fe74f7b09dade1de6eb1b97d8522eedbcb7b446da",
          "quote": "ITEM 8.01. Other Events On February 13, 2024, SSR Mining Inc., a British Columbia corporation (the “Company”), issued a news release announcing the suspension of operations at Çöpler. A copy of the news release is furnished as Exhibit 99.1 to this report. ITEM 9.01. FINANCIAL STATEMENTS AND EXHIBITS"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:47:38+00:00"
    },
    {
      "securityId": "ref_VRRM",
      "ticker": "VRRM",
      "cik": "0001682745",
      "issuer": "VERRA MOBILITY Corp",
      "canonicalId": "tiingo:NASDAQ:VRRM:2017-03-24",
      "week": "2026-05-29",
      "prevWeek": "2026-05-22",
      "prevClose": 13.49,
      "close": 4.51,
      "weeklyRatio": 0.3343217197924388,
      "jumpDay": "2026-05-27",
      "providerReason": "SINGLE_DAY_DOMINATES_WEEK",
      "class": "GENUINE_MOVE",
      "returnBasis": "PRICE_RETURN",
      "era": "XBRL",
      "identity": {
        "before": {
          "accession": "0001193125-26-067293",
          "form": "10-K",
          "filingDate": "2026-02-24",
          "tradingSymbol": "VRRM",
          "tagged": [
            "VRRM"
          ],
          "via": "dei:TradingSymbol"
        },
        "after": {
          "accession": "0001193125-26-335490",
          "form": "10-Q",
          "filingDate": "2026-08-05",
          "tradingSymbol": "VRRM",
          "tagged": [
            "VRRM"
          ],
          "via": "dei:TradingSymbol"
        },
        "exchange": "NASDAQ",
        "exchangeEvidence": {
          "via": "dei:SecurityExchangeName",
          "values": [
            "NASDAQ"
          ]
        }
      },
      "shareContinuity": {
        "before": {
          "accession": "0001193125-26-067293",
          "coverDate": "2026-02-28",
          "shares": 151361959,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "after": {
          "accession": "0001193125-26-335490",
          "coverDate": "2026-08-31",
          "shares": 151982804,
          "via": "dei:EntityCommonStockSharesOutstanding"
        },
        "ratio": 1.00410172413268
      },
      "splitChecks": {
        "xbrlSplitFactsInWindow": 0,
        "splitWindow8K": 6,
        "periodicTextStrongMatch": false,
        "spikeReversal": false
      },
      "sources": [
        {
          "role": "COVER_BEFORE",
          "form": "10-K",
          "filingDate": "2026-02-24",
          "accession": "0001193125-26-067293",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526067293/vrrm-20251231_htm.xml",
          "sha256": "15b4bc7eb800496f9ddca819baf30d744628f9bf6fb444276575c1ace23f0249",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"VRRM\"]; dei:EntityCommonStockSharesOutstanding 151361959 as of 2026-02-28; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "COVER_AFTER",
          "form": "10-Q",
          "filingDate": "2026-08-05",
          "accession": "0001193125-26-335490",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526335490/vrrm-20260630_htm.xml",
          "sha256": "1996ded2ad4c4e1bbed09661e964a8b2ff9a30c86faebe8ad8936a59c963d921",
          "via": "dei:EntityCommonStockSharesOutstanding",
          "quote": "dei:TradingSymbol [\"VRRM\"]; dei:EntityCommonStockSharesOutstanding 151982804 as of 2026-08-31; dei:SecurityExchangeName [\"NASDAQ\"]"
        },
        {
          "role": "PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE",
          "accession": "0001193125-26-335490",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526335490/vrrm-20260630.htm",
          "sha256": "0b4e47291c82e6cb3e8afa0b2510587bc4ab293f990d8e125dbca36b425eaa36",
          "quote": ""
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-067015",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526067015/0001193125-26-067015.txt",
          "sha256": "95a62e454880111e6a34a6f3bc206bf75dfc79a7f459f9346b24b7b23be2ffc7",
          "quote": "items 2.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-209031",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526209031/0001193125-26-209031.txt",
          "sha256": "c8fbd53c1bd82e5753377b6904a70e60720a8cc9619a4817b4f361443fce8012",
          "quote": "items 2.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-239351",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526239351/0001193125-26-239351.txt",
          "sha256": "ab2f1c7211b22871e8544ca42c96fba5fe6a37bf48b36992fa7f0852e8869b5a",
          "quote": "items 7.01,8.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-251522",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526251522/0001193125-26-251522.txt",
          "sha256": "ba3e6c51e83f17382904b253d1f1eb5848aeaac263799fa727ef363aea7a6e70",
          "quote": "items 5.02,7.01,9.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-260606",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526260606/0001193125-26-260606.txt",
          "sha256": "d7f9bb78190392fdc4bfb28eebbd3c730d71b064c4ce93065ac4063af7d52fc1",
          "quote": "items 8.01"
        },
        {
          "role": "SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE",
          "accession": "0001193125-26-274249",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526274249/0001193125-26-274249.txt",
          "sha256": "c0f2faddd537f1d808e382e6084105e91598ae0f836e2375106e7f8a68f7b4bc",
          "quote": "items 5.02,7.01,9.01"
        },
        {
          "role": "AFFIRMATIVE_8K",
          "items": [
            "7.01",
            "8.01",
            "9.01"
          ],
          "filingDate": "2026-05-26",
          "reportDate": "2026-05-26",
          "accession": "0001193125-26-239351",
          "url": "https://www.sec.gov/Archives/edgar/data/1682745/000119312526239351/0001193125-26-239351.txt",
          "sha256": "ab2f1c7211b22871e8544ca42c96fba5fe6a37bf48b36992fa7f0852e8869b5a",
          "quote": "Item 7.01 Regulation FD Disclosure. On May 26, 2026, Verra Mobility Corporation (the “ Company ”) issued a press release that announced the Company received a termination notice from Avis Budget Group, Inc. (“ Avis Budget ”) regarding Avis Budget’s contract with the Company. The Company also provide"
        }
      ],
      "protocolSha256": "c8cb9ec920d7daf4549d4eb33c28cf0fdfcac2fff88e77136604621c6f7ad795",
      "verifiedAt": "2026-10-28T14:51:59+00:00"
    }
  ]
};
