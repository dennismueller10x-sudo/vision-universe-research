"""Optional bounded SEC primary/exhibit inspection through the existing fair-access client."""
import re
from html.parser import HTMLParser
from urllib.parse import urljoin
from .model import clean, canonical_url
from .earnings import filing_url

PARSER_VERSION = 'sec-documents-1.4.0'
# 1.3 adds enrichment/period grammar; 1.2 classification proof remains valid.
CLASSIFICATION_COMPATIBLE = {PARSER_VERSION, 'sec-documents-1.3.1', 'sec-documents-1.3.0', 'sec-documents-1.2.0'}

class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.ignored, self.current = [], [], 0, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'):
            self.ignored += 1
        if tag == 'a' and a.get('href'):
            self.current = {'href': a['href'], 'label': ''}
            self.links.append(self.current)
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'tr'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignored = max(0, self.ignored - 1)
        if tag == 'a':
            self.current = None
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'tr', 'td'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)
            if self.current:
                self.current['label'] += data


def release_period(text):
    # Explicit company fiscal labels only. Never derive quarters from calendar months.
    text = re.sub(r'(?<=\w)[-–](?=\w)', ' ', text)
    text = re.sub(r'\b([1-4])Q\b', lambda m: 'Q' + m[1], text, flags=re.I)
    # Observed official event labels: '4th Quarter FY26'. Only an explicit
    # FY marker permits expansion; a bare two-digit year is ambiguous.
    text = re.sub(r'\bFY\s?(\d{2})\b', lambda m: 'FY 20' + m[1], text, flags=re.I)
    text = re.sub(r'\b(1st|2nd|3rd|4th)\s+quarter\b', lambda m: {'1st':'first','2nd':'second','3rd':'third','4th':'fourth'}[m[1].lower()] + ' quarter', text, flags=re.I)
    after = re.search(r'\b(first|second|third|fourth|Q[1-4])\s+(?:fiscal\s+)?(?:quarter\s+)?(?:(?:of|fiscal(?:\s+year)?|FY)\s*){0,2}(20\d{2})\b', text, re.I)
    before = re.search(r'\b(?:fiscal(?:\s+year)?\s+)?(20\d{2})\s+(first|second|third|fourth|Q[1-4])(?:\s+quarter)?\b', text, re.I)
    match = after or before
    if not match:
        return None
    q, year = (match[1], match[2]) if after else (match[2], match[1])
    quarter = q.upper() if q.upper().startswith('Q') else 'Q' + str({'first': 1, 'second': 2, 'third': 3, 'fourth': 4}[q.lower()])
    return {'fiscalQuarter': quarter, 'fiscalYear': int(year)}


def inspect_html(payload, url):
    if len(payload) > 2 * 1024 * 1024:
        raise ValueError('SEC_DOCUMENT_TOO_LARGE')
    doc = Document()
    doc.feed(payload.decode('utf-8', 'replace'))
    text = clean(''.join(doc.parts), 200000)
    # Ignore generic form template headings such as "Results of Operations and Financial Condition".
    matches = list(re.finditer(r'(?:announced|reported|released|reports|announces|announcing|reporting)[^.]{0,160}(?:financial\s+results|earnings|quarter[^.]{0,35}results)', text, re.I))
    evidence = next((m for m in matches if not re.search(r'\b(will|plans to|expects to|scheduled to|meeting|considering|approving)\b', text[max(0, m.start() - 50):m.end()], re.I)
                     and not (re.search(r'\b(production|deliveries|clinical|trial|study)\b', m[0], re.I) and not re.search(r'financial results|earnings', m[0], re.I))), None)
    operating = re.search(r'\b(production and deliver(?:y|ies)|vehicle deliveries|monthly deliveries|production results|delivery results)\b', text, re.I)
    outcome = 'EARNINGS_RELEASE' if evidence else 'OPERATING_RESULTS' if operating else 'UNVERIFIED'
    snippet = text[max(0, evidence.start() - 80):evidence.end() + 100] if evidence else None
    period = release_period(snippet or '')
    if outcome == 'EARNINGS_RELEASE' and not period:
        # Prefer the beginning of a release, where the company identifies the period, over comparisons later.
        period = release_period(text[:1500])
    exhibits, materials = [], []
    base = url.rsplit('/', 1)[0] + '/'
    for link in doc.links:
        candidate = canonical_url(urljoin(url, link['href']))
        if candidate and candidate.startswith(base):
            kind = 'PRESENTATION' if re.search(r'presentation|earnings slides|earnings deck', link['label'], re.I) else 'COMPANY_TRANSCRIPT' if re.search(r'\btranscript\b', link['label'], re.I) else 'PREPARED_REMARKS' if re.search(r'prepared remarks|earnings script', link['label'], re.I) else 'SHAREHOLDER_LETTER' if re.search(r'shareholder letter|letter to shareholders', link['label'], re.I) else None
            if kind and candidate.endswith(('.pdf', '.htm', '.html', '.txt')):
                materials.append({'type': kind, 'url': candidate, 'label': clean(link['label'],200), 'sourceUrl':url, 'evidence':'EXPLICIT_SEC_DOCUMENT_LINK_LABEL'})
        if candidate and candidate.startswith(base) and re.search(r'(?:ex(?:hibit)?[-_]?99|99[-_.]?1|earnings|release)', candidate + ' ' + link['label'], re.I) and candidate.endswith(('.htm', '.html', '.txt')):
            if candidate not in exhibits:
                exhibits.append(candidate)
    period_end = None
    ended = re.search(r'(?:quarter|year|three months|six months|nine months)\s+ended\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d{2})', snippet or '', re.I)
    if ended:
        from .ir_events import MONTHS
        from datetime import date
        try:
            period_end = date(int(ended[3]), MONTHS[ended[1].lower()], int(ended[2])).isoformat()
        except (ValueError, KeyError):
            pass
    from .enrichment import kpis, guidance
    return {'periodEnd': period_end, 'parserVersion': PARSER_VERSION, 'outcome': outcome, 'period': period, 'evidence': snippet[:500] if snippet else None, 'sourceUrl': url, 'exhibits': exhibits[:2],
            'sourceDocuments': list({d['url']:d for d in materials}.values())[:20],
            'companyKPIs': kpis(text, url, period) if outcome in ('EARNINGS_RELEASE', 'OPERATING_RESULTS') else [],
            'guidance': guidance(text, url) if outcome == 'EARNINGS_RELEASE' else []}


def enrich_submissions(submissions, cik, client, now, budget=60, max_filings=2, previous=None):
    """At most two candidate filings and one linked exhibit each; cache reuse is automatic."""
    recent = submissions.get('filings', {}).get('recent', {})
    previous = previous or {}
    evidence = {}
    candidates = []
    for i, acc in enumerate(recent.get('accessionNumber', [])):
        def cell(name):
            rows = recent.get(name, [])
            return rows[i] if i < len(rows) else None
        form, filed, items = cell('form'), cell('filingDate'), str(cell('items') or '')
        if not filed or filed > now[:10]:
            continue
        if (form in ('8-K', '8-K/A') and '2.02' in re.findall(r'\d+\.\d{2}', items)) or form in ('6-K', '6-K/A'):
            candidates.append((filed, acc, cell('primaryDocument')))
    from datetime import datetime, timedelta
    cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=365)).date().isoformat()
    pending = [c for c in sorted(candidates, reverse=True) if c[0] >= cutoff and
               (c[1] not in previous or previous[c[1]].get('parserVersion') != PARSER_VERSION or
                (previous[c[1]].get('retryAfter') and previous[c[1]]['retryAfter'] <= now))]
    retry_after = (datetime.fromisoformat(now.replace('Z', '+00:00')) + timedelta(days=1)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    for filed, acc, document in pending[:max_filings]:
        url = filing_url(cik, acc, document)
        if not url or client.stats['requests'] >= budget:
            continue
        try:
            result = inspect_html(client.get_bytes(url), url)
            result.update(filingDate=filed, inspectedAt=now)
            result['sourceDocuments'] = [{'type': 'SEC_PRIMARY_DOCUMENT', 'url': url, 'filingId': acc}] + result.get('sourceDocuments', [])
            # Release exhibits provide stronger period/evidence, even when primary filing has a generic heading.
            if result['exhibits'] and client.stats['requests'] < budget:
                exhibit = result['exhibits'][0]
                try:
                    extra = inspect_html(client.get_bytes(exhibit), exhibit)
                    result['sourceDocuments'].append({'type': 'SEC_EARNINGS_EXHIBIT', 'url': exhibit, 'filingId': acc})
                    result['sourceDocuments'].extend(extra.get('sourceDocuments', []))
                    if extra['outcome'] == 'EARNINGS_RELEASE' or (result['outcome'] != 'EARNINGS_RELEASE' and extra['outcome'] == 'OPERATING_RESULTS'):
                        result.update(outcome=extra['outcome'], period=extra['period'] or result['period'], periodEnd=extra.get('periodEnd') or result.get('periodEnd'), evidence=extra['evidence'], sourceUrl=exhibit, companyKPIs=extra.get('companyKPIs', []), guidance=extra.get('guidance', []))
                except Exception as exc:
                    from .transport import BudgetExhausted
                    if isinstance(exc, BudgetExhausted):
                        raise
                    result['exhibitFailure'] = str(exc)[:200]
                    result['retryAfter'] = retry_after
            evidence[acc] = result
        except Exception as exc:
            from .transport import BudgetExhausted
            if isinstance(exc, BudgetExhausted):
                raise
            evidence[acc] = {'outcome': 'UNAVAILABLE', 'parserVersion': PARSER_VERSION, 'sourceUrl': url, 'reason': str(exc)[:200], 'retryAfter': retry_after, 'filingDate': filed, 'inspectedAt': now}
    return {**submissions, '_intelligenceDocumentEvidence': evidence}
