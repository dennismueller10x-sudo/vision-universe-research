"""Read an existing fresh restoration; write public-safe eligibility evidence only."""
import argparse
import json
from pathlib import Path
import sys
import time
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.store import Store, atomic_json
from company_intelligence.top46_content import identities
from company_intelligence.current_state_acceptance import database_proof
from company_intelligence.universe_eligibility import generate

def audit(state, identity_root, output):
    state, output = Path(state), Path(output)
    if not (state / 'state.sqlite').is_file():
        raise ValueError('CURRENT_FULL_RESTORED_STATE_REQUIRED')
    start = time.monotonic()
    prior = json.loads((state / 'latest-run.json').read_text())
    if prior.get('privateCompanies', 0) < 5120:
        raise ValueError('CURRENT_FULL_PRIVATE_UNIVERSE_REQUIRED')
    before = {n: database_proof(state / n) for n in ('state.sqlite', 'archive.sqlite') if (state / n).is_file()}
    store = Store(state / 'state.sqlite')
    try:
        report, eligibility = generate(store, identities(identity_root, store), output / 'consumer', prior['asOf'])
    finally:
        store.close()
    after = {n: database_proof(state / n) for n in before}
    if before != after:
        raise ValueError('READ_ONLY_AUDIT_CHANGED_PRIVATE_TABLES')
    report.update(status='PASS', authoritativeStateGeneration=prior['sourceGeneration'], databases=before,
                  privateStateUnchanged=True, runtimeSeconds=round(time.monotonic() - start, 3))
    atomic_json(output / 'audit.json', report)
    atomic_json(output / 'eligibility.json', eligibility)
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', required=True); p.add_argument('--identity-root', required=True); p.add_argument('--out', required=True)
    a = p.parse_args(); r = audit(a.state, a.identity_root, a.out)
    print(json.dumps({k: r[k] for k in ('status', 'privateIssuerCount', 'privatePayloadCount', 'eligibleIssuerCount', 'statusCounts', 'moduleCounts', 'generation', 'runtimeSeconds')}))
