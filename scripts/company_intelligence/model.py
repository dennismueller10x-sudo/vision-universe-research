"""Identity, conservative entity resolution, provenance and explainable classification."""
import hashlib
import html
import json
import re
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SCHEMA = 'vu-company-intelligence-1.0.0'
AMBIGUOUS = set('apple meta unity toast root affirm block oracle target gap on all life square way car go sun march open shift match snap'.split())
AMBIGUOUS_ALIASES = {'the gap', 'match group', 'life time', 'open door', 'on holding'}
FINANCIAL = re.compile(r'\b(earnings|revenue|guidance|shares|stock|investors|quarter|dividend|buyback|acquisition|CEO|NYSE|NASDAQ|Aktie|Aktien|Umsatz|Gewinn|Dividende|Umsatzprognose|Quartalszahlen|Kursziel|Aktienkurs|Kaufempfehlung|Outperform|Underperform)\b|\bstuft\b.{0,100}\b(?:buy|hold|sell|neutral|kaufen|verkaufen|halten)\b', re.I)
SUFFIX = re.compile(r'\b(incorporated|inc|corporation|corp|limited|ltd|plc|holdings)\b\.?', re.I)
ACCESSION = re.compile(r'^\d{10}-\d{2}-\d{6}$')


def stable_id(*parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()[:24]


def clean(value, limit=500):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(value or '')))).strip()[:limit]


def normalize(value):
    return re.sub(r'[^\w]+', ' ', clean(value).casefold()).strip()


def timestamp(value):
    """Require a timezone; date-only evidence is kept separate, never silently midnight."""
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            return None
        return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except ValueError:
        return None


def canonical_url(value):
    if isinstance(value, str) and '\\' in value:
        return None
    if not isinstance(value, str) or len(value) > 8192:
        return None
    try:
        u = urlsplit(str(value))
        if u.scheme not in ('https', 'http') or not u.hostname or u.username or u.password:
            return None
        # Preserve meaningful query parameters, paths and scheme. Tracking only is removed.
        pairs = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid', 'mc_cid', 'mc_eid')]
        host = u.hostname.lower()
        if ':' in host:
            host = '[' + host + ']'
        port = u.port
        if port and (u.scheme, port) not in (('https', 443), ('http', 80)):
            host += ':' + str(port)
        return urlunsplit((u.scheme, host, u.path or '/', urlencode(sorted(pairs)), ''))
    except (ValueError, TypeError):
        return None


def domain(value):
    return urlsplit(canonical_url(value) or '').hostname or ''


def within_domain(url, root):
    host, base = domain(url), domain(root)
    return bool(base) and (host == base or host.endswith('.' + base))


def load_universe(root):
    """Consume the authoritative master. Never infer an issuer from a name."""
    companies = {}
    for path in sorted((root / 'quant/data/universe/instruments').glob('*.json')):
        for row in json.loads(path.read_text())['instruments']:
            if (row.get('active') is not True or row.get('securityType') not in ('COMMON_STOCK', 'ADR')
                    or row.get('productEligibility') not in ('ELIGIBLE', 'SEPARATE_CLASS', 'REVIEW')):
                continue
            instrument = row['instrumentId']
            if not re.fullmatch(r'vu_[a-f0-9]{14}', instrument) or not re.fullmatch(r'[A-Z0-9][A-Z0-9.-]{0,14}', row.get('symbol') or ''):
                raise ValueError('INVALID_MASTER_INSTRUMENT_IDENTITY')
            cik = row.get('cik')
            issuer = row.get('issuerId')
            if cik and (not re.fullmatch(r'\d{10}', cik) or issuer != 'iss_cik_' + cik):
                raise ValueError('MASTER_IDENTITY_MISMATCH:' + instrument)
            company_id = issuer if cik else instrument
            company = companies.setdefault(company_id, {'companyId': company_id, 'cik': cik,
                                                         'names': [], 'listings': [], 'officialSites': []})
            if row.get('companyName') and row['companyName'] not in company['names']:
                company['names'].append(row['companyName'])
            company['listings'].append({k: row.get(k) for k in ('instrumentId', 'symbol', 'exchange', 'mic', 'shareClass', 'masterMemberId', 'country', 'securityType')})
    if not companies:
        raise ValueError('AUTHORITATIVE_UNIVERSE_MISSING')
    for c in companies.values():
        c['listings'].sort(key=lambda x: (x['symbol'], x['instrumentId']))
    return companies


class Resolver:
    def __init__(self, companies):
        self.companies = companies
        self.names = {}
        self.tickers = {}
        self.by_token = {}
        self.name_prefix_issuers = {}
        self.legal_names = {}
        from .distribution import issuer_name
        self.distribution_index = {}
        for cid, c in companies.items():
            for name in c['names']:
                n = normalize(name)
                if n:
                    self.name_prefix_issuers.setdefault(n.split()[0], set()).add(cid)
                    self.legal_names.setdefault(n, set()).add(cid)
                aliases = {n, normalize(SUFFIX.sub('', re.sub(r'\bclass\s+[a-z]\b.*', '', name, flags=re.I)))}
                for alias in aliases:
                    if alias:
                        self.names.setdefault(alias, set()).add(cid)
            for listing in c['listings']:
                self.tickers.setdefault(listing['symbol'], set()).add(cid)
                for name in c['names']:
                    self.distribution_index.setdefault((issuer_name(name), listing['symbol'], listing.get('exchange')), set()).add(cid)

        for name in self.names:
            self.by_token.setdefault(name.split()[0], set()).add(name)

    def add_alias(self, cid, name):
        """Add a provenance-validated alias without rebuilding the universe index."""
        from .distribution import issuer_name
        c = self.companies[cid]
        if name in c['names']:
            return
        c['names'].append(name)
        normalized = normalize(name)
        if normalized:
            self.name_prefix_issuers.setdefault(normalized.split()[0], set()).add(cid)
            self.legal_names.setdefault(normalized, set()).add(cid)
        aliases = {normalize(name), normalize(SUFFIX.sub('', re.sub(r'\bclass\s+[a-z]\b.*', '', name, flags=re.I)))}
        for alias in aliases:
            if alias:
                self.names.setdefault(alias, set()).add(cid)
                self.by_token.setdefault(alias.split()[0], set()).add(alias)
        for listing in c['listings']:
            self.distribution_index.setdefault((issuer_name(name), listing['symbol'], listing.get('exchange')), set()).add(cid)

    def resolve(self, item, source):
        """Query context alone never authorizes a match. Only verified first-party sources do."""
        from .news_sitemap import resolve_metadata
        corroborated=resolve_metadata(item,source,self.companies)
        if corroborated is not None:return corroborated
        from .distribution import resolve as distribution_resolve
        distributed = distribution_resolve(item, source, self.distribution_index)
        if distributed is not None:
            # An issuer-specific metadata conflict must not fall back to an
            # incidental title mention of a customer, exchange or subsidiary.
            return distributed
        url = item.get('canonicalUrl') or item.get('url')
        cid = source.get('companyId')
        if source.get('verified') and cid in self.companies and source.get('type') in ('IR_FEED', 'IR_EVENTS', 'SEC'):
            if source['type'] == 'SEC' or any(within_domain(url, site) for site in source.get('allowedSites', [])):
                return [{'companyId': cid, 'confidence': 1.0, 'evidence': ['VERIFIED_FIRST_PARTY_SOURCE']}]
        # Resolve titles only; a incidental company mention in a full body is insufficient.
        title = normalize(item.get('headline'))
        matches = {}
        for ticker in re.findall(r'(?:\$|\b(?:NASDAQ|NYSE|AMEX)\s*:\s*)([A-Z][A-Z0-9.-]{0,9})\b', item.get('headline', '')):
            ids = self.tickers.get(ticker, set())
            # A cryptocurrency cashtag can collide with an equity symbol.
            if '$' + ticker in item.get('headline', '') and re.search(r'\b(?:wallets?|tokens?|crypto|blockchain|utility)\b', item.get('headline',''), re.I):
                continue
            if len(ids) == 1:
                matches[next(iter(ids))] = {'confidence': .98, 'evidence': ['EXPLICIT_TICKER:' + ticker]}
        candidates = {name for token in title.split() for name in self.by_token.get(token, set())}
        for name in sorted(candidates):
            ids = self.names[name]
            if len(ids) != 1 or not re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', title):
                continue
            spans = list(re.finditer(r'(?<!\w)' + re.escape(name) + r'(?!\w)', title))
            # A shorter alias embedded in another issuer's more specific name
            # is not a second company mention (Provident Financial Services).
            other_spans = [m.span() for longer in candidates if len(longer) > len(name) and self.names[longer] != ids
                           for m in re.finditer(r'(?<!\w)' + re.escape(longer) + r'(?!\w)', title)]
            if all(any(a <= m.start() and b >= m.end() for a,b in other_spans) for m in spans):
                continue
            words = name.split()
            if name in AMBIGUOUS_ALIASES:
                continue
            if len(words) == 1 and (name in AMBIGUOUS or len(name) <= 3):
                continue
            if name == 'nasdaq' and not re.match(r'^nasdaq\s+(?:inc|announces?|reports?|launches?|unveils?|acquires?|partners?|to hold|to report)\b', title):
                continue  # Exchange/listing references do not concern NDAQ.
            if len(words) == 1 and len(self.name_prefix_issuers.get(name, set())) > 1:
                continue  # Rogers Corp and Rogers Communications share a brand.
            if name not in self.legal_names:
                tail = title.split(name, 1)[-1].lstrip()
                if re.match(r'(?:properties|holdings|group|trust|bancorp|bank|international|technologies|software|services)\b', tail):
                    continue  # National Healthcare Properties is not NHC.
            if len(words) == 1 and not FINANCIAL.search(item.get('headline', '')):
                continue
            cid = next(iter(ids))
            if cid not in matches:
                matches[cid] = {'confidence': .92 if len(words) > 1 else .88, 'evidence': ['TITLE_NAME:' + name]}
        return [dict(companyId=cid, **v) for cid, v in sorted(matches.items())]


def issuer_results_actor(headline, company):
    """Ownership of a release does not prove whose earnings it describes."""
    title = normalize(headline)
    if re.search(r'\b(subsidiar(?:y|ies)|division|joint venture|partner|board meeting|board approval|to consider|to approve|to review)\b', title):
        return False
    aliases = {normalize(n) for n in company['names']} | {normalize(SUFFIX.sub('', n)) for n in company['names']}
    return any(name and re.match(re.escape(name) + r'\s+(?:reports?|announces?)\b', title) for name in aliases)


def financial_release_evidence(headline, snippet):
    if re.search(r'financial(?: and operating)? results|earnings', headline, re.I):
        return ['EXPLICIT_FINANCIAL_RELEASE_TITLE']
    # An official quarter-results title may omit "financial". Require two
    # distinct reported metric families, rather than generic results text.
    evidence = clean(snippet, 2000)
    if re.search(r'\b(will|expects?|expected|forecast|guidance|outlook|projected)\b', evidence, re.I):
        return []
    families = [label for label, pattern in (
        ('REVENUE', r'\b(?:revenue|sales)\b.{0,35}\d'),
        ('NET_INCOME', r'\bnet (?:income|earnings|loss)\b.{0,35}\d'),
        ('EPS', r'\b(?:earnings per share|eps)\b.{0,35}\d'),
    ) if re.search(pattern, evidence, re.I)]
    return ['REPORTED_FINANCIAL_METRICS_IN_SOURCE_SNIPPET', *families] if len(families) >= 2 else []


def issuer_earnings_announcement(headline, company):
    """An issuer-owned page can announce another entity's reporting date."""
    def legal_normalize(value):
        value = normalize(value)
        for word, short in [('corporation', 'corp'), ('incorporated', 'inc'), ('limited', 'ltd'), ('company', 'co')]:
            value = re.sub(r'\b' + word + r'\b', short, value)
        return re.sub(r'^the\s+', '', value)
    title = legal_normalize(headline)
    # Official platforms use '4th Quarter FY26' and '2026 Q2'. Normalize
    # explicit period prefixes without removing a following issuer's name.
    title = re.sub(r'\b(1st|2nd|3rd|4th)\s+quarter\b', lambda m: {'1st':'first','2nd':'second','3rd':'third','4th':'fourth'}[m[1]] + ' quarter', title)
    title = re.sub(r'\bfy\s?(\d{2})\b', lambda m: 'fy20' + m[1], title)
    title = re.sub(r'^(20\d{2})\s+(q[1-4])\b', lambda m: m[2] + ' ' + m[1], title)
    if re.search(r'\b(subsidiar(?:y|ies)|division|joint venture|partner|board meeting|board approval|to consider|to approve|to review)\b', title):
        return False
    lead = r'^(?:q[1-4]|[1-4]q(?:20\d{2}|\d{2})|first|second|third|fourth|quarterly|fiscal|annual|full year)(?:\s+(?:quarter|fiscal|year|fy|fy20\d{2}|20\d{2}|\d{2})){0,6}\s+'
    titles = {title, re.sub(r'^the\s+', '', re.sub(lead, '', title))}
    aliases = {legal_normalize(n) for n in company['names']} | {legal_normalize(SUFFIX.sub('', n)) for n in company['names']}
    action = r'(?:reports?|announces?|releases?|will|to|sets?|schedules?|holds?|hosts?|confirms?|q[1-4]|first|second|third|fourth|quarterly|fiscal|annual|earnings|financial)\b'
    # Issuer platforms commonly advertise "Q3 2026 Results" without the
    # word financial. Require a pure explicit-quarter title; a named company,
    # operating/clinical qualifier or ambiguous generic results title fails.
    if re.fullmatch(r'q[1-4](?:\s+(?:fy20\d{2}|20\d{2}))?\s+results(?:\s+(?:earnings|conference|call|webcast|release|announcement|presentation|date))*', title):
        return True
    for candidate in titles:
        # Pure financial/event titles are safe on a validated issuer source.
        # A fiscal prefix followed by another named company is not generic.
        if re.fullmatch(r'(?:earnings|financial results)(?:\s+(?:conference|call|webcast|release|results|announcement|presentation|date|for|q[1-4]|fy|fy20\d{2}|20\d{2}|first|second|third|fourth|quarter|fiscal|year))*', candidate):
            return True
        for name in aliases:
            if name and re.match(re.escape(name) + r'\s+(?:s\s+)?' + action, candidate):
                return True
    return False


RULES = [
    ('Bankruptcy', 'CRITICAL', r'\b(bankruptcy|chapter 11|insolvency)\b'),
    ('Cybersecurity', 'HIGH', r'\b(data breach|ransomware|cyberattack)\b'),
    ('M&A', 'HIGH', r'\b(acquire[sd]?|acquisition|merger|takeover)\b|\bbuys?\b.{0,35}\b(franchise|franchisee|territory|business|company|assets|stake)\b'),
    ('Earnings', 'HIGH', r'\b(earnings|(?:quarter|quarterly|fiscal|financial|full.year).{0,45}results)\b'),
    ('Guidance', 'HIGH', r'\b(guidance|outlook|forecast)\b'),
    ('Management', 'HIGH', r'\b(CEO|chief executive|CFO|chief financial|resigns)\b'),
    ('Regulation', 'HIGH', r'\b(FDA|antitrust|regulatory|regulator|European Medicines Agency|marketing authori[sz]ation (?:application|approval)|new drug application|biologics licen[cs]e application)\b'),
    ('Litigation', 'HIGH', r'\b(lawsuit|litigation|settlement)\b'),
    ('Financing', 'HIGH', r'\b(capital raise|debt offering|public offering|stock offering|equity offering|secondary offering|registered direct offering)\b'),
    ('Buyback', 'MEDIUM', r'\b(buyback|repurchase)\b'),
    ('Dividend', 'MEDIUM', r'\b(dividend)\b'),
    ('Investor Day', 'MEDIUM', r'\b(investor day|capital markets day|analyst day)\b'),
    ('Conference', 'LOW', r'\b(conference|shareholder meeting|annual meeting)\b'),
    ('Partnership', 'MEDIUM', r'\b(partner(?:ship|s)?|collaborat(?:ion|es))\b'),
    ('Contract', 'MEDIUM', r'\b(contract|orders|bookings)\b'),
    ('Product', 'MEDIUM', r'\b(launch|introduces|unveils)\b'),
    ('Operations', 'MEDIUM', r'\b(manufacturing|production|deliveries|vehicle delivery results|operating results|operational results|phase[ -]?[123]|restructuring)\b'),
    ('Analyst', 'LOW', r'\b(price target|upgrade|downgrade|analyst rating)\b'),
]


def classify(headline):
    hits = [(cat, imp, pattern) for cat, imp, pattern in RULES if re.search(pattern, headline, re.I)]
    if re.search(r'\b(production|deliveries|vehicle delivery results|operating results|operational results|phase[ -]?[123]|clinical|trial|study)\b', headline, re.I) and not re.search(r'financial results|earnings', headline, re.I):
        hits = [h for h in hits if h[0] != 'Earnings']
    rank = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3}
    importance = max((h[1] for h in hits), key=lambda x: rank[x], default='LOW')
    return {'categories': [h[0] for h in hits] or ['Other'], 'importance': importance,
            'classificationEvidence': [h[0] for h in hits], 'classificationVersion': 'rules-1.3.1'}


def make_item(raw, source, match, discovered):
    headline = clean(raw.get('headline'))
    url = canonical_url(raw.get('url'))
    published = timestamp(raw.get('publishedAt'))
    updated = timestamp(raw.get('updatedAt'))
    publication_day = raw.get('publishedDate')
    if publication_day is not None:
        from .earnings import valid_date
        if not valid_date(publication_day):
            raise ValueError('INVALID_PUBLICATION_DATE')
    # Internal ordering may use a day boundary; public output never gains a clock.
    effective_time = published or (publication_day + 'T00:00:00Z' if publication_day else updated)
    if not headline or not url or not effective_time or effective_time > discovered:
        raise ValueError('INVALID_NEWS_EVIDENCE')
    evidence = {'discoverySource': source['type'], 'sourceId': source['sourceId'],
                'discoveryUrl': source['url'], 'originalSource': raw.get('publisher') or domain(url),
                'originalUrl': url, 'publishedAt': published, 'discoveredAt': discovered,
                'match': match, 'headline': headline}
    if source.get('provider') == 'GLOBENEWSWIRE_RSS':
        evidence.update(originalSource=(raw.get('distributionMetadata') or {}).get('contributor') or domain(url),
                        distributor='GlobeNewswire', issuerMetadata=raw.get('distributionMetadata'))
    item = {'newsId': stable_id(match['companyId'], url, headline, published),
            'companyId': match['companyId'], 'headline': headline, 'canonicalUrl': url,
            'publishedAt': published, 'discoveredAt': discovered, 'language': raw.get('language'),
            'summary': None, 'confidence': match['confidence'], 'sourceConfidence': 1.0 if source.get('verified') else .7, 'eventType': 'NEWS',
            'provenance': [evidence], **classify(headline)}
    if publication_day and not published:
        item.update(publishedDate=publication_day, date=publication_day, timestampPrecision='DATE_ONLY')
        item['provenance'][0].update(publishedDate=publication_day, timestampPrecision='DATE_ONLY')
    elif not published:
        item.update(observedAt=updated, timestampPrecision='SOURCE_UPDATED_TIME')
        item['provenance'][0].update(observedAt=updated, timestampPrecision='SOURCE_UPDATED_TIME')
    return item
