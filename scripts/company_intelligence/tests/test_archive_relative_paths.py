import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape

from company_intelligence.distributor_archive import archive_urls, collect
from company_intelligence.model import Resolver
from company_intelligence.store import Store
from test_distributor_archive import URL, INDEX, article
from test_engine import company, NOW


def sitemap(paths):
    return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            ''.join('<url><loc>' + escape(path) + '</loc></url>' for path in paths) + '</urlset>').encode()


RELATIVE = URL.removeprefix('https://www.globenewswire.com')


class ArchiveRelativePathTests(unittest.TestCase):
    def test_advertised_relative_release_and_absolute_duplicate_are_one_candidate(self):
        self.assertEqual(archive_urls(sitemap([RELATIVE]), INDEX), [URL])
        self.assertEqual(archive_urls(sitemap([RELATIVE, URL]), INDEX), [URL])

    def test_relative_support_does_not_expand_publisher_host_or_route_scope(self):
        rejected = ['//evil.example' + RELATIVE, 'https://evil.example' + RELATIVE,
                    'https://www.globenewswire.com.evil.example' + RELATIVE,
                    '/news/en/2026-10.xml', '/news-release/../../private',
                    RELATIVE.replace('/1/', '/../'), 'javascript:' + RELATIVE]
        self.assertEqual(archive_urls(sitemap(rejected + [RELATIVE]), INDEX), [URL])

    def test_relative_release_reuses_staged_metadata_without_refetching_or_body_retention(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = company()
            resolver = Resolver({c['companyId']: c})
            store = Store(Path(tmp) / 'state.sqlite')
            class HTTP:
                def __init__(self):
                    self.calls = []
                    self.memo = {(URL, True): article()}
                def _paths(self, url):
                    return Path(tmp) / 'body', Path(tmp) / 'meta'
                def get(self, url, **kwargs):
                    self.calls.append(url)
                    assert kwargs['persist'] is False
                    return {'body': article(), 'finalUrl': url}
            http = HTTP()
            response = {'body': sitemap([RELATIVE]), 'finalUrl': INDEX}
            source = {'sourceId': 'archive', 'url': INDEX}
            first = collect(source, response, http, store, resolver, NOW)
            self.assertEqual(len(first), 1)
            self.assertEqual(http.calls, [URL])
            self.assertEqual(collect(source, response, http, store, resolver, NOW), first)
            self.assertEqual(http.calls, [URL])
            self.assertEqual(http.memo, {})
            self.assertNotIn('Full copyrighted article', str(store.state('distributorArchive:' + URL)))
            store.set_state('distributorArchive:' + URL, {'status': 'INGESTED'})
            self.assertEqual(collect(source, response, http, store, resolver, NOW), [])
            store.close()


if __name__ == '__main__':
    unittest.main()
