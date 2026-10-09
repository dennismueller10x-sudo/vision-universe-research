import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.continuous_refresh import CheckedHTTP,source_result
from company_intelligence.transport import PublicHTTP,SourceError
class ContinuousRefreshTests(unittest.TestCase):
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
            with patch.object(PublicHTTP,'get',return_value={'body':b'not xml'}):
                with self.assertRaisesRegex(SourceError,'PARSE_INVALID_XML'):http.get(http.current_source['url'])
    def test_invalid_api_response_cannot_replace_materials_with_empty_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            http=CheckedHTTP(Path(tmp));http.current_source={'url':'https://example.com/reports','type':'IR_MATERIALS','format':'Q4_REPORTS'}
            with patch.object(PublicHTTP,'get',return_value={'body':b'<html>unavailable</html>'}):
                with self.assertRaisesRegex(SourceError,'PARSE_INVALID_JSON'):http.get(http.current_source['url'])
