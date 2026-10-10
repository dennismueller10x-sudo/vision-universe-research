"""Bounded existing-source refresh. Full private ledger retained; never discovery.

Reuses Pipeline, safe SQLite checkpoints and the consumer source policy. Per-source
outcomes live in private SQLite; evidence contains aggregate counts only.
"""
import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from company_intelligence.store import Store, atomic_json, dumps
from company_intelligence.pipeline import Pipeline, advance
from company_intelligence.transport import PublicHTTP, SourceError, BudgetExhausted
from company_intelligence.top46_content import identities
from company_intelligence.consumer_usage import first_party, publisher
from company_intelligence.current_state_acceptance import database_proof
from company_intelligence.checkpoint import check_db
from company_intelligence.feeds import parse_feed
from company_intelligence.earnings import summary,valid_date
from company_intelligence.model import ACCESSION, load_universe

def advance_financial_filing(store,company,pipeline,now,budget,provider=None,builder=None):
    """One companyfacts request only for a genuinely unseen periodic filing.
    Reuse the existing SEC consumer normalizer; never modify Quant artifacts.
    A lagging/failed facts response cannot advance the accession cursor.
    """
    cid=company['companyId'];key='financialRefresh:'+cid;prior=store.state(key,{})
    if (prior.get('nextCheck') or '')>now:return 'NOT_DUE'
    filings=store.state('sec-submissions:'+cid,{}).get('filings',{}).get('recent',{})
    rows=[(filings.get('filingDate',[])[i],filings.get('accessionNumber',[])[i]) for i,f in enumerate(filings.get('form',[])) if f in ('10-Q','10-Q/A','10-K','10-K/A','20-F','20-F/A','40-F','40-F/A') and i<len(filings.get('filingDate',[])) and i<len(filings.get('accessionNumber',[])) and valid_date(filings['filingDate'][i]) and ACCESSION.fullmatch(str(filings['accessionNumber'][i]))]
    if not rows:return 'NO_NEW_FILING'
    _,accession=max(rows);current=store.state('financials:'+cid,{})
    known={(v.get('current') or {}).get('filingId') for v in current.get('metrics',{}).values()}
    if accession==prior.get('lastSuccessfulAccession') or accession in known:return 'NO_CHANGE'
    try:
        from quant.sec.provider import SECProvider
        from quant.sec.consumer import build_consumer_bundle
        from quant.sec.registry import MetricRegistry
        facts=(provider or SECProvider(pipeline.sec_client(budget))).get_company_facts(company['cik'],fresh=True)
        if str(facts.get('cik','')).zfill(10)!=company['cik']:raise ValueError('FINANCIAL_FACTS_ISSUER_MISMATCH')
        bundle=(builder or build_consumer_bundle)(company['cik'],facts,MetricRegistry.load(),as_of=now[:10],tickers=[l['symbol'] for l in company['listings']],name=company['names'][0])
        value=summary(bundle,company['cik'],now)
        latest=[(v.get('current') or {}) for v in value.get('metrics',{}).values()]
        ends=[v['periodEnd'] for v in latest if v.get('periodEnd')]
        period=max(ends) if ends else ''
        if value.get('state')!='AVAILABLE' or not any(v.get('filingId')==accession for v in latest) or period<(current.get('reportingPeriod') or ''):
            store.set_state(key,{**prior,'lastAttempt':now,'status':'FACTS_NOT_YET_AVAILABLE','nextCheck':advance(now,4)})
            return 'FACTS_NOT_YET_AVAILABLE'
        value.update(reportingPeriod=period,stale=period<advance(now,-180*24)[:10])
        store.set_state('financials:'+cid,value)
        from company_intelligence.reporting_calendar import fact_history
        store.set_state('reportingHistory:'+cid,fact_history(bundle,company['cik'],now));pipeline.refresh_estimates(company)
        store.set_state(key,{'lastAttempt':now,'lastSuccess':now,'lastSuccessfulAccession':accession,'status':'SUCCESS','nextCheck':None})
        return 'SUCCESS'
    except BudgetExhausted:return 'BUDGET_DEFERRED'
    except Exception:
        store.set_state(key,{**prior,'lastAttempt':now,'status':'TEMPORARY_FAILURE','nextCheck':advance(now,4)})
        return 'TEMPORARY_FAILURE'

def settings():
    return json.loads((ROOT/'company-intelligence/config/continuous-refresh.json').read_text())

def cohort(companies):
    frozen=json.loads((ROOT/'docs/company-intelligence/full-data-release-candidate.json').read_text())['inventory']
    if len(frozen)!=45: raise ValueError('FROZEN_COHORT_INVALID')
    selected={cid:companies[cid] for cid in frozen}
    for cid, row in frozen.items():
        for ticker in row['tickers']:
            matches=[c['companyId'] for c in companies.values() if any(l['symbol']==ticker for l in c['listings'])]
            if matches!=[cid]: raise ValueError('COHORT_ISSUER_DRIFT')
    return selected

def outside_proof(db,cids):
    marks=','.join('?' for _ in cids); proof={}
    for table,column in [('items','company'),('sources','company'),('events','company')]:
        rows=db.execute(f'SELECT * FROM {table} WHERE {column} IS NULL OR {column} NOT IN ({marks}) ORDER BY 1',tuple(cids)).fetchall()
        proof[table]=hashlib.sha256(dumps([list(r) for r in rows]).encode()).hexdigest()
    return proof

def source_result(source,now,unchanged=False):
    if source.get('lastSuccess')==now: return 'NO_CHANGE' if unchanged else 'SUCCESS'
    error=source.get('lastError') or ''
    if '429' in error or 'RATE_LIMIT' in error: return 'RATE_LIMITED'
    if any(c in error for c in ['ROBOTS_DISALLOWED','HTTP_401','HTTP_403']): return 'POLICY_REJECTED'
    if 'HTTP_404' in error or 'HTTP_410' in error: return 'SOURCE_REMOVED'
    if any(code in error for code in ('PARSE_','ParseError','JSONDecodeError','MALFORMED','NOT_FEED','NOT_JSON_FEED','INVALID_Q4','Q4_SCHEMA')): return 'PARSE_FAILURE'
    return 'TEMPORARY_FAILURE'

class CheckedHTTP(PublicHTTP):
    current_source=None
    last_body_sha=None
    def get(self,url,*a,**kw):
        response=super().get(url,*a,**kw)
        s=self.current_source
        if s and url==s['url']:
            body=response['body']; self.last_body_sha=hashlib.sha256(body).hexdigest()
            fmt=s.get('format')
            if fmt in ('RSS','RSS_EVENTS','RSS_MATERIALS') or (s['type']=='IR_FEED' and not fmt):
                try: parse_feed(body,url)
                except (SourceError,ValueError,ET.ParseError) as e: raise SourceError('PARSE_INVALID_FEED') from e
            if fmt in ('Q4_NEWS','Q4_EVENTS','Q4_REPORTS','Q4_PRESENTATIONS'):
                try: json.loads(body)
                except ValueError as e: raise SourceError('PARSE_INVALID_JSON') from e
        return response

def refresh(state,identity_root,consumer,evidence,now=None,network=True,financial=False,http=None,universe=False):
    state,consumer=Path(state),Path(consumer); config=settings()
    universe_config=json.loads((ROOT/'company-intelligence/config/universe-rollout.json').read_text())
    if universe: config={**config,**{k:universe_config[k] for k in ('publicRequestBudget','publicMaxSeconds','secRequestBudget','secMaxSeconds')}}
    if not (state/'state.sqlite').is_file(): raise ValueError('FULL_RESTORED_LEDGER_REQUIRED')
    now=now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    started=time.monotonic(); lock=(state/'run.lock').open('a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    store=Store(state/'state.sqlite')
    try:
        companies=identities(identity_root,store)
        current=load_universe(ROOT) if universe else companies
        selected={cid:c for cid,c in companies.items() if cid in current and c['names'] and c['listings']==current[cid]['listings']} if universe else cohort(companies)
        cids=sorted(selected)
        before=outside_proof(store.db,cids); prior=store.state('continuousRefresh',{})
        prior_news=store.db.execute("SELECT count(*) FROM items WHERE json_extract(payload,'$.eventType')='NEWS'").fetchone()[0]
        prior_events=store.db.execute('SELECT count(*) FROM events').fetchone()[0]
        http=http or CheckedHTTP(state/'http',budget=config['publicRequestBudget'],max_seconds=config['publicMaxSeconds'])
        pipeline=Pipeline(ROOT,companies,store,http,now); outcomes=Counter(); lane_success=Counter(); checked=0; deferred=0; updated=set()
        all_sources=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
        sources=[s for s in all_sources if s.get('companyId') in selected]
        eligible=[s for s in sources if s.get('active') and first_party(s,s['companyId']) and not publisher(s['url'])]
        # Oldest successes first prevents repeatedly spending the whole budget on
        # rich issuers. News precedes slower documents; no global publisher feeds.
        eligible.sort(key=lambda s:(s['type']=='IR_MATERIALS',s.get('lastSuccess') or '',s['sourceId']))
        scheduler={}
        if universe:
            from company_intelligence.universe_scheduler import source_queue
            eligible,scheduler=source_queue(sources,selected,now)
        for s in eligible:
            if not network: break
            hours=s.get('intervalHours') if universe else config['newsHours'] if s['type']=='IR_FEED' else config['eventsHours'] if s['type']=='IR_EVENTS' else config['materialsHours']
            old=store.state('refreshSource:'+s['sourceId'],{})
            # Preserve error cooldowns; successful old 6/12-hour cadence becomes 4/8.
            due_at=s.get('nextCheck') if s.get('failureCount') else advance(s['lastSuccess'],hours) if s.get('lastSuccess') else ''
            if due_at and due_at>now: continue
            http.current_source=s; http.last_body_sha=None; prior_new=pipeline.run['new']
            old_ir=deepcopy(store.state('ir:'+s['companyId'],{}))
            try: pipeline.ingest_source({**s,'intervalHours':hours})
            except BudgetExhausted: deferred+=1; break
            current=next(x for x in store.sources() if x['sourceId']==s['sourceId'])
            if s['type']=='IR_MATERIALS' and current.get('lastSuccess')==now and not current.get('lastItemCount'):
                store.set_state('ir:'+s['companyId'],old_ir)
            outcome=source_result(current,now,unchanged=http.last_body_sha is not None and http.last_body_sha==old.get('bodySha256'))
            checked+=1; outcomes[outcome]+=1
            if outcome in ('SUCCESS','NO_CHANGE'):
                lane_success[s['type']]+=1
                store.set_state('refreshSource:'+s['sourceId'],{'status':outcome,'lastSuccess':now,'bodySha256':http.last_body_sha,'health':'healthy'})
            else:
                store.set_state('refreshSource:'+s['sourceId'],{**old,'status':outcome,'lastFailure':now,'health':'disabled_policy' if outcome=='POLICY_REJECTED' else 'temporarily_failed'})
            if pipeline.run['new']>prior_new: updated.add(s['companyId'])
        # SEC is an independent budget/deadline. Preserve successful first-party work
        # even during a regulator outage. No history fetch or universe stream.
        sec_http=PublicHTTP(state/'http',budget=1,max_seconds=config['secMaxSeconds'])
        sec=Pipeline(ROOT,companies,store,sec_http,now); sec_checked=0; sec_success=0; consecutive=0; financial_updates=0; fact_outcomes=Counter();fact_attempts=0
        sec_exhausted=False
        ordered=sorted(selected.items(),key=lambda pair:store.state('financialRefresh:'+pair[0],{}).get('lastAttempt') or '')
        sec_schedule={};sec_feed={}
        if universe:
            from company_intelligence.universe_scheduler import poll_sec_hints,sec_queue
            if network:sec_feed=poll_sec_hints(store,selected,sec,now,config['secRequestBudget'])
            ordered,sec_schedule=sec_queue(store,selected,now,universe_config['secIssuerBudget'])
        for cid,c in ordered:
            if not network and not financial: break
            old_fin=deepcopy(store.state('financials:'+cid)); old_profile=deepcopy(store.state('companyProfile:'+cid))
            old_sec=store.state('sec:'+cid,{})
            poll_sec=network and not sec_exhausted and sec.clock()<sec.deadline and consecutive<4 and (old_sec.get('retryAfter') or '')<=now
            if not poll_sec and not financial: continue
            if poll_sec:
                failures=sec.run['secFailures']
                try: sec.project_company(c,fetch_sec=True,sec_budget=config['secRequestBudget'],filing_since=advance(now,-7*24)[:10])
                except BudgetExhausted: sec_exhausted=True
                else:
                    sec_checked+=1; failed=sec.run['secFailures']>failures
                    if universe:
                        store.set_state('universeSecCheck:'+cid,{'lastAttempt':now,'lastSuccess':now if not failed else store.state('universeSecCheck:'+cid,{}).get('lastSuccess')})
                        if not failed:
                            pending=store.state('universeSecPending',{});pending.pop(cid,None);store.set_state('universeSecPending',pending)
                    consecutive=consecutive+1 if failed else 0; sec_success+=not failed
            # Local SEC consumer financial projection remains independent of a
            # submission outage/cooldown; it never downloads companyfacts here.
            if financial: sec.project_company(c)
            new_fin=store.state('financials:'+cid,{})
            if old_fin and (not financial or new_fin.get('state')!='AVAILABLE' or (new_fin.get('reportingPeriod') or '')<(old_fin.get('reportingPeriod') or '')):
                store.set_state('financials:'+cid,old_fin)
            elif old_fin!=new_fin: financial_updates+=1; updated.add(cid)
            new_profile=store.state('companyProfile:'+cid,{})
            if old_profile and old_profile.get('language')=='de' and new_profile!=old_profile:
                store.set_state('profileRefreshPending:'+cid,new_profile); store.set_state('companyProfile:'+cid,old_profile)
            if network and not sec_exhausted and fact_attempts<20:
                outcome=advance_financial_filing(store,c,sec,now,config['secRequestBudget'])
                fact_outcomes[outcome]+=1
                fact_attempts+=outcome in ('SUCCESS','TEMPORARY_FAILURE','FACTS_NOT_YET_AVAILABLE','BUDGET_DEFERRED')
                if outcome=='SUCCESS':financial_updates+=1;updated.add(cid)
                if outcome=='BUDGET_DEFERRED':sec_exhausted=True
        successes=outcomes['SUCCESS']+outcomes['NO_CHANGE']+sec_success
        health={**prior,'lastAttempt':now,'lastSuccessfulRefresh':now if successes else prior.get('lastSuccessfulRefresh'),
                'lastSuccessfulNewsRefresh':now if lane_success['IR_FEED'] else prior.get('lastSuccessfulNewsRefresh'),
                'lastSuccessfulSecRefresh':now if sec_success else prior.get('lastSuccessfulSecRefresh')}
        if lane_success['IR_EVENTS']: health['lastSuccessfulEventRefresh']=now
        if lane_success['IR_MATERIALS']: health['lastSuccessfulMaterialRefresh']=now
        if financial:
            health['lastFinancialAttempt']=now
            health['lastSuccessfulFinancialProjection']=now
        store.set_state('continuousRefresh',health)
        if outside_proof(store.db,cids)!=before: raise ValueError('NON_COHORT_PRIVATE_CONTENT_CHANGED')
        exported=store.export(companies,state/'public/company-intelligence/data',now)
        if exported['exportedCompanies']<config['minimumPrivateCompanies']: raise ValueError('FULL_PRIVATE_UNIVERSE_SHRINK')
        if universe:
            from company_intelligence.universe_eligibility import generate
            eligibility_report,eligibility=generate(store,companies,consumer,now,current)
            manifest=json.loads((consumer/'manifest.json').read_text())
            prepared={'generation':manifest['generation']}
            inventory={cid:{**r,'germanProfile':r['modules']['profile'],'financials':'AVAILABLE' if r['modules']['financials'] else 'UNAVAILABLE','news':r.get('news',{}).get('retained180',0)} for cid,r in eligibility['issuers'].items() if r['status'].startswith('ELIGIBLE_')}
            atomic_json(consumer.parent/'eligibility-audit.json',eligibility_report)
            atomic_json(consumer.parent/'eligibility-decisions.json',eligibility)
            profiles=eligibility_report['moduleCounts']['profile']
        else:
            spec=importlib.util.spec_from_file_location('refresh_consumer',ROOT/'scripts/company_intelligence/prepare-public.py'); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            golden=json.loads((ROOT/'docs/company-intelligence/full-data-consumer-manifest.json').read_text())
            prepared=module.prepare(state/'public/company-intelligence/data',consumer,[*golden['tickers']],[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')])
            manifest=json.loads((consumer/'manifest.json').read_text()); inventory={}; profiles=0
            for cid in selected:
                value=json.loads((consumer/f'snapshots/{manifest["generation"]}/{cid}.json').read_text())
                german=value.get('companyProfile',{}).get('language')=='de'; profiles+=german
                inventory[cid]={'tickers':json.loads((ROOT/'docs/company-intelligence/full-data-release-candidate.json').read_text())['inventory'][cid]['tickers'],
                                'germanProfile':german,'financials':value['latestFinancials']['state'],'staleFinancials':value['latestFinancials'].get('stale',False),'news':len(value['news'])}
            if profiles!=45: raise ValueError('GERMAN_PROFILE_REGRESSION')
        proof={name:database_proof(state/name) for name in ('state.sqlite','archive.sqlite') if (state/name).exists()}
        report={'schema':1,'scope':'PER_ISSUER_ELIGIBILITY' if universe else 'CONTROLLED_COHORT','status':'SUCCESS' if successes or not network else 'PIPELINE_FAILURE','asOf':now,'sourceGeneration':exported['generation'],
                'consumerGeneration':prepared['generation'],'privateCompanies':exported['exportedCompanies'],'sourcesEligible':len(eligible),'sourcesChecked':checked,
                'scheduler':scheduler,'secScheduler':sec_schedule,'secSharedFeed':sec_feed,'sourceOutcomes':dict(outcomes),'sourceLaneSuccess':dict(lane_success),'sourcesDeferredByBudget':max(0,len(eligible)-checked) if universe else deferred,'unsupportedInactiveSources':sum(not s.get('active') and first_party(s,s['companyId']) for s in sources),
                'secIssuersChecked':sec_checked,'secSuccess':sec_success,'secFailures':sec.run['secFailures'],'newsAdded':store.db.execute("SELECT count(*) FROM items WHERE json_extract(payload,'$.eventType')='NEWS'").fetchone()[0]-prior_news,
                'eventsAdded':store.db.execute('SELECT count(*) FROM events').fetchone()[0]-prior_events,'financialUpdates':financial_updates,'updatedIssuers':len(updated),
                'financialFactOutcomes':dict(fact_outcomes),'financialFactAttempts':fact_attempts,
                'publicRequests':http.requests,'secRequests':getattr(sec,'_sec_client',None).stats['requests'] if getattr(sec,'_sec_client',None) else 0,
                'httpStats':http.stats,'run':pipeline.run,'privateIntegrity':proof,'inventory':inventory,'health':health,'runtimeSeconds':round(time.monotonic()-started,3),'privateOperationalRowsIncluded':False}
        atomic_json(state/'latest-run.json',report); atomic_json(evidence,report)
        check_db(state/'state.sqlite')
        return report
    finally: store.close(); lock.close()

def reproduce(state,identity_root,consumer,evidence):
    state,consumer=Path(state),Path(consumer)
    expected=json.loads(Path(evidence).read_text()); store=Store(state/'state.sqlite')
    try:
        proof={name:database_proof(state/name) for name in expected['privateIntegrity']}
        if proof!=expected['privateIntegrity']: raise ValueError('FRESH_PRIVATE_TABLE_HASH_MISMATCH')
        exported=store.export(identities(identity_root,store),state/'public/company-intelligence/data',expected['asOf'])
        if exported['generation']!=expected['sourceGeneration']: raise ValueError('FRESH_PRIVATE_GENERATION_MISMATCH')
        if expected.get('scope')=='PER_ISSUER_ELIGIBILITY':
            from company_intelligence.universe_eligibility import generate
            report,_=generate(store,identities(identity_root,store),consumer,expected['asOf'],load_universe(ROOT))
            result={'generation':report['generation'],'companies':report['eligibleIssuerCount']}
        else:
            spec=importlib.util.spec_from_file_location('refresh_reproduce',ROOT/'scripts/company_intelligence/prepare-public.py'); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            golden=json.loads((ROOT/'docs/company-intelligence/full-data-consumer-manifest.json').read_text())
            result=module.prepare(state/'public/company-intelligence/data',consumer,golden['tickers'],[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')])
        if result['generation']!=expected['consumerGeneration']: raise ValueError('FRESH_CONSUMER_GENERATION_MISMATCH')
        return {'status':'PASS','privateTableHashesReproduced':True,'privateCompanies':exported['exportedCompanies'],**result}
    finally: store.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('state','identity-root','consumer','evidence'): p.add_argument('--'+k,required=True,type=Path)
    p.add_argument('--offline',action='store_true'); p.add_argument('--financial',action='store_true')
    p.add_argument('--reproduce',action='store_true'); p.add_argument('--universe',action='store_true')
    a=p.parse_args(); r=reproduce(a.state,a.identity_root,a.consumer,a.evidence) if a.reproduce else refresh(a.state,a.identity_root,a.consumer,a.evidence,network=not a.offline,financial=a.financial,universe=a.universe)
    print(json.dumps({k:v for k,v in r.items() if k not in ('privateIntegrity','inventory','run')}))
