import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from collections import Counter
from company_intelligence.continuous_refresh import CheckedHTTP,source_result,advance,advance_financial_filing,refresh_completeness,progress_health,commit_refresh_stamp
from company_intelligence.transport import PublicHTTP,SourceError
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company,source,NOW,consumer
class ContinuousRefreshTests(unittest.TestCase):
    def test_new_periodic_filing_uses_existing_financial_engine_once_and_persists_cursor(self):
        c=company();accession='0000320193-26-000001'
        class Provider:
            calls=0
            def get_company_facts(self,cik,fresh=False):self.calls+=1;return {'cik':int(cik)}
        class Engine:
            def refresh_estimates(self,c):pass
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite');provider=Provider()
            try:
                store.set_state('sec-submissions:'+c['companyId'],{'filings':{'recent':{'form':['10-Q'],'filingDate':['2026-10-09'],'accessionNumber':[accession]}}})
                out=advance_financial_filing(store,c,Engine(),'2026-10-09T12:00:00Z',110,provider,lambda *a,**kw:consumer())
                self.assertEqual(out,'SUCCESS');self.assertEqual(store.state('financials:'+c['companyId'])['reportingPeriod'],'2026-06-30')
                self.assertEqual(advance_financial_filing(store,c,Engine(),'2026-10-09T16:00:00Z',110,provider,lambda *a,**kw:consumer()),'NO_CHANGE');self.assertEqual(provider.calls,1)
                self.assertEqual(store.state('financialRefresh:'+c['companyId'])['lastSuccessfulAccession'],accession)
            finally:store.close()
    def test_lagging_sec_facts_do_not_advance_filing_cursor_or_replace_existing_financials(self):
        c=company();old={'state':'AVAILABLE','reportingPeriod':'2026-06-30','metrics':{}}
        class Provider:
            def get_company_facts(self,cik,fresh=False):return {'cik':int(cik)}
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                store.set_state('financials:'+c['companyId'],old)
                store.set_state('sec-submissions:'+c['companyId'],{'filings':{'recent':{'form':['10-Q'],'filingDate':['2026-10-09'],'accessionNumber':['0000320193-26-999999']}}})
                self.assertEqual(advance_financial_filing(store,c,None,'2026-10-09T12:00:00Z',110,Provider(),lambda *a,**kw:consumer()),'FACTS_NOT_YET_AVAILABLE')
                self.assertEqual(store.state('financials:'+c['companyId']),old);self.assertNotIn('lastSuccessfulAccession',store.state('financialRefresh:'+c['companyId']))
            finally:store.close()
    def test_one_unavailable_source_retains_news_and_does_not_stop_next_source(self):
        body=b'<rss><channel><item><title>Apple announces quarterly earnings results</title><link>https://apple.com/results</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'
        class HTTP:
            fail=False
            def get(self,url,**kw):
                if self.fail and url.endswith('/feed'):raise SourceError('HTTP_503')
                return {'body':body,'finalUrl':url}
        with tempfile.TemporaryDirectory() as tmp:
            c=company();store=Store(Path(tmp)/'state.sqlite');http=HTTP()
            try:
                first=Pipeline(Path(tmp),{c['companyId']:c},store,http,NOW);first.ingest_source(source(c));count=store.db.execute('SELECT count(*) FROM items').fetchone()[0];self.assertEqual(count,1)
                http.fail=True;next_time='2026-10-01T22:00:00Z';second=Pipeline(Path(tmp),{c['companyId']:c},store,http,next_time)
                second.ingest_source(source(c));second.ingest_source({**source(c,url='https://apple.com/another'),'sourceId':'another-source'})
                self.assertEqual(second.run['sourceFailures'],1);self.assertEqual(store.db.execute('SELECT count(*) FROM items').fetchone()[0],count)
                registry={s['sourceId']:s for s in store.sources()};self.assertEqual(registry['another-source']['lastSuccess'],next_time)
                self.assertEqual(registry['IR_FEED-source']['lastSuccess'],NOW);self.assertEqual(registry['IR_FEED-source']['lastFailure'],next_time)
            finally:store.close()
    def test_source_outage_is_a_distinct_recoverable_outcome(self):
        now='2026-10-09T12:00:00Z'
        self.assertEqual(source_result({'lastError':'HTTP_503'},now),'TEMPORARY_FAILURE')
        self.assertEqual(source_result({'lastSuccess':now},now,True),'NO_CHANGE')
        self.assertEqual(source_result({'lastError':'HTTP_429'},now),'RATE_LIMITED')
        self.assertEqual(source_result({'lastError':'ROBOTS_DISALLOWED'},now),'ROBOTS_BLOCKED')
        self.assertEqual(source_result({'lastError':'HTTP_401'},now),'AUTH_REQUIRED')
        self.assertEqual(source_result({'lastError':'HTTP_403'},now),'HTTP_403_UNCLASSIFIED')
        self.assertEqual(source_result({'lastError':'ROBOTS_UNAVAILABLE:HTTP_503'},now),'ROBOTS_TEMPORARY_FAILURE')
        self.assertEqual(source_result({'lastError':'HTTP_410'},now),'SOURCE_REMOVED')
        self.assertEqual(source_result({'lastError':'PARSE_INVALID_XML'},now),'PARSE_FAILURE')

    def test_unchanged_conditional_source_skips_parser_and_records_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=company();s=source(c);s.update(lastSuccess='2026-10-01T00:00:00Z',failureCount=2)
            store=Store(Path(tmp)/'state.sqlite')
            class NotModifiedHTTP:
                def get(self,url,**kw):return {'body':b'', 'finalUrl':url, 'notModified':True}
            try:
                store.source(s)
                pipeline=Pipeline(Path(tmp),{c['companyId']:c},store,NotModifiedHTTP(),'2026-10-09T12:00:00Z')
                before=store.db.execute('select count(*) from items').fetchone()[0]
                pipeline.ingest_source(s)
                after=store.db.execute('select count(*) from items').fetchone()[0]
                updated={r['sourceId']:r for r in store.sources()}[s['sourceId']]
                self.assertEqual(after,before)
                self.assertEqual(pipeline.run['unchanged'],1)
                self.assertEqual(updated['lastSuccess'],'2026-10-09T12:00:00Z')
                self.assertEqual(updated['failureCount'],0)
            finally:store.close()

    def test_robots_unavailable_403_uses_exponential_cooldown_not_blocked_or_four_hour_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=company();s=source(c);store=Store(Path(tmp)/'state.sqlite')
            class RobotsHTTP:
                def get(self,url,**kw):raise SourceError('ROBOTS_UNAVAILABLE:HTTP_403')
            try:
                pipeline=Pipeline(Path(tmp),{c['companyId']:c},store,RobotsHTTP(),NOW)
                pipeline.ingest_source(s)
                saved={r['sourceId']:r for r in store.sources()}[s['sourceId']]
                self.assertEqual(saved['nextCheck'],advance(NOW,2))
                self.assertEqual(source_result(saved,NOW),'ROBOTS_TEMPORARY_FAILURE')
            finally:store.close()
    def test_unclassified_http_403_uses_bounded_backoff_until_cause_is_known(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=company();s=source(c);store=Store(Path(tmp)/'state.sqlite')
            class Unclassified403:
                def get(self,url,**kw):raise SourceError('HTTP_403')
            try:
                pipeline=Pipeline(Path(tmp),{c['companyId']:c},store,Unclassified403(),NOW)
                pipeline.ingest_source(s)
                saved={r['sourceId']:r for r in store.sources()}[s['sourceId']]
                self.assertEqual(saved['failureCount'],1)
                self.assertEqual(saved['nextCheck'],advance(NOW,2))
                self.assertEqual(source_result(saved,NOW),'HTTP_403_UNCLASSIFIED')
            finally:store.close()
    def test_html_error_page_must_not_be_successful_empty_rss(self):
        with tempfile.TemporaryDirectory() as tmp:
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/feed','type':'IR_FEED','format':'RSS'}
            with patch.object(PublicHTTP,'get',return_value={'body':b'<html><body>Unavailable</body></html>'}):
                with self.assertRaisesRegex(SourceError,'PARSE_INVALID_FEED'):http.get(http.current_source['url'])

    def test_byte_identical_cached_body_skips_repeat_validation_and_processing(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            body=b'<rss><channel><item><title>unchanged</title></item></channel></rss>'
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/feed','type':'IR_FEED','format':'RSS'}
            http.expected_body_sha=hashlib.sha256(body).hexdigest()
            with patch.object(PublicHTTP,'get',return_value={'body':body,'finalUrl':http.current_source['url']}):
                response=http.get(http.current_source['url'])
            self.assertTrue(response['unchangedBody'])
            self.assertEqual(http.last_body_sha,http.expected_body_sha)
    def test_existing_json_feed_support_is_not_rejected_as_non_xml(self):
        with tempfile.TemporaryDirectory() as tmp:
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/feed','type':'IR_FEED'}
            body=b'{"version":"https://jsonfeed.org/version/1.1","items":[]}'
            with patch.object(PublicHTTP,'get',return_value={'body':body}):self.assertEqual(http.get(http.current_source['url'])['body'],body)
    def test_invalid_api_response_cannot_replace_materials_with_empty_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/reports','type':'IR_MATERIALS','format':'Q4_REPORTS'}
            with patch.object(PublicHTTP,'get',return_value={'body':b'<html>unavailable</html>'}):
                with self.assertRaisesRegex(SourceError,'PARSE_INVALID_JSON'):http.get(http.current_source['url'])

class GlobalRefreshStampTests(unittest.TestCase):
    OLD='2026-10-09T04:00:00Z'; NOW_='2026-10-09T12:00:00Z'
    def verdict(self,outcomes,**kw):
        args=dict(network=True,outcomes=Counter(outcomes),successes=sum(v for k,v in outcomes.items() if k in ('SUCCESS','NO_CHANGE')),deferred=0,sec_exhausted=False,sec_failures=0,fact_outcomes=Counter())
        args.update(kw); return refresh_completeness(**args)
    def do_run(self,store,outcomes,prior,**kw):
        complete,reasons=self.verdict(outcomes,**kw)
        lanes=Counter({'IR_FEED':outcomes.get('SUCCESS',0)})
        health=progress_health(prior,self.NOW_,lanes,0,False,complete,reasons)
        store.set_state('continuousRefresh',health)
        return commit_refresh_stamp(store,health,self.NOW_,complete),complete
    def test_one_source_ok_one_failed_keeps_global_stamp_but_saves_progress(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                prior={'lastSuccessfulRefresh':self.OLD,'lastSuccessfulNewsRefresh':self.OLD}
                health,complete=self.do_run(store,{'SUCCESS':1,'TEMPORARY_FAILURE':1},prior)
                self.assertFalse(complete);saved=store.state('continuousRefresh',{})
                self.assertEqual(saved['lastSuccessfulRefresh'],self.OLD)
                self.assertEqual(saved['lastSuccessfulNewsRefresh'],self.NOW_)
                self.assertEqual(saved['lastAttempt'],self.NOW_);self.assertFalse(saved['lastRefreshComplete'])
                self.assertIn('SOURCE_NOT_SUCCESSFUL:TEMPORARY_FAILURE',saved['incompleteReasons'])
            finally:store.close()
    def test_all_sources_ok_updates_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                health,complete=self.do_run(store,{'SUCCESS':2,'NO_CHANGE':1},{'lastSuccessfulRefresh':self.OLD})
                self.assertTrue(complete);self.assertEqual(store.state('continuousRefresh',{})['lastSuccessfulRefresh'],self.NOW_)
                again,_=self.do_run(store,{'SUCCESS':2,'NO_CHANGE':1},store.state('continuousRefresh',{}))
                self.assertEqual(again['lastSuccessfulRefresh'],self.NOW_);self.assertEqual(again['incompleteReasons'],[])
            finally:store.close()
    def test_failure_before_final_commit_leaves_stamp_unchanged(self):
        # Export-/Consumer-/GOOD-Vorbereitung scheitert nach dem Fortschritt: commit_refresh_stamp wird nie erreicht.
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                prior={'lastSuccessfulRefresh':self.OLD};complete,reasons=self.verdict({'SUCCESS':3})
                store.set_state('continuousRefresh',progress_health(prior,self.NOW_,Counter({'IR_FEED':3}),0,False,complete,reasons))
                self.assertEqual(store.state('continuousRefresh',{})['lastSuccessfulRefresh'],self.OLD)
                with self.assertRaises(ValueError):
                    raise ValueError('GERMAN_PROFILE_REGRESSION')
                self.assertEqual(store.state('continuousRefresh',{})['lastSuccessfulRefresh'],self.OLD)
            finally:store.close()
    def test_old_state_without_new_fields_and_without_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                health,_=self.do_run(store,{'SUCCESS':1,'RATE_LIMITED':1},{'lastAttempt':self.OLD})
                self.assertNotIn('lastSuccessfulRefresh',store.state('continuousRefresh',{}))
                health,_=self.do_run(store,{'SUCCESS':1},{'lastAttempt':self.OLD})
                self.assertEqual(health['lastSuccessfulRefresh'],self.NOW_)
            finally:store.close()
    def test_completeness_rules(self):
        self.assertTrue(self.verdict({'SUCCESS':1,'ROBOTS_BLOCKED':1,'SOURCE_REMOVED':1})[0],'bewusst blockierte Quellen sperren den Stempel nicht')
        for bad in ('TEMPORARY_FAILURE','RATE_LIMITED','ROBOTS_TEMPORARY_FAILURE','PARSE_FAILURE','HTTP_403_UNCLASSIFIED'):
            self.assertFalse(self.verdict({'SUCCESS':1,bad:1})[0],bad)
        self.assertFalse(self.verdict({'SUCCESS':1},deferred=1)[0])
        self.assertFalse(self.verdict({'SUCCESS':1},sec_exhausted=True)[0])
        self.assertFalse(self.verdict({'SUCCESS':1},sec_failures=1)[0])
        self.assertFalse(self.verdict({'SUCCESS':1},fact_outcomes=Counter({'TEMPORARY_FAILURE':1}))[0])
        self.assertTrue(self.verdict({'SUCCESS':1},fact_outcomes=Counter({'FACTS_NOT_YET_AVAILABLE':2,'NO_CHANGE':1}))[0])
        self.assertFalse(self.verdict({},network=False)[0]);self.assertFalse(self.verdict({})[0])
        self.assertTrue(self.verdict({},successes=2)[0],'reiner SEC-Erfolg ohne faellige Quelle')

