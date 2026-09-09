import tempfile
import unittest
from pathlib import Path

from quant.sec.scale_report import build_scale_report
from quant.sec.store import SqliteFactStore


def document(cik="0000000001", include_revenue=True):
    timelines = []
    if include_revenue:
        timelines.append({
            "metric": "revenue", "observations": [{
                "available_from": "2024-02-01T20:00:00+00:00",
                "filed": "2024-02-01", "period_end": "2023-12-31",
            }],
        })
    return {
        "cik": cik,
        "stats": {"raw_facts": 7, "duplicates": 2},
        "quality": {"summary": {"by_severity": {"ERROR": 0}}},
        "factbook": {"timelines": timelines},
    }


class ScaleReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = SqliteFactStore(Path(self.tmp.name) / "facts.sqlite")

    def test_report_measures_counts_pit_metrics_and_missing_companies(self):
        self.store.write_company("0000000001", document())
        report = build_scale_report(
            self.store, [{"cik": "1"}, {"cik": "2"}], "test",
            {"run": {"request_count": 3, "cache_hit_rate": 0.25}},
        )
        self.assertEqual(2, report["companiesRequested"])
        self.assertEqual(1, report["companiesSuccessful"])
        self.assertEqual(7, report["factsRaw"])
        self.assertEqual(1, report["factsCanonicalNormalized"])
        self.assertEqual(1.0, report["pitCoverage"])
        self.assertEqual(1.0, report["metricCoverage"]["revenue"]["coverage"])
        self.assertEqual(0.0, report["metricCoverage"]["net_income"]["coverage"])
        self.assertEqual(3, report["requestCount"])
        self.assertEqual("FAIL", report["status"])

    def test_complete_gate_without_pit_violations_passes(self):
        self.store.write_company("0000000001", document())
        report = build_scale_report(
            self.store, [{"cik": "1"}], "test", {"run": {"halted": False}},
        )
        self.assertEqual("PASS", report["status"])

    def test_pit_violation_is_never_hidden_by_complete_timestamp_coverage(self):
        broken = document()
        broken["factbook"]["timelines"][0]["observations"][0]["available_from"] = (
            "2023-01-01T00:00:00+00:00")
        self.store.write_company("0000000001", broken)
        report = build_scale_report(self.store, [{"cik": "1"}], "test")
        self.assertEqual(1.0, report["pitCoverage"])
        self.assertEqual(1, report["pitViolations"])
        self.assertEqual("FAIL", report["status"])

    def test_survivorship_and_security_master_never_pass(self):
        report = build_scale_report(self.store, [], "test")
        self.assertEqual("FAIL", report["survivorshipBiasStatus"])
        self.assertEqual("EXTERNAL_SECURITY_MASTER_REQUIRED", report["securityMasterStatus"])


if __name__ == "__main__":
    unittest.main()
