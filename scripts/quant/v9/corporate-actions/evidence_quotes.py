#!/usr/bin/env python3
"""V9 workstream B: fetch the original SEC documents behind selected resolutions and extract
short verbatim quotes (<= 300 chars) plus the SHA-256 of each full document body.

Input : --resolutions <ca-event-resolutions.json> (classify.cjs) and optional --manual <json list>
        manual entries: {"key":..., "cik":..., "acc":..., "file":..., "patterns":[regex,...]}
Output: --out <json> (derived facts only). Raw bodies stay in the private DiskCache (--private).
Rate limit: RateLimiter(rate_per_second=2, burst=2), repository SEC client, default User-Agent.
"""
import argparse, hashlib, html, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter, SECHTTPError  # noqa: E402

SPLIT_PAT = [r'(?:reverse\s+)?(?:stock|share)\s+split[^.]{0,260}', r'[^.]{0,160}(?:one|1)[- ]for[- ](?:\w+|\d+)[^.]{0,140}', r'[^.]{0,120}share consolidation[^.]{0,160}']
DIST_PAT = [r'[^.]{0,160}(?:spin-off|spinoff|distribution of)[^.]{0,160}', r'[^.]{0,160}special (?:cash )?dividend[^.]{0,160}']
PRIORITY = {'SPLIT_CONFIRMED_SERIES_UNADJUSTED': ('split', SPLIT_PAT), 'CONFLICT_SPLIT_FILING_WITH_CONTINUOUS_SHARES': ('split', SPLIT_PAT),
            'SPLIT_MENTION_NEAR_DATE_REVIEW': ('split', SPLIT_PAT), 'SPIN_OFF_OR_DISTRIBUTION_CANDIDATE': ('dist', DIST_PAT)}


def text_of(raw):
    s = raw.decode('utf-8', errors='replace')
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'(?s)<[^>]+>', ' ', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--resolutions', required=True)
    ap.add_argument('--manual', default='')
    ap.add_argument('--private', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--max-docs', type=int, default=400)
    a = ap.parse_args()
    private = pathlib.Path(a.private).resolve()
    if private == ROOT or ROOT in private.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    client = SECHttpClient(cache=DiskCache(private / 'http-cache', ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=2, burst=2))
    res = json.load(open(a.resolutions))
    jobs = []
    for r in res['rows']:
        if r.get('resolution') not in PRIORITY:
            continue
        kind, pats = PRIORITY[r['resolution']]
        ev = r['evidence']
        hits = (ev['splitSearch'] or {}).get('strong', []) + (ev['splitSearch'] or {}).get('weak', []) if kind == 'split' else (ev['distSearch'] or {}).get('strong', [])
        for h in hits[:2]:
            acc, fn = h['id'].split(':', 1)
            jobs.append({'key': r['id'] + '|' + r['week'], 'cik': r['cik'], 'acc': acc, 'file': fn, 'form': h['form'], 'filed': h['filed'], 'kind': kind, 'patterns': pats})
    if a.manual:
        for m in json.load(open(a.manual)):
            jobs.append(dict(m, kind='manual'))
    seen, out = {}, []
    for j in jobs[:a.max_docs]:
        url = f"https://www.sec.gov/Archives/edgar/data/{int(j['cik'])}/{j['acc'].replace('-', '')}/{j['file']}"
        if url not in seen:
            try:
                raw = client.get_bytes(url, expected_statuses=(404,))
                seen[url] = (hashlib.sha256(raw).hexdigest(), text_of(raw), len(raw))
            except SECHTTPError as e:
                seen[url] = (None, '', 0)
        h, txt, n = seen[url]
        quotes = []
        for p in j['patterns']:
            for m in re.finditer(p, txt, flags=re.I):
                q = m.group(0).strip()[:300]
                if q and q not in quotes:
                    quotes.append(q)
                if len(quotes) >= 3:
                    break
            if len(quotes) >= 3:
                break
        out.append({k: j[k] for k in ('key', 'cik', 'acc', 'file', 'kind') if k in j} | {'form': j.get('form'), 'filed': j.get('filed'), 'url': url, 'sha256': h, 'bytes': n, 'quotes': quotes})
    rep = {'schemaVersion': 'v9-ca-evidence-quotes-1.0.0', 'note': 'Verbatim quotes (<=300 chars) from original SEC documents; sha256 over the full raw body as served by sec.gov.', 'documents': len(seen), 'requestStats': client.stats, 'rows': out}
    pathlib.Path(a.out).write_text(json.dumps(rep, indent=1))
    print(len(out), len(seen), client.stats)


if __name__ == '__main__':
    main()
