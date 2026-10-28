#!/usr/bin/env python3
"""V9 workstream B: identity-verified delisting check for gaps whose ticker is no longer in the SEC map
(stale carry-forward after the gap). Candidate issuer names are a HYPOTHESIS that is only accepted if the
issuer's last periodic report before the gap carries the ticker on its cover page ("Trading Symbol"), verified
verbatim in the original document. Then Form 25/25-NSE/15-12B and 8-K item 2.01/3.01 filings around the gap are
listed. Output: derived facts only.

Usage: python3 mw_delisted_lookup.py --mw <mw-draft.json> --private <dir> --out <json>
"""
import argparse, datetime, hashlib, json, pathlib, re, sys, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402
from evidence_quotes import text_of  # noqa: E402

# hypotheses (issuer names) for the six listings sharing the 2025-12-15 missing window
CANDIDATES = {'ref_ADVM': 'Adverum Biotechnologies', 'ref_ALE': 'ALLETE', 'ref_GHLD': 'Guild Holdings',
              'ref_HSII': 'Heidrick & Struggles', 'ref_ODP': 'ODP Corp', 'ref_ARBKL': 'Argo Blockchain'}
DELIST = {'25', '25-NSE', '15-12B', '15-12G', '15-15D'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mw', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    cl = SECHttpClient(cache=DiskCache(pathlib.Path(a.private) / 'http-cache', ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=2, burst=2))
    rows = {r['id']: r for r in json.load(open(a.mw))['gapRows'] if r['firstMissingWeek'] == '2025-12-15'}
    out = {}
    for sid, name in CANDIDATES.items():
        g = rows.get(sid)
        if not g:
            continue
        ticker = sid[4:]
        lo = (datetime.date.fromisoformat(g['after']) - datetime.timedelta(days=60)).isoformat()
        hi = (datetime.date.fromisoformat(g['before']) + datetime.timedelta(days=30)).isoformat()
        u = 'https://efts.sec.gov/LATEST/search-index?' + urllib.parse.urlencode({'q': f'"{name}"', 'forms': '25-NSE,25,15-12B,8-K', 'dateRange': 'custom', 'startdt': lo, 'enddt': hi})
        r = json.loads(cl.get_bytes(u))
        ciks = {}
        for h in r['hits']['hits']:
            for c, dn in zip(h['_source'].get('ciks', []), h['_source'].get('display_names', [])):
                if name.lower().split()[0] in dn.lower():
                    ciks[c] = dn
        rec = {'gap': g['after'] + '..' + g['before'], 'nameHypothesis': name, 'searchUrl': u, 'cikCandidates': ciks}
        verified = None
        for cik in ciks:
            sub = json.loads(cl.get_bytes(f'https://data.sec.gov/submissions/CIK{cik}.json'))
            b = sub['filings']['recent']
            fl = [{'form': b['form'][i], 'filed': b['filingDate'][i], 'acc': b['accessionNumber'][i], 'doc': b['primaryDocument'][i], 'items': b['items'][i]} for i in range(len(b['form']))]
            per = sorted([f for f in fl if f['form'] in ('10-K', '10-Q', '20-F') and f['filed'] <= g['after']], key=lambda f: f['filed'])
            if not per:
                continue
            last = per[-1]
            du = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{last['acc'].replace('-', '')}/{last['doc']}"
            raw = cl.get_bytes(du)
            txt = text_of(raw[:3_000_000])
            m = re.search(r'Trading Symbol(?:.|\n){0,1500}?\b' + re.escape(ticker) + r'\b', txt)
            if not m:
                rec.setdefault('rejected', []).append({'cik': cik, 'doc': du, 'reason': 'ticker not on cover page'})
                continue
            q = (txt[m.start():m.start() + 40] + ' ... ' + txt[m.end() - 60:m.end()]) if m.end() - m.start() > 250 else txt[m.start():m.end()]
            dl = [f for f in fl if lo <= f['filed'] <= hi and (f['form'] in DELIST or (f['form'].startswith('8-K') and re.search(r'2\.01|3\.01', f['items'] or '')))]
            verified = {'cik': cik, 'name': sub.get('name'), 'coverDoc': du, 'coverSha256': hashlib.sha256(raw).hexdigest(), 'coverQuote': q,
                        'delistingContext': dl, 'periodicAfterGapStart': [f for f in fl if f['form'] in ('10-K', '10-Q') and f['filed'] > g['after']][:3]}
            break
        rec['verified'] = verified
        rec['verdict'] = ('DELISTED_AT_GAP_STALE_PRICES_AFTER' if verified and any(f['form'] in DELIST or '2.01' in (f['items'] or '') for f in verified['delistingContext'])
                          else 'UNVERIFIED')
        out[sid] = rec
    pathlib.Path(a.out).write_text(json.dumps({'schemaVersion': 'v9-ca-mw-delisted-1.0.0', 'note': 'issuer names are hypotheses verified only via the ticker on the cover page of the issuer\'s last periodic report', 'results': out, 'requestStats': cl.stats}, indent=1))
    for k, v in out.items():
        print(k, v['verdict'], v['verified'] and (v['verified']['cik'], v['verified']['name'], [(f['form'], f['filed'], f['items']) for f in v['verified']['delistingContext']]))


if __name__ == '__main__':
    main()
