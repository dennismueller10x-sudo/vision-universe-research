import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from company_intelligence.profile_qa_metadata import metadata, candidates
from company_intelligence.transport import PublicHTTP, SourceError

CID='iss_cik_0000353278';NOW='2026-10-12T13:00:00Z'
class Response(io.BytesIO):
    def __init__(self,body):super().__init__(body);self.headers={'ETag':'verified'};self.status=200
    def geturl(self):return 'https://owned.example/feed'
class MetadataTests(unittest.TestCase):
    def test_exact_cik_public_country_and_sic_without_full_address(self):
        raw={'cik':353278,'sic':'2834','addresses':{'business':{'stateOrCountry':'G7','stateOrCountryDescription':'DENMARK','street1':'not retained','zipCode':'not retained'}}}
        value=metadata(raw,'0000353278',NOW)
        self.assertEqual(value['sic'],'2834');self.assertEqual(value['addresses']['business']['stateOrCountryDescription'],'DENMARK')
        self.assertNotIn('street1',str(value));self.assertNotIn('zipCode',str(value))
        with self.assertRaisesRegex(ValueError,'QA_METADATA_ISSUER_MISMATCH'):metadata(raw,'0000320193',NOW)
    def test_collection_hint_is_not_inferred_country_or_sector(self):
        c={CID:{'cik':'0000353278','listings':[{'symbol':'NVO'}]}}
        self.assertEqual(candidates(c,{}),[CID])
        value=metadata({'cik':353278},'0000353278',NOW)
        self.assertEqual(value['addresses']['business'],{});self.assertEqual(value['sic'],'')
    def test_explicit_fresh_read_retains_robots_and_budget_but_skips_stale_memo_and_validators(self):
        calls=[]
        def opener(request,timeout=None):calls.append(dict(request.header_items()));return Response(b'fresh HTTPS source')
        with tempfile.TemporaryDirectory()as directory:
            http=PublicHTTP(Path(directory),opener=opener,validator=lambda u:u,interval=0,sleep=lambda _:None)
            http.robots_allowed=Mock()
            url='https://owned.example/feed'
            self.assertEqual(http.get(url)['body'],b'fresh HTTPS source')
            self.assertEqual(http.get(url)['body'],b'fresh HTTPS source');self.assertEqual(len(calls),1)
            self.assertEqual(http.get(url,fresh=True)['body'],b'fresh HTTPS source');self.assertEqual(len(calls),2)
            self.assertFalse(any(k.lower().startswith('if-')for k in calls[-1]))
            self.assertEqual(http.robots_allowed.call_count,2)
            http.budget=http.requests
            with self.assertRaises(SourceError):http.get(url,fresh=True)
if __name__=='__main__':unittest.main()
