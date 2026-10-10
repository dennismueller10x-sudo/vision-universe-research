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
    if source.get('format') == 'Q4_REPORTS' and source['lastSuccess'] >= cutoff:
        return 'UNDATED_METADATA'
    if source.get('lastItemCount') == 0:
        return 'EMPTY'
    latest = source.get('latestContentAt')
    # A successful HTTP response does not establish fresh company news.
    content_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=180)).isoformat().replace('+00:00', 'Z')
    if source['lastSuccess'] < cutoff or (source['type'] in ('IR_FEED', 'IR_MATERIALS', 'RSS') and (not latest or latest < content_cutoff or latest > now)):
        return 'STALE'
    return 'ACTIVE' if source.get('active', True) else 'INACTIVE'


def report(store, companies, now):
    sources = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
    grouped = defaultdict(list)
    for s in sources:
        grouped[s.get('companyId')].append(s)
    events = defaultdict(list)
    all_events, news_items = defaultdict(list), defaultdict(list)
    recent = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=180)).isoformat().replace('+00:00', 'Z')
    material_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=90)).date().isoformat()
    for row in store.db.execute('SELECT company,payload FROM items'):
        news_items[row[0]].append(json.loads(row[1]))
    calls = set()
    for row in store.db.execute('SELECT company,payload FROM events'):
        e = json.loads(row[1])
        all_events[row[0]].append(e)
        if e['eventType'] == 'EARNINGS_CALL':
            calls.add(row[0])
        if (e.get('dateEnd') or e.get('date') or '') >= now[:10]:
            events[row[0]].append(e)
    state = {r[0]: json.loads(r[1]) for r in store.db.execute('SELECT key,payload FROM state')}
    countries = defaultdict(Counter)
    counts, platforms, exchanges, rows = Counter(), Counter(), defaultdict(Counter), []
    statuses = Counter(source_status(s, now) for s in sources)
    platform_health = defaultdict(lambda: {'sources': 0, 'active': 0, 'blocked': 0, 'stale': 0, 'failures': 0, 'parserFailures': 0, 'undatedMetadataAvailable':0, 'issuerIds': set(), 'lastSuccess': None})
    tiers = Counter()
    profile_confidence = Counter()
    conversion = defaultdict(Counter)
    for source in sources:
        health = platform_health[source.get('provider', 'UNKNOWN')]
        health['sources'] += 1
        if source.get('companyId'): health['issuerIds'].add(source['companyId'])
        status = source_status(source, now)
        health['active'] += status == 'ACTIVE'; health['blocked'] += status == 'BLOCKED'; health['stale'] += status == 'STALE'
        health['undatedMetadataAvailable'] += status=='UNDATED_METADATA'
        health['failures'] += bool(source.get('failureCount'))
        health['parserFailures'] += any(code in (source.get('lastError') or '') for code in ('MALFORMED', 'INVALID_', 'SCHEMA'))
        health['lastSuccess'] = max(health['lastSuccess'] or '', source.get('lastSuccess') or '') or None
    discovery_statuses = Counter()
    active_ids = {s['sourceId'] for s in sources if source_status(s, now) == 'ACTIVE'}
    for cid, c in sorted(companies.items()):
        registry = grouped[cid]
        ir = state.get('ir:' + cid, {})
        configs = ir.get('configurations', [])
        ir_configs = [cfg for cfg in configs if ir_configuration(cfg)]
        failed = ir.get('lastFailure', '') > ir.get('lastSuccess', '')
        discovery_statuses['BLOCKED' if failed and any(code in ir.get('reason', '') for code in ('403', 'ROBOTS')) else 'DEGRADED' if failed else 'VALIDATED' if ir.get('lastSuccess') else 'NOT_CHECKED'] += 1
        endpoints = {k: [cfg[k] for cfg in configs if cfg.get(k)] for k in ('newsroom', 'pressReleaseUrl', 'eventsUrl', 'earningsUrl', 'presentationsUrl', 'reportsUrl', 'callsUrl')}
        news = [s for s in registry if s['type'] in ('IR_FEED', 'RSS')]
        fresh_news = [i for i in news_items[cid] if recent <= (i.get('publishedAt') or '') <= now]
        fresh_external = [i for i in fresh_news if any(p.get('sourceId') in active_ids and p.get('discoverySource') in ('RSS', 'GDELT') for p in i.get('provenance', []))]
        docs = [d for cfg in configs for d in cfg.get('documents', [])] + [d for e in all_events[cid] for d in e.get('sourceDocuments', [])]
        from .profiles import public_profile
        profile = public_profile(state.get('companyProfile:' + cid), cid, now)
        profile_types = {s['type'] for s in profile['sources']} if profile else set()
        if profile:
            profile_confidence[profile['confidence']] += 1
        flags = {
            'companyProfileAvailable': bool(profile),
            'companyProfileFromSEC': 'SEC' in profile_types,
            'companyProfileFromFirstPartyWeb': 'FIRST_PARTY_WEB' in profile_types,
            'companyProfileFromCombinedSources': len(profile_types) > 1,
            'companyProfileUnavailable': not profile,
            'companyProfileAmbiguous': state.get('profileAttempt:' + cid, {}).get('state') == 'AMBIGUOUS',
            'companyProfileStale': bool(profile and profile.get('stale')),
            'officialDomainFound': bool(c.get('officialSites') or state.get('officialSite:' + cid, {}).get('status') == 'VALIDATED'),
            'officialDomainCandidate': bool(state.get('siteCandidates:' + cid, {}).get('candidates')),
            'discoveryAttempted': bool(state.get('siteCandidates:' + cid) or ir),
            'irPageFound': bool(ir_configs),
            'newsSourceDiscovered': bool(news),
            'newsSourceValidated': any(s.get('verified') and (s.get('lastVerified') or s.get('lastSuccess')) for s in news),
            'newsSourceActive': any(source_status(s, now) == 'ACTIVE' for s in news),
            'activeFirstPartyNews': any(s['type'] == 'IR_FEED' and s.get('verified') and source_status(s, now) == 'ACTIVE' and any(p.get('sourceId') == s['sourceId'] for i in fresh_news for p in i.get('provenance', [])) for s in news),
            'activeExternalNews': bool(fresh_external),
            'anyNews': bool(fresh_news),
            **{'anyNews' + str(days) + 'd': any((datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=days)).isoformat().replace('+00:00', 'Z') <= (i.get('publishedAt') or '') <= now for i in news_items[cid]) for days in (7, 30, 90, 180)},
            'recentMaterialSEC': any(e['eventType'] == 'MATERIAL_SEC_EVENT' and material_cutoff <= e.get('date', '') <= now[:10] for e in all_events[cid]),
            'calls': cid in calls or any(d.get('type') in ('EARNINGS_WEBCAST','CALL_RECORDING') for d in docs),
            'webcasts': any(e.get('webcastUrl') or e.get('replayUrl') for e in all_events[cid]) or any(d.get('type') in ('EARNINGS_WEBCAST','WEBCAST','CALL_RECORDING') for d in docs),
            'webcastLinks': any(e.get('webcastUrl') for e in all_events[cid]) or any(d.get('type') in ('EARNINGS_WEBCAST','WEBCAST') for d in docs),
            'replayLinks': any(e.get('replayUrl') for e in all_events[cid]) or any(d.get('type')=='CALL_RECORDING' for d in docs),
            'callDates': any(e['eventType'] == 'EARNINGS_CALL' and e.get('date') for e in all_events[cid]),
            'preparedRemarks': any(d.get('type') == 'PREPARED_REMARKS' for d in docs),
            'managementCommentary': any(d.get('type') == 'MANAGEMENT_COMMENTARY' for d in docs),
            'callRecordings': any(d.get('type') == 'CALL_RECORDING' for d in docs) or any(e.get('replayUrl') for e in all_events[cid]),
            'shareholderLetters': any(d.get('type') == 'SHAREHOLDER_LETTER' for d in docs),
            'presentations': any(d.get('type') == 'PRESENTATION' for d in docs) or any(e.get('presentationUrl') for e in all_events[cid]),
            'transcriptLinks': any(d.get('type') == 'COMPANY_TRANSCRIPT' for d in docs) or any(e.get('transcriptUrl') for e in all_events[cid]),
            'consumerPayloadAvailable': bool(profile or docs or news_items[cid] or all_events[cid] or state.get('financials:' + cid, {}).get('state') == 'AVAILABLE'),
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
        owned_ids = {s['sourceId'] for s in registry if s.get('verified') and s.get('companyId') == cid}
        first_party_news = any(p.get('sourceId') in owned_ids for i in fresh_news for p in i.get('provenance', []))
        first_party_events = any(e.get('sourceId') in owned_ids for e in all_events[cid])
        first_party_materials = any(cfg.get('documents') for cfg in configs)
        flags['verifiedDomainWithUsefulData'] = bool(flags['officialDomainFound'] and ('FIRST_PARTY_WEB' in profile_types or first_party_news or first_party_events or first_party_materials))
        flags['verifiedDomainWithoutConversion'] = bool(flags['officialDomainFound'] and not flags['verifiedDomainWithUsefulData'])
        flags['irPageWithSources'] = bool(ir_configs and owned_ids)
        flags['irPageWithNews'] = bool(ir_configs and first_party_news)
        flags['irPageWithEvents'] = bool(ir_configs and first_party_events)
        flags['irPageWithMaterials'] = bool(ir_configs and first_party_materials)
        from .model import classify
        flags['recentMaterialNews'] = any(classify(i['headline'])['importance'] in ('HIGH', 'CRITICAL') for i in fresh_news)
        flags['anyMaterialIntelligence'] = bool(flags['financialSummaryCurrent'] or flags['recentMaterialNews'] or flags['confirmedUpcomingEarnings'] or flags['recentMaterialSEC'] or any(e['eventType'] in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED', 'OPERATING_RESULTS_PUBLISHED', 'PRESENTATION_PUBLISHED') and recent[:10] <= e.get('date', '') <= now[:10] for e in all_events[cid]))
        flags['anyCallContentReference'] = bool(flags['transcriptLinks'] or flags['preparedRemarks'] or flags['shareholderLetters'] or flags['managementCommentary'] or flags['callRecordings'] or flags['webcasts'])
        calendar = flags['confirmedUpcomingEarnings'] or flags['estimatedUpcomingEarnings']
        reference_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=365)).date().isoformat()
        recent_call = any(e['eventType'] == 'EARNINGS_CALL' and reference_cutoff <= e.get('date', '') for e in all_events[cid])
        recent_presentation = any(reference_cutoff <= e.get('date', '') and (e.get('presentationUrl') or any(d.get('type') == 'PRESENTATION' for d in e.get('sourceDocuments', []))) for e in all_events[cid]) or any(d.get('type') == 'PRESENTATION' and reference_cutoff <= (d.get('date') or '') <= now[:10] for cfg in configs for d in cfg.get('documents', []))
        full = bool(flags['anyNews'] and flags['financialSummaryCurrent'] and flags['secIdentity'] and calendar and recent_call and recent_presentation)
        strong = bool(flags['financialSummaryCurrent'] and flags['secIdentity'] and calendar)
        basic = bool(flags['financialSummaryAvailable'] and flags['secIdentity'])
        tier = 'A_FULL' if full else 'B_STRONG' if strong else 'C_BASIC' if basic else 'D_LIMITED'
        tiers[tier] += 1
        flags['fullIntelligenceTier'] = tier == 'A_FULL'
        flags['strongIntelligenceTier'] = tier == 'B_STRONG'
        flags['basicIntelligenceTier'] = tier == 'C_BASIC'
        flags['limitedIntelligenceTier'] = tier == 'D_LIMITED'
        flags['noRecentMaterialIntelligence'] = not flags['anyMaterialIntelligence']
        flags['noNews'] = not flags['anyNews']
        flags['noConsumerPayload'] = not flags['consumerPayloadAvailable']
        flags['secOnlyEvents'] = bool(all_events[cid]) and not fresh_news and not configs and all(e.get('form') or e['eventType'] == 'EARNINGS_ESTIMATED' for e in all_events[cid])
        counts.update(k for k, v in flags.items() if v)
        families = {cfg.get('providerType', 'GENERIC') for cfg in ir_configs}
        platforms.update(families)
        for family in families | {s.get('provider', 'UNKNOWN') for s in registry}:
            conversion[family].update(issuers=1)
            conversion[family].update(k for k in ('companyProfileAvailable', 'anyNews', 'calls', 'webcasts', 'presentations', 'anyCallContentReference', 'confirmedUpcomingEarnings') if flags[k])
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
            'coverageTiers': {k: {'companies': tiers[k], 'percent': round(100 * tiers[k] / total, 2)} for k in ('A_FULL', 'B_STRONG', 'C_BASIC', 'D_LIMITED')},
            'tierDefinitions': {'A_FULL':'Current news + fresh financials + SEC identity + upcoming calendar + calls/presentation evidence within 365 days', 'B_STRONG':'Fresh financials + SEC identity + confirmed/estimated upcoming calendar', 'C_BASIC':'Financial summary + SEC identity', 'D_LIMITED':'Does not meet the preceding tiers'},
            'platformHealth': {k: {**{f:v for f,v in h.items() if f != 'issuerIds'}, 'issuers': len(h['issuerIds']), 'healthySourcePercent': round(100 * h['active'] / h['sources'], 2)} for k,h in platform_health.items()},
            'companyProfiles': {'totalSupportedIssuers': total, 'available': counts['companyProfileAvailable'], 'unavailable': counts['companyProfileUnavailable'],
                                'fromSEC': counts['companyProfileFromSEC'], 'fromFirstPartyWeb': counts['companyProfileFromFirstPartyWeb'],
                                'fromCombinedSources': counts['companyProfileFromCombinedSources'], 'ambiguous': counts['companyProfileAmbiguous'],
                                'stale': counts['companyProfileStale'], 'confidenceDistribution': dict(profile_confidence),
                                'sourceCountsOverlap': True},
            'platformConversion': {k: {**dict(v), 'newsPercent': round(100 * v['anyNews'] / v['issuers'], 2),
                                        'callsPercent': round(100 * v['calls'] / v['issuers'], 2),
                                        'presentationsPercent': round(100 * v['presentations'] / v['issuers'], 2)} for k,v in conversion.items()},
            'conversionInterpretation': 'Verified-domain conversion requires actual first-party profile/news/events/materials, not SEC identity or source configuration alone. IR source discovery and downstream outputs are separate. Platform conversion measures issuer overlap with verified platform/source membership; it does not claim every output was produced by that platform.',
            'sourceStatuses': dict(statuses), 'parserFailures': sum(any(code in (s.get('lastError') or '') for code in ('MALFORMED', 'INVALID_JSON', 'NOT_FEED', 'UNSAFE_OR_OVERSIZED_XML')) for s in sources), 'discoveryStatuses': dict(discovery_statuses), 'platformCompanies': dict(platforms),
            'byExchange': dict(exchanges), 'byMasterListingCountry': dict(countries), 'companies': rows,
            'freshnessWindowsDays': {'news': 180, 'newsBands': [7,30,90,180], 'materialSEC': 90, 'financials': 180},
            'interpretation': 'Material intelligence includes current financials, verified recent reports/material events, current HIGH/CRITICAL accepted news or confirmed upcoming earnings. CIK identity alone is not coverage. External news requires accepted issuer matches from a healthy global source; feeds and domain candidates are not issuer coverage. Document/call references may be historical. noConsumerPayload is unsupported intelligence, not an unsupported master listing.'}
