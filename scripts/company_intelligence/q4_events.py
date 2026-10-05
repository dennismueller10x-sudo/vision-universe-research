"""Public Q4 event metadata advertised by issuer-hosted evergreen widgets.

Only validated corporate/IR hosts can use this adapter. Same-host event details
are mandatory; CDN/webcast attachments are explicit issuer delegations. No
scripts executed, article bodies retained, keys, signed services or paywalls.
"""
import json
import ipaddress
import re
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlsplit, urlencode
from zoneinfo import ZoneInfo
from .model import canonical_url, clean, stable_id, within_domain
from .ir_events import event, event_type
from .transport import SourceError

# Observed vendor region mapping, not generic EST/PST fixed-offset inference.
ZONES = {'PT':'America/Los_Angeles','PST':'America/Los_Angeles','MT':'America/Denver','MST':'America/Denver',
         'CT':'America/Chicago','CST':'America/Chicago','ET':'America/New_York','EST':'America/New_York',
         'AT':'America/Halifax','AST':'America/Halifax','GMT':'Etc/GMT','BST':'Europe/London'}


def public_link(value):
    url=canonical_url(value)
    if not url:return None
    host=(urlsplit(url).hostname or '').rstrip('.').lower()
    if host == 'localhost' or host.endswith(('.localhost','.local','.internal')):return None
    try:
        if not ipaddress.ip_address(host).is_global:return None
    except ValueError:pass
    return url


def endpoint(page):
    p=urlsplit(page)
    params={'LanguageId':1,'pageSize':20,'pageNumber':0,'year':-1,'includeTags':'true','eventSelection':3,
            'eventDateFilter':3,'includeFinancialReports':'true','includePresentations':'true','includePressReleases':'false','sortOperator':1}
    return p.scheme+'://'+p.netloc+'/feed/Event.svc/GetEventList?'+urlencode(params)


def material_kind(label, url=''):
    # Event attachment labels can say "Presentation and Q&A Transcript".
    # Reuse the material-index priorities instead of hiding management text
    # behind a broader presentation label. Unknown attachments stay unknown.
    from .q4_presentations import document_kind, placeholder_reference
    if placeholder_reference(label, url):return None
    if re.search(r'prepared remarks|earnings script|transcript|shareholder letter|letter to shareholders|management commentary|management discussion|ceo letter|letter from (?:the )?ceo',label,re.I):
        return document_kind(label,url)
    if re.search(r'press release|earnings release',label,re.I):return 'EARNINGS_RELEASE'
    if re.search(r'10-[KQ]|financial tables|annual report|quarterly report|financial supplement|earnings supplement|supplemental (?:financial )?(?:information|data)',label,re.I):
        return document_kind(label,url) if re.search(r'\bpresentations?\b|\bslides?\b|\bdeck\b',label,re.I) else 'FINANCIAL_REPORT'
    if re.search(r'\bpresentations?\b|\bslides?\b|earnings deck',label,re.I):return document_kind(label,url)
    return None


def correct_event(value):
    """Retire known Q4 attachment errors during later event merges/polls."""
    if value.get('confirmationEvidence') != 'VALIDATED_ISSUER_HOST_PUBLIC_Q4_EVENT_METADATA':return value
    from .q4_presentations import attachment
    event=dict(value);documents=[];retired=set()
    for doc in event.get('sourceDocuments',[]):
        if doc.get('evidence')!='Q4_EVENT_ATTACHMENT_LABEL':
            documents.append(doc);continue
        kind=material_kind(doc.get('label',''),doc.get('url',''))
        if not kind or not attachment(doc.get('url')):
            retired.add(doc.get('url'));continue
        if kind!=doc.get('type'):retired.add(doc.get('url'))
        documents.append({**doc,'type':kind})
    event['sourceDocuments']=documents
    for field,kind in [('presentationUrl','PRESENTATION'),('transcriptUrl','COMPANY_TRANSCRIPT')]:
        if event.get(field) in retired:event[field]=None
        if not event.get(field):event[field]=next((d['url'] for d in documents if d.get('type')==kind),None)
    for field in ('webcastUrl','replayUrl'):
        if event.get(field) and (not attachment(event[field]) or re.search(r'\.pdf(?:$|[?#])',event[field],re.I)):
            event[field]=None
    return event


def parse(body,source,now):
    if not source.get('verified') or source.get('provider')!='Q4' or source.get('format')!='Q4_EVENTS':return []
    if len(body)>2*1024*1024:raise SourceError('Q4_OVERSIZED')
    try:data=json.loads(body)
    except (ValueError,TypeError) as exc:raise SourceError('INVALID_Q4_JSON') from exc
    rows=data.get('GetEventListResult') if isinstance(data,dict) else None
    if not isinstance(rows,list) or len(rows)>100:raise SourceError('INVALID_Q4_EVENT_SCHEMA')
    out=[]
    for r in rows:
        if not isinstance(r,dict):raise SourceError('INVALID_Q4_EVENT_ROW')
        name=clean(r.get('Title'),400);url=canonical_url(urljoin(source['url'],r.get('LinkToDetailPage') or ''))
        if not r.get('LinkToDetailPage') or not url or not any(within_domain(url,s) for s in source.get('allowedSites',[])):continue
        if type(r.get('EventId')) not in (int,str) or not re.fullmatch(r'[\w-]{1,80}',str(r['EventId'])):continue
        raw=r.get('StartDate');label=r.get('TimeZone');zone=ZONES.get(label)
        try:dt=datetime.strptime(raw,'%m/%d/%Y %H:%M:%S')
        except (ValueError,TypeError):continue
        day=dt.date().isoformat();clock,start=None,None
        if not -365<=(dt.date()-datetime.fromisoformat(now.replace('Z','+00:00')).date()).days<=365:continue
        if zone and (dt.hour or dt.minute or dt.second):
            wall=dt.replace(tzinfo=ZoneInfo(zone))
            if wall.replace(fold=0).utcoffset()==wall.replace(fold=1).utcoffset():
                clock=dt.strftime('%H:%M');start=wall.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
        from .q4_presentations import attachment
        webcast=attachment((r.get('WebCastLink') or '').strip())
        if webcast and re.search(r'\.pdf(?:$|[?#])',webcast,re.I):webcast=None
        if event_type(name)=='EARNINGS_SCHEDULED' and webcast:name+=' · Earnings webcast'
        e=event(source,name,url,day,now,start=start,clock=clock,zone=zone if clock else None,
                evidence={'method':'Q4_PUBLIC_EVENT_SERVICE','sourceEventId':str(r['EventId']),'sourceDate':raw,'sourceTimezone':label})
        if not e:continue
        e.update(eventId=stable_id(source['companyId'],source['sourceId'],str(r['EventId'])),webcastUrl=webcast,
                 confirmationEvidence='VALIDATED_ISSUER_HOST_PUBLIC_Q4_EVENT_METADATA')
        attachments=r.get('Attachments',[])
        if not isinstance(attachments,list):raise SourceError('INVALID_Q4_ATTACHMENTS')
        for a in attachments[:20]:
            if not isinstance(a,dict):continue
            title=clean(a.get('Title'),200);link=attachment(a.get('Url'));kind=material_kind(title,link or '')
            if kind and link:
                e['sourceDocuments'].append({'type':kind,'url':link,'label':title,'sourceUrl':url,'evidence':'Q4_EVENT_ATTACHMENT_LABEL'})
                field={'PRESENTATION':'presentationUrl','COMPANY_TRANSCRIPT':'transcriptUrl'}.get(kind)
                if field and not e.get(field):e[field]=link
        out.append(e)
    return out


def discover(page_body,page,source,http,now):
    # Match script attributes only. A prose mention of Q4 cannot authorize probing.
    if source.get('provider')!='Q4' or not source.get('verified') or not re.search(br'(?:src|href)\s*=\s*["\'][^"\']*(?:evergreen\.q4Api|q4Api)[^"\']*\.js',page_body,re.I):return None
    url=endpoint(page);s={**source,'url':url,'sourceId':stable_id(source['companyId'],url),'type':'IR_EVENTS','format':'Q4_EVENTS',
                        'intervalHours':12,'active':True,'lastVerified':now,'verificationEvidence':'VALIDATED_IR_Q4_WIDGET_PUBLIC_EVENT_CONTRACT'}
    response=http.get(url,ttl=12*3600)
    if not any(within_domain(response['finalUrl'],u) for u in s.get('allowedSites',[])):raise SourceError('Q4_REDIRECT_REQUIRES_REVALIDATION')
    if not parse(response['body'],s,now):return None
    return s
