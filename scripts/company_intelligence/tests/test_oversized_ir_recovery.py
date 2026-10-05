import unittest
from company_intelligence.discovery import validate_discovery_candidate
from company_intelligence.transport import SourceError, BudgetExhausted
from test_engine import company, NOW
from test_ownership_routes import HTTP

ROOT='https://www.apple.com/'
IR='https://investors.apple.com/'
PAGE='<title>Apple Investor Relations</title><footer>© 2026 Apple Inc. All rights reserved.</footer><a href="https://apple.com/">Corporate Website</a><a href="/events">Investor Events</a><a href="/presentation.pdf">Investor Presentation</a>'

class OversizedIRTests(unittest.TestCase):
 def pages(self,body=PAGE):
  return {ROOT:SourceError('SOURCE_TOO_LARGE'),IR:body,'https://investor.apple.com/':SourceError('HTTP_404'),'https://ir.apple.com/':SourceError('HTTP_404')}
 def test_independent_owner_and_corporate_backlink_recover_ir_not_oversized_root(self):
  h=HTTP(self.pages());v=validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
  self.assertEqual(v['url'],IR);self.assertEqual(h.calls,[ROOT,IR,IR])
  recovery=v['ownershipEvidence']['transportRecovery']
  self.assertEqual(recovery['originalCandidateURL'],ROOT);self.assertEqual(recovery['corporateBacklinks'],['https://apple.com/'])
  self.assertEqual(recovery['primaryFailure'],'SOURCE_TOO_LARGE')
 def test_owned_page_without_backlink_or_investor_context_is_not_recovered(self):
  for body in (PAGE.replace('https://apple.com/','https://other.example/'),'<title>Apple Inc.</title><footer>© 2026 Apple Inc.</footer><a href="https://apple.com/">Corporate Website</a>'):
   with self.subTest(body=body):
    h=HTTP(self.pages(body))
    with self.assertRaises(SourceError) as caught:validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
    self.assertEqual(str(caught.exception),'SOURCE_TOO_LARGE')
    self.assertEqual(len(caught.exception.ownershipEvidence['alternateIRAttempts']),3)
 def test_conflicting_owner_never_falls_through_to_convenient_alternate(self):
  h=HTTP(self.pages(PAGE.replace('© 2026 Apple Inc.','© 2026 Different Owner LLC.')))
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
  self.assertEqual(h.calls,[ROOT,IR])
 def test_access_proxy_and_robots_size_failures_never_probe_alternates(self):
  for reason in ('HTTP_403','ROBOTS_DISALLOWED','ROBOTS_UNAVAILABLE:SOURCE_TOO_LARGE','HTTP_503'):
   h=HTTP({ROOT:SourceError(reason)})
   with self.assertRaisesRegex(SourceError,reason):validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
   self.assertEqual(h.calls,[ROOT])
 def test_budget_remains_deferred_and_proxy_failure_remains_temporary(self):
  h=HTTP(self.pages());h.pages[IR]=BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
  with self.assertRaises(BudgetExhausted) as caught:validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
  self.assertEqual(caught.exception.ownershipEvidence['alternateIRAttempts'],[{'url':IR,'reason':'NETWORK_BUDGET_EXHAUSTED'}])
  self.assertEqual(h.calls,[ROOT,IR])
  h=HTTP(self.pages());h.pages[IR]=SourceError('HTTP_503')
  with self.assertRaisesRegex(SourceError,'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:HTTP_503'):validate_discovery_candidate(company(),{'url':ROOT,'evidence':'candidate'},h,NOW)
