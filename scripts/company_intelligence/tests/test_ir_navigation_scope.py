import unittest

from company_intelligence.feeds import discover_ir
from test_engine import company, NOW
from test_ir_navigation_labels import HTTP, ROOT, HUB


class IRNavigationScopeTests(unittest.TestCase):
    def test_external_investor_warning_is_not_a_delegated_company_newsroom(self):
        warning = 'https://www.investor.gov/introduction-investing/investor-alerts/beware-impersonators'
        http = HTTP(f'<a href="{warning}">Beware fraudsters impersonating investment firms</a>')
        sources, configs = discover_ir(company(), ROOT, http, NOW)
        self.assertNotIn(warning, http.calls)
        self.assertFalse(any(c['pageRole'] == 'IR' for c in configs))
        self.assertFalse(any('investor.gov' in s['url'] for s in sources))

    def test_external_investor_hostname_does_not_establish_ownership(self):
        http = HTTP('<a href="https://investor.gov/">Learn about investing safely</a>')
        _, configs = discover_ir(company(), ROOT, http, NOW)
        self.assertNotIn('https://investor.gov/', http.calls)
        self.assertFalse(any(c['pageRole'] == 'IR' for c in configs))

    def test_owned_route_and_explicit_delegated_hub_survive_unrelated_external_links(self):
        owned = ROOT + 'investor-relations/'
        class OwnedHTTP(HTTP):
            def get(self, url, **kwargs):
                if url == owned:
                    self.calls.append(url)
                    return {'body': b'<a href="/2026-investor-presentation.pdf">Investor Presentation</a>', 'finalUrl': url}
                return super().get(url, **kwargs)
        http = OwnedHTTP(f'<a href="https://investor.gov/">Investor safety guide</a>'
                         f'<a href="{owned}">Financial information</a>'
                         f'<a href="{HUB}">Investor Relations</a>')
        _, configs = discover_ir(company(), ROOT, http, NOW)
        hubs = {c['irHomepage'] for c in configs if c['pageRole'] == 'IR'}
        self.assertEqual(hubs, {owned, HUB})
        self.assertTrue(all(c['documents'] for c in configs if c['pageRole'] == 'IR'))
        self.assertNotIn('https://investor.gov/', http.calls)


if __name__ == '__main__':
    unittest.main()
