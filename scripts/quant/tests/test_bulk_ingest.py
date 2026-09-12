"""Der Sammelweg fuer companyfacts — §25 in ausfuehrbarer Form.

Ein Universum von fuenf Emittenten holt zehn Anfragen. Ein Universum von
fuenftausend holt zehntausend, und genau das ist die Groessenordnung, in
der SEC Fair Access aufhoert, eine Formalie zu sein. Der Anbieteradapter
kann seit jeher aus dem Sammelarchiv lesen — nur benutzt hat es niemand:
`iter_bulk_company_facts` war an keiner Stelle der Pipeline verdrahtet.

Diese Tests pruefen den Weg OHNE Netzzugang: das Archiv wird als lokale
ZIP-Datei untergeschoben. Was gezaehlt wird, ist die Zahl der
companyfacts-Anfragen — denn das ist der ganze Zweck.
"""
import json
import sys
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.pipeline import IngestionPipeline, STATUS_INGESTED
from quant.sec.provider import SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.tests.test_pipeline_and_store import StubSEC, make_company


def _ohne_abrufzeit(value):
    """Herkunftszeitstempel raus, Inhalt bleibt.

    Wann ein Dokument geholt wurde, unterscheidet zwei Laeufe immer - und
    zwar zu Recht. Verglichen wird hier, ob der Sammelweg dasselbe
    ERGEBNIS liefert, nicht ob er zur selben Sekunde lief.
    """
    if isinstance(value, dict):
        return {k: _ohne_abrufzeit(v) for k, v in value.items()
                if "retrieved" not in k and "generated_at" not in k}
    if isinstance(value, list):
        return [_ohne_abrufzeit(v) for v in value]
    return value


class BulkIngestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.registry = MetricRegistry.load()
        self.raw_store = JsonRawStore(root / "raw")
        self.fact_store = JsonFactStore(root / "facts", compress=True)
        self.checkpoint = CheckpointStore(root / "state", run_id="bulk")

        self.companies = [
            make_company(4100000000 + index, f"BULK{index}", f"BULK COMPANY {index}",
                         "3674", "1231")[0]
            for index in range(1, 7)
        ]
        self.stub = StubSEC(self.companies)
        self.provider = SECProvider(client=self.stub)
        self.pipe = IngestionPipeline(provider=self.provider, registry=self.registry,
                                      raw_store=self.raw_store, fact_store=self.fact_store,
                                      checkpoint=self.checkpoint)
        self.entries = [{"cik": company[0]} for company in self.companies]
        self.archive = self._build_archive(root / "companyfacts.zip")

    def _build_archive(self, path):
        """Ein Abbild des SEC-Sammelarchivs: je Emittent eine CIK##########.json."""
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            for cik, ticker, name, sic, fye, builder in self.companies:
                padded = normalize_cik(cik)
                archive.writestr(f"CIK{padded}.json",
                                 json.dumps(builder.company_facts(name)))
            # Ein Emittent, den wir nicht wollen. Das Archiv enthaelt den
            # ganzen Markt; die Pipeline darf nur nehmen, was sie braucht.
            archive.writestr("CIK0009999999.json", json.dumps({"cik": 9999999, "facts": {}}))
            # Und eine Datei, die kein Emittent ist.
            archive.writestr("README.txt", "not a company")
        return path

    def _companyfacts_calls(self):
        return [url for url in self.stub.calls if "companyfacts" in url]

    def test_the_single_path_asks_once_per_issuer(self):
        outcome = self.pipe.ingest_universe(self.entries)
        self.assertEqual(len(outcome["results"]), 6)
        self.assertEqual(len(self._companyfacts_calls()), 6)
        self.assertEqual(outcome["manifest"]["run"]["facts_source"], "per_company_api")

    def test_the_bulk_path_asks_for_no_companyfacts_at_all(self):
        outcome = self.pipe.ingest_universe(self.entries, bulk=True,
                                            bulk_archive=str(self.archive))
        self.assertEqual(len(outcome["results"]), 6)
        self.assertEqual(self._companyfacts_calls(), [],
                         "der Sammelweg darf keine Einzelabfrage stellen")
        self.assertEqual(outcome["manifest"]["run"]["facts_source"], "bulk_companyfacts_zip")
        self.assertEqual(outcome["manifest"]["run"]["bulk"]["found_in_archive"], 6)

    def test_the_bulk_path_stores_the_same_companies(self):
        self.pipe.ingest_universe(self.entries, bulk=True, bulk_archive=str(self.archive))
        stored = self.fact_store.list_companies()
        self.assertEqual(len(stored), 6)
        for cik, *_ in self.companies:
            self.assertIn(normalize_cik(cik), stored)

    def test_bulk_and_single_produce_the_same_factbook(self):
        """Der Sammelweg darf eine Abkuerzung im Transport sein, nicht im Ergebnis."""
        self.pipe.ingest_universe(self.entries[:2])
        einzeln = {cik: self.fact_store.read_company(cik)["factbook"]
                   for cik in self.fact_store.list_companies()}

        root = Path(self.tmp.name) / "zweit"
        zweite = IngestionPipeline(
            provider=SECProvider(client=StubSEC(self.companies)), registry=self.registry,
            raw_store=JsonRawStore(root / "raw"),
            fact_store=JsonFactStore(root / "facts", compress=True),
            checkpoint=CheckpointStore(root / "state", run_id="bulk2"))
        zweite.ingest_universe(self.entries[:2], bulk=True, bulk_archive=str(self.archive))
        gebuendelt = {cik: zweite.fact_store.read_company(cik)["factbook"]
                      for cik in zweite.fact_store.list_companies()}

        self.assertEqual(sorted(einzeln), sorted(gebuendelt))
        for cik in einzeln:
            self.assertEqual(_ohne_abrufzeit(einzeln[cik]), _ohne_abrufzeit(gebuendelt[cik]))

    def test_an_issuer_missing_from_the_archive_is_fetched_singly(self):
        """Eine Luecke im Archiv fuehrt zur Einzelabfrage, nicht zu einem leeren Factbook.

        Das Sammelarchiv wird taeglich gebaut; ein frisch eingereichter
        Emittent kann fehlen. Ihn dann mit leeren Fakten zu speichern
        waere die schlimmste der moeglichen Antworten - schlimmer als ein
        Fehler, weil niemand sie bemerkt.
        """
        zusatz, _ = make_company(4100000099, "LATE", "LATE FILER", "3674", "1231")
        companies = self.companies + [zusatz]
        stub = StubSEC(companies)
        root = Path(self.tmp.name) / "spaet"
        pipe = IngestionPipeline(
            provider=SECProvider(client=stub), registry=self.registry,
            raw_store=JsonRawStore(root / "raw"),
            fact_store=JsonFactStore(root / "facts", compress=True),
            checkpoint=CheckpointStore(root / "state", run_id="spaet"))

        entries = [{"cik": c[0]} for c in companies]
        outcome = pipe.ingest_universe(entries, bulk=True, bulk_archive=str(self.archive))

        statuses = {result["cik"]: result["status"] for result in outcome["results"]}
        self.assertEqual(statuses[normalize_cik(4100000099)], STATUS_INGESTED)
        # Genau EINE Einzelabfrage: die fuer den fehlenden Emittenten.
        einzeln = [url for url in stub.calls if "companyfacts" in url]
        self.assertEqual(len(einzeln), 1)
        self.assertIn(normalize_cik(4100000099), einzeln[0])
        self.assertEqual(outcome["manifest"]["run"]["bulk"]["requested"], 7)
        self.assertEqual(outcome["manifest"]["run"]["bulk"]["found_in_archive"], 6)
        # Und der Factbook ist nicht leer.
        stored = pipe.fact_store.read_company(normalize_cik(4100000099))
        self.assertTrue(stored["factbook"])

    def test_only_the_requested_issuers_are_read_from_the_archive(self):
        pairs = list(self.provider.iter_bulk_company_facts(
            ciks=[self.companies[0][0]], archive_path=str(self.archive)))
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0][0], normalize_cik(self.companies[0][0]))
        self.assertEqual(pairs[0][1]["_source"], "bulk_companyfacts_zip")

    def test_non_company_entries_in_the_archive_are_ignored(self):
        pairs = list(self.provider.iter_bulk_company_facts(archive_path=str(self.archive)))
        names = {cik for cik, _ in pairs}
        self.assertEqual(len(pairs), 7, "sechs Emittenten plus der ungewollte siebte")
        self.assertNotIn("README", "".join(names))

    def test_resume_still_works_on_the_bulk_path(self):
        self.pipe.ingest_universe(self.entries, bulk=True, bulk_archive=str(self.archive),
                                  limit=3)
        self.assertEqual(len(self.checkpoint.load()["completed"]), 3)
        self.pipe.ingest_universe(self.entries, bulk=True, bulk_archive=str(self.archive))
        self.assertEqual(len(self.checkpoint.load()["completed"]), 6)


if __name__ == "__main__":
    unittest.main()
