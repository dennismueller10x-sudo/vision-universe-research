"""Fresh-runner acceptance evidence. Canaries are private test data, never deployed.

Each stage opens an independent directory. Only the object-store checkpoint can
transfer ledger state; the review artifact contains hashes/counts, not the DB.
"""
import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe, stable_id, make_item
from company_intelligence.store import Store, dumps, atomic_json
from company_intelligence.pipeline import utcnow


def fingerprint(state):
    with sqlite3.connect('file:' + str((Path(state) / 'state.sqlite').resolve()) + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('ACCEPTANCE_CORRUPT_LEDGER')
        tables = {}
        for table in ('items', 'events', 'sources', 'event_alias', 'state', 'audit'):
            rows = db.execute('SELECT * FROM ' + table + ' ORDER BY 1').fetchall()
            tables[table] = {'count': len(rows), 'sha256': hashlib.sha256(dumps(rows).encode()).hexdigest(),
                             'identitySha256': hashlib.sha256(dumps([r[0] for r in rows]).encode()).hexdigest()}
        latest = db.execute("SELECT payload FROM state WHERE key='latestRun'").fetchone()
        generation = json.loads(latest[0]).get('export', {}).get('generation') if latest else None
    return {'schema': 'vu-intelligence-acceptance-1', 'tables': tables, 'generation': generation,
            'logicalHash': hashlib.sha256(dumps(tables).encode()).hexdigest()}


def project(state, command='run', scope='cohort'):
    if scope not in ('cohort', 'universe'):
        raise ValueError('ACCEPTANCE_INVALID_SCOPE')
    selection = ['--all-offline'] if scope == 'universe' else ['--tickers', 'AAPL,ROOT', '--limit', '2']
    subprocess.run([sys.executable, str(ROOT / 'scripts/company_intelligence/cli.py'), command,
                    '--state', str(state), *selection], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def prepare(state, scope='cohort'):
    state = Path(state)
    if state.exists():
        raise ValueError('ACCEPTANCE_REQUIRES_FRESH_RUNNER')
    project(state, scope=scope)
    universe = load_universe(ROOT)
    cid = next(cid for cid, c in universe.items() if any(l['symbol'] == 'ROOT' for l in c['listings']))
    now = utcnow()
    with_store = Store(state / 'state.sqlite')
    try:
        # Deliberately labelled fixtures exercise state types absent in a small
        # offline batch. No public deployment/upload is performed by this harness.
        event_id = stable_id(cid, 'PRIVATE_ACCEPTANCE_CALENDAR_CANARY')
        with_store.event({'eventId': event_id, 'companyId': cid, 'eventType': 'EARNINGS_SCHEDULED',
                          'headline': 'PRIVATE ACCEPTANCE TEST DATA', 'date': now[:10], 'dateStart': now[:10],
                          'dateEnd': now[:10], 'confirmationStatus': 'CONFIRMED', 'confidence': .1,
                          'discoveredAt': now}, now)
        with with_store.db:
            with_store.db.execute('INSERT INTO event_alias VALUES (?,?)', (stable_id(cid, 'acceptance-alias'), event_id))
        with_store.source({'sourceId': 'private-acceptance-health-canary', 'companyId': cid, 'type': 'RSS',
                           'url': 'https://example.com/private-acceptance', 'active': False, 'failureCount': 2,
                           'lastError': 'ACCEPTANCE_SIMULATED_HTTP_503', 'nextCheck': '2099-01-01T00:00:00Z'})
        from company_intelligence.feeds import parse_feed
        recorded = parse_feed((ROOT / 'scripts/company_intelligence/tests/fixtures/root-news-metadata.xml').read_bytes(), 'https://ir.joinroot.com/')
        raw = next(e for e in recorded if e.get('publishedAt') and e['publishedAt'] <= now)
        with_store.ingest(make_item(raw, {'type': 'RSS', 'sourceId': 'private-acceptance-recorded-fixture',
                                        'url': 'https://ir.joinroot.com/'},
                                   {'companyId': cid, 'confidence': .99, 'evidence': ['PRIVATE_ACCEPTANCE_RECORDED_FIXTURE']}, now))
        with_store.set_state('acceptanceLedgerIdentity', stable_id(cid, now, 'fresh-ledger'))
        with_store.set_state('acceptanceScope', scope)
        with_store.set_state('backfillCursor', cid)
        with_store.set_state('updatedIssuerPending', {cid: '0001788882-26-000001'})
        with_store.set_state('acceptanceCanaries', {'privateTestData': True, 'eventId': event_id})
    finally:
        with_store.close()
    project(state, 'export', scope)
    return fingerprint(state)


def verify(state, expected):
    actual = fingerprint(state)
    if actual != expected:
        raise ValueError('ACCEPTANCE_RESTORED_STATE_MISMATCH')
    # Recover the same immutable generation from private state, without storing
    # public exports remotely. Export timestamp is retained in latestRun.
    store = Store(Path(state) / 'state.sqlite')
    try:
        # Export directly with identical authoritative identities and timestamp.
        companies = load_universe(ROOT)
        sites = json.loads((ROOT / 'company-intelligence/config/official-sites.json').read_text())
        for c in companies.values():
            seed = sites.get(c.get('cik'))
            if seed:
                c['officialSites'] = [seed.get('irHomepage') or seed['url']]
            else:
                verified = store.state('officialSite:' + c['companyId'], {})
                if verified.get('status') == 'VALIDATED':
                    c['officialSites'] = [verified['url']]
        stamp = store.state('latestRun')['generatedAt']
        recovered = store.export(companies, Path(state) / 'public/company-intelligence/data', stamp)
        if recovered['generation'] != expected['generation']:
            raise ValueError('ACCEPTANCE_GENERATION_MISMATCH')
    finally:
        store.close()
    return actual


def advance(state, expected):
    verify(state, expected)
    before = fingerprint(state)
    # Perform a real incremental offline projection on existing master/facts.
    # Keep canaries and aliases; no force or network traffic.
    with sqlite3.connect(Path(state) / 'state.sqlite') as db:
        row = db.execute("SELECT payload FROM state WHERE key='acceptanceScope'").fetchone()
        scope = json.loads(row[0]) if row else 'cohort'
    project(state, scope=scope)
    after = fingerprint(state)
    for table in ('items', 'events', 'sources', 'event_alias'):
        if after['tables'][table]['identitySha256'] != before['tables'][table]['identitySha256'] or after['tables'][table]['count'] != before['tables'][table]['count']:
            raise ValueError('ACCEPTANCE_INCREMENTAL_ID_OR_HEALTH_DRIFT:' + table)
    for table in ('sources', 'event_alias'):
        if after['tables'][table]['sha256'] != before['tables'][table]['sha256']:
            raise ValueError('ACCEPTANCE_HEALTH_OR_ALIAS_DRIFT:' + table)
    store = Store(Path(state) / 'state.sqlite')
    try:
        for key in ('backfillCursor', 'updatedIssuerPending', 'acceptanceLedgerIdentity'):
            if store.state(key) is None:
                raise ValueError('ACCEPTANCE_CHECKPOINT_LOST')
        store.set_state('acceptanceIncrementalCycles', store.state('acceptanceIncrementalCycles', 0) + 1)
    finally:
        store.close()
    return fingerprint(state)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('stage', choices=['prepare', 'verify', 'advance'])
    p.add_argument('--state', required=True, type=Path)
    p.add_argument('--evidence', required=True, type=Path)
    p.add_argument('--scope', choices=['cohort', 'universe'], default='cohort', help='Offline actual master/facts scope; advance recovers scope from R2 state')
    args = p.parse_args()
    expected = json.loads(args.evidence.read_text()) if args.stage != 'prepare' else None
    result = prepare(args.state, args.scope) if args.stage == 'prepare' else advance(args.state, expected) if args.stage == 'advance' else verify(args.state, expected)
    atomic_json(args.evidence, result)
    print(json.dumps({'status': 'PASS', 'stage': args.stage, **result}))


if __name__ == '__main__':
    main()
