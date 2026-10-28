#!/usr/bin/env python3
"""Hash manifest and evidence matrix for the V9 research deliverables (read-only, --out)."""
import argparse, hashlib, json, os, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ACC, PART = 'ACCEPTED_WITH_DEFINED_SCOPE', 'PARTIAL'
MATRIX = [
 ('SAME_STOCK_REPLAY', PART, 'Unchanged engine; V9 adds source-proven identity bindings (COHR, BGC, DCOM, SGI, TRAK) and one confirmed unadjusted split (PZZA) as proposals. Structural survivor-by-construction limit remains.', ['identity/dossiers-7.json', 'corporate-actions/ca-manual-review.json']),
 ('PATTERN_EVIDENCE', PART, 'No new pattern study. Survivorship/return basis gates unchanged.', []),
 ('SIGNAL_BACKTEST', PART, 'NEW_52W_HIGH re-run on registered 1,000/3,255-listing populations: positive raw price return, no benchmark-excess evidence after Holm. No rule certified.', ['sensitivity/population-summary.json']),
 ('SETUP_BACKTEST', PART, '4,137 events / 20 dates / 2 months / 6 ISO weeks but N_eff ~17 for the M6 mean (independence analysis); blockers are forward-time accumulation plus one normative question (owner: ISO-week change NOT approved; week counter alone insufficient).', ['certification-readiness-1.0.0.json', 'setup-decision-recommendation-1.0.0.json', 'setup-independence-1.0.0.json']),
 ('STRATEGY_BACKTEST', PART, 'Ledger now runs on SEC-sourced dividends (pay dates), splits and terminal events; membership/factor history gates (24 months) are time-bound (~2028-07).', ['portfolio/portfolio-v9-index.json', 'certification-readiness-1.0.0.json']),
 ('FACTOR_RANKING_BACKTEST', PART, 'Fiscal-year/PIT defects traced to filer XBRL with proposed fixes; 1,105/1,105 original-value parities. Factor snapshot history gate time-bound.', ['secpit/summary.json']),
 ('MONTE_CARLO', ACC, 'V7 acceptance preserved unchanged.', []),
 ('WALK_FORWARD', ACC, 'V8 acceptance preserved unchanged.', []),
 ('OUT_OF_SAMPLE', ACC, 'V7 acceptance preserved; V9 adds a prospective registered-not-evaluable 8-K cohort (evaluable 2027-04-29).', ['events/registration-prospective-1.0.0.json']),
 ('MARKET_REGIME', ACC, 'V8 acceptance preserved unchanged.', []),
 ('PARAMETER_SENSITIVITY', ACC, 'NEW: pre-registered dependence diagnostics (PW block length, SE plateau, KPSS/CUSUM/split tests) pass C1-C6 on P1 and P2 for the primary endpoint; trio and benchmark-excess endpoint excluded from scope. Python parity 1,420,112 checks.', ['sensitivity/registration-1.0.0.json', 'sensitivity/diagnostics-summary.json', 'sensitivity/decision.json', 'sensitivity/parity.json']),
 ('EVENT_DRIVEN', ACC, 'NEW: 11,888 original 8-K Item 2.02 events (2,730 listings), SEC acceptance clock 283/283 header parity, registered positive control A1 detected vs 23,680 placebo controls; scope h=1 absolute abnormal reaction, current survivors, 2025-09..2026-10, price return. Python parity 732,449 checks.', ['events/registration-retrospective-1.0.0.json', 'events/results-retrospective-1.0.0.json', 'events/header-parity-1.0.0.json', 'events/parity-1.0.0.json']),
 ('PORTFOLIO_REBALANCING', ACC, 'NEW (bookkeeping mechanics only): SEC-sourced cash dividends credited at pay date (MSFT/WMT 47/47 quarters), sourced splits, one real cash (CRNX) and one real stock (LBRDK->CHTR) terminal event; 22/22 exact Python ledger parities. Spin-offs, ADS consideration and unstated pay dates excluded; owner 2026-10-28: accepted only for the evidenced bookkeeping mechanics, not for all corporate actions, historical strategies or unknown events; no strategy certification.', ['portfolio/portfolio-v9-index.json']),
]
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
    base = os.path.join(ROOT, 'docs/quant-recovery/v9')
    files = {}
    for d, _, fs in os.walk(base):
        for f in sorted(fs):
            p = os.path.join(d, f); rel = os.path.relpath(p, ROOT)
            if rel.endswith('artifact-manifest-1.0.0.json'): continue
            files[rel] = sha(p)
    code = {}
    for d, _, fs in os.walk(os.path.join(ROOT, 'scripts/quant/v9')):
        for f in sorted(fs):
            if f.endswith(('.py', '.cjs', '.mjs', '.js')): p = os.path.join(d, f); code[os.path.relpath(p, ROOT)] = sha(p)
    for t in ('quant/tests/v9-events.test.mjs', 'quant/tests/v9-sensitivity-dependence.test.mjs'): code[t] = sha(os.path.join(ROOT, t))
    for _, _, _, ev in MATRIX:
        for e in ev: assert 'docs/quant-recovery/v9/' + e in files, e
    accepted = [m for m in MATRIX if m[1] == ACC]
    doc = {'schemaVersion': 'quant-v9-evidence-matrix-1.0.0', 'gitHeadAtBuild': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
           'matrix': [{'area': n, 'methodStatus': s, 'summary': t, 'evidence': ['docs/quant-recovery/v9/' + e for e in ev], 'certification': 'NOT_CERTIFIED'} for n, s, t, ev in MATRIX],
           'counts': {'implemented': '13/13', 'acceptedInDefinedScope': f'{len(accepted)}/13', 'extensionMethodsAccepted': f'{len(accepted)}/7', 'certifiedBacktestKinds': '0/6'},
           'finalStatus': 'V9_METHODS_ACCEPTED_WITH_LIMITED_SCOPE', 'ownerDecision20261028': {'methodsAcceptance': 'METHODOLOGICAL_ONLY_WITHIN_DOCUMENTED_LIMITED_SCOPE', 'setupIsoWeekChange': 'NOT_APPROVED', 'activeGatesUnchanged': True}, 'files': files, 'code': code, 'activeGatesChanged': False, 'enginesChanged': False, 'productionApproved': False}
    json.dump(doc, open(a.out, 'w'), indent=1, ensure_ascii=False); print(doc['counts'], len(files), len(code))
if __name__ == '__main__': main()
