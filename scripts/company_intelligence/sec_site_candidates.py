"""Candidate sites explicitly referenced by a current issuer's primary SEC annual.

This is discovery evidence only. The existing corporate ownership verifier must
still independently accept a site. Neither submissions nor filing bodies persist.
"""
import hashlib
import ipaddress
import re
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urlsplit
from .model import canonical_url, clean
from .site_inventory import EXCLUDED


class NoCache:
    def get(self, url): return None
    def put(self, url, payload): pass


def primary_annual(company, submissions, now):
    cik = company.get('cik')
    raw = submissions.get('cik')
    if not cik or not str(raw).isdigit() or str(raw).zfill(10) != cik:
        raise ValueError('SEC_SITE_CIK_MISMATCH')
    recent = submissions.get('filings', {}).get('recent', {})
    candidates = []
    for i, form in enumerate(recent.get('form', [])):
        if form not in ('10-K', '20-F', '40-F'): continue
        try:
            day = recent['filingDate'][i]
            age = (date.fromisoformat(now[:10]) - date.fromisoformat(day)).days
            accession, document = recent['accessionNumber'][i], recent['primaryDocument'][i]
            if not 0 <= age <= 365: continue
            if not re.fullmatch(r'\d{10}-\d{2}-\d{6}', accession): continue
            if not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:htm|html)', document) or '..' in document: continue
            candidates.append({'form': form, 'filingDate': day, 'cik': cik,
                               'url': f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace("-", "")}/{document}'})
        except (KeyError, IndexError, TypeError, ValueError): continue
    return max(candidates, key=lambda row: (row['filingDate'], row['url'])) if candidates else None


class FilingText(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.parts = []; self.length = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)
    def handle_data(self, value):
        if not self.skip and self.length < 2 * 1024 * 1024:
            value = value[:2 * 1024 * 1024 - self.length]; self.parts.append(value); self.length += len(value)


def declared_sites(body, annual, issuer_names=()):
    if len(body) > 16 * 1024 * 1024: raise ValueError('SEC_SITE_PRIMARY_DOCUMENT_TOO_LARGE')
    parser = FilingText(); parser.feed(body.decode('utf-8', 'replace'))
    text = re.sub(r'\s+', ' ', ' '.join(parser.parts))
    sites = {}
    owners = [r'our', r'the company.s', r'the corporation.s']
    for name in issuer_names:
        name = clean(name, 160)
        short = re.sub(r'\s+(?:Inc\.?|Corporation|Corp\.?|Limited|Ltd\.?|plc)$', '', name, flags=re.I)
        for owner in {name, short}:
            if len(owner) >= 3:
                owners.append(re.escape(owner) + r'[\x27\u2019]s')
    direct = r'\b(?:' + '|'.join(owners) + r')\s+(?:(?:corporate|investor relations|internet)\s+)?(?:web\s*site|internet address)\b'
    maintained = r'\bwe\s+maintain\s+an?\s+(?:internet\s+)?web\s*site\b'
    reports = (r'\bthe\s+(?:company|corporation)\s+makes?\s+available'
               r'(?:(?![.!?]).){0,400}\bits\s+(?:internet\s+)?web\s*site\b')
    label = '(?:' + direct + '|' + maintained + '|' + reports + ')'
    address = r'https?://[^\s<>"\x27]+|\b(?:www\.)?(?:[A-Za-z0-9-]+\.)+(?:com|net|org|io|co|ai|us|ca|uk|de|jp|cn)(?![A-Za-z0-9-]|\.[A-Za-z0-9])(?:/[^\s<>"\x27]*)?'
    for match in re.finditer(label, text, re.I):
        window = text[match.end():match.end() + 240]
        found = re.search(address, window, re.I)
        if not found: continue
        edge = match.end() + found.end()
        if found.end() == len(window) and edge < len(text) and not re.match(r"[\s<>\"\x27]", text[edge]):
            continue  # The evidence window must not truncate a URL into another host.
        raw = found[0].rstrip('.,);]')
        url = canonical_url(raw if raw.startswith(('http://', 'https://')) else 'https://' + raw)
        if not url: continue
        try:
            parts = urlsplit(url); host = parts.hostname or ''
            if parts.username or parts.password or parts.port not in (None, 80, 443): continue
        except ValueError: continue
        if EXCLUDED.search(host) or host in ('localhost', '') or host.endswith(('.local', '.internal', '.localhost')): continue
        try: ipaddress.ip_address(host); continue
        except ValueError: pass
        url = re.sub(r'^http:', 'https:', url)
        sites.setdefault(url, {'url': url, 'evidence': 'SEC_PRIMARY_ANNUAL_DECLARED_SITE_CANDIDATE_ONLY',
                              'sourceUrl': annual['url'], 'sourceDate': annual['filingDate'],
                              'sourceCIK': annual['cik'], 'confidence': .9,
                              'excerpt': clean(text[max(0, match.start() - 40):match.end() + found.end()], 320)})
    return [sites[url] for url in sorted(sites)][:6]


def collect(company, provider, now):
    submissions = provider.get_submissions(company['cik'], include_history=False)
    annual = primary_annual(company, submissions, now)
    if not annual: return {'status': 'NO_RECENT_PRIMARY_ANNUAL', 'candidates': []}
    body = provider.client.get_bytes(annual['url'], expected_statuses=(403, 404))
    candidates = declared_sites(body, annual, [submissions.get('name') or ''])
    return {'status': 'CANDIDATES' if candidates else 'NO_DECLARED_SITES', 'candidates': candidates,
            'annual': annual, 'bodySHA256': hashlib.sha256(body).hexdigest(), 'bytesDownloaded': len(body),
            'rawBodyPersisted': False, 'ownershipVerificationRequired': True}
