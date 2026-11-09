#!/usr/bin/env python3
"""V12 MCAP: adjudication of every sampled correction of the validation SEC sample (python3 -I adjudicate_validation.py <repo root>).
Automated verdict where the first cover-page statement confirms the corrected value; otherwise the basis quoted from the
primary document (MANUAL, written from the quotes stored in sec-sample-validation.json)."""
import json, sys
W = sys.argv[1]
d = json.load(open(W + '/docs/quant-recovery/v12/mcap/sec-sample-validation.json'))
reg_text = open(W + '/quant/engines/research-pit-market-cap-register.cjs').read()
reg = json.loads(reg_text[reg_text.index('module.exports = ') + 17:].rstrip().rstrip(';'))
cols = reg['factColumns']
idx = {(c, r[0], r[1], r[2]): dict(zip(cols, r)) for c, lst in reg['facts'].items() for r in lst}
code = {'ECSO': 'ECSO', 'CSSO': 'CSSO'}
MANUAL = {  # basis for every sampled correction whose automated verdict is not CONFIRMED_COVER_STATES_CORRECTED
    '0001193125-11-310710': ('WRONG', 'Cover page: "Common stock: 204,245,196 outstanding as of October 31, 2011" (after the October 2011 capital raise); the factor-10 correction was wrong.'),
    '0000353184-20-000015': ('WRONG', 'Cover page: "Outstanding Shares at January 31, 2020 2,912,599"; the factor-10 correction (next to a provider 1:10 factor) was wrong.'),
    '0001193125-12-332540': ('CORRECT', 'Cover: "as of the close of business on July 26, 2012 ... Common Stock ... 455,571,966"; balance sheet: 455,115,270 shares outstanding.'),
    '0001213900-21-010724': ('CORRECT', 'Cover: "As of February 19, 2021, the registrant had 52,752,851 shares of Common Stock outstanding."'),
    '0001262039-14-000025': ('CORRECT', 'Cover: "As of April 30, 2014, there were 163,069,548 shares of the registrant common stock outstanding."'),
    '0001193125-13-203552': ('CORRECT', 'Balance sheet: "shares outstanding at March 31, 2013 and December 31, 2012, 10,167,467 and 10,149,398" (fact 10,167 = thousands).'),
    '0001130464-12-000024': ('CORRECT', 'Balance sheet: "issued: 43,957,502 shares at 2011" (no cover count captured; issued count equals the corrected value).'),
    '0001564590-19-003456': ('CORRECT', 'Cover: "On February 15, 2019, there were 111,476,203 shares of common stock outstanding."'),
    '0001193125-11-151778': ('CORRECT', 'Fact 133.9 is in millions; EPS note "Weighted-average shares outstanding for basic earnings per share 133,454" (thousands), consistent with 133.9 M; no cover count captured.'),
    '0001606366-22-000033': ('UNCONFIRMED', 'No share count captured from the primary document text; the correction rests on the register evidence only (same-filing value and validated prior vintage).'),
    '0001234452-11-000190': ('CORRECT', 'Cover: "as of the close of business on April 18, 2011 ... Common Stock ... 1,669,532,005".'),
    '0001108426-19-000060': ('CORRECT', 'Cover: "As of October 25, 2019, 79,653,624 shares of common stock ... of PNMR were outstanding."'),
    '0000950123-11-057559': ('CORRECT', 'Fact 87,846 is in thousands; statement of operations "WEIGHTED-AVERAGE SHARES OUTSTANDING: BASIC 87,282" (thousands), consistent with 87,846,000; no cover count captured.'),
    '0001628280-23-036449': ('CORRECT', 'Income statement "Weighted Average Common Shares Outstanding: Basic 17,796,741"; the inline-XBRL cover value is displayed as 17,796,741,000.'),
}
out = []
for r in d['results']:
    if r['status'] != 'CORRECTED':
        continue
    v = r['check']['verdict']
    if v == 'CONFIRMED_COVER_STATES_CORRECTED':
        adj, basis = 'CORRECT', 'Automated: cover-page statement within 2 % of the corrected value.'
    else:
        adj, basis = MANUAL[r['accession']]
    now = idx.get((r['cik'], r['accession'], r['concept'], r['reported']))
    out.append({'securityId': r['securityId'], 'accession': r['accession'], 'reported': r['reported'], 'corrected': r['corrected'], 'scaleExponent': r['scaleExponent'],
                'automatedVerdict': v, 'adjudication': adj, 'basis': basis, 'url': r['check'].get('url'), 'sha256': r['check'].get('sha256'),
                'statusUnderRule1_0_8': now['status'] if now else 'OK', 'classUnderRule1_0_8': now['class'] if now else 'OK'})
summary = {'sampledCorrectionsRule1_0_7': len(out), 'correct': sum(1 for x in out if x['adjudication'] == 'CORRECT'), 'wrong': sum(1 for x in out if x['adjudication'] == 'WRONG'), 'unconfirmed': sum(1 for x in out if x['adjudication'] == 'UNCONFIRMED'),
           'wrongAllWithScaleExponentAbs1': all(abs(x['scaleExponent']) == 1 for x in out if x['adjudication'] == 'WRONG'),
           'underRule1_0_8': {'stillCorrected': sum(1 for x in out if x['statusUnderRule1_0_8'] == 'CORRECTED'), 'stillCorrectedAndCorrect': sum(1 for x in out if x['statusUnderRule1_0_8'] == 'CORRECTED' and x['adjudication'] == 'CORRECT'),
                              'nowExcluded': sum(1 for x in out if x['statusUnderRule1_0_8'] == 'EXCLUDED')}}
doc = {'schemaVersion': 'v12-mcap-sec-adjudication-1.0.0', 'sample': 'sec-sample-validation.json (drawn from the rule 1.0.7 register, selection salted with "validation")', 'summary': summary,
       'note': 'Automated verdicts read the first cover-page share statement; statements presented in thousands, document typos and missing cover text are adjudicated from the quoted document text. 1.0.8 was decided after this sample (only exclusions, no new correction), so the 1.0.8 figures are in-sample.', 'cases': out}
open(W + '/docs/quant-recovery/v12/mcap/sec-adjudication-validation.json', 'w').write(json.dumps(doc, indent=1) + '\n')
print(json.dumps(summary))
