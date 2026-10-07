"""Advertised schema.org news and empirically observed GCS event cards.

Requires validated issuer ownership. Never executes JavaScript, guesses APIs,
uses arbitrary prose as an event date, or stores article bodies.
"""
import json
import re
from html.parser import HTMLParser
from datetime import date
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


class _GCSFragments(HTMLParser):
    """Capture balanced observed containers; nested asset tags stay in their card."""
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    def __init__(self, select, limit=100):
        super().__init__(convert_charrefs=False)
        self.select, self.limit = select, limit
        self.stack, self.fragments = [], []
        self.capture, self.parts, self.size = None, [], 0

    def append(self, value):
        if self.capture is not None:
            self.size += len(value)
            if self.size <= 65536:
                self.parts.append(value)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if self.capture is not None and 'node--type-nir-event' in (attributes.get('class') or '').split():
            previous = self.stack[self.capture][1] if self.capture < len(self.stack) else {}
            if 'node--type-nir-event' in (previous.get('class') or '').split():
                # An explicit new event starts a separate record even in a
                # preceding truncated metadata excerpt; dates never cross it.
                if self.size <= 65536:
                    self.fragments.append(''.join(self.parts))
                del self.stack[self.capture:]
                self.capture, self.parts, self.size = None, [], 0
        if self.capture is None and len(self.fragments) < self.limit and self.select(tag, attributes, self.stack):
            self.capture, self.parts, self.size = len(self.stack), [], 0
        self.append(self.get_starttag_text())
        if tag not in self.VOID:
            self.stack.append((tag, attributes))

    def handle_startendtag(self, tag, attrs):
        self.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.append('</' + tag + '>')
        index = next((i for i in range(len(self.stack)-1, -1, -1) if self.stack[i][0] == tag), None)
        if index is None:
            return
        if self.capture is not None and index <= self.capture:
            if index == self.capture and self.size <= 65536:
                self.fragments.append(''.join(self.parts))
            self.capture, self.parts, self.size = None, [], 0
        del self.stack[index:]

    def handle_data(self, data): self.append(data)
    def handle_entityref(self, name): self.append('&' + name + ';')
    def handle_charref(self, name): self.append('&#' + name + ';')


def _gcs_cards(html):
    def selected(tag, attrs, parents):
        classes = (attrs.get('class') or '').split()
        return (tag in ('article','div','tr') and 'node--type-nir-event' in classes or
                tag == 'tr' or tag == 'div' and parents and
                'nir-widget--list' in (parents[-1][1].get('class') or '').split())
    parser = _GCSFragments(selected)
    parser.feed(html)
    # Recorded metadata excerpts can end after a nested asset closes but before
    # the outer event closes. Preserve that preceding supported case only when
    # exactly one explicit event container remains, never across adjacent cards.
    if parser.capture is not None and parser.size <= 65536 and parser.capture < len(parser.stack):
        attrs = parser.stack[parser.capture][1]
        partial = ''.join(parser.parts)
        if 'node--type-nir-event' in (attrs.get('class') or '').split() and partial.count('node--type-nir-event') == 1:
            parser.fragments.append(partial)
    return [card for card in parser.fragments if card.count('node--type-nir-event') <= 1]


def _gcs_date_text(card):
    # Date fields observed in current GCS cards/tables and its media-object theme.
    def selected(tag, attrs, parents):
        return bool(re.search(r'event-date|field--name-field-nir-event-date|nir-widget--event--date|field-nir-event-start-date|media-object__meta', attrs.get('class') or ''))
    parser = _GCSFragments(selected, limit=8)
    parser.feed(card)
    text = clean(' '.join(parser.fragments), 5000)
    def year_first(match):
        try:
            value = date(*map(int, match.groups()))
        except ValueError:
            return match[0]
        return value.strftime('%B ') + str(value.day) + value.strftime(', %Y')
    # Explicit year-first dates are unambiguous. Slash dates/two-digit years
    # retain their original text and cannot acquire an assumed locale/year.
    return re.sub(r'\b(20\d{2})[.-](\d{2})[.-](\d{2})\b', year_first, text)


def gcs_events(body, source, now):
    if not source.get('verified') or source.get('provider')!='GCS':return []
    from .ir_events import MONTHS
    out=[]
    html=body.decode('utf-8','replace')
    for card in _gcs_cards(html):
        date_text = _gcs_date_text(card)
        if not date_text:continue
        links=parse_links(card.encode(),source['url'])
        primary=next((l for l in links if re.search(r'/events/(?:event-details|event-detail)/',l['url']) and not re.fullmatch(r'webcast|presentation|view details|event details|learn more',l['text'].strip(),re.I) and any(within_domain(l['url'],site) for site in source.get('allowedSites',[]))),None)
        if not primary:
            title = re.match(r'<[^>]*\bdata-title=["\']([^"\']+)["\']', card, re.I)
            if title and 'field-nir-event-title' in card:
                primary = {'url': source['url'], 'text': clean(title[1], 400)}
            else:
                continue
        text=date_text
        # GCS uses abbreviated month names. Normalize only explicit full date tokens.
        def full_date(m):
            month=next((name for name in MONTHS if name[:3]==m[1].lower()[:3]),None)
            return (month.title()+' '+m[2]+', '+m[3]) if month else m[0]
        text=re.sub(r'\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b',full_date,text,flags=re.I)
        from .ir_events import event_type
        headline = primary['text']
        if event_type(headline) == 'EARNINGS_SCHEDULED' and any(re.search(r'webcast', l['text'], re.I) for l in links):
            headline += ' · Earnings webcast'
        item={'url':primary['url'],'headline':headline,'evidenceText':text,'materialLinks':[{'url':l['url'],'label':l['text'],'mediaType':l.get('type','')} for l in links if l!=primary]}
        for e in from_announcement(item,{**source,'type':'IR_EVENTS','format':'GCS_EVENTS'},now):
            e['confirmationEvidence']='VALIDATED_GCS_EVENT_CARD_EXPLICIT_DATE'
            out.append(e)
    return list({e['eventId']:e for e in out}.values())
