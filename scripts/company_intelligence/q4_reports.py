"""Public Q4 financial-result document indexes on validated issuer hosts.

ReportDate is a vendor grouping date, NOT a publication timestamp. Preserve
explicit fiscal labels and links, without inventing event dates or downloading
PDFs, recordings or transcripts.
"""
import json,re
from urllib.parse import urlsplit,urlencode
from .model import stable_id,clean,within_domain,domain
from .q4_events import public_link
from .transport import SourceError


def endpoint(page):
    p=urlsplit(page)
    return p.scheme+'://'+p.netloc+'/feed/FinancialReport.svc/GetFinancialReportList?'+urlencode({'LanguageId':1,'pageSize':20,'pageNumber':0,'year':-1,'reportTypes':'First Quarter,Second Quarter,Third Quarter,Fourth Quarter','reportTypeId':0})


def parse(body,source,now):
    if not source.get('verified') or source.get('provider')!='Q4' or source.get('format')!='Q4_REPORTS':return []
    if len(body)>2*1024*1024:raise SourceError('Q4_REPORTS_OVERSIZED')
    try:data=json.loads(body)
    except (ValueError,TypeError) as exc:raise SourceError('INVALID_Q4_REPORT_JSON') from exc
    rows=data.get('GetFinancialReportListResult') if isinstance(data,dict) else None
    if not isinstance(rows,list) or len(rows)>1000:raise SourceError('INVALID_Q4_REPORT_SCHEMA')
    out=[]
    for report in rows[:20]:
        if not isinstance(report,dict) or not isinstance(report.get('Documents'),list):raise SourceError('INVALID_Q4_REPORT_ROW')
        year=report.get('ReportYear');quarter={'First Quarter':'Q1','Second Quarter':'Q2','Third Quarter':'Q3','Fourth Quarter':'Q4'}.get(report.get('ReportSubType'))
        if type(year)!=int or not int(now[:4])-1<=year<=int(now[:4])+1:continue
        title=clean(report.get('ReportTitle'),200)
        # The explicit group/title must agree before attaching fiscal labels.
        fiscal_year=year if str(year) in title else None
        for doc in report['Documents'][:20]:
            if not isinstance(doc,dict):raise SourceError('INVALID_Q4_REPORT_DOCUMENT')
            label=clean(doc.get('DocumentTitle'),200);category=doc.get('DocumentCategory');url=public_link(doc.get('DocumentPath'))
            if not url or not label:continue
            kind='COMPANY_TRANSCRIPT' if re.search('transcript',label,re.I) else 'PREPARED_REMARKS' if re.search(r'prepared (?:management )?remarks|earnings script',label,re.I) else 'SHAREHOLDER_LETTER' if re.search('shareholder letter|letter to shareholders',label,re.I) else 'MANAGEMENT_COMMENTARY' if re.search('management commentary|ceo letter',label,re.I) else 'CALL_RECORDING' if re.search('webcast replay|call replay|call recording',label,re.I) else 'EARNINGS_WEBCAST' if quarter and (category=='webcast' or re.search('webcast',label,re.I)) else 'WEBCAST' if category=='webcast' or re.search('webcast',label,re.I) else 'PRESENTATION' if category=='presentation' or re.search('presentation|slides',label,re.I) else 'EARNINGS_RELEASE' if category=='news' or re.search('press release|earnings release',label,re.I) else 'FINANCIAL_REPORT' if category in ('tenq','tenk','annual','supplemental-fin') or re.search('10-[KQ]|annual report|financial statement',label,re.I) else None
            if kind=='PRESENTATION':
                from .q4_presentations import document_kind
                kind=document_kind(label,url)
            if not kind:continue
            # Company transcripts/remarks are issuer-provided, not a paid
            # external provider linked by the site's marketing widget.
            if kind in ('COMPANY_TRANSCRIPT','PREPARED_REMARKS','SHAREHOLDER_LETTER','MANAGEMENT_COMMENTARY') and not any(within_domain(url,u) for u in source.get('allowedSites',[])) and not domain(url).endswith('.q4cdn.com'):continue
            out.append({'documentId':stable_id(source['companyId'],url,kind),'companyId':source['companyId'],'type':kind,'url':url,'label':label,
                        'sourceId':source['sourceId'],'sourceUrl':source['url'],'eventId':None,'reportingPeriod':None,'date':None,
                        'fiscalYear':fiscal_year,'fiscalQuarter':quarter if fiscal_year else None,'sourceReportId':report.get('ReportId'),
                        'sourceGroupingDate':clean(report.get('ReportDate'),40),'publicationDateStatus':'NOT_PROVIDED',
                        'evidence':'VALIDATED_ISSUER_Q4_FINANCIAL_REPORT_DOCUMENT_LABEL','confidence':.95,'discoveredAt':now})
    return list({d['documentId']:d for d in out}.values())[:100]


def discover(body,page,source,http,now):
    if not source.get('verified') or source.get('provider')!='Q4' or not re.search(br'(?:src|href)\s*=\s*["\'][^"\']*(?:evergreen\.q4Api|q4Api)[^"\']*\.js',body,re.I):return None
    url=endpoint(page);s={**source,'url':url,'sourceId':stable_id(source['companyId'],url),'type':'IR_MATERIALS','format':'Q4_REPORTS',
                          'active':True,'intervalHours':24,'lastVerified':now,'verificationEvidence':'VALIDATED_IR_Q4_WIDGET_FINANCIAL_DOCUMENT_CONTRACT'}
    r=http.get(url,ttl=86400)
    if not any(within_domain(r['finalUrl'],u) for u in s.get('allowedSites',[])):raise SourceError('Q4_REPORT_REDIRECT_REQUIRES_REVALIDATION')
    return s if parse(r['body'],s,now) else None


def from_validated_events(source,now):
    """Reuse prior ownership/widget proof; no issuer rediscovery required."""
    if source.get('provider')!='Q4' or source.get('format')!='Q4_EVENTS' or not source.get('verified') or '/feed/Event.svc/GetEventList' not in source.get('url',''):return None
    if not any(within_domain(source['url'],site) for site in source.get('allowedSites',[])):return None
    url=endpoint(source['url'])
    return {**source,'sourceId':stable_id(source['companyId'],url),'url':url,'type':'IR_MATERIALS','format':'Q4_REPORTS','intervalHours':24,
            'lastVerified':now,'parentSourceId':source['sourceId'],'verificationEvidence':'VALIDATED_ISSUER_Q4_WIDGET_SAME_HOST_FINANCIAL_DOCUMENT_CONTRACT',
            'lastSuccess':None,'nextCheck':None,'failureCount':0,'lastError':None}
