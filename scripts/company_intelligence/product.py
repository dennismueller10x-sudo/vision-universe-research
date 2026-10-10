"""Consumer projection only. Operational records and fiscal facts stay unchanged."""
from copy import deepcopy
from datetime import datetime, timedelta
from .model import stable_id, canonical_url


def bundles(payload):
    cid = payload['companyId']
    groups = {}
    for event in payload.get('earnings', []):
        if event.get('eventType') not in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED') or event.get('isAmendment'):
            continue
        period = event.get('reportingPeriod')
        # Report-end evidence is necessary for cross-record grouping. Unknown stays separate.
        key = (period, event.get('fiscalYear'), event.get('fiscalQuarter')) if period else (event['eventId'],)
        groups.setdefault(key, []).append(event)
    out = []
    for records in groups.values():
        first = records[0]
        ids = {e['eventId'] for e in records}
        calls = [c for c in payload.get('calls', []) if c.get('earningsEventId') in ids]
        docs = [d for d in payload.get('materials', []) if d.get('eventId') in ids or
                (first.get('reportingPeriod') and d.get('reportingPeriod') == first['reportingPeriod'] and
                 d.get('fiscalYear') == first.get('fiscalYear') and d.get('fiscalQuarter') == first.get('fiscalQuarter'))]
        for call in calls:
            for field, kind in [('webcastUrl', 'WEBCAST'), ('replayUrl', 'REPLAY'), ('transcriptUrl', 'COMPANY_TRANSCRIPT')]:
                if canonical_url(call.get(field)):
                    docs.append({'companyId': cid, 'type': kind, 'url': call[field], 'eventId': call['eventId']})
        financials = payload.get('latestFinancials', {})
        exact = bool(first.get('reportingPeriod')) and financials.get('reportingPeriod') == first['reportingPeriod'] and financials.get('fiscalYear') == first.get('fiscalYear') and financials.get('fiscalQuarter') == first.get('fiscalQuarter')
        out.append({'bundleId': stable_id(cid, 'earnings-bundle', first.get('reportingPeriod') or first['eventId'], first.get('fiscalYear'), first.get('fiscalQuarter')),
                    'companyId': cid, 'eventType': 'EARNINGS_BUNDLE', 'reportingPeriod': first.get('reportingPeriod'),
                    'fiscalYear': first.get('fiscalYear'), 'fiscalQuarter': first.get('fiscalQuarter'),
                    'date': max(e.get('date') or e.get('publishedAt', '')[:10] for e in records),
                    'verificationState': 'VERIFIED_EARNINGS_RELEASE' if any(e['eventType'] == 'EARNINGS_PUBLISHED' for e in records) else 'PERIODIC_REPORT',
                    'eventIds': sorted(ids), 'callIds': [c['eventId'] for c in calls],
                    'materials': list({canonical_url(d['url']): d for d in docs if canonical_url(d.get('url'))}.values())[:20],
                    'financials': financials if exact else {'state': 'UNAVAILABLE', 'reason': 'NO_EXACT_PERIOD_SUMMARY'},
                    'linkageEvidence': 'EXACT_ISSUER_REPORT_END_AND_FISCAL_LABELS'})
    return sorted(out, key=lambda b: b['date'], reverse=True)[:6]


def project(payload):
    """Bounded public view. Remove private source health, checkpoints and rejected candidates."""
    value = deepcopy({k: payload[k] for k in ('schema', 'companyId', 'companyName', 'listings', 'generatedAt', 'state', 'latestFinancials', 'previewBasis') if k in payload})
    now = datetime.fromisoformat(payload['generatedAt'].replace('Z', '+00:00'))
    from .profiles import public_profile
    profile = public_profile(payload.get('companyProfile'), payload['companyId'], payload['generatedAt'])
    from .editorial import german_profile
    profile = german_profile(profile)
    if profile:
        value['companyProfile'] = profile
    news_cutoff = (now - timedelta(days=180)).date().isoformat()
    event_cutoff = (now - timedelta(days=90)).date().isoformat()
    for key, cap in [('news', 20), ('earnings', 12), ('events', 15), ('calls', 10), ('filings', 8), ('materials', 30), ('presentations', 15), ('materialEvents', 15), ('timeline', 30)]:
        rows = payload.get(key, [])
        if key == 'earnings':
            rows = [e for e in rows if e.get('eventType') != 'EARNINGS_CANDIDATE']
        if key == 'news':
            rows = [e for e in rows if (e.get('publishedAt') or e.get('publishedDate') or e.get('observedAt') or '')[:10] >= news_cutoff]
        if key in ('materialEvents', 'timeline'):
            rows = [e for e in rows if (e.get('date') or e.get('publishedAt') or e.get('publishedDate') or e.get('observedAt') or '')[:10] >= event_cutoff and e.get('eventType') not in ('SEC_FILING', 'EARNINGS_CANDIDATE', 'EARNINGS_ESTIMATED')]
        if key == 'materials' and len(rows) > cap:
            # A long report archive must not hide the latest available remarks,
            # transcript or webcast. Preserve order and the same payload bound.
            represented = {}
            for position, row in enumerate(rows):
                kind = row.get('type')
                if kind in ('COMPANY_TRANSCRIPT', 'PREPARED_REMARKS', 'SHAREHOLDER_LETTER',
                            'MANAGEMENT_COMMENTARY', 'CALL_RECORDING', 'WEBCAST', 'EARNINGS_WEBCAST', 'PRESENTATION'):
                    represented.setdefault(kind, position)
            protected = set(represented.values())
            selected = set(range(cap))
            for position in sorted(protected - selected):
                selected.remove(max(selected - protected))
                selected.add(position)
            rows = [rows[position] for position in sorted(selected)]
        value[key] = deepcopy(rows[:cap])
    value['earningsBundles'] = bundles({**payload, 'earnings': value['earnings'], 'calls': value['calls']})
    bundled = {eid for b in value['earningsBundles'] for eid in b['eventIds'] + b['callIds']}
    value['timeline'] = [e for e in value['timeline'] if e.get('eventId') not in bundled]
    for bundle in value['earningsBundles']:
        if bundle['date'] >= event_cutoff:
            value['timeline'].append({k: bundle[k] for k in ('companyId', 'bundleId', 'eventType', 'date', 'fiscalYear', 'fiscalQuarter', 'reportingPeriod', 'verificationState')})
    value['timeline'] = sorted(value['timeline'], key=lambda e: e.get('date') or e.get('publishedAt') or '', reverse=True)[:30]
    value['coverage'] = {'newsGuarantee': False, 'operationalDetailsPublic': False}
    # Neutral numeric directions are observable even when investment interpretation is unavailable.
    for change in value.get('latestFinancials', {}).get('whatChanged', []):
        if change.get('classification') == 'UNCHANGED' or change.get('absolute') == 0:
            change['displayClassification'] = 'UNCHANGED'
            continue
        change['displayClassification'] = ('ACCELERATED' if change.get('absolute', 0) > 0 else 'DECELERATED') if change['metric'] == 'revenue_growth' and change.get('absolute') else ('EXPANDED' if change.get('absolute', 0) > 0 else 'CONTRACTED') if change['metric'].endswith('_margin') and change.get('absolute') else ('INCREASED' if change.get('absolute', 0) > 0 else 'DECREASED') if change.get('classification') == 'NOT_COMPARABLE' and change.get('absolute') is not None else change.get('classification', 'NOT_COMPARABLE')
    return value
