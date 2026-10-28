#!/usr/bin/env python3
"""V9 events: stratified random parity of submissions-JSON acceptanceDateTime vs original
SGML header <ACCEPTANCE-DATETIME> (US Eastern local, YYYYMMDDHHMMSS) from
<acc>-index-headers.html. Also checks form type, Item 2.02 presence and accession identity.
Sample is drawn with a fixed SHA-256 seed before any header is fetched; plan hash is recorded.
Raw headers stay in the private cache; the report holds derived facts and body SHA-256 only."""
import argparse, datetime, hashlib, html, json, pathlib, re, sys, zoneinfo
ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

SEED = 'V9-EVENTS-HEADER-PARITY-1'
ET = zoneinfo.ZoneInfo('America/New_York')
URL = 'https://www.sec.gov/Archives/edgar/data/{cik}/{nodash}/{acc}-index-headers.html'
WINDOW = ('2025-09-30', '2026-10-27')


def h(s):
    return hashlib.sha256(s.encode()).hexdigest()


def stratum(f):
    hour = int(f['acceptanceDateTimeRaw'][11:13])
    bucket = 'H00-12' if hour < 13 else 'H13-19' if hour < 20 else 'H20-24'
    return f['form'] + '|' + f['acceptanceDateTimeRaw'][:7] + '|' + bucket


def plan(ledger, n_original, n_amend):
    pool = [f for f in ledger['filings'] if f['item202'] and WINDOW[0] <= f['acceptanceDateTimeRaw'][:10] <= WINDOW[1]]
    out = []
    for form, n in (('8-K', n_original), ('8-K/A', n_amend)):
        rows = [f for f in pool if f['form'] == form]
        strata = {}
        for f in rows:
            strata.setdefault(stratum(f), []).append(f)
        total = len(rows)
        for key in sorted(strata):
            group = sorted(strata[key], key=lambda f: h(SEED + f['accession']))
            take = max(1, round(n * len(group) / total)) if total else 0
            out += [dict(cik=f['cik'], accession=f['accession'], form=f['form'], stratum=key,
                         acceptanceDateTimeRaw=f['acceptanceDateTimeRaw'], filingDate=f['filingDate'], items=f['items']) for f in group[:take]]
    return out


def audit(body, item):
    text = html.unescape(body.decode('utf8', errors='replace'))
    m = re.search(r'<ACCEPTANCE-DATETIME>\s*(\d{14})', text)
    if not m:
        return dict(state='HEADER_NOT_FOUND')
    east = datetime.datetime.strptime(m.group(1), '%Y%m%d%H%M%S').replace(tzinfo=ET)
    utc = east.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    raw = item['acceptanceDateTimeRaw']
    eastern_digits = east.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    acc = re.search(r'ACCESSION NUMBER:\s*([0-9-]+)', text)
    typ = re.search(r'CONFORMED SUBMISSION TYPE:\s*(\S+)', text)
    filed = re.search(r'FILED AS OF DATE:\s*(\d{8})', text)
    items = re.findall(r'ITEM INFORMATION:\s*([^\n<]+)', text)
    r = dict(headerEastern=m.group(1), headerUtc=utc, submissionsRaw=raw,
             interpretation='RAW_IS_UTC' if raw == utc else 'RAW_IS_EASTERN_DIGITS_LABELED_Z' if raw == eastern_digits else 'NEITHER',
             accessionIdentity=bool(acc and acc.group(1) == item['accession']), headerForm=typ.group(1) if typ else None,
             formMatch=bool(typ and typ.group(1) == item['form']), headerFiledAsOf=filed.group(1) if filed else None,
             filingDateMatch=bool(filed and filed.group(1) == item['filingDate'].replace('-', '')),
             headerItem202=any('Results of Operations and Financial Condition' in x for x in items))
    r['state'] = 'MATCH' if r['interpretation'] != 'NEITHER' and r['accessionIdentity'] and r['formMatch'] and r['filingDateMatch'] and r['headerItem202'] else 'MISMATCH'
    return r


def main():
    p = argparse.ArgumentParser(); p.add_argument('--out', required=True); p.add_argument('--n-original', type=int, default=240); p.add_argument('--n-amend', type=int, default=30)
    p.add_argument('--offline', action='store_true'); a = p.parse_args()
    out = pathlib.Path(a.out).resolve()
    if out == ROOT or ROOT in out.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    ledger = json.loads((out / 'sec-ledger.json').read_text())
    sample = plan(ledger, a.n_original, a.n_amend)
    plan_hash = hashlib.sha256(json.dumps(sample, sort_keys=True).encode()).hexdigest()
    (out / 'header-plan.json').write_text(json.dumps(dict(seed=SEED, planHash=plan_hash, sample=sample)))

    if a.offline:
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from harvest_8k_items import OfflineCache  # noqa: E402
        c = OfflineCache(out)
    else:
        c = SECHttpClient(cache=DiskCache(directory=out / 'sec-cache', ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=2, burst=2), max_retries=3)
    results = []
    for item in sample:
        url = URL.format(cik=int(item['cik']), nodash=item['accession'].replace('-', ''), acc=item['accession'])
        r = dict(item, url=url)
        try:
            body = c.get_bytes(url)
            r.update(audit(body, item), sourceSha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
        except Exception as e:
            r.update(state='UNRESOLVED', reason=str(e)[:200])
        results.append(r)
    def cnt(key, form=None):
        out_ = {}
        for r in results:
            if form and r['form'] != form:
                continue
            out_[str(r.get(key))] = out_.get(str(r.get(key)), 0) + 1
        return out_
    report = dict(schemaVersion='v9-events-header-parity-1.0.0', seed=SEED, planHash=plan_hash, ledgerSha256=hashlib.sha256((out / 'sec-ledger.json').read_bytes()).hexdigest(),
                  codeSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), sampled=len(results),
                  byForm={f: sum(r['form'] == f for r in results) for f in ('8-K', '8-K/A')}, strata=len({r['stratum'] for r in results}),
                  states=cnt('state'), statesOriginal=cnt('state', '8-K'), interpretation=cnt('interpretation'),
                  accessionIdentity=cnt('accessionIdentity'), formMatch=cnt('formMatch'), filingDateMatch=cnt('filingDateMatch'), headerItem202=cnt('headerItem202'),
                  conclusion=None, results=results, requestStats=c.stats,
                  meaning='SEC acceptance only; an upper bound on public availability, not the company press-release time.')
    interp = {r.get('interpretation') for r in results if r['state'] != 'UNRESOLVED' and r.get('interpretation')}
    report['conclusion'] = 'SUBMISSIONS_ACCEPTANCE_IS_TRUE_UTC' if interp == {'RAW_IS_UTC'} else 'SUBMISSIONS_ACCEPTANCE_IS_EASTERN_LABELED_Z' if interp == {'RAW_IS_EASTERN_DIGITS_LABELED_Z'} else 'INCONSISTENT'
    (out / 'header-parity.json').write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ('sampled', 'byForm', 'strata', 'states', 'statesOriginal', 'interpretation', 'accessionIdentity', 'formMatch', 'filingDateMatch', 'headerItem202', 'conclusion', 'requestStats')}))


if __name__ == '__main__':
    main()
