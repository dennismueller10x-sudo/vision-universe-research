import unittest

from company_intelligence.feeds import discover_ir, parse_links
from company_intelligence.transport import SourceError
from test_engine import company, NOW


class MalformedNavigationTests(unittest.TestCase):
    def test_malformed_links_do_not_discard_valid_owned_routes(self):
        body = b'''<a href="https://[broken">bad IPv6</a>
            <a href="//[broken">bad relative host</a>
            <a href="https://apple.com:bad/path">bad port</a>
            <a href="https://user:password@apple.com/">credentials</a>
            <a href="javascript:alert(1)">script</a>
            <a href="/investors?utm_source=nav">Investor Relations</a>
            <a href="/slides.pdf">Investor Presentation</a>'''
        links = parse_links(body, 'https://apple.com/')
        self.assertEqual([l['url'] for l in links],
                         ['https://apple.com/investors', 'https://apple.com/slides.pdf'])
        self.assertEqual(links[0]['text'], 'Investor Relations')

    def test_discovery_continues_past_malformed_link_to_real_ir_material(self):
        class HTTP:
            def __init__(self):self.calls = []
            def get(self, url, **kwargs):
                self.calls.append(url)
                if url == 'https://apple.com/':
                    body = b'<a href="https://[broken">Investors</a><a href="/investors">Investors</a>'
                elif url == 'https://apple.com/investors':
                    body = b'<a href="//[broken">Presentation</a><a href="/investor-presentation.pdf">Investor Presentation</a>'
                else:raise SourceError('HTTP_404')
                return {'body':body, 'finalUrl':url}
        http = HTTP()
        _, configs = discover_ir(company(), 'https://apple.com/', http, NOW, max_pages=2)
        ir = next(c for c in configs if c['irHomepage'] == 'https://apple.com/investors')
        self.assertEqual(ir['pageRole'], 'IR')
        self.assertEqual(ir['documents'][0]['url'], 'https://apple.com/investor-presentation.pdf')
        self.assertEqual(ir['documents'][0]['type'], 'PRESENTATION')
        self.assertEqual(http.calls[:2], ['https://apple.com/', 'https://apple.com/investors'])
        self.assertEqual(http.calls[2:], ['https://apple.com/rss/news-releases.xml',
                                        'https://apple.com/rss/PressRelease.aspx?LanguageId=1'])
