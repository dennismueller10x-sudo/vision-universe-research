import unittest
from copy import deepcopy
from company_intelligence.product import project, bundles


class ProductTests(unittest.TestCase):
    def payload(self):
        cid='iss_cik_0000320193'
        return dict(schema='vu-company-intelligence-1.0.0',companyId=cid,generatedAt='2026-10-02T12:00:00Z',state='AVAILABLE',listings=[{'symbol':'AAPL'}],news=[],timeline=[],events=[],earnings=[],calls=[],materials=[],latestFinancials={'state':'AVAILABLE','reportingPeriod':'2026-06-27','fiscalYear':2026,'fiscalQuarter':'Q3','whatChanged':[]},coverage={'sources':[{'failureCount':4}],'sec':{'checkpoint':'private'}})
    def release(self, eid='release', period='2026-06-27', fy=2026, quarter='Q3', kind='EARNINGS_PUBLISHED'):
        return dict(companyId='iss_cik_0000320193',eventId=eid,reportingPeriod=period,fiscalYear=fy,fiscalQuarter=quarter,eventType=kind,date='2026-07-30')
    def test_exact_period_bundle_preserves_underlying_records(self):
        p=self.payload();p['earnings']=[self.release(),self.release('report',kind='PERIODIC_REPORT_PUBLISHED')];p['calls']=[dict(companyId=p['companyId'],eventId='call',earningsEventId='release')];p['materials']=[dict(companyId=p['companyId'],eventId='report',url='https://sec.gov/report',type='FINANCIAL_REPORT')];original=deepcopy(p)
        q=project(p);self.assertEqual(len(q['earningsBundles']),1);self.assertEqual(q['earningsBundles'][0]['eventIds'],['release','report']);self.assertEqual(q['earningsBundles'][0]['callIds'],['call']);self.assertEqual(q['earningsBundles'][0]['financials']['state'],'AVAILABLE');self.assertEqual(p,original)
    def test_conflicting_fiscal_labels_unknown_period_and_candidate_never_merge(self):
        p=self.payload();p['earnings']=[self.release(),self.release('wrong',fy=2025),self.release('unknown',period=None),self.release('candidate',kind='EARNINGS_CANDIDATE')];b=bundles(p);self.assertEqual(len(b),3);self.assertEqual(next(v for v in b if v['eventIds']==['wrong'])['financials']['state'],'UNAVAILABLE')
    def test_private_state_and_stale_news_are_not_public(self):
        p=self.payload();p['news']=[dict(companyId=p['companyId'],newsId='old',publishedAt='2020-01-01T00:00:00Z')];q=project(p);self.assertNotIn('sources',q['coverage']);self.assertNotIn('sec',q['coverage']);self.assertEqual(q['news'],[])
    def test_estimates_not_in_current_timeline_and_calls_require_verified_link(self):
        p=self.payload();p['timeline']=[self.release('estimate',kind='EARNINGS_ESTIMATED')];p['earnings']=[self.release()];p['calls']=[dict(companyId=p['companyId'],eventId='other',date='2026-07-30')];q=project(p);self.assertEqual(q['earningsBundles'][0]['callIds'],[]);self.assertFalse(any(e['eventType']=='EARNINGS_ESTIMATED' for e in q['timeline']))
    def test_contextual_balance_changes_display_direction_without_investment_judgment(self):
        p=self.payload();p['latestFinancials']['whatChanged']=[dict(metric='total_debt',absolute=5,classification='NOT_COMPARABLE')];q=project(p);self.assertEqual(q['latestFinancials']['whatChanged'][0]['displayClassification'],'INCREASED');self.assertEqual(q['latestFinancials']['whatChanged'][0]['classification'],'NOT_COMPARABLE')

class CadenceTests(unittest.TestCase):
    def test_event_priority_never_overrides_backoff(self):
        from company_intelligence.cadence import due, interval_hours
        s={'active':True,'verified':True,'type':'IR_EVENTS','intervalHours':24,'lastSuccess':'2026-10-02T00:00:00Z','nextCheck':'2026-10-03T00:00:00Z'}
        self.assertFalse(due(s,'2026-10-02T03:00:00Z'))
        self.assertTrue(due(s,'2026-10-02T03:00:00Z',True))
        self.assertFalse(due({**s,'failureCount':1},'2026-10-02T03:00:00Z',True))
        self.assertEqual(interval_hours({'provider':'GLOBENEWSWIRE_RSS'}),4)

class StructuredSourceTests(unittest.TestCase):
    def source(self):
        return dict(sourceId='gcs',companyId='iss_cik_0000000001',verified=True,provider='GCS',url='https://ir.example.com/events',allowedSites=['https://ir.example.com/'])
    def test_gcs_explicit_date_only_and_no_cross_company_webcast(self):
        from company_intelligence.structured_sources import gcs_events
        body=b'<article class="node--type-nir-event"><div class="event-date">Oct 13, 2026</div><a href="/events/event-details/presentation">Investor Breakfast Presentation</a></article>'
        events=gcs_events(body,self.source(),'2026-10-02T12:00:00Z');self.assertEqual(len(events),1);self.assertEqual(events[0]['date'],'2026-10-13');self.assertIsNone(events[0].get('startsAt'));self.assertEqual(events[0]['confirmationStatus'],'CONFIRMED')
        self.assertEqual(gcs_events(body.replace(b'/events/event-details/presentation',b'https://other.test/events/event-details/presentation'),self.source(),'2026-10-02T12:00:00Z'),[])
    def test_gcs_ambiguous_multiple_dates_and_operating_results_rejected(self):
        from company_intelligence.structured_sources import gcs_events
        body=b'<article class="node--type-nir-event"><div class="event-date">Oct 13, 2026 and Oct 14, 2026</div><a href="/events/event-details/earnings">Q3 2026 Earnings Call</a></article>'
        self.assertEqual(gcs_events(body,self.source(),'2026-10-02T12:00:00Z'),[])
        self.assertEqual(gcs_events(body.replace(b'Q3 2026 Earnings Call',b'Q3 2026 Clinical Phase 3 Results'),self.source(),'2026-10-02T12:00:00Z'),[])
    def test_schema_news_ignores_body_and_rejects_foreign_url_or_missing_date(self):
        from company_intelligence.structured_sources import news_index
        body=b'<script type="application/ld+json">{"@type":"NewsArticle","headline":"Quarterly news","url":"https://ir.example.com/news/story","datePublished":"2026-10-01T14:00:00Z","articleBody":"COPYRIGHT BODY"}</script>'
        entries=news_index(body,self.source(),self.source()['url']);self.assertEqual(len(entries),1);self.assertNotIn('COPYRIGHT',str(entries));self.assertEqual(news_index(body.replace(b'https://ir.example.com/news/story',b'https://wrong.test/news/story'),self.source(),self.source()['url']),[])
    def test_recorded_unrelated_gcs_issuers_keep_identity_and_dates(self):
        import json
        from pathlib import Path
        from company_intelligence.structured_sources import gcs_events
        fixtures=json.loads((Path(__file__).parent/'fixtures/gcs-event-cards.json').read_text())
        self.assertTrue(fixtures)
        for f in fixtures:
            events=gcs_events(f['metadataHtml'].encode(),f['source'],'2026-10-02T14:00:00Z')
            self.assertEqual(len(events),f['expectedCount'])
            self.assertTrue(all(e['companyId']==f['companyId'] for e in events))

class EarningsActorTests(unittest.TestCase):
    def test_period_prefix_cannot_hide_other_issuer(self):
        from company_intelligence.model import issuer_earnings_announcement
        c={'names':['United Airlines Holdings Inc']}
        self.assertTrue(issuer_earnings_announcement('3Q26 Earnings Call',c))
        self.assertFalse(issuer_earnings_announcement('Q3 2026 NVIDIA Earnings Call',c))
        self.assertFalse(issuer_earnings_announcement('3Q26 NVIDIA Earnings Call',c))
        self.assertTrue(issuer_earnings_announcement('Q3 2026 United Airlines Holdings Inc Earnings Call',c))
    def test_legal_suffix_equivalence_is_not_generic_company_suffix_matching(self):
        from company_intelligence.model import issuer_earnings_announcement
        self.assertTrue(issuer_earnings_announcement('Bank of Hawaii Corporation Second Quarter 2026 Earnings Conference Call',{'names':['Bank of Hawaii Corp']}))
        self.assertFalse(issuer_earnings_announcement('Root Corp Second Quarter 2026 Earnings',{'names':['Root Inc']}))

class LazyAliasTests(unittest.TestCase):
    def test_only_exact_cik_nonmock_sec_alias_enriches_without_mutating_master(self):
        import json, tempfile
        from pathlib import Path
        from company_intelligence.pipeline import Pipeline
        c={'issuer':{'names':['Hawaii Bank'],'listings':[{'symbol':'BOH','exchange':'NYSE'}],'cik':'0000000001'}}
        original=deepcopy(c)
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'quant/data/sec/consumer';target.mkdir(parents=True)
            file=target/'CIK0000000001.json'
            file.write_text(json.dumps({'cik':'0000000002','name':'Wrong Bank Corp','dataSource':{'provider':'sec_edgar','isMock':False}}))
            p=Pipeline(temp,c,None,object());self.assertEqual(p._alias_loaded,set());p.ensure_aliases(['issuer']);self.assertEqual(p.companies['issuer']['names'],['Hawaii Bank'])
            file.write_text(json.dumps({'cik':'0000000001','name':'Bank of Hawaii Corp','dataSource':{'provider':'sec_edgar','isMock':False}}))
            p=Pipeline(temp,c,None,object());p.ensure_aliases(['issuer']);p.ensure_aliases(['issuer']);self.assertEqual(p.companies['issuer']['names'],['Hawaii Bank','Bank of Hawaii Corp']);self.assertEqual(c,original)
            item={'headline':'Quarterly results','url':'https://www.globenewswire.com/news-release/test','distributionMetadata':{'contributor':'Bank of Hawaii Corp','stocks':['NYSE:BOH']}}
            source={'provider':'GLOBENEWSWIRE_RSS','url':'https://www.globenewswire.com/RssFeed/test'}
            self.assertEqual(p.resolver.resolve(item,source)[0]['companyId'],'issuer')
            item['distributionMetadata']['contributor']='Wrong Bank Corp';self.assertEqual(p.resolver.resolve(item,source),[])
            file.write_text(json.dumps({'cik':'0000000001','name':'Fake Corp','dataSource':{'provider':'sec_edgar','isMock':True}}))
            p=Pipeline(temp,c,None,object());p.ensure_aliases(['issuer']);self.assertEqual(p.companies['issuer']['names'],['Hawaii Bank'])

class ProductReviewRegressionTests(unittest.TestCase):
    payload = ProductTests.payload
    release = ProductTests.release
    def test_long_report_archive_keeps_management_content_within_public_bound(self):
        p=self.payload()
        p['materials']=[{'type':'FINANCIAL_REPORT','url':f'https://ir.example.com/report/{i}'} for i in range(40)]
        for kind in ('COMPANY_TRANSCRIPT','PREPARED_REMARKS','WEBCAST','PRESENTATION'):
            p['materials'].append({'type':kind,'url':f'https://ir.example.com/{kind}'})
        original=deepcopy(p);q=project(p)
        self.assertEqual(len(q['materials']),30)
        self.assertTrue({'COMPANY_TRANSCRIPT','PREPARED_REMARKS','WEBCAST','PRESENTATION'} <= {d['type'] for d in q['materials']})
        self.assertEqual(p,original)
    def test_materials_merge_the_same_source_url_even_when_labels_differ(self):
        p=self.payload();p['earnings']=[self.release()];p['materials']=[{'companyId':p['companyId'],'eventId':'release','url':'https://www.sec.gov/report','type':'SEC_PRIMARY_DOCUMENT'},{'companyId':p['companyId'],'eventId':'release','url':'https://www.sec.gov/report','type':'FINANCIAL_REPORT'}]
        self.assertEqual(len(project(p)['earningsBundles'][0]['materials']),1)
    def test_unchanged_margin_does_not_become_expanded_from_rounding_noise(self):
        p=self.payload();p['latestFinancials']['whatChanged']=[dict(metric='gross_margin',absolute=.0000001,classification='UNCHANGED')];self.assertEqual(project(p)['latestFinancials']['whatChanged'][0]['displayClassification'],'UNCHANGED')

class PilotNamespaceTests(unittest.TestCase):
    def test_unsafe_or_nonpilot_override_fails_before_credential_access(self):
        import os,subprocess,tempfile
        from pathlib import Path
        script=Path(__file__).parents[1]/'pilot.sh'
        with tempfile.TemporaryDirectory() as temp:
            for namespace in ('../main','branch-production','pilot-../escape','pilot-'):
                r=subprocess.run(['bash',str(script)],env={**os.environ,'RUNNER_TEMP':temp,'PILOT_BRANCH':'feature/test','PILOT_NAMESPACE':namespace},capture_output=True,text=True)
                self.assertNotEqual(r.returncode,0);self.assertIn('INVALID_PILOT_NAMESPACE',r.stderr)

class CalendarRerunIntegrityTests(unittest.TestCase):
    def test_refresh_preserves_first_discovery_and_unchanged_timestamp_and_audits_end_change(self):
        import json,tempfile
        from pathlib import Path
        from unittest.mock import patch
        from company_intelligence.pipeline import Pipeline
        from company_intelligence.store import Store
        cid='iss_cik_0000000001';c={'companyId':cid,'cik':None,'names':['Test Company'],'listings':[]}
        estimate={'companyId':cid,'eventId':'estimate','eventType':'EARNINGS_ESTIMATED','date':'2026-11-10','dateStart':'2026-11-10','dateEnd':'2026-11-20','confirmationStatus':'ESTIMATED','discoveredAt':'2026-10-01T12:00:00Z','updatedAt':'2026-10-01T12:00:00Z'}
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite');store.event(estimate,estimate['discoveredAt']);pipe=Pipeline(tmp,{cid:c},store,object(),'2026-10-02T12:00:00Z')
            def value():return json.loads(store.db.execute("select payload from events where id='estimate'").fetchone()[0])
            with patch('company_intelligence.pipeline.estimate_calendar',return_value=[{**estimate,'discoveredAt':pipe.now,'updatedAt':pipe.now}]):pipe.refresh_estimates(c)
            self.assertEqual(value()['discoveredAt'],estimate['discoveredAt']);self.assertEqual(value()['updatedAt'],estimate['updatedAt'])
            with patch('company_intelligence.pipeline.estimate_calendar',return_value=[{**estimate,'dateEnd':'2026-11-22','discoveredAt':pipe.now,'updatedAt':pipe.now}]):pipe.refresh_estimates(c)
            self.assertEqual(value()['discoveredAt'],estimate['discoveredAt']);self.assertEqual(value()['estimationHistory'][0]['previousDateEnd'],'2026-11-20');self.assertEqual(value()['updatedAt'],pipe.now)
            self.assertEqual(store.db.execute("select count(*) from audit where json_extract(payload,'$.code')='ESTIMATE_WINDOW_CHANGED'").fetchone()[0],1)
            store.close()

class SnippetCallTests(unittest.TestCase):
    def test_call_requires_explicit_same_date_in_its_own_clause(self):
        from company_intelligence.ir_events import from_announcement
        source={'sourceId':'nsc','companyId':'iss_cik_0000702165','verified':True,'type':'IR_FEED','url':'https://norfolksouthern.investorroom.com/feed','allowedSites':['https://norfolksouthern.investorroom.com/']}
        item={'headline':'Norfolk Southern to announce third quarter 2026 earnings results on October 22, 2026','url':'https://norfolksouthern.investorroom.com/announcement','publishedAt':'2026-10-02T12:00:00Z','evidenceText':'Norfolk Southern Corporation (NYSE: NSC) will announce its third quarter 2026 financial results during a live conference call and internet webcast at 10:00 a.m. ET on Thursday, October 22, 2026.'}
        events=from_announcement(item,source,'2026-10-02T13:00:00Z');self.assertEqual([e['eventType'] for e in events],['EARNINGS_SCHEDULED','EARNINGS_CALL']);self.assertIsNone(events[0]['startsAt']);self.assertEqual(events[1]['startsAt'],'2026-10-22T14:00:00Z');self.assertEqual(events[1]['relatedCalendarEventId'],events[0]['eventId'])
        for body in ['A related conference call will follow.','A conference call at 10:00 a.m. ET on October 23.', 'A conference call at 10:00 a.m. ET on October 23, 2026.']:
            events=from_announcement({**item,'evidenceText':body},source,'2026-10-02T13:00:00Z');self.assertFalse(any(e['eventType']=='EARNINGS_CALL' for e in events));self.assertTrue(all(e.get('startsAt') is None for e in events))
