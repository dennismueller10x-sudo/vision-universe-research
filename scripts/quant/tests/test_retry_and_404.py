"""Die Fehlerschlange wird geleert, nicht verwaltet.

Ein companyfacts-404 ist die Antwort der SEC (keine XBRL-Fakten), kein
Abrufproblem: es ergibt ein leeres Factbook mit Status. Und ein Retry,
der den Versuchszaehler nicht zuruecksetzt, versucht nichts.
"""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant import cli
from quant.sec.pipeline import IngestionPipeline
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.test_pipeline_and_store import StubSEC, make_company


class CompanyFacts404Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.company, _ = make_company(4200000001, "NOX", "NO XBRL INC", "4011", "1231")
        self.stub = StubSEC([self.company])
        self.cik = "4200000001"
        # Die SEC kennt die Einreichungen, aber keine companyfacts.
        del self.stub.responses[f"https://data.sec.gov/api/xbrl/companyfacts/CIK{self.cik.zfill(10)}.json"]
        self.fact_store = JsonFactStore(root / "facts", compress=True)
        self.checkpoint = CheckpointStore(root / "state", run_id="t")
        self.pipe = IngestionPipeline(provider=SECProvider(client=self.stub),
                                      registry=MetricRegistry.load(),
                                      raw_store=JsonRawStore(root / "raw"),
                                      fact_store=self.fact_store, checkpoint=self.checkpoint)

    def test_ein_404_ergibt_ein_leeres_factbook_mit_status(self):
        outcome = self.pipe.ingest_company(self.cik)
        self.assertEqual(outcome["status"].lower(), "ingested")
        document = self.fact_store.read_company(self.cik.zfill(10))
        self.assertEqual(document["companyfacts_status"], "NOT_AVAILABLE_404")
        self.assertEqual(document["stats"]["raw_facts"], 0)
        self.assertEqual(document["factbook"]["timelines"], [])

    def test_ein_anderer_http_fehler_bleibt_ein_fehler(self):
        # Ohne submissions gibt es keinen Emittenten - das ist kein 404 auf
        # companyfacts, sondern ein echter Fehlschlag.
        del self.stub.responses[f"https://data.sec.gov/submissions/CIK{self.cik.zfill(10)}.json"]
        with self.assertRaises(Exception):
            self.pipe.ingest_company(self.cik)

    def test_retry_ohne_reset_versucht_nichts_mit_reset_alles(self):
        state = self.checkpoint.load()
        self.checkpoint.mark_failed(state, self.cik.zfill(10), "HTTP 404 companyfacts")
        state["failed"][self.cik.zfill(10)]["attempts"] = 3
        self.checkpoint.save(state)
        ohne = self.pipe.retry_failed(reset_attempts=False)
        self.assertEqual(ohne["results"], [])
        mit = self.pipe.retry_failed(reset_attempts=True)
        self.assertEqual([r["status"].lower() for r in mit["results"]], ["ingested"])
        self.assertEqual(mit["state"]["retry_queue"], [])


class FehlerklasseTests(unittest.TestCase):
    def test_klassen(self):
        self.assertEqual(cli._fehlerklasse("https://data.sec.gov/api/xbrl/companyfacts/CIK1.json -> HTTP 404 after 1 attempt(s): x"),
                         "SEC_404_COMPANYFACTS")
        self.assertEqual(cli._fehlerklasse("https://data.sec.gov/submissions/CIK1.json -> HTTP 404 after 1 attempt(s): x"),
                         "SEC_404_SUBMISSIONS")
        self.assertEqual(cli._fehlerklasse("u -> HTTP 503 after 4 attempt(s): x"), "SEC_5XX")
        self.assertEqual(cli._fehlerklasse("KeyError: 'facts'"), "KeyError")

    def test_der_parser_kennt_reset_und_out(self):
        args = cli.build_parser().parse_args(["retry", "--reset-attempts"])
        self.assertTrue(args.reset_attempts)
        self.assertTrue(args.out.endswith("retry-run.json"))


if __name__ == "__main__":
    unittest.main()
