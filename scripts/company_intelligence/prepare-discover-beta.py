#!/usr/bin/env python3
"""Read-only Discover review candidate from tracked catalogue + real SEC facts.

No SQLite, ingestion, remote writes or state initialization. REVIEW_ONLY candidates
cannot be published by the consumer bridge and never replace an operating ledger.
"""
import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.earnings import summary, filing_url
from company_intelligence.model import load_universe, SCHEMA, timestamp
from company_intelligence.profiles import public_profile, PARSER_VERSION
from company_intelligence.store import atomic_json, dumps
from company_intelligence.editorial import german_profile

spec = importlib.util.spec_from_file_location('prepare_public', Path(__file__).with_name('prepare-public.py'))
public = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public)
COHORT = 'AAPL,NVDA,TSLA,MSFT,XPEV,PLTR,SOFI,ROOT,U,XYZ,TOST,TGT,AFRM,META,GOOG,GOOGL,ACU,CHE,AOS,RARE,PYXS,VEON'.split(',')


def prepare(root, output, now):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or output.is_relative_to(root) or root.is_relative_to(output):
        raise ValueError('PREVIEW_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY')
    if output.exists() and any(output.iterdir()):
        raise ValueError('PREVIEW_REQUIRES_EMPTY_OUTPUT')
    if not timestamp(now):
        raise ValueError('INVALID_PREVIEW_DATE')
    catalogue_path = root / 'company-intelligence/config/company-profiles.json'
    editorial_path = root / 'company-intelligence/config/profile-editorial-de.json'
    catalogue = json.loads(catalogue_path.read_text())['profiles']
    editorial = json.loads(editorial_path.read_text())
    inputs = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in [catalogue_path, editorial_path, *sorted((root / 'quant/data/universe/instruments').glob('*.json'))]}
    universe = load_universe(root)
    selected = {}
    for ticker in COHORT:
        matches = [c for c in universe.values() if any(l['symbol'] == ticker for l in c['listings'])]
        if len(matches) != 1:
            raise ValueError('PREVIEW_IDENTITY_NOT_UNIQUE:' + ticker)
        selected[matches[0]['companyId']] = matches[0]
    rows, inventory = {}, {}
    for cid, company in sorted(selected.items()):
        profile = german_profile(public_profile(catalogue.get(cid), cid, now), editorial)
        path = root / 'quant/data/sec/consumer' / ('CIK' + str(company['cik']) + '.json')
        consumer = json.loads(path.read_text()) if path.is_file() else None
        if consumer:
            inputs[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        financials = summary(consumer, company['cik'], now)
        ends = [m['current']['periodEnd'] for m in financials.get('metrics', {}).values() if (m.get('current') or {}).get('periodEnd')]
        financials['reportingPeriod'] = max(ends) if ends else None
        financials['stale'] = not ends or max(ends) < (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=180)).date().isoformat()
        documents = {}
        for metric in financials.get('metrics', {}).values():
            fact = metric.get('current') or {}
            url = filing_url(company['cik'], fact.get('filingId', ''))
            if url:
                documents[url] = {'companyId': cid, 'type': 'SEC_FACT_FILING_REFERENCE', 'url': url, 'filedAt': fact.get('filedAt')}
        if profile:
            for source in profile['sources']:
                documents[source['url']] = {'companyId': cid, 'type': 'FINANCIAL_REPORT', 'url': source['url'], 'form': source.get('form'), 'filedAt': source.get('filedAt')}
        rows[cid] = {'schema': SCHEMA, 'companyId': cid, 'companyName': company['names'][0], 'listings': company['listings'], 'generatedAt': now, 'state': 'AVAILABLE' if profile or financials.get('state') == 'AVAILABLE' else 'NO_DATA',
                     'previewBasis': 'CATALOGUE_AND_EXISTING_FACTS', 'latestFinancials': financials, **({'companyProfile': profile} if profile else {}),
                     'materials': list(documents.values()), **{k: [] for k in ['news', 'events', 'earnings', 'filings', 'calls', 'timeline', 'presentations', 'materialEvents']}}
        inventory[cid] = {'tickers': sorted(l['symbol'] for l in company['listings'] if l['symbol'] in COHORT), 'germanProfile': bool(profile and profile.get('language') == 'de'), 'financials': financials.get('state'),
                          'reportingPeriod': financials['reportingPeriod'], 'financialSourceAsOf': financials.get('sourceAsOf'), 'staleFinancials': financials['stale'], 'materials': len(documents), 'news': 0, 'confirmedUpcoming': 0,
                          'scope': 'TRACKED_CATALOGUE_AND_FACTS_ONLY', 'profileSources': profile['sources'] if profile else []}
    generation = hashlib.sha256(dumps({'inputs': inputs, 'now': now, 'rows': rows}).encode()).hexdigest()[:24]
    with tempfile.TemporaryDirectory(prefix='discover-beta-input-') as temporary:
        stage = Path(temporary)
        members = {}
        for cid, value in rows.items():
            atomic_json(stage / f'snapshots/{generation}/{cid}.json', value)
            for listing in value['listings']:
                if listing['symbol'] in COHORT:
                    members.setdefault(listing['symbol'], []).append({**listing, 'companyId': cid})
        for prefix in sorted({t[:2] for t in members}):
            ticks = {t: ls for t, ls in members.items() if t.startswith(prefix)}
            cids = {l['companyId'] for ls in ticks.values() for l in ls}
            atomic_json(stage / f'snapshots/{generation}/lookup/{prefix}.json', {'schema': SCHEMA, 'generation': generation, 'tickers': ticks, 'companies': {c: f'snapshots/{generation}/{c}.json' for c in cids}})
        atomic_json(stage / 'index.json', {'schema': SCHEMA, 'state': 'PREVIEW', 'generation': generation, 'generatedAt': now})
        result = public.prepare(stage, output, COHORT)
    m = json.loads((output / 'manifest.json').read_text())
    m.update(releaseState='REVIEW_ONLY', basis='TRACKED_CATALOGUE_AND_EXISTING_FACTS', operationalLedgerRestored=False)
    atomic_json(output / 'manifest.json', m)
    report = {'schema': 'discover-beta-review-1', 'releaseState': 'REVIEW_ONLY', 'generatedAt': now, **result, 'sourceGeneration': generation, 'sourceInputs': inputs, 'parserVersion': PARSER_VERSION,
              'inventory': inventory, 'operationalLedgerPresent': False, 'remotePreservationVerified': False, 'sourceUsageApproval': 'PENDING_COMMERCIAL_REVIEW', 'warning': 'Not the expanded operating generation; cannot be published.'}
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--report', type=Path, required=True)
    p.add_argument('--as-of', default=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'))
    a = p.parse_args()
    report = prepare(ROOT, a.out, a.as_of)
    import subprocess
    report['sourceCodeSha'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    atomic_json(a.report, report)
    print(json.dumps({k: report[k] for k in ['releaseState', 'generation', 'companies', 'assets', 'bytes', 'maxPayloadBytes']}))
