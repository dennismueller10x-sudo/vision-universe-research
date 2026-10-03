"""Publisher-advertised news sitemap metadata; no article body downloads.

Only the pinned GlobeNewswire news endpoint is supported. Plain URL sitemaps
are deliberately rejected: a slug or lastmod is not a headline/publication date.
"""
import re
from xml.etree import ElementTree as ET
from .feeds import parse_date
from .model import canonical_url, clean, domain
from .transport import SourceError

URL = 'https://globenewswire.com/NewsRoom/GoogleSitemap'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'n': 'http://www.google.com/schemas/sitemap-news/0.9'}


def parse(body, url):
    if canonical_url(url) not in (URL, 'https://www.globenewswire.com/NewsRoom/GoogleSitemap') or len(body) > 2 * 1024 * 1024 or re.search(br'<!\s*(DOCTYPE|ENTITY)\b', body, re.I):
        raise SourceError('UNSAFE_NEWS_SITEMAP')
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise SourceError('MALFORMED_NEWS_SITEMAP') from exc
    if root.tag != '{' + NS['s'] + '}urlset' or len(root) > 2000:
        raise SourceError('INVALID_NEWS_SITEMAP_SCHEMA')
    out = []
    for row in root:
        node = row.find('n:news', NS)
        link = canonical_url(row.findtext('s:loc', namespaces=NS))
        if node is None or not link or domain(link) != 'www.globenewswire.com' or '/news-release/' not in link:
            continue
        headline = clean(node.findtext('n:title', namespaces=NS), 400)
        stamp = parse_date(node.findtext('n:publication_date', namespaces=NS))
        publisher = clean(node.findtext('n:publication/n:name', namespaces=NS), 100)
        if not headline or not stamp or publisher != 'GlobeNewswire':
            continue
        stocks = [v.strip() for v in (node.findtext('n:stock_tickers', default='', namespaces=NS)).split(',') if v.strip()][:20]
        # Keywords can be topics or people. They are never a trusted issuer
        # name, publisher identity or standalone entity-resolution signal.
        out.append({'headline': headline, 'url': link, 'publishedAt': stamp,
                    'language': clean(node.findtext('n:publication/n:language', namespaces=NS), 10),
                    'publisher': publisher, 'evidenceText': '',
                    'distributionMetadata': {'stocks': stocks},
                    'promotionalSolicitation': bool(re.search(r'law firm|law offices|law office|lead plaintiff|secure counsel|contact.{0,80}(?:law|llp)|opportunity to lead.{0,100}lawsuit|(?:investors?|shareholders?).{0,100}(?:urged|encouraged).{0,80}(?:contact|act)|(?:investors?|shareholders?).{0,80}deadline|class action.{0,100}deadline|\b(?:ROSEN|Bronstein|Kaplan Fox|Robbins LLP|Hagens Berman|Grabar Law)\b', headline, re.I)),
                    'metadataEvidence': 'ROBOTS_ADVERTISED_NEWS_SITEMAP_EXPLICIT_TITLE_PUBLICATION_DATE'})
    if not out:
        raise SourceError('EMPTY_OR_NON_NEWS_SITEMAP')
    return list({r['url']: r for r in out}.values())
