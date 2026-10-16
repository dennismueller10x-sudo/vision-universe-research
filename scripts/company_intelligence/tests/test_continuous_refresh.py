import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from collections import Counter
from company_intelligence.continuous_refresh import CheckedHTTP,source_result,advance,advance_financial_filing,refresh_completeness,progress_health,commit_refresh_stamp,was_known_failing,MIN_FRESH_SAMPLE,MIN_FRESH_SUCCESS_RATIO
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
    def verdict(self,fresh,known=0,**kw):
        fresh=Counter(fresh)
        args=dict(network=True,fresh_outcomes=fresh,known_failing=['k']*known,successes=sum(v for k,v in fresh.items() if k in ('SUCCESS','NO_CHANGE')) or 1,
                  deferred=0,sec_exhausted=False,sec_checked=0,sec_success=0,sec_aborted=False,fact_outcomes=Counter())
        args.update(kw); return refresh_completeness(**args)
    def do_run(self,store,fresh,prior,**kw):
        complete,reasons=self.verdict(fresh,**kw)
        health=progress_health(prior,self.NOW_,Counter({'IR_FEED':fresh.get('SUCCESS',0)}),0,False,complete,reasons)
        store.set_state('continuousRefresh',health)
        return commit_refresh_stamp(store,health,self.NOW_,complete),complete
    def test_partial_failure_keeps_stamp_but_saves_progress(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                prior={'lastSuccessfulRefresh':self.OLD,'lastSuccessfulNewsRefresh':self.OLD}
                _,complete=self.do_run(store,{'SUCCESS':1,'TEMPORARY_FAILURE':1},prior)
                self.assertFalse(complete);saved=store.state('continuousRefresh',{})
                self.assertEqual(saved['lastSuccessfulRefresh'],self.OLD);self.assertEqual(saved['lastSuccessfulNewsRefresh'],self.NOW_)
                self.assertEqual(saved['lastAttempt'],self.NOW_);self.assertFalse(saved['lastRefreshComplete'])
                self.assertTrue(saved['incompleteReasons'][0].startswith('SOURCE_FAILURE_RATE:1/2'))
            finally:store.close()
    def test_all_ok_updates_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                _,complete=self.do_run(store,{'SUCCESS':2,'NO_CHANGE':1},{'lastSuccessfulRefresh':self.OLD})
                self.assertTrue(complete);self.assertEqual(store.state('continuousRefresh',{})['lastSuccessfulRefresh'],self.NOW_)
                again,_=self.do_run(store,{'SUCCESS':2,'NO_CHANGE':1},store.state('continuousRefresh',{}))
                self.assertEqual(again['lastSuccessfulRefresh'],self.NOW_);self.assertEqual(again['incompleteReasons'],[])
            finally:store.close()
    def test_old_state_without_new_fields_and_without_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'state.sqlite')
            try:
                self.do_run(store,{'SUCCESS':1,'RATE_LIMITED':1},{'lastAttempt':self.OLD})
                self.assertNotIn('lastSuccessfulRefresh',store.state('continuousRefresh',{}))
                health,_=self.do_run(store,{'SUCCESS':1},{'lastAttempt':self.OLD})
                self.assertEqual(health['lastSuccessfulRefresh'],self.NOW_)
            finally:store.close()
    def test_real_world_failure_rates_advance_the_stamp(self):
        # Dokumentierter Prod-Lauf: 30 faellige IR-Quellen, 16 NO_CHANGE, 12 SUCCESS, 2 TEMPORARY_FAILURE.
        self.assertTrue(self.verdict({'NO_CHANGE':16,'SUCCESS':12,'TEMPORARY_FAILURE':2})[0])
        # Universum: 174 von 5384, davon die meisten schon im Cooldown (hier alle bekannt) -> nicht blockierend.
        complete,reasons=self.verdict({'SUCCESS':5000,'NO_CHANGE':210},known=174)
        self.assertTrue(complete);self.assertIn('KNOWN_FAILING_SOURCES:174',reasons)
        # Auch frisch 174 von 5384 (3,2 %) bleibt ueber der Quote.
        self.assertTrue(self.verdict({'SUCCESS':5210,'TEMPORARY_FAILURE':174})[0])
    def test_systemic_failures_keep_the_stamp(self):
        self.assertFalse(self.verdict({'SUCCESS':15,'TEMPORARY_FAILURE':15})[0],'50 % frisch')
        self.assertFalse(self.verdict({'TEMPORARY_FAILURE':30},successes=0)[0],'alle fehlgeschlagen')
        self.assertFalse(self.verdict({'SUCCESS':30},deferred=1)[0],'Anfragebudget')
        self.assertFalse(self.verdict({'SUCCESS':30},sec_exhausted=True)[0],'SEC-Budget')
        self.assertFalse(self.verdict({'SUCCESS':30},sec_aborted=True,sec_checked=100,sec_success=96)[0],'SEC-Abbruch')
        self.assertFalse(self.verdict({'SUCCESS':30},sec_checked=10,sec_success=5)[0],'SEC-Quote')
        self.assertTrue(self.verdict({'SUCCESS':30},sec_checked=100,sec_success=98)[0],'vereinzelte SEC-Fehler')
        self.assertFalse(self.verdict({'SUCCESS':30},sec_checked=3,sec_success=2)[0],'SEC unter Mindeststichprobe: alles muss gelingen')
        self.assertFalse(self.verdict({'SUCCESS':30},fact_outcomes=Counter({'TEMPORARY_FAILURE':1}))[0])
        self.assertTrue(self.verdict({'SUCCESS':30},fact_outcomes=Counter({'FACTS_NOT_YET_AVAILABLE':2}))[0])
        self.assertFalse(self.verdict({},network=False)[0]);self.assertFalse(self.verdict({},successes=0)[0])
    def test_known_failing_sources_do_not_block_but_are_reported(self):
        complete,reasons=self.verdict({'SUCCESS':10},known=500)
        self.assertTrue(complete);self.assertEqual(reasons,['KNOWN_FAILING_SOURCES:500'])
        self.assertTrue(was_known_failing({'failureCount':2},{}));self.assertTrue(was_known_failing({},{'health':'blocked'}))
        self.assertTrue(was_known_failing({},{'health':'temporarily_failed'}));self.assertFalse(was_known_failing({'failureCount':0},{'health':'healthy'}))
    def test_ratio_and_minimum_sample_boundaries(self):
        n=MIN_FRESH_SAMPLE
        self.assertEqual((n,MIN_FRESH_SUCCESS_RATIO),(5,0.8))
        self.assertTrue(self.verdict({'SUCCESS':4,'TEMPORARY_FAILURE':1})[0],'genau 0,8 bei genau 5 geprueften')
        self.assertFalse(self.verdict({'SUCCESS':3,'TEMPORARY_FAILURE':1})[0],'4 geprueft (<5): jede muss gelingen')
        self.assertFalse(self.verdict({'SUCCESS':3,'TEMPORARY_FAILURE':2})[0],'0,6 < 0,8')
        self.assertTrue(self.verdict({'SUCCESS':79,'TEMPORARY_FAILURE':21})[0]==False,'0,79 < 0,8')
        self.assertTrue(self.verdict({'SUCCESS':80,'TEMPORARY_FAILURE':20})[0],'0,80 genau')
        self.assertTrue(self.verdict({'SUCCESS':3,'ROBOTS_BLOCKED':1,'SOURCE_REMOVED':1,'AUTH_REQUIRED':1})[0],'Policy-terminal ausgenommen')
        self.assertFalse(self.verdict({'SUCCESS':3,'HTTP_403_UNCLASSIFIED':1})[0],'frischer 403 zaehlt als Fehler')
    def test_stamp_commit_is_wired_after_all_consistency_checks(self):
        # Struktur der echten Verdrahtung in refresh(): Stempel erst nach Export, Consumer-Kandidat,
        # Inventar und Profilpruefung, vor der Integritaetsberechnung; Fortschritt setzt ihn nie.
        import inspect,company_intelligence.continuous_refresh as m
        src=inspect.getsource(m.refresh); commit=src.index('commit_refresh_stamp(store')
        for marker in ('store.export(','FULL_PRIVATE_UNIVERSE_SHRINK','generate(store,companies,consumer','module.prepare(','GERMAN_PROFILE_REGRESSION','inventory[cid]=','NON_COHORT_PRIVATE_CONTENT_CHANGED'):
            self.assertIn(marker,src,marker);self.assertLess(src.index(marker),commit,marker)
        self.assertLess(commit,src.index("proof={name:database_proof"));self.assertLess(commit,src.index("atomic_json(state/'latest-run.json'"))
        self.assertEqual(src.count('commit_refresh_stamp('),1)
        self.assertNotIn("'lastSuccessfulRefresh'",inspect.getsource(m.progress_health))
        self.assertNotIn("lastSuccessfulRefresh",src.replace('commit_refresh_stamp',''),'refresh() setzt den Stempel nicht selbst')
    def test_progress_never_sets_stamp_even_when_complete(self):
        h=progress_health({'lastSuccessfulRefresh':self.OLD},self.NOW_,Counter(),0,False,True,[])
        self.assertEqual(h['lastSuccessfulRefresh'],self.OLD)
        self.assertEqual(commit_refresh_stamp(type('S',(),{'set_state':lambda *a:None})(),dict(h),self.NOW_,False)['lastSuccessfulRefresh'],self.OLD)

