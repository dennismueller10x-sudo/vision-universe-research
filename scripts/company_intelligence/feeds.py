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
            link = {'href': attrs['href'], 'text': attrs.get('title') or attrs.get('aria-label') or '', 'type': attrs.get('type') or '', 'rel': attrs.get('rel') or ''}
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
    links = []
    for link in parser.links:
        try:
            destination = canonical_url(urljoin(url, link['href']))
        except ValueError:
            # Malformed HTML destinations must not discard valid links on
            # the same page. Canonical validation still rejects unsafe URLs.
            continue
        if destination:
            links.append({**link, 'text': clean(link['text']), 'url': destination})
    return links


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


def is_sec_filing_feed(url):
    from urllib.parse import urlsplit, unquote
    return bool(re.search(r'/rss/sec[-_]?filings?\.(?:aspx|xml|rss)$',
                          unquote(urlsplit(url).path), re.I))


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
        stocks = []
        for child in entry:
            name = local(child.tag)
            fields[name] = ''.join(child.itertext())
            if name == 'category' and child.get('domain') == 'https://www.globenewswire.com/rss/stock':
                stocks.append(clean(child.text, 100))
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
                    'language': clean(fields.get('language'), 20) or None,
                    'distributionMetadata': {'stocks': stocks[:20], 'contributor': clean(fields.get('contributor'), 200)},
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


def news_navigation(label):
    return bool(re.search(r'press releases|news releases|newsroom', label, re.I)
                or re.fullmatch(r'(?:latest |company )?news|press', label.strip(), re.I))


def is_material_feed(url):
    return bool(re.search(r'/rss/presentations?\.', url, re.I))


def provider_type(url, links):
    hosts = [domain(url)] + [domain(l['url']) for l in links]
    return next((provider for suffix, provider in PROVIDERS.items() if any(h == suffix or h.endswith('.' + suffix) for h in hosts)), 'GENERIC')


def discover_ir(company, official_site, http, now, max_pages=3):
    """Retain independently verified endpoints when a bounded walk is interrupted."""
    from .transport import BudgetExhausted
    partial = {'sources': {}, 'configurations': []}
    try:
        return _discover_ir(company, official_site, http, now, max_pages, partial)
    except SourceError as exc:
        exc.discoverySources = list(partial['sources'].values())
        exc.discoveryConfigurations = partial['configurations']
        raise


def _discover_ir(company, official_site, http, now, max_pages, partial):
    """Only walk links from a verified official root. No guessed domains or per-company scraper."""
    from .discovery import same_web_host
    from .transport import BudgetExhausted
    homepage = http.get(official_site, ttl=86400)
    if not within_domain(homepage['finalUrl'], official_site) and not same_web_host(homepage['finalUrl'],official_site):
        raise SourceError('OFFICIAL_SITE_REDIRECT_REQUIRES_REVALIDATION')
    links = parse_links(homepage['body'], homepage['finalUrl'])
    from urllib.parse import urlsplit
    def investor_subscription_page(url):
        # Alert/RSS signup forms are support pages, not an IR entry point.
        return bool(re.search(r'email[-_]?alerts?|rss[-_]?feeds?', urlsplit(url).path, re.I))
    def ir_page(link):
        if investor_subscription_page(link['url']):
            return False
        # Dropdown/fragment navigation is not a separate IR destination. The
        # fetched homepage still receives its own role from its actual URL.
        if link['url'] == canonical_url(homepage['finalUrl']):
            return False
        parts = urlsplit(link['url'])
        if re.search(r'/static-files/|\.(?:ico|png|jpg|jpeg|svg|webp|css|js|json|pdf|xml|zip|woff2?)(?:$)', parts.path, re.I):
            return False
        exact_navigation = re.fullmatch(r'(?:for |our )?investors?(?: relations| overview| information| center| resources)?', ir_label(link), re.I)
        # URL vocabulary establishes an IR route only inside verified company
        # ownership. An external investing article needs an explicit delegated
        # IR navigation label before its feeds can acquire first-party trust.
        owned_route = within_domain(link['url'], official_site) or same_web_host(link['url'], official_site)
        route_signal = (re.search(r'/(?:investor[-_]?relations|investors?)(?:[/._-]|$)', parts.path, re.I) or
                        (parts.path in ('', '/') and re.match(r'(?:ir|investors?)\.', parts.hostname or '', re.I)))
        return bool(exact_navigation or (owned_route and route_signal))
    def ir_label(link):
        # Accessible new-tab hints and repeated title/visible labels can
        # obscure an otherwise exact investor navigation label. Normalize
        # only those forms; arbitrary investing prose stays ineligible.
        text = re.sub(r'^opens? in (?:a )?new (?:browser )?(?:tab|window)\s*', '', link['text'].strip(), flags=re.I)
        repeated = re.fullmatch(r'((?:for |our )?investors?(?: relations| overview| information| center| resources)?)\s*\1', text, re.I)
        return repeated[1] if repeated else text
    def ir_rank(link):
        # Navigation order often puts investor FAQs/governance before the hub.
        # Rank observed links only; never expand the bounded page walk.
        parts=urlsplit(link['url']);text=ir_label(link).casefold()
        if re.fullmatch(r'investors?|investor relations|investor overview',text) or (parts.path in ('','/') and re.match(r'(?:ir|investors?)\.',parts.hostname or '',re.I)):return 0
        if re.search(r'faq|governance|contact|tools|why.invest',text+' '+parts.path,re.I):return 4
        if re.search(r'financial|quarterly|results|earnings|events|calendar|presentations',text+' '+parts.path,re.I):return 1
        return 2
    ir_links = sorted((l for l in links if ir_page(l)),key=ir_rank)
    pages = list(dict.fromkeys([homepage['finalUrl']] + [l['url'] for l in ir_links if l['url'] != homepage['finalUrl']]))[:max_pages]
    trusted_pages = set(pages)
    sources, configs = partial['sources'], partial['configurations']
    warnings = []
    def redirected_ir_proof(page, response):
        # A linked old IR host may migrate to another domain. Require the
        # transport's retained chain and independent destination ownership.
        # Reuse the fetched response; legal routes remain separately bounded.
        from .discovery import validate_discovery_candidate
        if not response.get('redirects'):
            raise SourceError('IR_REDIRECT_MISSING_TRANSPORT_CHAIN')
        class RetainedResponse:
            def get(self, url, **kwargs):
                if canonical_url(url) == canonical_url(re.sub(r'^http:', 'https:', page)):
                    return response
                return http.get(url, **kwargs)
        return validate_discovery_candidate(company, {'url': page, 'evidence': 'LINK_FROM_VERIFIED_OFFICIAL_SITE'}, RetainedResponse(), now)
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
        redirect_proof = None
        if domain(response['finalUrl']) != domain(page) and not within_domain(response['finalUrl'], official_site) and not same_web_host(response['finalUrl'],page):
            try:redirect_proof = redirected_ir_proof(page, response)
            except BudgetExhausted:raise
            except SourceError as error:raise SourceError('IR_REDIRECT_REQUIRES_REVALIDATION:'+str(error)) from error
        trusted_pages.add(response['finalUrl'])
        links = parse_links(response['body'], response['finalUrl'])
        from .platforms import fingerprint, endpoints
        provider = fingerprint(response['body'], provider_type(response['finalUrl'], links))
        # Local proof/documents survive a later provider or linked-page outage.
        event_links = [l for l in links if re.search(r'events|calendar', l['text'], re.I) and not re.search(r'news[-_/]?releases|/static-files/|\.(?:pdf|zip)(?:\?|$)', l['url'], re.I) and within_domain(l['url'], page)]
        from .materials import page_documents
        configs.append({'companyId': company['companyId'], 'irHomepage': response['finalUrl'],
                        'pageRole': 'IR' if not investor_subscription_page(response['finalUrl']) and (page in {l['url'] for l in ir_links} or re.search(r'://(?:ir|investors?)\.|/investors?(?:/|$)|/investor-relations', response['finalUrl'], re.I)) else 'CORPORATE',
                        'documents': page_documents(company, links, response['finalUrl'], now),
                        'pressReleaseUrl': next((l['url'] for l in links if news_navigation(l['text'])), None),
                        'eventsUrl': event_links[0]['url'] if event_links else None,
                        'presentationsUrl': next((l['url'] for l in links if re.search(r'\bpresentations?\b|\bslides?\b', l['text'], re.I)), None),
                        'reportsUrl': next((l['url'] for l in links if re.search(r'annual reports|financial reports|shareholder letter', l['text'], re.I)), None),
                        **endpoints(links, response['finalUrl']),
                        'providerType': provider, 'lastVerified': now,
                        'confidence': 1 if within_domain(page, official_site) else .95, 'evidence': 'LINK_FROM_VERIFIED_OFFICIAL_SITE'})
        if redirect_proof:
            configs[-1]['redirectEvidence'] = redirect_proof.get('redirectEvidence') or {'fromUrl':page,'finalUrl':response['finalUrl'], 'redirects':response['redirects'], 'method':'INDEPENDENT_DESTINATION_LEGAL_OWNER_VERIFICATION'}
            configs[-1]['ownershipEvidence'] = redirect_proof['ownershipEvidence']
        feed_links = [l for l in links if not is_sec_filing_feed(l['url']) and not re.search(r'/comments/feed(?:/|$)|[?&]feed=comments',l['url'],re.I) and (any(m in l['type'] for m in ('rss', 'atom', 'feed+json')) or re.search(r'rss(?:handler|\.aspx|/)|\b(rss|atom)\b|\.rss(?:\?|$)', l['url'] + ' ' + l['text'], re.I))]
        extra = None
        # Follow one linked newsroom/event page if no structured feed is advertised.
        if not feed_links and len(trusted_pages) < max_pages + 1:
            candidate = next((l for l in links if (news_navigation(l['text']) or re.search(r'events', l['text'], re.I)) and not re.search(r'/static-files/|\.(?:pdf|zip|xml)(?:\?|$)', l['url'], re.I) and (within_domain(l['url'], page) or news_navigation(l['text']) and (within_domain(l['url'], official_site) or same_web_host(l['url'], official_site)))), None)
            if candidate:
                extra = optional_page(candidate['url'])
                if extra and domain(extra['finalUrl']) != domain(candidate['url']) and not same_web_host(extra['finalUrl'],candidate['url']):
                    try:redirected_ir_proof(candidate['url'], extra)
                    except BudgetExhausted:raise
                    except SourceError as error:raise SourceError('IR_REDIRECT_REQUIRES_REVALIDATION:'+str(error)) from error
                trusted_pages.add(extra['finalUrl'] if extra else candidate['url'])
                more = parse_links(extra['body'], extra['finalUrl']) if extra else []
                feed_links += [l for l in more if not is_sec_filing_feed(l['url']) and ('rss' in l['type'] or 'atom' in l['type'] or re.search(r'rss(?:handler|\.aspx|/)|\brss\b', l['url'] + ' ' + l['text'], re.I))]
        from .structured_sources import news_index, gcs_events
        from .stockpr_events import parse as stockpr_events
        structured_source = {'companyId': company['companyId'], 'verified': True, 'allowedSites': [official_site,page,response['finalUrl']], 'provider': provider, 'url': response['finalUrl']}
        for news_page in [response] + ([extra] if extra else []):
            structured_source.update(url=news_page['finalUrl'], sourceId=stable_id(company['companyId'], news_page['finalUrl'], 'schema-news'))
            if news_index(news_page['body'], structured_source, news_page['finalUrl']):
                sources[structured_source['sourceId']] = {**structured_source, 'type': 'IR_FEED', 'format': 'JSONLD_NEWS', 'active': True, 'intervalHours': 4, 'lastVerified': now, 'verificationEvidence': 'OFFICIAL_SCHEMA_ORG_NEWS_INDEX'}
        if provider == 'Q4':
            from .q4_events import discover as discover_q4
            from .q4_reports import discover as discover_q4_reports
            from .q4_presentations import discover as discover_q4_presentations
            # Each endpoint fails independently; an event schema change cannot
            # suppress otherwise healthy financial-document discovery.
            for adapter in (discover_q4,discover_q4_reports,discover_q4_presentations):
                try:
                    q4_source=adapter(response['body'],response['finalUrl'],{**structured_source,'provider':provider},http,now)
                    if q4_source:sources[q4_source['sourceId']]=q4_source
                except (SourceError,ValueError) as exc:
                    from .transport import BudgetExhausted
                    if isinstance(exc,BudgetExhausted):raise
                    warnings.append({'url':response['finalUrl'],'reason':str(exc)[:200],'provider':'Q4'})
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
                                'active': True, 'intervalHours': 12, 'lastVerified': now, 'verificationEvidence': 'LINKED_BY_VERIFIED_IR_PAGE'}
                content = structured['body']
                events = parse_ics(content, event_source, now) if content.lstrip().startswith(b'BEGIN:VCALENDAR') else parse_jsonld(content, event_source, now) + gcs_events(content, event_source, now) + stockpr_events(content, event_source, now)
                if events:
                    sources[sid] = event_source
            except (SourceError, ValueError):
                from .transport import BudgetExhausted
                import sys
                if isinstance(sys.exception(), BudgetExhausted):
                    raise
        # One advertised hub can fill a missing material component even when
        # the IR homepage already contains unrelated annual-report links.
        if configs[-1]['pageRole'] == 'IR' and not any(d['type']=='PRESENTATION' for d in configs[-1]['documents']):
            material_hubs = [l for l in links if within_domain(l['url'], page) and re.search(r'\bpresentations?\b|quarterly results|financial results|\bearnings results\b|shareholder letters|transcripts|prepared remarks', l['text'], re.I) and not re.search(r'\.(?:pdf|zip)(?:\?|$)', l['url'], re.I) and l['url'] != response['finalUrl']]
            material_hubs.sort(key=lambda l: (not bool(re.search(r'\bpresentations?\b|\bslides?\b',l['text'],re.I)),l['url']))
            materials_page = next(iter(material_hubs), None)
            if materials_page and materials_page['url'] != response['finalUrl']:
                materials_response = optional_page(materials_page['url'])
                materials_redirect_proof = None
                if materials_response and not within_domain(materials_response['finalUrl'], page):
                    try:
                        materials_redirect_proof = redirected_ir_proof(materials_page['url'], materials_response)
                    except BudgetExhausted:
                        raise
                    except SourceError as error:
                        warnings.append({'url': materials_page['url'], 'reason': 'MATERIALS_REDIRECT_REQUIRES_REVALIDATION:' + str(error)[:160]})
                        materials_response = None
                if materials_response:
                    material_links = parse_links(materials_response['body'], materials_response['finalUrl'])
                    hub_documents=page_documents(company, material_links, materials_response['finalUrl'], now)
                    configs[-1]['documents'].extend(hub_documents)
                    configs[-1]['materialsPage'] = materials_response['finalUrl']
                    if materials_redirect_proof:
                        configs[-1]['materialsRedirectEvidence'] = materials_redirect_proof['redirectEvidence']
                        configs[-1]['materialsOwnershipEvidence'] = materials_redirect_proof['ownershipEvidence']
                        configs[-1]['materialsDomainProof'] = {**materials_redirect_proof, 'companyId': company['companyId']}
                    if provider=='Q4':
                        from .q4_presentations import discover as discover_q4_presentations
                        try:
                            q4_source=discover_q4_presentations(materials_response['body'],materials_response['finalUrl'],{**structured_source,'provider':'Q4'},http,now)
                            if q4_source:sources[q4_source['sourceId']]=q4_source
                        except (SourceError,ValueError) as error:
                            if isinstance(error,BudgetExhausted):raise
                            warnings.append({'url':materials_response['finalUrl'],'reason':str(error)[:200],'provider':'Q4'})
                    if any(d['type']!='FINANCIAL_REPORT' for d in hub_documents):
                        from .materials import from_validated_ir
                        material_source=from_validated_ir({**company,'officialSites':[official_site]},configs[-1],now)
                        if material_source:sources[material_source['sourceId']]=material_source
        for link in feed_links[:3]:
            try:
                feed = http.get(link['url'], ttl=86400)
                # Many hosted platforms advertise an RSS landing page, then link the actual XML feeds.
                if 'text/html' in feed.get('contentType', '') or feed['body'].lstrip().lower().startswith(b'<!doctype html'):
                    advertised = [l for l in parse_links(feed['body'], feed['finalUrl']) if not is_sec_filing_feed(l['url']) and not re.search(r'sec[-_/ ]?filings', l['url'], re.I) and re.search(r'rss/|\.xml(?:\?|$)|application/(?:rss|atom)', l['url'] + ' ' + l['type'], re.I)]
                    for actual in advertised[:3]:
                        actual_response = http.get(actual['url'], ttl=86400)
                        actual_entries = parse_feed(actual_response['body'], actual_response['finalUrl'])
                        from .news_quality import eligible,wordpress_feed
                        wp=(wordpress_feed(actual_response['body']) or provider=='WORDPRESS') and not (is_event_feed(actual['url']) or is_material_feed(actual['url']))
                        valid_entries = [i for i in actual_entries if eligible(i,company,wp) and i.get('url') and i.get('headline') and (i.get('publishedAt') or i.get('updatedAt') or (re.search(r'events|financialevent', actual['url'], re.I) and re.search(r'\b20\d{2}\b', i['headline']))) and any(within_domain(i['url'], u) for u in [official_site, page, actual['url']])]
                        if valid_entries:
                            sid = stable_id(company['companyId'], actual['url'])
                            is_events = is_event_feed(actual['url'])
                            sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_EVENTS' if is_events else 'IR_FEED',
                                            'format': 'RSS_EVENTS' if is_events else 'RSS', 'url': actual['url'], 'verified': True, 'allowedSites': [official_site, page, actual['url']],
                                            'provider': provider, 'active': True, 'priority': 1, 'intervalHours': 12 if is_events else 6, 'lastVerified': now,
                                            'verificationEvidence': {'officialSite': official_site, 'linkedFrom': feed['finalUrl'], 'validItems': len(valid_entries)}}
                    continue
                entries = parse_feed(feed['body'], feed['finalUrl'])
                allowed = [official_site, page]
                # Delegated provider feed may host article links itself, only when linked by validated IR.
                allowed.append(link['url'])
                is_events = is_event_feed(link['url'])
                from .news_quality import eligible,wordpress_feed
                wp=(wordpress_feed(feed['body']) or provider=='WORDPRESS') and not (is_events or is_material_feed(link['url']))
                valid = [i for i in entries if eligible(i,company,wp) and i.get('url') and i.get('headline') and (i.get('publishedAt') or i.get('updatedAt') or (is_events and re.search(r'\b20\d{2}\b', i['headline']))) and any(within_domain(i['url'], u) for u in allowed)]
                if not valid:
                    continue
                sid = stable_id(company['companyId'], link['url'])
                sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_EVENTS' if is_events else 'IR_FEED', 'format': 'RSS_EVENTS' if is_events else 'RSS', 'url': link['url'], 'verified': True,
                                'allowedSites': allowed, 'provider': provider, 'active': True, 'priority': 1, 'intervalHours': 4,
                                'lastVerified': now, 'verificationEvidence': {'officialSite': official_site, 'linkedFrom': page, 'validItems': len(valid)}}
            except (SourceError, ValueError, TypeError, KeyError) as exc:
                from .transport import BudgetExhausted
                if isinstance(exc, BudgetExhausted):
                    raise
                configs[-1].setdefault('feedFailures', []).append({'url': link['url'], 'reason': str(exc)})
        # An advertised blog/empty feed must not suppress a qualifying REST collection.
        if (provider == 'WORDPRESS' or any('https://api.w.org/' in l.get('rel', '') for l in links)) and not any(s.get('type') == 'IR_FEED' for s in sources.values()):
            from .wordpress_news import discover as discover_wordpress_news
            try:
                wordpress_source = discover_wordpress_news(links, response['finalUrl'], company,
                                                            structured_source['allowedSites'], http, now)
                if wordpress_source:
                    sources[wordpress_source['sourceId']] = wordpress_source
            except SourceError as error:
                if isinstance(error, BudgetExhausted):raise
                warnings.append({'url': response['finalUrl'], 'reason': str(error)[:200], 'provider': 'WORDPRESS'})
    # Hosted GCS/Q4 RSS endpoints are reusable provider contracts, not per-company scrapers.
    # Only probe under a successfully fetched verified IR host, and validate ownership + contents.
    if not any(s['type'] == 'IR_FEED' for s in sources.values()) and configs:
        from urllib.parse import urlsplit, urlunsplit
        origin = urlsplit(configs[-1]['irHomepage'])
        family = configs[-1]['providerType']
        patterns = [('GCS', '/rss/news-releases.xml'), ('Q4', '/rss/PressRelease.aspx?LanguageId=1')]
        patterns = [(vendor, path) for vendor, path in patterns if vendor == family or (family == 'GENERIC' and configs[-1]['pageRole'] == 'IR')]
        for provider, path in patterns:
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
                from .news_quality import eligible,wordpress_feed
                wp=wordpress_feed(response['body'])
                valid = [e for e in entries if eligible(e,company,wp) and e.get('headline') and e.get('url') and (e.get('publishedAt') or e.get('updatedAt')) and within_domain(e['url'], candidate)]
                if not ownership or not valid:
                    continue
                sid = stable_id(company['companyId'], candidate)
                sources[sid] = {'sourceId': sid, 'companyId': company['companyId'], 'type': 'IR_FEED', 'url': candidate, 'verified': True,
                                'allowedSites': [official_site, configs[-1]['irHomepage']], 'provider': provider, 'active': True, 'priority': 1,
                                'intervalHours': 4, 'lastVerified': now, 'verificationEvidence': {'method': 'VERIFIED_IR_HOST_PROVIDER_RSS_AND_ENTITY_VALIDATION', 'validItems': len(valid)}}
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
