"""Emit aggregate source-health evidence from an isolated restored ledger.

Never emits source URLs, source identifiers, issuer names, operational rows or
content. The state is checked before and after so the audit is read-only by
contract; run it only on an isolated restore, never on the active producer.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from company_intelligence.consumer_usage import first_party, publisher
from company_intelligence.current_state_acceptance import database_proof
from company_intelligence.model import timestamp
from company_intelligence.store import Store, atomic_json
from company_intelligence.top46_content import identities
from company_intelligence.universe_scheduler import source_queue, effective_interval_hours
from company_intelligence.earnings import valid_date

EUROPE={'AUSTRIA','BELGIUM','CYPRUS','CZECH REPUBLIC','DENMARK','FINLAND','FRANCE','GERMANY','GREECE','IRELAND','ITALY','LUXEMBOURG','NETHERLANDS','NORWAY','POLAND','PORTUGAL','SPAIN','SWEDEN','SWITZERLAND','UNITED KINGDOM','UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND'}
US_STATES=set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())

def issuer_region(store,company):
    cid=company['companyId'];ref=store.state('profileQaIssuerMetadata:'+cid,{}) or store.state('sec-submissions:'+cid,{})
    business=(ref.get('addresses') or {}).get('business') or {}
    description=str(business.get('stateOrCountryDescription') or '').strip().upper()
    code=str(business.get('stateOrCountry') or '').strip().upper()
    country=description or code
    if code in US_STATES or country in {'UNITED STATES','USA','U.S.A.','US'}:return 'US'
    if country in EUROPE:return 'EUROPE'
    if country:return 'OTHER_NON_US'
    listings=company.get('listings',[])
    if any(l.get('country')=='US' for l in listings):return 'US_LISTING_ONLY'
    if any(l.get('securityType')=='ADR' for l in listings):return 'ADR_REGION_UNKNOWN'
    return 'UNKNOWN'

def issuer_market_cap_bucket(company,store,as_of):
    listings=company.get('listings',[])
    if len(listings)!=1 or listings[0].get('securityType')!='COMMON_STOCK':return 'MULTI_LISTING_OR_NONCOMMON'
    symbol=listings[0].get('symbol','')
    if not symbol or not all(c.isalnum() or c in '.-' for c in symbol):return 'MISSING_VALID_LISTING'
    detail_path=ROOT/'discover/data/stocks/US_REAL'/(symbol+'.json')
    try:detail=json.loads(detail_path.read_text())
    except (OSError,ValueError):return 'MISSING_PRICE_EVIDENCE'
    price=(detail.get('price') or {}).get('value');price_date=detail.get('asOf')
    valuation=(detail.get('fundamentals') or {}).get('valuation') or {};accepted_cap=(valuation.get('marketCap') or {}).get('value')
    financials=store.state('financials:'+company['companyId'],{});shares=financials.get('metrics',{}).get('shares_outstanding',{}).get('current') or {}
    if valuation.get('marketCapReason') or type(accepted_cap) not in (int,float) or shares.get('unit')!='shares' or type(price) not in (int,float) or price<=0 or type(shares.get('value')) not in (int,float) or shares['value']<=0 or not valid_date(price_date) or not valid_date(shares.get('periodEnd')):
        return 'MISSING_OR_AMBIGUOUS_SIZE_EVIDENCE'
    cap=price*shares['value']
    return 'LARGE_CAP' if cap>=10e9 else 'MID_CAP' if cap>=2e9 else 'SMALL_CAP' if cap>=300e6 else 'MICRO_CAP' if cap>=50e6 else 'NANO_CAP'

def failure_class(source):
    error=(source.get('lastError') or '').upper()
    if not source.get('active'):
        return 'REMOVED' if source.get('disabledReason') in ('SOURCE_REMOVED','HTTP_404','HTTP_410') else 'INACTIVE'
    if 'ROBOTS_DISALLOWED' in error:return 'ROBOTS_BLOCKED'
    if 'ROBOTS_UNAVAILABLE' in error:return 'ROBOTS_TEMPORARY_FAILURE'
    if 'HTTP_429' in error or 'RATE_LIMIT' in error:return 'RATE_LIMITED'
    if 'HTTP_401' in error:return 'AUTH_REQUIRED'
    if 'HTTP_403' in error:return 'HTTP_403_UNCLASSIFIED'
    if 'HTTP_404' in error or 'HTTP_410' in error:return 'SOURCE_REMOVED'
    if any(token in error for token in ('PARSE_','PARSEERROR','JSONDECODEERROR','MALFORMED','NOT_FEED','INVALID_Q4','Q4_SCHEMA')):return 'PARSE_FAILURE'
    if error:return 'TEMPORARY_FAILURE'
    return None

def audit(state, identity_root, out, now=None, eligibility_path=None, registry_only=False):
    state=Path(state);out=Path(out)
    db_path=state/'state.sqlite'
    if not db_path.is_file():raise ValueError('ISOLATED_RESTORED_STATE_REQUIRED')
    before=database_proof(db_path)
    stamp=now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    store=Store(db_path)
    try:
        companies=identities(Path(identity_root),store)
        sources=[json.loads(row[0]) for row in store.db.execute('SELECT payload FROM sources')]
        decisions=None
        if eligibility_path:
            decisions=json.loads(Path(eligibility_path).read_text()).get('issuers',{})
        elif registry_only:
            decisions={}
        else:
            from company_intelligence.universe_eligibility import generate
            _,projected=generate(store,companies,out.parent/(out.stem+'-projection'),stamp,companies)
            decisions=projected['issuers']
        issuer_sources=defaultdict(list)
        for source in sources:issuer_sources[source.get('companyId')].append(source)
        blocked={cid for cid in companies if store.state('officialSite:'+cid,{}).get('status') in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS')}
        queued,scheduler=source_queue(sources,companies,stamp,blocked_issuers=blocked)
        due_ids={s['sourceId'] for s in queued}
        classes=Counter();by_type=defaultdict(Counter);by_family=defaultdict(Counter);family_measure=defaultdict(Counter)
        family_backlog=defaultdict(lambda:{'rows':0,'active':0,'due':0,'ages':[],'statuses':Counter()})
        type_backlog=defaultdict(lambda:{'rows':0,'active':0,'due':0,'ages':[],'statuses':Counter()})
        size_backlog=defaultdict(lambda:{'rows':0,'active':0,'due':0,'statuses':Counter()})
        region_backlog=defaultdict(lambda:{'rows':0,'active':0,'due':0,'statuses':Counter()})
        issuer_group_cache={}
        age_values=[];latencies=[];measured=Counter();validators=Counter()
        policy_excluded=Counter();active=0;approved=0;proven=0;provisional=0;never_successful=0;due=0
        ownership=Counter();pollability=Counter();active_rows=0
        for source in sources:
            cid=source.get('companyId');url=source.get('url','')
            status=failure_class(source)
            owner_status=store.state('officialSite:'+cid,{}).get('status') if cid else None
            allowed=bool(cid in companies and source.get('active') and first_party(source,cid) and not publisher(url))
            active_rows+=bool(source.get('active'))
            ownership[owner_status or 'UNVERIFIED_OR_UNRECORDED']+=bool(source.get('active'))
            pollability[source.get('pollabilityStatus') or ('PROVEN_LEGACY' if source.get('lastSuccess') else 'UNPROVEN')]+=bool(source.get('active'))
            if owner_status in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS') and allowed:
                status='OWNERSHIP_UNCLEAR';allowed=False
            if not allowed and status is None:status='POLICY_BLOCKED' if source.get('active') else 'INACTIVE'
            if allowed:
                active+=1;approved+=1
                if source.get('lastSuccess'):
                    is_proven=source.get('pollabilityStatus')!='PROVISIONAL'
                    proven+=is_proven
                    provisional+=not is_proven
                    last=timestamp(source.get('lastSuccess'))
                    if last:
                        age=max(0,(datetime.fromisoformat(stamp.replace('Z','+00:00'))-datetime.fromisoformat(last.replace('Z','+00:00'))).total_seconds()/3600)
                        age_values.append(age)
                        interval,_=effective_interval_hours(source,stamp)
                        if not is_proven:status=status or 'REGISTERED_NOT_POLLABLE'
                        elif status is None and age>max(2*interval,24):status='STALE'
                        else:status=status or ('HEALTHY_EVENT' if source.get('type')=='IR_EVENTS' else 'HEALTHY_MATERIAL' if source.get('type')=='IR_MATERIALS' else 'HEALTHY_POLLABLE')
                else:
                    never_successful+=1
                    status=status or 'REGISTERED_NOT_POLLABLE'
                due+=source.get('sourceId') in due_ids
            status=status or 'REGISTERED_NOT_POLLABLE'
            classes[status]+=1;family=source.get('provider') or source.get('format') or source.get('type') or 'UNKNOWN'
            by_type[source.get('type') or 'UNKNOWN'][status]+=1
            by_family[family][status]+=1
            for metrics in (family_backlog[family],type_backlog[source.get('type') or 'UNKNOWN']):
                metrics['rows']+=1;metrics['active']+=bool(source.get('active'));metrics['due']+=source.get('sourceId') in due_ids;metrics['statuses'][status]+=1
                last=timestamp(source.get('lastSuccess'))
                if last:
                    metrics['ages'].append(max(0,(datetime.fromisoformat(stamp.replace('Z','+00:00'))-datetime.fromisoformat(last.replace('Z','+00:00'))).total_seconds()/3600))
            if cid in companies and not registry_only:
                if cid not in issuer_group_cache:
                    issuer_group_cache[cid]=(issuer_market_cap_bucket(companies[cid],store,stamp),issuer_region(store,companies[cid]))
                size,region=issuer_group_cache[cid]
                for metrics,key in ((size_backlog,size),(region_backlog,region)):
                    row=metrics[key];row['rows']+=1;row['active']+=bool(source.get('active'));row['due']+=source.get('sourceId') in due_ids;row['statuses'][status]+=1
            if not allowed and source.get('active'):
                policy_excluded['ownerConflict' if owner_status in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS') else 'ownershipOrPolicyUnproven']+=1
            if source.get('sourceLastLatencyMs') is not None:
                latencies.append(float(source['sourceLastLatencyMs']));measured['sourcesWithLatency']+=1
                measured['requests']+=int(source.get('sourceLastRequestCount') or 0)
                measured['bytes']+=int(source.get('sourceLastBytes') or 0)
                measured['304']+=bool(source.get('sourceLastNotModified'))
                family_measure[family]['sources']+=1
                family_measure[family]['requests']+=int(source.get('sourceLastRequestCount') or 0)
                family_measure[family]['bytes']+=int(source.get('sourceLastBytes') or 0)
                family_measure[family]['notModified']+=bool(source.get('sourceLastNotModified'))
                family_measure[family]['latencyMsTotal']+=float(source['sourceLastLatencyMs'])
            validators['etag']+=bool(source.get('sourceHasETag'))
            validators['lastModified']+=bool(source.get('sourceHasLastModified'))
        age_values.sort();latencies.sort()
        def pct(values,p):return round(values[max(0,int((len(values)*p+0.999999))-1)],2) if values else None
        def backlog_summary(rows):
            out={}
            for name,metrics in sorted(rows.items()):
                values=sorted(metrics['ages'])
                out[name]={'rows':metrics['rows'],'active':metrics['active'],'due':metrics['due'],'statusCounts':dict(metrics['statuses']),
                    'sourceAgeHours':{'p50':pct(values,.50),'p95':pct(values,.95),'max':round(max(values),2) if values else None}}
            return out
        def issuer_group_summary(rows):
            return {name:{'rows':v['rows'],'active':v['active'],'due':v['due'],'statusCounts':dict(v['statuses'])} for name,v in sorted(rows.items())}
        pub={cid:r for cid,r in (decisions or {}).items() if r.get('status','').startswith('ELIGIBLE_')}
        public_without_source=sum(cid in blocked or not any(s.get('active') and s.get('lastSuccess') and s.get('pollabilityStatus')!='PROVISIONAL' and first_party(s,cid) and not publisher(s.get('url')) for s in issuer_sources[cid]) for cid in pub)
        ticker_owner={listing.get('symbol'):cid for cid,company in companies.items() for listing in company.get('listings',[])}
        mandatory={}
        for ticker in ('PYPL','NTLA'):
            cid=ticker_owner.get(ticker)
            if not cid:mandatory[ticker]={'identity':'NOT_IN_CURRENT_IDENTITY_ROOT'};continue
            rows=issuer_sources[cid]
            approved_rows=[s for s in rows if s.get('active') and first_party(s,cid) and not publisher(s.get('url')) and cid not in blocked]
            status_counts=Counter(failure_class(s) or ('PROVEN' if s.get('lastSuccess') and s.get('pollabilityStatus')!='PROVISIONAL' else 'REGISTERED_NOT_POLLABLE') for s in approved_rows)
            news=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM items WHERE company=?',(cid,)) if json.loads(r[0]).get('eventType')=='NEWS']
            mandatory[ticker]={'issuerResolved':True,'approvedSources':len(approved_rows),'provenSources':sum(bool(s.get('lastSuccess')) and s.get('pollabilityStatus')!='PROVISIONAL' for s in approved_rows),
                'sourceTypes':dict(Counter(s.get('type') or 'UNKNOWN' for s in approved_rows)),'sourceFailureClasses':dict(status_counts),
                'latestSuccessfulCheck':max((s.get('lastSuccess') or '' for s in approved_rows),default=None) or None,
                'newsRecords':len(news),'latestNewsDate':max((i.get('publishedAt') or i.get('publishedDate') or '' for i in news),default=None) or None,
                'officialRootStatus':store.state('officialSite:'+cid,{}).get('status','UNKNOWN')}
        report={'schema':1,'asOf':stamp,'sourceRegistryRows':len(sources),'activeSourceRows':active_rows,'privateIssuers':len(companies),
            'sourceUsagePolicy':json.loads((ROOT/'company-intelligence/config/source-onboarding-review.json').read_text()).get('sourceUsagePolicy'),
            'eligibilityEvaluated':not registry_only,'publicEligibleIssuers':len(pub) if not registry_only else None,
            'publicEligibleIssuersWithoutProvenPollableSource':public_without_source if not registry_only else None,
            'activeApprovedSources':active,'provenPollableSources':proven,'provisionalFirstFetchSources':provisional,'dueSources':due,
            'ownershipEvidenceStates':dict(ownership),'pollabilityStates':dict(pollability),
            'registeredNotPollable':classes['REGISTERED_NOT_POLLABLE'],'statusCounts':dict(classes),
            'bySourceType':{k:dict(v) for k,v in sorted(by_type.items())},
            'byProviderFamily':{k:dict(v) for k,v in sorted(by_family.items())},
            'backlogBySourceType':backlog_summary(type_backlog),'backlogByProviderFamily':backlog_summary(family_backlog),
            'recentRequestMetricsByProviderFamily':{k:{**dict(v),'averageLatencyMs':round(v['latencyMsTotal']/v['sources'],2) if v['sources'] else None} for k,v in sorted(family_measure.items())},
            'activePolicyExcludedCounts':dict(policy_excluded),'conditionalValidatorAvailability':dict(validators),
            'lastRunMeasured':dict(measured),'sourceAgeHours':{'p50':pct(age_values,.50),'p90':pct(age_values,.90),'p95':pct(age_values,.95),'p99':pct(age_values,.99),'max':round(max(age_values),2) if age_values else None,'successAgeAbove4h':sum(x>4 for x in age_values),'successAgeAbove8h':sum(x>8 for x in age_values),'successAgeAbove24h':sum(x>24 for x in age_values),'successAgeAbove72h':sum(x>72 for x in age_values),'successAgeAbove7d':sum(x>168 for x in age_values),'neverSuccessful':never_successful},
            'requestAndLatency':{'sourcesWithRecentMeasurement':measured['sourcesWithLatency'],'requests':measured['requests'],'bytes':measured['bytes'],'notModified':measured['304'],'averageLatencyMs':round(sum(latencies)/len(latencies),2) if latencies else None,'p95LatencyMs':pct(latencies,.95)},
            'mandatoryCases':mandatory,
            'scheduler':scheduler,'sourceRowsByMarketCapBucket':issuer_group_summary(size_backlog) if not registry_only else None,
            'sourceRowsByIssuerRegion':issuer_group_summary(region_backlog) if not registry_only else None,
            'marketCapBasis':'DATED_DISCOVER_CLOSE_TIMES_REPORTED_COMMON_SHARES_SINGLE_LISTING_COMMON_STOCK_ONLY',
            'issuerRegionBasis':'SEC_BUSINESS_COUNTRY_WHEN_AVAILABLE_ELSE_LISTING_COUNTRY_WITH_SEPARATE_UNKNOWN_BUCKET',
            'privateOperationalRowsIncluded':False,'sourceRowsIncluded':False,'contentIncluded':False}
    finally:store.close()
    if before!=database_proof(db_path):raise ValueError('SOURCE_AUDIT_MUTATED_PRIVATE_STATE')
    atomic_json(out,report)
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state',required=True);parser.add_argument('--identity-root',required=True);parser.add_argument('--out',required=True);parser.add_argument('--eligibility');parser.add_argument('--registry-only',action='store_true')
    args=parser.parse_args();value=audit(args.state,args.identity_root,args.out,eligibility_path=args.eligibility,registry_only=args.registry_only)
    print(json.dumps({k:value[k] for k in ('asOf','sourceRegistryRows','privateIssuers','publicEligibleIssuers','activeApprovedSources','provenPollableSources','dueSources','statusCounts','sourceAgeHours','requestAndLatency','scheduler')}))
