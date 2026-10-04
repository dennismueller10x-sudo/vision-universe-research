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
  for text in ['Copyright 2026 Different Owner LLC. Customers include Root Inc.','Copyright 2026 Root Inc Services LLC. All rights reserved.','Copyright 2026 Root Inc Japan LLC. All rights reserved.']:
   http=HTTP({root:'<title>Root</title><footer>'+text+'</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)

 def test_transient_legal_page_failure_is_retryable_rather_than_an_identity_rejection(self):
  root='https://issuer.example/'
  http=HTTP({root:'<title>Root</title><a href="/about">About</a>',root+'about':SourceError('HTTP_503')})
  with self.assertRaisesRegex(SourceError,'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:HTTP_503') as caught:
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
  self.assertEqual(caught.exception.ownershipEvidence['temporaryOwnershipRoutes'][0]['url'],root+'about')

 def test_conflicting_linked_legal_owner_is_not_rescued_by_another_page(self):
  root='https://issuer.example/'
  http=HTTP({root:'<title>Root</title><a href="/about">About</a><a href="/legal">Legal</a>',root+'about':'<title>Root</title><footer>Copyright Different Owner LLC.</footer>'})
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
  self.assertEqual(http.calls,[root,root+'about'])

 def test_rights_reserved_before_exact_legal_owner_is_a_bounded_footer_template(self):
  root='https://issuer.example/'
  good=HTTP({root:'<title>Air T Inc.</title><footer>© 2026 All Rights Reserved - Air T, Inc.</footer>'})
  self.assertEqual(validate_candidate(company('Air T Inc.','AIRT'),{'url':root,'evidence':'candidate'},good,NOW)['status'],'VALIDATED')
  bad=HTTP({root:'<title>Root Inc.</title><footer>© 2026 All Rights Reserved - Other Owner LLC. Customers include Root Inc.</footer>'})
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},bad,NOW)

 def test_advertised_ir_sibling_under_www_corporate_base_retains_exact_owner_requirement(self):
  root='https://www.issuer.example/';ir='https://ir.issuer.example/'
  good=HTTP({root:'<title>Root</title><a href="https://ir.issuer.example/">Investors</a>',ir:'<title>Root Investor Relations</title><footer>Copyright 2026 Root Inc. All rights reserved.</footer>'})
  result=validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},good,NOW)
  self.assertEqual(result['url'],root);self.assertEqual(result['ownershipEvidence']['legalSourceUrl'],ir)
  self.assertEqual(result['verificationVersion'],'corporate-ownership-7')
  bad=HTTP({root:'<title>Root</title><a href="https://ir.issuer.example/">Investors</a>',ir:'<title>Root Investor Relations</title><footer>Copyright Different Owner LLC.</footer>'})
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},bad,NOW)

 def test_hosting_tenants_other_prefixes_and_foreign_ir_redirects_never_broaden_ownership_scope(self):
  from company_intelligence.discovery import linked_corporate_host
  for root,other in [('https://www.issuer.q4ir.example/','https://ir.other-issuer.q4ir.example/'),('https://tenant.issuer.example/','https://ir.issuer.example/'),('https://www.co.uk/','https://unrelated.co.uk/')]:
   self.assertFalse(linked_corporate_host(other,root))
  root='https://www.issuer.example/';ir='https://ir.issuer.example/'
  class RedirectHTTP(HTTP):
   def get(self,url,**kwargs):
    r=super().get(url,**kwargs)
    if url==ir:r['finalUrl']='https://other.example/'
    return r
  http=RedirectHTTP({root:'<title>Root</title><a href="https://ir.issuer.example/">Investors</a>',ir:'<title>Root Investor Relations</title><footer>Copyright 2026 Root Inc. All rights reserved.</footer>'})
  with self.assertRaisesRegex(SourceError,'OWNER_NOT_VALIDATED'):
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)

 def test_a_generic_or_subsidiary_root_header_cannot_inherit_ownership_from_www_ir_sibling(self):
  root='https://www.issuer.example/';ir='https://ir.issuer.example/'
  for header in ('Home','Different Subsidiary Brand'):
   http=HTTP({root:f'<title>{header}</title><a href="https://ir.issuer.example/">Investors</a>',ir:'<title>Root Investor Relations</title><footer>Copyright 2026 Root Inc. All rights reserved.</footer>'})
   with self.assertRaisesRegex(SourceError,'OWNER_NOT_VALIDATED'):
    validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
   self.assertEqual(http.calls,[root])

 def test_sec_jurisdiction_annotation_and_exact_footer_punctuation(self):
  root='https://issuer.example/'
  for name,footer in [('Rush Enterprises Inc \\tx\\','Rush Enterprises, Inc. Privacy Policy'),('Outdoor Holding Co','Outdoor Holding Company - All rights reserved Powered By Q4 Inc.')]:
   http=HTTP({root:f'<title>{name}</title><footer>© 2026 {footer}</footer>'})
   proof=validate_candidate(company(name,'ISSUER'),{'url':root,'evidence':'candidate'},http,NOW)
   self.assertEqual(proof['status'],'VALIDATED');self.assertTrue(proof['ownershipEvidence']['copyrightExcerpts'])

 def test_precise_owner_before_labelled_navigation_anchor_keeps_a_structural_boundary(self):
  root='https://issuer.example/'
  http=HTTP({root:'<title>Diodes Incorporated</title><footer>©2026 Diodes Incorporated <a href="/contact">Contact Us</a></footer>'})
  self.assertEqual(validate_candidate(company('Diodes Incorporated','DIOD'),{'url':root,'evidence':'candidate'},http,NOW)['status'],'VALIDATED')
  for footer in ['Root Inc Contact Us LLC', 'Root Inc <a href="/owner">Japan LLC</a>', 'Other Owner LLC <a href="/contact">Contact Us</a> Customers include Root Inc.']:
   bad=HTTP({root:'<title>Root</title><footer>©2026 '+footer+'</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER') as caught:
    validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},bad,NOW)
   self.assertTrue(caught.exception.ownershipEvidence['copyrightExcerpts'])

 def test_complete_legal_title_normalizes_company_and_co_without_owner_prefix_matching(self):
  root='https://issuer.example/'
  for name,title in [('Coffee Holding Co Inc','Coffee Holding Company Inc | Committed to Coffee'),('Harmony Gold Mining Co Ltd','Home | Harmony Gold Mining Company Limited')]:
   h=HTTP({root:f'<title>{title}</title><p>{name}</p>'})
   self.assertEqual(validate_candidate(company(name,'ISSUER'),{'url':root,'evidence':'candidate'},h,NOW)['status'],'VALIDATED')
  for title in ['Coffee Holding Company Inc Services LLC','Coffee Holding Company Ireland Limited']:
   h=HTTP({root:f'<title>{title}</title><p>Coffee Holding Co Inc is a customer.</p>'})
   with self.assertRaisesRegex(SourceError,'OWNER_NOT_VALIDATED'):
    validate_candidate(company('Coffee Holding Co Inc','ISSUER'),{'url':root,'evidence':'candidate'},h,NOW)
