"""Die dauerhafte Ablage, von der Python-Seite: Reload reproduziert die Werte.

persist-fundamentals.mjs beweist Bytes und Felder. Dieser Test beweist
den Rest von §21 J: ein zurueckgeladenes Factbook, als eigener
Faktenspeicher gelesen, liefert dieselben kanonischen Werte wie der
lokale Stand - und zwar OHNE einen einzigen Netzwerkzugriff. Die Sperre
ist Teil des Befehls; ein Vergleich, der heimlich nachlaedt, waere kein
Nachweis der Persistenz.
"""
import gzip
import io
import json
import shutil
import sys
import tempfile
import unittest
import urllib.request
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant import cli
from quant.sec.pipeline import IngestionPipeline
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.test_pipeline_and_store import StubSEC, make_company


class ReloadVerificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.facts = root / "facts"
        self.reload = root / "reload"
        registry = MetricRegistry.load()
        company, _ = make_company(4100000001, "TST", "Test Corp", "7372", "1231",
                                  first_end=date(2013, 12, 31), years=12)
        stub = StubSEC([company])
        pipe = IngestionPipeline(provider=SECProvider(client=stub), registry=registry,
                                 raw_store=JsonRawStore(root / "raw"),
                                 fact_store=JsonFactStore(self.facts, compress=True),
                                 checkpoint=CheckpointStore(root / "state", run_id="t"))
        pipe.ingest_company("4100000001")
        self.cik = "4100000001"
        self.reload.mkdir()
        shutil.copy(self.facts / f"{self.cik}.json.gz", self.reload / f"{self.cik}.json.gz")
        self.addCleanup(setattr, urllib.request, "urlopen", urllib.request.urlopen)

    def _run(self, ciks=None):
        # Der Bericht landet im Testverzeichnis - nicht im Repository. Ein
        # Test, der ein Artefakt unter quant/data/ hinterlaesst, committet
        # seine Attrappe beim naechsten `git add -A` mit.
        pfad = Path(self.tmp.name) / "reload-verification.json"
        args = SimpleNamespace(reload_dir=str(self.reload), ciks=ciks,
                               local_dir=str(self.facts), out=str(pfad))
        out = io.StringIO()
        with redirect_stdout(out):
            code = cli.cmd_verify_reload(args)
        bericht = json.load(open(pfad))
        return code, bericht, out.getvalue()

    def test_ein_zurueckgeladenes_factbook_reproduziert_die_kanonischen_werte(self):
        code, bericht, _ = self._run()
        self.assertEqual(code, 0)
        self.assertEqual(bericht["RELOAD_WITHOUT_SEC_REFETCH"], "PASS")
        [z] = bericht["results"]
        self.assertTrue(z["documentsIdentical"])
        self.assertTrue(z["canonicalFactsIdentical"])
        self.assertGreater(z["canonicalFacts"], 0)
        self.assertGreaterEqual(z["annualPeriods"], 10, "ein 10Y+-Fall")
        self.assertTrue(z["everyFactHasFilingAndAccession"])
        self.assertEqual(z["currencies"], ["USD"])

    def test_ein_veraendertes_objekt_faellt_auf(self):
        """Dateiexistenz ist kein Nachweis. Der Inhalt muss stimmen."""
        with gzip.open(self.reload / f"{self.cik}.json.gz", "rt", encoding="utf-8") as h:
            doc = json.load(h)
        for t in doc["factbook"]["timelines"]:
            for o in t["observations"]:
                o["value"] = o["value"] * 2
        with gzip.open(self.reload / f"{self.cik}.json.gz", "wt", encoding="utf-8") as h:
            json.dump(doc, h)
        code, bericht, _ = self._run()
        self.assertEqual(code, 1)
        self.assertEqual(bericht["RELOAD_WITHOUT_SEC_REFETCH"], "FAIL")
        self.assertFalse(bericht["results"][0]["canonicalFactsIdentical"])

    def test_ein_fehlendes_objekt_wird_nicht_als_vorhanden_gemeldet(self):
        code, bericht, _ = self._run(ciks=f"{self.cik},9999999999")
        self.assertEqual(code, 1)
        fehlt = [z for z in bericht["results"] if z["cik"] == "9999999999"][0]
        self.assertFalse(fehlt["reloadPresent"])
        self.assertFalse(fehlt["pass"])

    def test_das_netz_ist_waehrend_des_vergleichs_gesperrt(self):
        self._run()
        with self.assertRaises(RuntimeError) as ctx:
            urllib.request.urlopen("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json")
        self.assertIn("RELOAD_MUST_NOT_FETCH", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
