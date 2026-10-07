#!/usr/bin/env python3
"""Build a consumer-only cohort snapshot from immutable exports; no ledger access."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from company_intelligence.product import project
from company_intelligence.store import atomic_json, dumps
from company_intelligence.model import SCHEMA


def prepare(source, output, tickers):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError('PUBLIC_OUTPUT_MUST_BE_SEPARATE')
    index = json.loads((source / 'index.json').read_text())
    import re
    generation = index.get('generation', '')
    if index.get('schema') != SCHEMA or not re.fullmatch('[a-f0-9]{24}', generation):
        raise ValueError('INVALID_EXPORT')
    requested = sorted(set(tickers))
    if not requested or len(requested) > 100 or any(not re.fullmatch(r'[A-Z0-9][A-Z0-9.-]{0,14}', t) for t in requested):
        raise ValueError('INVALID_PILOT_COHORT')
    values, members = {}, {}
    for ticker in requested:
        shard = json.loads((source / 'snapshots' / generation / 'lookup' / (ticker[:2] + '.json')).read_text())
        listings = shard.get('tickers', {}).get(ticker, [])
        ids = {l['companyId'] for l in listings}
        if len(ids) != 1 or shard.get('generation') != generation:
            raise ValueError('PILOT_IDENTITY_NOT_UNIQUE')
        cid = next(iter(ids))
        if not re.fullmatch(r'(?:iss_cik_\d{10}|vu_[a-f0-9]{14})', cid):
            raise ValueError('INVALID_ISSUER')
        members[ticker] = listings
        path = shard.get('companies', {}).get(cid)
        if path is None:
            continue  # Honest no-payload lookup; never fabricate issuer facts.
        if path != f'snapshots/{generation}/{cid}.json':
            raise ValueError('INVALID_DATA_PATH')
        raw = json.loads((source / path).read_text())
        if raw.get('companyId') != cid or raw.get('schema') != SCHEMA or not any(l.get('symbol') == ticker for l in raw.get('listings', [])):
            raise ValueError('IDENTITY_MISMATCH')
        values[cid] = project(raw)
    digest = hashlib.sha256(dumps({'sourceGeneration': generation, 'cohort': members, 'values': values}).encode()).hexdigest()[:24]
    paths = {cid: f'snapshots/{digest}/{cid}.json' for cid in values}
    assets = {}
    def write(path, value):
        data = (dumps(value) + '\n').encode()
        if len(data) > 512 * 1024:
            raise ValueError('PUBLIC_PAYLOAD_BUDGET_EXCEEDED')
        atomic_json(output / path, value)
        assets[path] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    for cid, value in values.items():
        write(paths[cid], value)
    prefixes = sorted({t[:2] for t in members})
    for prefix in prefixes:
        rows = {t: l for t, l in members.items() if t.startswith(prefix)}
        ids = {l['companyId'] for listings in rows.values() for l in listings}
        write(f'snapshots/{digest}/lookup/{prefix}.json', {'schema': SCHEMA, 'generation': digest, 'tickers': rows, 'companies': {cid: paths[cid] for cid in ids if cid in paths}})
    write('index.json', {'schema': SCHEMA, 'state': 'PREVIEW', 'generatedAt': index['generatedAt'], 'generation': digest, 'lookupShards': prefixes, 'companyCount': len({l['companyId'] for ls in members.values() for l in ls}), 'coveredCompanyCount': len(values), 'scope': 'CONTROLLED_COHORT'})
    manifest = {'schema': 1, 'generation': digest, 'generatedAt': index['generatedAt'], 'assets': assets, 'tickers': requested}
    atomic_json(output / 'manifest.json', manifest)
    return {'generation': digest, 'companies': len(values), 'assets': len(assets), 'bytes': sum(v['bytes'] for v in assets.values()), 'maxPayloadBytes': max(v['bytes'] for v in assets.values())}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--tickers', required=True)
    a = p.parse_args()
    print(json.dumps(prepare(a.source, a.out, a.tickers.upper().split(',')), sort_keys=True))
