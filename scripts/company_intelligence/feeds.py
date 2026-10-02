"""RSS/Atom/JSON feed parsers and reusable robots-aware IR discovery."""
import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree as ET
from .transport import SourceError
from .model import clean, canonical_url, domain, within_domain, timestamp, stable_id


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.current, self.ignore = [], None, 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self.ignore += 1
        if tag in ('a', 'link') and attrs.get('href'):
            link = {'href': attrs['href'], 'text': attrs.get('title') or attrs.get('aria-label', ''), 'type': attrs.get('type', ''), 'rel': attrs.get('rel', '')}
            self.links.append(link)
            if tag == 'a':
                self.current = link

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignore = max(0, self.ignore - 1)
        if tag == 'a':
            self.current = None

    def handle_data(self, data):
        if self.current and not self.ignore:
            self.current['text'] += data


def parse_links(body, url):
    parser = Links()
    parser.feed(body.decode('utf-8', 'replace'))
    return [{**l, 'text': clean(l['text']), 'url': canonical_url(urljoin(url, l['href']))} for l in parser.links if canonical_url(urljoin(url, l['href']))]


def parse_date(value):
    stamp = timestamp(value)
    if stamp:
        return stamp
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError):
        pass
    # GDELT's documented UTC compact timestamp.
    try:
        return datetime.strptime(value, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
    except (TypeError, ValueError):
        return None


def parse_feed(body, url):
    if len(body) > 2 * 1024 * 1024 or re.search(br'<!\s*(DOCTYPE|ENTITY)\b', body, re.I):
        raise SourceError('UNSAFE_OR_OVERSIZED_XML')
    if body.lstrip().startswith(b'{'):
        data = json.loads(body)
        if not str(data.get('version', '')).startswith('https://jsonfeed.org/version/'):
            raise SourceError('NOT_JSON_FEED')
        return [{'headline': clean(i.get('title')), 'url': canonical_url(urljoin(url, i.get('url') or i.get('external_url') or '')),
                 'publishedAt': parse_date(i.get('date_published')), 'evidenceText': clean(i.get('summary'), 2000)} for i in data.get('items', [])[:500]]
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise SourceError('MALFORMED_XML') from exc
    def local(tag):
        return tag.rsplit('}', 1)[-1]
    if local(root.tag) not in ('rss', 'feed', 'RDF'):
        raise SourceError('NOT_FEED')
    out = []
    for entry in [e for e in root.iter() if local(e.tag) in ('item', 'entry')][:500]:
        fields = {}
        links = []
        for child in entry:
            name = local(child.tag)
            fields[name] = ''.join(child.itertext())
            if name == 'link':
                href = child.get('href') or child.text
                if href and child.get('rel', 'alternate') == 'alternate':
                    links.append(href)
        link = links[0] if links else fields.get('guid', '') if fields.get('guid', '').startswith('http') else ''
        excerpt = fields.get('summary') or fields.get('description') or fields.get('content') or ''
        materials = [l for l in parse_links(excerpt.encode(), urljoin(url, link or '')) if re.search(r'webcast|listen|transcript|presentation|slides|shareholder letter', l['text'], re.I)][:10]
        out.append({'headline': clean(fields.get('title')), 'url': canonical_url(urljoin(url, link)) if link else None,
                    'publishedAt': parse_date(fields.get('pubDate') or fields.get('published') or fields.get('date')),
                    'updatedAt': parse_date(fields.get('updated')),
                    # Atom updated is not publication time: old items must never look new.
                    'eventUid': fields.get('guid') or fields.get('id'),
                    'materialLinks': [{'url': l['url'], 'label': clean(l['text'], 100)} for l in materials],
                    'publisher': clean(fields.get('source'), 80) or None,
                    'evidenceText': clean(fields.get('summary') or fields.get('description') or fields.get('content'), 2000)})
    return out


def parse_gdelt(body):
    data = json.loads(body)
    if not isinstance(data.get('articles'), list):
        raise SourceError('INVALID_GDELT_SCHEMA')
    return [{'headline': clean(a.get('title')), 'url': canonical_url(a.get('url')),
             'publishedAt': parse_date(a.get('seendate')), 'timestampPrecision': 'DISCOVERY_TIME',
             'publisher': a.get('domain'), 'language': a.get('language')} for a in data['articles'][:250]]


PROVIDERS = {'q4inc.com': 'Q4', 'q4cdn.com': 'Q4', 'q4web.com': 'Q4', 'gcs-web.com': 'GCS',
             'notified.com': 'NOTIFIED', 'investis.com': 'INVESTIS', 'businesswire.com': 'BUSINESS_WIRE'}


def is_event_feed(url):
    return not re.search(r'press[-_/]?releases|news[-_/]?releases|newsroom|presentation', url, re.I) and bool(re.search(r'events|financialevent|/rss/event\.', url, re.I))


def is_material_feed(url):
    return bool(re.search(r'/rss/presentations?\.', url, re.I))


def provider_type(url, links):
    hosts = [domain(url)] + [domain(l['url']) for l in links]
    return next((provider for suffix, provider in PROVIDERS.items() if any(h == suffix or h.endswith('.' + suffix) for h in hosts)), 'GENERIC')


def discover_ir(company, official_site, http, now, max_pages=3):
    """Only walk links from a verified official root. No guessed domains or per-company scraper."""
    homepage = http.get(official_site, ttl=86400)
    if not within_domain(homepage['finalUrl'], official_site):
        raise SourceError('OFFICIAL_SITE_REDIRECT_REQUIRES_REVALIDATION')
    links = parse_links(homepage['body'], homepage['finalUrl'])
    from urllib.parse import urlsplit
    def ir_page(link):
        parts = urlsplit(link['url'])
        if re.search(r'/static-files/|\.(?:ico|png|jpg|jpeg|svg|webp|css|js|json|pdf|xml|zip|woff2?)(?:$)', parts.path, re.I):
            return False
        return bool(re.search(r'investor|investor.relations', link['text'] + ' ' + parts.path, re.I) or
                    (parts.path in ('', '/') and re.match(r'(?:ir|investors?)\.', parts.hostname or '', re.I)))
    ir_links = [l for l in links if ir_page(l)]
    pages = list(dict.fromkeys([homepage['finalUrl']] + [l['url'] for l in ir_links if l['url'] != homepage['finalUrl']]))[:max_pages]
    trusted_pages = set(pages)
    sources, configs = {}, []
    warnings = []
    def optional_page(url):
        try:
            return http.get(url, ttl=86400)
        except SourceError as exc:
            from .transport import BudgetExhausted
            if isinstance(exc, BudgetExhausted):
                raise
            warnings.append({'url': url, 'reason': str(exc)[:200]})
            return None
    for page in pages:
        response = homepage if page == homepage['finalUrl'] else optional_page(page)
        if response is None:
            continue
        # A direct investor link from official site establishes a delegated IR host; unrelated redirects do not.
        if domain(response['finalUrl']) != domain(page) and not within_domain(response['finalUrl'], official_site):
            raise SourceError('IR_REDIRECT_REQUIRES_REVALIDATION')
        links = parse_links(response['body'], response['finalUrl'])
        from .platforms import fingerprint, endpoints
        provider = fingerprint(response['body'], provider_type(response['finalUrl'], links))
        feed_links = [l for l in links if any(m in l['type'] for m in ('rss', 'atom', 'feed+json')) or re.search(r'rss(?:handler|\.aspx|/)|\b(rss|atom)\b|\.rss(?:\?|$)', l['url'] + ' ' + l['text'], re.I)]
        # Follow one linked newsroom/event page if no structured feed is advertised.
        if not feed_links and len(trusted_pages) < max_pages + 1:
            candidate = next((l for l in links if re.search(r'press releases|news releases|events', l['text'], re.I) and not re.search(r'/static-files/|\.(?:pdf|zip|xml)(?:\?|$)', l['url'], re.I) and within_domain(l['url'], page)), None)
            if candidate:
                extra = optional_page(candidate['url'])
                if extra and domain(extra['finalUrl']) != domain(candidate['url']):
                    raise SourceError('IR_REDIRECT_REQUIRES_REVALIDATION')
                trusted_pages.add(candidate['url'])
                more = parse_links(extra['body'], extra['finalUrl']) if extra else []
                feed_links += [l for l in more if 'rss' in l['type'] or 'atom' in l['type'] or re.search(r'rss(?:handler|\.aspx|/)|\brss\b', l['url'] + ' ' + l['text'], re.I)]
        event_links = [l for l in links if re.search(r'events|calendar', l['text'], re.I) and not re.search(r'news[-_/]?releases|/static-files/|\.(?:pdf|zip)(?:\?|$)', l['url'], re.I) and within_domain(l['url'], page)]
        from .ir_events import parse_jsonld, parse_ics
        for link in event_links[:1]:
            try:
                structured = http.get(link['url'], ttl=86400)
                if domain(structured['finalUrl']) != domain(link['url']):
                    continue
                sid = stable_id(company['companyId'], link['url'], 'events')
                event_source = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_EVENTS', 'url': link['url'],
                                'verified': True, 'allowedSites': [official_site, page, link['url']], 'provider': provider,
                                'active': True, 'intervalHours': 24, 'lastVerified': now, 'verificationEvidence': 'LINKED_BY_VERIFIED_IR_PAGE'}
                content = structured['body']
                events = parse_ics(content, event_source, now) if content.lstrip().startswith(b'BEGIN:VCALENDAR') else parse_jsonld(content, event_source, now)
                if events:
                    sources[sid] = event_source
            except (SourceError, ValueError):
                from .transport import BudgetExhausted
                import sys
                if isinstance(sys.exception(), BudgetExhausted):
                    raise
        from .materials import page_documents
        configs.append({'companyId': company['companyId'], 'irHomepage': response['finalUrl'],
                        'pageRole': 'IR' if page in {l['url'] for l in ir_links} or re.search(r'://(?:ir|investors?)\.|/investors?(?:/|$)|/investor-relations', response['finalUrl'], re.I) else 'CORPORATE',
                        'documents': page_documents(company, links, response['finalUrl'], now),
                        'pressReleaseUrl': next((l['url'] for l in links if re.search(r'press releases|news releases|newsroom', l['text'], re.I)), None),
                        'eventsUrl': event_links[0]['url'] if event_links else None,
                        'presentationsUrl': next((l['url'] for l in links if re.search(r'presentations|slides', l['text'], re.I)), None),
                        'reportsUrl': next((l['url'] for l in links if re.search(r'annual reports|financial reports|shareholder letter', l['text'], re.I)), None),
                        **endpoints(links, response['finalUrl']),
                        'providerType': provider, 'lastVerified': now,
                        'confidence': 1 if within_domain(page, official_site) else .95, 'evidence': 'LINK_FROM_VERIFIED_OFFICIAL_SITE'})
        for link in feed_links[:3]:
            try:
                feed = http.get(link['url'], ttl=86400)
                # Many hosted platforms advertise an RSS landing page, then link the actual XML feeds.
                if 'text/html' in feed.get('contentType', '') or feed['body'].lstrip().lower().startswith(b'<!doctype html'):
                    advertised = [l for l in parse_links(feed['body'], feed['finalUrl']) if not re.search(r'sec[-_/ ]?filings', l['url'], re.I) and re.search(r'rss/|\.xml(?:\?|$)|application/(?:rss|atom)', l['url'] + ' ' + l['type'], re.I)]
                    for actual in advertised[:3]:
                        actual_response = http.get(actual['url'], ttl=86400)
                        actual_entries = parse_feed(actual_response['body'], actual_response['finalUrl'])
                        valid_entries = [i for i in actual_entries if i.get('url') and i.get('headline') and (i.get('publishedAt') or i.get('updatedAt') or (re.search(r'events|financialevent', actual['url'], re.I) and re.search(r'\b20\d{2}\b', i['headline']))) and any(within_domain(i['url'], u) for u in [official_site, page, actual['url']])]
                        if valid_entries:
                            sid = stable_id(company['companyId'], actual['url'])
                            is_events = is_event_feed(actual['url'])
                            sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_EVENTS' if is_events else 'IR_FEED',
                                            'format': 'RSS_EVENTS' if is_events else 'RSS', 'url': actual['url'], 'verified': True, 'allowedSites': [official_site, page, actual['url']],
                                            'provider': provider, 'active': True, 'priority': 1, 'intervalHours': 24 if is_events else 6, 'lastVerified': now,
                                            'verificationEvidence': {'officialSite': official_site, 'linkedFrom': feed['finalUrl'], 'validItems': len(valid_entries)}}
                    continue
                entries = parse_feed(feed['body'], feed['finalUrl'])
                allowed = [official_site, page]
                # Delegated provider feed may host article links itself, only when linked by validated IR.
                allowed.append(link['url'])
                is_events = is_event_feed(link['url'])
                valid = [i for i in entries if i.get('url') and i.get('headline') and (i.get('publishedAt') or i.get('updatedAt') or (is_events and re.search(r'\b20\d{2}\b', i['headline']))) and any(within_domain(i['url'], u) for u in allowed)]
                if not valid:
                    continue
                sid = stable_id(company['companyId'], link['url'])
                sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_EVENTS' if is_events else 'IR_FEED', 'format': 'RSS_EVENTS' if is_events else 'RSS', 'url': link['url'], 'verified': True,
                                'allowedSites': allowed, 'provider': provider, 'active': True, 'priority': 1, 'intervalHours': 6,
                                'lastVerified': now, 'verificationEvidence': {'officialSite': official_site, 'linkedFrom': page, 'validItems': len(valid)}}
            except (SourceError, ValueError, TypeError, KeyError) as exc:
                from .transport import BudgetExhausted
                if isinstance(exc, BudgetExhausted):
                    raise
                configs[-1].setdefault('feedFailures', []).append({'url': link['url'], 'reason': str(exc)})
    # Hosted GCS/Q4 RSS endpoints are reusable provider contracts, not per-company scrapers.
    # Only probe under a successfully fetched verified IR host, and validate ownership + contents.
    if not sources and configs:
        from urllib.parse import urlsplit, urlunsplit
        origin = urlsplit(configs[-1]['irHomepage'])
        for provider, path in [('GCS', '/rss/news-releases.xml'), ('Q4', '/rss/PressRelease.aspx?LanguageId=1')]:
            candidate = origin.scheme + '://' + origin.netloc + path
            try:
                response = http.get(candidate, ttl=86400)
                if domain(response['finalUrl']) != origin.hostname:
                    continue
                entries = parse_feed(response['body'], response['finalUrl'])
                from .model import Resolver, normalize, SUFFIX
                resolver = Resolver({company['companyId']: company})
                # Validate at least one legal-name title, or the feed-level first-party company name.
                owner = ''
                try:
                    document = ET.fromstring(response['body'])
                    owner = ' '.join(clean(e.text) for e in document if e.tag.rsplit('}', 1)[-1] == 'title')
                    if not owner:
                        channel = next((e for e in document if e.tag.rsplit('}', 1)[-1] == 'channel'), None)
                        owner = ' '.join(clean(e.text) for e in channel if e.tag.rsplit('}', 1)[-1] == 'title') if channel is not None else ''
                except ET.ParseError:
                    pass
                owner = normalize(owner)
                ownership = any(resolver.resolve(e, {'type': 'RSS'}) for e in entries)
                ownership = ownership or any(normalize(SUFFIX.sub('', n)) and re.search(r'(?<!\w)' + re.escape(normalize(SUFFIX.sub('', n))) + r'(?!\w)', owner) for n in company['names'])
                valid = [e for e in entries if e.get('headline') and e.get('url') and (e.get('publishedAt') or e.get('updatedAt')) and within_domain(e['url'], candidate)]
                if not ownership or not valid:
                    continue
                sid = stable_id(company['companyId'], candidate)
                sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_FEED', 'url': candidate, 'verified': True,
                                'allowedSites': [official_site, configs[-1]['irHomepage']], 'provider': provider, 'active': True, 'priority': 1,
                                'intervalHours': 6, 'lastVerified': now, 'verificationEvidence': {'method': 'VERIFIED_IR_HOST_PROVIDER_RSS_AND_ENTITY_VALIDATION', 'validItems': len(valid)}}
                configs[-1]['providerType'] = provider
                break
            except SourceError as exc:
                from .transport import BudgetExhausted
                if isinstance(exc, BudgetExhausted):
                    raise
                configs[-1].setdefault('feedFailures', []).append({'url': candidate, 'reason': str(exc)})
    if configs and warnings:
        configs[0]['discoveryWarnings'] = warnings
    return list(sources.values()), configs
