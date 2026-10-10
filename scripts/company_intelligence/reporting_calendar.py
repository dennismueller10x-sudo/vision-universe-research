"""Reporting-history proxies, never official earnings dates or point-in-time financials.

Short-lag original-period facts can establish a filing observation. Comparative
facts filed a year later are deliberately excluded. Forecasts identify their
proxy target and retain all input dates/accessions for reproducibility.
"""
import math
import statistics
from datetime import date, timedelta
from .earnings import ACCESSION, COLUMNS, METRICS, INSTANT, valid_date, valid_unit
from .model import stable_id

VERSION = 'reporting-lag-1.0.0'


def fact_history(consumer, cik, now):
    if (not consumer or consumer.get('cik') != cik or consumer.get('schema') != 'vu-consumer-fundamentals-1.0.0'
            or consumer.get('columns') != COLUMNS or consumer.get('policy') != 'as_of_latest'
            or consumer.get('dataSource', {}).get('provider') != 'sec_edgar' or consumer.get('dataSource', {}).get('isMock') is not False
            or not valid_date(consumer.get('asOf')) or consumer['asOf'] > now[:10]):
        return []
    periods = {}
    for block in ('quarterly', 'annual'):
        for metric in set(METRICS) - INSTANT:
            if not valid_unit(metric, consumer.get('units', {}).get(metric)):
                continue
            for r in consumer.get(block, {}).get(metric, []):
                if not isinstance(r, list) or len(r) != 7:
                    continue
                fy, fp, end, value, filed, acc, derived = r
                if (type(fy) is not int or fp not in (('FY',) if block == 'annual' else ('Q1','Q2','Q3','Q4'))
                        or not valid_date(end) or not valid_date(filed) or not end < filed <= now[:10]
                        or type(value) not in (int,float) or not math.isfinite(value)
                        or not isinstance(acc,str) or not ACCESSION.fullmatch(acc) or derived not in (0,1)):
                    continue
                lag = (date.fromisoformat(filed) - date.fromisoformat(end)).days
                # A later comparative/restatement is not a first publication.
                if not 8 <= lag <= (150 if block == 'annual' else 100):
                    continue
                quarter = 'Q4' if fp == 'FY' else fp
                key = (end, fy, quarter)
                observation = {'date': filed, 'reportingPeriod': end, 'fiscalYear': fy, 'fiscalQuarter': quarter,
                               'periodType': 'ANNUAL' if block == 'annual' or quarter == 'Q4' else 'QUARTER',
                               'filingId': acc, 'eventType': 'XBRL_FILING_PROXY', 'evidenceMetric': metric}
                if key not in periods or filed < periods[key]['date']:
                    periods[key] = observation
    # Conflicting fiscal labels for the same end cannot establish cadence.
    ends = {}
    for key, value in periods.items():
        ends.setdefault(key[0], []).append(value)
    return sorted([rows[0] for rows in ends.values() if len(rows) == 1], key=lambda r: r['reportingPeriod'])[-48:]


def observations(events, history, today):
    periods = {}
    rank = {'EARNINGS_PUBLISHED': 0, 'PERIODIC_REPORT_PUBLISHED': 1, 'XBRL_FILING_PROXY': 2}
    for row in list(events) + list(history):
        kind, end, filed = row.get('eventType'), row.get('reportingPeriod'), row.get('date')
        if (kind not in rank or row.get('isAmendment') or not valid_date(end) or not valid_date(filed)
                or filed > today or end >= filed or row.get('fiscalQuarter') not in ('Q1','Q2','Q3','Q4','FY')
                or type(row.get('fiscalYear')) is not int):
            continue
        quarter = 'Q4' if row['fiscalQuarter'] == 'FY' else row['fiscalQuarter']
        annual = quarter == 'Q4' or row.get('form') in ('10-K','20-F')
        lag = (date.fromisoformat(filed) - date.fromisoformat(end)).days
        if not 0 < lag <= (150 if annual else 100):
            continue
        value = {k: row.get(k) for k in ('date','reportingPeriod','fiscalYear','filingId','eventType')}
        value.update(fiscalQuarter=quarter, periodType='ANNUAL' if annual else 'QUARTER')
        key = end
        current = periods.get(key)
        if current and (current['fiscalQuarter'],current['fiscalYear']) != (quarter,row['fiscalYear']):
            periods[key] = {**current, 'conflict': True}
        elif not current or (not current.get('conflict') and (rank[kind],filed) < (rank[current['eventType']],current['date'])):
            periods[key] = value
    return sorted([v for v in periods.values() if not v.get('conflict')],key=lambda r:r['reportingPeriod'])


def forecast(company, events, history, now, diagnostics=None):
    def unavailable(reason):
        if diagnostics is not None: diagnostics.update(state='UNAVAILABLE', reason=reason)
        return []
    today = date.fromisoformat(now[:10])
    rows = observations(events,history,now[:10])
    if len(rows) < 3:
        return unavailable('INSUFFICIENT_ORIGINAL_REPORT_HISTORY')
    latest = rows[-1]
    last_end = date.fromisoformat(latest['reportingPeriod'])
    # Missing recent reporting cannot become a rolling fictional future calendar.
    if (today - date.fromisoformat(latest['date'])).days > (450 if all(r['periodType']=='ANNUAL' for r in rows) else 180):
        return unavailable('STALE_REPORT_HISTORY')
    only_annual = all(r['periodType']=='ANNUAL' for r in rows)
    q = 'Q4' if only_annual else 'Q' + str(int(latest['fiscalQuarter'][1]) % 4 + 1)
    fy = latest['fiscalYear'] + (1 if latest['fiscalQuarter']=='Q4' else 0)
    seasonal = [r for r in rows if r['fiscalQuarter']==q][-5:]
    annual = q == 'Q4'
    pool = seasonal if len(seasonal)>=2 else [r for r in rows if (r['periodType']=='ANNUAL')==annual][-8:]
    if len(pool)<(2 if len(seasonal)>=2 else 3):
        return unavailable('INSUFFICIENT_COMPARABLE_PERIOD_LAGS')
    # Use the actual prior-year fiscal end (52/53-week variation stays in range).
    if seasonal:
        prior = date.fromisoformat(seasonal[-1]['reportingPeriod'])
        step = fy - seasonal[-1]['fiscalYear']
        if step != 1:
            return unavailable('MISSING_PRIOR_YEAR_FISCAL_SEASON')
        target_end = prior.replace(year=prior.year+1, day=min(prior.day,28)) if prior.month==2 else prior.replace(year=prior.year+1)
    else:
        target_end = last_end + timedelta(days=91)
    gap = (target_end-last_end).days
    if not ((300<=gap<=430) if only_annual else (65<=gap<=115)):
        return unavailable('CHANGED_FISCAL_CALENDAR_OR_CADENCE')
    lags = [(date.fromisoformat(r['date'])-date.fromisoformat(r['reportingPeriod'])).days for r in pool]
    median = int(statistics.median(lags))
    deviation = max(abs(n-median) for n in lags)
    if deviation > 25:
        return unavailable('UNSTABLE_REPORTING_LAGS')
    proxy = any(r['eventType']!='EARNINGS_PUBLISHED' for r in pool)
    center = target_end + timedelta(days=median)
    # Report proxies may follow the release; do not pretend the filing day is earnings.
    before = max(14 if proxy else 7, deviation+5)
    after = max(7, deviation+5)
    start,end = center-timedelta(days=before),center+timedelta(days=after)
    if end < today or start > today+timedelta(days=120):
        return unavailable('NO_FUTURE_WINDOW_WITHIN_HORIZON')
    if any(e.get('eventType') in ('EARNINGS_CALL','EARNINGS_SCHEDULED') and e.get('confirmationStatus')=='CONFIRMED'
           and start.isoformat()<=e.get('date','')<=end.isoformat() for e in events):
        return unavailable('OFFICIAL_CONFIRMATION_SUPERSEDES_ESTIMATE')
    if diagnostics is not None: diagnostics.update(state='AVAILABLE', reason='REPORTING_HISTORY_FORECAST', sampleCount=len(pool))
    return [{'eventId':stable_id(company['companyId'],'reporting-estimate',fy,q),'companyId':company['companyId'],
             'eventType':'EARNINGS_ESTIMATED','headline':'Estimated results window','date':start.isoformat(),
             'dateStart':start.isoformat(),'dateEnd':end.isoformat(),'time':None,'timezone':None,
             'fiscalQuarter':q,'fiscalYear':fy,'periodType':'ANNUAL' if annual else 'QUARTER','reportingPeriodEstimated':target_end.isoformat(),
             'confirmationStatus':'ESTIMATED','confidence':.45 if proxy else .7,
             'confidenceLabel':'LOW' if proxy else 'MEDIUM','predictionTarget':'PERIODIC_REPORT_PROXY' if proxy else 'EARNINGS_RELEASE',
             'methodology':'FISCAL_END_AND_REPORTING_LAG_PROXY' if proxy else 'FISCAL_END_AND_RELEASE_LAG',
             'estimatorVersion':VERSION,'evidence':pool,'sampleCount':len(pool),'medianLagDays':median,
             'windowWidthDays':(end-start).days,'discoveredAt':now,'updatedAt':now}]
