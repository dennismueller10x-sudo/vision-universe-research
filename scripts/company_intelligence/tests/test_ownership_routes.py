import unittest
from company_intelligence.discovery import validate_candidate, validate_discovery_candidate, OWNERSHIP_VERSION
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
 def test_dns_failure_can_recover_conventional_www_route_with_full_owner_proof(self):
  c=company('Acme Industries Inc.','ACME');body='<title>Acme Industries Inc.</title><footer>© 2026 Acme Industries Inc. All rights reserved.</footer>'
  for root,alternate,reason in [('https://acme.example/','https://www.acme.example/','DNS_UNAVAILABLE'),
                                ('https://www.acme.example/','https://acme.example/','ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE')]:
   with self.subTest(root=root):
    h=HTTP({root:SourceError(reason),alternate:body});v=validate_discovery_candidate(c,{'url':root,'evidence':'candidate'},h,NOW)
    self.assertEqual(v['url'],alternate);self.assertEqual(h.calls,[root,alternate])
    self.assertEqual(v['ownershipEvidence']['transportRecovery']['primaryFailure'],reason)
    self.assertIn('CORPORATE_TITLE_AND_LEGAL_COMPANY_NAME',v['evidence'])

 def test_dns_alias_never_accepts_different_company_or_brand_only_evidence(self):
  root='https://acme.example/';alternate='https://www.acme.example/'
  for body in ('<title>Acme Industries Inc.</title><footer>© Different Owner LLC.</footer>',
               '<title>Acme</title><p>Acme Industries Inc. is our customer.</p>'):
   with self.subTest(body=body):
    h=HTTP({root:SourceError('DNS_UNAVAILABLE'),alternate:body})
    with self.assertRaises(SourceError):validate_discovery_candidate(company('Acme Industries Inc.','ACME'),{'url':root},h,NOW)

 def test_access_and_proxy_failures_never_trigger_www_alias_probe(self):
  root='https://acme.example/'
  for reason in ('HTTP_403','ROBOTS_DISALLOWED','ROBOTS_UNAVAILABLE:HTTP_403','HTTP_503',
                 'ROBOTS_UNAVAILABLE:HTTP_503','Envoy proxy error HTTP_503',
                 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:DNS_UNAVAILABLE'):
   with self.subTest(reason=reason):
    h=HTTP({root:SourceError(reason)})
    with self.assertRaisesRegex(SourceError,reason):validate_discovery_candidate(company(),{'url':root},h,NOW)
    self.assertEqual(h.calls,[root])

 def test_dns_alias_attempt_is_bounded_and_preserves_budget_deferral(self):
  root='https://acme.example/';alternate='https://www.acme.example/'
  for failure in (SourceError('DNS_UNAVAILABLE'),BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')):
   h=HTTP({root:SourceError('DNS_UNAVAILABLE'),alternate:failure})
   with self.assertRaises(type(failure)):validate_discovery_candidate(company(),{'url':root},h,NOW)
   self.assertEqual(h.calls,[root,alternate])

 def credit(self,host='www.q4inc.com',path='/Powered-by-Q4/'):
  return f'<a href="https://{host}{path}"><span>Powered By Q4 Inc.</span><span> 5.189.1.6</span><span> (opens in new window)</span></a>'

 def test_exact_q4_credit_does_not_extend_independently_proven_copyright_owner(self):
  url='https://issuer.example/';c=company('Integer Holdings Corporation','ITGR')
  http=HTTP({url:'<title>Integer | Your Innovative Partner</title><footer>© Integer Holdings Corporation '+self.credit()+'</footer>'})
  result=validate_candidate(c,{'url':url,'evidence':'candidate'},http,NOW)
  self.assertEqual(result['status'],'VALIDATED')
  self.assertEqual(result['ownershipEvidence']['excludedProviderCredits'][0]['url'],'https://www.q4inc.com/Powered-by-Q4/')

 def test_linked_credit_copyright_is_not_the_issuer_owner(self):
  url='https://issuer.example/';c=company('Baxter International Inc.','BAX')
  body='<title>Baxter International Inc.</title><p>Baxter International Inc.</p><footer>© Baxter. All rights reserved. '+self.credit().replace('<span>Powered','<span>© Powered')+'</footer>'
  self.assertEqual(validate_candidate(c,{'url':url,'evidence':'candidate'},HTTP({url:body}),NOW)['status'],'VALIDATED')

 def test_provider_credit_never_rescues_a_different_or_extended_legal_owner(self):
  url='https://issuer.example/'
  for owner in ('Different Owner LLC.','Root Inc. Services LLC.','Root Inc. Japan LLC.'):
   http=HTTP({url:'<title>Root</title><footer>© '+owner+' '+self.credit()+'</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    validate_candidate(company('Root Inc.','ROOT'),{'url':url,'evidence':'candidate'},http,NOW)

 def test_long_subsidiary_owner_never_matches_the_listed_parent_prefix(self):
  url='https://issuer.example/'
  for owner in ('Root Inc. Japan East Asia Regional Community Operating Services LLC',
                'Park Hotels & Resorts 2026 International Regional Operating Technology Japan LLC'):
   name='Root Inc.' if owner.startswith('Root') else 'Park Hotels & Resorts Inc.'
   http=HTTP({url:f'<title>{name}</title><footer>© 2026 {owner}. All rights reserved.</footer>'})
   with self.subTest(owner=owner),self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    validate_candidate(company(name),{'url':url,'evidence':'candidate'},http,NOW)

 def test_rights_notice_delimits_an_exact_owner_before_later_legal_entities(self):
  url='https://issuer.example/'
  for notice in ('All rights reserved. Our regional operating company is Japan Services LLC.',
                 'All rights reserved | Japan East Asia Regional Community Operating Services LLC.'):
   http=HTTP({url:f'<title>Root Inc.</title><footer>© 2026 Root Inc. {notice}</footer>'})
   self.assertEqual(validate_candidate(company('Root Inc.','ROOT'),{'url':url,'evidence':'candidate'},http,NOW)['status'],'VALIDATED')

 def test_trademark_notice_after_exact_owner_preserves_legitimate_copyright(self):
  url='https://issuer.example/'
  cases=[('Aquestive Therapeutics, Inc.', 'PharmFilm®, Libervant®, and the Aquestive logo are registered trademarks of Aquestive Therapeutics, Inc. All rights reserved.'),
         ('Invivyd, Inc.', 'Invivyd and Invymab are trademarks of Invivyd, Inc. All rights reserved.')]
  for name,notice in cases:
   http=HTTP({url:f'<title>{name}</title><footer>© 2026 {name} {notice}</footer>'})
   with self.subTest(name=name):
    self.assertEqual(validate_candidate(company(name),{'url':url,'evidence':'candidate'},http,NOW)['status'],'VALIDATED')

 def test_unlinked_or_untrusted_credit_text_is_not_removed(self):
  url='https://issuer.example/'
  for credit in ('Powered By Q4 Inc.',self.credit('q4inc.com.evil.example'),self.credit(path='/unrelated/')):
   http=HTTP({url:'<title>Integer</title><footer>© Integer Holdings Corporation '+credit+'</footer>'})
   with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    validate_candidate(company('Integer Holdings Corporation','ITGR'),{'url':url,'evidence':'candidate'},http,NOW)

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
  http=HTTP({root:'<title>Root</title><a href="/about">About</a><a href="/legal">Legal</a>',root+'legal':'<title>Root</title><footer>Copyright Different Owner LLC.</footer>'})
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
   validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
  self.assertEqual(http.calls,[root,root+'legal'])

 def test_advertised_legal_proof_is_not_crowded_out_by_about_and_ir_routes(self):
  root='https://issuer.example/';privacy=root+'privacy'
  http=HTTP({root:'<title>Root</title><a href="/investors">Investors</a><a href="/about">About</a><a href="/privacy">Privacy Policy</a>',privacy:'<title>Privacy Policy</title><footer>Copyright 2026 Root Inc. All rights reserved.</footer>'})
  result=validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
  self.assertEqual(http.calls,[root,privacy]);self.assertEqual(result['url'],root)
  self.assertEqual(result['ownershipEvidence']['legalSourceUrl'],privacy)

 def test_two_page_allowance_diversifies_legal_and_ir_proof_before_duplicate_routes(self):
  root='https://issuer.example/';privacy=root+'privacy-a';ir=root+'investors'
  http=HTTP({root:'<title>Root</title><a href="/privacy-a">Privacy Policy</a><a href="/privacy-b">Privacy Notice</a><a href="/investors">Investors</a><a href="/investors/events">Investor Events</a><a href="/about">About</a>',privacy:'<title>Privacy</title><p>Data practices.</p>',ir:'<title>Root Investor Relations</title><footer>Copyright 2026 Root Inc. All rights reserved.</footer>'})
  result=validate_candidate(company('Root Inc.','ROOT'),{'url':root,'evidence':'candidate'},http,NOW)
  self.assertEqual(http.calls,[root,privacy,ir]);self.assertEqual(result['ownershipEvidence']['legalSourceUrl'],ir)

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
  self.assertEqual(result['verificationVersion'],OWNERSHIP_VERSION)
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


class CopyrightFormattingTests(unittest.TestCase):
 def verify(self,name,body,title=None):
  url='https://issuer.example/'
  return validate_candidate(company(name),{'url':url,'evidence':'candidate'},HTTP({url:'<title>'+(title or name)+'</title>'+body}),NOW)

 def test_complete_multiword_punctuation_owner_with_navigation_boundary(self):
  result=self.verify('Park Hotels & Resorts Inc.','<footer>© 2026 PARK HOTELS &amp; RESORTS <a href="/terms">Terms &amp; Conditions</a> | Delivered by Investis Digital Company</footer>','Park Hotels & Resorts')
  self.assertEqual(result['status'],'VALIDATED')
  self.assertEqual(result['evidence'][-1],'EXACT_MULTIWORD_COPYRIGHT_OWNER_AND_CORPORATE_HEADER')

 def test_suffixless_prefix_never_accepts_extended_owner(self):
  for owner in ('Park Hotels & Resorts Japan LLC','Park Hotels & Resorts 2026 Travel Ltd','Park Hotels & Resorts 2026 International Operating Technology Japan LLC','Park Hotels & Resorts Services Inc.','Park Hotels & Resorts Terms Conditions LLC','Park Hotels & Resorts Privacy Ltd'):
   with self.subTest(owner=owner),self.assertRaises(SourceError):
    self.verify('Park Hotels & Resorts Inc.','<footer>© 2026 '+owner+'. All rights reserved.</footer>','Park Hotels & Resorts')
  with self.assertRaises(SourceError):self.verify('Root Inc.','<footer>© 2026 Root. All rights reserved.</footer>','Root')

 def test_rights_reserved_by_exact_legal_entity(self):
  result=self.verify('PAVmed Inc.','<footer>© Copyright 2026. All Rights Reserved by PAVmed Inc. AD-0174 Rev B</footer>','PAVmed')
  self.assertEqual(result['status'],'VALIDATED')
  for owner in ('Other Owner LLC','PAVmed Inc. Japan LLC','PAVmed Inc. Services LLC'):
   with self.subTest(owner=owner),self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
    self.verify('PAVmed Inc.','<footer>© Copyright 2026. All Rights Reserved by '+owner+'. Customers include PAVmed Inc.</footer>','PAVmed Inc.')

 def test_copyright_attribution_by_keeps_exact_owner_and_extension_boundaries(self):
  for prefix in ('©Copyright 2014-2026 By ', 'Copyright 2026 by ', '© 2026 By '):
   with self.subTest(prefix=prefix):
    good=self.verify('HEICO Corp','<footer>'+prefix+'HEICO Corporation All Rights Reserved Home About Us</footer>','Home HEICO')
    self.assertEqual(good['status'],'VALIDATED')
    self.assertIn('By' if 'By' in prefix else 'by',good['ownershipEvidence']['copyrightExcerpts'][0])
  for owner in ('Different Owner LLC. Customers include HEICO Corporation',
                'HEICO Corporation Japan LLC', 'HEICO Corporation Services LLC',
                'By HEICO Corporation', 'a partner of HEICO Corporation'):
   with self.subTest(owner=owner),self.assertRaises(SourceError):
    self.verify('HEICO Corp','<footer>©Copyright 2014-2026 By '+owner+'. All rights reserved.</footer>','HEICO Corp')

 def test_copyright_by_never_removes_an_actual_owner_name(self):
  proof=self.verify('By Corporation','<footer>© 2026 By Corporation All rights reserved.</footer>')
  self.assertEqual(proof['status'],'VALIDATED')
  with self.assertRaises(SourceError):
   self.verify('Root Inc.','<footer>© 2026 By Different Owner LLC. Customers include Root Inc.</footer>','Root Inc.')
