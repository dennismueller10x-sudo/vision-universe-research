"""Advertised schema.org news and empirically observed GCS event cards.

Requires validated issuer ownership. Never executes JavaScript, guesses APIs,
uses arbitrary prose as an event date, or stores article bodies.
"""
import json
import re
from .feeds import parse_links, parse_date
from .ir_events import JsonLD, from_announcement
from .model import clean, within_domain


def news_index(body, source, url):
    if not source.get('verified'):
        return []
    p=JsonLD();p.feed(body.decode('utf-8','replace'))
    out=[]
    def walk(value, depth=0):
        if depth>15:return
        if isinstance(value,list):
            for item in value[:100]:walk(item,depth+1)
        elif isinstance(value,dict):
            types=value.get('@type',[]);types=[types] if isinstance(types,str) else types
            if isinstance(types,list) and any(t in ('NewsArticle','BlogPosting') for t in types):
                from .model import canonical_url
                link=canonical_url(value.get('url'))
                stamp=parse_date(value.get('datePublished'))
                if link and stamp and value.get('headline') and any(within_domain(link,s) for s in source.get('allowedSites',[])):
                    out.append({'url':link,'headline':clean(value['headline'],400),'publishedAt':stamp,'evidenceText':'','publisher':None,'metadataEvidence':'SCHEMA_ORG_EXPLICIT_HEADLINE_URL_DATE_PUBLISHED'})
            for key in ('@graph','itemListElement','item','mainEntity'):
                if key in value:walk(value[key],depth+1)
    for block in p.blocks:
        try:walk(json.loads(block))
        except (ValueError,TypeError):continue
    return list({r['url']:r for r in out}.values())[:100]


def gcs_events(body, source, now):
    if not source.get('verified') or source.get('provider')!='GCS':return []
    from .ir_events import MONTHS
    out=[]
    html=body.decode('utf-8','replace')
    for match in list(re.finditer(r'<article\b[^>]*class=["\'][^"\']*node--type-nir-event[^"\']*["\'][^>]*>(.*?)</article>',html,re.I|re.S))[:100]:
        card=match[1]
        if not re.search(r'class=["\'][^"\']*(?:event-date|field--name-field-nir-event-date|nir-widget--event--date)',card,re.I):continue
        links=parse_links(card.encode(),source['url'])
        primary=next((l for l in links if re.search(r'/events/(?:event-details|event-detail)/',l['url']) and any(within_domain(l['url'],site) for site in source.get('allowedSites',[]))),None)
        if not primary:
            title = re.search(r'\bdata-title=["\']([^"\']+)["\']', match[0], re.I)
            if title and 'field-nir-event-title' in card:
                primary = {'url': source['url'], 'text': clean(title[1], 400)}
            else:
                continue
        text=clean(card,5000)
        # GCS uses abbreviated month names. Normalize only explicit full date tokens.
        def full_date(m):
            month=next((name for name in MONTHS if name[:3]==m[1].lower()[:3]),None)
            return (month.title()+' '+m[2]+', '+m[3]) if month else m[0]
        text=re.sub(r'\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b',full_date,text,flags=re.I)
        from .ir_events import event_type
        headline = primary['text']
        if event_type(headline) == 'EARNINGS_SCHEDULED' and any(re.search(r'webcast', l['text'], re.I) for l in links):
            headline += ' · Earnings webcast'
        item={'url':primary['url'],'headline':headline,'evidenceText':text,'materialLinks':[{'url':l['url'],'label':l['text']} for l in links if l!=primary]}
        for e in from_announcement(item,{**source,'type':'IR_EVENTS','format':'GCS_EVENTS'},now):
            e['confirmationEvidence']='VALIDATED_GCS_EVENT_CARD_EXPLICIT_DATE'
            out.append(e)
    return list({e['eventId']:e for e in out}.values())
