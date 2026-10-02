"""Honest issuer coverage, independent of configured/active polling switches."""
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta


def ir_configuration(config):
    return config.get('pageRole') == 'IR' or (config.get('pageRole') is None and bool(re.search(r'://(?:ir|investors?)\.|/investors?(?:/|$)|/investor-relations', config.get('irHomepage', ''), re.I)))


def source_status(source, now):
    if source.get('active') is False:
        return 'INACTIVE'
    error = source.get('lastError') or ''
    if any(code in error for code in ('403', 'ROBOTS_DISALLOWED', 'PRIVATE_', 'UNSAFE_')):
        return 'BLOCKED'
    if source.get('failureCount'):
        return 'INVALID' if any(code in error for code in ('404', 'MALFORMED', 'NOT_FEED', 'INVALID_')) else 'DEGRADED'
    if not source.get('lastSuccess'):
        return 'VALIDATED' if source.get('lastVerified') and source.get('verified') else 'DISCOVERED'
    cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=2)).isoformat().replace('+00:00', 'Z')
    if source.get('lastItemCount') == 0:
        return 'EMPTY'
    latest = source.get('latestContentAt')
    # A successful HTTP response does not establish fresh company news.
    content_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=180)).isoformat().replace('+00:00', 'Z')
    if source['lastSuccess'] < cutoff or (source['type'] in ('IR_FEED', 'IR_MATERIALS') and (not latest or latest < content_cutoff)):
        return 'STALE'
    return 'ACTIVE' if source.get('active', True) else 'INACTIVE'


def report(store, companies, now):
    sources = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
    grouped = defaultdict(list)
    for s in sources:
        grouped[s.get('companyId')].append(s)
    events = defaultdict(list)
    calls = set()
    for row in store.db.execute('SELECT company,payload FROM events'):
        e = json.loads(row[1])
        if e['eventType'] == 'EARNINGS_CALL':
            calls.add(row[0])
        if (e.get('dateEnd') or e.get('date') or '') >= now[:10]:
            events[row[0]].append(e)
    state = {r[0]: json.loads(r[1]) for r in store.db.execute('SELECT key,payload FROM state')}
    countries = defaultdict(Counter)
    counts, platforms, exchanges, rows = Counter(), Counter(), defaultdict(Counter), []
    statuses = Counter(source_status(s, now) for s in sources)
    discovery_statuses = Counter()
    for cid, c in sorted(companies.items()):
        registry = grouped[cid]
        ir = state.get('ir:' + cid, {})
        configs = ir.get('configurations', [])
        ir_configs = [cfg for cfg in configs if ir_configuration(cfg)]
        failed = ir.get('lastFailure', '') > ir.get('lastSuccess', '')
        discovery_statuses['BLOCKED' if failed and any(code in ir.get('reason', '') for code in ('403', 'ROBOTS')) else 'DEGRADED' if failed else 'VALIDATED' if ir.get('lastSuccess') else 'NOT_CHECKED'] += 1
        endpoints = {k: [cfg[k] for cfg in configs if cfg.get(k)] for k in ('newsroom', 'pressReleaseUrl', 'eventsUrl', 'earningsUrl', 'presentationsUrl', 'reportsUrl', 'callsUrl')}
        news = [s for s in registry if s['type'] in ('IR_FEED', 'RSS')]
        flags = {
            'officialDomainFound': bool(c.get('officialSites') or state.get('officialSite:' + cid, {}).get('status') == 'VALIDATED'),
            'officialDomainCandidate': bool(state.get('siteCandidates:' + cid, {}).get('candidates')),
            'discoveryAttempted': bool(state.get('siteCandidates:' + cid) or ir),
            'irPageFound': bool(ir_configs),
            'newsSourceDiscovered': bool(news),
            'newsSourceValidated': any(s.get('verified') and (s.get('lastVerified') or s.get('lastSuccess')) for s in news),
            'newsSourceActive': any(source_status(s, now) == 'ACTIVE' for s in news),
            'eventSourceFound': any(s['type'] == 'IR_EVENTS' for s in registry),
            'eventSourceActive': any(s['type'] == 'IR_EVENTS' and source_status(s, now) == 'ACTIVE' for s in registry),
            'earningsPageFound': bool(endpoints['earningsUrl']),
            'callSourceFound': bool(endpoints['callsUrl']) or cid in calls,
            'presentationSourceFound': bool(endpoints['presentationsUrl']),
            'secIdentity': bool(c.get('cik')),
            'secSubmissions': bool(state.get('sec:' + cid, {}).get('hasSubmissions')),
            'financialSummaryAvailable': state.get('financials:' + cid, {}).get('state') == 'AVAILABLE',
            'financialSummaryCurrent': state.get('financials:' + cid, {}).get('state') == 'AVAILABLE' and state.get('financials:' + cid, {}).get('stale') is False,
            'confirmedUpcomingEarnings': any(e['eventType'] in ('EARNINGS_CALL', 'EARNINGS_SCHEDULED') and e.get('confirmationStatus') == 'CONFIRMED' for e in events[cid]),
            'estimatedUpcomingEarnings': any(e['eventType'] == 'EARNINGS_ESTIMATED' and e.get('confirmationStatus') == 'ESTIMATED' for e in events[cid]),
            'noNewsOrSubmissionSource': not registry and not state.get('sec:' + cid, {}).get('hasSubmissions'),
            'noCompanySource': not registry and not state.get('sec:' + cid, {}).get('hasSubmissions') and not c.get('officialSites') and state.get('financials:' + cid, {}).get('state') != 'AVAILABLE',
        }
        counts.update(k for k, v in flags.items() if v)
        families = {cfg.get('providerType', 'GENERIC') for cfg in ir_configs}
        platforms.update(families)
        for exchange in {l.get('exchange') or 'UNKNOWN' for l in c['listings']}:
            exchanges[exchange].update(total=1)
            exchanges[exchange].update(k for k, v in flags.items() if v)
        for country in {l.get('country') or 'UNKNOWN' for l in c['listings']}:
            countries[country].update(total=1)
            countries[country].update(k for k, v in flags.items() if v)
        rows.append({'companyId': cid, 'symbols': [l['symbol'] for l in c['listings']], **flags,
                     'sourceStatuses': dict(Counter(source_status(s, now) for s in registry)), 'platforms': sorted(families),
                     'discoveryFailure': ir.get('reason'), 'siteValidation': state.get('officialSite:' + cid, {'status': 'NOT_CHECKED'}), 'candidateStatus': state.get('siteCandidates:' + cid, {}).get('status', 'NO_VERIFIED_CIK' if not c.get('cik') else 'NOT_CHECKED'), 'endpoints': endpoints})
    total = len(companies)
    return {'schema': 'vu-intelligence-coverage-1.0.0', 'generatedAt': now, 'totalCompanies': total,
            'counts': {k: {'companies': counts[k], 'percent': round(100 * counts[k] / total, 2)} for k in flags},
            'sourceStatuses': dict(statuses), 'parserFailures': sum(any(code in (s.get('lastError') or '') for code in ('MALFORMED', 'INVALID_JSON', 'NOT_FEED', 'UNSAFE_OR_OVERSIZED_XML')) for s in sources), 'discoveryStatuses': dict(discovery_statuses), 'platformCompanies': dict(platforms),
            'byExchange': dict(exchanges), 'byMasterListingCountry': dict(countries), 'companies': rows,
            'interpretation': 'CIK identity and local financial facts are not active news/filing-feed coverage. Unattempted discovery is explicit. Sparse first-party news is stale, never counted as active.'}
