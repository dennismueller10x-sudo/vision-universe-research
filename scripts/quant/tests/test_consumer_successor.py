"""Holding reorganisation: the successor's bundle carries the predecessor's history.

ExxonMobil moved its registrant to ExxonMobil Holdings Corp on 01.07.2026
(8-K12B). The SEC ticker map now points XOM to the new CIK 0002115436, whose
companyfacts start with the Q2 2026 10-Q; every earlier filing stays under CIK
0000034088. Without merging, the XOM bundle had no fiscal year and stayed empty.
"""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from quant.sec import consumer
from quant.sec.consumer import rowdict as R
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FactsBuilder, build_year_ends, standard_company

ROOT = Path(__file__).resolve().parents[3]


class SuccessorMergeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        builder, _ = standard_company(2000000066, build_year_ends(date(2018, 12, 31), 8), lambda y: 1000.0 * (y - 2010))
        cls.predecessor = builder.company_facts("SYNTHETIC PREDECESSOR")
        successor = FactsBuilder(2000000067)
        # the successor's first 10-Q: Q2 2026 plus the comparative quarter the predecessor already reported
        successor.add("us-gaap", "Revenues", "USD", 4321.0, date(2026, 6, 30), date(2026, 4, 1),
                      "2000000066-26-000093", "10-Q", date(2026, 8, 3), fy=2026, fp="Q2")
        cls.successor = successor.company_facts("SYNTHETIC HOLDINGS")

    def bundle(self, payload):
        return consumer.build_consumer_bundle(2000000067, payload, self.registry, as_of="2026-10-24",
                                              tickers=["SUCC"], security_ids=["ref_SUCC"], name="Successor")

    def test_alone_the_successor_has_no_fiscal_year(self):
        self.assertEqual(self.bundle(self.successor)["annual"], {})

    def test_merged_the_history_and_the_new_quarter_are_both_there(self):
        merged = consumer.merge_company_facts(self.successor, [self.predecessor])
        b = self.bundle(merged)
        self.assertTrue(b["annual"]["revenue"], "annual history of the predecessor missing")
        last = R(b["quarterly"]["revenue"][-1])
        self.assertEqual((last["end"], last["v"], last["accn"]), ("2026-06-30", 4321.0, "2000000066-26-000093"))
        self.assertEqual(b["cik"], "2000000067")

    def test_merge_does_not_duplicate_or_mutate(self):
        before = json.dumps(self.successor, sort_keys=True)
        merged = consumer.merge_company_facts(self.successor, [self.predecessor, self.predecessor])
        self.assertEqual(json.dumps(self.successor, sort_keys=True), before)
        rows = merged["facts"]["us-gaap"]["Revenues"]["units"]["USD"]
        keys = [(r["accn"], r.get("start"), r["end"], r["fy"], r["fp"], r["form"], r["val"]) for r in rows]
        self.assertEqual(len(keys), len(set(keys)))

    def test_config_is_evidenced_and_loads(self):
        cfg = json.loads((ROOT / "quant/config/sec-successor-issuers.json").read_text(encoding="utf-8"))
        for successor, entry in cfg["successors"].items():
            self.assertRegex(successor, r"^\d{10}$")
            self.assertTrue(entry["predecessors"] and all(len(p) == 10 for p in entry["predecessors"]))
            self.assertIn("8-K12B", entry["evidence"])
        self.assertEqual(consumer.load_successor_issuers(ROOT / "quant/config/sec-successor-issuers.json"),
                         {"0002115436": ["0000034088"],    # ExxonMobil (XOM)
                          "0002119322": ["0001438231"],    # Digimarc (DMRC)
                          "0002058897": ["0001071371"],    # Grupo Cibest / Bancolombia (CIB)
                          "0001973832": ["0001067428"]})   # AngloGold Ashanti (AU)
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(consumer.load_successor_issuers(Path(tmp, "missing.json")), {})


if __name__ == "__main__":
    unittest.main()
