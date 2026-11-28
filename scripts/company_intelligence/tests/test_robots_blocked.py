import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.continuous_refresh import advance
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.transport import BLOCKED_BY_OPERATOR_AFTER, SourceError, blocked_by_operator
from test_engine import company, source, NOW


def failing(message):
    class Http:
        def get(self, url, **kw):
            raise SourceError(message)
    return Http()


def fail_n_times(message, n):
    with tempfile.TemporaryDirectory() as tmp:
        c = company()
        s = source(c)
        store = Store(Path(tmp) / 'state.sqlite')
        try:
            delays = []
            for _ in range(n):
                # Je Durchlauf eine neue Pipeline: sie merkt sich pro Instanz schon verarbeitete Quellen.
                Pipeline(Path(tmp), {c['companyId']: c}, store, failing(message), NOW).ingest_source(s)
                saved = {r['sourceId']: r for r in store.sources()}[s['sourceId']]
                s = dict(saved)
                delays.append(round((datetime.fromisoformat(saved['nextCheck'].replace('Z', '+00:00'))
                                     - datetime.fromisoformat(NOW.replace('Z', '+00:00'))) / timedelta(hours=1)))
            return delays
        finally:
            store.close()


class RobotsBlockedByOperatorTests(unittest.TestCase):
    def test_only_403_and_401_on_robots_count_as_blocked(self):
        self.assertTrue(blocked_by_operator('ROBOTS_UNAVAILABLE:HTTP_403'))
        self.assertTrue(blocked_by_operator('SourceError:ROBOTS_UNAVAILABLE:HTTP_401'))
        for other in ('ROBOTS_UNAVAILABLE:HTTP_503', 'ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE',
                      'ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE', 'ROBOTS_UNAVAILABLE:RATE_LIMIT_DEFER:60',
                      'HTTP_403', 'ROBOTS_DISALLOWED', 'NETWORK_TIME_BUDGET_EXHAUSTED'):
            with self.subTest(error=other):
                self.assertFalse(blocked_by_operator(other))

    def test_blocked_source_gets_a_week_of_rest_only_after_repeated_failures(self):
        delays = fail_n_times('ROBOTS_UNAVAILABLE:HTTP_403', BLOCKED_BY_OPERATOR_AFTER)
        self.assertEqual(delays[:BLOCKED_BY_OPERATOR_AFTER - 1], [2, 4])
        self.assertEqual(delays[-1], 7 * 24)

    def test_temporary_robots_failures_keep_the_short_exponential_retry(self):
        for message in ('ROBOTS_UNAVAILABLE:HTTP_503', 'ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE'):
            with self.subTest(error=message):
                delays = fail_n_times(message, BLOCKED_BY_OPERATOR_AFTER + 2)
                self.assertTrue(all(d <= 72 for d in delays), delays)
                self.assertEqual(delays[:3], [2, 4, 8])

    def test_audit_reports_the_blocked_share_from_the_same_predicate(self):
        # Der Audit zaehlt mit derselben Funktion wie die Pipeline und weist Zahl, Nenner und Anteil aus
        # (kein Ende-zu-Ende-Lauf: der Audit braucht einen vollen Identitaetsstand).
        text = (Path(__file__).resolve().parents[1] / 'source_registry_audit.py').read_text(encoding='utf-8')
        self.assertIn('from company_intelligence.transport import blocked_by_operator', text)
        self.assertIn("blocked_operator+=blocked_by_operator(source.get('lastError') or '')", text)
        self.assertIn("'blockedByOperator':{'sources':blocked_operator,'activeApprovedSources':active,'share':", text)

    def test_robots_disallowed_keeps_its_week(self):
        self.assertEqual(fail_n_times('ROBOTS_DISALLOWED', 1), [7 * 24])


if __name__ == '__main__':
    unittest.main()
