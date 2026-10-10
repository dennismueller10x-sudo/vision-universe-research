"""Advertised Q4 issuer press-release metadata. Unzoned clocks stay date-only."""
import json
import re
from datetime import datetime
from urllib.parse import urljoin
from .model import clean, canonical_url, within_domain
from .transport import SourceError


def parse(body, source):
    if not source.get('verified') or source.get('provider') != 'Q4':
        raise SourceError('Q4_NEWS_REQUIRES_VERIFIED_ISSUER')
    if len(body) > 2 * 1024 * 1024:
        raise SourceError('Q4_NEWS_OVERSIZED')
    value = json.loads(body)
    rows = value.get('GetPressReleaseListResult')
    if not isinstance(rows, list):
        raise SourceError('INVALID_Q4_NEWS_SCHEMA')
    out = []
    for row in rows[:100]:
        if not isinstance(row, dict):
            continue
        url = canonical_url(urljoin(source['url'], row.get('LinkToUrl') or row.get('LinkToDetailPage') or ''))
        headline = clean(row.get('Headline'), 500)
        raw_date = row.get('PressReleaseDate', '')
        # This observed service field is US month/day/year. No source timezone
        # was supplied, so its hh:mm:ss must never become an assumed UTC clock.
        if not isinstance(raw_date, str) or not re.fullmatch(r'\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}', raw_date):
            continue
        try:
            day = datetime.strptime(raw_date, '%m/%d/%Y %H:%M:%S').date().isoformat()
        except ValueError:
            continue
        if not headline or not url or not any(within_domain(url, root) for root in source.get('allowedSites', [])):
            continue
        out.append({'headline': headline, 'url': url, 'publishedDate': day,
                    'metadataEvidence': 'Q4_EXPLICIT_PRESS_RELEASE_DATE_NO_TIMEZONE', 'evidenceText': ''})
    return out
