import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.coverage import report
from company_intelligence.operating_cost import estimate, profile_estimate
from company_intelligence.store import Store
from test_engine import company, NOW


class CoverageCostTests(unittest.TestCase):
    def test_profile_cost_does_not_turn_annual_sec_refresh_into_quarterly_web_polling(self):
        profiles = {'a': {'sources': [{'type': 'SEC'}, {'type': 'FIRST_PARTY_WEB'}]},
                    'b': {'sources': [{'type': 'FIRST_PARTY_WEB'}]}}
        cost = profile_estimate(profiles, 10, 1000)
        self.assertEqual(cost['secProfiles'], 1)
        self.assertEqual(cost['webOnlyProfiles'], 1)
        self.assertEqual(cost['steadyStateSourceRequestsPerMonthScenario'], 2.08)
        self.assertEqual(cost['extraConsumerRequestsPerPage'], 0)
        self.assertEqual(cost['extraScheduledNewsWakeupsPerMonth'], 0)
        self.assertIsNone(cost['initialWireBytesMeasured'])
        with self.assertRaises(ValueError): profile_estimate(profiles, -1)

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
        self.assertNotIn('cron:', workflow)
        production=(root / '.github/workflows/company-intelligence-refresh.yml').read_text()
        self.assertEqual(production.count("cron: '17 */4 * * *'"),1)
        self.assertEqual(production.count('cron:'),1)
        self.assertIn('company-intelligence-continuous-',production)
        self.assertIn('% 4', (root / 'scripts/company_intelligence/pilot.sh').read_text())

    def test_full_demand_cost_accounts_for_shared_routes_and_serial_network_pacing(self):
        sources = [{'url': 'https://issuer.example/news', 'intervalHours': 4},
                   {'url': 'https://issuer.example/news', 'intervalHours': 12},
                   {'url': 'https://issuer.example/events', 'intervalHours': 12},
                   {'url': 'https://issuer.example/disabled', 'active': False}]
        value = estimate(sources, 20, 700000, 300000, runtime_minutes=8)
        self.assertEqual(value['plannedSourceRequestsPerDay'], 10)
        self.assertEqual(value['plannedUniqueRouteRequestsPerDay'], 8)
        self.assertEqual(value['serialPacingMinutesPerMonthFloor'], 2)
        many = estimate([{'url': 'https://issuer.example/' + str(n)} for n in range(1000)],
                        20, 700000, 300000, runtime_minutes=8)
        self.assertEqual(many['fullDemand160RequestCapacityLanes'], 7)
        self.assertEqual(many['fullDemandActionsMinutesAtAssumedRuntime'], 10080)
        self.assertEqual(many['serialPacingMinutesPerMonthFloor'], 5994)

    def test_bootstrap_configuration_contains_no_private_health_and_uses_current_issuers(self):
        import json
        from company_intelligence.model import load_universe, within_domain
        from company_intelligence.q4_events import public_link
        root=Path(__file__).resolve().parents[3]; companies=load_universe(root)
        sources=json.loads((root/'company-intelligence/config/sources.json').read_text())
        keys=[]
        for source in sources:
            self.assertTrue(public_link(source['url']))
            self.assertFalse({'lastSuccess','lastFailure','failureCount','checkpoints','lastError'} & source.keys())
            if source.get('verified'):
                self.assertIn(source['companyId'],companies)
                self.assertTrue(any(within_domain(source['url'],u) for u in source['allowedSites']))
            keys.append((source.get('companyId'),source['url']))
        self.assertEqual(len(keys),len(set(keys)))
