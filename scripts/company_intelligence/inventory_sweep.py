"""Bounded, resumable discovery passes over existing candidate identities.

Pass checkpoints are private ledger state. Selection does not fetch a homepage,
and ingestion/discovery retain separate schedules. A new pass never overrides a
source's access cooldown or declares candidate URLs to be official domains.
"""
import json
import re
from collections import Counter
from .model import domain


def prefix(pass_id, lane):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', pass_id or '') or lane not in ('domains','ir'):
        raise ValueError('INVALID_INVENTORY_PASS')
    return f'inventorySweep:{pass_id}:{lane}:'


def failure_category(status, reason=''):
    if status == 'VALIDATED':return 'VERIFIED_OFFICIAL'
    if 'CONFLICTING_COPYRIGHT_OWNER' in reason:return 'CONFLICTING_OWNER'
    if 'OWNER_NOT_VALIDATED' in reason:return 'INSUFFICIENT_EVIDENCE'
    if 'REDIRECT' in reason:return 'REDIRECTED'
    if any(s in reason for s in ('ROBOTS_DISALLOWED','HTTP_403','HTTP_401','CRAWL_DELAY')):return 'BLOCKED'
    if 'HTTP_410' in reason:return 'DEAD'
    if 'HTTP_404' in reason:return 'MISSING_PAGE'
    if 'BUDGET' in reason or 'DEADLINE' in reason:return 'DEFERRED_BUDGET'
    if any(s in reason for s in ('DNS','NETWORK','HTTP_429','HTTP_50','RATE_LIMIT')):return 'TEMPORARILY_UNAVAILABLE'
    if status == 'DEFERRED':return 'DEFERRED_BUDGET'
    return 'UNRESOLVED'


def select(companies, store, now, pass_id, lane, limit=50):
    key=prefix(pass_id,lane)
    if not 1<=limit<=100:raise ValueError('INVALID_INVENTORY_LIMIT')
    candidates={cid:store.state('siteCandidates:'+cid,{}) for cid in companies}
    snapshot=store.state(key+'inventory')
    if snapshot is None:
        snapshot=sorted(cid for cid,value in candidates.items() if value.get('candidates'))
        store.set_state(key+'inventory',snapshot)
    selected=[];hosts=set()
    for cid in snapshot:
        if cid not in companies:continue
        c=companies[cid];value=candidates[cid];site=store.state('officialSite:'+cid,{})
        official=bool(c.get('officialSites')) or site.get('status')=='VALIDATED'
        prior=store.state(key+cid)
        if prior and not (lane=='ir' and prior.get('status')=='NO_VERIFIED_DOMAIN' and official):continue
        if lane=='domains':
            status='ALREADY_VERIFIED' if official else 'AMBIGUOUS' if value.get('status')!='CANDIDATE' else None
            retry=site.get('retryAfter','')
        else:
            ir=store.state('ir:'+cid,{})
            status='NO_VERIFIED_DOMAIN' if not official else 'ALREADY_DISCOVERED' if ir.get('lastSuccess') else None
            retry=ir.get('retryAfter','')
        if status or retry>now:
            store.set_state(key+cid,{'status':status or 'COOLDOWN','checkedAt':now,
                                    'reason':site.get('reason') if lane=='domains' else ir.get('reason'),
                                    'retryAfter':retry or None,'networkRequests':0})
            continue
        url=(c.get('officialSites') or [site.get('url')])[0] if lane=='ir' else value['candidates'][0]['url']
        host=domain(url)
        if host in hosts:continue  # Pending identity stays pending, never silently completed.
        hosts.add(host);selected.append(c)
        if len(selected)>=limit:break
    return selected,candidates


def record(result,store,now,pass_id,lane):
    key=prefix(pass_id,lane)
    cid=result['companyId']
    if cid not in store.state(key+'inventory',[]):raise ValueError('ISSUER_OUTSIDE_INVENTORY_PASS')
    store.set_state(key+cid,{'status':result['status'],'category':failure_category(result['status'],result.get('reason','')),
                            'reason':result.get('reason'),'checkedAt':now,'networkRequests':result.get('requests',0)})


def progress(store,pass_id,lane):
    key=prefix(pass_id,lane);inventory=store.state(key+'inventory',[])
    outcomes=[store.state(key+cid) for cid in inventory];counts=Counter(v['status'] for v in outcomes if v)
    return {'passId':pass_id,'lane':lane,'candidateIssuers':len(inventory),'classified':sum(counts.values()),
            'pending':sum(v is None for v in outcomes),'statuses':dict(counts),
            'networkRequests':sum(v.get('networkRequests',0) for v in outcomes if v),
            'interpretation':'Reused/cooldown/ambiguous classifications are not fresh network verifications.'}


def funnel(store, coverage):
    """Candidate outcomes and downstream flags, without declaring guesses wrong/dead."""
    states={k:json.loads(v) for k,v in store.db.execute("SELECT key,payload FROM state WHERE key LIKE 'officialSite:%' OR key LIKE 'siteCandidates:%'")}
    rows=[r for r in coverage['companies'] if r['officialDomainCandidate']]
    classifications=Counter();components=Counter();failures=Counter();platforms=Counter()
    mapping={'irPageFound':'withIR','anyNews':'withCurrentNews','eventSourceFound':'withEvents',
             'calls':'withCalls','presentations':'withPresentations','anyCallContentReference':'withManagementContent'}
    for row in rows:
        cid=row['companyId'];site=states.get('officialSite:'+cid,{})
        candidate=states.get('siteCandidates:'+cid,{})
        category='VERIFIED_OFFICIAL' if row['officialDomainFound'] else 'AMBIGUOUS' if candidate.get('status')=='AMBIGUOUS' else failure_category(site.get('status'),site.get('reason','')) if site else 'NOT_CHECKED'
        classifications[category]+=1
        if site.get('reason') and not row['officialDomainFound']:failures[site['reason']]+=1
        components.update(output for flag,output in mapping.items() if row[flag])
        if row['officialDomainFound']:platforms[site.get('platformHint') or 'UNKNOWN']+=1
    checked=sum(classifications.values())-classifications['NOT_CHECKED']
    return {'candidateIssuers':len(rows),'withExistingOrNewOutcome':checked,
            'notYetChecked':classifications['NOT_CHECKED'],'classifications':dict(classifications),
            'downstreamComponents':dict(components),'verifiedRootPlatformHints':dict(platforms),
            'failureReasons':dict(failures),
            'interpretation':'Existing outcomes include historical attempts and configured seeds. Unproven ownership is not a wrong company; temporary DNS/HTTP failure is not a dead domain. Downstream flags are measured independently of domain success.'}
