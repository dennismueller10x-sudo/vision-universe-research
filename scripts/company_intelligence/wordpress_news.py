"""Metadata-only news from an advertised, verified WordPress REST root."""
import json
import re
import hashlib
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, urlsplit, parse_qs
from .model import canonical_url, clean, stable_id, within_domain
from .transport import SourceError

FIELDS = 'date_gmt,link,title.rendered'
COLLECTIONS = ('posts', 'news', 'press-releases', 'press_releases', 'news-releases', 'news_releases', 'announcements',
               'press-release', 'financial-release', 'press', 'press-room', 'press_release', 'news-media', 'pressreleases',
               'company_news', 'financial_news', 'announcement', 'news_release', 'inv_press_release')


def endpoint(api_root, collection='posts'):
    root = canonical_url(api_root)
    if collection not in COLLECTIONS or not root or urlsplit(root).scheme != 'https' or urlsplit(root).query or not urlsplit(root).path.endswith('/wp-json/'):
        return None
    return canonical_url(root + 'wp/v2/' + collection + '?' + urlencode({'_fields': FIELDS, 'per_page': 20, 'context': 'view', 'orderby': 'date', 'order': 'desc'}))


def parse(body, source, final_url):
    query = parse_qs(urlsplit(source.get('url', '')).query)
    collection = source.get('restCollection', 'posts')
    if collection not in COLLECTIONS:
        raise SourceError('WORDPRESS_NEWS_REQUIRES_VERIFIED_METADATA_CONTRACT')
    proof = source.get('verificationEvidence') or {}
    custom_proven = collection == 'posts' or (isinstance(proof, dict)
        and proof.get('collectionRoute') == '/wp/v2/' + collection
        and isinstance(proof.get('collectionSchemaHash'), str)
        and re.fullmatch(r'[a-f0-9]{64}', proof.get('collectionSchemaHash', ''))
        and endpoint(proof.get('apiRoot'), collection) == source.get('url'))
    if (not source.get('verified') or source.get('format') != 'WORDPRESS_REST_NEWS'
            or query.get('_fields') != [FIELDS] or query.get('per_page') != ['20']
            or query.get('context') != ['view'] or query.get('orderby') != ['date'] or query.get('order') != ['desc']
            or set(query) != {'_fields', 'per_page', 'context', 'orderby', 'order'}
            or urlsplit(source.get('url', '')).scheme != 'https' or urlsplit(final_url).scheme != 'https'
            or collection not in COLLECTIONS or not custom_proven
            or not urlsplit(source['url']).path.endswith('/wp-json/wp/v2/' + collection)
            or urlsplit(final_url).path != urlsplit(source['url']).path
            or not any(within_domain(final_url, site) for site in source.get('allowedSites', []))):
        raise SourceError('WORDPRESS_NEWS_REQUIRES_VERIFIED_METADATA_CONTRACT')
    if len(body) > 2 * 1024 * 1024:
        raise SourceError('WORDPRESS_NEWS_OVERSIZED')
    try:
        rows = json.loads(body)
    except (ValueError, TypeError) as error:
        raise SourceError('WORDPRESS_NEWS_INVALID_JSON') from error
    if not isinstance(rows, list) or len(rows) > 100:
        raise SourceError('WORDPRESS_NEWS_INVALID_SCHEMA')
    out = []
    for row in rows:
        if not isinstance(row, dict) or set(row) - {'date_gmt', 'link', 'title'}:
            raise SourceError('WORDPRESS_METADATA_BODY_FIELDS_UNEXPECTED')
        title = row.get('title')
        if not isinstance(title, dict) or set(title) - {'rendered'}:
            raise SourceError('WORDPRESS_NEWS_INVALID_TITLE')
        url = canonical_url(row.get('link'))
        headline = clean(title.get('rendered'), 400)
        if not url or not headline or not any(within_domain(url, site) for site in source.get('allowedSites', [])):
            continue
        try:
            if not isinstance(row.get('date_gmt'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?', row['date_gmt']):
                continue
            stamp = datetime.fromisoformat(row['date_gmt'])
            if stamp.tzinfo and stamp.utcoffset().total_seconds() != 0:
                continue  # The explicitly UTC field cannot carry a contrary offset.
            stamp = stamp.replace(tzinfo=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
        except (KeyError, ValueError, TypeError, OverflowError):
            continue
        out.append({'url': url, 'headline': headline, 'publishedAt': stamp, 'evidenceText': '',
                    'metadataEvidence': 'WORDPRESS_EXPLICIT_DATE_GMT_TITLE_AND_LINK'})
    return list({row['url']: row for row in out}.values())[:20]


def discard(http, url):
    # Invalid metadata responses may contain article bodies. Remove both stores.
    paths = getattr(http, '_paths', None)
    if paths:
        for path in paths(canonical_url(url)):
            path.unlink(missing_ok=True)
    getattr(http, 'memo', {}).pop((canonical_url(url), True), None)


def fetch(http, source):
    response = http.get(source['url'])  # Normal robots, budgets, backoff and TLS.
    try:
        entries = parse(response['body'], source, response['finalUrl'])
    except SourceError:
        discard(http, source['url'])
        raise
    return response, entries


def discover(links, page, company, allowed_sites, http, now):
    from .news_quality import eligible
    api = next((link['url'] for link in links if 'https://api.w.org/' in link.get('rel', '')
                and any(within_domain(link['url'], site) for site in allowed_sites) and endpoint(link['url'])), None)
    if not api:
        return None
    url = endpoint(api)
    source = {'sourceId': stable_id(company['companyId'], url), 'companyId': company['companyId'],
              'url': url, 'type': 'IR_FEED', 'format': 'WORDPRESS_REST_NEWS', 'provider': 'WORDPRESS',
              'verified': True, 'active': True, 'intervalHours': 4, 'allowedSites': allowed_sites,
              'cmsNewsPolicy': 'WORDPRESS_EXPLICIT_ISSUER_ACTOR', 'lastVerified': now,
              'verificationEvidence': {'method': 'ADVERTISED_WORDPRESS_REST_METADATA_CONTRACT', 'linkedFrom': page, 'apiRoot': api}}
    cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=365)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    def usable(entries):
        return any(cutoff <= entry['publishedAt'] <= now and eligible(entry, company, True) for entry in entries)
    _, entries = fetch(http, source)
    if usable(entries):
        return source
    # One API-index request and at most two advertised dated news collections.
    # Taxonomies lack the date-order contract; no route guessing or enumeration.
    index_url = canonical_url(api + '?' + urlencode({'_fields': 'namespaces,routes'}))
    response = http.get(index_url)
    try:
        if not any(within_domain(response['finalUrl'], site) for site in allowed_sites):
            raise SourceError('WORDPRESS_INDEX_REDIRECT_REQUIRES_VERIFICATION')
        if len(response['body']) > 2 * 1024 * 1024:
            raise SourceError('WORDPRESS_INDEX_OVERSIZED')
        try:
            index = json.loads(response['body'])
        except (ValueError, TypeError) as error:
            raise SourceError('WORDPRESS_INDEX_INVALID_JSON') from error
        if not isinstance(index, dict) or set(index) - {'namespaces', 'routes'} or not isinstance(index.get('routes'), dict):
            raise SourceError('WORDPRESS_INDEX_INVALID_SCHEMA')
    except SourceError:
        discard(http, index_url)
        raise
    attempted = 0
    for collection in COLLECTIONS[1:]:
        route = '/wp/v2/' + collection
        descriptor = index['routes'].get(route)
        if not isinstance(descriptor, dict):continue
        endpoints = descriptor.get('endpoints', [])
        def dated_collection(e):
            if not isinstance(e, dict) or not isinstance(e.get('methods'), list) or 'GET' not in e['methods']:return False
            args = e.get('args')
            orderby = args.get('orderby') if isinstance(args, dict) else None
            return (isinstance(args, dict) and 'per_page' in args and isinstance(orderby, dict)
                    and isinstance(orderby.get('enum'), list) and 'date' in orderby['enum'])
        if not isinstance(endpoints, list) or not any(dated_collection(e) for e in endpoints):continue
        if attempted >= 2:break
        attempted += 1
        source.update(url=endpoint(api, collection), restCollection=collection)
        source['sourceId'] = stable_id(company['companyId'], source['url'])
        source['verificationEvidence'].update(collectionRoute=route, collectionSchemaHash=hashlib.sha256(response['body']).hexdigest())
        _, entries = fetch(http, source)
        if usable(entries):return source
    return None
