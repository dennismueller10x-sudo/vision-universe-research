import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from company_intelligence.universe_samples import samples


class ProfileSamplingTests(unittest.TestCase):
    def test_numeric_inventory_is_not_limited_to_an_unrelated_browser_sample(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); consumer = root / 'consumer'; consumer.mkdir()
            generation = 'sample-test'; snapshot = consumer / 'snapshots' / generation; snapshot.mkdir(parents=True)
            (consumer / 'manifest.json').write_text(json.dumps({'generation': generation}))
            details = root / 'discover/data/stocks/US_REAL'; details.mkdir(parents=True)
            rows = {}; index = 0
            for band, count, cap in [('LARGE', 10, 20e9), ('MID', 10, 5e9), ('SMALL', 40, 500e6), ('MICRO', 40, 100e6), ('ADR', 10, 500e6)]:
                for _ in range(count):
                    index += 1; ticker = 'S' + str(index); cid = 'issuer-' + str(index)
                    modules = {'profile': False, 'aktuelles': False, 'financials': True, 'nextEvent': False, 'calls': False, 'documents': False}
                    rows[cid] = {'status': 'ELIGIBLE_PARTIAL', 'tickers': [ticker], 'modules': modules}
                    p = {'listings': [{'symbol': ticker, 'country': 'US', 'securityType': 'ADR' if band == 'ADR' else 'COMMON_STOCK'}],
                         'latestFinancials': {'metrics': {'shares_outstanding': {'current': {'value': cap / 100, 'unit': 'shares', 'periodEnd': '2026-09-30', 'filingId': 'test-filing'}}}}}
                    (snapshot / (cid + '.json')).write_text(json.dumps(p))
                    (details / (ticker + '.json')).write_text(json.dumps({'price': {'value': 100}, 'asOf': '2026-10-12', 'fundamentals': {'valuation': {'marketCap': {'value': cap}}}}))
            for i in range(20):
                rows['rejected-' + str(i)] = {'status': 'INELIGIBLE_NO_SAFE_CONTENT', 'tickers': ['R' + str(i)]}
            with patch('company_intelligence.universe_samples.ROOT', root):
                normal = samples(consumer, {'issuers': rows}, root / 'normal.json', group_limit=25)
                full = samples(consumer, {'issuers': rows}, root / 'full.json', group_limit=25, include_all_size_evidence=True)
            self.assertEqual(full['groups'], normal['groups'])  # Browser cost stays bounded.
            self.assertEqual(full['stocks'], normal['stocks'])
            self.assertEqual(sum(v['sizeBand'] == 'SMALL_CAP' for v in full['numericSizeEvidence'].values()), 40)
            self.assertEqual(sum(v['sizeBand'] == 'MICRO_CAP' for v in full['numericSizeEvidence'].values()), 40)
            self.assertGreater(len(full['numericSizeEvidence']), len(normal['numericSizeEvidence']))
            self.assertEqual(len(full['numericSizeEvidence']), 100)  # ADR values are never treated as common shares.
            self.assertTrue(all(v['priceAsOf'] == '2026-10-12' and v['sharesAsOf'] == '2026-09-30' for v in full['numericSizeEvidence'].values()))

if __name__ == '__main__':
    unittest.main()
