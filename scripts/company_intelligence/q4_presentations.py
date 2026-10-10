"""Public Q4 presentation metadata on verified issuer IR hosts.

The advertised evergreen SDK exposes Presentation.svc/GetPresentationList.
Keep explicit document/media references; Body and source grouping dates never
become article text, publication timestamps or confirmed earnings events.
"""
import json
import re
from urllib.parse import urlsplit,urlencode,parse_qsl,unquote
from .model import clean,stable_id,within_domain
from .q4_events import public_link
from .transport import SourceError


def endpoint(page):
    p=urlsplit(page)
    params={'LanguageId':1,'pageSize':20,'pageNumber':0,'tagList':'','includeTags':'true',
            'year':-1,'excludeSelection':1,'presentationDateFilter':1}
    return p.scheme+'://'+p.netloc+'/feed/Presentation.svc/GetPresentationList?'+urlencode(params)


def attachment(value):
    url=public_link(value)
    if not url or (urlsplit(url).path in ('','/') and not urlsplit(url).query):return None
    if any(key.casefold().startswith('x-amz-') or key.casefold() in ('token','access_token','auth','signature','api_key','key')
           for key,_ in parse_qsl(urlsplit(url).query)):
        return None
    return url


def placeholder_reference(title, url):
    """Public issuer feeds can retain explicitly labelled vendor template assets."""
    if re.match(r'^test\s+item\s*(?::|$)', clean(title, 200), re.I):
        return True
    path = unquote(urlsplit(url).path)
    return bool(re.search(r'(?:^|/)(?:placeholders?(?:/|$)|placeholder(?:[-_ ]presentation)?\.(?:pdf|pptx?)$)', path, re.I))


def document_kind(title, url):
    """A presentation index may also contain explicitly labelled other materials."""
    if placeholder_reference(title, url):return None
    if re.search(r'prepared remarks|earnings script',title,re.I):return 'PREPARED_REMARKS'
    if re.search(r'transcript',title,re.I):return 'COMPANY_TRANSCRIPT'
    if re.search(r'shareholder letter|letter to shareholders',title,re.I):return 'SHAREHOLDER_LETTER'
    if re.search(r'management commentary|management discussion|ceo letter|letter from (?:the )?ceo',title,re.I):return 'MANAGEMENT_COMMENTARY'
    filename=re.sub(r'[-_+]', ' ', unquote(urlsplit(url).path.rsplit('/',1)[-1]))
    evidence=title+' '+filename
    if re.search(r'(?:impact|sustainability|esg|environmental|csr)\s+report|proxy statement|investor reference book|committee charter',evidence,re.I):return None
    financial=r'annual report|quarterly report|financial statements|financial supplement|earnings? supplement|10 [KQ]\b|10-[KQ]\b'
    if (re.search(financial,filename,re.I) and not re.search(r'presentation|slides|deck',filename,re.I) or
            re.search(financial,title,re.I) and not re.search(r'presentation|slides|deck',title,re.I)):
        return 'FINANCIAL_REPORT'
    if not re.search(r'\bpresentations?\b|\bslides?\b|\bdeck\b', evidence, re.I):
        if re.search(r'\bearnings release\b', filename, re.I):return 'EARNINGS_RELEASE'
        if re.search(r'\bsupplemental (?:financial |earnings )?(?:information|data)\b', evidence, re.I):return 'FINANCIAL_REPORT'
    from .materials import presentation_news_link
    if presentation_news_link(url, title):return None
    return 'PRESENTATION'


def correct_documents(documents):
    """Retain old references while retiring known index classification mistakes."""
    corrected=[]
    for doc in documents:
        if placeholder_reference(doc.get('label',''),doc.get('url','')):continue
        if doc.get('type')=='WEBCAST' and re.search(r'\.pdf(?:$|[?#])',doc.get('url',''),re.I):continue
        if doc.get('type')=='PRESENTATION':
            kind=document_kind(doc.get('label',''),doc['url'])
            if kind is None:continue
            if kind!=doc['type']:
                doc={**doc,'type':kind,'documentId':stable_id(doc['companyId'],doc['url'],kind)}
        corrected.append(doc)
    return corrected


def parse(body,source,now):
    if (not source.get('verified') or source.get('provider')!='Q4' or source.get('format')!='Q4_PRESENTATIONS' or
            urlsplit(source.get('url','')).path!='/feed/Presentation.svc/GetPresentationList' or
            not any(within_domain(source['url'],site) for site in source.get('allowedSites',[]))):
        raise SourceError('Q4_PRESENTATIONS_REQUIRES_VERIFIED_ISSUER_CONTRACT')
    if len(body)>2*1024*1024:raise SourceError('Q4_PRESENTATIONS_OVERSIZED')
    try:data=json.loads(body)
    except (ValueError,TypeError) as exc:raise SourceError('INVALID_Q4_PRESENTATIONS_JSON') from exc
    rows=data.get('GetPresentationListResult') if isinstance(data,dict) else None
    if not isinstance(rows,list) or len(rows)>1000:raise SourceError('INVALID_Q4_PRESENTATIONS_SCHEMA')
    documents=[]
    for row in rows[:20]:
        if not isinstance(row,dict):raise SourceError('INVALID_Q4_PRESENTATION_ROW')
        title=row.get('Title')
        if not isinstance(title,str) or not clean(title,200):continue
        for field,kind,suffix in [('DocumentPath','PRESENTATION',''),('AudioFile','WEBCAST',' (audio reference)'),('VideoFile','WEBCAST',' (video reference)')]:
            url=attachment(row.get(field))
            if not url or placeholder_reference(title,url):continue
            if field=='DocumentPath':kind=document_kind(title,url)
            elif re.search(r'\.pdf(?:$|[?#])',url,re.I):continue
            if kind is None:continue
            documents.append({'documentId':stable_id(source['companyId'],url,kind),'companyId':source['companyId'],
                              'type':kind,'url':url,'label':clean(title,180)+suffix,'sourceId':source['sourceId'],
                              'sourceUrl':source['url'],'eventId':None,'reportingPeriod':None,'date':None,
                              'sourcePresentationId':clean(row.get('PresentationId'),100),
                              'sourceGroupingDate':clean(row.get('PresentationDate'),40),'publicationDateStatus':'NOT_PROVIDED',
                              'evidence':'VERIFIED_ISSUER_Q4_PRESENTATION_INDEX_METADATA','confidence':.95,'discoveredAt':now})
    return list({d['documentId']:d for d in documents}.values())[:100]


def make_source(page,source,now):
    url=endpoint(page)
    return {'sourceId':stable_id(source['companyId'],url),'companyId':source['companyId'],'url':url,
            'type':'IR_MATERIALS','format':'Q4_PRESENTATIONS','provider':'Q4','verified':True,'active':True,
            'allowedSites':source['allowedSites'],'intervalHours':24,'lastVerified':now,
            'metadata':{'originatingIRHomepage':source.get('metadata',{}).get('originatingIRHomepage') or source['allowedSites'][-1]},
            'verificationEvidence':'VERIFIED_IR_Q4_WIDGET_PUBLIC_PRESENTATION_CONTRACT'}


def discover(body,page,source,http,now):
    if (not source.get('verified') or source.get('provider')!='Q4' or
            not any(within_domain(page,u) for u in source.get('allowedSites',[])) or
            not re.search(br'(?:src|href)\s*=\s*["\x27][^"\x27]*(?:evergreen\.q4Api|q4Api)[^"\x27]*\.js',body,re.I)):
        return None
    candidate=make_source(page,source,now);response=http.get(candidate['url'],ttl=86400)
    if not any(within_domain(response['finalUrl'],u) for u in candidate['allowedSites']):
        raise SourceError('Q4_PRESENTATIONS_REDIRECT_REQUIRES_REVALIDATION')
    return candidate if parse(response['body'],candidate,now) else None


def from_validated_events(source,now):
    """Reuse existing issuer/widget proof for the same-host presentation feed."""
    if (not source.get('active',True) or not source.get('verified') or source.get('provider')!='Q4' or
            source.get('format')!='Q4_EVENTS' or urlsplit(source.get('url','')).path!='/feed/Event.svc/GetEventList' or
            not any(within_domain(source['url'],u) for u in source.get('allowedSites',[]))):
        return None
    return {**make_source(source['url'],source,now),'parentSourceId':source['sourceId']}
