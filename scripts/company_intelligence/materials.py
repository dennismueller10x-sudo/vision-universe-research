"""Bounded link discovery on official event pages, never article body ingestion."""
import re
from .feeds import parse_links
from .model import within_domain
from .transport import SourceError


def page_documents(company, links, page, now):
    """Documents explicitly linked by a validated corporate/IR page, including CDN delegations."""
    from .model import stable_id
    from .sec_documents import release_period
    from urllib.parse import unquote
    out, seen = [], set()
    for link in links:
        if link['url'] in seen:
            continue
        label = link['text']
        kind = 'PRESENTATION' if re.search(r'presentation|slides|earnings deck', label, re.I) else 'PREPARED_REMARKS' if re.search(r'prepared remarks|earnings script', label, re.I) else 'COMPANY_TRANSCRIPT' if re.search(r'transcript', label, re.I) else 'SHAREHOLDER_LETTER' if re.search(r'shareholder letter|letter to shareholders', label, re.I) else 'MANAGEMENT_COMMENTARY' if re.search(r'management commentary|management discussion|ceo letter|letter from (?:the )?(?:ceo|chief executive)', label, re.I) else 'CALL_RECORDING' if re.search(r'(?:earnings|conference) call (?:recording|replay)|(?:webcast|audio) replay', label, re.I) else 'FINANCIAL_REPORT' if re.search(r'annual report|quarterly report|10-[KQ]', label, re.I) else 'EARNINGS_RELEASE' if re.search(r'earnings release', label, re.I) else None
        if not kind:
            continue
        if re.fullmatch(r'presentations?|annual reports?(?: and prox(?:y|ies))?|quarterly reports?|financial reports?|transcripts?',label.strip(),re.I) and not re.search(r'\.pdf(?:\?|$)|/static-files/',link['url'],re.I):
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
        label = link['text']
        kind = 'webcastUrl' if re.search(r'webcast|listen|watch webcast', label, re.I) else 'presentationUrl' if re.search(r'presentation|slides', label, re.I) else 'transcriptUrl' if re.search(r'transcript', label, re.I) else None
        if kind and not out.get(kind) and (kind != 'transcriptUrl' or any(within_domain(link['url'], site) for site in source.get('allowedSites', []))):
            out[kind] = link['url']
            evidence.append({'field': kind, 'url': link['url'], 'linkedFrom': response['finalUrl'], 'label': label[:120]})
    if evidence:
        out['materialEvidence'] = evidence
    return out
