import json
import tempfile
import unittest
import sys
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
