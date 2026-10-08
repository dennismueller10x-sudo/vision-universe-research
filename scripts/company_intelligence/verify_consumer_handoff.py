"""Project the bounded review cohort from a verified fresh R2 restore; no network."""
import argparse
import hashlib
import importlib.util
import json
import sqlite3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))


def verify(state, consumer, evidence):
    state, consumer, evidence = map(lambda p:Path(p).resolve(),(state,consumer,evidence))
    if not (state/'state.sqlite').is_file() or consumer.exists():
        raise ValueError('VERIFIED_EXISTING_STATE_AND_FRESH_CONSUMER_OUTPUT_REQUIRED')
    result = json.loads(evidence.read_text())
    if result.get('status')!='ACCEPTED_LEDGER_AND_DETERMINISTIC_EXPORT_VERIFIED':
        raise ValueError('ACCEPTED_RESTORE_EVIDENCE_REQUIRED')
    # A content release derives from the complete verified baseline. No remote
    # private pointer is changed here; publication separately proves a fresh
    # restore of the full derivative in its own content-only namespace.
    if (ROOT/'company-intelligence/config/top46-content-review.json').is_file() and not result.get('contentAugmentation'):
        from company_intelligence.top46_content import prepare
        identity_root = ROOT/'.accepted-engine'
        if not identity_root.is_dir():
            raise ValueError('PINNED_ACCEPTED_IDENTITY_ROOT_REQUIRED')
        content = prepare(state, identity_root, state.parent/(state.name+'-content-evidence.json'))
        result['baselineProjectedGeneration'] = result['projectedGeneration']
        result['projectedGeneration'] = content['export']['generation']
        result['contentAugmentation'] = content
    elif result.get('contentAugmentation'):
        from current_state_acceptance import database_proof
        from company_intelligence.top46_content import reviewed, export
        content = result['contentAugmentation']
        if reviewed()[1] != content['reviewHash'] or {n:database_proof(state/n) for n in content['databases']} != content['databases']:
            raise ValueError('FRESH_CONTENT_RESTORE_PROOF_MISMATCH')
        reproduced = export(state,ROOT/'.accepted-engine')
        if reproduced != content['export']:
            raise ValueError('FRESH_CONTENT_GENERATION_MISMATCH')
        result['contentFreshRestoreVerified'] = True
    expected = json.loads((ROOT/'docs/company-intelligence/full-data-release-candidate.json').read_text())
    golden = json.loads((ROOT/'docs/company-intelligence/full-data-consumer-manifest.json').read_text())
    if result['projectedGeneration']!=expected['sourceGeneration']:
        raise ValueError('CONSUMER_SOURCE_GENERATION_MISMATCH')
    configured=json.loads((ROOT/'company-intelligence/config/sources.json').read_text())
    with sqlite3.connect('file:'+str(state/'state.sqlite')+'?mode=ro',uri=True) as db:
        restored=[json.loads(r[0]) for r in db.execute('SELECT payload FROM sources')]
    sources={s['sourceId']:s for s in configured};sources.update({s['sourceId']:s for s in restored})
    spec=importlib.util.spec_from_file_location('consumer_prepare',ROOT/'scripts/company_intelligence/prepare-public.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    prepared=module.prepare(state/'public/company-intelligence/data',consumer,golden['tickers'],list(sources.values()))
    manifest=json.loads((consumer/'manifest.json').read_text())
    if manifest != golden or prepared['generation'] != expected['generation']:
        raise ValueError('FRESH_R2_CONSUMER_PROJECTION_DIFFERS_FROM_REVIEWED_CANDIDATE')
    for path,meta in manifest['assets'].items():
        data=(consumer/path).read_bytes()
        if len(data)!=meta['bytes'] or hashlib.sha256(data).hexdigest()!=meta['sha256']:
            raise ValueError('FRESH_CONSUMER_ASSET_INTEGRITY_MISMATCH')
    result['consumerHandoff']={**prepared,'tickers':len(golden['tickers']),'sourceUsagePolicy':manifest['sourceUsagePolicy'],
                              'releaseState':manifest['releaseState'],'allReviewedAssetHashesMatch':True,
                              'manifestSha256':hashlib.sha256((consumer/'manifest.json').read_bytes()).hexdigest(),
                              'privateOperationalRowsIncluded':False,'remoteCustomerPublicationPerformed':False}
    evidence.write_text(json.dumps(result,indent=2)+'\n')
    return result['consumerHandoff']


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('state','consumer','evidence'):p.add_argument('--'+k,required=True,type=Path)
    a=p.parse_args();print(json.dumps(verify(a.state,a.consumer,a.evidence)))
