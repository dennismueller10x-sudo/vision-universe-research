"""Batch official-site candidates from Wikidata CC0 using exact authoritative SEC CIK."""
import json
from urllib.parse import urlencode, urlsplit
from .model import canonical_url, domain
from .transport import SourceError

OWNERSHIP_VERSION = 'corporate-ownership-10'
CORPORATE_HEADER_EVIDENCE_VERSION = 'corporate-header-1'
OVERSIZED_IR_RECOVERY_VERSION = 'owned-ir-after-size-limit-1'


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


def linked_corporate_host(url, root):
    """Scope advertised ownership routes under a corporate www alias only.

    Conventional IR siblings of www.issuer.com are allowed only when advertised.
    Other prefixes and hosting tenants stay intact; general ingestion trust stays
    unchanged. The caller also requires a corroborating corporate root header.
    """
    from .model import within_domain
    host=domain(root)
    base=host.removeprefix('www.')
    if base in ('co.uk','com.au','co.jp','com.br','com.cn'):
        return same_web_host(url,root)
    return (within_domain(url,root) or same_web_host(url,root) or
            host.startswith('www.') and domain(url) in {prefix+'.'+base for prefix in ('ir','investor','investors','investing')})


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
            if (not linked_corporate_host(url, response['finalUrl'])
                    or url == response['finalUrl'] or re.search(r'\.(?:pdf|zip|xml|js)(?:\?|$)', url, re.I)):
                continue
            sibling = not (within_domain(url, response['finalUrl']) or same_web_host(url, response['finalUrl']))
            if sibling and not (getattr(original,'ownershipEvidence',{}).get('headerBranded') or getattr(original,'ownershipEvidence',{}).get('shortBrand')):
                continue
            if re.search(r'\bprivacy(?: policy| notice)?\b|\blegal\b', label): priority = 0
            elif re.search(r'\binvestors?\b|investor relations', label): priority = 1
            elif re.search(r'\babout(?: us| the company)?\b', label): priority = 2
            else: continue
            routes[url] = min(priority, routes.get(url, priority))
        result = None
        temporary_routes = []
        ordered = sorted(routes, key=lambda url: (routes[url], url))
        # Spend the same two-page allowance on different evidence families
        # before consuming two navigation variants of one family. Legal pages
        # often name the issuer precisely where corporate/IR branding does not.
        first_per_family = list(dict.fromkeys(next(url for url in ordered if routes[url] == family)
                                             for family in sorted(set(routes.values()))))
        selected_routes = (first_per_family + [url for url in ordered if url not in first_per_family])[:2]
        for url in selected_routes:
            try:
                legal_response = http.get(url, ttl=86400)
                if not linked_corporate_host(legal_response['finalUrl'], response['finalUrl']):
                    continue
                legal_target={**target,'url':legal_response['finalUrl']}
                try:
                    proof = _validate_response(company, legal_target, legal_response, now)
                    header_source=legal_response['finalUrl']
                except SourceError as route_error:
                    if 'CONFLICTING_COPYRIGHT_OWNER' in str(route_error) or 'STRUCTURED_CIK_CONFLICT' in str(route_error):raise
                    if 'OWNER_NOT_VALIDATED' not in str(route_error): continue
                    proof = _validate_response(company, legal_target, legal_response, now, header_body=response['body'])
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
                if 'CONFLICTING_COPYRIGHT_OWNER' in str(route_error) or 'STRUCTURED_CIK_CONFLICT' in str(route_error):raise
                if any(code in str(route_error) for code in ('HTTP_429','HTTP_50','DNS_UNAVAILABLE','NETWORK_UNAVAILABLE','NETWORK_TIMEOUT','RATE_LIMIT')):
                    temporary_routes.append({'url':url,'reason':str(route_error)[:150]})
                continue
        if result is None:
            if temporary_routes:
                error=SourceError('OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:'+temporary_routes[0]['reason'])
                error.ownershipEvidence={**getattr(original,'ownershipEvidence',{}),'temporaryOwnershipRoutes':temporary_routes}
                raise error from original
            if redirected: raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED') from original
            raise original
    if redirected:
        result['redirectEvidence'] = {'fromUrl': candidate['url'], 'redirects': response.get('redirects', []),
                                      'finalUrl': response['finalUrl'], 'method': 'INDEPENDENT_DESTINATION_LEGAL_OWNER_VERIFICATION'}
        result['evidence'].append('INDEPENDENTLY_VERIFIED_REDIRECT_DESTINATION')
    return result


def validate_discovery_candidate(company, candidate, http, now):
    try:
        return validate_candidate(company, candidate, http, now, recover_redirects=True)
    except SourceError as original:
        if str(original) == 'SOURCE_TOO_LARGE':
            return _recover_oversized_root_ir(company, candidate, http, now, original)
        # A missing DNS record for one conventional host spelling does not
        # establish that the company site is dead. Never use this route to
        # work around robots/access denials or shared proxy failures.
        if str(original) not in ('DNS_UNAVAILABLE','ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE'):
            raise
        parts=urlsplit(candidate['url']);host=parts.hostname or ''
        if '.' not in host or ':' in host or host.replace('.','').isdigit():raise
        alternate=host[4:] if host.startswith('www.') else 'www.'+host
        netloc=alternate+(':'+str(parts.port) if parts.port else '')
        route=parts._replace(scheme='https',netloc=netloc).geturl()
        verified=validate_candidate(company,{**candidate,'url':route},http,now,recover_redirects=True)
        verified['ownershipEvidence']['transportRecovery']={'originalCandidateURL':candidate['url'],
            'alternateURL':route,'primaryFailure':str(original),'scope':'CONVENTIONAL_WWW_HOST_ALIAS'}
        verified['evidence'].append('INDEPENDENTLY_VERIFIED_WWW_ALIAS_AFTER_DNS_FAILURE')
        return verified


def _recover_oversized_root_ir(company, candidate, http, now, original):
    """Verify a small IR page independently; never authorize the unread root.

    Only an actual corporate HTML size failure enters this route. Each request
    retains normal robots, size, pacing and shared-budget enforcement.
    """
    import re
    from .feeds import parse_links
    from .transport import BudgetExhausted
    parts = urlsplit(candidate['url'])
    host = parts.hostname or ''
    base = host.removeprefix('www.')
    if (parts.path not in ('', '/') or parts.query or parts.port or '.' not in base
            or ':' in base or base.replace('.', '').isdigit()
            or base in ('co.uk', 'com.au', 'co.jp', 'com.br', 'com.cn')):
        raise original
    attempts = []
    temporary = []
    for prefix in ('investors', 'investor', 'ir'):
        route = 'https://' + prefix + '.' + base + '/'
        try:
            proof = validate_candidate(company, {**candidate, 'url': route}, http, now,
                                       recover_redirects=True)
            response = http.get(proof['url'], ttl=86400)
            import hashlib
            if (response['finalUrl'] != proof['url'] or
                    hashlib.sha256(response['body']).hexdigest() != proof['contentHash']):
                raise SourceError('OWNERSHIP_RECOVERY_EVIDENCE_CHANGED')
            links = parse_links(response['body'], response['finalUrl'])
            backlinks = sorted({link['url'] for link in links
                                if same_web_host(link['url'], candidate['url'])})
            body = response['body'].decode('utf-8', 'replace')
            # Text evidence, not the guessed hostname, establishes IR context.
            visible = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', body,
                             flags=re.I | re.S)
            visible = re.sub(r'<[^>]+>', ' ', visible)
            if not backlinks or not re.search(r'\binvestor(?:s| relations)?\b', visible, re.I):
                attempts.append({'url': route, 'reason': 'OWNED_ROUTE_WITHOUT_IR_CONTEXT_OR_CORPORATE_BACKLINK'})
                continue
            proof['ownershipEvidence']['transportRecovery'] = {
                'originalCandidateURL': candidate['url'], 'alternateURL': proof['url'],
                'primaryFailure': str(original), 'corporateBacklinks': backlinks,
                'scope': 'INDEPENDENTLY_OWNED_IR_WITH_CORPORATE_BACKLINK',
                'version': OVERSIZED_IR_RECOVERY_VERSION, 'alternateIRAttempts': attempts}
            proof['evidence'].append('INDEPENDENTLY_VERIFIED_IR_AFTER_CORPORATE_SIZE_LIMIT')
            return proof
        except SourceError as error:
            if isinstance(error, BudgetExhausted):
                error.ownershipEvidence = {**getattr(error, 'ownershipEvidence', {}),
                                           'originalCandidateURL': candidate['url'],
                                           'primaryFailure': str(original),
                                           'alternateIRAttempts': attempts + [{'url': route, 'reason': str(error)}],
                                           'oversizedIRRecoveryVersion': OVERSIZED_IR_RECOVERY_VERSION}
                raise
            attempts.append({'url': route, 'reason': str(error)[:150],
                             'ownershipEvidence': getattr(error, 'ownershipEvidence', {})})
            if any(code in str(error) for code in ('CONFLICTING_COPYRIGHT_OWNER', 'STRUCTURED_CIK_CONFLICT')):
                error.ownershipEvidence = {**getattr(error, 'ownershipEvidence', {}),
                                           'alternateIRAttempts': attempts,
                                           'originalCandidateURL': candidate['url']}
                raise
            if any(code in str(error) for code in ('HTTP_429', 'HTTP_50', 'DNS_UNAVAILABLE',
                                                  'NETWORK_UNAVAILABLE', 'NETWORK_TIMEOUT', 'RATE_LIMIT', 'CIRCUIT_OPEN')):
                temporary.append(str(error))
    error = SourceError('OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:' + temporary[0]) if temporary else original
    error.ownershipEvidence = {**getattr(original, 'ownershipEvidence', {}),
                               'originalCandidateURL': candidate['url'],
                               'alternateIRAttempts': attempts,
                               'oversizedIRRecoveryVersion': OVERSIZED_IR_RECOVERY_VERSION}
    if error is original:
        raise original
    raise error from original


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
    from urllib.parse import urljoin, urlsplit
    class CorporateHeader(HTMLParser):
        def __init__(self):
            super().__init__()
            self.values=[]
            self.home_anchor=False
        def handle_starttag(self,tag,attrs):
            attrs=dict(attrs)
            if tag=='a':
                target=canonical_url(urljoin(response['finalUrl'],attrs.get('href') or ''))
                self.home_anchor=bool(attrs.get('href') and not attrs['href'].startswith('#') and target and not urlsplit(target).query and same_web_host(target,response['finalUrl']) and
                    re.fullmatch(r'/(?:[a-z]{2}(?:-[a-z]{2})?/?|index\.html?|overview/default\.aspx)?',urlsplit(target).path,re.I))
            if tag=='img' and self.home_anchor and re.search(r'logo|brand',' '.join(attrs.get(k) or '' for k in ('src','class','id')),re.I):
                self.values.append(clean(attrs.get('alt'),200))
            if tag=='meta' and (attrs.get('property') or attrs.get('name') or '').casefold() in ('og:site_name','og:title','application-name'):
                self.values.append(clean(attrs.get('content'),200))
        def handle_endtag(self,tag):
            if tag=='a':self.home_anchor=False
    metadata=CorporateHeader();metadata.values=[];metadata.feed(header_body)
    header=normalize(' '.join([header]+metadata.values))
    def legal_normalize(value):
        value = re.sub(r'[/\\][A-Z]{2,3}[/\\]?$', '', str(value), flags=re.I)
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
    # A complete legal title uses the same Co./Company normalization as body
    # proof. Match entire title/meta segments, never prefixes of another owner.
    title_segments={legal_normalize(part) for value in ([title[1]] if title else [])+metadata.values
                    for part in re.split(r'\s*[|]\s*|\s+[-–—]\s+',clean(value,300))}
    legal_title=any(legal_normalize(name) in title_segments for name in strong_names)
    branded = legal_title or any(re.search(r'(?<!\w)' + re.escape(normalize(SUFFIX.sub('', n))) + r'(?!\w)', header) for n in company['names'] if normalize(SUFFIX.sub('', n)))
    # Many public-company titles use a short brand (Meta, H&P, Frost),
    # while the copyright footer discloses the precise parent/legal owner.
    # A customer mention in the page body is not this ownership evidence.
    # Preserve a boundary before explicitly labelled footer navigation. Merely
    # finding "Contact Us" in flattened prose must not truncate a legal owner.
    provider_credits = []
    def separate_provider_credit(match):
        node = match[0]
        if len(node) > 2048 or 'powered' not in node.casefold(): return node
        links = parse_links(node.encode(), response['finalUrl'])
        if len(links) != 1: return node
        link = links[0]
        from urllib.parse import urlsplit
        parts = urlsplit(link['url'])
        if (parts.hostname not in ('q4inc.com', 'www.q4inc.com') or
                parts.path.casefold().rstrip('/') != '/powered-by-q4' or
                not re.fullmatch(r'(?:©\s*)?Powered By Q4 Inc\.?(?:\s+\d+(?:\.\d+){1,5})?(?:\s+\(opens in new window\))?', link['text'], re.I)):
            return node
        provider_credits.append({'url': link['url'], 'label': link['text']})
        return ' | '
    # An exact linked vendor credit is separate from the copyright owner.
    # Unlinked prose, unrelated hosts and different legal-owner prefixes stay.
    footer_body = re.sub(r'<a\b[^>]*>.*?</a\s*>', separate_provider_credit, visible_body, flags=re.I | re.S)
    footer_body = re.sub(r'<a\b[^>]*>\s*(?:contact us|privacy(?: policy)?|terms(?: of use)?)\s*</a\s*>',
                         ' | ', footer_body, flags=re.I)
    copyright_text = re.sub(r'<[^>]*>', ' ', footer_body)
    copyright_raw = [clean(m[0],300) for m in re.finditer(r'(?:©|&copy;|copyright).{0,300}', copyright_text, re.I | re.S)]
    # Ownership begins immediately after the copyright marker/year. A partner
    # mentioned later in the footer is not the copyright owner.
    def owner_text(value):
        for _ in range(20):
            stripped=re.sub(r'^\s*(?:copyright|©|&copy;|&nbsp;|\(c\)|all rights reserved\b(?:\s+by\b)?|\d{4}|\{\{year\}\}|[-–—|,:.])\s*','',value, count=1, flags=re.I)
            if stripped==value:break
            value=stripped
        return value
    owner_raw=[owner_text(value) for value in copyright_raw]
    # "Copyright 2014-2026 By Legal Owner" explicitly attributes ownership.
    # Preserve the original too: By may itself begin an actual company name.
    # Remove one leading attribution token only; the same exact legal-owner,
    # suffix/extension and corporate-header checks apply to both readings.
    owner_raw += [re.sub(r'^by\b\s+', '', raw, count=1, flags=re.I)
                  for raw in owner_raw if re.match(r'^by\b\s+', raw, re.I)]
    copyright_regions = [legal_normalize(value) for value in owner_raw]
    def exact_footer_owner(name, raw, suffixless=False):
        wanted=legal_normalize(name)
        if not wanted:return False
        words=list(re.finditer(r'\w+',raw))[:16]
        for word in words:
            if legal_normalize(raw[:word.end()])!=wanted:continue
            tail=raw[word.end():]
            normalized_tail=legal_normalize(tail)
            # A year alone is insufficient to delimit a suffixless owner when
            # arbitrary words follow it. Keep the previous strict boundary.
            if suffixless and re.match(r'\s*(?:19|20)\d{2}\b',tail):
                if not re.match(r'\s*(?:19|20)\d{2}\s*(?:[.,;|()]|all rights\b|privacy\b|terms\b|cookies\b|$)',tail,re.I):
                    return False
            if re.match(r'(?:services|systems|llc|ltd|corp|inc|plc)\b',normalized_tail):return False
            # A period in Inc./Corp. does not end an extended legal owner
            # such as "Root Inc. Japan LLC". Inspect the entire retained
            # 300-character region, including longer subsidiary names.
            # Stop only at hard separators;
            # standard rights/navigation text is not an owner extension.
            extension = re.split(r'[;|()©]|\b(?:all rights reserved|(?:are|is) (?:registered )?trademarks? of)\b',
                                 tail, maxsplit=1, flags=re.I)[0]
            # A named legal notice can repeat the same copyright owner after
            # its address. It is a boundary only for this explicit grammar and
            # the exact same legal entity; extended or different owners remain.
            notice = re.search(r'\bUnless otherwise specified,\s+all product names appearing in this internet site\s+'
                               r'are trademarks owned by(?: or licensed to)?\s+([^,;|()©]{1,100}),', extension, re.I)
            if notice and not suffixless and legal_normalize(notice[1]) == wanted:
                extension = extension[:notice.start()]
            extension = legal_normalize(extension)
            if ((suffixless or not re.match(r'(?:all rights|privacy|terms|cookies)\b', extension)) and
                    re.match(r'(?:\w+\s+)*(?:llc|ltd|corp|inc|plc)\b', extension)):
                return False
            return bool(re.match(r'\s*(?:[.,;|()–—-]|all rights\b|privacy\b|terms\b|cookies\b|(?:19|20)\d{2}\b|©|&copy;|$)',tail,re.I))
        return False
    footer_owner = any(exact_footer_owner(name,raw) for name in strong_names for raw in owner_raw)
    # Corporate footers commonly omit Inc./Corp. Require the complete multiword
    # issuer name, a copyright ownership boundary, and corroborating header.
    # A prefix of another legal owner or a generic single word is insufficient.
    bases={normalize(SUFFIX.sub('',re.sub(r'[/\\][A-Z]{2,3}[/\\]?$','',n,flags=re.I))) for n in strong_names}
    # Use the same complete-owner boundary/extension checks for suffixless
    # multiword names. Raw punctuation (&, apostrophes) must not defeat the
    # exact legal normalization already used for suffixed copyright owners.
    suffixless_owner=any(len(base.split())>=2 and re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',header)
                        and any(exact_footer_owner(base,raw,suffixless=True) for raw in owner_raw)
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
    # Actual issuer names can begin with a three-letter brand (PPG, ABM,
    # ICF). It is corroboration only when the complete legal footer matches.
    # Tickers and arbitrary short words never supply this evidence.
    explicit_brands={n.split()[0] for n in company['names'] if n.split() and
                     re.fullmatch(r'[A-Z]{2,3}',n.split()[0]) and n.split()[0].casefold() not in stop|legal_suffixes}
    short_brand = short_brand or bool(footer_owner and any(re.search(r'(?<!\w)'+r'\s*'.join(re.escape(c) for c in brand.lower())+r'(?!\w)',header) for brand in explicit_brands))
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
        error=SourceError('OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER')
        error.ownershipEvidence={'sourceUrl':response['finalUrl'],'contentHash':hashlib.sha256(response['body']).hexdigest(),
                                 'corporateHeader':header[:300],'legalNameVisible':legal,'headerBranded':branded,
                                 'shortBrand':short_brand,'footerOwnerMatched':footer_owner,
                                 'copyrightExcerpts':[v[:160] for v in copyright_raw[:3]],
                                 'structuredOwnerMatched':bool(structured_owner)}
        raise error
    method = 'EXACT_JSONLD_LEGAL_OWNER_HOST_AND_CORPORATE_HEADER' if structured_owner and short_brand else 'EXACT_MULTIWORD_COPYRIGHT_OWNER_AND_CORPORATE_HEADER' if suffixless_owner else 'CORPORATE_TITLE_AND_LEGAL_COMPANY_NAME' if legal and branded else 'EXACT_LEGAL_COPYRIGHT_OWNER_AND_CORPORATE_BRAND'
    if not (legal and branded) and not (footer_owner and short_brand) and not (structured_owner and short_brand):
        error=SourceError('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED')
        error.ownershipEvidence={'sourceUrl':response['finalUrl'],'contentHash':hashlib.sha256(response['body']).hexdigest(),
                                 'corporateHeader':header[:300],'legalNameVisible':legal,'headerBranded':branded,
                                 'shortBrand':short_brand,'footerOwnerMatched':footer_owner,
                                 'copyrightExcerpts':[v[:160] for v in copyright_raw[:3]],
                                 'structuredOwnerMatched':bool(structured_owner)}
        raise error
    return {'status': 'VALIDATED', 'url': response['finalUrl'], 'lastVerified': now, 'confidence': .95,
            'verificationVersion': OWNERSHIP_VERSION,
            'evidence': [candidate['evidence'], method], 'title': clean(title[1] if title else ' '.join(metadata.values), 150),
            'ownershipEvidence': {'companyNames': strong_names, 'corporateHeader': header[:300],
                                  'copyrightExcerpts': [v[:160] for v in copyright_raw if any(re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',legal_normalize(v)) for base in bases)][:2],
                                  'structuredOrganizations':structured_owner[:2], 'excludedProviderCredits':provider_credits[:2]},
            'contentHash': hashlib.sha256(response['body']).hexdigest(), 'platformHint': fingerprint(response['body']),
            'irCandidates': list(dict.fromkeys(l['url'] for l in parse_links(response['body'],response['finalUrl']) if re.search(r'investor.relations|\binvestors?\b',l['text'],re.I) and not re.search(r'\.(?:pdf|zip|xml|js)(?:\?|$)',l['url'],re.I)))[:5]}
