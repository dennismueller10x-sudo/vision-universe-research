import sys
import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.source_registry_audit import failure_class, issuer_market_cap_bucket, issuer_region
from company_intelligence.store import Store
from test_engine import company

class SourceRegistryAuditTests(unittest.TestCase):
 def test_distinguishes_explicit_robots_block_from_unclassified_http_403(self):
    self.assertEqual(failure_class({'active':True,'lastError':'SourceError:ROBOTS_DISALLOWED'}),'ROBOTS_BLOCKED')
    self.assertEqual(failure_class({'active':True,'lastError':'SourceError:HTTP_403'}),'HTTP_403_UNCLASSIFIED')
    self.assertEqual(failure_class({'active':True,'lastError':'SourceError:ROBOTS_UNAVAILABLE:HTTP_403'}),'ROBOTS_TEMPORARY_FAILURE')

 def test_keeps_auth_removed_rate_limit_and_parse_failures_separate(self):
    self.assertEqual(failure_class({'active':True,'lastError':'HTTP_401'}),'AUTH_REQUIRED')
    self.assertEqual(failure_class({'active':True,'lastError':'HTTP_410'}),'SOURCE_REMOVED')
    self.assertEqual(failure_class({'active':True,'lastError':'HTTP_429'}),'RATE_LIMITED')
    self.assertEqual(failure_class({'active':True,'lastError':'PARSE_INVALID_XML'}),'PARSE_FAILURE')

 def test_inactive_source_is_not_claimed_as_pollable_or_broken(self):
    self.assertEqual(failure_class({'active':False}),'INACTIVE')
    self.assertEqual(failure_class({'active':False,'disabledReason':'SOURCE_REMOVED'}),'REMOVED')

 def test_market_cap_requires_dated_single_common_share_evidence(self):
    with tempfile.TemporaryDirectory() as tmp:
     root=Path(tmp);stock=root/'discover/data/stocks/US_REAL';stock.mkdir(parents=True)
     c=company();c['listings'][0]['securityType']='COMMON_STOCK'
     (stock/'AAPL.json').write_text(json.dumps({'asOf':'2026-10-12','price':{'value':10},'fundamentals':{'valuation':{'marketCap':{'value':1e9}}}}))
     s=Store(root/'state.sqlite')
     try:
      s.set_state('financials:'+c['companyId'],{'metrics':{'shares_outstanding':{'current':{'value':100_000_000,'unit':'shares','periodEnd':'2026-09-30'}}}})
      with patch('company_intelligence.source_registry_audit.ROOT',root):
       self.assertEqual(issuer_market_cap_bucket(c,s,'2026-10-13T00:00:00Z'),'SMALL_CAP')
       c['listings'].append(dict(c['listings'][0],symbol='AAPL.B'))
       self.assertEqual(issuer_market_cap_bucket(c,s,'2026-10-13T00:00:00Z'),'MULTI_LISTING_OR_NONCOMMON')
     finally:s.close()

 def test_region_uses_sec_business_country_then_honest_listing_fallback(self):
    with tempfile.TemporaryDirectory() as tmp:
     c=company();c['listings'][0]['country']='US';s=Store(Path(tmp)/'state.sqlite')
     try:
      self.assertEqual(issuer_region(s,c),'US_LISTING_ONLY')
      s.set_state('profileQaIssuerMetadata:'+c['companyId'],{'addresses':{'business':{'stateOrCountry':'CH','stateOrCountryDescription':'Switzerland'}}})
      self.assertEqual(issuer_region(s,c),'EUROPE')
     finally:s.close()
