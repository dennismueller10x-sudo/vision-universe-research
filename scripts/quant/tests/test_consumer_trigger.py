import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "quant" / "sec"))
import consumer_trigger as ct  # noqa: E402


def run(*issuers, **kw):
    r = {"STATUS": "SUCCESS", "DRY_RUN": False,
         "updated": [{"cik": c, "filings": [{"form": f} for f in forms]} for c, forms in issuers]}
    r.update(kw)
    return r


class ConsumerTriggerTest(unittest.TestCase):
    def test_quarterly_report_triggers(self):
        d = ct.decide(run(("0001045810", ["10-Q"]), ("0000320193", ["8-K"])))
        self.assertTrue(d["trigger"])
        self.assertEqual(d["ciks"], ["0001045810"])
        self.assertEqual(d["forms"], {"10-Q": 1})

    def test_annual_amendment_and_foreign_triggers(self):
        for form in ("10-K", "10-K/A", "10-Q/A", "20-F", "40-F", "10-KT"):
            self.assertTrue(ct.decide(run(("1", [form])))["trigger"], form)

    def test_other_forms_do_not_trigger(self):
        self.assertFalse(ct.decide(run(("1", ["8-K", "4", "6-K", "S-1"])))["trigger"])

    def test_nothing_updated(self):
        self.assertFalse(ct.decide(run())["trigger"])

    def test_dry_run_and_failure_do_not_trigger(self):
        self.assertFalse(ct.decide(run(("1", ["10-Q"]), DRY_RUN=True))["trigger"])
        self.assertFalse(ct.decide(run(("1", ["10-Q"]), STATUS="FAILURE"))["trigger"])


if __name__ == "__main__":
    unittest.main()
