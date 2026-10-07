"""Conservative customer-preview filter; never changes the operational ledger.

Verified company-owned IR metadata and SEC facts/links remain available.
Publisher feeds need a separate explicit reuse grant; mere public access, a
provider name or an active polling source is never treated as such a grant.
"""
from copy import deepcopy
from urllib.parse import urlsplit

IR_TYPES = {'IR_FEED', 'IR_EVENTS', 'IR_MATERIALS'}
IR_PROVIDERS = {'FIRST_PARTY', 'Q4', 'GCS', 'STOCKPR', 'WORDPRESS', 'GENERIC', 'WEB_DRIVER', 'INVESTIS'}
PUBLISHER_HOSTS = {'globenewswire.com', 'businesswire.com', 'prnewswire.com', 'wallstreet-online.de', 'newsfilecorp.com', 'accessnewswire.com'}


def host(url):
    try:
        value = urlsplit(url or '')
        return (value.hostname or '').removeprefix('www.').lower() if value.scheme == 'https' and not value.username and not value.password else ''
    except ValueError:
        return ''


def publisher(url):
    h = host(url)
    return any(h == p or h.endswith('.' + p) for p in PUBLISHER_HOSTS)


def first_party(source, cid):
    return source.get('companyId') == cid and source.get('verified') is True and source.get('type') in IR_TYPES and source.get('provider') in IR_PROVIDERS and bool(source.get('allowedSites'))


def filter_for_preview(payload, sources):
    value = deepcopy(payload)
    cid = value['companyId']
    owned_hosts = {host(u) for s in sources if first_party(s, cid) for u in [s.get('url'), *s.get('allowedSites', [])]} - {''}
    def allowed(ref):
        url = ref.get('originalUrl') or ref.get('sourceUrl') or ref.get('canonicalUrl') or ref.get('url')
        if publisher(url):
            return False
        if host(url) in {'sec.gov', 'archives.sec.gov'}:
            return True
        # A recognized provider/source ID cannot authorize another host.
        return host(url) in owned_hosts
    def clean(row):
        if isinstance(row, list):
            return [clean(r) for r in row]
        if not isinstance(row, dict):
            return row
        return {k: clean(v) for k, v in row.items() if k not in {'body', 'articleBody', 'fullText', 'html', 'summary', 'excerpt', 'description'}}
    attached_documents = set()
    for key in ('earnings', 'events', 'calls'):
        for row in payload.get(key, []):
            refs = [row, *row.get('provenance', []), *row.get('eventProvenance', [])]
            if row.get('companyId', cid) != cid or publisher(row.get('canonicalUrl') or row.get('sourceUrl')) or not any(allowed(r) for r in refs):
                continue
            urls = [d.get('url') for d in row.get('sourceDocuments', [])]
            urls += [row.get(field) for field in ('webcastUrl', 'replayUrl', 'transcriptUrl', 'presentationUrl', 'quarterlyReportUrl', 'earningsReleaseUrl')]
            attached_documents.update((row.get('eventId'), u) for u in urls if host(u) and not publisher(u))
    accepted, excluded = {}, {}
    for key in ('news', 'earnings', 'events', 'calls', 'filings', 'materials', 'presentations', 'materialEvents', 'timeline'):
        rows = []
        for row in value.get(key, []):
            if row.get('companyId', cid) != cid:
                continue
            refs = [r for r in [row, *row.get('provenance', []), *row.get('eventProvenance', [])] if allowed(r)]
            estimated = row.get('eventType') == 'EARNINGS_ESTIMATED' and row.get('confirmationStatus') == 'ESTIMATED'
            attached = key in ('materials', 'presentations') and (row.get('eventId'), row.get('url')) in attached_documents
            if not refs and not estimated and not attached:
                continue
            row = clean(row)
            row['provenance'] = [clean(r) for r in row.get('provenance', []) if allowed(r)]
            if 'eventProvenance' in row:
                row['eventProvenance'] = [clean(r) for r in row['eventProvenance'] if allowed(r)]
            # A company-source duplicate can replace a distributor-only URL only
            # with exact headline and publication evidence, never a name guess.
            if publisher(row.get('canonicalUrl') or row.get('sourceUrl')):
                ref = next((r for r in refs if r.get('headline') == row.get('headline') and r.get('publishedAt') == row.get('publishedAt')), None)
                if not ref or not host(ref.get('originalUrl')):
                    continue
                row['canonicalUrl'] = ref['originalUrl']
                if 'sourceUrl' in row:
                    row['sourceUrl'] = ref['originalUrl']
            if 'sourceDocuments' in row:
                # Document links explicitly attached to an accepted company
                # event remain references; no provider media bodies are copied.
                row['sourceDocuments'] = [d for d in row['sourceDocuments'] if host(d.get('url')) and not publisher(d.get('url'))]
            rows.append(row)
        value[key] = rows
        accepted[key], excluded[key] = len(rows), len(payload.get(key, [])) - len(rows)
    value['sourceUsagePolicy'] = 'OWNED_IR_SEC_METADATA_PREVIEW_V1'
    value.setdefault('previewBasis', 'OWNED_IR_SEC_REVIEW')
    return value, {'accepted': accepted, 'excluded': excluded}
