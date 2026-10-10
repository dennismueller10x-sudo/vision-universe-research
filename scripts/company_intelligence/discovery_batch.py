"""Bounded inventory backfill; worker HTTP is isolated, SQLite writes are serial.

Independent hosts overlap network latency, but a shared request gate retains
the total allowance and existing rate spacing. Domain candidates may borrow
unused allowance while retaining an individual ceiling. Budgets/deadlines
defer work rather than reject a healthy candidate.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from .transport import PublicHTTP, BudgetExhausted, SourceError
from .discovery import validate_discovery_candidate as validate_candidate
from .feeds import discover_ir
from .model import domain
from .pipeline import advance
from .site_inventory import candidate_routes
from .root_aliases import root_alias_candidates, validate_root_aliases


def run(companies, candidates, http, now, request_budget, max_seconds, workers=4, domain_only=False, admission_interval=2,on_result=None,circuit=None):
    if not 1<=workers<=8 or not 1<=request_budget<=200:raise ValueError('INVALID_DISCOVERY_BATCH_LIMITS')
    if not .5<=admission_interval<=2:raise ValueError('INVALID_DISCOVERY_ADMISSION_INTERVAL')
    from .discovery_circuit import DiscoveryCircuit
    circuit = circuit or DiscoveryCircuit()
    selected,hosts=[],set()
    # Reserve enough requests to reach IR/news/events, rather than spending one
    # request on hundreds of unusable half-discoveries.
    for c in companies:
        evidence = {'status':'CANDIDATE','candidates':[{'url':c['officialSites'][0],'evidence':'EXISTING_VALIDATED_SITE'}]} if c.get('officialSites') else candidates.get(c['companyId'],{})
        evidence = {**evidence,'candidates':candidate_routes(evidence)}
        aliases = root_alias_candidates(evidence) if domain_only else []
        if not aliases and (evidence.get('status')!='CANDIDATE' or len(evidence.get('candidates',[]))!=1):continue
        routes = aliases or evidence['candidates']
        host=domain(routes[0]['url'])
        if host in hosts:continue
        selected.append((c,routes));hosts.add(host)
        if len(selected)>=max(1,request_budget//(4 if domain_only else 12)):break
    if not selected:return []
    allowance=request_budget//len(selected);deadline=time.time()+max_seconds
    gate=threading.Lock();last=[0];host_last={};remaining_requests=[request_budget]
    class BoundedHTTP(PublicHTTP):
        def _wait(self,url):
            # Protect only request admission; slow HTTP responses do not block
            # independent hosts. Every client still enforces retries/deadline.
            while True:
                circuit.check()
                with gate:
                    if remaining_requests[0]<=0:raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
                    host=domain(url);stamp=time.time()
                    delay=max(admission_interval-(stamp-last[0]),
                              max(5,self.host_delay.get(host,0))-(stamp-host_last.get(host,0)),
                              self.interval-(stamp-self.last_request),0)
                    if stamp+delay>=self.deadline:raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
                    if not delay:
                        super()._wait(url);remaining_requests[0]-=1
                        last[0]=time.time();host_last[host]=last[0]
                        return
                # A host cooldown must not monopolize admission for other hosts.
                time.sleep(delay)
    def work(pair):
        c,routes=pair;candidate=routes[0];remaining=deadline-time.time()
        if remaining<=0:return {'companyId':c['companyId'],'domainOnly':domain_only,'status':'DEFERRED','reason':'DISCOVERY_DEADLINE','requests':0,'stats':{}}
        def observed_open(request, **kwargs):
            try:
                response = http.opener(request, **kwargs)
            except Exception as error:
                # Envoy may return an HTTP 503 rather than a CONNECT exception.
                # Read only a bounded error prefix; no article body is retained.
                if getattr(error,'code',None)==503 and hasattr(error,'read'):
                    try:
                        error.proxy_failure_hint=b'upstream connect error or disconnect/reset before headers' in error.read(512)
                    except OSError:pass
                circuit.failure(request.full_url, error)
                raise
            circuit.success()
            return response
        candidate_budget=min(request_budget,max(allowance,8)) if domain_only else allowance
        # Only previously time-limited ownership/IR walks get a longer retry.
        # The shared deadline, request ceilings and circuit remain authoritative.
        candidate_seconds = ((180 if c.get('_ownershipTimeBudgetRetry') is True else 60)
                             if domain_only else 360 if c.get('_irTimeBudgetRetry') is True else 180)
        client=BoundedHTTP(http.cache,budget=candidate_budget,timeout=min(http.timeout,10),interval=2,max_seconds=min(remaining,candidate_seconds),opener=observed_open,validator=http.validator)
        result={'companyId':c['companyId'],'status':'DEFERRED','domainOnly':domain_only}
        try:
            site = ({'status':'VALIDATED','url':c['officialSites'][0]} if c.get('officialSites') else
                    validate_root_aliases(c,routes,client,now) if len(routes)>1 else validate_candidate(c,candidate,client,now))
            if not c.get('officialSites'):result['site']=site
            sources,configs=([],[]) if domain_only else discover_ir(c,site['url'],client,now)
            result.update(status='VALIDATED',sources=sources,configurations=configs,domainOnly=domain_only)
        except BudgetExhausted as e:
            result.update(reason=str(e),sources=getattr(e,'discoverySources',[]),
                          configurations=getattr(e,'discoveryConfigurations',[]),
                          failureEvidence=getattr(e,'ownershipEvidence',{}))
        except (SourceError,ValueError,TypeError,KeyError) as e:
            circuit.failure(candidate['url'], e)
            transient=any(code in str(e) for code in ('HTTP_429','HTTP_500','HTTP_502','HTTP_503','HTTP_504','NETWORK_UNAVAILABLE','NETWORK_TIMEOUT','DNS_UNAVAILABLE','ROBOTS_UNAVAILABLE'))
            result.update(status='DEGRADED' if c.get('officialSites') or result.get('site') else 'DEFERRED' if transient else 'REJECTED',reason=str(e)[:250],failureEvidence=getattr(e,'ownershipEvidence',{}),
                          sources=getattr(e,'discoverySources',[]),configurations=getattr(e,'discoveryConfigurations',[]))
        except Exception as e:result.update(status='DEGRADED',reason='UNEXPECTED_DISCOVERY_ERROR:'+type(e).__name__)
        finally:
            with gate:
                for host,delay in client.host_delay.items():http.host_delay[host]=max(http.host_delay.get(host,0),delay)
            result.update(requests=client.requests,stats=client.stats)
        return result
    results=[]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending=iter(selected)
        futures={pool.submit(work,pair) for pair in [next(pending) for _ in range(min(workers,len(selected)))]}
        while futures:
            completed,futures=wait(futures,return_when=FIRST_COMPLETED)
            for future in completed:
                result=future.result();results.append(result)
                if on_result:on_result(result)
            with gate:budget_available=remaining_requests[0]>0
            if not circuit.snapshot()['open'] and budget_available:
                for _ in completed:
                    pair=next(pending,None)
                    if pair is not None:futures.add(pool.submit(work,pair))
    http.last_request=last[0]
    http.host_last.update(host_last)
    assert sum(r['requests'] for r in results)<=request_budget
    return sorted(results,key=lambda r:r['companyId'])


def persist(results,store,companies,now):
    from .discovery import OWNERSHIP_VERSION, OVERSIZED_IR_RECOVERY_VERSION, CORPORATE_HEADER_EVIDENCE_VERSION
    for r in results:
        cid=r['companyId'];reason=r.get('reason') or ''
        if r.get('domainOnly'):
            reason=r.get('reason') or ''
            category='VERIFIED' if r['status']=='VALIDATED' else 'BLOCKED' if any(code in reason for code in ('403','401','ROBOTS_DISALLOWED')) else 'UNAVAILABLE' if any(code in reason for code in ('404','DNS','NETWORK_UNAVAILABLE')) else 'DEFERRED' if r['status']=='DEFERRED' else 'IDENTITY_NOT_CORROBORATED' if 'OWNER_NOT_VALIDATED' in reason else 'FAILED'
            store.set_state('domainValidation:'+cid,{'status':r['status'],'category':category,'reason':reason,'checkedAt':now,'nextAttempt':advance(now,24 if category in ('DEFERRED','UNAVAILABLE') else 7*24)})
        if r.get('site'):store.set_state('officialSite:'+cid,r['site']);companies[cid]['officialSites']=[r['site']['url']]
        if not r.get('domainOnly') and r['status'] in ('DEFERRED','DEGRADED'):
            local_capacity = r['status']=='DEFERRED' and reason in (
                'NETWORK_BUDGET_EXHAUSTED','NETWORK_TIME_BUDGET_EXHAUSTED','DISCOVERY_DEADLINE')
            retry_hours = .25 if 'CIRCUIT_OPEN' in reason else 1 if local_capacity else 24
            for source in r.get('sources',[]):store.source(source)
            prior=store.state('ir:'+cid,{})
            configurations={cfg['irHomepage']:cfg for cfg in prior.get('configurations',[])}
            for cfg in r.get('configurations',[]):
                old=configurations.get(cfg['irHomepage'],{})
                documents={d['url']:d for d in old.get('documents',[])+cfg.get('documents',[])}
                configurations[cfg['irHomepage']]={**old,**cfg,'documents':list(documents.values())}
            store.set_state('ir:'+cid,{**prior,'configurations':list(configurations.values()),
                                      'partialDiscovery':True,'lastFailure':now,'reason':r.get('reason'),
                                      'retryAfter':advance(now,retry_hours)})
        if r['status']=='VALIDATED' and not r.get('domainOnly'):
            for source in r['sources']:store.source(source)
            from .materials import retain_source_configurations
            configurations=retain_source_configurations(store,cid,r['configurations'])
            store.set_state('ir:'+cid,{'lastSuccess':now,'configurations':configurations,'sources':len(r['sources']),'nextVerify':advance(now,7*24)})
        elif r.get('domainOnly') and r['status']=='DEFERRED':
            prior=store.state('officialSite:'+cid,{})
            if prior.get('status')!='VALIDATED':store.set_state('officialSite:'+cid,{**prior,'status':'DEFERRED','lastFailure':now,'reason':r.get('reason'),'lastFailureEvidence':r.get('failureEvidence') or prior.get('lastFailureEvidence',{}),'retryAfter':advance(now,7*24 if category=='BLOCKED' else .25 if 'CIRCUIT_OPEN' in reason else 1)})
        elif r['status']=='REJECTED':
            store.set_state('officialSite:'+cid,{'status':'REJECTED','lastChecked':now,'reason':r['reason'],'ownershipEvidence':r.get('failureEvidence',{}),'ownershipVerifierVersion':OWNERSHIP_VERSION,'corporateHeaderEvidenceVersion':CORPORATE_HEADER_EVIDENCE_VERSION,'oversizedIRRecoveryVersion':OVERSIZED_IR_RECOVERY_VERSION,'retryAfter':advance(now,7*24)})
        elif r['status']=='DEGRADED':
            store.set_state('ir:'+cid,{**store.state('ir:'+cid,{}),'lastFailure':now,'reason':r['reason'],'retryAfter':advance(now,.25 if 'CIRCUIT_OPEN' in reason else 24)})
        store.set_state('inventoryDiscovery:'+cid,{'status':r['status'],'checkedAt':now,'requests':r['requests'],'stats':r.get('stats',{}),'reason':r.get('reason'),'failureEvidence':r.get('failureEvidence',{})})
        if r['status']!='VALIDATED':store.audit(now,cid,'INVENTORY_DISCOVERY_'+r['status'],reason=r.get('reason'),requests=r['requests'])
