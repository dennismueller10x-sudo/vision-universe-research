"""V12 LARGECAP part CA: verify the scope events under docs/quant-recovery/v12/largecap/protocol-1.0.0.json#partCA
(= V10 protocol 1.1.2 unchanged + L1 pre-2004 frame, L2 identity text in the complete submission, L3 fixed candidate CIK).

Every 1.1.2 rule is executed by the V10 verifier itself (scripts/quant/v10/corporate-actions/verify_ca_events_v11.py, imported
read-only as a library, which in turn imports the frozen 1.0.0 V9 verifier). This file only adds L1-L3 and routes SEC access
through seclib (fair-access client, <= 2 req/s, private cache). Writes private facts (one JSON line per series).

  python3 -I scripts/quant/v12/largecap/verify_ca.py --frame <ca-frame.json> --facts-out <ca-facts.jsonl>
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE))
import seclib  # noqa: E402

_spec = importlib.util.spec_from_file_location('v10ca', ROOT / 'scripts/quant/v10/corporate-actions/verify_ca_events_v11.py')
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)
V9 = V.V9
PROTOCOL = ROOT / 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json'
P12 = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
assert P12['inputs']['caProtocol']['sha256'] == V.PROTOCOL_SHA, 'V10 CA protocol changed'

# ---- L1: no pre-2004 frame cut; legacy 8-K item numbers (they never collide with the n.nn numbering used since 2004-08-23)
V.SUBSET_FROM = '0000-00-00'
V9.SPLIT_8K_ITEMS = frozenset(V9.SPLIT_8K_ITEMS | {'5', '9'})
V9.AFFIRM_ITEMS = frozenset(V9.AFFIRM_ITEMS | {'1', '2', '3', '5', '9', '12'})


class Sec:
    """V9/V10 Sec interface on top of seclib (own cache, earlier strands' caches read-only, network <= 2/s)."""
    def __init__(self):
        self.neg = set()

    def get(self, url, allow404=False):
        if url in self.neg:
            return None
        try:
            body, _ = seclib.get(url)
            return body
        except V9.http_client.SECHTTPError as exc:
            if allow404 and exc.status == 404:
                self.neg.add(url)
                return None
            raise

    def json(self, url, allow404=False):
        b = self.get(url, allow404)
        return None if b is None else json.loads(b)


# ---- L2: identity text in the complete submission (only where E1 applies, i.e. no dei:TradingSymbol fact)
_side_identity = V.side_identity


def side_identity(sec, cik, filings, rec, ev, side, ticker, tre):
    res = _side_identity(sec, cik, filings, rec, ev, side, ticker, tre)
    if res['ok'] or res['via'] != 'E1_TEXT':
        return res
    if side == 'before':
        ks = [f for f in filings if f['form'] == '10-K' and V.add(ev['week'], -V.WINDOW) <= f['filingDate'] <= ev['prevWeek']]
        k = max(ks, key=lambda f: f['filingDate']) if ks else None
    else:
        ks = [f for f in filings if f['form'] == '10-K' and ev['week'] <= f['filingDate'] <= V.add(ev['week'], V.WINDOW)]
        k = min(ks, key=lambda f: f['filingDate']) if ks else None
    tried = [rec['accession']] + ([k['accession']] if k and k['accession'] != rec['accession'] else [])
    for acc in tried:
        f0 = next(f for f in filings if f['accession'] == acc)
        url = V.archive(cik, acc) + '/' + acc + '.txt'
        body = sec.get(url)
        text = V.strip(body)
        m = tre.search(text)
        if m:
            return {'via': 'L2_FULL_SUBMISSION_TEXT', 'ok': True, 'accession': acc, 'form': f0['form'], 'filingDate': f0['filingDate'], 'url': url,
                    'sha256': V.sha(body), 'quote': V.snippet(text, m, 110)[:300]}
    return {**res, 'l2Tried': tried}


V.side_identity = side_identity


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frame', required=True)
    ap.add_argument('--facts-out', required=True)
    ap.add_argument('--only')
    a = ap.parse_args()
    out = pathlib.Path(a.facts_out).resolve()
    if ROOT in out.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    frame = json.loads(pathlib.Path(a.frame).read_text())
    if frame['protocolSha256'] != PROTOCOL_SHA:
        raise SystemExit('FRAME_FROM_OTHER_PROTOCOL')
    sec = Sec()
    ciks = P12['partCA']['L3_candidateCik']['ciks']
    done = {json.loads(l)['securityId'] for l in out.read_text().splitlines() if l.strip()} if out.exists() else set()
    only = set(a.only.split(',')) if a.only else None
    with out.open('a') as fh:
        for s in frame['frame']:
            if s['securityId'] in done or (only and s['securityId'] not in only):
                continue
            tickers_map = {V.norm_ticker(s['ticker']): ciks[s['securityId']]}  # L3
            try:
                facts = V.verify_series(sec, s, tickers_map)
            except Exception as exc:  # recorded, never admitted
                facts = {'securityId': s['securityId'], 'ticker': s['ticker'], 'canonicalId': s['canonicalId'], 'exchange': s['exchange'], 'asOf': s['asOf'],
                         'error': repr(exc)[:300], 'events': [{**ev, 'verdict': 'INSUFFICIENT_FILINGS', 'detail': 'FETCH_OR_PARSE_FAILURE'} for ev in s['events']]}
            facts['candidateCiks'] = ciks[s['securityId']]
            facts['protocolSha256'] = PROTOCOL_SHA
            facts['caProtocolSha256'] = V.PROTOCOL_SHA
            facts['verifiedAt'] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
            fh.write(json.dumps(facts) + '\n')
            fh.flush()
            print(s['securityId'], [(e['week'], e.get('verdict'), e.get('detail')) for e in facts['events']], seclib.STATS, flush=True)


if __name__ == '__main__':
    main()
