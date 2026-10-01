"""Batch official-site candidates from Wikidata CC0 using exact authoritative SEC CIK."""
import json
from urllib.parse import urlencode, urlsplit
from .model import canonical_url, domain
from .transport import SourceError


def wikidata_sites(companies, http):
    ciks = sorted({c['cik'] for c in companies if c.get('cik')})
    if not ciks:
        return {}
    if len(ciks) > 25:
        raise ValueError('OFFICIAL_SITE_DISCOVERY_BATCH_MAX_25')
    query = 'SELECT ?cik ?entity ?site WHERE { VALUES ?cik { ' + ' '.join('"' + c + '"' for c in ciks) + ' } ?entity wdt:P5531 ?cik; wdt:P856 ?site . }'
    url = 'https://query.wikidata.org/sparql?' + urlencode({'query': query, 'format': 'json'})
    # SPARQL is a documented automation API, governed by its query-service limits.
    response = http.get(url, robots=False, ttl=7 * 86400)
    try:
        rows = json.loads(response['body'])['results']['bindings']
    except (ValueError, KeyError, TypeError) as exc:
        raise SourceError('INVALID_WIKIDATA_RESPONSE') from exc
    by_cik = {}
    for row in rows:
        cik = row.get('cik', {}).get('value')
        site = canonical_url(row.get('site', {}).get('value'))
        if cik not in ciks or not site or urlsplit(site).scheme != 'https' or urlsplit(site).path != '/' or urlsplit(site).query:
            continue
        by_cik.setdefault(cik, {}).setdefault(domain(site), {'url': site, 'entity': row['entity']['value'], 'evidence': 'WIKIDATA_P5531_EXACT_CIK_AND_P856_OFFICIAL_SITE', 'confidence': .95})
    # Multiple candidate corporate domains are ambiguous. Do not choose a convenient one.
    return {cik: {'status': 'CANDIDATE' if len(sites) == 1 else 'AMBIGUOUS', 'candidates': list(sites.values())} for cik, sites in by_cik.items()}


def validate_candidate(company, candidate, http, now):
    """Wikidata is discovery evidence only: require corporate header and legal-name ownership."""
    from .model import normalize, clean, SUFFIX, within_domain
    import re
    response = http.get(candidate['url'], ttl=86400)
    if not within_domain(response['finalUrl'], candidate['url']):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT')
    body = response['body'].decode('utf-8', 'replace')
    title = re.search(r'<title[^>]*>(.*?)</title>', body, re.I | re.S)
    header = normalize(title[1] if title else '')
    visible_body = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>|<!--.*?-->', '', body, flags=re.I | re.S)
    visible = re.sub(r'[^\w]+', ' ', clean(visible_body, 2 * 1024 * 1024).casefold()).strip()
    legal = any(re.search(r'(?<!\w)' + re.escape(normalize(n)) + r'(?!\w)', visible) for n in company['names'] if normalize(n))
    branded = any(re.search(r'(?<!\w)' + re.escape(normalize(SUFFIX.sub('', n))) + r'(?!\w)', header) for n in company['names'] if normalize(SUFFIX.sub('', n)))
    if not legal or not branded:
        raise SourceError('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED')
    return {'status': 'VALIDATED', 'url': response['finalUrl'], 'lastVerified': now, 'confidence': .95,
            'evidence': [candidate['evidence'], 'CORPORATE_TITLE_AND_LEGAL_COMPANY_NAME'], 'title': clean(title[1], 150)}
