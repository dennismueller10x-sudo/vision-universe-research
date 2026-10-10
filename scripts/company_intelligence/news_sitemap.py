"""Publisher-advertised news sitemap metadata; no article body downloads.

Only the pinned GlobeNewswire news endpoint is supported. Plain URL sitemaps
are deliberately rejected: a slug or lastmod is not a headline/publication date.
"""
import re
from xml.etree import ElementTree as ET
from .feeds import parse_date
from .model import canonical_url, clean, domain
from .transport import SourceError
from .news_quality import promotional_solicitation

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
                    'issuerKeywords':clean(node.findtext('n:keywords',namespaces=NS),1000),
                    'promotionalSolicitation': promotional_solicitation(headline),
                    'metadataEvidence': 'ROBOTS_ADVERTISED_NEWS_SITEMAP_EXPLICIT_TITLE_PUBLICATION_DATE'})
    if not out:
        raise SourceError('EMPTY_OR_NON_NEWS_SITEMAP')
    return list({r['url']: r for r in out}.values())


def resolve_metadata(item,source,companies):
    """Three-signal entity corroboration, never issuer authorship authority.

    Keywords alone are topics. An exact legal name, authoritative listing and
    company-as-actor headline must all agree on the same issuer.
    """
    from .model import normalize,SUFFIX
    if source.get('provider')!='GLOBENEWSWIRE_SITEMAP' or canonical_url(source.get('url')) not in (URL,'https://www.globenewswire.com/NewsRoom/GoogleSitemap'):return None
    def legal(value):
        v=normalize(value)
        for a,b in [('corporation','corp'),('incorporated','inc'),('limited','ltd'),('company','co')]:v=re.sub(r'\b'+a+r'\b',b,v)
        return v
    keywords=legal(item.get('issuerKeywords',''));title=normalize(item.get('headline',''));matches={}
    exchanges={'NASDAQ':{'NASDAQ','XNAS'},'NYSE':{'NYSE','XNYS'},'NYSE AMERICAN':{'AMEX','NYSE_AMERICAN','NYSE AMERICAN','XASE'},'AMEX':{'AMEX','NYSE_AMERICAN','NYSE AMERICAN','XASE'}}
    for stock in (item.get('distributionMetadata') or {}).get('stocks',[])[:20]:
        parsed=re.fullmatch(r'(Nasdaq|NYSE|NYSE American|AMEX):\s*([A-Z][A-Z0-9.-]{0,14})',stock,re.I)
        if not parsed:continue
        exchange,ticker=parsed[1].upper(),parsed[2].upper()
        candidates=[c for c in companies.values() if any(l['symbol']==ticker and l.get('exchange') in exchanges[exchange] for l in c['listings'])]
        if len(candidates)!=1:continue
        c=candidates[0]
        for name in c['names']:
            exact=legal(name)
            if len(exact.split())<2 or not re.search(r'(?<!\w)'+re.escape(exact)+r'(?!\w)',keywords):continue
            brand=normalize(SUFFIX.sub('',name))
            tokens=brand.split()
            if not tokens or len(tokens[0])<3:continue
            # Financial/legal identity is already independently corroborated.
            # A brand may abbreviate its legal company name in its headline.
            prefix=re.escape(tokens[0])+r'(?:\s+'+re.escape(' '.join(tokens[1:]))+r')?' if len(tokens)>1 else re.escape(tokens[0])
            actor=r'^(?:the\s+)?'+prefix+r'(?:\s+(?:inc|corp|corporation|co|company|ltd|limited|plc))?\s+(?:announces?|reports?|schedules?|to (?:hold|host|report|present)|appoints?|launches?|provides?|declares?|completes?|releases?|expands?|raises?|increases?|presents?|signs?|partners?)\b'
            if not re.search(actor,title,re.I):continue
            matches[c['companyId']]={'companyId':c['companyId'],'confidence':.97,'evidence':['PUBLISHER_STOCK_METADATA_EXACT_MASTER_LISTING:'+exchange+':'+ticker,'LEGAL_NAME_CORROBORATION_IN_PUBLISHER_KEYWORDS:'+name,'ISSUER_ACTOR_IN_HEADLINE']}
            break
    return list(matches.values()) if matches else None
