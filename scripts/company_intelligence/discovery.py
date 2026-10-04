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


def validate_candidate(company, candidate, http, now, recover_redirects=False):
    """Gather bounded first-party proof; redirects must independently prove the owner."""
    import re
    from .model import within_domain
    from .feeds import parse_links
    request_url = re.sub(r'^http:', 'https:', candidate['url'])
    response = http.get(request_url, ttl=86400)
    redirected = not within_domain(response['finalUrl'], candidate['url']) and not same_web_host(response['finalUrl'], candidate['url'])
    if redirected and (not recover_redirects or not response.get('redirects')):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT')
    target = {**candidate, 'url': response['finalUrl']} if redirected else candidate
    try:
        result = _validate_response(company, target, response, now)
    except SourceError as original:
        # An explicit different legal owner/CIK is never rescued by another page.
        if 'OWNER_NOT_VALIDATED' not in str(original):
            raise
        links = parse_links(response['body'], response['finalUrl'])
        routes = {}
        for link in links:
            url = link['url']
            label = link['text'].casefold()
            if (not (within_domain(url, response['finalUrl']) or same_web_host(url, response['finalUrl']))
                    or url == response['finalUrl'] or re.search(r'\.(?:pdf|zip|xml|js)(?:\?|$)', url, re.I)):
                continue
            if re.search(r'\binvestors?\b|investor relations', label): priority = 0
            elif re.search(r'\babout(?: us| the company)?\b', label): priority = 1
            elif re.search(r'\bprivacy(?: policy| notice)?\b|\blegal\b', label): priority = 2
            else: continue
            routes[url] = min(priority, routes.get(url, priority))
        result = None
        for url in sorted(routes, key=lambda url: (routes[url], url))[:2]:
            try:
                legal_response = http.get(url, ttl=86400)
                try:
                    proof = _validate_response(company, target, legal_response, now)
                    header_source=legal_response['finalUrl']
                except SourceError as route_error:
                    if 'OWNER_NOT_VALIDATED' not in str(route_error): continue
                    proof = _validate_response(company, target, legal_response, now, header_body=response['body'])
                    header_source=response['finalUrl']
                proof['ownershipEvidence'].update(legalSourceUrl=legal_response['finalUrl'], legalContentHash=proof['contentHash'],
                                                 corporateHeaderUrl=header_source)
                proof.update(url=response['finalUrl'], contentHash=response['sha256'] if response.get('sha256') else __import__('hashlib').sha256(response['body']).hexdigest())
                proof['evidence'].append('FIRST_PARTY_LINKED_OWNERSHIP_ROUTE')
                result = proof
                break
            except SourceError as route_error:
                from .transport import BudgetExhausted
                if isinstance(route_error, BudgetExhausted): raise
                continue
        if result is None:
            if redirected: raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED') from original
            raise original
    if redirected:
        result['redirectEvidence'] = {'fromUrl': candidate['url'], 'redirects': response.get('redirects', []),
                                      'finalUrl': response['finalUrl'], 'method': 'INDEPENDENT_DESTINATION_LEGAL_OWNER_VERIFICATION'}
        result['evidence'].append('INDEPENDENTLY_VERIFIED_REDIRECT_DESTINATION')
    return result


def validate_discovery_candidate(company, candidate, http, now):
    return validate_candidate(company, candidate, http, now, recover_redirects=True)


def _validate_response(company, candidate, response, now, header_body=None):
    """Wikidata is discovery evidence only: require corporate header and legal-name ownership."""
    from .model import normalize, clean, SUFFIX, within_domain
    import hashlib
    from .feeds import parse_links
    from .platforms import fingerprint
    import re
    if not within_domain(response['finalUrl'], candidate['url']) and not same_web_host(response['finalUrl'],candidate['url']):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT')
    body = response['body'].decode('utf-8', 'replace')
    header_body = header_body.decode('utf-8','replace') if header_body is not None else body
    title = re.search(r'<title[^>]*>(.*?)</title>', header_body, re.I | re.S)
    header = normalize(title[1] if title else '')
    from html.parser import HTMLParser
    class CorporateHeader(HTMLParser):
        values=[]
        def handle_starttag(self,tag,attrs):
            attrs=dict(attrs)
            if tag=='meta' and (attrs.get('property') or attrs.get('name') or '').casefold() in ('og:site_name','og:title','application-name'):
                self.values.append(clean(attrs.get('content'),200))
    metadata=CorporateHeader();metadata.values=[];metadata.feed(header_body)
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
    # Ownership begins immediately after the copyright marker/year. A partner
    # mentioned later in the footer is not the copyright owner.
    def owner_text(value):
        for _ in range(20):
            stripped=re.sub(r'^\s*(?:copyright|©|&copy;|&nbsp;|\(c\)|\d{4}|\{\{year\}\}|[-–—|,:.])\s*','',value, count=1, flags=re.I)
            if stripped==value:break
            value=stripped
        return value
    owner_raw=[owner_text(value) for value in copyright_raw]
    copyright_regions = [legal_normalize(value) for value in owner_raw]
    footer_owner = any(re.match(re.escape(legal_normalize(n)) + r'(?!\w)(?!\s+(?:services|systems|llc|ltd|corp|inc|plc)\b)', region)
                       for n in strong_names for region in copyright_regions if legal_normalize(n))
    # Corporate footers commonly omit Inc./Corp. Require the complete multiword
    # issuer name, a copyright ownership boundary, and corroborating header.
    # A prefix of another legal owner or a generic single word is insufficient.
    bases={normalize(SUFFIX.sub('',re.sub(r'/[A-Z]{2,3}/?$','',n,flags=re.I))) for n in strong_names}
    suffixless_owner=any(len(base.split())>=2 and re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',header)
                        and any(re.match(re.escape(base)+r'(?!\w)(?:\s+\d{4})?\s*(?:[.,;|]|all rights|$)',
                                          re.sub(r'[-–—]+',' ',region.casefold())) for region in owner_raw)
                        for base in bases)
    footer_owner=footer_owner or suffixless_owner
    stop = {'inc','corp','corporation','co','company','ltd','plc','holdings','group','global','national','first','bank','financial','resources','therapeutics','industries','technologies','international','trust','properties','healthcare'}
    brand_tokens = {w for n in company['names'] for w in normalize(n).split() if len(w) >= 4 and w not in stop}
    short_brand = any(re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', header) for w in brand_tokens)
    acronyms = {''.join(w[0] for w in normalize(n).split() if w not in stop and len(w)>1) for n in company['names']}
    header_compact = re.sub(r'(?<!\w)([a-z])\s+([a-z])(?!\w)', r'\1\2', header)
    legal_suffixes={'inc','corp','corporation','co','company','ltd','limited','plc','ag','sa'}
    acronyms |= {''.join(w[0] for w in normalize(n).split() if w not in legal_suffixes) for n in strong_names}
    short_brand = short_brand or any(2 <= len(a) <= 4 and re.search(r'(?<!\w)' + re.escape(a) + r'(?!\w)', header_compact) for a in acronyms)
    # Exact legal footer still required: recognize compound brands such as
    # Bio-Rad and JPMorganChase without admitting generic one-word guesses.
    for base in bases:
        words=base.split()
        if len(words)>=2 and all(len(w)>=3 and w not in stop for w in words[:2]):
            brand=' '.join(words[:2])
            compact=''.join(words)
            short_brand = short_brand or bool(re.search(r'(?<!\w)'+re.escape(brand)+r'(?!\w)',header)) or bool(re.search(r'(?<!\w)'+re.escape(compact)+r'(?!\w)',header)) or bool(re.search(r'(?<!\w)'+re.escape(''.join(words[:2]))+r'(?!\w)',header))
    # Explicit structured legal ownership is commonly present only in JSON-LD,
    # excluded from visible text above. A publisher/customer entity on another
    # host, generic brand name or unrelated schema type is not ownership proof.
    structured_owner = []
    for match in re.finditer(r'<script\b[^>]*type=["\x27]application/ld\+json["\x27][^>]*>(.*?)</script>', body, re.I | re.S):
        if len(match[1]) > 128 * 1024:continue
        try:
            document=json.loads(match[1])
            nodes=document if isinstance(document,list) else document.get('@graph',[document]) if isinstance(document,dict) else []
            if not isinstance(nodes,list):continue
            for node in nodes[:100]:
                if not isinstance(node,dict):continue
                types=node.get('@type',[]);types=[types] if isinstance(types,str) else types
                if not isinstance(types,list) or not any(isinstance(t,str) and t.casefold() in ('organization','corporation') for t in types):continue
                name=node.get('legalName');url=canonical_url(node.get('url'))
                if not isinstance(name,str) or len(name)>200 or not url or not same_web_host(url,response['finalUrl']):continue
                if not any(legal_normalize(name)==legal_normalize(n) for n in strong_names):continue
                identifiers=node.get('identifier',[]);identifiers=[identifiers] if isinstance(identifiers,dict) else identifiers
                if isinstance(identifiers,list):
                    ciks=[str(v.get('value','')).zfill(10) for v in identifiers if isinstance(v,dict) and str(v.get('propertyID','')).casefold() in ('cik','sec cik')]
                    if ciks and any(cik!=company.get('cik') for cik in ciks):raise SourceError('OFFICIAL_SITE_CANDIDATE_STRUCTURED_CIK_CONFLICT')
                structured_owner.append({'legalName':name,'url':url})
        except (ValueError,TypeError,RecursionError):continue
    copyright_has_legal_owner=any(re.search(r'\b(?:inc|corp|co|ltd|plc|ag|llc)\b',region) for region in copyright_regions)
    if copyright_has_legal_owner and not footer_owner:
        raise SourceError('OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER')
    method = 'EXACT_JSONLD_LEGAL_OWNER_HOST_AND_CORPORATE_HEADER' if structured_owner and short_brand else 'EXACT_MULTIWORD_COPYRIGHT_OWNER_AND_CORPORATE_HEADER' if suffixless_owner else 'CORPORATE_TITLE_AND_LEGAL_COMPANY_NAME' if legal and branded else 'EXACT_LEGAL_COPYRIGHT_OWNER_AND_CORPORATE_BRAND'
    if not (legal and branded) and not (footer_owner and short_brand) and not (structured_owner and short_brand):
        raise SourceError('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED')
    return {'status': 'VALIDATED', 'url': response['finalUrl'], 'lastVerified': now, 'confidence': .95,
            'verificationVersion': 'corporate-ownership-4',
            'evidence': [candidate['evidence'], method], 'title': clean(title[1] if title else ' '.join(metadata.values), 150),
            'ownershipEvidence': {'companyNames': strong_names, 'corporateHeader': header[:300],
                                  'copyrightExcerpts': [v[:160] for v in copyright_raw if any(re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',legal_normalize(v)) for base in bases)][:2],
                                  'structuredOrganizations':structured_owner[:2]},
            'contentHash': hashlib.sha256(response['body']).hexdigest(), 'platformHint': fingerprint(response['body']),
            'irCandidates': list(dict.fromkeys(l['url'] for l in parse_links(response['body'],response['finalUrl']) if re.search(r'investor.relations|\binvestors?\b',l['text'],re.I) and not re.search(r'\.(?:pdf|zip|xml|js)(?:\?|$)',l['url'],re.I)))[:5]}
