"""Bounded inventory backfill; worker HTTP is isolated, SQLite writes are serial.

The global request allowance is divided before submitting work. Independent
hosts overlap network latency, but a shared request gate retains existing rate
spacing. Budgets/deadlines defer work rather than reject a healthy candidate.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from .transport import PublicHTTP, BudgetExhausted, SourceError
from .discovery import validate_candidate
from .feeds import discover_ir
from .model import domain
from .pipeline import advance


def run(companies, candidates, http, now, request_budget, max_seconds, workers=4, domain_only=False):
    if not 1<=workers<=4 or not 1<=request_budget<=200:raise ValueError('INVALID_DISCOVERY_BATCH_LIMITS')
    selected,hosts=[],set()
    # Reserve enough requests to reach IR/news/events, rather than spending one
    # request on hundreds of unusable half-discoveries.
    for c in companies:
        evidence = {'status':'CANDIDATE','candidates':[{'url':c['officialSites'][0],'evidence':'EXISTING_VALIDATED_SITE'}]} if c.get('officialSites') else candidates.get(c['companyId'],{})
        if evidence.get('status')!='CANDIDATE' or len(evidence.get('candidates',[]))!=1:continue
        host=domain(evidence['candidates'][0]['url'])
        if host in hosts:continue
        selected.append((c,evidence['candidates'][0]));hosts.add(host)
        if len(selected)>=max(1,request_budget//(4 if domain_only else 12)):break
    if not selected:return []
    allowance=request_budget//len(selected);deadline=time.time()+max_seconds
    gate=threading.Lock();last=[0];host_last={}
    class BoundedHTTP(PublicHTTP):
        def _wait(self,url):
            # Protect only request admission; slow HTTP responses do not block
            # independent hosts. Every client still enforces retries/deadline.
            with gate:
                host=domain(url);delay=max(2-(time.time()-last[0]),5-(time.time()-host_last.get(host,0)),0)
                if time.time()+delay>=self.deadline:raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
                if delay:time.sleep(delay)
                super()._wait(url);last[0]=time.time();host_last[host]=last[0]
    def work(pair):
        c,candidate=pair;remaining=deadline-time.time()
        if remaining<=0:return {'companyId':c['companyId'],'domainOnly':domain_only,'status':'DEFERRED','reason':'DISCOVERY_DEADLINE','requests':0,'stats':{}}
        client=BoundedHTTP(http.cache,budget=allowance,timeout=min(http.timeout,10),interval=2,max_seconds=min(remaining,60 if domain_only else 180))
        result={'companyId':c['companyId'],'status':'DEFERRED','domainOnly':domain_only}
        try:
            site = {'status':'VALIDATED','url':c['officialSites'][0]} if c.get('officialSites') else validate_candidate(c,candidate,client,now)
            if not c.get('officialSites'):result['site']=site
            sources,configs=([],[]) if domain_only else discover_ir(c,site['url'],client,now)
            result.update(status='VALIDATED',sources=sources,configurations=configs,domainOnly=domain_only)
        except BudgetExhausted as e:result['reason']=str(e)
        except (SourceError,ValueError,TypeError,KeyError) as e:
            transient=any(code in str(e) for code in ('HTTP_429','HTTP_500','HTTP_502','HTTP_503','HTTP_504','NETWORK_UNAVAILABLE','NETWORK_TIMEOUT','DNS_UNAVAILABLE','ROBOTS_UNAVAILABLE'))
            result.update(status='DEGRADED' if c.get('officialSites') or result.get('site') else 'DEFERRED' if transient else 'REJECTED',reason=str(e)[:250])
        except Exception as e:result.update(status='DEGRADED',reason='UNEXPECTED_DISCOVERY_ERROR:'+type(e).__name__)
        finally:result.update(requests=client.requests,stats=client.stats)
        return result
    results=[]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures=[pool.submit(work,pair) for pair in selected]
        for future in as_completed(futures):results.append(future.result())
    assert sum(r['requests'] for r in results)<=request_budget
    return sorted(results,key=lambda r:r['companyId'])


def persist(results,store,companies,now):
    for r in results:
        cid=r['companyId']
        if r.get('domainOnly'):
            reason=r.get('reason') or ''
            category='VERIFIED' if r['status']=='VALIDATED' else 'BLOCKED' if any(code in reason for code in ('403','ROBOTS_DISALLOWED')) else 'UNAVAILABLE' if any(code in reason for code in ('404','DNS','NETWORK_UNAVAILABLE')) else 'DEFERRED' if r['status']=='DEFERRED' else 'IDENTITY_NOT_CORROBORATED' if 'OWNER_NOT_VALIDATED' in reason else 'FAILED'
            store.set_state('domainValidation:'+cid,{'status':r['status'],'category':category,'reason':reason,'checkedAt':now,'nextAttempt':advance(now,24 if category in ('DEFERRED','UNAVAILABLE') else 7*24)})
        if r.get('site'):store.set_state('officialSite:'+cid,r['site']);companies[cid]['officialSites']=[r['site']['url']]
        if r['status']=='VALIDATED' and not r.get('domainOnly'):
            for source in r['sources']:store.source(source)
            store.set_state('ir:'+cid,{'lastSuccess':now,'configurations':r['configurations'],'sources':len(r['sources']),'nextVerify':advance(now,7*24)})
        elif r.get('domainOnly') and r['status']=='DEFERRED':
            prior=store.state('officialSite:'+cid,{})
            if prior.get('status')!='VALIDATED':store.set_state('officialSite:'+cid,{**prior,'status':'DEFERRED','lastFailure':now,'reason':r.get('reason'),'retryAfter':advance(now,24)})
        elif r['status']=='REJECTED':
            store.set_state('officialSite:'+cid,{'status':'REJECTED','lastChecked':now,'reason':r['reason'],'retryAfter':advance(now,7*24)})
        elif r['status']=='DEGRADED':
            store.set_state('ir:'+cid,{**store.state('ir:'+cid,{}),'lastFailure':now,'reason':r['reason'],'retryAfter':advance(now,24)})
        store.set_state('inventoryDiscovery:'+cid,{'status':r['status'],'checkedAt':now,'requests':r['requests'],'reason':r.get('reason')})
        if r['status']!='VALIDATED':store.audit(now,cid,'INVENTORY_DISCOVERY_'+r['status'],reason=r.get('reason'),requests=r['requests'])
