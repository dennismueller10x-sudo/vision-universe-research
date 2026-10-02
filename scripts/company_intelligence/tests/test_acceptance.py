import json
import tempfile
import unittest
import sys
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.acceptance import fingerprint, prepare, advance, verify
from company_intelligence.checkpoint import pack, restore
from company_intelligence.model import Resolver, load_universe
from company_intelligence.feeds import parse_feed
from company_intelligence.earnings import project_sec
from company_intelligence.store import Store
from company_intelligence.coverage import report
from test_engine import company, source, item, NOW

ROOT = Path(__file__).resolve().parents[3]
GN = {'sourceId': 'gn-fixture', 'type': 'RSS', 'provider': 'GLOBENEWSWIRE_RSS', 'verified': False,
      'url': 'https://www.globenewswire.com/RssFeed/country/United%20States/feedTitle/test'}


class AcceptanceTests(unittest.TestCase):
    def test_next_day_call_links_only_with_unique_explicit_fiscal_period(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                release = {'eventId': 'planned', 'companyId': c['companyId'], 'headline': 'Official planned earnings',
                           'eventType': 'EARNINGS_SCHEDULED', 'date': '2026-10-27', 'fiscalYear': 2026, 'fiscalQuarter': 'Q3', 'confirmationStatus': 'CONFIRMED'}
                call = {**release, 'eventId': 'call', 'eventType': 'EARNINGS_CALL', 'date': '2026-10-28'}
                store.event(release, NOW); store.event(call, NOW)
                self.assertEqual(store.company_payload(c, NOW)['calls'][0]['scheduledEarningsEventId'], 'planned')
                store.event({**call, 'fiscalQuarter': 'Q4'}, NOW)
                self.assertNotIn('scheduledEarningsEventId', store.company_payload(c, NOW)['calls'][0])
                store.event({**call, 'fiscalQuarter': None}, NOW)
                self.assertNotIn('scheduledEarningsEventId', store.company_payload(c, NOW)['calls'][0])
            finally: store.close()

    def test_foreign_results_description_cannot_override_contradictory_document(self):
        c = company()
        acc = '0000320193-26-000001'
        sub = {'cik': c['cik'], 'filings': {'recent': {'accessionNumber': [acc], 'form': ['6-K'],
               'filingDate': [NOW[:10]], 'primaryDocDescription': ['Third quarter financial results']}}}
        for outcome in [None, 'UNVERIFIED', 'FUTURE_BOARD_MEETING']:
            sub['_intelligenceDocumentEvidence'] = {acc: {'outcome': outcome}} if outcome else {}
            events = project_sec(c, None, sub, None, NOW)
            self.assertFalse(any(e['eventType'] == 'EARNINGS_PUBLISHED' for e in events))
            self.assertTrue(any(e['eventType'] == 'EARNINGS_CANDIDATE' for e in events))
        sub['_intelligenceDocumentEvidence'] = {acc: {'outcome': 'EARNINGS_RELEASE'}}
        e = next(e for e in project_sec(c, None, sub, None, NOW) if e['eventType'] == 'EARNINGS_PUBLISHED')
        self.assertEqual(e['detectionEvidence'], ['SEC_DOCUMENT_EXPLICIT_EARNINGS_RELEASE'])

    def test_403_index_gap_is_retained_while_later_indexes_continue(self):
        from company_intelligence.sec_stream import scan
        from quant.sec.http_client import SECHTTPError
        class Client:
            def get_bytes(self, url, **kwargs):
                if '20260930' in url: raise SECHTTPError(url, 403, 'denied or holiday', 1)
                return b'CIK|Company Name|Form Type|Date Filed|File Name\n-----\n'
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-09-30')
                r = scan(store, {}, Client(), '2026-10-02T00:00:00Z')
                self.assertEqual(r['checkedDays'], ['2026-10-01'])
                self.assertEqual(r['unresolvedIndexDays'], ['2026-09-30'])
                self.assertEqual(store.state('secStreamIndexGaps')['2026-09-30']['httpStatus'], 403)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-02')
                self.assertEqual(scan(store, {}, Client(), '2026-10-02T12:00:00Z')['attemptedDays'], 0)
            finally: store.close()

    def test_backslash_links_from_malformed_html_are_rejected(self):
        from company_intelligence.model import canonical_url
        self.assertIsNone(canonical_url('https://issuer.com/\\"/news\\"'))

    def test_wrong_sec_response_cannot_poison_durable_issuer_metadata(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            pipeline = Pipeline(Path(tmp), {c['companyId']: c}, store, object(), NOW)
            pipeline.sec_client = lambda budget: object()
            try:
                with patch('quant.sec.provider.SECProvider.get_submissions', return_value={'cik': '123', 'filings': {'recent': {}}}):
                    pipeline.project_company(c, fetch_sec=True)
                self.assertEqual(pipeline.run['secFailures'], 1)
                self.assertIsNone(store.state('sec-submissions:' + c['companyId']))
                self.assertEqual(store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)
            finally: store.close()

    def test_material_stream_exact_cik_join_checkpoint_and_denial_recovery(self):
        from company_intelligence.sec_stream import scan
        now = '2026-10-02T00:00:00Z'
        c = company()
        header = 'CIK|Company Name|Form Type|Date Filed|File Name\n-----\n'
        text = header + '320193|Apple Inc|8-K|20261001|edgar/data/320193/0000320193-26-000001.txt\n' + '123|Other|8-K|2026-10-01|edgar/data/123/0000000123-26-000001.txt\n' + '320193|Wrong path|8-K|2026-10-01|edgar/data/123/0000320193-26-000002.txt\n'
        class Client:
            calls = 0
            fail = False
            def get_bytes(self, *args, **kwargs):
                self.calls += 1
                if self.fail: raise RuntimeError('HTTP_403')
                return text.encode()
        client = Client()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-10-01')
                client.fail = True
                with self.assertRaisesRegex(RuntimeError, '403'): scan(store, {c['companyId']: c}, client, now)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-01')
                self.assertIsNone(store.state('secStreamPending'))
                client.fail = False
                result = scan(store, {c['companyId']: c}, client, now)
                self.assertEqual(result['matchedFilings'], 1)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-02')
                self.assertEqual(store.state('secStreamPending')[c['companyId']]['latestAccession'], '0000320193-26-000001')
                before = client.calls
                self.assertEqual(scan(store, {c['companyId']: c}, client, now)['checkedDays'], [])
                self.assertEqual(client.calls, before)
                # No input change cannot grow the pending queue.
                self.assertEqual(len(store.state('secStreamPending')), 1)
            finally: store.close()

    def test_material_stream_invalid_index_does_not_advance(self):
        from company_intelligence.sec_stream import scan
        class Client:
            def get_bytes(self, *args, **kwargs): return b'<html>Access denied</html>'
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-10-01')
                with self.assertRaisesRegex(ValueError, 'INVALID_HEADER'): scan(store, {}, Client(), '2026-10-02T00:00:00Z')
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-01')
            finally: store.close()

    def test_three_fresh_states_preserve_exact_ledger_and_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            expected = prepare(base / 'a')
            self.assertGreater(expected['tables']['events']['count'], 1)
            self.assertEqual(expected['tables']['event_alias']['count'], 1)
            pack(base / 'a', base / 'snapshot')
            restore(base / 'snapshot', base / 'b')
            newer = advance(base / 'b', expected)
            self.assertNotEqual(newer['logicalHash'], expected['logicalHash'])
            pack(base / 'b', base / 'updated')
            restore(base / 'updated', base / 'c')
            self.assertEqual(verify(base / 'c', newer), newer)
            with self.assertRaisesRegex(ValueError, 'MISMATCH'):
                verify(base / 'c', expected)

    def test_real_distributor_fixture_resolves_contributor_not_incidental_exchange(self):
        universe = load_universe(ROOT)
        resolver = Resolver(universe)
        entries = parse_feed((Path(__file__).parent / 'fixtures/globenewswire-metadata.xml').read_bytes(), GN['url'])
        rare = next(e for e in entries if e['headline'].startswith('Ultragenyx'))
        matched = resolver.resolve(rare, GN)
        self.assertEqual([m['companyId'] for m in matched], ['iss_cik_0001515673'])
        moderna = next(e for e in entries if e['headline'].startswith('Moderna'))
        self.assertFalse(any(m['companyId'] == 'iss_cik_0001120193' for m in resolver.resolve(moderna, GN)))
        self.assertFalse(any(m['companyId'] == 'iss_cik_0001120193' for m in resolver.resolve(moderna, {'verified': False})))
        # A changed ticker or a wrong company with matching ticker fails closed.
        for changed in [{'stocks': ['Nasdaq:ROOT'], 'contributor': 'Ultragenyx Pharmaceutical Inc.'},
                        {'stocks': ['NYSE:RARE'], 'contributor': 'Ultragenyx Pharmaceutical Inc.'},
                        {'stocks': ['Nasdaq:RARE'], 'contributor': 'Root Inc.'}]:
            self.assertFalse(resolver.resolve({**rare, 'distributionMetadata': changed}, GN))
        self.assertFalse(resolver.resolve({**rare, 'url': 'https://evil.example/story'}, GN))

    def test_common_word_contributor_needs_both_legal_identity_and_listing(self):
        c = company('Root, Inc.', 'ROOT', '0001788882')
        c['listings'][0]['exchange'] = 'NASDAQ'
        resolver = Resolver({c['companyId']: c})
        entry = {'headline': 'Root announces a partnership', 'url': 'https://www.globenewswire.com/news-release/test',
                 'distributionMetadata': {'stocks': ['Nasdaq:ROOT'], 'contributor': 'Root, Inc.'}}
        self.assertEqual(len(resolver.resolve(entry, GN)), 1)
        self.assertFalse(resolver.resolve({**entry, 'distributionMetadata': {'stocks': ['Nasdaq:ROOT'], 'contributor': 'Root Foundation'}}, GN))
        self.assertFalse(resolver.resolve({'headline': 'root of a tree'}, GN))

    def test_sec_bundle_one_per_filing_no_speculative_ceo_or_transaction(self):
        c = company()
        acc = '0000320193-26-000001'
        sub = {'cik': c['cik'], 'filings': {'recent': {'accessionNumber': [acc], 'form': ['8-K'], 'filingDate': [NOW[:10]],
               'items': ['1.01,2.01,5.02,7.01,8.01,9.01'], 'primaryDocument': ['test.htm']}}}
        events = project_sec(c, None, sub, None, NOW)
        material = [e for e in events if e['eventType'] == 'MATERIAL_SEC_EVENT']
        self.assertEqual(len(material), 1)
        self.assertEqual(material[0]['secItems'], ['1.01', '2.01', '5.02'])
        self.assertNotIn('CEO', material[0]['headline'])
        self.assertIsNone(material[0]['fiscalQuarter'])
        self.assertFalse(any(e['eventType'].startswith('EARNINGS') for e in events))
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                for _ in range(2):
                    for e in events: store.event(e, NOW)
                payload = store.company_payload(c, NOW)
                self.assertEqual(len(payload['materialEvents']), 1)
                self.assertEqual(len(payload['timeline']), 1)
                self.assertEqual(len(payload['filings']), 1)
                coverage = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(coverage['counts']['recentMaterialSEC']['companies'], 1)
                self.assertEqual(coverage['counts']['anyMaterialIntelligence']['companies'], 1)
                self.assertEqual(coverage['counts']['anyNews']['companies'], 0)
            finally: store.close()
        sub['filings']['recent']['items'] = ['7.01,8.01,9.01']
        self.assertEqual([e['eventType'] for e in project_sec(c, None, sub, None, NOW)], ['SEC_FILING'])

    def test_news_coverage_requires_fresh_accepted_company_matches(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.source({**GN, 'lastSuccess': NOW, 'latestContentAt': NOW, 'lastItemCount': 20})
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 0)
                current = item(); current['provenance'][0].update(sourceId=GN['sourceId'], discoverySource='RSS')
                store.ingest(current)
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 1)
                store.source({**GN, 'lastError': 'HTTP_403', 'failureCount': 1})
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 0)
                self.assertEqual(out['counts']['anyNews']['companies'], 1)
            finally: store.close()


if __name__ == '__main__': unittest.main()
