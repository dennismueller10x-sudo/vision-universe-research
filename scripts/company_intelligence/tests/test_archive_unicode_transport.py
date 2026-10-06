import json
import tempfile
import unittest
from pathlib import Path
from urllib.request import Request

from company_intelligence.distributor_archive import collect, metadata
from company_intelligence.model import Resolver
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.transport import SourceError
from test_archive_relative_paths import sitemap
from test_distributor_archive import INDEX, URL, article
from test_engine import NOW, company


IRI = URL.replace('apple-inc-earnings', 'apple-inc-tüv-results')
URI = IRI.replace('ü', '%C3%BC')


def unicode_article(canonical=IRI):
    # json.dumps in the retained publisher fixture escapes non-ASCII names.
    return article().replace(URL.encode(), json.dumps(canonical)[1:-1].encode())


class ArchiveUnicodeTransportTests(unittest.TestCase):
    def test_unicode_path_can_be_fetched_and_resumed_under_original_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            c = company()
            resolver = Resolver({c['companyId']: c})

            class HTTP:
                MAX_BYTES = 2 * 1024 * 1024

                def __init__(self):
                    self.calls = []
                    self.memo = {}

                def _paths(self, url):
                    return Path(tmp) / 'body', Path(tmp) / 'meta'

                def get(self, url, **kwargs):
                    # This is the request-target encoding urllib requires.
                    Request(url).selector.encode('ascii')
                    self.calls.append(url)
                    assert kwargs['persist'] is False
                    self.memo[(url, True)] = unicode_article()
                    return {'body': unicode_article(), 'finalUrl': URI}

            http = HTTP()
            response = {'body': sitemap([IRI.removeprefix('https://www.globenewswire.com')]),
                        'finalUrl': INDEX}
            source = {'sourceId': 'archive', 'url': INDEX}
            first = collect(source, response, http, store, resolver, NOW)
            self.assertEqual(len(first), 1)
            self.assertEqual(http.calls, [URI])
            self.assertEqual(first[0]['url'], IRI)
            self.assertEqual(first[0]['distributionMetadata']['contributor'], 'Apple Inc.')
            self.assertEqual(store.state('distributorArchive:' + IRI)['status'], 'PARSED')
            self.assertEqual(collect(source, response, http, store, resolver, NOW), first)
            self.assertEqual(http.calls, [URI])
            self.assertEqual(http.memo, {})
            self.assertNotIn('copyrighted', str(store.state('distributorArchive:' + IRI)))
            store.set_state('distributorArchive:' + IRI, {'status': 'INGESTED'})
            self.assertEqual(collect(source, response, http, store, resolver, NOW), [])
            store.close()

    def test_equivalent_publisher_uri_metadata_preserves_scope_and_route_identity(self):
        self.assertEqual(metadata(unicode_article(URI), IRI)['url'], IRI)
        for destination in [URI.replace('www.globenewswire.com', 'evil.example'),
                            URI.replace('t%C3%BCv', 'different'),
                            URI.replace('/1/', '/2/')]:
            with self.assertRaises(SourceError):
                metadata(unicode_article(destination), IRI)

    def test_real_ingestion_marks_original_iri_checkpoint_and_does_not_refetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            c = company()
            index = sitemap([IRI.removeprefix('https://www.globenewswire.com')])

            class HTTP:
                MAX_BYTES = 2 * 1024 * 1024

                def __init__(self):
                    self.memo = {}
                    self.article_calls = []

                def _paths(self, url):
                    return Path(tmp) / 'body', Path(tmp) / 'meta'

                def get(self, url, **kwargs):
                    if url == INDEX:
                        return {'body': index, 'finalUrl': url}
                    self.article_calls.append(url)
                    Request(url).selector.encode('ascii')
                    return {'body': unicode_article(URI), 'finalUrl': URI}

            http = HTTP()
            pipeline = Pipeline(Path(tmp), {c['companyId']: c}, store, http,
                                '2026-10-03T12:00:00Z')
            source = {'sourceId': 'archive', 'url': INDEX, 'provider': 'GLOBENEWSWIRE_ARTICLE',
                      'type': 'RSS', 'format': 'GNN_ARCHIVE', 'intervalHours': 168}
            pipeline.ingest_source(source)
            self.assertEqual(store.state('distributorArchive:' + IRI)['status'], 'INGESTED')
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 1)
            Pipeline(Path(tmp), {c['companyId']: c}, store, http,
                     '2026-10-03T12:00:00Z').ingest_source(source)
            self.assertEqual(http.article_calls, [URI])
            store.close()

    def test_restored_encoded_metadata_replays_under_original_iri_without_article_fetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            c = company()
            store.set_state('distributorArchive:' + IRI, {
                'status': 'PARSED', 'entry': metadata(unicode_article(URI), URI)})

            class HTTP:
                MAX_BYTES = 2 * 1024 * 1024
                memo = {}

                def get(self, url, **kwargs):
                    assert url == INDEX, 'STAGED_ARTICLE_REFETCHED'
                    return {'body': sitemap([IRI]), 'finalUrl': INDEX}

            pipeline = Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(),
                                '2026-10-03T12:00:00Z')
            pipeline.ingest_source({'sourceId': 'archive', 'url': INDEX,
                                    'provider': 'GLOBENEWSWIRE_ARTICLE', 'type': 'RSS',
                                    'format': 'GNN_ARCHIVE', 'intervalHours': 168})
            self.assertEqual(store.state('distributorArchive:' + IRI)['status'], 'INGESTED')
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 1)
            store.close()


if __name__ == '__main__':
    unittest.main()
