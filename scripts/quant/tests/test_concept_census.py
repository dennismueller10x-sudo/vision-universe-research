"""Der Konzept-Zensus zaehlt Zusammensetzungen, nicht nur Tags.

Die Frage, die entschieden werden muss, lautet nicht "wie viele Emittenten
tragen us-gaap:X", sondern "wie viele wuerde Zusammensetzung Y bedienen".
Der Unterschied ist nicht kosmetisch: zwei Tags mit je 1.300 Emittenten
koennen dieselben 1.300 meinen oder 2.600 verschiedene, und aus der Summe
der Einzelzaehlungen laesst sich das nicht ablesen. Deshalb wird das
gemeinsame Vorkommen je Emittent gemessen.

Geprueft wird gegen ein gebautes Archiv mit bekannter Belegung, damit jede
Zahl eine nachrechenbare Erwartung hat statt einer plausiblen.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[3]


def company_facts(cik, concepts):
    payload = {"cik": int(cik), "entityName": "CO" + cik, "facts": {}}
    for qualified in concepts:
        taxonomy, name = qualified.split(":")
        payload["facts"].setdefault(taxonomy, {})[name] = {"label": name, "units": {"USD": []}}
    return payload


class ConceptCensusCompositionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from quant.sec.consumer import load_product_universe_ciks
        names = ROOT / "quant" / "data" / "market" / "security-master" / "company-names.json"
        by_cik, _ = load_product_universe_ciks(names)
        cls.ciks = sorted(by_cik)[:4]
        cls.assertTrueStatic = len(cls.ciks) == 4

        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        archive = root / "companyfacts.zip"
        # Vier Emittenten, jeder mit einer anderen Belegung, sodass jede
        # Zusammensetzung genau eine nachrechenbare Zahl bekommt.
        cases = {
            cls.ciks[0]: ["us-gaap:DebtLongtermAndShorttermCombinedAmount"],
            cls.ciks[1]: ["us-gaap:LongTermDebtNoncurrent", "us-gaap:ShortTermBorrowings"],
            cls.ciks[2]: ["us-gaap:LongTermDebt", "us-gaap:LongTermDebtCurrent",
                          "us-gaap:FinanceLeaseLiabilityNoncurrent"],
            cls.ciks[3]: ["us-gaap:FinanceLeaseLiability"],
        }
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for cik, concepts in cases.items():
                bundle.writestr(f"CIK{cik}.json", json.dumps(company_facts(cik, concepts)))

        out = root / "census.json"
        env = dict(os.environ, SEC_USER_AGENT="VisionUniverseResearch info@visionuniverse.de")
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "quant" / "cli.py"), "--log-level", "WARNING",
             "concept-census", "--archive", str(archive), "--out", str(out)],
            capture_output=True, text=True, env=env, cwd=str(ROOT))
        if result.returncode:
            raise AssertionError("concept-census failed: " + result.stderr[-2000:])
        cls.report = json.loads(out.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_universe_filter_still_applies(self):
        self.assertTrue(self.assertTrueStatic, "das Namensverzeichnis liefert keine CIKs mehr")
        self.assertEqual(self.report["issuers"], 4)

    def test_each_composition_counts_issuers_that_satisfy_all_of_it(self):
        counted = {row["id"]: row["issuers"] for row in self.report["compositions"]}
        self.assertEqual(counted, {
            # Nur der eine mit der gemeldeten Sammelangabe.
            "A_heute_nur_gemeldet": 1,
            # Der Gemeldete plus die zwei, bei denen LT und ST beide da sind.
            "B_heute_mit_ableitung": 3,
            # Zwei tragen ein Langfrist-Tag - und ST fehlt dabei nicht,
            # es wird schlicht nicht verlangt. Andere Kennzahl, nicht
            # bessere Abdeckung.
            "C_langfrist_allein": 2,
            # Von den dreien aus B hat nur einer auch Finanzierungsleasing.
            "D_mit_finanzierungsleasing": 1,
            # Und mit Leasing als Ersatz sind es alle vier.
            "E_heute_oder_finanzierungsleasing": 4,
        })

    def test_a_slot_is_an_or_over_its_concepts(self):
        slots = {row["slot"]: row["issuers"] for row in self.report["slots"]}
        # LT trifft ueber zwei VERSCHIEDENE Tags je einen Emittenten. Waere
        # das Fach ein UND, stuende hier 0.
        self.assertEqual(slots["LT"], 2)
        self.assertEqual(slots["ST"], 2)
        self.assertEqual(slots["FL"], 2)
        self.assertEqual(slots["COMBINED"], 1)

    def test_the_report_carries_the_semantics_next_to_every_number(self):
        """Eine Abdeckungszahl ohne ihre Bedeutung ist die Haelfte, die zur
        falschen Entscheidung fuehrt: C hat die weitere Reichweite UND ist
        die andere Kennzahl."""
        for row in self.report["compositions"]:
            self.assertGreater(len(row["semantics"]), 40, row["id"])
            self.assertTrue(row["requires"], row["id"])

    def test_the_measurement_changes_no_published_value(self):
        """Der Zensus ist ein Bericht. Er schreibt genau eine Datei."""
        self.assertEqual(self.report["schema"], "sec-concept-census-1.0.0")
        self.assertIn("methodology change", self.report["note"])


if __name__ == "__main__":
    unittest.main()
