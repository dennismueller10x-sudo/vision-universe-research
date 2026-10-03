import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.reporting_calendar import fact_history, forecast, observations
from test_engine import company, consumer, NOW

class ReportingCalendarTests(unittest.TestCase):
    def test_comparative_restatement_dates_cannot_be_original_reports(self):
        d=consumer();h=fact_history(d,company()['cik'],NOW)
        self.assertTrue(h)
        d['quarterly']['revenue'][0][4]='2026-09-01'
        d['quarterly']={'revenue':[d['quarterly']['revenue'][0]]}
        self.assertEqual(fact_history(d,company()['cik'],NOW),[])
    def test_missing_or_wrong_provenance_future_and_bad_accession_rejected(self):
        for mutation in ['cik','future','acc','mock']:
            d=consumer()
            if mutation=='cik':d['cik']='0000000001'
            if mutation=='future':d['asOf']='2027-01-01'
            if mutation=='mock':d['dataSource']['isMock']=True
            if mutation=='acc':
                for rs in d['quarterly'].values():
                    for r in rs:r[5]='bad'
            self.assertFalse(fact_history(d,company()['cik'],NOW),mutation)
    def test_three_quarters_unlock_next_window_with_honest_proxy_label(self):
        now='2026-06-01T12:00:00Z'
        d=consumer();d['asOf']=now[:10]
        h=fact_history(d,company()['cik'],now)
        p=forecast(company(),[],h,now)[0]
        self.assertEqual((p['fiscalQuarter'],p['fiscalYear']),('Q3',2026))
        self.assertEqual(p['confirmationStatus'],'ESTIMATED')
        self.assertEqual(p['predictionTarget'],'PERIODIC_REPORT_PROXY')
        self.assertGreaterEqual(p['windowWidthDays'],21)
    def test_sparse_stale_and_irregular_histories_do_not_roll_forever(self):
        h=fact_history(consumer(),company()['cik'],NOW)
        self.assertFalse(forecast(company(),[],h[:2],NOW))
        self.assertFalse(forecast(company(),[],h,'2027-10-01T12:00:00Z'))
        for r in h:r['fiscalYear']-=2
        self.assertFalse(forecast(company(),[],h,NOW))
    def test_official_confirmation_supersedes_forecast(self):
        h=fact_history(consumer(),company()['cik'],NOW)
        e={'eventType':'EARNINGS_CALL','confirmationStatus':'CONFIRMED','date':'2026-11-01'}
        self.assertFalse(forecast(company(),[e],h,NOW))
    def test_conflicts_and_amendments_are_not_observations(self):
        h=fact_history(consumer(),company()['cik'],NOW)
        conflict={**h[-1],'fiscalYear':2099}
        self.assertLess(len(observations([conflict],h,NOW[:10])),len(h))
        self.assertEqual(observations([{**h[-1],'isAmendment':True}],[],NOW[:10]),[])
    def test_backtest_origin_filters_future_before_forecasting(self):
        h=fact_history(consumer(),company()['cik'],NOW)
        past=[r for r in h if r['date']<'2026-06-01']
        self.assertTrue(all(r['date']<'2026-06-01' for r in past))
        a=forecast(company(),[],past,'2026-06-01T12:00:00Z')
        self.assertEqual(a,forecast(company(),[],copy.deepcopy(past),'2026-06-01T12:00:00Z'))

    def test_operator_can_explain_abstention_without_fabricating_forecast(self):
        diagnostic={}
        self.assertEqual(forecast(company(),[],[],NOW,diagnostic),[])
        self.assertEqual(diagnostic['reason'],'INSUFFICIENT_ORIGINAL_REPORT_HISTORY')
        h=fact_history(consumer(),company()['cik'],NOW)
        forecast(company(),[],h,'2027-10-01T12:00:00Z',diagnostic)
        self.assertEqual(diagnostic['reason'],'STALE_REPORT_HISTORY')
