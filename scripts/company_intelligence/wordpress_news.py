"""Metadata-only news from an advertised, verified WordPress REST root."""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit, parse_qs
from .model import canonical_url, clean, stable_id, within_domain
from .transport import SourceError

FIELDS = 'date_gmt,link,title.rendered'


def endpoint(api_root):
    root = canonical_url(api_root)
    if not root or urlsplit(root).scheme != 'https' or urlsplit(root).query or not urlsplit(root).path.endswith('/wp-json/'):
        return None
    return canonical_url(root + 'wp/v2/posts?' + urlencode({'_fields': FIELDS, 'per_page': 20, 'context': 'view', 'orderby': 'date', 'order': 'desc'}))


def parse(body, source, final_url):
    query = parse_qs(urlsplit(source.get('url', '')).query)
    if (not source.get('verified') or source.get('format') != 'WORDPRESS_REST_NEWS'
            or query.get('_fields') != [FIELDS] or query.get('per_page') != ['20']
            or query.get('context') != ['view'] or query.get('orderby') != ['date'] or query.get('order') != ['desc']
            or set(query) != {'_fields', 'per_page', 'context', 'orderby', 'order'}
            or urlsplit(source.get('url', '')).scheme != 'https' or urlsplit(final_url).scheme != 'https'
            or not urlsplit(source['url']).path.endswith('/wp-json/wp/v2/posts')
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


def fetch(http, source):
    response = http.get(source['url'])  # Normal robots, budgets, backoff and TLS.
    try:
        entries = parse(response['body'], source, response['finalUrl'])
    except SourceError:
        # A plugin/server that ignores _fields must not leave article content
        # in the HTTP cache or shared response memo, even on a failed poll.
        paths = getattr(http, '_paths', None)
        if paths:
            for path in paths(canonical_url(source['url'])):
                path.unlink(missing_ok=True)
        getattr(http, 'memo', {}).pop((canonical_url(source['url']), True), None)
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
    _, entries = fetch(http, source)
    return source if any(eligible(entry, company, True) for entry in entries) else None
