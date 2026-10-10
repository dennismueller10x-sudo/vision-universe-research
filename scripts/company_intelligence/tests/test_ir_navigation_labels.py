import unittest

from company_intelligence.feeds import discover_ir
from company_intelligence.transport import SourceError
from test_engine import company, NOW


ROOT = 'https://apple.com/'
HUB = 'https://shareholders.example/hub'


class HTTP:
    def __init__(self, navigation):
        self.navigation = navigation
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(url)
        if url == ROOT:
            return {'body': self.navigation.encode(), 'finalUrl': ROOT}
        if url == HUB:
            return {'body': b'<a href="/2026-investor-presentation.pdf">2026 Investor Presentation</a>', 'finalUrl': HUB}
        raise SourceError('HTTP_404')


class IRNavigationLabelTests(unittest.TestCase):
    def test_accessibility_hint_recovers_advertised_delegated_hub_and_material(self):
        for label in ('opens in new browser tabInvestor Relations', 'Opens in a new window Investors'):
            with self.subTest(label=label):
                http = HTTP(f'<a href="{HUB}">{label}</a>')
                _, configs = discover_ir(company(), ROOT, http, NOW)
                ir = next(c for c in configs if c['irHomepage'] == HUB)
                self.assertEqual(ir['pageRole'], 'IR')
                self.assertEqual(ir['documents'][0]['type'], 'PRESENTATION')
                self.assertEqual(http.calls.count(HUB), 1)

    def test_duplicate_visible_and_accessible_labels_recover_exact_navigation(self):
        for markup in ('InvestorsInvestors', 'Investor Relations Investor Relations', '<span>INVESTORS</span><span>INVESTORS</span>'):
            with self.subTest(markup=markup):
                http = HTTP(f'<a href="{HUB}">{markup}</a>')
                _, configs = discover_ir(company(), ROOT, http, NOW)
                self.assertTrue(any(c['irHomepage'] == HUB and c['pageRole'] == 'IR' for c in configs))
        for attribute in ('title', 'aria-label'):
            http = HTTP(f'<a href="{HUB}" {attribute}="Investors">Investors</a>')
            _, configs = discover_ir(company(), ROOT, http, NOW)
            self.assertTrue(any(c['irHomepage'] == HUB for c in configs))

    def test_normalized_hub_ranks_before_faq_with_same_page_cap(self):
        http = HTTP(f'<a href="/investors/faq">Investor FAQs</a><a href="{HUB}">opens in new browser tabInvestors</a>')
        _, configs = discover_ir(company(), ROOT, http, NOW, max_pages=2)
        self.assertEqual(len(configs), 2)
        self.assertEqual(configs[1]['irHomepage'], HUB)
        self.assertNotIn(ROOT + 'investors/faq', http.calls)

    def test_chrome_does_not_authorize_prose_fragments_assets_or_subscriptions(self):
        for markup in (
            f'<a href="{HUB}">opens in new browser tabRetail investing tips</a>',
            f'<a href="{HUB}" title="Investors">Retail investing tips</a>',
            f'<a href="{HUB}">Investors celebrate strong markets</a>',
            '<a href="#investors">InvestorsInvestors</a>',
            '<a href="/deck.pdf">InvestorsInvestors</a>',
            '<a href="/email-alerts">InvestorsInvestors</a>',
        ):
            with self.subTest(markup=markup):
                http = HTTP(markup)
                _, configs = discover_ir(company(), ROOT, http, NOW)
                self.assertFalse(any(c['pageRole'] == 'IR' for c in configs))
                self.assertEqual(http.calls, [ROOT])


if __name__ == '__main__':
    unittest.main()
