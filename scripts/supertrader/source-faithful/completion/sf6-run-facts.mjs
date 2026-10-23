/**
 * Supertrader 6.0 – public facts of the snapshot runs (counts and hashes copied from the public run output; the metrics
 * stay sealed with the owner). null = run not yet recorded (the matrix then reports NOT_EVIDENCED).
 * integrity: run-sf6-integrity.mjs 1.1.0. The criteria (sf6-readiness-criteria.mjs) name the policies DQ-K5 / DQ-K3; they
 * are the BOOK treatments (DQ-K5-BOOK primary, DQ-K3-BOOK sensitivity), copied under both names; DQ-K5-PRIOR is reported.
 */
export const SF6_RUN_FACTS = Object.freeze({
 "integrity": {
  "runId": "40001276389",
  "commit": "0592cfbf3512a1a6beb6c1cfd0f1fbe200c64fea",
  "snapshotId": "sts1-134d4d62eb88b6ff8d98fe6e56b12a6d",
  "datasetVerified": "EXACT",
  "integrityCodeSha256": "7ca45bc9d16fec0f34f78bc3087612f04a7da7e86ed007d924ec586e0e3bc3a9",
  "census": {
   "DQ-K5-BOOK": {
    "flags": 1210,
    "securitiesFlagged": 454,
    "piecesAfter": 9739,
    "barsDroppedShortPieces": 4536,
    "barsDroppedShare": 0.0003128279313963381,
    "inResearchUniverseAtPriorSession": 109,
    "volumeBelowPrior20Median": 183,
    "exPostRevertsNextSession": 190,
    "survivorSecuritiesFlagged": 311,
    "byYear": {
     "2015": 115,
     "2016": 35,
     "2017": 121,
     "2018": 207,
     "2019": 121,
     "2020": 103,
     "2021": 72,
     "2022": 75,
     "2023": 60,
     "2024": 81,
     "2025": 104,
     "2026": 116
    },
    "byDirection": {
     "UP": 585,
     "DOWN": 625
    },
    "byKind": {
     "NO_DECLARED_EVENT": 1196,
     "DECLARED_SPLIT_RESIDUAL": 14
    },
    "byPriorRawCloseBand": {
     "1_TO_5": 166,
     "GE_5": 177,
     "LT_1": 867
    }
   },
   "DQ-K5-PRIOR": {
    "flags": 1210,
    "securitiesFlagged": 454,
    "piecesAfter": 9734,
    "barsDroppedShortPieces": 4058,
    "barsDroppedShare": 0.0002798623777791755,
    "inResearchUniverseAtPriorSession": 109,
    "volumeBelowPrior20Median": 183,
    "exPostRevertsNextSession": 190,
    "survivorSecuritiesFlagged": 311,
    "byYear": {
     "2015": 115,
     "2016": 35,
     "2017": 121,
     "2018": 207,
     "2019": 121,
     "2020": 103,
     "2021": 72,
     "2022": 75,
     "2023": 60,
     "2024": 81,
     "2025": 104,
     "2026": 116
    },
    "byDirection": {
     "UP": 585,
     "DOWN": 625
    },
    "byKind": {
     "NO_DECLARED_EVENT": 1196,
     "DECLARED_SPLIT_RESIDUAL": 14
    },
    "byPriorRawCloseBand": {
     "1_TO_5": 166,
     "GE_5": 177,
     "LT_1": 867
    }
   },
   "DQ-K3-BOOK": {
    "flags": 2521,
    "securitiesFlagged": 1001,
    "piecesAfter": 10528,
    "barsDroppedShortPieces": 8623,
    "barsDroppedShare": 0.0005946903113824125,
    "inResearchUniverseAtPriorSession": 278,
    "volumeBelowPrior20Median": 294,
    "exPostRevertsNextSession": 295,
    "survivorSecuritiesFlagged": 697,
    "byYear": {
     "2015": 168,
     "2016": 116,
     "2017": 252,
     "2018": 364,
     "2019": 216,
     "2020": 224,
     "2021": 164,
     "2022": 144,
     "2023": 149,
     "2024": 210,
     "2025": 269,
     "2026": 245
    },
    "byDirection": {
     "DOWN": 1234,
     "UP": 1287
    },
    "byKind": {
     "DECLARED_SPLIT_RESIDUAL": 30,
     "NO_DECLARED_EVENT": 2491
    },
    "byPriorRawCloseBand": {
     "LT_1": 1556,
     "1_TO_5": 516,
     "GE_5": 449
    }
   }
  },
  "baseMatchesAuthoritative": {
   "TURTLE_S1": "TRADE_COUNT_EQUAL",
   "TURTLE_S2": "TRADE_COUNT_EQUAL",
   "MINERVINI_SEPA": "TRADE_COUNT_EQUAL",
   "MINERVINI_POWER_PLAY": "TRADE_COUNT_EQUAL",
   "DARVAS": "TRADE_COUNT_EQUAL",
   "KK_BREAKOUT": "TRADE_COUNT_EQUAL",
   "POCKET_PIVOT": "TRADE_COUNT_EQUAL",
   "BUYABLE_GAP_UP": "TRADE_COUNT_EQUAL",
   "WEINSTEIN_INVESTOR": "TRADE_COUNT_EQUAL",
   "WEINSTEIN_TRADER": "TRADE_COUNT_EQUAL",
   "HOLY_GRAIL_W_RAS97": "TRADE_COUNT_EQUAL"
  },
  "lifecycles": {
   "TURTLE_S1": {
    "BASE": {
     "trades": 820,
     "tradesSha256": "0a770bfc8d344811377a2fbffd95d98723f4b8f6336c2b9182857da4f1275187"
    },
    "DQ-K5-BOOK": {
     "trades": 841,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 820,
      "quarantineTrades": 841,
      "unchanged": 128,
      "changed": 46,
      "removed": 646,
      "added": 667,
      "directlyExposed": 15,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 14,
      "directlyExposedChanged": 0,
      "knockOnChanged": 46,
      "knockOnRemoved": 632,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.018292682926829267,
      "heldAcrossFlagShare": 0.0024390243902439024,
      "unchangedShare": 0.15609756097560976
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 853,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 820,
      "quarantineTrades": 853,
      "unchanged": 141,
      "changed": 59,
      "removed": 620,
      "added": 653,
      "directlyExposed": 15,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 14,
      "directlyExposedChanged": 0,
      "knockOnChanged": 59,
      "knockOnRemoved": 606,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.018292682926829267,
      "heldAcrossFlagShare": 0.0024390243902439024,
      "unchangedShare": 0.1719512195121951
     }
    },
    "DQ-K3-BOOK": {
     "trades": 912,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 820,
      "quarantineTrades": 912,
      "unchanged": 131,
      "changed": 42,
      "removed": 647,
      "added": 739,
      "directlyExposed": 40,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 40,
      "directlyExposedChanged": 0,
      "knockOnChanged": 42,
      "knockOnRemoved": 607,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.04878048780487805,
      "heldAcrossFlagShare": 0.003658536585365854,
      "unchangedShare": 0.1597560975609756
     }
    },
    "DQ-K5": {
     "trades": 841,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 820,
      "quarantineTrades": 841,
      "unchanged": 128,
      "changed": 46,
      "removed": 646,
      "added": 667,
      "directlyExposed": 15,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 14,
      "directlyExposedChanged": 0,
      "knockOnChanged": 46,
      "knockOnRemoved": 632,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.018292682926829267,
      "heldAcrossFlagShare": 0.0024390243902439024,
      "unchangedShare": 0.15609756097560976
     }
    },
    "DQ-K3": {
     "trades": 912,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 820,
      "quarantineTrades": 912,
      "unchanged": 131,
      "changed": 42,
      "removed": 647,
      "added": 739,
      "directlyExposed": 40,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 40,
      "directlyExposedChanged": 0,
      "knockOnChanged": 42,
      "knockOnRemoved": 607,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.04878048780487805,
      "heldAcrossFlagShare": 0.003658536585365854,
      "unchangedShare": 0.1597560975609756
     }
    }
   },
   "TURTLE_S2": {
    "BASE": {
     "trades": 559,
     "tradesSha256": "ab42d3e8950330b4ff70de8a4c20d5afdd4a56e66e91ee527f49de1b368742f2"
    },
    "DQ-K5-BOOK": {
     "trades": 606,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 559,
      "quarantineTrades": 606,
      "unchanged": 324,
      "changed": 12,
      "removed": 223,
      "added": 270,
      "directlyExposed": 11,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 11,
      "directlyExposedChanged": 0,
      "knockOnChanged": 12,
      "knockOnRemoved": 212,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.01967799642218247,
      "heldAcrossFlagShare": 0.0017889087656529517,
      "unchangedShare": 0.5796064400715564
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 601,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 559,
      "quarantineTrades": 601,
      "unchanged": 322,
      "changed": 10,
      "removed": 227,
      "added": 269,
      "directlyExposed": 11,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 11,
      "directlyExposedChanged": 0,
      "knockOnChanged": 10,
      "knockOnRemoved": 216,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.01967799642218247,
      "heldAcrossFlagShare": 0.0017889087656529517,
      "unchangedShare": 0.5760286225402504
     }
    },
    "DQ-K3-BOOK": {
     "trades": 656,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 559,
      "quarantineTrades": 656,
      "unchanged": 93,
      "changed": 31,
      "removed": 435,
      "added": 532,
      "directlyExposed": 28,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 27,
      "directlyExposedChanged": 0,
      "knockOnChanged": 31,
      "knockOnRemoved": 408,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.05008944543828265,
      "heldAcrossFlagShare": 0.005366726296958855,
      "unchangedShare": 0.16636851520572452
     }
    },
    "DQ-K5": {
     "trades": 606,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 559,
      "quarantineTrades": 606,
      "unchanged": 324,
      "changed": 12,
      "removed": 223,
      "added": 270,
      "directlyExposed": 11,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 11,
      "directlyExposedChanged": 0,
      "knockOnChanged": 12,
      "knockOnRemoved": 212,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.01967799642218247,
      "heldAcrossFlagShare": 0.0017889087656529517,
      "unchangedShare": 0.5796064400715564
     }
    },
    "DQ-K3": {
     "trades": 656,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 559,
      "quarantineTrades": 656,
      "unchanged": 93,
      "changed": 31,
      "removed": 435,
      "added": 532,
      "directlyExposed": 28,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 27,
      "directlyExposedChanged": 0,
      "knockOnChanged": 31,
      "knockOnRemoved": 408,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.05008944543828265,
      "heldAcrossFlagShare": 0.005366726296958855,
      "unchangedShare": 0.16636851520572452
     }
    }
   },
   "MINERVINI_SEPA": {
    "BASE": {
     "trades": 954,
     "tradesSha256": "207d36f035b9b7ed08f72efdf892074d5bcc67bea146ce90294389b1151a1b9b"
    },
    "DQ-K5-BOOK": {
     "trades": 957,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 954,
      "quarantineTrades": 957,
      "unchanged": 901,
      "changed": 39,
      "removed": 14,
      "added": 17,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 39,
      "knockOnRemoved": 14,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9444444444444444
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 957,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 954,
      "quarantineTrades": 957,
      "unchanged": 901,
      "changed": 39,
      "removed": 14,
      "added": 17,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 39,
      "knockOnRemoved": 14,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9444444444444444
     }
    },
    "DQ-K3-BOOK": {
     "trades": 977,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 954,
      "quarantineTrades": 977,
      "unchanged": 526,
      "changed": 325,
      "removed": 103,
      "added": 126,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 325,
      "knockOnRemoved": 103,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.5513626834381551
     }
    },
    "DQ-K5": {
     "trades": 957,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 954,
      "quarantineTrades": 957,
      "unchanged": 901,
      "changed": 39,
      "removed": 14,
      "added": 17,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 39,
      "knockOnRemoved": 14,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9444444444444444
     }
    },
    "DQ-K3": {
     "trades": 977,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 954,
      "quarantineTrades": 977,
      "unchanged": 526,
      "changed": 325,
      "removed": 103,
      "added": 126,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 325,
      "knockOnRemoved": 103,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.5513626834381551
     }
    }
   },
   "MINERVINI_POWER_PLAY": {
    "BASE": {
     "trades": 1007,
     "tradesSha256": "d25663ecc005605ea221fdc1f1849e0c36a50ca12dd969053870139f4568bffe"
    },
    "DQ-K5-BOOK": {
     "trades": 975,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1007,
      "quarantineTrades": 975,
      "unchanged": 108,
      "changed": 771,
      "removed": 128,
      "added": 96,
      "directlyExposed": 10,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 5,
      "knockOnChanged": 766,
      "knockOnRemoved": 123,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.009930486593843098,
      "heldAcrossFlagShare": 0.0009930486593843098,
      "unchangedShare": 0.10724925521350546
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 978,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1007,
      "quarantineTrades": 978,
      "unchanged": 109,
      "changed": 771,
      "removed": 127,
      "added": 98,
      "directlyExposed": 10,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 5,
      "knockOnChanged": 766,
      "knockOnRemoved": 122,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.009930486593843098,
      "heldAcrossFlagShare": 0.0009930486593843098,
      "unchangedShare": 0.10824230387288977
     }
    },
    "DQ-K3-BOOK": {
     "trades": 955,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1007,
      "quarantineTrades": 955,
      "unchanged": 149,
      "changed": 711,
      "removed": 147,
      "added": 95,
      "directlyExposed": 39,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 25,
      "directlyExposedChanged": 11,
      "knockOnChanged": 700,
      "knockOnRemoved": 122,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.038728897715988087,
      "heldAcrossFlagShare": 0.003972194637537239,
      "unchangedShare": 0.14796425024826215
     }
    },
    "DQ-K5": {
     "trades": 975,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1007,
      "quarantineTrades": 975,
      "unchanged": 108,
      "changed": 771,
      "removed": 128,
      "added": 96,
      "directlyExposed": 10,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 5,
      "knockOnChanged": 766,
      "knockOnRemoved": 123,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.009930486593843098,
      "heldAcrossFlagShare": 0.0009930486593843098,
      "unchangedShare": 0.10724925521350546
     }
    },
    "DQ-K3": {
     "trades": 955,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1007,
      "quarantineTrades": 955,
      "unchanged": 149,
      "changed": 711,
      "removed": 147,
      "added": 95,
      "directlyExposed": 39,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 25,
      "directlyExposedChanged": 11,
      "knockOnChanged": 700,
      "knockOnRemoved": 122,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.038728897715988087,
      "heldAcrossFlagShare": 0.003972194637537239,
      "unchangedShare": 0.14796425024826215
     }
    }
   },
   "DARVAS": {
    "BASE": {
     "trades": 19556,
     "tradesSha256": "1f72e77dfaa35ac90f29e6481e4c29c59fffde8e8f72b03d3ebfe71b7e417acb"
    },
    "DQ-K5-BOOK": {
     "trades": 19623,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 19556,
      "quarantineTrades": 19623,
      "unchanged": 18058,
      "changed": 1410,
      "removed": 88,
      "added": 155,
      "directlyExposed": 20,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1410,
      "knockOnRemoved": 83,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0010227040294538761,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9233994681939047
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 19623,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 19556,
      "quarantineTrades": 19623,
      "unchanged": 18058,
      "changed": 1410,
      "removed": 88,
      "added": 155,
      "directlyExposed": 20,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1410,
      "knockOnRemoved": 83,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0010227040294538761,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9233994681939047
     }
    },
    "DQ-K3-BOOK": {
     "trades": 19752,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 19556,
      "quarantineTrades": 19752,
      "unchanged": 14067,
      "changed": 5306,
      "removed": 183,
      "added": 379,
      "directlyExposed": 34,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 8,
      "directlyExposedChanged": 10,
      "knockOnChanged": 5296,
      "knockOnRemoved": 175,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0017385968500715893,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.7193188791163837
     }
    },
    "DQ-K5": {
     "trades": 19623,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 19556,
      "quarantineTrades": 19623,
      "unchanged": 18058,
      "changed": 1410,
      "removed": 88,
      "added": 155,
      "directlyExposed": 20,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1410,
      "knockOnRemoved": 83,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0010227040294538761,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.9233994681939047
     }
    },
    "DQ-K3": {
     "trades": 19752,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 19556,
      "quarantineTrades": 19752,
      "unchanged": 14067,
      "changed": 5306,
      "removed": 183,
      "added": 379,
      "directlyExposed": 34,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 8,
      "directlyExposedChanged": 10,
      "knockOnChanged": 5296,
      "knockOnRemoved": 175,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0017385968500715893,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.7193188791163837
     }
    }
   },
   "KK_BREAKOUT": {
    "BASE": {
     "trades": 9114,
     "tradesSha256": "43f8a87f91b51d199dd822860407e196c1c3d7056c7601c2217e22c25ac23d3e"
    },
    "DQ-K5-BOOK": {
     "trades": 9048,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 9114,
      "quarantineTrades": 9048,
      "unchanged": 2809,
      "changed": 4784,
      "removed": 1521,
      "added": 1455,
      "directlyExposed": 31,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 17,
      "directlyExposedChanged": 10,
      "knockOnChanged": 4774,
      "knockOnRemoved": 1504,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.003401360544217687,
      "heldAcrossFlagShare": 0.0003291639236339697,
      "unchangedShare": 0.30820715382927366
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 9036,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 9114,
      "quarantineTrades": 9036,
      "unchanged": 2800,
      "changed": 4792,
      "removed": 1522,
      "added": 1444,
      "directlyExposed": 31,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 16,
      "directlyExposedChanged": 11,
      "knockOnChanged": 4781,
      "knockOnRemoved": 1506,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.003401360544217687,
      "heldAcrossFlagShare": 0.0003291639236339697,
      "unchangedShare": 0.30721966205837176
     }
    },
    "DQ-K3-BOOK": {
     "trades": 8900,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 9114,
      "quarantineTrades": 8900,
      "unchanged": 1800,
      "changed": 5492,
      "removed": 1822,
      "added": 1608,
      "directlyExposed": 113,
      "heldAcrossFlag": 5,
      "directlyExposedRemoved": 80,
      "directlyExposedChanged": 26,
      "knockOnChanged": 5466,
      "knockOnRemoved": 1742,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.01239850779021286,
      "heldAcrossFlagShare": 0.0005486065393899496,
      "unchangedShare": 0.19749835418038184
     }
    },
    "DQ-K5": {
     "trades": 9048,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 9114,
      "quarantineTrades": 9048,
      "unchanged": 2809,
      "changed": 4784,
      "removed": 1521,
      "added": 1455,
      "directlyExposed": 31,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 17,
      "directlyExposedChanged": 10,
      "knockOnChanged": 4774,
      "knockOnRemoved": 1504,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.003401360544217687,
      "heldAcrossFlagShare": 0.0003291639236339697,
      "unchangedShare": 0.30820715382927366
     }
    },
    "DQ-K3": {
     "trades": 8900,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 9114,
      "quarantineTrades": 8900,
      "unchanged": 1800,
      "changed": 5492,
      "removed": 1822,
      "added": 1608,
      "directlyExposed": 113,
      "heldAcrossFlag": 5,
      "directlyExposedRemoved": 80,
      "directlyExposedChanged": 26,
      "knockOnChanged": 5466,
      "knockOnRemoved": 1742,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.01239850779021286,
      "heldAcrossFlagShare": 0.0005486065393899496,
      "unchangedShare": 0.19749835418038184
     }
    }
   },
   "POCKET_PIVOT": {
    "BASE": {
     "trades": 1872,
     "tradesSha256": "db8caae83d71624ece76b5a39a51ce81f308c467831d3c71dd1766c0409ad8f5"
    },
    "DQ-K5-BOOK": {
     "trades": 1853,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1872,
      "quarantineTrades": 1853,
      "unchanged": 187,
      "changed": 1058,
      "removed": 627,
      "added": 608,
      "directlyExposed": 7,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 7,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1058,
      "knockOnRemoved": 620,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0037393162393162395,
      "heldAcrossFlagShare": 0.0010683760683760685,
      "unchangedShare": 0.0998931623931624
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 1853,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1872,
      "quarantineTrades": 1853,
      "unchanged": 187,
      "changed": 1058,
      "removed": 627,
      "added": 608,
      "directlyExposed": 7,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 7,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1058,
      "knockOnRemoved": 620,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0037393162393162395,
      "heldAcrossFlagShare": 0.0010683760683760685,
      "unchangedShare": 0.0998931623931624
     }
    },
    "DQ-K3-BOOK": {
     "trades": 1892,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1872,
      "quarantineTrades": 1892,
      "unchanged": 201,
      "changed": 1040,
      "removed": 631,
      "added": 651,
      "directlyExposed": 18,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 17,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1040,
      "knockOnRemoved": 614,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.009615384615384616,
      "heldAcrossFlagShare": 0.002136752136752137,
      "unchangedShare": 0.10737179487179487
     }
    },
    "DQ-K5": {
     "trades": 1853,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1872,
      "quarantineTrades": 1853,
      "unchanged": 187,
      "changed": 1058,
      "removed": 627,
      "added": 608,
      "directlyExposed": 7,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 7,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1058,
      "knockOnRemoved": 620,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0037393162393162395,
      "heldAcrossFlagShare": 0.0010683760683760685,
      "unchangedShare": 0.0998931623931624
     }
    },
    "DQ-K3": {
     "trades": 1892,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1872,
      "quarantineTrades": 1892,
      "unchanged": 201,
      "changed": 1040,
      "removed": 631,
      "added": 651,
      "directlyExposed": 18,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 17,
      "directlyExposedChanged": 0,
      "knockOnChanged": 1040,
      "knockOnRemoved": 614,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.009615384615384616,
      "heldAcrossFlagShare": 0.002136752136752137,
      "unchangedShare": 0.10737179487179487
     }
    }
   },
   "BUYABLE_GAP_UP": {
    "BASE": {
     "trades": 3415,
     "tradesSha256": "d431c171cd29baba1ebe07944dfd20f8900cc456decefc29568749d41c17d633"
    },
    "DQ-K5-BOOK": {
     "trades": 3500,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 3415,
      "quarantineTrades": 3500,
      "unchanged": 1281,
      "changed": 1487,
      "removed": 647,
      "added": 732,
      "directlyExposed": 15,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 9,
      "directlyExposedChanged": 4,
      "knockOnChanged": 1483,
      "knockOnRemoved": 638,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.004392386530014641,
      "heldAcrossFlagShare": 0.00029282576866764275,
      "unchangedShare": 0.37510980966325036
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 3495,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 3415,
      "quarantineTrades": 3495,
      "unchanged": 1295,
      "changed": 1484,
      "removed": 636,
      "added": 716,
      "directlyExposed": 15,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 9,
      "directlyExposedChanged": 4,
      "knockOnChanged": 1480,
      "knockOnRemoved": 627,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.004392386530014641,
      "heldAcrossFlagShare": 0.00029282576866764275,
      "unchangedShare": 0.37920937042459735
     }
    },
    "DQ-K3-BOOK": {
     "trades": 3412,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 3415,
      "quarantineTrades": 3412,
      "unchanged": 707,
      "changed": 1743,
      "removed": 965,
      "added": 962,
      "directlyExposed": 68,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 49,
      "directlyExposedChanged": 14,
      "knockOnChanged": 1729,
      "knockOnRemoved": 916,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.019912152269399706,
      "heldAcrossFlagShare": 0.00029282576866764275,
      "unchangedShare": 0.20702781844802343
     }
    },
    "DQ-K5": {
     "trades": 3500,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 3415,
      "quarantineTrades": 3500,
      "unchanged": 1281,
      "changed": 1487,
      "removed": 647,
      "added": 732,
      "directlyExposed": 15,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 9,
      "directlyExposedChanged": 4,
      "knockOnChanged": 1483,
      "knockOnRemoved": 638,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.004392386530014641,
      "heldAcrossFlagShare": 0.00029282576866764275,
      "unchangedShare": 0.37510980966325036
     }
    },
    "DQ-K3": {
     "trades": 3412,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 3415,
      "quarantineTrades": 3412,
      "unchanged": 707,
      "changed": 1743,
      "removed": 965,
      "added": 962,
      "directlyExposed": 68,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 49,
      "directlyExposedChanged": 14,
      "knockOnChanged": 1729,
      "knockOnRemoved": 916,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.019912152269399706,
      "heldAcrossFlagShare": 0.00029282576866764275,
      "unchangedShare": 0.20702781844802343
     }
    }
   },
   "WEINSTEIN_INVESTOR": {
    "BASE": {
     "trades": 1348,
     "tradesSha256": "b8b53a31e99bb87a90c2ee7d04d36128fc43d645e721fcc0622e67953f53318d"
    },
    "DQ-K5-BOOK": {
     "trades": 1361,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1348,
      "quarantineTrades": 1361,
      "unchanged": 311,
      "changed": 916,
      "removed": 121,
      "added": 134,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 916,
      "knockOnRemoved": 121,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.23071216617210683
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 1361,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1348,
      "quarantineTrades": 1361,
      "unchanged": 311,
      "changed": 916,
      "removed": 121,
      "added": 134,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 916,
      "knockOnRemoved": 121,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.23071216617210683
     }
    },
    "DQ-K3-BOOK": {
     "trades": 1392,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1348,
      "quarantineTrades": 1392,
      "unchanged": 369,
      "changed": 817,
      "removed": 162,
      "added": 206,
      "directlyExposed": 5,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 0,
      "knockOnChanged": 817,
      "knockOnRemoved": 157,
      "exposedOpenAtDataEnd": 2,
      "directlyExposedShare": 0.00370919881305638,
      "heldAcrossFlagShare": 0.000741839762611276,
      "unchangedShare": 0.2737388724035608
     }
    },
    "DQ-K5": {
     "trades": 1361,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1348,
      "quarantineTrades": 1361,
      "unchanged": 311,
      "changed": 916,
      "removed": 121,
      "added": 134,
      "directlyExposed": 0,
      "heldAcrossFlag": 0,
      "directlyExposedRemoved": 0,
      "directlyExposedChanged": 0,
      "knockOnChanged": 916,
      "knockOnRemoved": 121,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0,
      "heldAcrossFlagShare": 0,
      "unchangedShare": 0.23071216617210683
     }
    },
    "DQ-K3": {
     "trades": 1392,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1348,
      "quarantineTrades": 1392,
      "unchanged": 369,
      "changed": 817,
      "removed": 162,
      "added": 206,
      "directlyExposed": 5,
      "heldAcrossFlag": 1,
      "directlyExposedRemoved": 5,
      "directlyExposedChanged": 0,
      "knockOnChanged": 817,
      "knockOnRemoved": 157,
      "exposedOpenAtDataEnd": 2,
      "directlyExposedShare": 0.00370919881305638,
      "heldAcrossFlagShare": 0.000741839762611276,
      "unchangedShare": 0.2737388724035608
     }
    }
   },
   "WEINSTEIN_TRADER": {
    "BASE": {
     "trades": 1808,
     "tradesSha256": "5a89a521065fe6649ef1f5ab122d46e1e769511900b8557de87c44c44ac4c8a1"
    },
    "DQ-K5-BOOK": {
     "trades": 1934,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1808,
      "quarantineTrades": 1934,
      "unchanged": 373,
      "changed": 962,
      "removed": 473,
      "added": 599,
      "directlyExposed": 4,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 3,
      "directlyExposedChanged": 1,
      "knockOnChanged": 961,
      "knockOnRemoved": 470,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0022123893805309734,
      "heldAcrossFlagShare": 0.0011061946902654867,
      "unchangedShare": 0.20630530973451328
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 1941,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1808,
      "quarantineTrades": 1941,
      "unchanged": 367,
      "changed": 977,
      "removed": 464,
      "added": 597,
      "directlyExposed": 4,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 3,
      "directlyExposedChanged": 1,
      "knockOnChanged": 976,
      "knockOnRemoved": 461,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0022123893805309734,
      "heldAcrossFlagShare": 0.0011061946902654867,
      "unchangedShare": 0.2029867256637168
     }
    },
    "DQ-K3-BOOK": {
     "trades": 1976,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1808,
      "quarantineTrades": 1976,
      "unchanged": 365,
      "changed": 975,
      "removed": 468,
      "added": 636,
      "directlyExposed": 9,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 9,
      "directlyExposedChanged": 0,
      "knockOnChanged": 975,
      "knockOnRemoved": 459,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.00497787610619469,
      "heldAcrossFlagShare": 0.0011061946902654867,
      "unchangedShare": 0.20188053097345132
     }
    },
    "DQ-K5": {
     "trades": 1934,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1808,
      "quarantineTrades": 1934,
      "unchanged": 373,
      "changed": 962,
      "removed": 473,
      "added": 599,
      "directlyExposed": 4,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 3,
      "directlyExposedChanged": 1,
      "knockOnChanged": 961,
      "knockOnRemoved": 470,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.0022123893805309734,
      "heldAcrossFlagShare": 0.0011061946902654867,
      "unchangedShare": 0.20630530973451328
     }
    },
    "DQ-K3": {
     "trades": 1976,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 1808,
      "quarantineTrades": 1976,
      "unchanged": 365,
      "changed": 975,
      "removed": 468,
      "added": 636,
      "directlyExposed": 9,
      "heldAcrossFlag": 2,
      "directlyExposedRemoved": 9,
      "directlyExposedChanged": 0,
      "knockOnChanged": 975,
      "knockOnRemoved": 459,
      "exposedOpenAtDataEnd": 0,
      "directlyExposedShare": 0.00497787610619469,
      "heldAcrossFlagShare": 0.0011061946902654867,
      "unchangedShare": 0.20188053097345132
     }
    }
   },
   "HOLY_GRAIL_W_RAS97": {
    "BASE": {
     "trades": 4025,
     "tradesSha256": "d677bf7da40a2c9aa6e4412d325b22091aec40bb97cc704db9aaf59d80adea71"
    },
    "DQ-K5-BOOK": {
     "trades": 4039,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 4025,
      "quarantineTrades": 4039,
      "unchanged": 375,
      "changed": 2400,
      "removed": 1250,
      "added": 1264,
      "directlyExposed": 30,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 26,
      "directlyExposedChanged": 2,
      "knockOnChanged": 2398,
      "knockOnRemoved": 1224,
      "exposedOpenAtDataEnd": 1,
      "directlyExposedShare": 0.007453416149068323,
      "heldAcrossFlagShare": 0.0007453416149068323,
      "unchangedShare": 0.09316770186335403
     }
    },
    "DQ-K5-PRIOR": {
     "trades": 4043,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 4025,
      "quarantineTrades": 4043,
      "unchanged": 377,
      "changed": 2404,
      "removed": 1244,
      "added": 1262,
      "directlyExposed": 30,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 26,
      "directlyExposedChanged": 2,
      "knockOnChanged": 2402,
      "knockOnRemoved": 1218,
      "exposedOpenAtDataEnd": 1,
      "directlyExposedShare": 0.007453416149068323,
      "heldAcrossFlagShare": 0.0007453416149068323,
      "unchangedShare": 0.09366459627329192
     }
    },
    "DQ-K3-BOOK": {
     "trades": 4239,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 4025,
      "quarantineTrades": 4239,
      "unchanged": 363,
      "changed": 2316,
      "removed": 1346,
      "added": 1560,
      "directlyExposed": 103,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 88,
      "directlyExposedChanged": 14,
      "knockOnChanged": 2302,
      "knockOnRemoved": 1258,
      "exposedOpenAtDataEnd": 3,
      "directlyExposedShare": 0.025590062111801242,
      "heldAcrossFlagShare": 0.0009937888198757764,
      "unchangedShare": 0.09018633540372671
     }
    },
    "DQ-K5": {
     "trades": 4039,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 4025,
      "quarantineTrades": 4039,
      "unchanged": 375,
      "changed": 2400,
      "removed": 1250,
      "added": 1264,
      "directlyExposed": 30,
      "heldAcrossFlag": 3,
      "directlyExposedRemoved": 26,
      "directlyExposedChanged": 2,
      "knockOnChanged": 2398,
      "knockOnRemoved": 1224,
      "exposedOpenAtDataEnd": 1,
      "directlyExposedShare": 0.007453416149068323,
      "heldAcrossFlagShare": 0.0007453416149068323,
      "unchangedShare": 0.09316770186335403
     }
    },
    "DQ-K3": {
     "trades": 4239,
     "reconciliation": true,
     "comparisonWithBase": {
      "baseTrades": 4025,
      "quarantineTrades": 4239,
      "unchanged": 363,
      "changed": 2316,
      "removed": 1346,
      "added": 1560,
      "directlyExposed": 103,
      "heldAcrossFlag": 4,
      "directlyExposedRemoved": 88,
      "directlyExposedChanged": 14,
      "knockOnChanged": 2302,
      "knockOnRemoved": 1258,
      "exposedOpenAtDataEnd": 3,
      "directlyExposedShare": 0.025590062111801242,
      "heldAcrossFlagShare": 0.0009937888198757764,
      "unchangedShare": 0.09018633540372671
     }
    }
   }
  }
 },
 "validation": {
  "runId": "40001421221",
  "commit": "1d1036289f48d1ec53195faff6495d96ba883918",
  "snapshotId": "sts1-134d4d62eb88b6ff8d98fe6e56b12a6d",
  "datasetVerified": "EXACT",
  "protocolSha256": "c7702e77eb768b718b57691323afa052c949200379ab7a562b2b1d47366f7c25",
  "modelVariantsSha256": "6f81beb615d4f54427d38c5ac4034f8cf1b593338513ee993014841fe9850ed5",
  "windowName": "DEV",
  "references": {
   "TURTLE_S1": {
    "candidateId": "C01",
    "costLevels": {
     "COST-0": {
      "trades": 938,
      "reconciliation": true,
      "tradesSha256": "31100f97040d0319a075680ffc7d2a8635062326c62d4b3a126864bb931c6204"
     },
     "REF": {
      "trades": 820,
      "reconciliation": true,
      "tradesSha256": "0a770bfc8d344811377a2fbffd95d98723f4b8f6336c2b9182857da4f1275187"
     },
     "COST-20": {
      "trades": 826,
      "reconciliation": true,
      "tradesSha256": "f91f8893008f6e24eb8687852be0f78b09c054cfb26a5009297dbe69973d8397"
     },
     "COST-50": {
      "trades": 923,
      "reconciliation": true,
      "tradesSha256": "1f55221cf486cbe285dc00477b88876f18f5cc39743f7a67100d902f628cf723"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 282,
      "P2": 538
     },
     "byRegime": {
      "UNKNOWN": 2,
      "SPY_AT_OR_BELOW_SMA200": 223,
      "SPY_ABOVE_SMA200": 595
     },
     "byLiquidity": {
      "GE_25M": 364,
      "1M_TO_5M": 207,
      "5M_TO_25M": 249
     },
     "byYear": {
      "2016": 48,
      "2017": 34,
      "2018": 71,
      "2019": 93,
      "2020": 36,
      "2021": 116,
      "2022": 138,
      "2023": 87,
      "2024": 32,
      "2025": 106,
      "2026": 59
     }
    }
   },
   "TURTLE_S2": {
    "candidateId": "C02",
    "costLevels": {
     "COST-0": {
      "trades": 691,
      "reconciliation": true,
      "tradesSha256": "aca794494d071a2349e76be0e9d2451c3deb39d4930c65afbab03911209f7460"
     },
     "REF": {
      "trades": 559,
      "reconciliation": true,
      "tradesSha256": "ab42d3e8950330b4ff70de8a4c20d5afdd4a56e66e91ee527f49de1b368742f2"
     },
     "COST-20": {
      "trades": 605,
      "reconciliation": true,
      "tradesSha256": "d0e7d0aa5b758b4e8c92058c626ad304f7861367c5265218221e971927f7c157"
     },
     "COST-50": {
      "trades": 466,
      "reconciliation": true,
      "tradesSha256": "c9d01270f41f9f2bca7b8c803f131914f6eca8c3656cd417f514721d6fd3aca8"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 197,
      "P2": 362
     },
     "byRegime": {
      "UNKNOWN": 2,
      "SPY_AT_OR_BELOW_SMA200": 153,
      "SPY_ABOVE_SMA200": 404
     },
     "byLiquidity": {
      "GE_25M": 245,
      "5M_TO_25M": 174,
      "1M_TO_5M": 140
     },
     "byYear": {
      "2016": 40,
      "2017": 28,
      "2018": 54,
      "2019": 40,
      "2020": 35,
      "2021": 97,
      "2022": 94,
      "2023": 46,
      "2024": 43,
      "2025": 59,
      "2026": 23
     }
    }
   },
   "MINERVINI_SEPA": {
    "candidateId": "C06",
    "costLevels": {
     "COST-0": {
      "trades": 972,
      "reconciliation": true,
      "tradesSha256": "15f0665759ad30bdd77f0081cb2bfb7e5403c9a254bf0b9e76833c5eec0d86c8"
     },
     "REF": {
      "trades": 954,
      "reconciliation": true,
      "tradesSha256": "207d36f035b9b7ed08f72efdf892074d5bcc67bea146ce90294389b1151a1b9b"
     },
     "COST-20": {
      "trades": 982,
      "reconciliation": true,
      "tradesSha256": "9b9bc0bd6589c4c32878809ab820cfd628887df115cb23f838e8b7c16b0e1a4a"
     },
     "COST-50": {
      "trades": 983,
      "reconciliation": true,
      "tradesSha256": "c15820e79dc13dcf1358d905ff0ab3f6a9d173b00f941f2d93bf8a3ed6d84756"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 422,
      "P2": 532
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 133,
      "SPY_ABOVE_SMA200": 821
     },
     "byLiquidity": {
      "5M_TO_25M": 311,
      "GE_25M": 427,
      "1M_TO_5M": 216
     },
     "byYear": {
      "2016": 76,
      "2017": 107,
      "2018": 98,
      "2019": 74,
      "2020": 67,
      "2021": 112,
      "2022": 69,
      "2023": 92,
      "2024": 99,
      "2025": 74,
      "2026": 86
     }
    },
    "fundamentalsSplitConsistency": {
     "version": "sf6-minervini-fundamentals-split-consistent-1.0.0",
     "entries": 954,
     "withEvidence": 762,
     "withCorrectedQuarter": 29,
     "withUndeterminableQuarter": 405,
     "latestYoyChanged": 75,
     "acceleratingChanged": 129
    }
   },
   "MINERVINI_POWER_PLAY": {
    "candidateId": "C07",
    "costLevels": {
     "COST-0": {
      "trades": 991,
      "reconciliation": true,
      "tradesSha256": "706222c17fb61824b9abc4ca3494ed7c492549b4b0ba9e45fcb927c64af3798d"
     },
     "REF": {
      "trades": 1007,
      "reconciliation": true,
      "tradesSha256": "d25663ecc005605ea221fdc1f1849e0c36a50ca12dd969053870139f4568bffe"
     },
     "COST-20": {
      "trades": 973,
      "reconciliation": true,
      "tradesSha256": "3cbdc2a146b28c0c06d664b47001f4e831e16e1406baee3043948a79cf18f969"
     },
     "COST-50": {
      "trades": 971,
      "reconciliation": true,
      "tradesSha256": "6dff825afbcc1250c01962b1b405aaa2bbec9c3e7974a2e000271f0d713c9f5c"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 365,
      "P2": 642
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 200,
      "SPY_ABOVE_SMA200": 807
     },
     "byLiquidity": {
      "GE_25M": 383,
      "5M_TO_25M": 356,
      "1M_TO_5M": 268
     },
     "byYear": {
      "2016": 67,
      "2017": 50,
      "2018": 49,
      "2019": 58,
      "2020": 141,
      "2021": 77,
      "2022": 117,
      "2023": 91,
      "2024": 120,
      "2025": 118,
      "2026": 119
     }
    }
   },
   "DARVAS": {
    "candidateId": "C03",
    "costLevels": {
     "COST-0": {
      "trades": 20166,
      "reconciliation": true,
      "tradesSha256": "5a4e3633b06c1b9c94b53cf9be9de948f47bd677c4e8b1e17b42c0a86a9169c5"
     },
     "REF": {
      "trades": 19556,
      "reconciliation": true,
      "tradesSha256": "1f72e77dfaa35ac90f29e6481e4c29c59fffde8e8f72b03d3ebfe71b7e417acb"
     },
     "COST-20": {
      "trades": 14676,
      "reconciliation": true,
      "tradesSha256": "240087e6a827551750220a436b7df358ea75749b71ca5d7e0e9234b93ebe2db9"
     },
     "COST-50": {
      "trades": 7343,
      "reconciliation": true,
      "tradesSha256": "947ec9daf2b4f079ac444112f845a05d93f10881cbd74c6c8d70d5b31484bc88"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 10952,
      "P2": 8604
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 1306,
      "SPY_ABOVE_SMA200": 18250
     },
     "byLiquidity": {
      "GE_25M": 11139,
      "1M_TO_5M": 3012,
      "5M_TO_25M": 5405
     },
     "byYear": {
      "2016": 2085,
      "2017": 2640,
      "2018": 2341,
      "2019": 2023,
      "2020": 1863,
      "2021": 2723,
      "2022": 675,
      "2023": 870,
      "2024": 1815,
      "2025": 1295,
      "2026": 1226
     }
    }
   },
   "KK_BREAKOUT": {
    "candidateId": "C08",
    "costLevels": {
     "COST-0": {
      "trades": 9310,
      "reconciliation": true,
      "tradesSha256": "313228a93dd7b99dc3d51d7e9067967853a48c6bdb0377d832ccc4f15944a247"
     },
     "REF": {
      "trades": 9114,
      "reconciliation": true,
      "tradesSha256": "43f8a87f91b51d199dd822860407e196c1c3d7056c7601c2217e22c25ac23d3e"
     },
     "COST-20": {
      "trades": 8231,
      "reconciliation": true,
      "tradesSha256": "5432777cd9fbcfa00daec2217d4bc0d37a3b98b01d32205a32b44ca090d4ba15"
     },
     "COST-50": {
      "trades": 5064,
      "reconciliation": true,
      "tradesSha256": "ddcd35988ae8ac452695340e1d17fda3de56d07f84e9d943640712bbff29af03"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 4126,
      "P2": 4988
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 1350,
      "SPY_ABOVE_SMA200": 7764
     },
     "byLiquidity": {
      "5M_TO_25M": 3130,
      "GE_25M": 3423,
      "1M_TO_5M": 2561
     },
     "byYear": {
      "2016": 762,
      "2017": 786,
      "2018": 704,
      "2019": 868,
      "2020": 1006,
      "2021": 922,
      "2022": 842,
      "2023": 777,
      "2024": 883,
      "2025": 811,
      "2026": 753
     }
    }
   },
   "POCKET_PIVOT": {
    "candidateId": "C11",
    "costLevels": {
     "COST-0": {
      "trades": 1835,
      "reconciliation": true,
      "tradesSha256": "21f2491c7feb4a3087577504842fef70dfb94d536c823f371cf9243d5e3752bd"
     },
     "REF": {
      "trades": 1872,
      "reconciliation": true,
      "tradesSha256": "db8caae83d71624ece76b5a39a51ce81f308c467831d3c71dd1766c0409ad8f5"
     },
     "COST-20": {
      "trades": 1875,
      "reconciliation": true,
      "tradesSha256": "22faa112e479b77aeef484ad8b7b6fc4a667e83b51153eb811f0f795510f3dc8"
     },
     "COST-50": {
      "trades": 1845,
      "reconciliation": true,
      "tradesSha256": "91e8e75a7bea766039cc2120ad50d582a05b40fefed0913bb7f9250236799203"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 840,
      "P2": 1032
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 453,
      "SPY_ABOVE_SMA200": 1419
     },
     "byLiquidity": {
      "5M_TO_25M": 600,
      "GE_25M": 719,
      "1M_TO_5M": 553
     },
     "byYear": {
      "2016": 171,
      "2017": 166,
      "2018": 189,
      "2019": 132,
      "2020": 182,
      "2021": 162,
      "2022": 232,
      "2023": 173,
      "2024": 148,
      "2025": 176,
      "2026": 141
     }
    }
   },
   "BUYABLE_GAP_UP": {
    "candidateId": "C12",
    "costLevels": {
     "COST-0": {
      "trades": 3520,
      "reconciliation": true,
      "tradesSha256": "d29834e3e5f14fe85acf681ed90c0a85b2c05dcd615725fde572a4ac23fea7b9"
     },
     "REF": {
      "trades": 3415,
      "reconciliation": true,
      "tradesSha256": "d431c171cd29baba1ebe07944dfd20f8900cc456decefc29568749d41c17d633"
     },
     "COST-20": {
      "trades": 3525,
      "reconciliation": true,
      "tradesSha256": "948f0b69c3b03785fce7a4ac77739ad1aad487b56aec13853ff635cd9011db34"
     },
     "COST-50": {
      "trades": 3467,
      "reconciliation": true,
      "tradesSha256": "907a24a63d443eac0caa33d73302fba7f72a5a2dacfd418744499eba0aba61fd"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 1483,
      "P2": 1932
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 686,
      "SPY_ABOVE_SMA200": 2729
     },
     "byLiquidity": {
      "GE_25M": 1443,
      "1M_TO_5M": 917,
      "5M_TO_25M": 1055
     },
     "byYear": {
      "2016": 290,
      "2017": 302,
      "2018": 298,
      "2019": 246,
      "2020": 347,
      "2021": 353,
      "2022": 345,
      "2023": 301,
      "2024": 308,
      "2025": 345,
      "2026": 280
     }
    }
   },
   "WEINSTEIN_INVESTOR": {
    "candidateId": "C04",
    "costLevels": {
     "COST-0": {
      "trades": 1326,
      "reconciliation": true,
      "tradesSha256": "5ced6193544b319151d8ce2df7f49d30b296c155d99a88af933fae9a9837f150"
     },
     "REF": {
      "trades": 1348,
      "reconciliation": true,
      "tradesSha256": "b8b53a31e99bb87a90c2ee7d04d36128fc43d645e721fcc0622e67953f53318d"
     },
     "COST-20": {
      "trades": 1307,
      "reconciliation": true,
      "tradesSha256": "d5c15b27c92bce5aa9596bfbed993fc345ee2d0ea48480efc2196a1a596425bd"
     },
     "COST-50": {
      "trades": 1339,
      "reconciliation": true,
      "tradesSha256": "8f94d4d87094a9cbfb3f72d6764ee4aeea025781412e784411e0b352eb530a59"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 650,
      "P2": 698
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 468,
      "SPY_ABOVE_SMA200": 880
     },
     "byLiquidity": {
      "5M_TO_25M": 396,
      "GE_25M": 692,
      "1M_TO_5M": 260
     },
     "byYear": {
      "2016": 239,
      "2017": 60,
      "2018": 92,
      "2019": 143,
      "2020": 116,
      "2021": 114,
      "2022": 195,
      "2023": 95,
      "2024": 96,
      "2025": 114,
      "2026": 84
     }
    }
   },
   "WEINSTEIN_TRADER": {
    "candidateId": "C05",
    "costLevels": {
     "COST-0": {
      "trades": 1760,
      "reconciliation": true,
      "tradesSha256": "aecbc88ac0c5a02c18bb11b6769b4827dcd791b1de98d5ba2abfec5f45e09955"
     },
     "REF": {
      "trades": 1808,
      "reconciliation": true,
      "tradesSha256": "5a89a521065fe6649ef1f5ab122d46e1e769511900b8557de87c44c44ac4c8a1"
     },
     "COST-20": {
      "trades": 1909,
      "reconciliation": true,
      "tradesSha256": "fe0b855a9aea7396fc00a118d537b995a40fbad616c6b4de433d14f92783c220"
     },
     "COST-50": {
      "trades": 1859,
      "reconciliation": true,
      "tradesSha256": "a823ceb02ede87e440828820e3fcdea8477223a9843a9c091e8adc4d0e38ad43"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 940,
      "P2": 868
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 506,
      "SPY_ABOVE_SMA200": 1302
     },
     "byLiquidity": {
      "5M_TO_25M": 591,
      "1M_TO_5M": 451,
      "GE_25M": 766
     },
     "byYear": {
      "2016": 289,
      "2017": 116,
      "2018": 197,
      "2019": 146,
      "2020": 192,
      "2021": 151,
      "2022": 207,
      "2023": 128,
      "2024": 167,
      "2025": 112,
      "2026": 103
     }
    }
   },
   "HOLY_GRAIL_W_RAS97": {
    "candidateId": "C13",
    "costLevels": {
     "COST-0": {
      "trades": 4085,
      "reconciliation": true,
      "tradesSha256": "6137db65019e3b8c4ce2643dc001b92d7f886fcd3796b34d386db402aeb53fe3"
     },
     "REF": {
      "trades": 4025,
      "reconciliation": true,
      "tradesSha256": "d677bf7da40a2c9aa6e4412d325b22091aec40bb97cc704db9aaf59d80adea71"
     },
     "COST-20": {
      "trades": 4022,
      "reconciliation": true,
      "tradesSha256": "73b5bea9e916b1998ba461749f610ce5113c5cff5a04135c6d3646175098dbe4"
     },
     "COST-50": {
      "trades": 4041,
      "reconciliation": true,
      "tradesSha256": "8d9217f536a3a915f0faadb46aa9ade74b192da096351ed656d8f43e7d19b00f"
     }
    },
    "splits": {
     "byPeriod": {
      "P1": 2019,
      "P2": 2006
     },
     "byRegime": {
      "SPY_AT_OR_BELOW_SMA200": 782,
      "SPY_ABOVE_SMA200": 3243
     },
     "byLiquidity": {
      "5M_TO_25M": 1325,
      "GE_25M": 1342,
      "1M_TO_5M": 1358
     },
     "byYear": {
      "2016": 408,
      "2017": 437,
      "2018": 447,
      "2019": 302,
      "2020": 425,
      "2021": 303,
      "2022": 398,
      "2023": 249,
      "2024": 332,
      "2025": 432,
      "2026": 292
     }
    }
   }
  },
  "models": {
   "SF6-MODEL-PP-STOP-SIGNAL-DAY-LOW": {
    "id": "SF6-MODEL-PP-STOP-SIGNAL-DAY-LOW",
    "candidateId": "C11",
    "assumption": "MA6-PP-STOP-SIGNAL-DAY-LOW",
    "phaseClosed": "INITIAL_STOP",
    "trades": 4534,
    "closed": 4514,
    "exitReasons": {
     "STOP_INITIAL": 1552,
     "MOKA_MA50_VIOLATION": 633,
     "SECURITY_UNAVAILABLE": 8,
     "MOKA_MA50_VIOLATION_GAP_OPEN": 218,
     "STOP_INITIAL_GAP_OPEN": 231,
     "STOP_SAME_BAR_CERTAIN": 1643,
     "MOKA_MA10_VIOLATION": 132,
     "TERMINAL_DELISTED": 40,
     "MOKA_MA10_VIOLATION_GAP_OPEN": 57
    },
    "notExecutedAtOrBelowStop": 32413,
    "stopRaises": 0,
    "reconciliation": true
   },
   "SF6-MODEL-HG-TRAIL-SWING-LOWS": {
    "id": "SF6-MODEL-HG-TRAIL-SWING-LOWS",
    "candidateId": "C13",
    "assumption": "MA6-HG-TRAIL-SWING-LOWS",
    "phaseClosed": "POSITION_MANAGEMENT",
    "trades": 2217,
    "closed": 2199,
    "exitReasons": {
     "STOP_INITIAL": 1124,
     "STOP_INITIAL_GAP_OPEN": 166,
     "STOP_MA6_HG_TRAIL_SWING_LOW_GAP_OPEN": 40,
     "STOP_SAME_BAR_ASSUMED": 368,
     "STOP_SAME_BAR_CERTAIN": 66,
     "STOP_MA6_HG_TRAIL_SWING_LOW": 393,
     "TERMINAL_DELISTED": 33,
     "SECURITY_UNAVAILABLE": 9
    },
    "notExecutedAtOrBelowStop": 0,
    "stopRaises": 884,
    "reconciliation": true
   },
   "SF6-DATA-DAR-ATH-VERIFIED-LISTING": {
    "id": "SF6-DATA-DAR-ATH-VERIFIED-LISTING",
    "candidateId": "C03",
    "assumption": "DA6-DAR-ATH-VERIFIED-LISTING",
    "phaseClosed": null,
    "trades": 5629,
    "closed": 5628,
    "exitReasons": {
     "STOP_SAME_BAR_ASSUMED": 4855,
     "STOP_DAR-SF-STOP-RAISE": 94,
     "STOP_INITIAL": 104,
     "STOP_SAME_BAR_CERTAIN": 517,
     "SECURITY_UNAVAILABLE": 1,
     "TERMINAL_DELISTED": 17,
     "STOP_INITIAL_GAP_OPEN": 26,
     "STOP_DAR-SF-STOP-RAISE_GAP_OPEN": 14
    },
    "notExecutedAtOrBelowStop": 0,
    "stopRaises": 171,
    "reconciliation": true
   }
  }
 },
 "holdout": null
});
