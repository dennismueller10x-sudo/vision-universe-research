import unittest
from company_intelligence.sec_site_candidates import collect, declared_sites, primary_annual

NOW = '2026-10-06T12:00:00Z'
COMPANY = {'cik': '0001551152'}
ANNUAL = {'url': 'https://www.sec.gov/Archives/edgar/data/1551152/000155115226000008/abbv-20251231.htm',
          'cik': COMPANY['cik'], 'filingDate': '2026-02-20'}


def submissions(cik=1551152):
    return {'cik': cik, 'filings': {'recent': {'form': ['10-Q', '10-K'],
            'filingDate': ['2026-08-01', '2026-02-20'],
            'accessionNumber': ['0001551152-26-000099', '0001551152-26-000008'],
            'primaryDocument': ['q.htm', 'abbv-20251231.htm']}}}


class SecSiteCandidateTests(unittest.TestCase):
    def sites(self, text):
        return declared_sites(text.encode(), ANNUAL)

    def test_exact_current_cik_and_recent_primary_annual_only(self):
        self.assertEqual(primary_annual(COMPANY, submissions(), NOW), {'form': '10-K', **ANNUAL})
        with self.assertRaisesRegex(ValueError, 'CIK_MISMATCH'):
            primary_annual(COMPANY, submissions(6201), NOW)
        self.assertIsNone(primary_annual(COMPANY, submissions(), '2027-02-21T00:00:00Z'))
        data = submissions(); data['filings']['recent']['primaryDocument'][1] = '../another.htm'
        self.assertIsNone(primary_annual(COMPANY, data, NOW))

    def test_observed_abbvie_and_american_declarations_are_candidates_only(self):
        rows = self.sites('Our investor relations website (investors.abbvie.com) contains reports. '
                          'Our website is located at www.aa.com.')
        self.assertEqual([r['url'] for r in rows], ['https://investors.abbvie.com/', 'https://www.aa.com/'])
        self.assertTrue(all(r['evidence'].endswith('CANDIDATE_ONLY') for r in rows))
        self.assertTrue(all(r['sourceCIK'] == COMPANY['cik'] for r in rows))

    def test_country_hostname_is_not_truncated_to_another_company(self):
        self.assertEqual(self.sites('Our website is issuer.co.uk.' )[0]['url'], 'https://issuer.co.uk/')

    def test_observed_named_possessive_requires_the_exact_cik_matched_issuer_name(self):
        body = b"Reports are available through AbbVie's investor relations website ( investors.abbvie.com )."
        self.assertEqual(declared_sites(body, ANNUAL), [])
        self.assertEqual(declared_sites(body, ANNUAL, ['AbbVie Inc.'])[0]['url'], 'https://investors.abbvie.com/')
        self.assertEqual(declared_sites(body, ANNUAL, ['Another Inc.']), [])

    def test_observed_internet_website_declarations_are_candidate_only(self):
        for text, url in [('Our internet website address is pultegroupinc.com.', 'https://pultegroupinc.com/'),
                          ('We maintain an internet website at www.icf.com.', 'https://www.icf.com/')]:
            with self.subTest(text=text):
                self.assertEqual(self.sites(text)[0]['url'], url)
                self.assertTrue(self.sites(text)[0]['evidence'].endswith('CANDIDATE_ONLY'))

    def test_observed_company_reporting_clause_and_corporation_ir_declaration(self):
        text = ('The Company makes available free of charge on its website at www.umb.com/investor, its annual report. '
                'Reports are provided through the Corporation\u2019s investor relations website, fbpinvestor.com.')
        self.assertEqual([x['url'] for x in self.sites(text)],
                         ['https://fbpinvestor.com/', 'https://www.umb.com/investor'])

    def test_bare_third_party_its_website_is_not_an_issuer_declaration(self):
        self.assertEqual(self.sites('The supplier offers reports on its website at supplier.com.'), [])
        self.assertEqual(self.sites('The Company makes available reports. A supplier uses its website at supplier.com.'), [])

    def test_sec_third_party_script_and_unsafe_hosts_are_excluded(self):
        for address in ['https://www.sec.gov/reports', 'https://localhost/', 'https://127.0.0.1/',
                        'https://user:password@issuer.com/', 'https://issuer.com:bad/',
                        'https://issuer.internal/', 'https://linkedin.com/issuer']:
            with self.subTest(address=address):
                self.assertEqual(self.sites('Our website is ' + address), [])
        self.assertEqual(self.sites('<script>Our website is wrong.com</script> unrelated.com'), [])

    def test_unrelated_unlabelled_sites_and_distant_links_do_not_become_candidates(self):
        self.assertEqual(self.sites('Supplier website is wrong.com. Our website ' + 'x' * 250 + 'issuer.com'), [])

    def test_window_edge_cannot_truncate_sec_or_company_url_into_another_host(self):
        for url, partial in [('http://www.sec.gov/reports', 'http://www.s'),
                             ('https://legitimate-issuer.com/investors', 'https://legitimate-issuer.co')]:
            with self.subTest(url=url):
                filler = ' ' + 'x' * (238 - len(partial)) + ' '
                self.assertEqual(self.sites('Our website' + filler + url), [])

    def test_complete_url_at_window_edge_is_accepted_without_scanning_beyond_budget(self):
        url = 'https://issuer.com'
        # Whitespace is normalized, so use a non-whitespace filler within one word.
        filler = ' ' + 'x' * (238 - len(url)) + ' '
        self.assertEqual(self.sites('Our website' + filler + url + ' reports')[0]['url'], 'https://issuer.com/')
        self.assertEqual(self.sites('Our website ' + 'x' * 240 + ' https://issuer.com'), [])

    def test_only_hash_and_bounded_evidence_are_returned_not_filing_body(self):
        body = b'<p>Our website is issuer.com.</p>'
        class Provider:
            def get_submissions(self, cik, include_history):
                self.request = (cik, include_history); return submissions()
            def get_bytes(self, url, expected_statuses):
                self.url = url; return body
        provider = Provider(); provider.client = provider
        result = collect(COMPANY, provider, NOW)
        self.assertEqual(provider.request, (COMPANY['cik'], False))
        self.assertEqual(provider.url, ANNUAL['url'])
        self.assertEqual(result['bytesDownloaded'], len(body))
        self.assertFalse(result['rawBodyPersisted'])
        self.assertTrue(result['ownershipVerificationRequired'])
        self.assertNotIn('body', result)
        self.assertLessEqual(len(result['candidates'][0]['excerpt']), 320)


if __name__ == '__main__':
    unittest.main()
