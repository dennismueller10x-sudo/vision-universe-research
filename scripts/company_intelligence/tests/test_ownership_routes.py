import unittest
from company_intelligence.discovery import validate_candidate, validate_discovery_candidate
from company_intelligence.transport import SourceError, BudgetExhausted
from test_engine import company, NOW


class HTTP:
 def __init__(self, pages):self.pages=pages;self.calls=[]
 def get(self,url,**kwargs):
  self.calls.append(url)
  value=self.pages[url]
  if isinstance(value,Exception):raise value
  return {'body':value.encode(),'finalUrl':url}


class OwnershipRouteTests(unittest.TestCase):
 def test_linked_same_host_legal_footer_corroborates_root_brand_with_provenance(self):
  root='https://www.cheniere.com/';legal=root+'about'
  http=HTTP({root:'<title>Cheniere</title><a href="/about">About Us</a>',legal:'<title>About Us</title><footer>Copyright 2026 Cheniere Energy, Inc. All rights reserved.</footer>'})
  result=validate_candidate(company('Cheniere Energy, Inc.','LNG','0000003570'),{'url':root,'evidence':'CIK_CANDIDATE'},http,NOW)
  self.assertEqual(result['url'],root);self.assertEqual(result['ownershipEvidence']['legalSourceUrl'],legal)
  self.assertEqual(http.calls,[root,legal]);self.assertIn('FIRST_PARTY_LINKED_OWNERSHIP_ROUTE',result['evidence'])
  self.assertNotEqual(result['contentHash'],result['ownershipEvidence']['legalContentHash'])

 def test_compound_brand_and_full_legal_acronym_still_require_precise_legal_owner(self):
  cases=[('Bio-Rad Laboratories, Inc.','Bio-Rad','BIO'),('JPMorgan Chase & Co.','JPMorganChase','JPM'),('American International Group Inc','AIG','AIG')]
  for legal,header,symbol in cases:
   url='https://issuer.example/'
   good=HTTP({url:f'<title>{header}</title><footer>Copyright 2026 {legal}. All rights reserved.</footer>'})
   self.assertEqual(validate_candidate(company(legal,symbol),{'url':url,'evidence':'candidate'},good,NOW)['status'],'VALIDATED')
   bad=HTTP({url:f'<title>{header}</title><p>{legal} is our customer.</p><footer>Copyright 2026 Different Owner LLC.</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):validate_candidate(company(legal,symbol),{'url':url,'evidence':'candidate'},bad,NOW)

 def test_different_root_owner_prevents_legal_route_rescue(self):
  url='https://issuer.example/'
  http=HTTP({url:'<title>Root</title><footer>Copyright Different Owner LLC.</footer><a href="/legal">Legal</a>'})
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):validate_candidate(company('Root Inc.','ROOT'),{'url':url,'evidence':'candidate'},http,NOW)
  self.assertEqual(http.calls,[url])

 def test_other_host_legal_link_is_never_followed_and_navigation_remains_bounded(self):
  url='https://issuer.example/'
  http=HTTP({url:'<title>Root</title><a href="https://customer.example/legal">Legal</a><a href="/about">About</a><a href="/legal">Legal</a><a href="/privacy">Privacy Policy</a>',url+'about':'<title>Other</title>',url+'legal':'<title>Other</title>'})
  with self.assertRaises(SourceError):validate_candidate(company('Root Inc.','ROOT'),{'url':url,'evidence':'candidate'},http,NOW)
  self.assertEqual(len(http.calls),3);self.assertFalse(any('customer.example' in u for u in http.calls))

 def test_redirect_recovery_requires_independent_owner_and_retained_chain(self):
  root='https://old.example/';final='https://new.example/'
  class RedirectHTTP:
   def get(self,*args,**kwargs):return {'body':b'<title>New</title><footer>Copyright New Corp. All rights reserved.</footer>','finalUrl':final,'redirects':[root]}
  c=company('New Corp.','NEW')
  result=validate_discovery_candidate(c,{'url':root,'evidence':'candidate'},RedirectHTTP(),NOW)
  self.assertEqual(result['url'],final);self.assertEqual(result['redirectEvidence']['fromUrl'],root)
  with self.assertRaisesRegex(SourceError,'REDIRECT'):validate_candidate(c,{'url':root,'evidence':'candidate'},RedirectHTTP(),NOW)
  with self.assertRaises(SourceError):validate_discovery_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},RedirectHTTP(),NOW)

 def test_budget_failure_during_ownership_walk_stays_retryable(self):
  root='https://issuer.example/'
  http=HTTP({root:'<title>Root</title><a href="/about">About</a>',root+'about':BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')})
  with self.assertRaises(BudgetExhausted):validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)

 def test_customer_name_later_in_copyright_region_is_not_ownership(self):
  root='https://issuer.example/'
  for text in ['Copyright 2026 Different Owner LLC. Customers include Root Inc.','Copyright 2026 Root Inc Services LLC. All rights reserved.']:
   http=HTTP({root:'<title>Root</title><footer>'+text+'</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
