import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.reporting_calendar import fact_history, forecast, observations
from test_engine import company, consumer, NOW

class ReportingCalendarTests(unittest.TestCase):
    def test_obsolete_estimate_retirement_preserves_audit_and_actual_report(self):
        import json, tempfile
        from company_intelligence.pipeline import Pipeline
        from company_intelligence.transport import PublicHTTP
        from company_intelligence.store import Store
        c=company();now='2026-10-03T12:00:00Z'
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            for y in (2023,2024,2025):
                store.event({'eventId':str(y),'companyId':c['companyId'],'eventType':'PERIODIC_REPORT_PUBLISHED','date':f'{y}-09-26','fiscalYear':y+1,'fiscalQuarter':'Q1'},now)
            pipeline=Pipeline(Path(tmp),{c['companyId']:c},store,PublicHTTP(Path(tmp)/'http'),now)
            pipeline.refresh_estimates(c)
            self.assertEqual(store.db.execute("SELECT count(*) FROM events WHERE kind='EARNINGS_ESTIMATED'").fetchone()[0],1)
            store.event({'eventId':'actual','companyId':c['companyId'],'eventType':'PERIODIC_REPORT_PUBLISHED','date':'2026-09-29','fiscalYear':2027,'fiscalQuarter':'Q1','sourceUrl':'https://www.sec.gov/Archives/actual.htm'},now)
            pipeline.refresh_estimates(c);pipeline.refresh_estimates(c)
            self.assertEqual(store.db.execute("SELECT count(*) FROM events WHERE kind='EARNINGS_ESTIMATED'").fetchone()[0],0)
            audits=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM audit') if json.loads(r[0])['code']=='ESTIMATE_RETIRED']
            self.assertEqual(len(audits),1);self.assertEqual(audits[0]['reason'],'ALREADY_REPORTED')
            self.assertEqual(audits[0]['reportingEvidence'][0]['eventId'],'actual')
            self.assertTrue(store.db.execute("SELECT 1 FROM events WHERE id='actual'").fetchone())
            store.close()

    def test_legacy_window_is_retired_after_noncalendar_quarter_already_reported(self):
        from company_intelligence.earnings import estimate_calendar
        history=[{'eventType':'PERIODIC_REPORT_PUBLISHED','date':f'{y}-09-26','fiscalYear':y+1,'fiscalQuarter':'Q1'} for y in (2023,2024,2025)]
        now='2026-10-03T12:00:00Z'
        self.assertTrue(estimate_calendar(company(),history,now))
        released={'eventType':'PERIODIC_REPORT_PUBLISHED','date':'2026-09-29','fiscalYear':2027,'fiscalQuarter':'Q1'}
        self.assertFalse(estimate_calendar(company(),history+[released],now))
        self.assertFalse(estimate_calendar(company(),history+[{**released,'fiscalYear':None}],now))

    def test_future_report_cannot_enter_legacy_estimator_or_suppress_current_window(self):
        from company_intelligence.earnings import estimate_calendar
        history=[{'eventType':'PERIODIC_REPORT_PUBLISHED','date':f'{y}-10-30','fiscalYear':y,'fiscalQuarter':'Q3'} for y in (2023,2024,2025)]
        future={'eventType':'PERIODIC_REPORT_PUBLISHED','date':'2026-10-30','fiscalYear':2026,'fiscalQuarter':'Q3'}
        self.assertEqual(estimate_calendar(company(),history,'2026-10-03T12:00:00Z'),estimate_calendar(company(),history+[future],'2026-10-03T12:00:00Z'))

    def test_published_other_quarter_does_not_suppress_next_quarter(self):
        from company_intelligence.earnings import estimate_calendar
        history=[{'eventType':'PERIODIC_REPORT_PUBLISHED','date':f'{y}-10-30','fiscalYear':y,'fiscalQuarter':'Q3'} for y in (2023,2024,2025)]
        prior={'eventType':'PERIODIC_REPORT_PUBLISHED','date':'2026-10-02','fiscalYear':2026,'fiscalQuarter':'Q2'}
        self.assertTrue(estimate_calendar(company(),history+[prior],'2026-10-03T12:00:00Z'))
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
