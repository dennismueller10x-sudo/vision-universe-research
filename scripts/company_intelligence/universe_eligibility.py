"""Deterministic consumer eligibility. No network, inference or ledger mutation.

Evaluate the already restored full ledger through the existing source filter and
consumer projector. One invalid module is removed; identity conflicts fail the
issuer closed. Operational registry/checkpoints never enter consumer assets.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timedelta
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit, parse_qs

from .consumer_usage import filter_for_preview, first_party, publisher, host
from .earnings import valid_date, valid_unit
from .model import SCHEMA, ACCESSION, timestamp
from .product import project
from .profiles import public_profile
from .store import atomic_json, dumps

VERSION = 'issuer-eligibility-1.0.0'
POLICY = 'OWNED_IR_SEC_METADATA_PREVIEW_V1'
MODULES = ('profile', 'aktuelles', 'financials', 'whatChanged', 'nextEvent', 'calls', 'documents')
DISPLAY_METRICS = {'revenue','eps_diluted','free_cash_flow','gross_margin','operating_margin','net_income','cash_and_equivalents','total_debt'}
DOCUMENT_TYPES = {'FINANCIAL_REPORT', 'ANNUAL_REPORT', 'QUARTERLY_REPORT', 'PRESENTATION',
                  'COMPANY_TRANSCRIPT', 'PREPARED_REMARKS', 'SHAREHOLDER_LETTER',
                  'MANAGEMENT_COMMENTARY', 'CALL_RECORDING', 'WEBCAST', 'EARNINGS_WEBCAST'}
MANAGEMENT_TYPES = {'COMPANY_TRANSCRIPT', 'PREPARED_REMARKS', 'SHAREHOLDER_LETTER', 'MANAGEMENT_COMMENTARY'}
ID = re.compile(r'(?:iss_cik_\d{10}|vu_[a-f0-9]{14})')


def collection_link(document):
    """An IR navigation/library URL is not an individual report or deck."""
    if document.get('type') not in {'FINANCIAL_REPORT', 'PRESENTATION', 'ANNUAL_REPORT', 'QUARTERLY_REPORT'}:
        return False
    u = urlsplit(document.get('url') or '')
    endpoint = u.path.rstrip('/').rsplit('/', 1)[-1].lower()
    identifiers = {k.lower() for k in parse_qs(u.query)}
    return endpoint in {'annual-reports', 'quarterly-reports', 'financial-reports', 'reports-and-filings',
                        'annual-and-quarterly-reports-and-filings', 'sec-filings', 'financial-information',
                        'quarterly-results', 'events-and-presentations', 'presentations', 'reports'} and not identifiers.intersection({'documentid', 'docid', 'fileid', 'eventid'})


def safe_link(url):
    if not host(url) or publisher(url):
        return False
    u = urlsplit(url)
    h = u.hostname.lower()
    try:
        return not (u.port not in (None, 443) or re.match(r'^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|metadata\.)', h)
                    or h.endswith(('.localhost', '.local', '.internal')))
    except ValueError:
        return False


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def date_of(row):
    return (row.get('publishedAt') or row.get('publishedDate') or row.get('date') or '')[:10]


def valid_row(row, cid):
    if not isinstance(row, dict) or row.get('companyId') != cid:
        return False
    for k in ('date', 'publishedDate', 'dateStart', 'dateEnd', 'reportingPeriod', 'filedAt'):
        if row.get(k) and not valid_date(row[k]):
            return False
    for k in ('publishedAt', 'startsAt'):
        if row.get(k) and not timestamp(row[k]):
            return False
    for k in ('canonicalUrl', 'sourceUrl', 'url', 'webcastUrl', 'replayUrl', 'transcriptUrl', 'presentationUrl', 'quarterlyReportUrl', 'earningsReleaseUrl'):
        if row.get(k) and not safe_link(row[k]):
            return False
    return True


def financial_summary(value, cid, now):
    f = deepcopy(value or {})
    if f.get('state') != 'AVAILABLE':
        return {'state': 'UNAVAILABLE', 'reason': 'NO_SUPPORTED_FINANCIALS'}, 'NO_SUPPORTED_DATA'
    if (not cid.startswith('iss_cik_') or f.get('policy') != 'LATEST_KNOWN_RETROSPECTIVE'
            or type(f.get('fiscalYear')) is not int or f.get('fiscalQuarter') not in ('Q1', 'Q2', 'Q3', 'Q4', 'FY')
            or not valid_date(f.get('sourceAsOf')) or f['sourceAsOf'] > now[:10]):
        return {'state': 'UNAVAILABLE', 'reason': 'INVALID_FINANCIAL_PROVENANCE'}, 'FISCAL_PERIOD_OR_PROVENANCE_INVALID'
    metrics = {}
    for key, metric in f.get('metrics', {}).items():
        fact = metric.get('current') or {}
        if metric.get('state') != 'AVAILABLE':
            continue
        unit_ok = fact.get('unit') == 'percent' if key in ('gross_margin', 'operating_margin') else valid_unit(key, fact.get('unit'))
        if not number(fact.get('value')) or not unit_ok:
            continue
        filings = fact.get('filingIds') or [fact.get('filingId')]
        if not filings or any(not ACCESSION.fullmatch(str(a)) for a in filings):
            continue
        if key not in ('gross_margin', 'operating_margin') and (not valid_date(fact.get('periodEnd')) or not valid_date(fact.get('filedAt')) or not fact['periodEnd'] <= fact['filedAt'] <= f['sourceAsOf']):
            continue
        m = deepcopy(metric)
        for comparison in ('previousQuarter', 'yearAgoQuarter', 'previousYear'):
            prior = m.get(comparison)
            if prior and (not number(prior.get('value')) or prior.get('unit') != fact['unit']):
                m[comparison] = None
                m['yoy' if comparison != 'previousQuarter' else 'qoq'] = None
        metrics[key] = m
    ends = [m['current']['periodEnd'] for m in metrics.values() if m['current'].get('periodEnd')]
    if not metrics or not ends:
        return {'state': 'UNAVAILABLE', 'reason': 'NO_VALID_NORMALIZED_METRICS'}, 'NORMALIZATION_OR_UNIT_INVALID'
    if not DISPLAY_METRICS.intersection(metrics):
        return {'state': 'UNAVAILABLE', 'reason': 'NO_SUPPORTED_DISPLAY_METRICS'}, 'NO_SUPPORTED_DISPLAY_METRICS'
    end = max(ends)
    if f.get('reportingPeriod') and f['reportingPeriod'] != end:
        return {'state': 'UNAVAILABLE', 'reason': 'FINANCIAL_PERIOD_MISMATCH'}, 'FISCAL_PERIOD_INVALID'
    # No mixed reporting periods in one KPI card.
    metrics = {k: m for k, m in metrics.items() if not m['current'].get('periodEnd') or m['current']['periodEnd'] == end}
    if not DISPLAY_METRICS.intersection(metrics):
        return {'state': 'UNAVAILABLE', 'reason': 'NO_SUPPORTED_DISPLAY_METRICS'}, 'NO_SUPPORTED_DISPLAY_METRICS'
    if end < (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=730)).date().isoformat():
        return {'state': 'UNAVAILABLE', 'reason': 'FINANCIAL_PERIOD_OVER_TWO_YEARS_OLD'}, 'TOO_STALE'
    f.update(metrics=metrics, reportingPeriod=end, stale=bool(f.get('stale')) or end < (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=180)).date().isoformat())
    f['whatChanged'] = [c for c in f.get('whatChanged', []) if (c.get('metric') in DISPLAY_METRICS and c.get('metric') in metrics or c.get('metric') == 'revenue_growth' and 'revenue' in metrics)
                        and all(number(c.get(k)) for k in ('previous', 'current', 'absolute'))
                        and c.get('comparison') in ('YEAR_AGO_QUARTER', 'PREVIOUS_YEAR', 'PREVIOUS_QUARTER_YOY_GROWTH')
                        and c.get('filingIds') and all(ACCESSION.fullmatch(str(a)) for a in c['filingIds'])]
    return f, 'STALE' if f['stale'] else 'CURRENT'


def evaluate(raw, sources, mapping_ok=True, disabled=False):
    cid = raw.get('companyId', '')
    row = {'issuer': cid, 'status': 'INELIGIBLE_OTHER', 'modules': {k: False for k in MODULES}, 'reasons': [], 'moduleReasons': {}}
    if disabled:
        row['reasons']=['OPERATOR_DISABLED_ISSUER']
        return row, None
    if (not mapping_ok or not ID.fullmatch(cid) or not raw.get('listings') or not raw.get('companyName')):
        row.update(status='INELIGIBLE_MAPPING', reasons=['UNRESOLVED_OR_CONFLICTING_MASTER_MAPPING'])
        return row, None
    if raw.get('schema') != SCHEMA or not timestamp(raw.get('generatedAt')):
        row.update(status='INELIGIBLE_DATA_INVALID', reasons=['INVALID_SCHEMA_OR_GENERATION_TIME'])
        return row, None
    now = raw['generatedAt']; today = now[:10]
    cut = lambda days: (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=days)).date().isoformat()
    safe, usage = filter_for_preview(raw, sources)
    p = project(safe)
    p['state'] = 'AVAILABLE'
    profile = p.get('companyProfile')
    if profile and profile.get('language') == 'de' and public_profile(profile, cid, now) and not profile.get('stale') and not re.search(r'\b\d+[\d.,]*\s+(Mitarbeiter|Beschäftigte|Angestellte)\b', profile['description'], re.I):
        row['modules']['profile'] = True
    else:
        p.pop('companyProfile', None)
        row['moduleReasons']['profile'] = 'STALE_OR_WEAK_PROFILE' if profile and profile.get('stale') else 'NO_APPROVED_GERMAN_COPY' if raw.get('companyProfile') else 'NO_SAFE_PROFILE_SOURCE'
    for key in ('news', 'earnings', 'events', 'calls', 'materials', 'presentations', 'materialEvents', 'filings', 'timeline'):
        before = p.get(key, [])
        p[key] = [e for e in before if valid_row(e, cid)]
        if len(before) != len(p[key]):
            row['moduleReasons'][key] = 'INVALID_ROWS_REMOVED'
    # Actual publication date is required for current intelligence; observedAt
    # alone does not make undated announcements current.
    p['news'] = [e for e in p['news'] if e.get('headline') and safe_link(e.get('canonicalUrl') or e.get('sourceUrl')) and valid_date(date_of(e)) and cut(180) <= date_of(e) <= today]
    p['earnings'] = [e for e in p['earnings'] if valid_date(date_of(e)) and date_of(e) <= today and e.get('eventType') in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED') and not e.get('isAmendment')]
    p['materialEvents'] = [e for e in p['materialEvents'] if e.get('importance') in ('HIGH', 'CRITICAL') and valid_date(date_of(e)) and cut(90) <= date_of(e) <= today]
    current = [e for e in p['news'] + p['earnings'] + p['materialEvents'] if cut(90) <= date_of(e) <= today]
    row['modules']['aktuelles'] = bool(current)
    row['news'] = {'retained180': len(p['news']), 'days30': sum(date_of(e) >= cut(30) for e in p['news']), 'days90': sum(date_of(e) >= cut(90) for e in p['news']), 'currentIntelligence90': len(current)}
    def upcoming(e):
        if e.get('eventStatus') in ('CANCELLED', 'CANCELED', 'WITHDRAWN', 'POSTPONED') or e.get('status') in ('CANCELLED', 'CANCELED', 'WITHDRAWN'):
            return False
        if e.get('eventType') == 'EARNINGS_ESTIMATED':
            return e.get('confirmationStatus') == 'ESTIMATED' and valid_date(e.get('dateStart')) and valid_date(e.get('dateEnd')) and e['dateStart'] <= e['dateEnd'] and e['dateEnd'] >= today
        return e.get('confirmationStatus') == 'CONFIRMED' and valid_date(e.get('date')) and (e.get('startsAt') >= now if e.get('startsAt') else e['date'] >= today)
    p['events'] = [e for e in p['events'] if upcoming(e)]
    row['modules']['nextEvent'] = bool(p['events'])
    row['confirmedEvents'] = sum(e.get('confirmationStatus') == 'CONFIRMED' for e in p['events'])
    row['estimatedEvents'] = sum(e.get('confirmationStatus') == 'ESTIMATED' for e in p['events'])
    p['calls'] = [e for e in p['calls'] if any(safe_link(e.get(k)) for k in ('webcastUrl', 'replayUrl', 'transcriptUrl')) and e.get('confirmationStatus') == 'CONFIRMED']
    row['modules']['calls'] = bool(p['calls'])
    # Accessions alone and routine SEC links are evidence, not a meaningful
    # standalone Documents module. Preserve those only beside valid financials.
    row['collectionLinksExcluded'] = sum(collection_link(d) for d in p['materials'])
    if row['collectionLinksExcluded']:
        row['moduleReasons']['documents'] = 'GENERIC_IR_COLLECTION_LINKS_EXCLUDED'
    p['materials'] = [d for d in p['materials'] if safe_link(d.get('url')) and d.get('type') in DOCUMENT_TYPES | {'SEC_FACT_FILING_REFERENCE'} and not collection_link(d)]
    p['filings'] = [d for d in p['filings'] if d.get('form') in ('10-K', '10-Q', '20-F', '40-F') and safe_link(d.get('sourceUrl'))]
    meaningful_docs = [d for d in p['materials'] if d.get('type') in DOCUMENT_TYPES]
    meaningful_docs += p['filings']
    row['modules']['documents'] = bool(meaningful_docs)
    row['managementContent'] = sum(d.get('type') in MANAGEMENT_TYPES for d in meaningful_docs)
    p['latestFinancials'], financial_state = financial_summary(p.get('latestFinancials'), cid, now)
    row['financialState'] = financial_state
    row['modules']['financials'] = p['latestFinancials']['state'] == 'AVAILABLE'
    row['modules']['whatChanged'] = bool(p['latestFinancials'].get('whatChanged')) and not p['latestFinancials'].get('stale')
    if not row['modules']['whatChanged']:
        p['latestFinancials']['whatChanged'] = []
    if not row['modules']['financials']:
        p['materials'] = [d for d in p['materials'] if d['type'] != 'SEC_FACT_FILING_REFERENCE']
    # Rebuild bundles after module filtering, never leave an invalid nested copy.
    from .product import bundles
    p['earningsBundles'] = bundles(p)
    p['presentations'] = [d for d in p['materials'] if d.get('type') == 'PRESENTATION']
    p['timeline'] = []  # V2 derives Aktuelles from the filtered concrete modules.
    # Discovery endpoints are private acquisition provenance, never customer
    # source links. Preserve the original ledger and the actual publication URL.
    def public_provenance(value):
        if isinstance(value, dict):
            value.pop('discoveryUrl', None)
            for item in value.values(): public_provenance(item)
        elif isinstance(value, list):
            for item in value: public_provenance(item)
    public_provenance(p)
    p['eligibility'] = {'version': VERSION, 'modules': row['modules']}
    row['policyExcluded'] = usage['excluded']
    strong = sum(row['modules'][k] for k in ('profile', 'aktuelles', 'financials', 'nextEvent', 'calls', 'documents'))
    if not strong:
        excluded = sum(usage['excluded'].values())
        row.update(status='INELIGIBLE_SOURCE_POLICY' if excluded else 'INELIGIBLE_NO_SAFE_CONTENT', reasons=['NO_MEANINGFUL_APPROVED_MODULE'])
        if financial_state not in ('NO_SUPPORTED_DATA', 'NO_SUPPORTED_DISPLAY_METRICS', 'CURRENT', 'STALE'):
            row.update(status='INELIGIBLE_DATA_INVALID', reasons=[financial_state])
        if financial_state == 'TOO_STALE':
            row.update(status='INELIGIBLE_TOO_STALE', reasons=['ONLY_FINANCIALS_OVER_TWO_YEARS_OLD'])
        if profile and profile.get('stale') and not excluded:
            row.update(status='INELIGIBLE_TOO_STALE', reasons=['ONLY_STALE_PROFILE'])
        return row, None
    row['status'] = 'ELIGIBLE_FULL' if strong >= 4 and row['modules']['aktuelles'] and row['modules']['financials'] else 'ELIGIBLE_PARTIAL'
    for module in MODULES:
        if not row['modules'][module]:
            row['moduleReasons'].setdefault(module, 'NO_VALID_MEANINGFUL_CONTENT')
    return row, p


def generate(store, companies, output, now, current_companies=None):
    """Only public-safe eligible bytes; all failures classified in audit evidence."""
    output = Path(output)
    disabled=set(json.loads((Path(__file__).resolve().parents[2]/'company-intelligence/config/universe-rollout.json').read_text()).get('disabledIssuers',[]))
    if any(not isinstance(cid,str) or not ID.fullmatch(cid) for cid in disabled):raise ValueError('INVALID_ISSUER_DISABLE_CONFIGURATION')
    sources = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
    by_source = defaultdict(list)
    for s in sources:
        by_source[s.get('companyId')].append(s)
    ticker_owners, instrument_owners = defaultdict(set), defaultdict(set)
    current_companies = companies if current_companies is None else current_companies
    current_listings = {(cid,l['instrumentId'],l['symbol']) for cid,c in current_companies.items() for l in c['listings']}
    for cid, c in current_companies.items():
        for l in c['listings']:
            ticker_owners[l['symbol']].add(cid)
            instrument_owners[l['instrumentId']].add(cid)
    rows, values, members, raw_counts = {}, {}, {}, Counter()
    for cid, c in sorted(companies.items()):
        raw = store.company_payload(c, now)
        raw_counts['payloads'] += raw['state'] != 'NO_DATA'
        raw_counts['profiles'] += bool(raw.get('companyProfile'))
        raw_counts['newsIssuers'] += bool(raw['news'])
        raw_counts['callsIssuers'] += bool(raw['calls'])
        raw_counts['materialsIssuers'] += bool(raw['materials'])
        has_private_payload = raw['state'] != 'NO_DATA'
        if cid in current_companies:
            raw['listings'] = current_companies[cid]['listings']
            raw['companyName'] = (current_companies[cid]['names'] or [None])[0]
        mapping_ok = all(len(ticker_owners[l['symbol']]) == 1 and len(instrument_owners[l['instrumentId']]) == 1
                         and (cid,l['instrumentId'],l['symbol']) in current_listings for l in raw['listings'])
        # A conflicting official root cannot authorize first-party material;
        # independently proven SEC content can still be eligible.
        official = store.state('officialSite:' + cid, {})
        issuer_sources = by_source[cid]
        if official.get('status') in ('CONFLICTING_OWNER', 'WRONG_COMPANY', 'AMBIGUOUS'):
            issuer_sources = []
        try:
            row, value = evaluate(raw, issuer_sources, mapping_ok, cid in disabled)
        except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
            row, value = {'issuer': cid, 'status': 'INELIGIBLE_CONSUMER_INVALID', 'modules': {k: False for k in MODULES},
                          'reasons': ['CONSUMER_PROJECTION_INVALID'], 'moduleReasons': {}}, None
        row['tickers'] = [l['symbol'] for l in c['listings']]
        if cid in current_companies:row['tickers'] = [l['symbol'] for l in current_companies[cid]['listings']]
        row['hasPrivatePayload'] = has_private_payload
        row['foreignIssuerEvidence'] = any(s.get('form') in ('20-F','40-F') for s in (raw.get('companyProfile') or {}).get('sources', []))
        row['profileState'] = 'GERMAN_APPROVED' if row['modules']['profile'] else row['moduleReasons'].get('profile', 'NO_SAFE_PROFILE_SOURCE')
        row['sourceState'] = 'POLLABLE_APPROVED' if any(s.get('active') and first_party(s,cid) and not publisher(s.get('url')) for s in issuer_sources) else 'REGISTERED_NOT_POLLABLE' if issuer_sources else 'NO_APPROVED_SOURCE'
        rows[cid] = row
        if value:
            values[cid] = value
            for l in raw['listings']:
                members.setdefault(l['symbol'], []).append({**l, 'companyId': cid})
    digest = hashlib.sha256(dumps({'version': VERSION, 'asOf': now, 'eligibility': rows, 'values': values, 'members': members}).encode()).hexdigest()[:24]
    assets = {}
    def write(path, value):
        data = (dumps(value) + '\n').encode()
        if len(data) > 512 * 1024:
            raise ValueError('ELIGIBLE_PAYLOAD_BUDGET_EXCEEDED')
        atomic_json(output / path, value)
        assets[path] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    paths = {cid: f'snapshots/{digest}/{cid}.json' for cid in values}
    for cid, v in values.items():
        write(paths[cid], v)
    for prefix in sorted({t[:2] for t in members}):
        listings = {t: ls for t,ls in sorted(members.items()) if t[:2] == prefix}
        ids = {l['companyId'] for ls in listings.values() for l in ls}
        write(f'snapshots/{digest}/lookup/{prefix}.json', {'schema': SCHEMA, 'generation': digest, 'tickers': listings, 'companies': {cid: paths[cid] for cid in sorted(ids)}})
    write('index.json', {'schema': SCHEMA, 'state': 'AVAILABLE', 'scope': 'PER_ISSUER_ELIGIBILITY', 'generation': digest, 'generatedAt': now,
                         'companyCount': len(values), 'coveredCompanyCount': len(values), 'lookupShards': sorted({t[:2] for t in members})})
    counts = Counter(r['status'] for r in rows.values())
    module_counts = {k: sum(r['modules'][k] for r in rows.values() if r['status'].startswith('ELIGIBLE_')) for k in MODULES}
    report = {'schema': 1, 'eligibilityVersion': VERSION, 'sourceUsagePolicy': POLICY, 'generation': digest, 'asOf': now,
              'privateIssuerCount': raw_counts['payloads'], 'privatePayloadCount': raw_counts['payloads'], 'identityInventoryIssuerCount': len(companies), 'currentMasterIssuerCount': len(current_companies), 'privateListingCount': sum(len(c['listings']) for c in companies.values()),
              'eligibleIssuerCount': len(values), 'eligibleStockCount': len(members), 'statusCounts': dict(counts), 'moduleCounts': module_counts,
              'profileStates': dict(Counter(r['profileState'] for r in rows.values())), 'financialStates': dict(Counter(r.get('financialState', 'NOT_EVALUATED') for r in rows.values())),
              'sourceStates': dict(Counter(r['sourceState'] for r in rows.values())), 'rawCoverage': dict(raw_counts),
              'newsCoverage': {k: sum(r.get('news',{}).get(k,0)>0 for r in rows.values()) for k in ('days30', 'days90', 'retained180', 'currentIntelligence90')},
              'confirmedEventIssuers': sum(r.get('confirmedEvents',0)>0 for r in rows.values()), 'estimatedEventIssuers': sum(r.get('estimatedEvents',0)>0 for r in rows.values()),
              'managementContentIssuers': sum(r.get('managementContent',0)>0 for r in rows.values()),
              'policyExclusions': {k: sum(r.get('policyExcluded',{}).get(k,0) for r in rows.values()) for k in ('news','events','calls','materials')},
              'collectionLinkExclusions': {'records': sum(r.get('collectionLinksExcluded',0) for r in rows.values()), 'issuers': sum(r.get('collectionLinksExcluded',0)>0 for r in rows.values())},
              'activeSourceCount': sum(bool(s.get('active') and first_party(s,s.get('companyId')) and not publisher(s.get('url'))) for s in sources),
              'activeSourcesByType': dict(Counter(s.get('type') for s in sources if s.get('active') and first_party(s,s.get('companyId')) and not publisher(s.get('url')))),
              'sourceHealth': dict(Counter('BROKEN' if s.get('lastError') and any(x in s['lastError'] for x in ('404','410')) else 'TEMPORARY_FAILURE' if s.get('failureCount') else 'STALE' if (s.get('lastSuccess') or '') < (datetime.fromisoformat(now.replace('Z','+00:00'))-timedelta(days=7)).isoformat().replace('+00:00','Z') else 'HEALTHY' for s in sources)),
              'consumerBytes': sum(v['bytes'] for v in assets.values()), 'consumerAssets': len(assets), 'privateOperationalRowsIncluded': False}
    report['moduleFailureClasses'] = dict(Counter(reason for r in rows.values() for reason in r.get('moduleReasons',{}).values()))
    report['privateStatusCounts'] = dict(Counter(r['status'] for r in rows.values() if r['hasPrivatePayload']))
    report['identityOnlyIssuerCount'] = sum(not r['hasPrivatePayload'] for r in rows.values())
    report['ledgerInventory'] = {
        'newsRecords': store.db.execute("SELECT count(*) FROM items WHERE json_extract(payload,'$.eventType')='NEWS'").fetchone()[0],
        'newsIssuers': store.db.execute("SELECT count(DISTINCT company) FROM items WHERE json_extract(payload,'$.eventType')='NEWS'").fetchone()[0],
        'eventsByType': {r[0]:r[1] for r in store.db.execute('SELECT kind,count(*) FROM events GROUP BY kind')},
        'auditRecords': store.db.execute('SELECT count(*) FROM audit').fetchone()[0],
        'eventAliasRecords': store.db.execute('SELECT count(*) FROM event_alias').fetchone()[0],
        'sourceRecords': len(sources),
        'operationalStateRecords': store.db.execute('SELECT count(*) FROM state').fetchone()[0]}
    public_eligibility = {cid: {k: rows[cid][k] for k in ('status','modules','tickers')} for cid in sorted(values)}
    manifest = {'schema': 1, 'generation': digest, 'generatedAt': now, 'assets': assets, 'tickers': sorted(members), 'sourceUsagePolicy': POLICY,
                'scope': 'PER_ISSUER_ELIGIBILITY', 'eligibilityVersion': VERSION, 'eligibility': public_eligibility, 'releaseState': 'REVIEW_ONLY'}
    atomic_json(output / 'manifest.json', manifest)
    return report, {'schema': 1, 'version': VERSION, 'generation': digest, 'sourceUsagePolicy': POLICY, 'issuers': rows}
