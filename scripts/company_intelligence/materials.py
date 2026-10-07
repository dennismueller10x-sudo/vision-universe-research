"""Bounded link discovery on official event pages, never article body ingestion."""
import re
from .feeds import parse_links
from .model import within_domain, canonical_url
from .transport import SourceError


def presentation_news_link(url, label):
    """A story about presentations is not an independently linked deck."""
    from urllib.parse import unquote, urlsplit
    path = unquote(urlsplit(url).path)
    if re.search(r'\.pdf(?:$|[?#])|/static-files/', url, re.I):
        return False
    return bool(re.search(r'/(?:news(?:room)?|press)/|/(?:news|press)[-_](?:releases?|details?|articles?|items?)(?:/|[-_])', path, re.I)
                or re.search(r'\b(?:announces?|reports?)\b|\baccepted for presentation\b', label, re.I))


def mislabeled_report_link(url, label):
    """A generic download label cannot turn a named ESG/report PDF into slides."""
    from urllib.parse import unquote, urlsplit
    filename = re.sub(r'[-_+]', ' ', unquote(urlsplit(url).path.rsplit('/', 1)[-1]))
    return bool(re.search(r'\b(?:ESG|sustainability) report\b', filename, re.I)
                and not re.search(r'presentation|slides?|deck', filename, re.I))


def placeholder_document_link(url):
    """Default placeholder PDF assets are not investor materials."""
    from urllib.parse import unquote, urlsplit
    return bool(re.fullmatch(r'placeholder(?:[ _-]document)?\.pdf',
                             unquote(urlsplit(url).path.rsplit('/', 1)[-1]), re.I))


def correct_documents(documents):
    return [doc for doc in documents
            if not placeholder_document_link(doc.get('url', ''))
            and not (doc.get('type') == 'SHAREHOLDER_LETTER'
                    and shareholder_letter_hub(doc.get('url', ''), doc.get('label', '')))
            and (doc.get('type') != 'PRESENTATION'
                 or not (presentation_news_link(doc.get('url', ''), doc.get('label', ''))
                         or mislabeled_report_link(doc.get('url', ''), doc.get('label', ''))))]


def shareholder_letter_hub(url, label):
    return bool(re.fullmatch(r'shareholder letters', label.strip(), re.I)
                and not re.search(r'\.pdf(?:\?|$)|/static-files/', url, re.I))


def retain_source_configurations(store, company_id, configurations):
    """IR navigation rediscovery must not erase separately polled materials."""
    current={cfg.get('materialsSourceId') for cfg in configurations if cfg.get('materialsSourceId')}
    active={src['sourceId'] for src in store.sources() if src.get('companyId')==company_id and
            src.get('verified') and src.get('type')=='IR_MATERIALS'}
    retained=[cfg for cfg in store.state('ir:'+company_id,{}).get('configurations',[])
              if cfg.get('companyId')==company_id and cfg.get('materialsSourceId') in active-current]
    return list(configurations)+retained


def from_validated_ir(company, config, now):
    """Reuse an advertised HTML hub under an already verified IR host."""
    from .model import stable_id
    page=canonical_url(config.get('irHomepage'))
    url=canonical_url(config.get('materialsPage') or config.get('presentationsUrl'))
    proof=config.get('materialsDomainProof') or {}
    redirect=proof.get('redirectEvidence') or {}
    verified_redirect=(proof.get('companyId')==company['companyId'] and proof.get('status')=='VALIDATED'
                       and canonical_url(proof.get('url'))==url and canonical_url(redirect.get('finalUrl'))==url
                       and within_domain(redirect.get('fromUrl'),page)
                       and redirect.get('method')=='INDEPENDENT_DESTINATION_LEGAL_OWNER_VERIFICATION'
                       and 'INDEPENDENTLY_VERIFIED_REDIRECT_DESTINATION' in proof.get('evidence',[]))
    if (not company.get('officialSites') or config.get('companyId')!=company['companyId'] or
            config.get('pageRole')!='IR' or config.get('evidence')!='LINK_FROM_VERIFIED_OFFICIAL_SITE' or
            not page or not url or url==page or not (within_domain(url,page) or verified_redirect) or
            re.search(r'/static-files/|\.(?:pdf|zip)(?:\?|$)',url,re.I)):
        return None
    return {'sourceId':stable_id(company['companyId'],url,'html-materials'),'companyId':company['companyId'],
            'url':url,'type':'IR_MATERIALS','format':'HTML_MATERIALS','provider':config.get('providerType','GENERIC'),
            'verified':True,'active':True,'intervalHours':24,'allowedSites':[company['officialSites'][0],page,url],
            'metadata':{'originatingIRHomepage':page},'lastVerified':now,
            'verificationEvidence':{'method':'ADVERTISED_MATERIALS_HUB_FROM_VERIFIED_IR_PAGE','linkedFrom':page,
                                    **({'redirectEvidence':redirect,'ownershipContentHash':proof['contentHash'],
                                        'ownershipVerificationVersion':proof['verificationVersion']} if verified_redirect else {})}}


def parse_hub(body, source, company, final_url, now):
    if (not source.get('verified') or source.get('format')!='HTML_MATERIALS' or
            source.get('companyId')!=company['companyId'] or
            not any(within_domain(final_url,u) for u in source.get('allowedSites',[]))):
        raise SourceError('HTML_MATERIALS_REQUIRES_VERIFIED_ISSUER_HOST')
    if len(body)>2*1024*1024 or not body.lstrip().startswith(b'<'):
        raise SourceError('HTML_MATERIALS_INVALID_OR_OVERSIZED_HTML')
    documents=page_documents(company,parse_links(body,final_url),final_url,now)
    if not any(d['type']!='FINANCIAL_REPORT' for d in documents):
        raise SourceError('HTML_MATERIALS_NO_COMPANY_MATERIAL_LINKS')
    return [{**d,'sourceId':source['sourceId'],'publicationDateStatus':'NOT_PROVIDED'} for d in documents]


def backfill(pipeline, limit, scope=None, companies=None):
    """Resume missing materials through existing source health and IR proof."""
    import json
    from .q4_reports import from_validated_events
    from .q4_presentations import from_validated_events as presentations_from_events
    from .discovery_circuit import DiscoveryCircuit,guarded_poll
    from .pipeline import advance,utcnow
    from .transport import BudgetExhausted
    if not 1<=limit<=100:raise ValueError('INVALID_MATERIALS_BACKFILL_LIMIT')
    store,http,now=pipeline.store,pipeline.http,pipeline.now
    companies=companies if companies is not None else pipeline.companies
    circuit_key='discoveryCircuit:ir'
    prior_circuit=store.state(circuit_key,store.state('discoveryCircuit',{}))
    if prior_circuit.get('open') and prior_circuit.get('retryAfter','')>now:
        return {'derivedSources':0,'requests':0,'httpStats':http.stats,'run':pipeline.run,
                'deferred':True,'stopReason':'CIRCUIT_COOLDOWN','circuit':prior_circuit}
    prior={s['sourceId']:s for (raw,) in store.db.execute('SELECT payload FROM sources') for s in [json.loads(raw)]}
    candidates={}
    for source in prior.values():
        if source.get('companyId') not in companies or not source.get('active',True):continue
        if scope is not None and source.get('companyId') not in scope:continue
        for adapter in (from_validated_events,presentations_from_events):
            derived=adapter(source,now)
            if derived:candidates[derived['sourceId']]=derived
    for cid,company in sorted(companies.items()):
        if scope is not None and cid not in scope:continue
        if not company.get('officialSites') or store.company_payload(company,now)['presentations']:continue
        for config in store.state('ir:'+cid,{}).get('configurations',[]):
            derived=from_validated_ir(company,config,now)
            if derived:candidates[derived['sourceId']]=derived
    eligible=[]
    for sid,candidate in sorted(candidates.items(),key=lambda item:(item[0] in prior,item[1]['companyId'],item[0])):
        previous=prior.get(sid)
        if previous and (not previous.get('active',True) or previous.get('lastSuccess') or (previous.get('nextCheck') or '')>now):continue
        # A derived descriptor must never reset a prior failure count/due time.
        eligible.append(previous or candidate)
    circuit=DiscoveryCircuit();attempted=[];recovered=[];deferred=False
    def save_circuit():
        checked=utcnow();value={**circuit.snapshot(),'checkedAt':checked,'scope':'ir'}
        if value['open']:value['retryAfter']=advance(checked,.25)
        store.set_state(circuit_key,value)
        return value
    try:
        with guarded_poll(http,circuit):
            for source in eligible[:limit]:
                circuit.check()
                cid=source['companyId'];before=bool(store.company_payload(companies[cid],now)['presentations'])
                store.source(source);attempted.append(source['sourceId'])
                try:pipeline.ingest_source(source)
                finally:save_circuit()
                if not before and store.company_payload(companies[cid],now)['presentations']:recovered.append(cid)
    except BudgetExhausted:
        deferred=True
    finally:
        circuit_state=save_circuit()
    result={'derivedSources':len(attempted),'eligibleSources':len(eligible),'sourceIds':attempted,
            'recoveredPresentationIssuers':sorted(set(recovered)),'run':pipeline.run,'requests':http.requests,
            'httpStats':http.stats,'deferred':deferred,'circuit':circuit_state}
    store.set_state('materialsBackfill:lastBatch',result)
    return result


def page_documents(company, links, page, now):
    """Documents explicitly linked by a validated corporate/IR page, including CDN delegations."""
    from .model import stable_id
    from .sec_documents import release_period
    from urllib.parse import unquote
    out, seen = [], set()
    for link in links:
        if placeholder_document_link(link['url']):
            continue
        if link.get('href','').strip().startswith('#') or canonical_url(link['url']) == canonical_url(page):
            continue  # In-page navigation is not an independently accessible material.
        if link['url'] in seen:
            continue
        label = link['text']
        # An explicit transcript/remarks label describes the content more
        # precisely than "presentation" in a compound attachment title.
        kind = 'PREPARED_REMARKS' if re.search(r'prepared remarks|earnings script', label, re.I) else 'COMPANY_TRANSCRIPT' if re.search(r'transcript', label, re.I) else 'PRESENTATION' if re.search(r'\bpresentations?\b|\bslides?\b|earnings deck', label, re.I) else 'SHAREHOLDER_LETTER' if re.search(r'shareholder letter|letter to shareholders', label, re.I) else 'MANAGEMENT_COMMENTARY' if re.search(r'management commentary|management discussion|ceo letter|letter from (?:the )?(?:ceo|chief executive)', label, re.I) else 'CALL_RECORDING' if re.search(r'(?:earnings|conference) call (?:recording|replay)|(?:webcast|audio) replay', label, re.I) else 'FINANCIAL_REPORT' if re.search(r'annual report|quarterly report|10-[KQ]', label, re.I) else 'EARNINGS_RELEASE' if re.search(r'earnings release', label, re.I) else None
        # Some issuers prefix every attachment with "Download presentation".
        # A specific report filename overrides that generic label, while actual
        # presentation filenames in a financial-results row retain their type.
        from urllib.parse import urlsplit
        filename = re.sub(r'[-_+]', ' ', unquote(urlsplit(link['url']).path.rsplit('/', 1)[-1]))
        # Accessible download buttons may carry only "PDF", an icon, or a
        # shorter earnings label. Use explicit document filenames only for
        # PDF attachments advertised by this validated page, never HTML slugs.
        if not kind and re.search(r'\.pdf$', urlsplit(link['url']).path, re.I):
            kind = ('PREPARED_REMARKS' if re.search(r'\bprepared remarks\b|\bearnings script\b', filename, re.I)
                    else 'COMPANY_TRANSCRIPT' if re.search(r'\b(?:company|earnings|conference call) transcript\b', filename, re.I)
                    else 'SHAREHOLDER_LETTER' if re.search(r'\bshareholder letter\b|\bletter to shareholders\b', filename, re.I)
                    else 'EARNINGS_RELEASE' if re.search(r'\bearnings release\b', filename, re.I)
                    else 'PRESENTATION' if re.search(r'\b(?:investor|corporate|earnings|merger) presentation\b|\bearnings slides\b', filename, re.I)
                    else None)
        if kind == 'PRESENTATION' and re.search(r'annual report|quarterly report|financial statements|10 [KQ]\b', filename, re.I) and not re.search(r'presentation|slides|deck', filename, re.I):
            kind = 'FINANCIAL_REPORT'
        # A named shareholder report is a report even when its UUID attachment
        # button says "View Presentation"; explicit slide/deck titles retain precedence.
        if kind == 'PRESENTATION' and re.search(r'\bshareholders? report\b', filename+' '+label, re.I) and not re.search(r'\b(?:investor|corporate|earnings) presentation\b|\bslides?\b|\bdeck\b', filename+' '+label, re.I):
            kind = 'FINANCIAL_REPORT'
        if not kind:
            continue
        if kind == 'PRESENTATION' and (presentation_news_link(link['url'], label)
                                     or mislabeled_report_link(link['url'], label)):
            continue
        if re.fullmatch(r'presentations?|annual reports?(?: and prox(?:y|ies))?|quarterly reports?|financial reports?|transcripts?|shareholder letters',label.strip(),re.I) and not re.search(r'\.pdf(?:\?|$)|/static-files/',link['url'],re.I):
            continue  # Navigation hubs are not individual document evidence.
        # HTML management materials must stay on the validated issuer host.
        # Explicit PDF/static-file attachments may be delegated to a CDN.
        if not within_domain(link['url'], page) and not re.search(r'\.pdf(?:\?|$)|/static-files/', link['url'], re.I):
            continue
        if kind=='PRESENTATION' and not re.search(r'\.pdf(?:\?|$)|/static-files/',link['url'],re.I) and not re.search(r'20\d{2}|\bQ[1-4]\b|capital markets day|investor day',label+' '+link['url'],re.I):
            continue
        from .q4_events import public_link
        if not public_link(link['url']):
            continue
        period = release_period(re.sub(r'[_+]', ' ', label + ' ' + unquote(link['url']))) or {}
        seen.add(link['url'])
        out.append({'documentId': stable_id(company['companyId'], link['url'], kind), 'companyId': company['companyId'], 'type': kind,
                    'url': link['url'], 'label': label[:200], 'sourceUrl': page, 'eventId': None, 'reportingPeriod': None, 'date': None,
                    **period, 'discoveredAt': now, 'confidence': .95, 'evidence': 'DIRECT_DOCUMENT_LINK_FROM_VALIDATED_OFFICIAL_PAGE'})
    return out[:20]


def discover_links(event, source, http):
    url = event.get('sourceUrl')
    if not source.get('verified') or not any(within_domain(url, site) for site in source.get('allowedSites', [])):
        return event
    response = http.get(url, ttl=86400)
    if not any(within_domain(response['finalUrl'], site) for site in source.get('allowedSites', [])):
        raise SourceError('MATERIAL_PAGE_REDIRECT_REQUIRES_REVALIDATION')
    out = dict(event)
    evidence = []
    for link in parse_links(response['body'], response['finalUrl']):
        if placeholder_document_link(link['url']):
            continue
        if link.get('href','').strip().startswith('#') or link['url'] == canonical_url(response['finalUrl']):
            continue
        label = link['text']
        kind = 'webcastUrl' if re.search(r'webcast|listen|watch webcast', label, re.I) else 'presentationUrl' if re.search(r'\bpresentations?\b|\bslides?\b', label, re.I) else 'transcriptUrl' if re.search(r'transcript', label, re.I) else None
        if kind == 'presentationUrl' and presentation_news_link(link['url'], label):
            continue
        if kind and not out.get(kind) and (kind != 'transcriptUrl' or any(within_domain(link['url'], site) for site in source.get('allowedSites', []))):
            out[kind] = link['url']
            evidence.append({'field': kind, 'url': link['url'], 'linkedFrom': response['finalUrl'], 'label': label[:120]})
    if evidence:
        out['materialEvidence'] = evidence
    return out
