"""Der Abschlussbericht nennt jede §25-Kennzahl und jede §26-Bestaetigung - aus Artefakten."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import final_report


class AbschlussberichtTests(unittest.TestCase):
    def setUp(self):
        self.text = final_report.build_final_report()

    def test_jede_pflichtkennzahl_kommt_vor(self):
        for name in final_report.REQUIRED_METRICS:
            self.assertIn(name, self.text, f"{name} fehlt im Abschlussbericht")

    def test_jede_bestaetigung_kommt_mit_beleg_vor(self):
        for text, evidence in final_report.CONFIRMATIONS:
            self.assertIn(text, self.text)
            self.assertIn(evidence, self.text)

    def test_die_zahlen_kommen_aus_den_artefakten(self):
        import json
        gaps = json.loads((final_report.DATA / "gap-classification.json").read_text())
        nachher = gaps["byRecoverability"]["SEC_RECOVERABLE"]
        self.assertIn(f"| `SEC_RECOVERABLE` |", self.text)
        self.assertIn(final_report._n(nachher), self.text)

    def test_vorher_kommt_aus_der_baseline(self):
        self.assertIn("baseline-before-final-recovery.json", self.text)
        self.assertIn("Lauf 34749245361", self.text)


if __name__ == "__main__":
    unittest.main()
