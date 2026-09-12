"""Wann ist ein Lauf mit einzelnen Fehlschlaegen gescheitert?

Der Test existiert wegen eines konkreten Vorfalls: der erste
Produktivlauf ueber 5.480 Emittenten ingestierte 5.436 davon und endete
mit Rueckgabewert 1, weil 43 fehlschlugen. Damit wurden die
Coverage-Messung, der Commit und der Zwischenspeicher uebersprungen -
61 Minuten Arbeit fuer 0,78 Prozent Fehler.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.cli import ingest_verdict


class IngestVerdictTests(unittest.TestCase):
    def test_the_real_incident_would_now_succeed(self):
        v = ingest_verdict(attempted=5480, completed=5436, failed=43)
        self.assertEqual(v["exit_code"], 0)
        self.assertAlmostEqual(v["failure_rate"], 43 / 5480)
        self.assertIsNone(v["reason"])

    def test_a_broken_pipeline_still_fails(self):
        v = ingest_verdict(attempted=5480, completed=0, failed=5480)
        self.assertEqual(v["exit_code"], 1)
        self.assertIn("Kein einziger", v["reason"])

    def test_the_threshold_is_a_threshold_and_not_a_suggestion(self):
        unter = ingest_verdict(attempted=1000, completed=960, failed=40, max_failure_rate=0.05)
        self.assertEqual(unter["exit_code"], 0)
        drueber = ingest_verdict(attempted=1000, completed=940, failed=60, max_failure_rate=0.05)
        self.assertEqual(drueber["exit_code"], 1)
        self.assertIn("Schwelle", drueber["reason"])

    def test_exactly_at_the_threshold_passes(self):
        v = ingest_verdict(attempted=100, completed=95, failed=5, max_failure_rate=0.05)
        self.assertEqual(v["exit_code"], 0)

    def test_a_strict_caller_can_demand_zero_failures(self):
        """Fuer den kuratierten Validierungssatz bleibt die alte Strenge moeglich."""
        v = ingest_verdict(attempted=5, completed=4, failed=1, max_failure_rate=0.0)
        self.assertEqual(v["exit_code"], 1)

    def test_an_empty_universe_is_not_a_failure(self):
        v = ingest_verdict(attempted=0, completed=0, failed=0)
        self.assertEqual(v["exit_code"], 0)
        self.assertEqual(v["failure_rate"], 0.0)


if __name__ == "__main__":
    unittest.main()
