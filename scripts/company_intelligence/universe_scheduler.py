"""Source-centric due queue, not universe discovery. One writer consumes it.

Registry health, HTTP cache and source progress survive the existing checkpoint.
Budget deferrals keep their old due time and therefore lead the following run.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from .consumer_usage import first_party, publisher
from .model import canonical_url
from .model import ACCESSION, timestamp
from .transport import BudgetExhausted
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit

CANARIES = {'iss_cik_0001318605','iss_cik_0000320193','iss_cik_0001045810','iss_cik_0001321655','iss_cik_0001788882','iss_cik_0000789019','iss_cik_0001652044'}

def sec_feed_entries(body, companies):
    if len(body)>2*1024*1024:raise ValueError('SEC_FEED_TOO_LARGE')
    root=ET.fromstring(body);ns={'a':'http://www.w3.org/2005/Atom'}
    if root.tag!='{http://www.w3.org/2005/Atom}feed':raise ValueError('INVALID_SEC_ATOM_FEED')
    rows=[]
    for e in root.findall('a:entry',ns):
        date=timestamp(e.findtext('a:updated',None,ns) or e.findtext('a:published',None,ns))
        link=next((l.attrib.get('href','') for l in e.findall('a:link',ns) if l.attrib.get('rel','alternate')=='alternate'),'')
        url=urlsplit(link)
        match=re.search(r'/Archives/edgar/data/(\d+)/(\d{18})/',url.path)
        if not date or not match or url.scheme!='https' or url.hostname not in ('www.sec.gov','sec.gov'):continue
        cik=match[1].zfill(10);cid='iss_cik_'+cik
        if cid not in companies:continue
        flat=match[2];accession=flat[:10]+'-'+flat[10:12]+'-'+flat[12:]
        if ACCESSION.fullmatch(accession):rows.append({'companyId':cid,'accession':accession,'updatedAt':date})
    dates=[timestamp(e.findtext('a:updated',None,ns) or e.findtext('a:published',None,ns)) for e in root.findall('a:entry',ns)]
    return rows,[d for d in dates if d],len(root.findall('a:entry',ns))

def poll_sec_hints(store,companies,pipeline,now,budget,max_pages=8):
    """One regulator-wide metadata source; exact-CIK hints, no filing bodies.
    Head is reread when resuming a truncated busy feed. Seen accessions and the
    paging watermark are private and survive R2 restoration.
    """
    old=store.state('universeSecFeed',{})
    if (old.get('nextCheck') or '')>now:return {'status':'COOLDOWN','pages':0,'newHints':0}
    floor=old.get('watermark') or advance(now,-4)
    pending=store.state('universeSecPending',{});seen=old.get('seen',{});pages=0;added=0;complete=False;cursor=old.get('resumeOffset',0)
    offsets=[0]+[cursor+100*i for i in range(0,max_pages-1)] if cursor else [100*i for i in range(max_pages)]
    try:
        client=pipeline.sec_client(budget)
        for offset in offsets:
            body=client.get_bytes('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=include&count=100&output=atom&start='+str(offset),use_cache=False)
            rows,dates,count=sec_feed_entries(body,companies);pages+=1
            for r in rows:
                if r['updatedAt']<floor or r['updatedAt']>now or r['accession'] in seen:continue
                pending[r['companyId']]=max(pending.get(r['companyId'],''),r['updatedAt']);seen[r['accession']]=r['updatedAt'];added+=1
            cursor=offset+100
            if count<100 or dates and min(dates)<floor:complete=True;break
        status='SUCCESS' if complete else 'BUDGET_DEFERRED'
        store.set_state('universeSecFeed',{'lastAttempt':now,'lastSuccess':now,'watermark':advance(now,-2) if complete else floor,
                        'resumeOffset':0 if complete else cursor,'status':status,'seen':dict(sorted(seen.items(),key=lambda x:x[1],reverse=True)[:10000])})
    except BudgetExhausted:
        status='BUDGET_DEFERRED';store.set_state('universeSecFeed',{**old,'lastAttempt':now,'status':status,'resumeOffset':cursor,'seen':seen})
    except Exception:
        status='TEMPORARY_FAILURE';store.set_state('universeSecFeed',{**old,'lastAttempt':now,'status':status,'nextCheck':advance(now,8)})
    store.set_state('universeSecPending',pending)
    return {'status':status,'pages':pages,'newHints':added,'pendingIssuers':len(pending),'resumeRequired':not complete}

def advance(value, hours):
    return (datetime.fromisoformat(value.replace('Z','+00:00'))+timedelta(hours=hours)).isoformat(timespec='seconds').replace('+00:00','Z')

def source_queue(sources, companies, now):
    owners=defaultdict(set)
    for s in sources:
        if s.get('companyId') in companies and first_party(s,s['companyId']):
            owners[canonical_url(s.get('url'))].add(s['companyId'])
    queued=[];excluded=Counter();tiers=Counter();due=Counter()
    for s in sources:
        cid=s.get('companyId')
        if cid not in companies or not s.get('active') or not first_party(s,cid) or publisher(s.get('url')):
            excluded['UNAPPROVED_OR_INACTIVE']+=1;continue
        if len(owners[canonical_url(s.get('url'))])!=1:
            excluded['ENDPOINT_MULTI_OWNER_CONFLICT']+=1;continue
        # Dormant news feeds and unsupported index failures are repair lanes,
        # not a 4-hour full archive crawl. No domain/source discovery here.
        hours=4 if s['type']=='IR_FEED' else 8 if s['type']=='IR_EVENTS' else 24
        tier='NEWS_4H' if s['type']=='IR_FEED' else 'EVENTS_8H' if s['type']=='IR_EVENTS' else 'MATERIALS_24H'
        if s['type']=='IR_FEED' and s.get('latestContentAt') and s['latestContentAt'][:10]<advance(now,-90*24)[:10]:
            hours=24;tier='DORMANT_NEWS_24H'
        tiers[tier]+=1
        due_at=(s.get('nextCheck') or '') if s.get('failureCount') else advance(s['lastSuccess'],hours) if s.get('lastSuccess') else ''
        if due_at>now:continue
        due[tier]+=1
        queued.append({**s,'intervalHours':hours,'refreshTier':tier,'dueAt':due_at})
    # Interleave tiers within an oldest-due ordering. A hot news lane cannot
    # permanently starve already overdue events/materials.
    queued.sort(key=lambda s:(s['dueAt'],s.get('lastChecked') or '',s['sourceId']))
    return queued, {'registeredSources':len(sources),'activeApprovedSources':sum(tiers.values()),'tiers':dict(tiers),'dueSources':len(queued),'dueByTier':dict(due),'excluded':dict(excluded)}

def sec_queue(store, companies, now, limit=80):
    """Bounded metadata repair queue with permanent canaries; cursor is private.
    Global source hints can insert exact-CIK changed issuers at the front. No
    issuer is inferred from a company-name match.
    """
    pending=store.state('universeSecPending',{})
    ordered=[]
    for cid,c in companies.items():
        if not c.get('cik'):continue
        health=store.state('sec:'+cid,{})
        if (health.get('retryAfter') or '')>now:continue
        last=store.state('universeSecCheck:'+cid,{}).get('lastAttempt') or ''
        if last and advance(last,4)>now:continue
        priority=0 if cid in pending else 1 if cid in CANARIES else 2
        ordered.append((priority,last,cid,c))
    ordered.sort(key=lambda r:r[:3])
    return [(cid,c) for _,_,cid,c in ordered[:limit]], {'dueIssuers':len(ordered),'selectedIssuers':min(limit,len(ordered)),'deferredIssuers':max(0,len(ordered)-limit),'pendingHintIssuers':len(pending)}
