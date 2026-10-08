"""M-B6: Umsatzbelege als eigene Stufe vor dem Consumer-Bundle.

SEC RAW -> CORE NORMALIZATION -> REVENUE EVIDENCE -> FUNDAMENTAL BUNDLE -> CONSUMERS
Offline: ein Fake-Client statt EDGAR; die Emittenten sind echte companyfacts-Auszuege
(scripts/quant/tests/fixtures/sec-real).
"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import revenue_evidence as rev  # noqa: E402
from quant.sec.http_client import SECHTTPError  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.version import NORMALIZATION_LOGIC_VERSION  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "sec-real"
REGISTRY = MetricRegistry.load()
COMMIT = "0123456789abcdef0123456789abcdef01234567"

SUMMARY = b"""<FilingSummary><MyReports>
<Report><MenuCategory>Statements</MenuCategory><LongName>0002 - Statement - CONSOLIDATED STATEMENTS OF OPERATIONS</LongName>
<Role>http://x/role/Operations</Role></Report></MyReports></FilingSummary>"""
PRE = b"""<linkbase xmlns="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink">
<presentationLink xlink:role="http://x/role/Operations">
<loc xlink:label="a" xlink:href="x.xsd#us-gaap_IncomeStatementAbstract"/>
<loc xlink:label="b" xlink:href="x.xsd#us-gaap_Revenues"/>
<presentationArc xlink:from="a" xlink:to="b" order="1" preferredLabel="http://www.xbrl.org/2003/role/totalLabel"/>
</presentationLink></linkbase>"""


class FakeClient:
    """Fair-access client stand-in: every filing is the same income statement (Revenues as total)."""

    def __init__(self, fail=()):
        self.fail = dict(fail)            # accession-without-dashes -> HTTP status
        self.stats = {"requests": 0, "cache_hits": 0}
        self.urls = []

    def get_bytes(self, url, expected_statuses=()):
        self.urls.append(url)
        self.stats["requests"] += 1
        folder = url.split("/")[-2]
        if folder in self.fail:
            raise SECHTTPError(url, self.fail[folder], "fake", 5)
        if url.endswith("index.json"):
            return json.dumps({"directory": {"item": [{"name": "FilingSummary.xml"}, {"name": "x_pre.xml"}]}}).encode()
        if url.endswith("FilingSummary.xml"):
            return SUMMARY
        if url.endswith("_pre.xml"):
            return PRE
        raise AssertionError(url)


def sources(*names):
    for name in names:
        cf = json.loads((FIXTURES / f"{name}.json").read_text())
        yield cf["cik"], cf


class EvidenceStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "evidence.json"
        self.names = self.tmp / "names.json"
        self.names.write_text('{"universe": 1}')

    def build(self, client, *names, max_filings=None, as_of="2026-10-05"):
        return rev.build_store(sources(*names), self.out, client, REGISTRY, as_of, COMMIT, self.names,
                               max_filings=max_filings, log=lambda *_: None)

    def test_required_set_is_what_the_core_reports(self):
        cf = json.loads((FIXTURES / "ESCA.json").read_text())
        self.assertEqual(len(rev.required_accessions(cf["cik"], cf, REGISTRY)), 10)
        cf = json.loads((FIXTURES / "NVDA.json").read_text())
        self.assertEqual(rev.required_accessions(cf["cik"], cf, REGISTRY), set())

    def test_complete_store_is_accepted_by_the_consumer(self):
        payload, run = self.build(FakeClient(), "ESCA", "NVDA")
        self.assertTrue(payload["build"]["complete"])
        self.assertEqual(payload["build"]["required"], 10)
        self.assertEqual(set(payload["decisions"].values()), {"TOTAL"})
        self.assertEqual(run["decidedThisRun"], 10)
        build = rev.check_compatible(rev.load_store(self.out), "2026-10-05", REGISTRY.version, self.names)
        self.assertEqual(build["coreVersion"], NORMALIZATION_LOGIC_VERSION)

    def test_transient_failure_is_pending_never_a_decision_and_the_store_is_rejected(self):
        cf = json.loads((FIXTURES / "ESCA.json").read_text())
        first = sorted(rev.required_accessions(cf["cik"], cf, REGISTRY))[0]
        payload, _ = self.build(FakeClient(fail={first.replace("-", ""): 503}), "ESCA")
        self.assertFalse(payload["build"]["complete"])
        self.assertIn(first, payload["build"]["pending"])
        self.assertNotIn(first, payload["decisions"])
        with self.assertRaises(rev.EvidenceIncompatible) as ctx:
            rev.check_compatible(rev.load_store(self.out), "2026-10-05", REGISTRY.version, self.names)
        self.assertEqual(ctx.exception.reason, "PARTIAL")

    def test_request_budget_leaves_a_partial_store_and_the_next_run_resumes(self):
        payload, run = self.build(FakeClient(), "ESCA", max_filings=4)
        self.assertFalse(payload["build"]["complete"])
        self.assertEqual(len(payload["build"]["pending"]), 6)
        self.assertEqual(run["decidedThisRun"], 4)
        kept = dict(payload["decisions"])
        client = FakeClient()
        payload, run = self.build(client, "ESCA")
        self.assertTrue(payload["build"]["complete"])
        self.assertEqual(run["decidedThisRun"], 6, "only the pending filings are fetched")
        fetched = {u.split("/")[-2] for u in client.urls}
        self.assertFalse(fetched & {a.replace("-", "") for a in kept}, "a decided filing is not fetched again")
        for accession, decision in kept.items():
            self.assertEqual(payload["decisions"][accession], decision)

    def test_permanent_404_is_a_decision_ambiguous(self):
        cf = json.loads((FIXTURES / "ESCA.json").read_text())
        first = sorted(rev.required_accessions(cf["cik"], cf, REGISTRY))[0]
        payload, _ = self.build(FakeClient(fail={first.replace("-", ""): 404}), "ESCA")
        self.assertTrue(payload["build"]["complete"])
        self.assertEqual(payload["decisions"][first], "AMBIGUOUS")
        self.assertEqual(payload["bases"][first], "FILING_NOT_READABLE")

    def test_deterministic_same_inputs_same_bytes(self):
        self.build(FakeClient(), "ESCA", "FLS")
        first = self.out.read_bytes()
        self.out.unlink()
        self.build(FakeClient(), "FLS", "ESCA")
        self.assertEqual(self.out.read_bytes(), first)

    def test_incompatible_stores_are_rejected(self):
        self.build(FakeClient(), "ESCA")
        good = rev.load_store(self.out)

        def reason(mutate, as_of="2026-10-05", names=None):
            payload = json.loads(json.dumps(good))
            mutate(payload)
            with self.assertRaises(rev.EvidenceIncompatible) as ctx:
                rev.check_compatible(payload, as_of, REGISTRY.version, names or self.names)
            return ctx.exception.reason

        self.assertEqual(reason(lambda p: p.update(schema="vu-sec-revenue-statement-evidence-1.0.0")), "SCHEMA")
        self.assertEqual(reason(lambda p: p["build"].update(coreVersion="1.18.0")), "CORE_VERSION")
        self.assertEqual(reason(lambda p: p["build"].update(builder="revenue-evidence-builder-0.9.0")), "BUILDER")
        self.assertEqual(reason(lambda p: p["build"].update(registryVersion=-1)), "REGISTRY_VERSION")
        self.assertEqual(reason(lambda p: p["build"].update(buildCommit="HEAD")), "BUILD_COMMIT")
        self.assertEqual(reason(lambda p: p["build"].update(complete=False)), "PARTIAL")
        other = self.tmp / "other-names.json"
        other.write_text('{"universe": 2}')
        self.assertEqual(reason(lambda p: None, names=other), "UNIVERSE")
        self.assertEqual(reason(lambda p: None, as_of="2026-10-20"), "FRESHNESS", "stale: 15 days")
        self.assertEqual(reason(lambda p: None, as_of="2026-10-04"), "FRESHNESS", "built after the consumer date")
        with self.assertRaises(rev.EvidenceIncompatible):
            rev.check_compatible({}, "2026-10-05", REGISTRY.version, self.names)
        rev.check_compatible(good, "2026-10-19", REGISTRY.version, self.names)

    def test_build_commit_is_verified_against_the_checkout(self):
        import subprocess
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if not re.fullmatch(r"[0-9a-f]{40}", head):
            self.skipTest("no git checkout")
        self.build(FakeClient(), "ESCA")
        payload = rev.load_store(self.out)
        payload["build"]["buildCommit"] = head
        rev.check_compatible(payload, "2026-10-05", REGISTRY.version, self.names, repo_root=ROOT)
        payload["build"]["buildCommit"] = "f" * 40
        with self.assertRaises(rev.EvidenceIncompatible) as ctx:
            rev.check_compatible(payload, "2026-10-05", REGISTRY.version, self.names, repo_root=ROOT)
        self.assertEqual(ctx.exception.reason, "BUILD_COMMIT")

    def test_the_committed_legacy_store_is_not_accepted_without_a_rebuild(self):
        legacy = rev.load_store(ROOT / "quant" / "config" / "sec-revenue-statement-evidence.json")
        if legacy.get("schema") == rev.SCHEMA:
            self.skipTest("store already rebuilt by the evidence stage")
        with self.assertRaises(rev.EvidenceIncompatible) as ctx:
            rev.check_compatible(legacy, "2026-10-05", REGISTRY.version, self.names)
        self.assertEqual(ctx.exception.reason, "SCHEMA")

    def test_resume_keeps_legacy_decisions(self):
        """A 1.1.0 store's decisions are facts about filings: the stage starts from them."""
        cf = json.loads((FIXTURES / "ESCA.json").read_text())
        required = sorted(rev.required_accessions(cf["cik"], cf, REGISTRY))
        self.out.write_text(json.dumps({"schema": "vu-sec-revenue-statement-evidence-1.0.0", "version": "1.1.0",
                                        "decisions": {a: "OTHER:SalesRevenueNet" for a in required}}))
        client = FakeClient()
        payload, run = self.build(client, "ESCA")
        self.assertEqual(run["decidedThisRun"], 0)
        self.assertEqual(client.urls, [])
        self.assertTrue(payload["build"]["complete"])
        self.assertEqual(payload["schema"], rev.SCHEMA)


class EvidenceWorkflowTests(unittest.TestCase):
    """Die Workflow-Reihenfolge ist der DAG: Belege vor dem Bundle, Pruefung im Bundle-Lauf."""

    WORKFLOW = ROOT / ".github" / "workflows" / "sec-consumer-fundamentals.yml"

    def steps(self):
        return re.findall(r"^      - name: (.+)$", self.WORKFLOW.read_text(), re.M)

    def test_evidence_is_built_before_the_consumer_bundles(self):
        text = self.WORKFLOW.read_text()
        evidence = text.index("cli.py --log-level WARNING revenue-evidence")
        consumer = text.index("cli.py --log-level WARNING consumer")
        self.assertLess(evidence, consumer)

    def test_the_data_run_never_skips_the_gate(self):
        self.assertNotIn("unverified-evidence-for-local-research", self.WORKFLOW.read_text())

    def test_the_rebuilt_evidence_and_the_pit_store_are_committed_with_the_bundles(self):
        add = [line for line in self.WORKFLOW.read_text().splitlines() if "git add" in line and "quant/data/sec/consumer" in line]
        self.assertTrue(add)
        block = self.WORKFLOW.read_text()
        self.assertIn("quant/config/sec-revenue-statement-evidence.json", block[block.index("git add quant/data/sec/consumer"):])
        self.assertIn("quant/data/sec/consumer-pit", block[block.index("git add quant/data/sec/consumer"):])


if __name__ == "__main__":
    unittest.main()
