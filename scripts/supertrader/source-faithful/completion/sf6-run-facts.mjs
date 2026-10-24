/**
 * Supertrader 6.0 – public facts of the snapshot runs (counts and hashes copied from the public run output; the metrics
 * stay sealed with the owner). null = run not yet recorded (the matrix then reports NOT_EVIDENCED).
 * integrity: run-sf6-integrity.mjs 1.1.0. The criteria (sf6-readiness-criteria.mjs) name the policies DQ-K5 / DQ-K3; they
 * are the BOOK treatments (DQ-K5-BOOK primary, DQ-K3-BOOK sensitivity), copied under both names; DQ-K5-PRIOR is reported.
 * baseMatchesAuthoritative: the BASE level of the integrity run compared HASH BY HASH with the authoritative reference run
 * (ledgerSha256 = sha(JSON ledger), tradesSha256 = sha([id, entryDate, exitDate, exitReason, shares])); the Turtle runs of
 * Supertrader 2.0 publish the ledger hash only, so their trade hash is NOT_PUBLISHED_BY_REFERENCE (never inferred from counts).
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
   "TURTLE_S1": {
    "authoritativeRunId": "39397517900",
    "authoritativeVersion": "Supertrader 2.0 Turtle research engine (BASE_S0)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "NOT_PUBLISHED_BY_REFERENCE",
    "ledgerSha256Value": "884d88cb519426e191e11ad40255faa431b374c190fccaa23bdeff2a41bb8610"
   },
   "TURTLE_S2": {
    "authoritativeRunId": "39397517900",
    "authoritativeVersion": "Supertrader 2.0 Turtle research engine (BASE_S0)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "NOT_PUBLISHED_BY_REFERENCE",
    "ledgerSha256Value": "67169e865384b866f2e51203dda75baff4778d125c5e1f60b67cb642c63b01f0"
   },
   "MINERVINI_SEPA": {
    "authoritativeRunId": "39746264325",
    "authoritativeVersion": "Supertrader 4.0 Minervini lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "1ca5239107bd8bf1da18dfe730329878d21f9d8d2e6233e0ab5645d1f32d3326",
    "tradeCount": "EQUAL"
   },
   "MINERVINI_POWER_PLAY": {
    "authoritativeRunId": "39746264325",
    "authoritativeVersion": "Supertrader 4.0 Minervini lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "877ceb333831fdcbc25b34b81b254bbdf9845dcc89966d26cb93e595490d0fb3",
    "tradeCount": "EQUAL"
   },
   "DARVAS": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "2be4ed71c1d208d4396655d6419d1c3b6824ce86a4ab97eac0a9e63fd7b08656",
    "tradeCount": "EQUAL"
   },
   "KK_BREAKOUT": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "8b4dfb91b0c1f2b1779cac16da58b3c9a3c187c476ea9f5ce067e8c869c02ba6",
    "tradeCount": "EQUAL"
   },
   "POCKET_PIVOT": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "6cafafc74084ee1504cac4bb10af1becdaecdc316dd95069c518fd976816468a",
    "tradeCount": "EQUAL"
   },
   "BUYABLE_GAP_UP": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "2ad276dfcbbbfa2111248f6634f1e247ec35a6c4986637b49c849f24add20174",
    "tradeCount": "EQUAL"
   },
   "WEINSTEIN_INVESTOR": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "153ea35d1da59fa9a74be96f6278a6bda2d6a29782a75dfefe97bd4257a6fb15",
    "tradeCount": "EQUAL"
   },
   "WEINSTEIN_TRADER": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "0d869af00104d8402329d4888e0b0b3c29354e955f7c92d51847db5842a662e9",
    "tradeCount": "EQUAL"
   },
   "HOLY_GRAIL_W_RAS97": {
    "authoritativeRunId": "39939890956",
    "authoritativeVersion": "Supertrader 5.0 lifecycle (REF)",
    "ledgerSha256": "EQUAL",
    "tradesSha256": "EQUAL",
    "ledgerSha256Value": "875cda8c3a884c7615e9ea59e00d35ae1d1017a9b2f36766c6a4c3b1089aa434",
    "tradeCount": "EQUAL"
   }
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
 "holdout": {
 "runId": "40007428374",
 "commit": "d259f2173cc8ac6e705e5a7ef8ecf7f600384acd",
 "snapshotId": "sts1-85959e4bab0681baa6ed221bee94821e",
 "snapshotCaptureRun": "39998409317",
 "datasetVerified": "EXACT",
 "windowName": "HOLDOUT",
 "window": {
  "from": "2008-01-02",
  "to": "2015-12-31"
 },
 "neverOpenedWindow": false,
 "windowStatus": "PREVIOUSLY_OPENED_ONCE_R14_FOR_OTHER_IMPLEMENTATIONS; SURVIVORSHIP_LIMITED (Tiingo ticker list: 813 of 6 427 listings inactive at the as-of date; 678 delisted segments)",
 "protocolSha256": "c7702e77eb768b718b57691323afa052c949200379ab7a562b2b1d47366f7c25",
 "references": {
  "TURTLE_S1": {
   "candidateId": "C01",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 713,
     "reconciliation": true,
     "tradesSha256": "eab9a0b39dd50a72fffb49aecf565de36e0b4608370dd0dcdc280f54e3376677"
    },
    "REF": {
     "trades": 716,
     "reconciliation": true,
     "tradesSha256": "0c53ef4d986d973392302b2d0c89b826f2fdee6818e735f6868b0775fc9c94c3"
    },
    "COST-20": {
     "trades": 801,
     "reconciliation": true,
     "tradesSha256": "e1cce47f02a2801b6266edeb93e83f4f237cd4ee3e3cf5bb34294c132832685e"
    },
    "COST-50": {
     "trades": 683,
     "reconciliation": true,
     "tradesSha256": "3e96ae73ecbc96e4d812cbdd7605160c3df447b12e9986d7fc8b58ca84ea7dca"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 397,
     "P2": 319
    },
    "byRegime": {
     "UNKNOWN": 2,
     "SPY_AT_OR_BELOW_SMA200": 244,
     "SPY_ABOVE_SMA200": 470
    },
    "byLiquidity": {
     "1M_TO_5M": 270,
     "5M_TO_25M": 218,
     "GE_25M": 228
    },
    "byYear": {
     "2008": 117,
     "2009": 108,
     "2010": 96,
     "2011": 76,
     "2012": 123,
     "2013": 80,
     "2014": 60,
     "2015": 56
    }
   }
  },
  "TURTLE_S2": {
   "candidateId": "C02",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 523,
     "reconciliation": true,
     "tradesSha256": "d9f4a3ff8c940864462fa21cca5a4a45599f9e33432b12252aa3c9eef7ac5465"
    },
    "REF": {
     "trades": 530,
     "reconciliation": true,
     "tradesSha256": "5f90eea423a951f4df8f618747b5a7601219c10827d3fc05a3bc4f853cb8a001"
    },
    "COST-20": {
     "trades": 482,
     "reconciliation": true,
     "tradesSha256": "d2507cfe5a3d145f98cbaec47899432e2bcb1ff6deaccd1be53760e53f56d6b1"
    },
    "COST-50": {
     "trades": 391,
     "reconciliation": true,
     "tradesSha256": "c0bf577c0a394ee423137e954d5c78f1451f6b51af79728ffc89df57881a8cb4"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 310,
     "P2": 220
    },
    "byRegime": {
     "UNKNOWN": 2,
     "SPY_AT_OR_BELOW_SMA200": 192,
     "SPY_ABOVE_SMA200": 336
    },
    "byLiquidity": {
     "1M_TO_5M": 195,
     "5M_TO_25M": 181,
     "GE_25M": 154
    },
    "byYear": {
     "2008": 77,
     "2009": 87,
     "2010": 63,
     "2011": 83,
     "2012": 82,
     "2013": 49,
     "2014": 63,
     "2015": 26
    }
   }
  },
  "MINERVINI_SEPA": {
   "candidateId": "C06",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 543,
     "reconciliation": true,
     "tradesSha256": "c20730fa6a1bdab32cfdf62ddead0f466f42e431a12ce2576d450f52804c592d"
    },
    "REF": {
     "trades": 522,
     "reconciliation": true,
     "tradesSha256": "9b152403cd480c892dbb4503bed982649bccf13080205d58287059920992feb6"
    },
    "COST-20": {
     "trades": 546,
     "reconciliation": true,
     "tradesSha256": "51ad66205c0df89168f52f0d482a62dcb68d05af7f09e74e37aa07b459d83494"
    },
    "COST-50": {
     "trades": 540,
     "reconciliation": true,
     "tradesSha256": "185f466471b8d172adde06c3be4fafd8045de05580d693487e68f8e4b2b08e0c"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 255,
     "P2": 267
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 151,
     "SPY_ABOVE_SMA200": 371
    },
    "byLiquidity": {
     "GE_25M": 174,
     "1M_TO_5M": 157,
     "5M_TO_25M": 191
    },
    "byYear": {
     "2008": 66,
     "2009": 41,
     "2010": 68,
     "2011": 80,
     "2012": 62,
     "2013": 53,
     "2014": 66,
     "2015": 86
    }
   },
   "fundamentalsSplitConsistency": {
    "version": "sf6-minervini-fundamentals-split-consistent-1.0.0",
    "entries": 522,
    "withEvidence": 278,
    "withCorrectedQuarter": 7,
    "withUndeterminableQuarter": 46,
    "latestYoyChanged": 12,
    "acceleratingChanged": 15
   }
  },
  "MINERVINI_POWER_PLAY": {
   "candidateId": "C07",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 427,
     "reconciliation": true,
     "tradesSha256": "7317eeb779fa994cad26abba7fce9858769718c2485d38eb15e82d02fcef2629"
    },
    "REF": {
     "trades": 425,
     "reconciliation": true,
     "tradesSha256": "0cf093286409d0cb7676dc7f5437079e0c3c673a437524355b039a4205f30e51"
    },
    "COST-20": {
     "trades": 427,
     "reconciliation": true,
     "tradesSha256": "94e0e003d8dfa2a6262be8d33a6a1e6af862b44bf6b3b0b4038bd559c4881246"
    },
    "COST-50": {
     "trades": 421,
     "reconciliation": true,
     "tradesSha256": "07f474e6cbcb6fffa28468e592460e3a979a5f95db05b6c223d41d720d99ed6c"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 249,
     "P2": 176
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 156,
     "SPY_ABOVE_SMA200": 269
    },
    "byLiquidity": {
     "GE_25M": 110,
     "5M_TO_25M": 153,
     "1M_TO_5M": 162
    },
    "byYear": {
     "2008": 70,
     "2009": 87,
     "2010": 53,
     "2011": 39,
     "2012": 23,
     "2013": 60,
     "2014": 42,
     "2015": 51
    }
   }
  },
  "DARVAS": {
   "candidateId": "C03",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 11942,
     "reconciliation": true,
     "tradesSha256": "c2bfeec708dee93c71f1d8240f2e669ca82b17c2301d91ed03da627c5a46a3de"
    },
    "REF": {
     "trades": 11869,
     "reconciliation": true,
     "tradesSha256": "f7805b367114bff72f984a958fb1761e4e5c2deb699bf021e5a0a311ce4397cb"
    },
    "COST-20": {
     "trades": 11300,
     "reconciliation": true,
     "tradesSha256": "406905a21bdc29bfc57eda8bd9fd64a31b292271dde9e53167b0a66d01b2bc8b"
    },
    "COST-50": {
     "trades": 6190,
     "reconciliation": true,
     "tradesSha256": "f933b2acfe779459e3c8d23d4e0d0be982a8b279372a79c15960446d68b336e3"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 3218,
     "P2": 8651
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 1384,
     "SPY_ABOVE_SMA200": 10485
    },
    "byLiquidity": {
     "GE_25M": 5483,
     "1M_TO_5M": 2234,
     "5M_TO_25M": 4152
    },
    "byYear": {
     "2008": 679,
     "2009": 310,
     "2010": 1035,
     "2011": 1194,
     "2012": 1342,
     "2013": 2927,
     "2014": 2332,
     "2015": 2050
    }
   }
  },
  "KK_BREAKOUT": {
   "candidateId": "C08",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 5813,
     "reconciliation": true,
     "tradesSha256": "3cfd605b19029346dc0f7c1cf267cf1d88258f51a2048b84ecfcdbe84b23e8ea"
    },
    "REF": {
     "trades": 5722,
     "reconciliation": true,
     "tradesSha256": "2403f27c2cbc060d621025244474c1a55d23258fd2e72ce4f7b79ec28eafe560"
    },
    "COST-20": {
     "trades": 5331,
     "reconciliation": true,
     "tradesSha256": "7b8fbbec6e4d1644a252fcaa3a9fa6f8c09ee1f6a313b70eba19b8bd14bf7704"
    },
    "COST-50": {
     "trades": 3523,
     "reconciliation": true,
     "tradesSha256": "47046a9e7e1bc0836ce9977f87675f4a5f282bba370f8b536307608f053a95b5"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 3027,
     "P2": 2695
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 1661,
     "SPY_ABOVE_SMA200": 4061
    },
    "byLiquidity": {
     "GE_25M": 1572,
     "1M_TO_5M": 2091,
     "5M_TO_25M": 2059
    },
    "byYear": {
     "2008": 748,
     "2009": 976,
     "2010": 668,
     "2011": 635,
     "2012": 620,
     "2013": 745,
     "2014": 661,
     "2015": 669
    }
   }
  },
  "POCKET_PIVOT": {
   "candidateId": "C11",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 1400,
     "reconciliation": true,
     "tradesSha256": "41be951bd6018f26953d7448611940664c849d07ad981eed7fd81c98d508fd4f"
    },
    "REF": {
     "trades": 1415,
     "reconciliation": true,
     "tradesSha256": "64be0a52b4a42f1b8871181b1e9cb77e2f1a812fb913302baec33154c0ae1256"
    },
    "COST-20": {
     "trades": 1426,
     "reconciliation": true,
     "tradesSha256": "ebfb1a5513e0c720f532326b558b74e5db412121aa2217790691404fe3b96ce9"
    },
    "COST-50": {
     "trades": 1396,
     "reconciliation": true,
     "tradesSha256": "0a9dafcf6fe257ea14c684bd74e7de961f4edd10d0776cb66091ec924f78a228"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 760,
     "P2": 655
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 581,
     "SPY_ABOVE_SMA200": 834
    },
    "byLiquidity": {
     "5M_TO_25M": 462,
     "GE_25M": 443,
     "1M_TO_5M": 510
    },
    "byYear": {
     "2008": 257,
     "2009": 150,
     "2010": 152,
     "2011": 201,
     "2012": 171,
     "2013": 122,
     "2014": 172,
     "2015": 190
    }
   }
  },
  "BUYABLE_GAP_UP": {
   "candidateId": "C12",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 2114,
     "reconciliation": true,
     "tradesSha256": "e8bfe81bfe11f7ef3b9ca10b54e8396b4c224f0198fc0b234c01248f5da5a0c7"
    },
    "REF": {
     "trades": 2116,
     "reconciliation": true,
     "tradesSha256": "2dea46d18f01b61a069c8c46441e63b7819b9790ad8ae76982434137b1464045"
    },
    "COST-20": {
     "trades": 2214,
     "reconciliation": true,
     "tradesSha256": "3c7eef3cfffdadf500e541a9f8b790475398ba6fc1fb1eaad7e22099c83fec04"
    },
    "COST-50": {
     "trades": 2178,
     "reconciliation": true,
     "tradesSha256": "3f7ceaf7e007a4e6f708b319fc5c4cd58d32ea3cdaa9b62d99ae516eee127b5e"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 1065,
     "P2": 1051
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 621,
     "SPY_ABOVE_SMA200": 1495
    },
    "byLiquidity": {
     "1M_TO_5M": 674,
     "5M_TO_25M": 715,
     "GE_25M": 727
    },
    "byYear": {
     "2008": 294,
     "2009": 226,
     "2010": 286,
     "2011": 259,
     "2012": 283,
     "2013": 218,
     "2014": 302,
     "2015": 248
    }
   }
  },
  "WEINSTEIN_INVESTOR": {
   "candidateId": "C04",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 989,
     "reconciliation": true,
     "tradesSha256": "ef0a731123b57dc43aad992eb7b109cf22f7eb0d16a43b2f73d0baf44d9abd12"
    },
    "REF": {
     "trades": 995,
     "reconciliation": true,
     "tradesSha256": "02aadd70b8beebddb5ad00666711156f7f9320860c8f96f65455ee241e7e11a0"
    },
    "COST-20": {
     "trades": 977,
     "reconciliation": true,
     "tradesSha256": "ab62186025f05b115a3c1a8b75df11b9d52a4cef03f315c5eb8ac2efeb579171"
    },
    "COST-50": {
     "trades": 1004,
     "reconciliation": true,
     "tradesSha256": "44dc902ac46dcbfefc7aec8108f60da1558ebff63ca11bed841e08c1491ebe8a"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 662,
     "P2": 333
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 591,
     "SPY_ABOVE_SMA200": 404
    },
    "byLiquidity": {
     "1M_TO_5M": 294,
     "5M_TO_25M": 327,
     "GE_25M": 374
    },
    "byYear": {
     "2008": 330,
     "2009": 154,
     "2010": 72,
     "2011": 106,
     "2012": 96,
     "2013": 65,
     "2014": 77,
     "2015": 95
    }
   }
  },
  "WEINSTEIN_TRADER": {
   "candidateId": "C05",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 1397,
     "reconciliation": true,
     "tradesSha256": "f95c152901a4b49f2557bcc88dc072631720d896f09ab0a4fb81393ffd2c43fd"
    },
    "REF": {
     "trades": 1296,
     "reconciliation": true,
     "tradesSha256": "6788a72eb2fb6bc5f88abb7276fb82f45e5dbe1277f76ab5508b9e1343d36c7d"
    },
    "COST-20": {
     "trades": 1417,
     "reconciliation": true,
     "tradesSha256": "e315f573089ce04cca0c9efa1e575117ec67caf2076a4ba8600c11d84625796f"
    },
    "COST-50": {
     "trades": 1377,
     "reconciliation": true,
     "tradesSha256": "4b24b01e3461aaec837185df4a259e6698ab5da1b9ad1b19929f429236ec2574"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 842,
     "P2": 454
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 654,
     "SPY_ABOVE_SMA200": 642
    },
    "byLiquidity": {
     "5M_TO_25M": 458,
     "GE_25M": 395,
     "1M_TO_5M": 443
    },
    "byYear": {
     "2008": 339,
     "2009": 189,
     "2010": 145,
     "2011": 169,
     "2012": 125,
     "2013": 94,
     "2014": 109,
     "2015": 126
    }
   }
  },
  "HOLY_GRAIL_W_RAS97": {
   "candidateId": "C13",
   "neverOpenedWindow": false,
   "costLevels": {
    "COST-0": {
     "trades": 3336,
     "reconciliation": true,
     "tradesSha256": "345cda3f9189efac33f3748ac84506b13104772a06b24406650c7a0c013002be"
    },
    "REF": {
     "trades": 3253,
     "reconciliation": true,
     "tradesSha256": "b571ec14825eecd0905f6647036e4f6b875a0db02f347edd83f0ea8193cfda20"
    },
    "COST-20": {
     "trades": 3343,
     "reconciliation": true,
     "tradesSha256": "30c8b95b0210d4473e398aa1701288f99513baa30d4d308ae154242f3bc8fdcf"
    },
    "COST-50": {
     "trades": 3067,
     "reconciliation": true,
     "tradesSha256": "8a4e609436b8059dc695388426aabc8b34455eaf437f264610feb896e65c9e99"
    }
   },
   "splits": {
    "byPeriod": {
     "P1": 1508,
     "P2": 1745
    },
    "byRegime": {
     "SPY_AT_OR_BELOW_SMA200": 955,
     "SPY_ABOVE_SMA200": 2298
    },
    "byLiquidity": {
     "5M_TO_25M": 1123,
     "GE_25M": 901,
     "1M_TO_5M": 1229
    },
    "byYear": {
     "2008": 498,
     "2009": 365,
     "2010": 322,
     "2011": 323,
     "2012": 402,
     "2013": 458,
     "2014": 444,
     "2015": 441
    }
   }
  }
 },
 "models": {
  "SF6-MODEL-PP-STOP-SIGNAL-DAY-LOW": {
   "id": "SF6-MODEL-PP-STOP-SIGNAL-DAY-LOW",
   "candidateId": "C11",
   "phaseClosed": "INITIAL_STOP",
   "trades": 3403,
   "reconciliation": true
  },
  "SF6-MODEL-HG-TRAIL-SWING-LOWS": {
   "id": "SF6-MODEL-HG-TRAIL-SWING-LOWS",
   "candidateId": "C13",
   "phaseClosed": "POSITION_MANAGEMENT",
   "trades": 1823,
   "reconciliation": true
  },
  "SF6-DATA-DAR-ATH-VERIFIED-LISTING": {
   "id": "SF6-DATA-DAR-ATH-VERIFIED-LISTING",
   "candidateId": "C03",
   "phaseClosed": null,
   "trades": 3349,
   "reconciliation": true
  }
 }
}
});
