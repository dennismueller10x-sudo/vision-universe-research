"""Read an existing fresh restoration; write public-safe eligibility evidence only."""
import argparse
import json
from pathlib import Path
import sys
import time
from collections import Counter
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.store import Store, atomic_json
from company_intelligence.top46_content import identities
from company_intelligence.current_state_acceptance import database_proof
from company_intelligence.universe_eligibility import generate
from company_intelligence.model import load_universe
from company_intelligence.universe_samples import samples

def private_inventory(report, eligibility, companies, current):
    """Keep private payload coverage separate from master-only identities."""
    rows = {cid: row for cid, row in eligibility['issuers'].items() if row['hasPrivatePayload']}
    return {
        'identityInventoryListingCount': report['privateListingCount'],
        'privateListingCount': sum(len(companies[cid]['listings']) for cid in rows),
        'currentPrivateListingCount': sum(len(current[cid]['listings']) for cid in rows if cid in current),
        'privateProfileStates': dict(Counter(row['profileState'] for row in rows.values())),
        'privateFinancialStates': dict(Counter(row.get('financialState', 'NOT_EVALUATED') for row in rows.values())),
        'privateSourceStates': dict(Counter(row['sourceState'] for row in rows.values())),
        'privateModuleFailureClasses': dict(Counter(reason for row in rows.values() for reason in row.get('moduleReasons', {}).values())),
    }

def audit(state, identity_root, output, as_of=None):
    state, identity_root, output = Path(state), Path(identity_root), Path(output)
    if not (state / 'state.sqlite').is_file():
        raise ValueError('CURRENT_FULL_RESTORED_STATE_REQUIRED')
    start = time.monotonic()
    prior = json.loads((state / 'latest-run.json').read_text())
    if prior.get('privateCompanies', 0) < 5120:
        raise ValueError('CURRENT_FULL_PRIVATE_UNIVERSE_REQUIRED')
    before = {n: database_proof(state / n) for n in ('state.sqlite', 'archive.sqlite') if (state / n).is_file()}
    if prior.get('privateIntegrity') != before:
        raise ValueError('CURRENT_AUTHORITATIVE_TABLE_PROOF_MISMATCH')
    store = Store(state / 'state.sqlite')
    try:
        stamp=as_of or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
        current=identities(ROOT,store)
        # Keep retired historical identities in the private inventory; admit new
        # authoritative master identities without per-stock manual approval.
        companies={**current,**identities(identity_root,store)}
        report, eligibility = generate(store, companies, output / 'consumer', stamp, current)
        report.update(private_inventory(report, eligibility, companies, current))
    finally:
        store.close()
    after = {n: database_proof(state / n) for n in before}
    if before != after:
        raise ValueError('READ_ONLY_AUDIT_CHANGED_PRIVATE_TABLES')
    report.update(status='PASS', authoritativeStateGeneration=prior['sourceGeneration'], privateStateAsOf=prior['asOf'], databases=before,
                  privateStateUnchanged=True, runtimeSeconds=round(time.monotonic() - start, 3))
    atomic_json(output / 'audit.json', report)
    atomic_json(output / 'eligibility.json', eligibility)
    samples(output / 'consumer', eligibility, output / 'sample.json')
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', required=True); p.add_argument('--identity-root', required=True); p.add_argument('--out', required=True); p.add_argument('--as-of')
    a = p.parse_args(); r = audit(a.state, a.identity_root, a.out, a.as_of)
    print(json.dumps({k: r[k] for k in ('status', 'privateIssuerCount', 'privatePayloadCount', 'eligibleIssuerCount', 'statusCounts', 'moduleCounts', 'generation', 'runtimeSeconds')}))
