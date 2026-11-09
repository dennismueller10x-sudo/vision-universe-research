#!/usr/bin/env python3
"""Independent check (stdlib only, run with python3 -I) of the internal backtest preview.

Reads the preview (backtest-preview-1.0.0), the committed runner results and the certification
artifact, and verifies without the Node code:
  - every case's numbers (metrics, uncertainty, events, methods) equal its envelope,
  - state codes A/B/C follow the envelope state, C only if the artifact certifies the kind,
  - per-kind state and A/B/C counts follow from the cases,
  - data-quality warnings and limitations are present for every kind and every case,
  - NO_ALPHA_OR_CERTIFICATION_CLAIM is present, productionApproved/publiclyActivated are false.
Writes a JSON report to --out; exit code 1 on any finding.
"""
import argparse
import json
import os
import sys

KINDS = ['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'STRATEGY_BACKTEST', 'FACTOR_RANKING_BACKTEST']
CODE = {'RESEARCH_EXECUTED': 'A', 'PREPARED_DATA_LIMITED': 'B', 'PRODUCT_CERTIFIED': 'C'}


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', required=True)
    ap.add_argument('--demos', required=True)
    ap.add_argument('--certification', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    doc, cert = load(a.preview), load(a.certification)
    certified = {k['id'] for k in cert.get('kinds', []) if k.get('status') == 'CERTIFIED'}
    findings, checked = [], 0
    if doc.get('productionApproved') is not False or doc.get('publiclyActivated') is not False:
        findings.append('ACTIVATION_FLAGS')
    if [k['kind'] for k in doc.get('kinds', [])] != KINDS:
        findings.append('KINDS')
    for k in doc.get('kinds', []):
        cases = k.get('cases', [])
        if not k.get('dataQualityLimits'):
            findings.append('NO_DATA_QUALITY_LIMITS:' + k['kind'])
        counts = {c: sum(1 for x in cases if x['stateCode'] == c) for c in 'ABC'}
        if counts != k.get('states'):
            findings.append('STATE_COUNTS:' + k['kind'])
        want = 'NO_PREVIEW_CASE' if not cases else 'PRODUCT_CERTIFIED' if counts['C'] else 'RESEARCH_EXECUTED' if counts['A'] else 'PREPARED_DATA_LIMITED'
        if k.get('state') != want:
            findings.append('KIND_STATE:' + k['kind'])
        for c in cases:
            path = os.path.join(a.demos, 'results', c['id'] + '.json')
            if not os.path.exists(path):
                continue  # extra offline result, not part of the committed demos
            r = load(path)
            e = r['envelope']
            checked += 1
            if c['kind'] != e['identity']['kind']:
                findings.append('KIND:' + c['id'])
            if c['state'] != e['status']['state'] or c['stateCode'] != CODE.get(e['status']['state']):
                findings.append('STATE:' + c['id'])
            if c['state'] == 'PRODUCT_CERTIFIED' and c['kind'] not in certified:
                findings.append('PRODUCT_CERTIFIED_WITHOUT_ARTIFACT:' + c['id'])
            if c['metrics'] != e['metrics']:
                findings.append('METRICS:' + c['id'])
            if c['uncertainty'] != e['uncertainty']:
                findings.append('UNCERTAINTY:' + c['id'])
            for f in ('occurrences', 'completed', 'immature', 'censored', 'ineligible', 'titles'):
                if c['events'][f] != e['events'][f]:
                    findings.append('EVENTS:' + c['id'] + ':' + f)
            if c['methods'] != [{'method': m['method'], 'state': m['state'], 'result': m['result']} for m in e['methods']]:
                findings.append('METHODS:' + c['id'])
            if c['limitations'] != e['limitations'] or 'NO_ALPHA_OR_CERTIFICATION_CLAIM' not in c['limitations']:
                findings.append('LIMITATIONS:' + c['id'])
            if c['dataQuality']['warnings'] != e['dataQuality']['warnings'] or not c['dataQuality']['warnings']:
                findings.append('DATA_QUALITY:' + c['id'])
            if c['hashes']['envelopeHash'] != e['envelopeHash'] or c['hashes']['resultHash'] != r['resultHash']:
                findings.append('HASHES:' + c['id'])
            if c['productionApproved'] is not False:
                findings.append('PRODUCTION_APPROVED:' + c['id'])
            if c['state'] == 'PREPARED_DATA_LIMITED' and (e['metrics']['basis'] != 'NONE' or not c['missingInputs']):
                findings.append('STATE_B_WITHOUT_MISSING_INPUTS:' + c['id'])
    report = {'checkedCases': checked, 'findings': findings, 'ok': not findings and checked > 0}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    print(json.dumps(report))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
