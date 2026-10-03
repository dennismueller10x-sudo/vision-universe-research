import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.coverage import report
from company_intelligence.operating_cost import estimate
from company_intelligence.store import Store
from test_engine import company, NOW


class CoverageCostTests(unittest.TestCase):
    def test_tiers_partition_issuers_and_candidates_are_not_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 's.sqlite')
            a, b = company(), company('Sparse Inc.', 'SPRS', '0000000002')
            b['officialSites'] = []
            s.set_state('siteCandidates:' + b['companyId'], {'candidates': [{'url': 'https://sparse.example'}]})
            s.set_state('financials:' + a['companyId'], {'state': 'AVAILABLE', 'stale': False})
            s.event({'eventId': 'estimate', 'companyId': a['companyId'], 'eventType': 'EARNINGS_ESTIMATED',
                     'confirmationStatus': 'ESTIMATED', 'date': '2026-11-01', 'dateEnd': '2026-11-20'}, NOW)
            r = report(s, {c['companyId']: c for c in (a, b)}, NOW)
            self.assertEqual(sum(v['companies'] for v in r['coverageTiers'].values()), 2)
            self.assertEqual(r['coverageTiers']['B_STRONG']['companies'], 1)
            self.assertEqual(r['coverageTiers']['D_LIMITED']['companies'], 1)
            self.assertEqual(r['counts']['officialDomainFound']['companies'], 1)
            self.assertEqual(r['counts']['confirmedUpcomingEarnings']['companies'], 0)
            self.assertEqual(r['counts']['anyNews']['companies'], 0)
            s.close()

    def test_platform_parser_failure_is_visible_without_news_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 's.sqlite'); c = company()
            s.source({'sourceId': 'q4', 'companyId': c['companyId'], 'type': 'IR_EVENTS',
                      'url': 'https://apple.com/events', 'provider': 'Q4', 'active': True,
                      'failureCount': 1, 'lastError': 'INVALID_Q4_EVENT_SCHEMA'})
            r = report(s, {c['companyId']: c}, NOW)
            self.assertEqual(r['platformHealth']['Q4']['parserFailures'], 1)
            self.assertEqual(r['platformHealth']['Q4']['active'], 0)
            self.assertEqual(r['counts']['anyNews']['companies'], 0)
            s.close()

    def test_four_hour_cost_ceiling_respects_twelve_hour_and_disabled_sources(self):
        r = estimate([{'intervalHours': 1}, {'intervalHours': 12}, {'active': False}], 20, 700000, 300000)
        self.assertEqual(r['plannedSourceRequestsPerDay'], 8)
        self.assertEqual(r['actionsMinutesPerMonth'], 720)
        self.assertEqual(r['publicPutUpperBoundPerMonth'], 8100)
        self.assertEqual(r['retainedSnapshotGB'], .002)
        self.assertEqual(r['dataProviderDollars'], 0)
        with self.assertRaises(ValueError): estimate([], -1, 0, 0)

    def test_scheduled_lanes_cannot_double_four_hour_polling(self):
        root = Path(__file__).resolve().parents[3]
        workflow = (root / '.github/workflows/company-intelligence.yml').read_text()
        self.assertIn("vars.COMPANY_INTELLIGENCE_PILOT_ENABLED != 'true'", workflow)
        self.assertNotIn("cron: '43 * * * *'", workflow)
        self.assertIn("cron: '43 */4 * * *'", workflow)
        self.assertIn('% 4', (root / 'scripts/company_intelligence/pilot.sh').read_text())
