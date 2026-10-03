"""Walk-forward date-only reporting proxy backtest; no future observation inputs.

Latest-known XBRL is not a certified historical snapshot. These tests measure
filing/release date prediction, not PIT financials or a universal earnings API.
"""
import argparse
import json
import statistics
from collections import defaultdict, Counter
from datetime import date, timedelta
from pathlib import Path
from .model import load_universe
from .reporting_calendar import fact_history, forecast, observations, VERSION
from .store import Store, atomic_json


def measure(cases):
    return {'predictions':len(cases),'issuers':len({r['companyId'] for r in cases}),
            'windowHitRate':round(sum(r['hit'] for r in cases)/len(cases),4) if cases else None,
            'medianWindowDays':statistics.median(r['windowDays'] for r in cases) if cases else None,
            'medianAbsoluteErrorDays':statistics.median(r['errorDays'] for r in cases) if cases else None}


def evaluate(root, store, now):
    companies=load_universe(root)
    events=defaultdict(list)
    for cid,p in store.db.execute("SELECT company,payload FROM events WHERE kind IN ('EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED','EARNINGS_SCHEDULED','EARNINGS_CALL')"):
        events[cid].append(json.loads(p))
    cases, forecasts, eligible, history_issuers = [], [], 0, 0
    abstentions = Counter(); sufficient_history = 0
    for cid,c in companies.items():
        path=root/'quant/data/sec/consumer'/('CIK'+str(c['cik'])+'.json')
        h=fact_history(json.loads(path.read_text()) if path.exists() else None,c['cik'],now)
        history_issuers+=bool(h)
        rows=observations(events[cid],h,now[:10])
        sufficient_history += len(rows) >= 3
        diagnostic = {}
        prediction = forecast(c,events[cid],h,now,diagnostic)
        forecasts.extend(prediction)
        if not prediction: abstentions[diagnostic['reason']] += 1
        foreign=any(e.get('form')=='20-F' for e in events[cid])
        annuals=[r for r in rows if r['periodType']=='ANNUAL']
        non_calendar=bool(annuals and annuals[-1]['reportingPeriod'][5:10] not in ('12-31','12-30','12-29','12-28'))
        for target in rows:
            origin=(date.fromisoformat(target['reportingPeriod'])-timedelta(days=20)).isoformat()
            if origin<'2023-01-01':continue
            eligible+=1
            past=[r for r in rows if r['date']<origin and r['reportingPeriod']<target['reportingPeriod']]
            predicted=forecast(c,[],past,origin+'T12:00:00Z')
            if not predicted or (predicted[0]['fiscalYear'],predicted[0]['fiscalQuarter'])!=(target['fiscalYear'],target['fiscalQuarter']):continue
            p=predicted[0]
            assert all(e['date']<origin for e in p['evidence']), 'BACKTEST_LOOKAHEAD'
            lo,hi,actual=map(date.fromisoformat,(p['dateStart'],p['dateEnd'],target['date']))
            cases.append({'companyId':cid,'symbol':c['listings'][0]['symbol'],'origin':origin,'actual':target['date'],
                          'dateStart':p['dateStart'],'dateEnd':p['dateEnd'],'target':target['eventType'],
                          'hit':lo<=actual<=hi,'windowDays':(hi-lo).days,'errorDays':abs((actual-(lo+(hi-lo)//2)).days),
                          'nonCalendarFiscalYear':non_calendar,'foreignReportEvidence':foreign})
    return {'estimatorVersion':VERSION,'asOf':now,'totalIssuers':len(companies),'historyIssuers':history_issuers,
            'sufficientHistoryIssuers':sufficient_history,'currentAbstentions':dict(abstentions),
            'forecastIssuers':len({f['companyId'] for f in forecasts}),'eligibleHistoricalTargets':eligible,
            'overall':measure(cases),'byTarget':{k:measure([r for r in cases if r['target']==k]) for k in sorted({r['target'] for r in cases})},
            'byFiscalCalendar':{k:measure([r for r in cases if r['nonCalendarFiscalYear']==v]) for k,v in [('nonCalendar',True),('calendar',False)]},
            'byReportEvidence':{k:measure([r for r in cases if r['foreignReportEvidence']==v]) for k,v in [('20FPresent',True),('no20FObserved',False)]},
            'limitations':['Original short-lag filings are proxies; reporting prediction is not guaranteed earnings-release accuracy.',
                          'Current XBRL facts are retrospective; only observation dates before origin enter each forecast.',
                          'Unobserved foreign forms cannot establish domicile. Sparse/changed cadence remains unavailable.'],
            'cases':cases,'forecasts':forecasts}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--state',type=Path,default=Path('.company-intelligence/state.sqlite'));p.add_argument('--as-of',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    result=evaluate(a.root.resolve(),Store(a.state),a.as_of);atomic_json(a.out,result)
    print(json.dumps({k:v for k,v in result.items() if k not in ('cases','forecasts')}))
if __name__=='__main__':main()
