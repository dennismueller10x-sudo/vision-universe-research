"""Bounded, resumable discovery passes over existing candidate identities.

Pass checkpoints are private ledger state. Selection does not fetch a homepage,
and ingestion/discovery retain separate schedules. A new pass never overrides a
source's access cooldown or declares candidate URLs to be official domains.
"""
import json
import re
from collections import Counter
from .model import domain
from .site_inventory import candidate_routes
from .root_aliases import root_alias_candidates
from .discovery import OWNERSHIP_VERSION, OVERSIZED_IR_RECOVERY_VERSION, CORPORATE_HEADER_EVIDENCE_VERSION

PRIOR_OWNERSHIP_VERSIONS = tuple('corporate-ownership-' + str(version)
                               for version in range(1, int(OWNERSHIP_VERSION.rsplit('-', 1)[1])))


def prefix(pass_id, lane):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', pass_id or '') or lane not in ('domains','ir'):
        raise ValueError('INVALID_INVENTORY_PASS')
    return f'inventorySweep:{pass_id}:{lane}:'


def failure_category(status, reason=''):
    if status == 'VALIDATED':return 'VERIFIED_OFFICIAL'
    if 'CIRCUIT_OPEN' in reason:return 'TEMPORARILY_UNAVAILABLE'
    if 'CONFLICTING_COPYRIGHT_OWNER' in reason:return 'CONFLICTING_OWNER'
    if 'REDIRECT' in reason:return 'REDIRECTED'
    if 'OWNER_NOT_VALIDATED' in reason:return 'INSUFFICIENT_EVIDENCE'
    if any(s in reason for s in ('ROBOTS_DISALLOWED','HTTP_403','HTTP_401','CRAWL_DELAY')):return 'BLOCKED'
    if 'HTTP_410' in reason:return 'DEAD'
    if 'HTTP_404' in reason:return 'MISSING_PAGE'
    if 'BUDGET' in reason or 'DEADLINE' in reason:return 'DEFERRED_BUDGET'
    if any(s in reason for s in ('DNS','NETWORK','HTTP_429','HTTP_50','RATE_LIMIT')):return 'TEMPORARILY_UNAVAILABLE'
    if status == 'DEFERRED':return 'DEFERRED_BUDGET'
    return 'UNRESOLVED'


def select(companies, store, now, pass_id, lane, limit=50, allow_network=True):
    key=prefix(pass_id,lane)
    if not 1<=limit<=100:raise ValueError('INVALID_INVENTORY_LIMIT')
    candidates={cid:{**value,'candidates':candidate_routes(value)}
                for cid in companies for value in [store.state('siteCandidates:'+cid,{})]}
    snapshot=store.state(key+'inventory')
    if snapshot is None:
        snapshot=sorted(cid for cid,value in candidates.items() if value.get('candidates'))
        store.set_state(key+'inventory',snapshot)
    selected=[];hosts=set()
    prior_outcomes={cid:store.state(key+cid) for cid in snapshot}
    # Finish unattempted identities, then the oldest due attempts. An early
    # permanently failing host must not monopolize every resumed retry batch.
    def order(cid):
        newly_verified=lane=='ir' and store.state('officialSite:'+cid,{}).get('status')=='VALIDATED'
        prior=prior_outcomes[cid] or {}
        retry_age=prior.get('lastAttemptAt') or prior.get('checkedAt') or ''
        return (lane=='ir' and not newly_verified,bool(prior_outcomes[cid]),retry_age,cid)
    for cid in sorted(snapshot,key=order):
        if cid not in companies:continue
        c=companies[cid];value=candidates[cid];site=store.state('officialSite:'+cid,{})
        official=bool(c.get('officialSites')) or site.get('status')=='VALIDATED'
        prior=prior_outcomes[cid]
        evidence_upgrade=(lane=='domains' and site.get('status')=='REJECTED' and
                          site.get('reason') in ('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED',
                                                'OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED') and
                          site.get('ownershipVerifierVersion') in PRIOR_OWNERSHIP_VERSIONS)
        evidence_upgrade = evidence_upgrade or (lane == 'domains' and site.get('status') == 'REJECTED'
                          and site.get('reason') == 'SOURCE_TOO_LARGE'
                          and site.get('oversizedIRRecoveryVersion') is None)
        gaps=site.get('ownershipEvidence') or {}
        evidence_upgrade = evidence_upgrade or (lane == 'domains' and site.get('status') == 'REJECTED'
                          and site.get('reason') == 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED'
                          and site.get('ownershipVerifierVersion') == OWNERSHIP_VERSION
                          and site.get('corporateHeaderEvidenceVersion') is None
                          and gaps.get('footerOwnerMatched') is True and gaps.get('shortBrand') is False)
        retryable = prior and (prior.get('status')=='COOLDOWN' or prior.get('category') in ('TEMPORARILY_UNAVAILABLE','DEFERRED_BUDGET'))
        due_after=(prior or {}).get('retryAfter') or (site if lane=='domains' else store.state('ir:'+cid,{})).get('retryAfter') or '9999'
        if prior and not evidence_upgrade and not (retryable and due_after<=now) and not (lane=='ir' and prior.get('status')=='NO_VERIFIED_DOMAIN' and official):continue
        if lane=='domains':
            if not official and value.get('status')=='CANDIDATE' and len(value.get('candidates',[]))!=1:
                original=store.state('siteCandidates:'+cid,{})
                store.set_state('siteCandidates:'+cid,{**original,'status':'AMBIGUOUS',
                    'reason':'MULTIPLE_NON_EQUIVALENT_WEBSITE_CANDIDATES','checkedAt':now})
            aliases = root_alias_candidates(value)
            status='ALREADY_VERIFIED' if official else 'AMBIGUOUS' if not aliases and (value.get('status')!='CANDIDATE' or len(value.get('candidates',[]))!=1) else None
            # A changed evidence collector may revisit an old ownership-only
            # rejection once. Transport/access/conflict cooldowns remain intact;
            # persistence records this version even when ownership still fails.
            retry='' if evidence_upgrade else site.get('retryAfter','')
        else:
            ir=store.state('ir:'+cid,{})
            status='NO_VERIFIED_DOMAIN' if not official else 'ALREADY_DISCOVERED' if ir.get('lastSuccess') else None
            retry=ir.get('retryAfter','')
        if status or retry>now:
            local_status = status or 'COOLDOWN'
            reason = site.get('reason') if lane=='domains' else ir.get('reason')
            category = ('VERIFIED_OFFICIAL' if status=='ALREADY_VERIFIED' else
                        status if status in ('AMBIGUOUS','NO_VERIFIED_DOMAIN','ALREADY_DISCOVERED') else
                        failure_category(local_status, reason or ''))
            # Reused proof/cooldowns may change the current outcome, but must
            # retain the attempts, traffic and first-check history already paid.
            store.set_state(key+cid,{**(prior or {}),'status':local_status,'category':category,'checkedAt':now,
                                    'reason':reason,'retryAfter':retry or None,
                                    'networkRequests':(prior or {}).get('networkRequests',0)})
            continue
        if not allow_network:
            continue  # Unsent network work remains pending through a shared outage.
        url=(c.get('officialSites') or [site.get('url')])[0] if lane=='ir' else value['candidates'][0]['url']
        host=domain(url)
        if host in hosts:continue  # Pending identity stays pending, never silently completed.
        # A prior per-candidate time ceiling may stop legal-route evidence
        # gathering even while a bounded batch still has time and requests.
        # This hint is local to this invocation, never a model/state field.
        selected_company = ({**c, '_ownershipTimeBudgetRetry': True}
                            if lane == 'domains' and site.get('status') == 'DEFERRED'
                            and site.get('reason') == 'NETWORK_TIME_BUDGET_EXHAUSTED' else c)
        if lane == 'ir' and ir.get('reason') == 'NETWORK_TIME_BUDGET_EXHAUSTED':
            selected_company = {**c, '_irTimeBudgetRetry': True}
        hosts.add(host);selected.append(selected_company)
        if len(selected)>=limit:break
    return selected,candidates


def record(result,store,now,pass_id,lane):
    key=prefix(pass_id,lane)
    cid=result['companyId']
    if cid not in store.state(key+'inventory',[]):raise ValueError('ISSUER_OUTSIDE_INVENTORY_PASS')
    prior=store.state(key+cid,{})
    lane_state=store.state(('officialSite:' if lane=='domains' else 'ir:')+cid,{})
    store.set_state(key+cid,{'attempts':prior.get('attempts',0)+int(result.get('requests',0)>0),
                            'firstCheckedAt':prior.get('firstCheckedAt',now),
                            # DNS/preflight attempts may precede an HTTP opener; local
                            # cooldown/ambiguity reuse never changes this timestamp.
                            'lastAttemptAt':now,
                            'retryAfter':lane_state.get('retryAfter') or now,
                            'stats':{key:prior.get('stats',{}).get(key,0)+value for key,value in result.get('stats',{}).items()},
                            'status':result['status'],'category':failure_category(result['status'],result.get('reason','')),
                            'reason':result.get('reason'),'failureEvidence':result.get('failureEvidence') or prior.get('failureEvidence',{}),'checkedAt':now,'networkRequests':prior.get('networkRequests',0)+result.get('requests',0)})


def progress(store,pass_id,lane):
    key=prefix(pass_id,lane);inventory=store.state(key+'inventory',[])
    outcomes=[store.state(key+cid) for cid in inventory];counts=Counter(v['status'] for v in outcomes if v)
    return {'passId':pass_id,'lane':lane,'candidateIssuers':len(inventory),'classified':sum(counts.values()),
            'pending':sum(v is None for v in outcomes),
            'retryPending':sum(bool(v) and (v.get('status')=='COOLDOWN' or v.get('category') in ('TEMPORARILY_UNAVAILABLE','DEFERRED_BUDGET')) for v in outcomes),
            'freshAttempts':sum(v.get('attempts',0) for v in outcomes if v),'statuses':dict(counts),
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
