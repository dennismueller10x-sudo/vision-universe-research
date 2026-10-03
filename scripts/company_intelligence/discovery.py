"""Batch official-site candidates from Wikidata CC0 using exact authoritative SEC CIK."""
import json
from urllib.parse import urlencode, urlsplit
from .model import canonical_url, domain
from .transport import SourceError


def wikidata_catalogue(companies, http):
    """One bounded CC0 catalogue request; intersect exact CIKs with the master.

    This is candidate coverage only, never authority to ingest a corporate site.
    Query-service caching avoids thousands of per-company discovery requests.
    """
    query = 'SELECT ?cik ?entity ?site WHERE { ?entity wdt:P5531 ?cik; wdt:P856 ?site . } LIMIT 10000'
    response = http.get('https://query.wikidata.org/sparql?' + urlencode({'query': query, 'format': 'json'}), robots=False, ttl=7 * 86400)
    rows = json.loads(response['body'])['results']['bindings']
    if not isinstance(rows, list) or len(rows) >= 10000:
        raise SourceError('WIKIDATA_CATALOGUE_TRUNCATED_OR_INVALID')
    wanted = {c['cik'] for c in companies.values() if c.get('cik')}
    found = {}
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(k, {}), dict) for k in ('cik', 'site', 'entity')):
            raise SourceError('INVALID_WIKIDATA_BINDING')
        raw = row.get('cik', {}).get('value', '')
        cik = raw.zfill(10) if isinstance(raw, str) and raw.isdigit() and len(raw) <= 10 else None
        site = canonical_url(row.get('site', {}).get('value'))
        if cik not in wanted or not site or urlsplit(site).scheme != 'https' or urlsplit(site).path != '/' or urlsplit(site).query:
            continue
        found.setdefault(cik, {})[domain(site)] = {'url': site, 'entity': row.get('entity', {}).get('value'),
            'evidence': 'WIKIDATA_P5531_EXACT_CIK_AND_P856_OFFICIAL_SITE', 'confidence': .95}
    return {c['companyId']: {'status': 'NO_CANDIDATE' if not found.get(c.get('cik')) else 'CANDIDATE' if len(found[c['cik']]) == 1 else 'AMBIGUOUS',
                'candidates': list(found.get(c.get('cik'), {}).values())} for c in companies.values() if c.get('cik')}


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
        if not isinstance(row, dict) or any(not isinstance(row.get(k, {}), dict) for k in ('cik', 'site', 'entity')):
            raise SourceError('INVALID_WIKIDATA_BINDING')
        cik = row.get('cik', {}).get('value')
        site = canonical_url(row.get('site', {}).get('value'))
        if cik not in ciks or not site or urlsplit(site).scheme != 'https' or urlsplit(site).path != '/' or urlsplit(site).query:
            continue
        by_cik.setdefault(cik, {}).setdefault(domain(site), {'url': site, 'entity': row['entity']['value'], 'evidence': 'WIKIDATA_P5531_EXACT_CIK_AND_P856_OFFICIAL_SITE', 'confidence': .95})
    # Multiple candidate corporate domains are ambiguous. Do not choose a convenient one.
    return {cik: {'status': 'CANDIDATE' if len(sites) == 1 else 'AMBIGUOUS', 'candidates': list(sites.values())} for cik, sites in by_cik.items()}


def same_web_host(url,other):
    """Only the conventional www alias, never a sibling/delegated host."""
    a,b=domain(url),domain(other)
    return bool(a and b) and a.removeprefix('www.')==b.removeprefix('www.')


def validate_candidate(company, candidate, http, now):
    """Wikidata is discovery evidence only: require corporate header and legal-name ownership."""
    from .model import normalize, clean, SUFFIX, within_domain
    import hashlib
    from .feeds import parse_links
    from .platforms import fingerprint
    import re
    # Old repository candidates often use HTTP. Prefer the same host over TLS
    # to avoid repeated scheme redirects and re-fetching robots metadata.
    request_url = re.sub(r'^http:', 'https:', candidate['url'])
    response = http.get(request_url, ttl=86400)
    if not within_domain(response['finalUrl'], candidate['url']) and not same_web_host(response['finalUrl'],candidate['url']):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT')
    body = response['body'].decode('utf-8', 'replace')
    title = re.search(r'<title[^>]*>(.*?)</title>', body, re.I | re.S)
    header = normalize(title[1] if title else '')
    from html.parser import HTMLParser
    class CorporateHeader(HTMLParser):
        values=[]
        def handle_starttag(self,tag,attrs):
            attrs=dict(attrs)
            if tag=='meta' and (attrs.get('property') or attrs.get('name') or '').casefold() in ('og:site_name','og:title','application-name'):
                self.values.append(clean(attrs.get('content'),200))
    metadata=CorporateHeader();metadata.values=[];metadata.feed(body)
    header=normalize(' '.join([header]+metadata.values))
    def legal_normalize(value):
        value = re.sub(r'/[A-Z]{2,3}/?$', '', str(value), flags=re.I)
        value = re.sub(r'[^\w]+', ' ', clean(value, 2 * 1024 * 1024).casefold()).strip()
        value = re.sub(r'\b(?:[a-z]\s+){1,3}[a-z]\b', lambda m: m[0].replace(' ', ''), value)
        for long, short in [('corporation','corp'),('incorporated','inc'),('limited','ltd'),('company','co')]:
            value = re.sub(r'\b'+long+r'\b',short,value)
        return re.sub(r'^the\s+', '', value)
    visible_body = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>|<!--.*?-->', '', body, flags=re.I | re.S)
    visible = re.sub(r'[^\w]+', ' ', clean(visible_body, 2 * 1024 * 1024).casefold()).strip()
    visible = legal_normalize(visible)
    strong_names=[n for n in company['names'] if re.search(r'\b(?:inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|ag|s\.?a\.?)\b',n,re.I)]
    if not strong_names:
        strong_names=[n for n in company['names'] if len(normalize(n).split())>=2]
    legal = any(re.search(r'(?<!\w)' + re.escape(legal_normalize(n)) + r'(?!\w)', visible) for n in strong_names if legal_normalize(n))
    branded = any(re.search(r'(?<!\w)' + re.escape(normalize(SUFFIX.sub('', n))) + r'(?!\w)', header) for n in company['names'] if normalize(SUFFIX.sub('', n)))
    # Many public-company titles use a short brand (Meta, H&P, Frost),
    # while the copyright footer discloses the precise parent/legal owner.
    # A customer mention in the page body is not this ownership evidence.
    copyright_text = re.sub(r'<[^>]*>', ' ', visible_body)
    copyright_raw = [clean(m[0],300) for m in re.finditer(r'(?:©|&copy;|copyright).{0,300}', copyright_text, re.I | re.S)]
    copyright_regions = [legal_normalize(value) for value in copyright_raw]
    footer_owner = any(re.search(r'(?<!\w)' + re.escape(legal_normalize(n)) + r'(?!\w)', region)
                       for n in strong_names for region in copyright_regions if legal_normalize(n))
    # Corporate footers commonly omit Inc./Corp. Require the complete multiword
    # issuer name, a copyright ownership boundary, and corroborating header.
    # A prefix of another legal owner or a generic single word is insufficient.
    bases={normalize(SUFFIX.sub('',re.sub(r'/[A-Z]{2,3}/?$','',n,flags=re.I))) for n in strong_names}
    suffixless_owner=any(len(base.split())>=2 and re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',header)
                        and any(re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)(?:\s+\d{4})?\s*(?:[.,;|]|all rights|$)',
                                          re.sub(r'[-–—]+',' ',region.casefold())) for region in copyright_raw)
                        for base in bases)
    footer_owner=footer_owner or suffixless_owner
    stop = {'inc','corp','corporation','co','company','ltd','plc','holdings','group','global','national','first','bank','financial','resources','therapeutics','industries','technologies','international','trust','properties','healthcare'}
    brand_tokens = {w for n in company['names'] for w in normalize(n).split() if len(w) >= 4 and w not in stop}
    short_brand = any(re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', header) for w in brand_tokens)
    acronyms = {''.join(w[0] for w in normalize(n).split() if w not in stop and len(w)>1) for n in company['names']}
    header_compact = re.sub(r'(?<!\w)([a-z])\s+([a-z])(?!\w)', r'\1\2', header)
    short_brand = short_brand or any(2 <= len(a) <= 4 and re.search(r'(?<!\w)' + re.escape(a) + r'(?!\w)', header_compact) for a in acronyms)
    copyright_has_legal_owner=any(re.search(r'\b(?:inc|corp|co|ltd|plc|ag|llc)\b',region) for region in copyright_regions)
    if copyright_has_legal_owner and not footer_owner:
        raise SourceError('OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER')
    method = 'EXACT_MULTIWORD_COPYRIGHT_OWNER_AND_CORPORATE_HEADER' if suffixless_owner else 'CORPORATE_TITLE_AND_LEGAL_COMPANY_NAME' if legal and branded else 'EXACT_LEGAL_COPYRIGHT_OWNER_AND_CORPORATE_BRAND'
    if not (legal and branded) and not (footer_owner and short_brand):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED')
    return {'status': 'VALIDATED', 'url': response['finalUrl'], 'lastVerified': now, 'confidence': .95,
            'verificationVersion': 'corporate-ownership-2',
            'evidence': [candidate['evidence'], method], 'title': clean(title[1] if title else ' '.join(metadata.values), 150),
            'ownershipEvidence': {'companyNames': strong_names, 'corporateHeader': header[:300],
                                  'copyrightExcerpts': [v[:160] for v in copyright_raw if any(re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',legal_normalize(v)) for base in bases)][:2]},
            'contentHash': hashlib.sha256(response['body']).hexdigest(), 'platformHint': fingerprint(response['body']),
            'irCandidates': list(dict.fromkeys(l['url'] for l in parse_links(response['body'],response['finalUrl']) if re.search(r'investor.relations|\binvestors?\b',l['text'],re.I) and not re.search(r'\.(?:pdf|zip|xml|js)(?:\?|$)',l['url'],re.I)))[:5]}
