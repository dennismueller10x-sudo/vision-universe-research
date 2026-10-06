import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.wordpress_backfill import batch
from company_intelligence.wordpress_news import endpoint
from company_intelligence.store import Store
from company_intelligence.transport import SourceError, BudgetExhausted
from company_intelligence.checkpoint import pack, restore
from test_engine import company, NOW


class HTTP:
    def __init__(self, pages):
        self.pages, self.calls, self.requests = pages, [], 0
        self.stats = {'bytesDownloaded': 0, 'cacheHits': 0, 'memoHits': 0, 'notModified': 0, 'retries': 0}
        self.opener = lambda *a, **k: None
        self._wait = lambda *a: None

    def get(self, url, **kwargs):
        self.calls.append(url)
        self.requests += 1
        value = self.pages[url]
        if isinstance(value, Exception):
            raise value
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.stats['bytesDownloaded'] += len(body)
        return {'body': body, 'finalUrl': url, 'sha256': 'retained-test-hash'}


def setup(store, c, root):
    page = root + 'investors/'
    store.set_state('ir:' + c['companyId'], {'configurations': [{'companyId': c['companyId'], 'providerType': 'WORDPRESS', 'pageRole': 'IR', 'irHomepage': page}]})
    store.set_state('officialSite:' + c['companyId'], {'status': 'VALIDATED', 'url': root})
    return page


def pages(c, root, headline=None):
    return {root + 'investors/': ('<link rel="https://api.w.org/" href="' + root + 'wp-json/">').encode(),
            endpoint(root + 'wp-json/'): [{'title': {'rendered': headline or c['names'][0] + ' announces quarterly results'},
                                          'link': root + 'results', 'date_gmt': '2026-10-01T12:00:00'}]}


class WordPressBackfillTests(unittest.TestCase):
    def test_restore_resumes_frozen_pending_company_and_skips_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / 'state'; state.mkdir(); s = Store(state / 'state.sqlite')
            a = company(); b = company('Acme Holdings Inc.', 'ACME', '0001788882')
            setup(s, a, 'https://apple.com/'); setup(s, b, 'https://acme.example/')
            cs = {c['companyId']: c for c in (a, b)}
            h = HTTP({**pages(a, 'https://apple.com/'), **pages(b, 'https://acme.example/')})
            first = batch(root, s, cs, 'wp-run', h, NOW, limit=1, seeds={})
            self.assertEqual(first['newFirstPartyNewsIssuers'], [a['companyId']]); s.close()
            backup = pack(state, root / 'copy.tar.gz'); dest = root / 'restored'; restore(root / 'copy.tar.gz', dest, backup['sha256'])
            s = Store(dest / 'state.sqlite'); later = company('Later Inc.', 'LATER', '0000001111'); setup(s, later, 'https://later.example/'); cs[later['companyId']] = later
            h = HTTP(pages(b, 'https://acme.example/')); second = batch(root, s, cs, 'wp-run', h, NOW, seeds={})
            self.assertEqual(second['newFirstPartyNewsIssuers'], [b['companyId']])
            self.assertEqual(len(s.state('wordpressCoverage:wp-run:inventory')), 2)
            self.assertEqual(s.state('wordpressCoverage:wp-run:run')['recoveredIssuers'], sorted([a['companyId'], b['companyId']]))
            self.assertFalse(any('apple' in u or 'later' in u for u in h.calls)); s.close()

    def test_changed_approved_host_or_withdrawn_ir_identity_is_withheld_without_http(self):
        for change in ('root', 'ir'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                s = Store(Path(tmp) / 'state.sqlite'); c = company(); page = setup(s, c, 'https://apple.com/')
                s.set_state('wordpressCoverage:wp-run:inventory', [{'companyId': c['companyId'], 'page': page}])
                s.set_state('officialSite:' + c['companyId'], {'status': 'VALIDATED', 'url': 'https://other.example/'}) if change == 'root' else s.set_state('ir:' + c['companyId'], {})
                h = HTTP({}); batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
                self.assertEqual(h.requests, 0); self.assertEqual(s.state('wordpressCoverage:wp-run:' + c['companyId'])['status'], 'WITHHELD'); s.close()

    def test_prior_rest_access_cooldown_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); c = company(); setup(s, c, 'https://apple.com/')
            prior = {'status': 'SOURCE_FAILURE', 'reason': 'HTTP_403', 'retryAfter': '2026-10-20T00:00:00Z'}
            s.set_state('wordpressMetadata52:' + c['companyId'], prior); h = HTTP({})
            batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
            self.assertEqual(h.requests, 0); self.assertEqual(s.state('wordpressMetadata52:' + c['companyId']), prior)
            self.assertEqual(s.state('wordpressCoverage:wp-run:' + c['companyId'])['status'], 'COOLDOWN'); s.close()

    def test_unadvertised_or_foreign_api_never_becomes_a_source(self):
        for body in (b'<p>No API</p>', b'<link rel="https://api.w.org/" href="https://evil.example/wp-json/">'):
            with self.subTest(body=body), tempfile.TemporaryDirectory() as tmp:
                s = Store(Path(tmp) / 'state.sqlite'); c = company(); page = setup(s, c, 'https://apple.com/'); h = HTTP({page: body})
                batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
                self.assertEqual(h.calls, [page]); self.assertEqual(s.sources(), []); s.close()

    def test_shared_proxy_circuit_preserves_pending_queue_and_cooldown(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); cs = {}; bodies = {}
            for n in range(5):
                c = company('Issuer ' + str(n) + ' Inc.', 'ISS' + str(n), str(n + 1).zfill(10)); cs[c['companyId']] = c
                page = setup(s, c, 'https://host' + str(n) + '.example/'); bodies[page] = SourceError('HTTP_503 envoy proxy error')
            h = HTTP(bodies); result = batch(Path(tmp), s, cs, 'wp-run', h, NOW, seeds={})
            self.assertEqual(result['stopReason'], 'CIRCUIT_OPEN'); self.assertEqual(h.requests, 4)
            self.assertEqual(sum(s.state('wordpressCoverage:wp-run:' + cid) is None for cid in cs), 1)
            h = HTTP({}); self.assertEqual(batch(Path(tmp), s, cs, 'wp-run', h, NOW, seeds={})['stopReason'], 'CIRCUIT_COOLDOWN')
            self.assertEqual(h.requests, 0)
            self.assertTrue(all(s.state('officialSite:' + cid)['status'] == 'VALIDATED' for cid in cs)); s.close()

    def test_approved_bootstrap_root_is_reused_without_inventing_runtime_ownership(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); c = company(); setup(s, c, 'https://apple.com/')
            s.set_state('officialSite:' + c['companyId'], {}); h = HTTP(pages(c, 'https://apple.com/'))
            result = batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={c['cik']: {'url': 'https://apple.com/'}})
            self.assertEqual(result['newFirstPartyNewsIssuers'], [c['companyId']]); self.assertEqual(s.state('officialSite:' + c['companyId']), {})
            source = s.sources()[0]; self.assertEqual(source['intervalHours'], 4); self.assertEqual(source['format'], 'WORDPRESS_REST_NEWS'); s.close()

    def test_budget_boundary_is_durable_and_does_not_repeat_completed_companies(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); c = company(); page = setup(s, c, 'https://apple.com/')
            h = HTTP({page: BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')})
            report = batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
            self.assertEqual(report['stopReason'], 'BUDGET_DEFERRED')
            self.assertEqual(s.state('wordpressCoverage:wp-run:' + c['companyId'])['status'], 'DEFERRED')
            h = HTTP({}); batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
            self.assertEqual(h.requests, 0); self.assertEqual(s.state('officialSite:' + c['companyId'])['status'], 'VALIDATED'); s.close()

    def test_other_company_metadata_never_creates_news_or_source(self):
        from urllib.parse import urlencode
        from company_intelligence.model import canonical_url
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); c = company(); setup(s, c, 'https://apple.com/')
            values = pages(c, 'https://apple.com/', 'Different Company Inc. announces quarterly results')
            values[canonical_url('https://apple.com/wp-json/?' + urlencode({'_fields': 'namespaces,routes'}))] = {'namespaces': [], 'routes': {}}
            h = HTTP(values); report = batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
            self.assertEqual(report['newFirstPartyNewsIssuers'], [])
            self.assertEqual(s.sources(), []); self.assertEqual(s.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 0); s.close()

    def test_unexpected_batch_exit_still_packs_the_durable_private_ledger(self):
        from company_intelligence.wordpress_backfill import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / '.company-intelligence'
            def failed_batch(root, store, *args, **kwargs):
                store.set_state('partialFact', {'status': 'DURABLE'})
                raise RuntimeError('interrupted after fact')
            with patch('sys.argv', ['wordpress_backfill', '--root', str(root), '--run-id', 'wp-run', '--network']), \
                    patch('company_intelligence.wordpress_backfill.load_universe', return_value={}), \
                    patch('company_intelligence.wordpress_backfill.batch', side_effect=failed_batch), \
                    self.assertRaisesRegex(RuntimeError, 'interrupted after fact'):
                main()
            archive = state / 'checkpoints/wp-run-wordpress.tar.gz'
            self.assertTrue(archive.exists())
            restore(archive, root / 'restored')
            s = Store(root / 'restored/state.sqlite'); self.assertEqual(s.state('partialFact'), {'status': 'DURABLE'}); s.close()

    def test_fresh_ir_owner_conflict_blocks_metadata_without_invalidating_prior_domain(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite'); c = company('Root Inc.', 'ROOT', '0001788882')
            page = setup(s, c, 'https://root.example/')
            body = b'<title>Root Inc.</title><footer>Copyright Root Inc. Japan East Asia Regional Community Operating Services LLC.</footer><link rel="https://api.w.org/" href="https://root.example/wp-json/">'
            h = HTTP({page: body}); batch(Path(tmp), s, {c['companyId']: c}, 'wp-run', h, NOW, seeds={})
            self.assertEqual(h.calls, [page]); self.assertEqual(s.sources(), [])
            self.assertEqual(s.state('wordpressCoverage:wp-run:' + c['companyId'])['reason'], 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER')
            self.assertEqual(s.state('officialSite:' + c['companyId'])['status'], 'VALIDATED'); s.close()
