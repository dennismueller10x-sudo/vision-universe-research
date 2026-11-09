"""`cli.py consumer` writes all three outputs under the chosen run root.

The producer (sec-consumer-fundamentals.yml) runs without --out and keeps
writing quant/data/sec/{consumer, consumer-history, consumer_coverage.json}.
A test or diagnostic run with --out <dir>/consumer must not touch the
committed artifacts: coverage and history follow --out to <dir>.
Production stays isolated here: DATA_DIR is redirected to a temporary
directory that must stay empty.
"""
import json
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from io import StringIO
from pathlib import Path
from unittest import mock

from quant import cli
from quant.tests.fixtures import build_year_ends, standard_company

CIK = 2000000077


class _FakeProvider:
    def __init__(self, payload):
        self.payload = payload

    def get_company_facts(self, cik, fresh=False):
        return self.payload

    def iter_bulk_company_facts(self, ciks=None, archive_path=None):
        yield CIK, self.payload


class ConsumerOutputPathsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="consumer-outputs-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.production = self.tmp / "production-sec"          # stands in for quant/data/sec
        builder, _ = standard_company(CIK, build_year_ends(date(2013, 12, 31), 13), lambda y: 1000.0 * (y - 2010))
        self.payload = builder.company_facts("SYNTHETIC CONSUMER ISSUER")
        self.names = self.tmp / "company-names.json"
        self.names.write_text(json.dumps({"rows": [
            {"ticker": "SYNT", "securityId": "ref_SYNT", "cik": str(CIK), "companyName": "Synthetic", "inProductUniverse": True},
            {"ticker": "NOCK", "securityId": "ref_NOCK", "inProductUniverse": True}]}), encoding="utf-8")

    def _run(self, *extra):
        with mock.patch.object(cli, "DATA_DIR", self.production), \
             mock.patch.object(cli, "SECProvider", lambda: _FakeProvider(self.payload)):
            args = cli.build_parser().parse_args(["consumer", "--names", str(self.names), "--as-of", "2026-09-14",
                                                  "--issuers", str(self.tmp / "no-issuers"),
                                                  "--successors", str(self.tmp / "no-successors.json"), *extra])
            with redirect_stdout(StringIO()):
                self.assertEqual(cli.cmd_consumer(args), 0)
        return args

    def test_redirected_out_keeps_coverage_and_history_out_of_the_committed_artifacts(self):
        run = self.tmp / "run"
        self._run("--out", str(run / "consumer"))
        self.assertFalse(self.production.exists(), sorted(str(p) for p in self.production.rglob("*")))
        coverage = json.loads((run / "consumer_coverage.json").read_text(encoding="utf-8"))
        self.assertEqual(coverage["withoutCikTickers"], ["NOCK"])
        self.assertTrue((run / "consumer" / f"CIK{CIK:010d}.json").is_file())
        self.assertTrue((run / "consumer" / "index.json").is_file())
        self.assertTrue((run / "consumer-history").is_dir())

    def test_explicit_coverage_and_history_paths_win(self):
        self._run("--out", str(self.tmp / "a" / "consumer"), "--coverage-out", str(self.tmp / "b" / "cov.json"),
                  "--history-out", str(self.tmp / "c" / "hist"))
        self.assertFalse(self.production.exists())
        self.assertTrue((self.tmp / "b" / "cov.json").is_file())
        self.assertTrue((self.tmp / "c" / "hist").is_dir())
        self.assertFalse((self.tmp / "a" / "consumer_coverage.json").exists())

    def test_producer_defaults_are_unchanged(self):
        # The workflow passes no output flags: the three committed paths stay where they were.
        args = cli.build_parser().parse_args(["consumer"])
        out, history, coverage = cli.consumer_output_paths(args)
        self.assertEqual(out, cli.DATA_DIR / "consumer")
        self.assertEqual(history, cli.DATA_DIR / "consumer-history")
        self.assertEqual(coverage, cli.DATA_DIR / "consumer_coverage.json")


if __name__ == "__main__":
    unittest.main()
