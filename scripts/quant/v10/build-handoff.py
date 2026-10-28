#!/usr/bin/env python3
"""Machine-readable V10 handoff: integrated V9 baseline, the six open backtest certifications,
data gaps and the open setup-independence decision (read-only, writes only --out).

Certification blockers and the setup analysis are read from the committed V9 evidence files,
so the handoff cannot drift from them; source hashes are recorded."""
import argparse, hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
READINESS = 'docs/quant-recovery/v9/certification-readiness-1.0.0.json'
INDEPENDENCE = 'docs/quant-recovery/v9/setup-independence-1.0.0.json'

MERGED = [
    (1028, '4036674271', 'V9 research, reports and evidence', 'docs/scripts only'),
    (1042, 'daa5a94867', 'PZZA split supplement in the series producers', 'scripts/market producer; data changes on next long-series run'),
    (1036, '62ac2e6470', 'Research ledger 1.2.0 (spin-off, ADS, information vs. claim time)', 'research engine, no productive importer'),
    (1041, 'd743d342e1', 'Research identity registry, 5 bindings (TRAK excluded from productive admission)', 'research loader, default off'),
    (1043, 'd71fbbe642', 'SEC pipeline P1-P4, DQ-SEC-1/2 (WARN), DQ-SEC-3 (INFO)', 'producer code; data changes on next sec-consumer-fundamentals run'),
    (1046, '3a93aeb8fd', 'SEC-checked CA register, 24 events / 23 series (offline research only)', 'research loader, default off'),
    (1034, 'a378b29cc6', 'DQ-PX-6/7, DQ-ID-4 (stale tails, master/series contradictions; WARN)', 'data-quality rules only'),
]

PENDING_DATA_EFFECTS = [
    {'pr': 1043, 'producer': '.github/workflows/sec-consumer-fundamentals.yml', 'next': 'Monday 07:30 UTC',
     'effect': 'all 5,063 bundles rewritten with normalization_logic 1.14.0, 416 with changed content; then product-intelligence-materialization and sec-fundamentals refresh',
     'atHandoff': 'committed bundles still carry normalization_logic 1.13.0'},
    {'pr': 1042, 'producer': '.github/workflows/long-series.yml', 'next': '2026-11-07 full run or a run with only=PZZA',
     'effect': 'ref_PZZA weekly closes before 2013-12-30 halved (unadjusted 2:1 split)', 'atHandoff': 'unchanged'},
]

RESEARCH_LOADER = {'module': 'quant/engines/research-weekly-loader.cjs', 'defaultOff': True, 'productiveImporter': None,
                   'qualified': {'default': 4449, 'identity': 4453, 'identityAndCorporateActions': 4476},
                   'TRAK': 'only with identityEvidenceAllowCoverPageOnly; excluded from productive admission (owner 2026-10-28), no automatic fallback'}

DATA_GAPS = [
    ('HISTORICAL_POPULATION', 'No historical primary US common population incl. delistings and no original membership history; all studies run on current survivors.'),
    ('IDENTITY', '180 ambiguous ids stay blocked; 132 source-backed bindings only as V9 proposal (not approved); EFOR and SUNE held; TRAK has no price evidence; 19 ids unresolved.'),
    ('CORPORATE_ACTIONS', '577 CA holds stay in the default path; unchecked: 440 events before 2011, 240 with open identity, 215 without bracketing filings; spin-offs (e.g. ABT/AbbVie) not modelled as total return; no further CA cases without independent source check.'),
    ('STALE_TAILS', '341 weekly and 475 daily series with frozen closes, 103 master/series contradictions (DQ-PX-6/7, DQ-ID-4, WARN only); open: master producer fix (INACTIVE on stale tail plus Form 25/15), adapter block reason, Discover flag.'),
    ('WEEKLY_GAPS', '218 series with 641 gaps stay unfilled; interpolation forbidden.'),
    ('SEC_PIT', 'CAPS fiscal-calendar gap (DQ-SEC-1 stays 2 after rebuild); 520 future-dated cases classified only by sample; acceptance is an upper bound, not publication time.'),
    ('DIVIDENDS_TOTAL_RETURN', 'Sourced pay dates complete only for MSFT and WMT (JPM 15/47, XOM 14/47, META 1/11); ex-dates not from sources; receipt of terminal cash amounts unstated (NOT_STATED, never investable).'),
    ('PROVIDER_AND_MASTER_ERRORS', 'Trailing repeated closes after the last trading day (CRNX, LBRDK, DBRG, WBS); SAN in the master as EQUITY_COMMON instead of ADS; bulk submissions.zip acceptance times offset +4/5 h (not used).'),
    ('CONFIRMATION', 'Prospective 8-K cohort registered, evaluable from 2027-04-29; no other untouched holdout exists.'),
]


def sha(rel):
    return hashlib.sha256(open(os.path.join(ROOT, rel), 'rb').read()).hexdigest()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
    readiness = json.load(open(os.path.join(ROOT, READINESS)))
    independence = json.load(open(os.path.join(ROOT, INDEPENDENCE)))
    kinds = [{'kind': k['kind'], 'status': k['status'], 'certified': False,
              'blockers': [{'gate': b['gate'], 'class': b['blockerClass'], 'value': b['value'], 'required': b['required'],
                            'earliestClearanceEstimate': b.get('earliestClearanceEstimate'),
                            'historicalStudyCanReplace': b.get('historicalStudyCanReplace')} for b in k['blockers']]}
             for k in readiness['kinds']]
    doc = {
        'schemaVersion': 'quant-v10-handoff-1.0.0',
        'asOf': '2026-10-28',
        'v9Status': 'V9_METHODS_ACCEPTED_WITH_LIMITED_SCOPE',
        'counts': {'implemented': '13/13', 'acceptedWithDefinedScope': '7/13', 'extensionMethods': '7/7', 'certifiedBacktestKinds': '0/6'},
        'ownerScope': '7/7 is a methodological acceptance within the documented limited scope only; portfolio rebalancing covers the evidenced bookkeeping mechanics only (owner 2026-10-28).',
        'sources': {READINESS: sha(READINESS), INDEPENDENCE: sha(INDEPENDENCE)},
        'mergedPullRequests': [{'pr': n, 'mergeCommit': c, 'content': t, 'reach': r} for n, c, t, r in MERGED],
        'dataFilesChangedByMerges': 0,
        'pendingDataEffects': PENDING_DATA_EFFECTS,
        'researchLoader': RESEARCH_LOADER,
        'certifications': kinds,
        'setupIndependenceDecision': {
            'status': 'OPEN_NOT_APPROVED', 'activeGateChanged': False,
            'ownerDecision': '2026-10-28: ISO-week change not approved; existing gate unchanged.',
            'counts': readiness['setupIndependenceCounts'],
            'findings': independence['findings'],
            'proposalForLaterDecision': independence['recommendationUpdate']['proposal'],
        },
        'dataGaps': [{'id': i, 'description': d} for i, d in DATA_GAPS],
        'v10Rules': [
            'Gates unchanged; no certification by lowering existing quality rules.',
            'Domain models only in their own PRs with before/after comparison.',
            'Generated artifacts never edited by hand; rebuilt by their producer.',
            'SEC only via the existing fair-access client, <= 2 requests/s per stream.',
            'No new paid data providers.',
            'Product read paths (weekly-real-adapter.cjs, corporate-action-evidence.js, backtest freshness codes) only with separate approval; research extensions via research-weekly-loader.cjs.',
        ],
        'productionApproved': False,
    }
    json.dump(doc, open(a.out, 'w'), indent=1, ensure_ascii=False)
    open(a.out, 'a').write('\n')


if __name__ == '__main__':
    main()
