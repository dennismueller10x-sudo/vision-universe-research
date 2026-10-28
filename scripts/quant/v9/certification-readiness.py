#!/usr/bin/env python3
"""V9 certification-readiness audit of the six existing backtest kinds.

Read-only: consumes the produced certification artifact, the active contract and
setup outcomes; writes one derived evidence file given via --out. It does not
change any gate, contract or product status. Blockers are classified as
  TIME_ACCUMULATION  - forward-collected history that no historical study can replace
  EVIDENCE_MISSING   - data/evidence absent today, repairable in principle by sources
  NORMATIVE          - needs an owner decision on the contract itself
  STRUCTURAL_BY_DESIGN - the kind's construction limits it (e.g. survivor replay)
"""
import argparse, datetime as dt, hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
P = lambda p: os.path.join(ROOT, p)
CLASS = {
    'SURVIVOR_BY_CONSTRUCTION': 'STRUCTURAL_BY_DESIGN', 'DESCRIPTIVE_NOT_A_TEST': 'STRUCTURAL_BY_DESIGN',
    'STUDY_DECLARES_BACKTEST_NOT_CERTIFIED': 'STRUCTURAL_BY_DESIGN',
    'PRESENT_AND_UNQUANTIFIED_IN_PART': 'EVIDENCE_MISSING', 'STUDY_RETURN_BASIS_NOT_TOTAL_RETURN': 'EVIDENCE_MISSING',
    'PARTIAL_SENSITIVITY_ONLY': 'EVIDENCE_MISSING', 'NO_RULE_CERTIFIED': 'EVIDENCE_MISSING',
    'SETUP_HISTORY_TOO_SHORT': 'TIME_ACCUMULATION', 'SETUP_HISTORY_SPAN_TOO_SHORT': 'TIME_ACCUMULATION',
    'COMPLETED_OUTCOMES_TOO_FEW': 'TIME_ACCUMULATION', 'TOO_FEW_TITLES': 'TIME_ACCUMULATION',
    'EVENTS_CLUSTERED_IN_TIME': 'NORMATIVE', 'TOTAL_RETURN_NOT_IN_THIS_RUN': 'EVIDENCE_MISSING',
    'VARIANTS_NOT_MEASURABLE_YET': 'TIME_ACCUMULATION', 'OOS_NOT_MEASURABLE_YET': 'TIME_ACCUMULATION',
    'HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING': 'TIME_ACCUMULATION', 'FACTOR_HISTORY_TOO_SHORT': 'TIME_ACCUMULATION',
    'FORWARD_OUTCOMES_TOO_FEW': 'TIME_ACCUMULATION',
}

def sha(p):
    return hashlib.sha256(open(P(p), 'rb').read()).hexdigest()

def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)

def iso_week(s):
    y, w, _ = dt.date.fromisoformat(s).isocalendar()
    return f'{y}-W{w:02d}'

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
    cert_p, contract_p, outcomes_p = 'quant/data/product/backtest-certification-v1.json', 'quant/methodology/backtest-certification-v1.json', 'quant/data/product/setup-outcomes-v1.json'
    cert, contract, outcomes = (json.load(open(P(p))) for p in (cert_p, contract_p, outcomes_p))
    as_of = dt.date.fromisoformat(cert['asOf'])
    kinds = cert['kinds'] if isinstance(cert['kinds'], list) else list(cert['kinds'].values())
    rows = []
    for k in kinds:
        kid = k.get('id') or k.get('kind'); req = contract['kinds'][kid].get('requirements') or {}
        blockers = []
        for g in k['gates']:
            if g['state'] == 'PASS':
                continue
            cls = CLASS.get(g.get('reason'), 'UNCLASSIFIED')
            eta = None
            if g['id'] in ('membershipHistory', 'factorHistory'):
                have = int(str(g['value']).split()[0]); need = g['required']
                eta = add_months(as_of, need - have).isoformat()
            if g['id'] == 'completedForward':
                eta = add_months(as_of, (g['required'] - g['value']) + 3).isoformat()
            if g['id'] == 'historySpan':
                eta = (as_of + dt.timedelta(days=int(str(g['required']).split()[0]) - int(str(g['value']).split()[0]))).isoformat()
            if g['id'] in ('completedOutcomes', 'titles', 'oos', 'entryVariant'):
                first = sorted(e[2] for e in outcomes['events'])[0] if outcomes['events'] else None
                eta = (dt.date.fromisoformat(first) + dt.timedelta(days=183)).isoformat() + ' (earliest first M6 maturity, not gate clearance)' if first else None
            blockers.append({'gate': g['id'], 'category': g.get('category'), 'reason': g.get('reason'), 'value': g.get('value'), 'required': g.get('required'),
                             'blockerClass': cls, 'earliestClearanceEstimate': eta,
                             'historicalStudyCanReplace': cls == 'EVIDENCE_MISSING' and g['id'] not in ('ruleCertified',)})
        rows.append({'kind': kid, 'status': k.get('status'), 'trust': k.get('trust'), 'hardGatesPass': all(g['state'] == 'PASS' for g in k['gates'] if g.get('category') == 'HARD'),
                     'blockers': blockers, 'blockerClasses': sorted({b['blockerClass'] for b in blockers}), 'certifiable': False})
    dates = sorted({e[2] for e in outcomes['events']})
    setup = {'events': len(outcomes['events']), 'uniqueDates': len(dates), 'from': dates[0] if dates else None, 'to': dates[-1] if dates else None,
             'legacyMonthCount': len({d[:7] for d in dates}), 'isoWeekCount': len({iso_week(d) for d in dates}),
             'activeRequirement': contract['kinds']['SETUP_BACKTEST']['requirements']['independentWeeks'],
             'legacyEvaluator': 'scripts/quant/build-backtest-certification.mjs: new Set(outcomes.events.map(e => e[2].slice(0,7))).size'}
    doc = {'schemaVersion': 'quant-v9-certification-readiness-1.0.0', 'asOf': cert['asOf'],
           'sources': {cert_p: sha(cert_p), contract_p: sha(contract_p), outcomes_p: sha(outcomes_p), 'scripts/quant/build-backtest-certification.mjs': sha('scripts/quant/build-backtest-certification.mjs')},
           'kinds': rows, 'certifiedKinds': sum(r['certifiable'] for r in rows), 'setupIndependenceCounts': setup,
           'interpretation': 'No kind is certifiable on 2026-10-27. Hard PIT/lookahead gates pass where defined; remaining blockers are forward-collected history (time), missing evidence, structural design limits, and one normative contract question. Historical research studies do not substitute forward-collected published history.',
           'activeGatesChanged': False, 'productionApproved': False}
    json.dump(doc, open(a.out, 'w'), indent=1, ensure_ascii=False); print(json.dumps({r['kind']: r['blockerClasses'] for r in rows}), json.dumps(setup))

if __name__ == '__main__':
    main()
