import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.continuous_refresh import CheckedHTTP,source_result
from company_intelligence.transport import PublicHTTP,SourceError
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company,source,NOW
class ContinuousRefreshTests(unittest.TestCase):
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
        self.assertEqual(source_result({'lastError':'ROBOTS_DISALLOWED'},now),'POLICY_REJECTED')
        self.assertEqual(source_result({'lastError':'PARSE_INVALID_XML'},now),'PARSE_FAILURE')
    def test_html_error_page_must_not_be_successful_empty_rss(self):
        with tempfile.TemporaryDirectory() as tmp:
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/feed','type':'IR_FEED','format':'RSS'}
            with patch.object(PublicHTTP,'get',return_value={'body':b'<html><body>Unavailable</body></html>'}):
                with self.assertRaisesRegex(SourceError,'PARSE_INVALID_FEED'):http.get(http.current_source['url'])
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
