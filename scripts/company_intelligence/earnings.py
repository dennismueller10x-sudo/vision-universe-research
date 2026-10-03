"""SEC event projection and deterministic summaries of existing normalized facts."""
import json
import math
import re
import statistics
from datetime import date, datetime, timedelta
from pathlib import Path
from .model import ACCESSION, stable_id, timestamp, clean, canonical_url

FORMS = {'8-K', '8-K/A', '10-Q', '10-Q/A', '10-K', '10-K/A', '6-K', '6-K/A', '20-F', '20-F/A', 'DEF 14A'}
METRICS = ['revenue', 'eps_diluted', 'net_income', 'gross_profit', 'operating_income', 'free_cash_flow', 'operating_cash_flow',
           'cash_and_equivalents', 'total_debt', 'capital_expenditures', 'shares_outstanding']
INSTANT = {'cash_and_equivalents', 'total_debt', 'shares_outstanding'}
COLUMNS = ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived']


def valid_unit(metric, unit):
    pattern = 'shares' if metric == 'shares_outstanding' else r'[A-Z]{3}/shares' if metric == 'eps_diluted' else r'[A-Z]{3}'
    return isinstance(unit, str) and bool(re.fullmatch(pattern, unit))


def valid_date(value):
    try:
        return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)) and date.fromisoformat(value) is not None
    except (ValueError, TypeError):
        return False


def comparable(current, prior, kind):
    if not current or not prior or current['unit'] != prior['unit']:
        return False
    gap = (date.fromisoformat(current['periodEnd']) - date.fromisoformat(prior['periodEnd'])).days
    return 300 <= gap <= 430 if kind == 'yoy' else 60 <= gap <= 120


def summary(consumer, cik, now, period=None, fiscal_year=None):
    if (not consumer or consumer.get('schema') != 'vu-consumer-fundamentals-1.0.0' or consumer.get('cik') != cik
            or consumer.get('dataSource', {}).get('isMock') is not False
            or consumer.get('dataSource', {}).get('provider') != 'sec_edgar'
            or consumer.get('columns') != COLUMNS or consumer.get('policy') != 'as_of_latest'
            or not valid_date(consumer.get('asOf')) or consumer['asOf'] > now[:10]):
        return {'state': 'UNAVAILABLE', 'reason': 'INVALID_OR_MISSING_CONSUMER_PROVENANCE'}
    if period == 'FY':
        return annual_summary(consumer, cik, now, fiscal_year)
    tracks = {}
    invalid = []
    for metric in METRICS:
        rows = {}
        unit = consumer.get('units', {}).get(metric)
        if not valid_unit(metric, unit):
            invalid.append(metric)
            continue
        for row in consumer.get('quarterly', {}).get(metric, []):
            if not isinstance(row, list) or len(row) != 7:
                invalid.append(metric)
                rows = {}
                break
            fy, fp, end, value, filed, accn, derived = row
            key = (fy, fp)
            if (type(fy) is not int or fp not in ('Q1', 'Q2', 'Q3', 'Q4') or not valid_date(end)
                    or not valid_date(filed) or end > filed or filed > consumer['asOf']
                    or type(value) not in (int, float) or not math.isfinite(value)
                    or not isinstance(accn, str) or not ACCESSION.fullmatch(accn) or type(derived) is not int or derived not in (0, 1) or key in rows):
                invalid.append(metric)
                rows = {}
                break
            rows[key] = {'value': value, 'unit': unit, 'periodEnd': end, 'filedAt': filed, 'filingId': accn, 'derived': bool(derived)}
        tracks[metric] = rows
    periods = {k for rows in tracks.values() for k in rows}
    if not periods:
        return {'state': 'UNAVAILABLE', 'reason': 'NO_VALID_QUARTERLY_FACTS', 'invalidMetrics': sorted(set(invalid))}
    if period == 'FY':
        # Annual reports must not be represented as one quarter; annual summary uses upstream annual facts.
        return annual_summary(consumer, cik, now, fiscal_year)
    selected = (fiscal_year, period) if fiscal_year and period else max(periods)
    fy, fp = selected
    q = int(fp[-1])
    prev = (fy, 'Q' + str(q - 1)) if q > 1 else (fy - 1, 'Q4')
    year_ago = (fy - 1, fp)
    metrics, changes = {}, []
    for metric in METRICS:
        rows = tracks.get(metric, {})
        current = rows.get(selected)
        data = {'state': 'AVAILABLE' if current else 'UNAVAILABLE', 'reason': None if current else 'MISSING_PERIOD_FACT', 'current': current,
                'previousQuarter': rows.get(prev), 'yearAgoQuarter': rows.get(year_ago)}
        for label, comparison in [('yoy', rows.get(year_ago)), ('qoq', rows.get(prev))]:
            if comparable(current, comparison, label):
                delta = current['value'] - comparison['value']
                data[label] = {'absolute': delta, 'percent': delta / comparison['value'] * 100 if comparison['value'] > 0 else None,
                               'percentReason': None if comparison['value'] > 0 else 'NONPOSITIVE_BASE'}
                if label == 'yoy' and metric in ('revenue', 'net_income', 'free_cash_flow', 'total_debt', 'cash_and_equivalents', 'shares_outstanding'):
                    contextual = metric in ('total_debt', 'cash_and_equivalents', 'shares_outstanding')
                    direction = 'NEUTRAL' if delta == 0 or contextual else 'POSITIVE' if delta > 0 else 'NEGATIVE'
                    changes.append({'metric': metric, 'comparison': 'YEAR_AGO_QUARTER', 'direction': direction,
                                    'classification': 'UNCHANGED' if delta == 0 else 'NOT_COMPARABLE' if contextual else 'IMPROVED' if delta > 0 else 'DETERIORATED',
                                    'previous': comparison['value'], 'current': current['value'], 'absolute': delta, 'unit': current['unit'],
                                    'filingIds': sorted({current['filingId'], comparison['filingId']}), 'interpretation': 'SHARE_COUNT_CHANGE_REQUIRES_SPLIT_ISSUANCE_BUYBACK_CONTEXT' if metric == 'shares_outstanding' else 'BALANCE_CHANGE_HAS_NO_UNIVERSAL_GOOD_DIRECTION' if contextual else 'REPORTED_METRIC_DIRECTION'})
            else:
                data[label] = None
                data[label + 'Reason'] = 'MISSING_OR_NONCOMPARABLE_PERIOD_OR_UNIT'
        ttm_keys = []
        tfy, tq = fy, q
        for _ in range(4):
            ttm_keys.append((tfy, 'Q' + str(tq)))
            tq -= 1
            if tq == 0:
                tfy, tq = tfy - 1, 4
        if metric in INSTANT:
            data['ttm'] = None  # Never sum balance-sheet values or outstanding shares.
        elif metric != 'eps_diluted' and all(k in rows for k in ttm_keys) and len({rows[k]['unit'] for k in ttm_keys}) == 1 and all(comparable(rows[a], rows[b], 'qoq') for a, b in zip(ttm_keys, ttm_keys[1:])):
            ttm_rows = [rows[k] for k in ttm_keys]
            data['ttm'] = {'value': sum(r['value'] for r in ttm_rows), 'unit': ttm_rows[0]['unit'], 'filingIds': sorted({r['filingId'] for r in ttm_rows})}
        else:
            data['ttm'] = None
        metrics[metric] = data
    for name, numerator in [('gross_margin', 'gross_profit'), ('operating_margin', 'operating_income')]:
        def margin(key):
            n, d = tracks.get(numerator, {}).get(key), tracks.get('revenue', {}).get(key)
            if n and d and n['unit'] == d['unit'] and n['periodEnd'] == d['periodEnd'] and d['value'] > 0:
                return {'value': n['value'] / d['value'] * 100, 'unit': 'percent', 'filingIds': sorted({n['filingId'], d['filingId']})}
            return None
        current, previous = margin(selected), margin(year_ago)
        if not comparable(tracks.get(numerator, {}).get(selected), tracks.get(numerator, {}).get(year_ago), 'yoy'):
            previous = None
        metrics[name] = {'state': 'AVAILABLE' if current else 'UNAVAILABLE', 'current': current, 'yearAgoQuarter': previous,
                         'changePercentagePoints': current['value'] - previous['value'] if current and previous else None}
        if current and previous and comparable(tracks.get(numerator, {}).get(selected), tracks.get(numerator, {}).get(year_ago), 'yoy'):
            delta = current['value'] - previous['value']
            changes.append({'metric': name, 'comparison': 'YEAR_AGO_QUARTER', 'direction': 'NEUTRAL' if delta == 0 else 'POSITIVE' if delta > 0 else 'NEGATIVE', 'classification': 'UNCHANGED' if delta == 0 else 'IMPROVED' if delta > 0 else 'DETERIORATED', 'previous': previous['value'], 'current': current['value'], 'absolute': delta, 'unit': 'percentage_points', 'filingIds': sorted(set(current['filingIds'] + previous['filingIds']))})
    revenue = tracks.get('revenue', {})
    prev_year = (prev[0] - 1, prev[1])
    if all(k in revenue for k in (selected, year_ago, prev, prev_year)):
        a, b, c, d = (revenue[k] for k in (selected, year_ago, prev, prev_year))
        if b['value'] > 0 and d['value'] > 0 and comparable(a, b, 'yoy') and comparable(c, d, 'yoy') and comparable(a, c, 'qoq'):
            current_growth, previous_growth = (a['value'] / b['value'] - 1) * 100, (c['value'] / d['value'] - 1) * 100
            delta = current_growth - previous_growth
            changes.append({'metric': 'revenue_growth', 'comparison': 'PREVIOUS_QUARTER_YOY_GROWTH', 'previous': previous_growth, 'current': current_growth,
                            'absolute': delta, 'unit': 'percentage_points', 'direction': 'NEUTRAL' if abs(delta) < 1e-9 else 'POSITIVE' if delta > 0 else 'NEGATIVE',
                            'classification': 'UNCHANGED' if abs(delta) < 1e-9 else 'IMPROVED' if delta > 0 else 'DETERIORATED', 'filingIds': sorted({r['filingId'] for r in (a, b, c, d)})})
    return {'state': 'AVAILABLE' if any(m['state'] == 'AVAILABLE' for m in metrics.values()) else 'UNAVAILABLE',
            'fiscalYear': fy, 'fiscalQuarter': fp, 'metrics': metrics, 'whatChanged': changes,
            'policy': 'LATEST_KNOWN_RETROSPECTIVE', 'pitEligibility': 'NOT_CERTIFIED', 'sourceAsOf': consumer['asOf'],
            'invalidMetrics': sorted(set(invalid)), 'companySpecificKPIs': {'state': 'UNAVAILABLE', 'reason': 'NOT_IN_VALIDATED_CONSUMER_CONTRACT'}}


def annual_summary(consumer, cik, now, fiscal_year):
    # Preserve upstream annual evidence; no attempt to infer Q4 from a 10-K event here.
    metrics, tracks, invalid, changes = {}, {}, [], []
    for metric in METRICS:
        rows = {}
        unit = consumer.get('units', {}).get(metric)
        if not valid_unit(metric, unit):
            invalid.append(metric)
            tracks[metric] = rows
            continue
        for row in consumer.get('annual', {}).get(metric, []):
            if not isinstance(row, list) or len(row) != 7:
                invalid.append(metric)
                rows = {}
                break
            fy, fp, end, value, filed, accn, derived = row
            if (type(fy) is not int or fp != 'FY' or not valid_date(end) or not valid_date(filed) or not end <= filed <= consumer['asOf']
                    or type(value) not in (int, float) or not math.isfinite(value) or not isinstance(accn, str) or not ACCESSION.fullmatch(accn)
                    or type(derived) is not int or derived not in (0, 1) or fy in rows):
                invalid.append(metric)
                rows = {}
                break
            rows[fy] = {'value': value, 'periodEnd': end, 'filedAt': filed, 'filingId': accn, 'unit': unit, 'derived': bool(derived)}
        tracks[metric] = rows
    for metric in METRICS:
        rows = tracks.get(metric, {})
        current, prior = rows.get(fiscal_year), rows.get((fiscal_year or 0) - 1)
        metrics[metric] = {'state': 'AVAILABLE' if current else 'UNAVAILABLE', 'current': current, 'previousYear': prior,
                           'yoyPercent': (current['value'] / prior['value'] - 1) * 100 if comparable(current, prior, 'yoy') and prior['value'] > 0 else None}
        if comparable(current, prior, 'yoy') and metric in ('revenue', 'net_income', 'free_cash_flow', 'total_debt', 'cash_and_equivalents'):
            delta = current['value'] - prior['value']
            changes.append({'metric': metric, 'comparison': 'PREVIOUS_YEAR', 'direction': 'NEUTRAL' if delta == 0 or metric in ('total_debt', 'cash_and_equivalents') else 'POSITIVE' if delta > 0 else 'NEGATIVE', 'classification': 'UNCHANGED' if delta == 0 else 'NOT_COMPARABLE' if metric in ('total_debt', 'cash_and_equivalents') else 'IMPROVED' if delta > 0 else 'DETERIORATED', 'previous': prior['value'], 'current': current['value'], 'absolute': delta, 'unit': current['unit'], 'filingIds': sorted({current['filingId'], prior['filingId']})})
    for name, numerator in [('gross_margin', 'gross_profit'), ('operating_margin', 'operating_income')]:
        def margin(year):
            n, d = tracks.get(numerator, {}).get(year), tracks.get('revenue', {}).get(year)
            if n and d and n['unit'] == d['unit'] and n['periodEnd'] == d['periodEnd'] and d['value'] > 0:
                return {'value': n['value'] / d['value'] * 100, 'unit': 'percent', 'filingIds': sorted({n['filingId'], d['filingId']})}
            return None
        current, prior = margin(fiscal_year), margin((fiscal_year or 0) - 1)
        if not comparable(tracks.get(numerator, {}).get(fiscal_year), tracks.get(numerator, {}).get((fiscal_year or 0) - 1), 'yoy'):
            prior = None
        delta = current['value'] - prior['value'] if current and prior else None
        metrics[name] = {'state': 'AVAILABLE' if current else 'UNAVAILABLE', 'current': current, 'previousYear': prior, 'changePercentagePoints': delta}
        if delta is not None:
            changes.append({'metric': name, 'comparison': 'PREVIOUS_YEAR', 'direction': 'NEUTRAL' if delta == 0 else 'POSITIVE' if delta > 0 else 'NEGATIVE', 'absolute': delta, 'unit': 'percentage_points'})
    return {'state': 'AVAILABLE' if any(m['state'] == 'AVAILABLE' for m in metrics.values()) else 'UNAVAILABLE', 'fiscalYear': fiscal_year,
            'fiscalQuarter': None, 'periodType': 'FY', 'metrics': metrics, 'whatChanged': changes, 'invalidMetrics': sorted(set(invalid)),
            'policy': 'LATEST_KNOWN_RETROSPECTIVE', 'pitEligibility': 'NOT_CERTIFIED', 'sourceAsOf': consumer['asOf'],
            'companySpecificKPIs': {'state': 'UNAVAILABLE', 'reason': 'NOT_IN_VALIDATED_CONSUMER_CONTRACT'}}


def filing_url(cik, accession, document=None):
    if not ACCESSION.fullmatch(accession) or not re.fullmatch(r'\d{10}', cik):
        return None
    base = f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace("-", "")}/'
    if document and re.fullmatch(r'[\w.-]+', document):
        return base + document
    return base + accession + '-index.html'


def project_sec(company, canonical, submissions, consumer, now, canonical_cik=None):
    cik, cid = company['cik'], company['companyId']
    if not cik:
        return []
    rows, fiscal = {}, {}
    summaries = {}
    def metric_summary(period=None, fiscal_year=None):
        key = (period, fiscal_year)
        if key not in summaries:
            summaries[key] = summary(consumer, cik, now, period, fiscal_year)
        return summaries[key]
    if canonical:
        security = canonical.get('security', {})
        # Canonical stores CIK in providerIdentity or profile? Exact authoritative bundle proof through accession+security ticker below.
        expected = {l['symbol'] for l in company['listings']}
        if canonical_cik != cik or security.get('ticker') not in expected or canonical.get('dataSource', {}).get('isMock') is not False:
            raise ValueError('CANONICAL_COMPANY_MISMATCH')
        for f in canonical.get('filings', []):
            acc = f.get('filingId')
            if isinstance(acc, str) and ACCESSION.fullmatch(acc):
                rows[acc] = {'accession': acc, 'form': f.get('formType'), 'filed': f.get('filedAt'), 'periodEnd': f.get('periodEnd')}
                fiscal[acc] = {k: f.get(k) for k in ('fiscalPeriod', 'fiscalYear', 'periodEnd')}
    if submissions:
        if str(submissions.get('cik', '')).zfill(10) != cik:
            raise ValueError('SUBMISSIONS_COMPANY_MISMATCH')
        columns = submissions.get('filings', {}).get('recent', {})
        for index, acc in enumerate(columns.get('accessionNumber', [])):
            if not isinstance(acc, str) or not ACCESSION.fullmatch(acc):
                continue
            def cell(name):
                values = columns.get(name, [])
                return values[index] if index < len(values) else None
            rows[acc] = {**rows.get(acc, {}), 'accession': acc, 'form': cell('form'), 'filed': cell('filingDate'),
                         'periodEnd': cell('reportDate') if cell('form') in ('10-Q', '10-Q/A', '10-K', '10-K/A', '20-F', '20-F/A') else rows.get(acc, {}).get('periodEnd'),
                         'accepted': cell('acceptanceDateTime'), 'items': cell('items'), 'document': cell('primaryDocument'), 'description': cell('primaryDocDescription'), 'documentEvidence': submissions.get('_intelligenceDocumentEvidence', {}).get(acc)}
    events = []
    for acc, f in sorted(rows.items()):
        form, filed = f.get('form'), f.get('filed')
        if form not in FORMS or not valid_date(filed) or filed > now[:10]:
            continue
        if acc not in fiscal and consumer and consumer.get('cik') == cik:
            block = 'annual' if form in ('10-K', '10-K/A', '20-F', '20-F/A') else 'quarterly'
            years = [r[0] for rows in consumer.get(block, {}).values() for r in rows if isinstance(r, list) and len(r) == 7 and type(r[0]) is int]
            validated = metric_summary('FY' if block == 'annual' else None, max(years) if years else None)
            if validated.get('state') == 'AVAILABLE':
                candidates = []
                report_end = f.get('periodEnd')
                for metric in METRICS:
                    for row in consumer.get(block, {}).get(metric, []):
                        if (isinstance(row, list) and len(row) == 7 and valid_date(row[2]) and row[2] <= filed and type(row[0]) is int
                                and ((valid_date(report_end) and row[2] == report_end) or (not report_end and row[5] == acc and block != 'annual'))):
                            candidates.append(row)
                if candidates:
                    end = report_end if valid_date(report_end) else max(r[2] for r in candidates)
                    keys = {(r[0], r[1]) for r in candidates if r[2] == end}
                    if len(keys) == 1:
                        year, period = next(iter(keys))
                        fiscal[acc] = {'fiscalYear': year, 'fiscalPeriod': period, 'periodEnd': end}
        url = filing_url(cik, acc, f.get('document'))
        base = {'companyId': cid, 'cik': cik, 'filingId': acc, 'form': form, 'publishedAt': timestamp(f.get('accepted')), 'publishedDate': filed,
                'timestampPrecision': 'ACCEPTANCE_TIME' if timestamp(f.get('accepted')) else 'FILING_DATE', 'date': filed,
                'sourceDocuments': [{'type': 'SEC_FILING', 'url': url, 'filingId': acc}], 'sourceUrl': url,
                'discoveredAt': now, 'reportingPeriod': fiscal.get(acc, {}).get('periodEnd') or f.get('periodEnd'), 'fiscalQuarter': fiscal.get(acc, {}).get('fiscalPeriod'),
                'fiscalYear': fiscal.get(acc, {}).get('fiscalYear'), 'eventStatus': 'PUBLISHED', 'isAmendment': form.endswith('/A')}
        events.append({**base, 'eventId': stable_id(cid, acc, 'SEC_FILING'), 'eventType': 'SEC_FILING', 'headline': form + ' filing'})
        items = set(re.findall(r'\d+\.\d{2}', str(f.get('items') or '')))
        from .sec_events import material_event
        material = material_event(base, items)
        if material:
            events.append(material)
        release = form.startswith('8-K') and '2.02' in items
        # 6-K is not itself proof of earnings. Require explicit primary-document metadata.
        foreign_release = form.startswith('6-K') and bool(re.search(r'earnings|(?:quarter|financial|annual).{0,25}results', f.get('description') or '', re.I))
        if form.startswith('6-K') and (f.get('documentEvidence') or {}).get('outcome') in ('EARNINGS_RELEASE', 'OPERATING_RESULTS'):
            foreign_release = True
        periodic = form.rstrip('/A') in ('10-Q', '10-K', '20-F')
        if not (release or foreign_release or periodic):
            continue
        document_evidence = f.get('documentEvidence') or {}
        outcome = document_evidence.get('outcome')
        if form.startswith('6-K') and outcome == 'EARNINGS_RELEASE':
            foreign_release = True
        # Primary-description words identify candidates, not verified releases.
        # In particular, contradictory inspected future/operating evidence wins.
        kind = ('OPERATING_RESULTS_PUBLISHED' if outcome == 'OPERATING_RESULTS' else 'EARNINGS_PUBLISHED' if outcome == 'EARNINGS_RELEASE' else 'EARNINGS_CANDIDATE') if release or foreign_release else 'PERIODIC_REPORT_PUBLISHED'
        if document_evidence.get('period') and not base['fiscalQuarter']:
            base.update(document_evidence['period'])
        if document_evidence.get('periodEnd') and not base['fiscalQuarter']:
            block = 'annual' if form in ('10-K','20-F') else 'quarterly'
            keys = {(r[0], r[1]) for rows in (consumer or {}).get(block, {}).values() for r in rows if isinstance(r, list) and len(r) == 7 and r[2] == document_evidence['periodEnd']}
            if len(keys) == 1:
                year, quarter = next(iter(keys))
                base.update(fiscalYear=year, fiscalQuarter=quarter, reportingPeriod=document_evidence['periodEnd'])
        if document_evidence.get('sourceDocuments'):
            base['sourceDocuments'] += document_evidence['sourceDocuments']
        info = metric_summary(base['fiscalQuarter'], base['fiscalYear']) if base['fiscalQuarter'] and base['fiscalYear'] else {'state': 'UNAVAILABLE', 'reason': 'RELEASE_REPORTING_PERIOD_NOT_VERIFIED'}
        if not base['reportingPeriod'] and info.get('state') == 'AVAILABLE':
            current = info.get('metrics', {}).get('revenue', {}).get('current')
            if current:
                base['reportingPeriod'] = current.get('periodEnd')
        events.append({**base, 'eventId': stable_id(cid, acc, 'RESULTS_EVENT'), 'eventType': kind,
                       'headline': 'Earnings published' if kind == 'EARNINGS_PUBLISHED' else 'Possible earnings release' if kind == 'EARNINGS_CANDIDATE' else 'Operating results published' if kind == 'OPERATING_RESULTS_PUBLISHED' else 'Periodic financial report published',
                       'detectionEvidence': ['SEC_DOCUMENT_EXPLICIT_EARNINGS_RELEASE'] if outcome == 'EARNINGS_RELEASE' else ['SEC_DOCUMENT_OPERATING_RESULTS'] if outcome == 'OPERATING_RESULTS' else ['8-K_ITEM_2.02_CANDIDATE'] if release else ['6-K_RESULTS_DESCRIPTION_CANDIDATE'] if foreign_release else ['PERIODIC_REPORT_FORM'],
                       'summary': info, 'earningsReleaseUrl': document_evidence.get('sourceUrl') or url if kind == 'EARNINGS_PUBLISHED' else None,
                       'documentEvidence': {k: v for k, v in document_evidence.items() if k != 'exhibits'},
                       'eventStatus': 'UNVERIFIED' if kind == 'EARNINGS_CANDIDATE' else 'PUBLISHED',
                       'quarterlyReportUrl': url if periodic else None, 'guidance': {'state': 'EVIDENCE_AVAILABLE' if document_evidence.get('guidance') else 'UNAVAILABLE', 'ranges': document_evidence.get('guidance', []), 'reason': None if document_evidence.get('guidance') else 'NO_VALIDATED_GUIDANCE_DOCUMENT'},
                       'companyKPIs': document_evidence.get('companyKPIs', []),
                       'transcriptUrl': None})
    return events


def estimate_calendar(company, events, now):
    """Conservative seasonal ranges; periodic-report proxies are explicitly lower confidence."""
    today = date.fromisoformat(now[:10])
    known = [e for e in events if e['eventType'] in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED') and e.get('fiscalQuarter') and not e.get('isAmendment')
             and type(e.get('fiscalYear')) is int and valid_date(e.get('date')) and e['date'] <= now[:10]]
    by_quarter = {}
    for e in known:
        by_quarter.setdefault(e['fiscalQuarter'], {})[e.get('fiscalYear')] = e
    results = []
    for quarter, years in by_quarter.items():
        samples = sorted(years.values(), key=lambda e: e['date'])[-5:]
        if len(samples) < 3:
            continue
        # Require recent history, never extend an old or delisted issuer's calendar forever.
        latest = date.fromisoformat(samples[-1]['date'])
        if (today - latest).days > 450:
            continue
        offsets = [(date.fromisoformat(e['date']) - date(date.fromisoformat(e['date']).year, 1, 1)).days for e in samples]
        median = int(statistics.median(offsets))
        spread = max(7, int(max(abs(x - median) for x in offsets)) + 3)
        if spread > 30:
            continue
        for year in (today.year, today.year + 1):
            center = date(year, 1, 1) + timedelta(days=median)
            start, end = center - timedelta(days=spread), center + timedelta(days=spread)
            if end < today or start > today + timedelta(days=120):
                continue
            # A window can overlap today after the actual quarter has already
            # been reported. Fiscal years may differ from publication years:
            # compare the known season/date, not FY == calendar year.
            if any(e['eventType'] in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED') and not e.get('isAmendment')
                   and e.get('fiscalQuarter') == quarter and valid_date(e.get('date')) and e['date'] <= now[:10]
                   and date.fromisoformat(e['date']).year == year
                   and abs((date.fromisoformat(e['date']) - center).days) <= 30 for e in events):
                continue
            if any(e['eventType'] in ('EARNINGS_SCHEDULED', 'EARNINGS_CALL') and e.get('confirmationStatus') == 'CONFIRMED'
                   and e.get('date') and abs((date.fromisoformat(e['date']) - center).days) <= 30 for e in events):
                continue
            proxy = any(e['eventType'] != 'EARNINGS_PUBLISHED' for e in samples)
            results.append({'eventId': stable_id(company['companyId'], 'estimate', quarter, year), 'companyId': company['companyId'],
                            'eventType': 'EARNINGS_ESTIMATED', 'headline': 'Estimated earnings window', 'date': start.isoformat(),
                            'dateStart': start.isoformat(), 'dateEnd': end.isoformat(), 'time': None, 'timezone': None,
                            'confirmationStatus': 'ESTIMATED', 'confidence': .4 if proxy else .65, 'fiscalQuarter': quarter,
                            'methodology': 'SEASONAL_MEDIAN_PERIODIC_REPORT_PROXY' if proxy else 'SEASONAL_MEDIAN_EARNINGS_RELEASE',
                            'evidence': [{'date': e['date'], 'filingId': e.get('filingId'), 'eventType': e['eventType']} for e in samples],
                            'discoveredAt': now, 'updatedAt': now})
    return results
