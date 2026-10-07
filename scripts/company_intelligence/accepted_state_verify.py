"""Read-only evidence for recovered accepted state; generation drift cannot discard it."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from current_state_acceptance import database_proof


def verify(snapshot, state, engine, expected):
    snapshot, state, engine = (Path(p).resolve() for p in (snapshot, state, engine))
    assert snapshot.stat().st_size == expected['checkpointBytes'], 'ACCEPTED_BYTES_MISMATCH'
    assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == expected['checkpointSha256'], 'ACCEPTED_HASH_MISMATCH'
    assert not state.exists(), 'ACCEPTED_RESTORE_REQUIRES_EMPTY_DIRECTORY'
    assert subprocess.check_output(['git','-C',str(engine),'rev-parse','HEAD'],text=True).strip() == expected['producerCodeSha'], 'ENGINE_PIN_MISMATCH'
    assert not subprocess.check_output(['git','-C',str(engine),'status','--porcelain'],text=True).strip(), 'ENGINE_MUST_BE_CLEAN'
    subprocess.run([sys.executable,str(engine/'scripts/company_intelligence/checkpoint.py'),'restore','--snapshot',str(snapshot),'--state',str(state),'--sha256',expected['checkpointSha256']],check=True,stdout=subprocess.DEVNULL)
    before = {name:database_proof(state/name) for name in expected['databases']}
    assert before == expected['databases'], 'ACCEPTED_ALL_DATABASE_PROOFS_MISMATCH'
    # Execute only the pinned, clean engine. No CLI run/seed/prune/crawl occurs.
    import os
    env = {**os.environ,'PYTHONPATH':str(engine/'scripts')}
    code = '''import json,sys,hashlib
from pathlib import Path
from company_intelligence.acceptance import fingerprint
from company_intelligence.model import load_universe
from company_intelligence.store import Store
from company_intelligence.coverage import report
root,state,out=map(Path,sys.argv[1:]);before=fingerprint(state)
store=Store(state/'state.sqlite');companies=load_universe(root)
sites=json.loads((root/'company-intelligence/config/official-sites.json').read_text())
for c in companies.values():
 seed=sites.get(c.get('cik')); verified=store.state('officialSite:'+c['companyId'],{})
 if seed:c['officialSites']=[seed.get('irHomepage') or seed['url']]
 elif verified.get('status')=='VALIDATED':c['officialSites']=[verified['url']]
stamp=store.state('latestRun')['generatedAt']
coverage=report(store,companies,stamp)['counts']
counts={k:coverage[v]['companies'] for k,v in {'profiles':'companyProfileAvailable','newsIssuers':'anyNews','callIssuers':'calls','presentationIssuers':'presentations'}.items()}
first=store.export(companies,out,stamp)
def hashes():return {str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*.json')}
a=hashes();second=store.export(companies,out,stamp);b=hashes();store.close()
assert first==second and a==b,'NONDETERMINISTIC_CONSUMER_EXPORT'
print(json.dumps({'acceptedCounts':counts,'fingerprint':before,'export':first,'generatedAt':stamp,'assetCount':len(a),'assetHash':hashlib.sha256(json.dumps(a,sort_keys=True).encode()).hexdigest()}))
'''
    result = json.loads(subprocess.check_output([sys.executable,'-c',code,str(engine),str(state),str(state/'public/company-intelligence/data')],env=env,cwd=engine,text=True))
    assert result['fingerprint'] == expected['fingerprint'], 'ACCEPTED_SIX_TABLE_MISMATCH'
    assert result['export']['exportedCompanies'] == expected['exportedCompanies'], 'ACCEPTED_PAYLOAD_COUNT_MISMATCH'
    assert result['acceptedCounts'] == expected['acceptedCounts'], 'ACCEPTED_COVERAGE_COUNTS_MISMATCH'
    after = {name:database_proof(state/name) for name in before}
    assert before == after, 'PROJECTION_MUTATED_PRIVATE_STATE'
    return {'schema':1,'status':'ACCEPTED_LEDGER_AND_DETERMINISTIC_EXPORT_VERIFIED',
            'checkpointSha256':expected['checkpointSha256'],'checkpointBytes':expected['checkpointBytes'],
            'acceptedGeneration':expected['generation'],'projectedGeneration':result['export']['generation'],
            'originalGenerationReproduced':result['export']['generation']==expected['generation'],
            'engineCodeSha':expected['producerCodeSha'],'exportedCompanies':result['export']['exportedCompanies'],
            'acceptedCounts':result['acceptedCounts'],'generatedAt':result['generatedAt'],'assetCount':result['assetCount'],'assetHash':result['assetHash'],
            'fingerprint':result['fingerprint'],'databases':before,'privateStateRowsIncluded':False}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('snapshot','state','engine','expected','evidence'):p.add_argument('--'+k,required=True,type=Path)
    p.add_argument('--original-engine',type=Path)
    a=p.parse_args();expected=json.loads(a.expected.read_text());result=verify(a.snapshot,a.state,a.engine,expected)
    if a.original_engine:
        original_expected={**expected,'producerCodeSha':expected['acceptedProducerCodeSha']}
        original=verify(a.snapshot,a.state.parent/(a.state.name+'-original-producer'),a.original_engine,original_expected)
        result['acceptedProducerVerification']={k:original[k] for k in ('engineCodeSha','projectedGeneration','originalGenerationReproduced','exportedCompanies','assetHash','assetCount')}
        result['generationDifferenceCause']='PRODUCER_REVISION_CHANGED; SAME_TIMESTAMP_AND_EXACT_PRIVATE_TABLES'
    a.evidence.parent.mkdir(parents=True,exist_ok=True);a.evidence.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ('status','acceptedGeneration','projectedGeneration','exportedCompanies','originalGenerationReproduced')}))
