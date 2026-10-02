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
FINANCIAL = re.compile(r'\b(earnings|revenue|guidance|shares|stock|investors|quarter|dividend|buyback|acquisition|CEO|NYSE|NASDAQ|Aktie|Aktien|Umsatz|Gewinn|Dividende|Umsatzprognose|Quartalszahlen)\b', re.I)
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
        from .distribution import issuer_name
        self.distribution_index = {}
        for cid, c in companies.items():
            for name in c['names']:
                n = normalize(name)
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

    def resolve(self, item, source):
        """Query context alone never authorizes a match. Only verified first-party sources do."""
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
            if len(ids) == 1:
                matches[next(iter(ids))] = {'confidence': .98, 'evidence': ['EXPLICIT_TICKER:' + ticker]}
        candidates = {name for token in title.split() for name in self.by_token.get(token, set())}
        for name in sorted(candidates):
            ids = self.names[name]
            if len(ids) != 1 or not re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', title):
                continue
            words = name.split()
            if name in AMBIGUOUS_ALIASES:
                continue
            if len(words) == 1 and (name in AMBIGUOUS or len(name) <= 3):
                continue
            if name == 'nasdaq' and re.search(r'\bnasdaq[ -](?:100|composite|index)\b', title):
                continue
            if len(words) == 1 and not FINANCIAL.search(item.get('headline', '')):
                continue
            cid = next(iter(ids))
            if cid not in matches:
                matches[cid] = {'confidence': .92 if len(words) > 1 else .88, 'evidence': ['TITLE_NAME:' + name]}
        return [dict(companyId=cid, **v) for cid, v in sorted(matches.items())]


def issuer_results_actor(headline, company):
    """Ownership of a release does not prove whose earnings it describes."""
    title = normalize(headline)
    if re.search(r'\b(subsidiar(?:y|ies)|division|joint venture|partner)\b', title):
        return False
    aliases = {normalize(n) for n in company['names']} | {normalize(SUFFIX.sub('', n)) for n in company['names']}
    return any(name and re.match(re.escape(name) + r'\s+(?:reports?|announces?)\b', title) for name in aliases)


RULES = [
    ('Bankruptcy', 'CRITICAL', r'\b(bankruptcy|chapter 11|insolvency)\b'),
    ('Cybersecurity', 'HIGH', r'\b(data breach|ransomware|cyberattack)\b'),
    ('M&A', 'HIGH', r'\b(acquire[sd]?|acquisition|merger|takeover)\b|\bbuys?\b.{0,35}\b(franchise|franchisee|territory|business|company|assets|stake)\b'),
    ('Earnings', 'HIGH', r'\b(earnings|(?:quarter|quarterly|fiscal|financial|full.year).{0,45}results)\b'),
    ('Guidance', 'HIGH', r'\b(guidance|outlook|forecast)\b'),
    ('Management', 'HIGH', r'\b(CEO|chief executive|CFO|chief financial|resigns)\b'),
    ('Regulation', 'HIGH', r'\b(FDA|antitrust|regulatory|regulator)\b'),
    ('Litigation', 'HIGH', r'\b(lawsuit|litigation|settlement)\b'),
    ('Financing', 'HIGH', r'\b(capital raise|debt offering|public offering|stock offering|equity offering|secondary offering)\b'),
    ('Buyback', 'MEDIUM', r'\b(buyback|repurchase)\b'),
    ('Dividend', 'MEDIUM', r'\b(dividend)\b'),
    ('Investor Day', 'MEDIUM', r'\b(investor day|capital markets day|analyst day)\b'),
    ('Conference', 'LOW', r'\b(conference|shareholder meeting|annual meeting)\b'),
    ('Partnership', 'MEDIUM', r'\b(partner(?:ship|s)?|collaborat(?:ion|es))\b'),
    ('Contract', 'MEDIUM', r'\b(contract|orders|bookings)\b'),
    ('Product', 'MEDIUM', r'\b(launch|introduces|unveils)\b'),
    ('Operations', 'MEDIUM', r'\b(manufacturing|production|deliveries|restructuring)\b'),
    ('Analyst', 'LOW', r'\b(price target|upgrade|downgrade|analyst rating)\b'),
]


def classify(headline):
    hits = [(cat, imp, pattern) for cat, imp, pattern in RULES if re.search(pattern, headline, re.I)]
    if re.search(r'\b(production|deliveries|clinical|trial|study)\b', headline, re.I) and not re.search(r'financial results|earnings', headline, re.I):
        hits = [h for h in hits if h[0] != 'Earnings']
    rank = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3}
    importance = max((h[1] for h in hits), key=lambda x: rank[x], default='LOW')
    return {'categories': [h[0] for h in hits] or ['Other'], 'importance': importance,
            'classificationEvidence': [h[0] for h in hits], 'classificationVersion': 'rules-1.1.0'}


def make_item(raw, source, match, discovered):
    headline = clean(raw.get('headline'))
    url = canonical_url(raw.get('url'))
    published = timestamp(raw.get('publishedAt'))
    updated = timestamp(raw.get('updatedAt'))
    effective_time = published or updated
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
    if not published:
        item.update(observedAt=updated, timestampPrecision='SOURCE_UPDATED_TIME')
        item['provenance'][0].update(observedAt=updated, timestampPrecision='SOURCE_UPDATED_TIME')
    return item
