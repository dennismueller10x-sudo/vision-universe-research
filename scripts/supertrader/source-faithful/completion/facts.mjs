/**
 * Facts the completion artifacts cite that are not derivable from the contracts: the repository data inventory for
 * the blocked data needs (checked 2026-10-20 against the committed files and docs named in `evidence`) and the public
 * receipts of the reference snapshot runs. Every entry names its evidence; nothing here is a result or a status.
 */

/** Data needs -> what exists, whether it is point-in-time, and the procurement contract (mandate section 13). */
export const DATA_CATALOGUE = Object.freeze([
  { need: 'PIT_INDUSTRY_GROUPS', usedBy: ['TUR-SF-LIMIT-CORR (C01/C02)', 'WEIN-SF-GROUP (C04/C05)', 'DAR-SF-SELECTION evidence (C03)'],
    inRepository: 'SEC SIC per issuer (quant/data/fundamentals/issuers/*.json, 5,371 of 5,479 issuers) and quant/data/product/sic-peer-taxonomy-v1.json - CURRENT values only; CIK per snapshot listing via scripts/supertrader/validation/sec-pit.mjs (SEC history attached to 6,148 of 9,211 segments, delisted 2,101 of 3,226 in run 39392734794)',
    pointInTime: false, evidence: 'sic-peer-taxonomy-v1.json: snapshotMode CURRENT_ONLY, historicalClassificationAvailable false, backtestEligible false; the licensed provider supplies no sector field in the current plan (docs/TIINGO_COMMERCIAL_SCALE_PHASE1.md; quant/data/market/factors sector SOURCE_MISSING)',
    // owner-approved availability check 2026-10-20 (targeted sample, SEC fair-access User-Agent of the repository; no pipeline built)
    availabilityCheck: Object.freeze({
      date: '2026-10-20',
      requests: 'about 20 (4 issuers: submissions JSON, 12 filing headers, 1 Financial Statement Data Sets quarter)',
      findings: Object.freeze([
        'data.sec.gov/submissions/CIK##########.json carries only the CURRENT sic (no history)',
        'every filing header (Archives/edgar/data/<cik>/<accession>.hdr.sgml) records the SIC at filing time: AMAZON COM INC 10-K405 1998-03-30 SIC 2731, 10-K 2012 and 2026 SIC 5961 (current) - historical SIC differs from today and is recoverable; Apple 3571, Netflix 7841, IBM 3570 unchanged across their first / middle / last 10-K',
        'headers carry ACCEPTANCE-DATETIME in the 2003+ samples and none in the 1994 / 1998 samples (there the filing date is the earliest-known time, day granularity)',
        'SEC Financial Statement Data Sets (www.sec.gov/files/dera/data/financial-statement-data-sets/<yyyy>q<n>.zip, quarterly from 2009q2) sub.txt has per XBRL filing: adsh, cik, sic, form, filed, accepted - a bulk point-in-time SIC series for 10-K / 10-Q filers covering the snapshot window 2016-2026 (one quarter about 100 MB zipped)',
      ]),
      limits: Object.freeze([
        'SIC is the SEC staff classification of the registrant (Standard Industrial Classification, 4 digits); it is not a correlation measure and not an investment industry-group scheme',
        'only SEC registrants with filings: ETFs, ADRs filing 20-F (FSDS covers 20-F XBRL only from about 2017), and listings without a CIK mapping get no group (groupsOf -> null, counted, run labelled ENFORCED_PARTIAL_GROUP_COVERAGE)',
        'before the first filing seen in the window the group is unknown (no back-fill)',
      ]),
    }),
    priority: 3, recommendation: 'build once in a separate Quant/SEC PR: FSDS sub.txt 2009q2-current for XBRL filers, filing headers for the rest; no paid provider',
    implementationContract: 'see docs/SUPERTRADER_2_PIT_INDUSTRY_GROUPS_CONTRACT.md: sicHistory(cik) -> [{ sic, effectiveFrom: acceptance time (else filing date), accession, form, source }]; groupsOf(securityId, priorSessionDate) -> { closely, loosely } | null, derived from the SIC in force at the prior session and an OWNER-CHOSEN level mapping; the Turtle engine already enforces TUR-LIMIT6/10 with it (methods/turtle.mjs#correlationLimitBreach); Weinstein WEIN-GROUP additionally needs a group chart (member index), a separate owner decision',
    ownerDecision: 'which SIC level is "closely" and which "loosely" correlated (candidates: 4-digit industry, 3-digit industry group, 2-digit major group, division) - no level is implemented; also whether Weinstein\'s "group" uses the same level' },
  { need: 'MARKET_BREADTH_HISTORY', usedBy: ['WEIN-SF-MARKET (C04/C05)'],
    inRepository: 'quant/data/market/intelligence/market-pulse-history.json: advance / decline and new highs / lows of the VU universe, live-logged only: breadth log from 2026-09-18 (16 rows), advance / decline log from 2026-09-24 (15 rows)',
    pointInTime: true, evidence: 'the file states breadth is not reconstructable backwards (survivorship); NYSE A/D is not in the repository (docs/SUPERTRADER_STRATEGY_COVERAGE_MATRIX.md WEIN-CTX-MI / -HL)',
    priority: 4, recommendation: 'NYSE advance / decline and new highs / lows history from a licensed provider; a breadth series computed from the snapshot PIT universe would be a substitute measure, not Weinstein\'s, and is not used as a gate',
    implementationContract: 'daily NYSE advances, declines, new highs, new lows with the session date; consumed only as evidence for the WEIN-MR-MARKET review question unless the owner accepts a gate',
    ownerDecision: 'provider and licence (cost)' },
  { need: 'HISTORICAL_EPS_REVENUE_PIT', usedBy: ['MIN-SF-FUNDAMENTALS evidence (C06)', 'DAR-SF-SELECTION evidence (C03)'],
    inRepository: 'quant/data/sec/consumer/CIK*.json (as_of_latest, last 8 quarters); full PIT store (original filing dates) in private R2 v1/sec/fundamentals; 5 canonical PIT files committed',
    pointInTime: 'PARTIAL', evidence: 'docs/SEC_PIT_METHODOLOGY.md (available_from = acceptance time where joined, otherwise the filing date, day granularity; bulk companyfacts carry `filed` only); consumer layer `filed` is the latest re-report, not the first report',
    priority: 1, recommendation: 'use the private SEC PIT store with policy `original` (first-reported values, available_from) as reviewer evidence; it is public-domain data already captured',
    implementationContract: 'secFacts(cik, metric, asOf) -> values whose available_from <= asOf; evidence only for MIN-MR-QUALITY (no percentage gate: #709 forbids an invented EPS / sales gate)',
    ownerDecision: 'none for evidence use; the gate itself stays manual by source' },
  { need: 'ANALYST_ESTIMATES_SURPRISES_GUIDANCE', usedBy: ['MIN-SF-FUNDAMENTALS (C06)', 'KK-SF-EP-CATALYST (C09)'],
    inRepository: 'none', pointInTime: false, evidence: 'quant/data/sec/pit_gates.json analystEstimates false; docs/VU_FREE_DATA_SOURCE_MAP.md "not present"',
    priority: 4, recommendation: 'licensed estimates history with announcement timestamps; not subscribed in this work', implementationContract: 'estimates(cik, asOf) with first-known timestamps', ownerDecision: 'provider and licence (cost)' },
  { need: 'IBD_RS_RATING', usedBy: ['MIN-SF-TT-8 (C06)'],
    inRepository: 'none (proprietary); a VU cross-sectional percentile exists in scripts/supertrader/build.mjs over the current surviving universe', pointInTime: false,
    evidence: '#709: "Ein VU-Perzentil mit ähnlicher Skala ist kein identischer IBD-Rang"; docs/SUPERTRADER_BACKTEST_DATA_FEASIBILITY.md (survivorship bias of the current-universe RS)',
    priority: 4, recommendation: 'none can be substituted; a PIT percentile over the snapshot universe can be reported as evidence (never a gate)', implementationContract: 'rsProxy(vuPercentile) stays evidence (methods/minervini.mjs)', ownerDecision: 'IBD data licence (if ever)' },
  { need: 'INTRADAY_BARS_FROZEN', usedBy: ['KK-SF-EP-ENTRY / KK-SF-EP-VOLUME (C09)', 'KK-SF-PS-ENTRY / KK-SF-PS-STOP (C10)', 'KK-SF-BO-ORH (C08)', 'MOKA intraday projected volume (C11/C12)'],
    inRepository: 'rolling 2-session IEX 5-minute window (quant/data/market/intraday); Tiingo IEX 1-minute history from 2017 cached privately for r9 (not frozen in the snapshot)',
    pointInTime: true, evidence: 'docs/SUPERTRADER_VALIDATION_INTERNAL.md (IEX from 2017, 2016 empty); IEX carries only about 1-3 % of consolidated volume; docs/TIINGO_COMMERCIAL_PHASE1_REMEDIATION.md blocks stream candles for backtests',
    priority: 2, recommendation: 'freeze the r9 IEX minute cache for the candidate days into a snapshot generation (licensed, internal non-display use); IEX volume cannot answer "opening volume = daily average in 15-20 minutes" (KK-SF-EP-VOLUME) - that needs consolidated (SIP) minute volume',
    implementationContract: 'minuteBars(securityId, date) with feed = IEX | SIP, frozen in the snapshot manifest; ORH / VWAP computed only from the declared feed; IEX-only volume never answers a consolidated-volume rule',
    ownerDecision: 'snapshot generation with minute data (storage) and, for volume rules, a SIP minute licence (cost)' },
  { need: 'CATALYST_TIMESTAMPS', usedBy: ['KK-SF-EP-CATALYST (C09)'],
    inRepository: 'company-intelligence ledger (private R2, upcoming earnings for 85 issuers); SEC filed dates as reporting-date proxy (scripts/company_intelligence/reporting_calendar.py: "never official earnings dates")',
    pointInTime: 'PARTIAL', evidence: 'docs/COMPANY_INTELLIGENCE.md; docs/VU_FREE_DATA_SOURCE_MAP.md (8-K Item 2.02 named as source for past earnings)',
    priority: 3, recommendation: 'SEC 8-K Item 2.02 acceptance timestamps (public domain) give a first-known time for earnings releases; "unexpected and significant" stays a reviewer judgment (KK-MR-CATALYST)',
    implementationContract: 'catalysts(securityId, from, to) -> [{ acceptedAt, form, item }]; a gap day is linked to a catalyst only if acceptedAt <= session open', ownerDecision: 'none for SEC 8-K; news feeds need a licence' },
  { need: 'SHORT_BORROW_LOCATE', usedBy: ['KK-SF-PS-BORROW (C10)', 'TUR-SF-SHORT (C01/C02 ORIGINAL)'],
    inRepository: 'none', pointInTime: false, evidence: 'docs/VU_FREE_DATA_SOURCE_MAP.md: FINRA short interest FREE_SOURCE_LICENSE_REVIEW, licence UNKNOWN; borrow fees / locates not available anywhere',
    priority: 4, recommendation: 'historical borrow availability and fee (prime-broker / securities-lending data); FINRA short interest is no substitute for borrowability', implementationContract: 'borrow(securityId, date) -> { available, feeBps } known before the open', ownerDecision: 'provider and licence (cost)' },
  { need: 'PIT_MARKET_CAP', usedBy: ['MOKA-SF-BGU-MEGA (C12)'],
    inRepository: 'SEC shares outstanding (consumer layer, as_of_latest, 8 quarters); valuation-coverage-v1 market cap for 3,770 of 6,441 (current)', pointInTime: 'PARTIAL',
    evidence: 'quant/data/product/valuation-coverage-v1.json (NO_PIT_SHARE_COUNT 801); share-count-provenance-v1.json', priority: 1,
    recommendation: 'PIT shares outstanding from the SEC store (dei:EntityCommonStockSharesOutstanding with available_from) x snapshot raw close gives a PIT market cap as evidence for the megacap question; the exception itself stays a reviewer decision (#709 gives one example, no threshold)',
    implementationContract: 'marketCap(securityId, date) = sharesOutstanding(asOf filing <= date) x raw close(date); evidence only', ownerDecision: 'none (evidence); a megacap threshold would be invented and is not used' },
  { need: 'LISTING_TO_DATE_HISTORY', usedBy: ['DAR-SF-ATH (C03)'],
    inRepository: 'snapshot series start at the 2015 warm-up; weekly split-adjusted series from 1990 (quant/data/market/discover-series-long, 6,175 files, survivors) and the private Tiingo daily store from 1990',
    pointInTime: true, evidence: 'contracts/darvas.mjs dataPartial; docs/SUPERTRADER_BACKTEST_DATA_FEASIBILITY.md (survivors only before the snapshot)',
    priority: 2, recommendation: 'extend the snapshot generation with the pre-2015 daily highs of each listing (max high only, licensed internal use); the pre-snapshot stores hold survivors only and start in 1990, so for delisted and pre-1990 listings the flag ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED stays (asymmetric coverage, declared)', implementationContract: 'priorMaxHigh(listingId, date) frozen in the snapshot manifest', ownerDecision: 'snapshot generation (storage)' },
  { need: 'FUTURES_CHAINS', usedBy: ['TUR-CONTRACT / TUR-ROLL (C01/C02 ORIGINAL replication)'],
    inRepository: 'none', pointInTime: false, evidence: 'contracts/turtle.mjs scope ORIGINAL', priority: 4, recommendation: 'only needed to replicate the futures original; the equity research engine does not need it', implementationContract: 'continuous contract months with roll dates and multipliers', ownerDecision: 'out of scope unless the owner wants the futures replication' },
]);

/** Per method: the catalogue needs that block or limit it. */
export const METHOD_DATA = Object.freeze({
  SF_TURTLE_S1: ['PIT_INDUSTRY_GROUPS', 'SHORT_BORROW_LOCATE (ORIGINAL)', 'FUTURES_CHAINS (ORIGINAL)'],
  SF_TURTLE_S2: ['PIT_INDUSTRY_GROUPS', 'SHORT_BORROW_LOCATE (ORIGINAL)', 'FUTURES_CHAINS (ORIGINAL)'],
  SF_DARVAS_BOX: ['LISTING_TO_DATE_HISTORY', 'PIT_INDUSTRY_GROUPS (evidence)', 'HISTORICAL_EPS_REVENUE_PIT (evidence)'],
  SF_WEINSTEIN_INVESTOR: ['PIT_INDUSTRY_GROUPS', 'MARKET_BREADTH_HISTORY'],
  SF_WEINSTEIN_TRADER: ['PIT_INDUSTRY_GROUPS', 'MARKET_BREADTH_HISTORY'],
  SF_MINERVINI_SEPA_VCP: ['IBD_RS_RATING', 'HISTORICAL_EPS_REVENUE_PIT (evidence)', 'ANALYST_ESTIMATES_SURPRISES_GUIDANCE (evidence)'],
  SF_MINERVINI_POWER_PLAY: [],
  SF_KK_BREAKOUT: ['INTRADAY_BARS_FROZEN (optional ORH variant)'],
  SF_KK_EPISODIC_PIVOT: ['CATALYST_TIMESTAMPS', 'INTRADAY_BARS_FROZEN', 'ANALYST_ESTIMATES_SURPRISES_GUIDANCE'],
  SF_KK_PARABOLIC_SHORT: ['INTRADAY_BARS_FROZEN', 'SHORT_BORROW_LOCATE'],
  SF_MOKA_POCKET_PIVOT: ['INTRADAY_BARS_FROZEN (projected volume, optional)'],
  SF_MOKA_BUYABLE_GAP_UP: ['PIT_MARKET_CAP (evidence)', 'INTRADAY_BARS_FROZEN (projected volume, optional)'],
  SF_RASCHKE_HOLY_GRAIL: ['INTRADAY_BARS_FROZEN (intraday timeframes, optional)'],
});

/**
 * Public receipts of the snapshot runs (workflow mode sf-research). Results are sealed for the owner; only hashes,
 * counts and pass flags are public. The 2026-10-19 run is the regression reference of sf-turtle-1.0.0 /
 * sf-darvas-1.0.0 (docs/SUPERTRADER_SOURCE_FAITHFUL_IMPLEMENTATION_REPORT.md, question 13).
 */
export const REFERENCE_RUNS = Object.freeze([
  { method: 'SF_TURTLE_S1', kind: 'METHOD', runId: '39271055007', date: '2026-10-19', codeVersion: 'sf-turtle-1.0.0', codeSha256: null, receiptSha256Prefix: '64b9aece4cb32f43', trades: { BASE_S0: 827, DELIST_S1_MINUS_30: 789, DELIST_S2_DISTRESS_ZERO: 789, COST2_S1: 805, DATA_EVENT_MINUS_30: 796 }, allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  { method: 'SF_TURTLE_S2', kind: 'METHOD', runId: '39271055007', date: '2026-10-19', codeVersion: 'sf-turtle-1.0.0', codeSha256: null, receiptSha256Prefix: 'd32dd805a3a4429b', trades: { BASE_S0: 609, DELIST_S1_MINUS_30: 578, DELIST_S2_DISTRESS_ZERO: 578, COST2_S1: 578, DATA_EVENT_MINUS_30: 659 }, allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  // 2026-10-25: sf-turtle-1.3.0 (Supertrader 7.0, SF7-D3, owner decision E7-3) - corrected optimistic reading as the new
  // scenario ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE; every scenario of 39397517900 (BASE_S0 included) reproduced with an identical
  // public block (ledgerSha256, trades, execution counts); ENTRY_BAR_OPTIMISTIC kept unchanged, SUPERSEDED_SF7_D3
  { method: 'SF_TURTLE_S1', kind: 'METHOD', runId: '40170829944', date: '2026-10-25', codeVersion: 'sf-turtle-1.3.0', codeSha256: '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24', receiptSha256Prefix: '11e26fde6d2e0c30', trades: { BASE_S0: 820, DELIST_S1_MINUS_30: 980, DELIST_S2_DISTRESS_ZERO: 980, COST2_S1: 841, DATA_EVENT_MINUS_30: 747, FAILSAFE_EXIT_20D: 574, ENTRY_BAR_OPTIMISTIC: 786, ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: 862, S1_OPEN_BREAKOUT_TAKEN: 803 }, failsafeEntries: { BASE_S0: 710, FAILSAFE_EXIT_20D: 489, ENTRY_BAR_OPTIMISTIC: 709, ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: 754, S1_OPEN_BREAKOUT_TAKEN: 18 }, entries: { BASE_S0: 825, ENTRY_BAR_OPTIMISTIC: 789, ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: 865, S1_OPEN_BREAKOUT_TAKEN: 806 }, sameBarCertain: { ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: { byOpenFill: 69, byClose: 30 } }, ledgerSha256: {"BASE_S0":"884d88cb519426e191e11ad40255faa431b374c190fccaa23bdeff2a41bb8610","DELIST_S1_MINUS_30":"6a8af7d857e5dd34f101ef5d90499b3e68bd3dbfc6c87e2e8af65d2fc0d60967","DELIST_S2_DISTRESS_ZERO":"6a8af7d857e5dd34f101ef5d90499b3e68bd3dbfc6c87e2e8af65d2fc0d60967","COST2_S1":"64129d6bbf7854b59de69d87f773b926483c85160a46faa58a6faabb31cae57f","DATA_EVENT_MINUS_30":"1f8294a4669f555ea93b76d0bb08678ec563a2724f1f5837a1a24de486878dbc","FAILSAFE_EXIT_20D":"46dfbd461740674663eea8380ffa05b491134c81d2de916c4e8b51e18ee4bdd1","ENTRY_BAR_OPTIMISTIC":"52d0c849f31e52d9b9457f7756d398decb5c697cc75a28cc1c121d052f0c7671","ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE":"110e609578f55baa6c22171e632458766d46459fd32a8d23b3b878158c1214a0","S1_OPEN_BREAKOUT_TAKEN":"0962d871e680eceaedf28884e59481e74b5087b27c1994fc64a9f506517dacfd"}, publicScenarioBlocksIdenticalToRun: '39397517900', correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'CURRENT_ENGINE' },
  { method: 'SF_TURTLE_S2', kind: 'METHOD', runId: '40170829944', date: '2026-10-25', codeVersion: 'sf-turtle-1.3.0', codeSha256: '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24', receiptSha256Prefix: 'b30f6c04ffdb48f5', trades: { BASE_S0: 559, DELIST_S1_MINUS_30: 524, DELIST_S2_DISTRESS_ZERO: 524, COST2_S1: 604, DATA_EVENT_MINUS_30: 586, FAILSAFE_EXIT_20D: 559, ENTRY_BAR_OPTIMISTIC: 528, ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: 489, S1_OPEN_BREAKOUT_TAKEN: 559 }, entries: { BASE_S0: 562, ENTRY_BAR_OPTIMISTIC: 531, ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: 492 }, sameBarCertain: { ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE: { byOpenFill: 44, byClose: 17 } }, ledgerSha256: {"BASE_S0":"67169e865384b866f2e51203dda75baff4778d125c5e1f60b67cb642c63b01f0","DELIST_S1_MINUS_30":"1285dd62b8da3a3de58cd9ead184755279044886ef1db2e3fb386966485f0ac1","DELIST_S2_DISTRESS_ZERO":"1285dd62b8da3a3de58cd9ead184755279044886ef1db2e3fb386966485f0ac1","COST2_S1":"f91934a7c23313a8323e93f56d4235300040f97c07ba551e45b233b5d9c05dcb","DATA_EVENT_MINUS_30":"cd7569f2732e0e59bacba6e1089c53ea64b1f28f7142a8a542ec2eb02e5d0522","FAILSAFE_EXIT_20D":"67169e865384b866f2e51203dda75baff4778d125c5e1f60b67cb642c63b01f0","ENTRY_BAR_OPTIMISTIC":"c6a4e61bede588b39e102ec146458d434945127a2ac47eb273c84e95f37abe98","ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE":"1b188ccdbb325b915725eba61ab8cc4626e0c9e7423fa049782056492b11de90","S1_OPEN_BREAKOUT_TAKEN":"67169e865384b866f2e51203dda75baff4778d125c5e1f60b67cb642c63b01f0"}, publicScenarioBlocksIdenticalToRun: '39397517900', correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'CURRENT_ENGINE' },
  { method: 'SF_DARVAS_BOX', kind: 'COMPONENT_STUDY', runId: '40170829944', date: '2026-10-25', codeVersion: 'sf-darvas-1.1.0', codeSha256: '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24', receiptSha256Prefix: '2bfdcbb912e40a48', signals: 22577, tradesSha256IdenticalToRun: '39397517900', role: 'CURRENT_ENGINE' },
  // 2026-10-20 (2): sf-turtle-1.2.0 - model assumptions explicit, every alternative reading run as its own scenario
  // (ENTRY_BAR_OPTIMISTIC, S1_OPEN_BREAKOUT_TAKEN, FAILSAFE_EXIT_20D); reference scenarios identical to 1.1.0 (since 2026-10-25 a
  // regression reference: other code fingerprint; every scenario reproduced by 40170829944)
  { method: 'SF_TURTLE_S1', kind: 'METHOD', runId: '39397517900', date: '2026-10-20', codeVersion: 'sf-turtle-1.2.0', codeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', receiptSha256Prefix: '23f3c932e2ef3213', trades: { BASE_S0: 820, DELIST_S1_MINUS_30: 980, DELIST_S2_DISTRESS_ZERO: 980, COST2_S1: 841, DATA_EVENT_MINUS_30: 747, FAILSAFE_EXIT_20D: 574, ENTRY_BAR_OPTIMISTIC: 786, S1_OPEN_BREAKOUT_TAKEN: 803 }, failsafeEntries: { BASE_S0: 710, FAILSAFE_EXIT_20D: 489, ENTRY_BAR_OPTIMISTIC: 709, S1_OPEN_BREAKOUT_TAKEN: 18 }, entries: { BASE_S0: 825, ENTRY_BAR_OPTIMISTIC: 789, S1_OPEN_BREAKOUT_TAKEN: 806 }, correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  { method: 'SF_TURTLE_S2', kind: 'METHOD', runId: '39397517900', date: '2026-10-20', codeVersion: 'sf-turtle-1.2.0', codeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', receiptSha256Prefix: '3d72a153e41f27be', trades: { BASE_S0: 559, DELIST_S1_MINUS_30: 524, DELIST_S2_DISTRESS_ZERO: 524, COST2_S1: 604, DATA_EVENT_MINUS_30: 586, FAILSAFE_EXIT_20D: 559, ENTRY_BAR_OPTIMISTIC: 528, S1_OPEN_BREAKOUT_TAKEN: 559 }, correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  { method: 'SF_DARVAS_BOX', kind: 'COMPONENT_STUDY', runId: '39397517900', date: '2026-10-20', codeVersion: 'sf-darvas-1.1.0', codeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', receiptSha256Prefix: 'b11a5fd25920419f', signals: 22577, role: 'REGRESSION_REFERENCE' },
  // 2026-10-20 (1): sf-turtle-1.1.0 / sf-darvas-1.1.0 (now a regression reference: other code fingerprint)
  // FAILSAFE_EXIT_20D is the second reading of the ambiguous failsafe exit (System 2 has no failsafe: identical ledger)
  { method: 'SF_TURTLE_S1', kind: 'METHOD', runId: '39392734794', date: '2026-10-20', codeVersion: 'sf-turtle-1.1.0', codeSha256: '9372a8f8f92bfbdb66d039b00fa29beca42b42ee9b3a49e3fa5a1a948c773cf9', receiptSha256Prefix: '6b860bb6d72836bd', trades: { BASE_S0: 820, DELIST_S1_MINUS_30: 980, DELIST_S2_DISTRESS_ZERO: 980, COST2_S1: 841, DATA_EVENT_MINUS_30: 747, FAILSAFE_EXIT_20D: 574 }, executionCountsBase: { entries: 825, adds: 562, failsafeEntries: 710, unitStopExits: 500, channelExits: 384, sameBarEntryStops: 124, sameBarAddStops: 64, sameBarEntryChannelExits: 1, reentrySameBarAsExit: 7, terminalSettlements: 25, unavailableSettlements: 5 }, correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  { method: 'SF_TURTLE_S2', kind: 'METHOD', runId: '39392734794', date: '2026-10-20', codeVersion: 'sf-turtle-1.1.0', codeSha256: '9372a8f8f92bfbdb66d039b00fa29beca42b42ee9b3a49e3fa5a1a948c773cf9', receiptSha256Prefix: '4cc089e9e5fdc640', trades: { BASE_S0: 559, DELIST_S1_MINUS_30: 524, DELIST_S2_DISTRESS_ZERO: 524, COST2_S1: 604, DATA_EVENT_MINUS_30: 586, FAILSAFE_EXIT_20D: 559 }, executionCountsBase: { entries: 562, adds: 344, failsafeEntries: 0, unitStopExits: 452, channelExits: 143, sameBarEntryStops: 114, sameBarAddStops: 40, sameBarEntryChannelExits: 0, reentrySameBarAsExit: 4, terminalSettlements: 26, unavailableSettlements: 9 }, correlationLimits: 'NOT_EVALUATED_NO_PIT_GROUPS', allScenariosReconciled: true, endingPositionCheck: 'PASS', role: 'REGRESSION_REFERENCE' },
  { method: 'SF_DARVAS_BOX', kind: 'COMPONENT_STUDY', runId: '39392734794', date: '2026-10-20', codeVersion: 'sf-darvas-1.1.0', codeSha256: '9372a8f8f92bfbdb66d039b00fa29beca42b42ee9b3a49e3fa5a1a948c773cf9', receiptSha256Prefix: 'f6c0386da496e2d9', signals: 22577, role: 'REGRESSION_REFERENCE' },
  { method: 'SF_DARVAS_BOX', kind: 'COMPONENT_STUDY', runId: '39271055007', date: '2026-10-19', codeVersion: 'sf-darvas-1.0.0', codeSha256: null, receiptSha256Prefix: '2fd60c5965c7e6c9', signals: 22577, role: 'REGRESSION_REFERENCE' },
]);
